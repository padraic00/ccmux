import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import {
  ClaudeChannelLaunchSchema,
  claudeChannelFlags,
} from '../src/agent/claude/channelLaunch.ts';
import { createControlSession } from '../src/control/lifecycle.ts';
import type { CreateManagedInput } from '../src/session/create.ts';
import { writeSessionsUnlocked } from '../src/session/registry.ts';
import { makeMachine, makeSession } from './helpers.ts';

const channel = {
  mcpConfig: '/config/mcp.json',
  servers: ['local'],
  promptFile: '/config/coordinator.md',
};
test('typed channel launch permits only manual permissions and channel reply tools', () => {
  const flags = claudeChannelFlags(ClaudeChannelLaunchSchema.parse(channel));
  expect(flags).toContain('manual');
  expect(flags).toContain('server:local');
  expect(flags).toContain('mcp__local__reply');
  expect(
    ClaudeChannelLaunchSchema.safeParse({ ...channel, servers: ['local', 'local'] }).success,
  ).toBe(false);
  expect(
    ClaudeChannelLaunchSchema.safeParse({ ...channel, servers: ['local --anything'] }).success,
  ).toBe(false);
  expect(
    ClaudeChannelLaunchSchema.safeParse({ ...channel, permissionMode: 'bypassPermissions' })
      .success,
  ).toBe(false);
});
test('channel create is idempotent and changes cannot reuse a create request', async () => {
  const stateDir = mkdtempSync('/tmp/ccmux-channel-create-');
  const workspace = mkdtempSync('/tmp/ccmux-channel-workspace-');
  const m = makeMachine({ stateDir });
  const input = {
    runtime: 'claude' as const,
    mode: 'tui' as const,
    requestId: crypto.randomUUID(),
    name: 'agent-a',
    workspace,
    flags: [],
    claudeChannel: channel,
  };
  let calls = 0;
  const create = async (_m: typeof m, value: CreateManagedInput) => {
    calls++;
    expect(value.flags).toEqual(claudeChannelFlags(channel));
    const s = makeSession({
      name: value.name,
      dir: value.dir,
      uuid: crypto.randomUUID(),
      agent: 'claude',
      runtime: 'tui',
      flags: value.flags,
      registrationGeneration: value.registrationGeneration,
    });
    await writeSessionsUnlocked(m, [s]);
    return s;
  };
  const first = await createControlSession(m, input, new AbortController().signal, create);
  const second = await createControlSession(m, input, new AbortController().signal, create);
  expect(first.target).toEqual(second.target);
  expect(calls).toBe(1);
  await expect(
    createControlSession(
      m,
      { ...input, claudeChannel: { ...channel, servers: ['other'] } },
      new AbortController().signal,
      create,
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(
    createControlSession(
      m,
      { ...input, flags: ['--anything'] },
      new AbortController().signal,
      create,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(
    createControlSession(m, { ...input, mode: 'native' }, new AbortController().signal, create),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED' });
});
