import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { consentPath } from '../src/agent/claude/channelConsent.ts';
import { buildArgv, launchPermissionMode } from '../src/agent/claude/launch.ts';
import { withoutPermissionModeFlag } from '../src/agent/claude/permissionFlag.ts';
import { cmdMode } from '../src/commands/mode.ts';
import { loadMachineConfig } from '../src/config/machine.ts';
import { ListItemSchema } from '../src/inventory/listSchema.ts';
import { findSession, loadSessions, writeSessionsUnlocked } from '../src/session/registry.ts';
import { makeMachine, makeSession } from './helpers.ts';

const modesOn = (argv: string[]) =>
  argv.flatMap((f, i) =>
    f === '--permission-mode'
      ? [argv[i + 1]]
      : f.startsWith('--permission-mode=')
        ? [f.slice(18)]
        : [],
  );

test('stored mode flags drop in both spellings; other flags keep their order', () => {
  const stored = [
    '--a',
    '--permission-mode',
    'manual',
    '--b',
    'x',
    '--permission-mode=plan',
    '--c',
  ];
  expect(withoutPermissionModeFlag(stored)).toEqual(['--a', '--b', 'x', '--c']);
  // A bare flag drops alone; a following flag is not mistaken for its value.
  const bare = ['--permission-mode', '--d', '--permission-mode'];
  expect(withoutPermissionModeFlag(bare)).toEqual(['--d']);
});

test('the launch argv carries exactly one --permission-mode, the resolved one', () => {
  const m = makeMachine({
    permissionMode: 'auto',
    extraFlags: ['--permission-mode=bypassPermissions', '--z'],
  });
  const flags = ['--a', '--permission-mode', 'manual', '--permission-mode=plan', '--b'];
  const inherit = buildArgv(makeSession({ flags }), m, 'SELF', true);
  expect(modesOn(inherit)).toEqual(['auto']);
  expect(inherit.indexOf('--a')).toBeLessThan(inherit.indexOf('--b'));
  expect(inherit.indexOf('--b')).toBeLessThan(inherit.indexOf('--z'));
  const pinned = makeSession({ flags, permissionMode: 'acceptEdits' });
  expect(modesOn(buildArgv(pinned, m, 'SELF', true))).toEqual(['acceptEdits']);
});

test('list reports the launch mode after the root guard; an older peer reads as null', () => {
  const m = makeMachine({ permissionMode: 'auto' });
  const escalated = makeSession({ permissionMode: 'dontAsk' });
  expect(launchPermissionMode(makeSession(), m, false)).toBe('auto');
  expect(launchPermissionMode(escalated, m, false)).toBe('dontAsk');
  expect(launchPermissionMode(escalated, m, true)).toBe('auto');
  expect(ListItemSchema.shape.permissionMode.parse(undefined)).toBeNull();
});

let root: string;
let previousConfig: string | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ccmux-mode-flag-'));
  previousConfig = process.env.CCMUX_CONFIG;
  process.env.CCMUX_CONFIG = join(root, 'machine.json');
  mkdirSync(join(root, 'state'));
  writeFileSync(
    process.env.CCMUX_CONFIG,
    JSON.stringify({
      claudeBin: '/bin/claude',
      tmuxBin: '/bin/tmux',
      rcPrefix: 'prod',
      stateDir: join(root, 'state'),
      permissionMode: 'auto',
    }),
  );
});
afterEach(() => {
  if (previousConfig === undefined) delete process.env.CCMUX_CONFIG;
  else process.env.CCMUX_CONFIG = previousConfig;
  rmSync(root, { recursive: true, force: true });
});

async function runMode(name: string, mode: string): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const spy = spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.join(' '));
  });
  try {
    return { code: await cmdMode(name, mode), out: lines.join('\n') };
  } finally {
    spy.mockRestore();
  }
}

test('ccmux mode removes stored mode flags and keeps other flags in order', async () => {
  const m = loadMachineConfig();
  const flags = ['--a', '--permission-mode', 'manual', '--b', 'v', '--permission-mode=plan'];
  const s = makeSession({ name: 'agent-a', uuid: crypto.randomUUID(), flags });
  await writeSessionsUnlocked(m, [s]);
  const { code, out } = await runMode('agent-a', 'default');
  expect(code).toBe(0);
  const after = findSession(loadSessions(m), 'agent-a');
  expect(after?.flags).toEqual(['--a', '--b', 'v']);
  expect(after?.permissionMode).toBeUndefined();
  expect(out).toContain('removed stored flag: --permission-mode manual --permission-mode=plan');
  expect(out).not.toContain('channel-consent');
});

test('ccmux mode names consent re-approval after stripping a consented session', async () => {
  const m = loadMachineConfig();
  const s = makeSession({
    name: 'agent-b',
    uuid: crypto.randomUUID(),
    flags: ['--permission-mode', 'manual', '--mcp-config', '/config/mcp.json'],
  });
  await writeSessionsUnlocked(m, [s]);
  mkdirSync(dirname(consentPath(s)), { recursive: true });
  writeFileSync(consentPath(s), '{}');
  try {
    const { code, out } = await runMode('agent-b', 'auto');
    expect(code).toBe(0);
    const after = findSession(loadSessions(m), 'agent-b');
    expect(after?.permissionMode).toBe('auto');
    expect(after?.flags).toEqual(['--mcp-config', '/config/mcp.json']);
    expect(out).toContain('ccmux channel-consent agent-b approve');
  } finally {
    rmSync(consentPath(s), { force: true });
  }
});

test('ccmux mode on a session without a stored mode flag leaves its flags alone', async () => {
  const m = loadMachineConfig();
  await writeSessionsUnlocked(m, [
    makeSession({ name: 'agent-c', uuid: crypto.randomUUID(), flags: ['--a', 'b'] }),
  ]);
  const { code, out } = await runMode('agent-c', 'plan');
  expect(code).toBe(0);
  expect(findSession(loadSessions(m), 'agent-c')?.flags).toEqual(['--a', 'b']);
  expect(out).not.toContain('removed stored flag');
});
