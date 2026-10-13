import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  channelRecipe,
  consentPath,
  developmentChannelAnswer,
} from '../src/agent/claude/channelConsent.ts';
import { terminalMenu } from '../src/agent/claude/prompts.ts';
import { SessionSchema } from '../src/session/schema.ts';

const dialog = `WARNING: Loading development channels
 Channels: server:local
 ❯ 1. I am using this for local development
   2. Exit
 Enter to confirm · Esc to cancel`;

test('channel recovery requires exact consent, complete dialog and unchanged local inputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'channel-consent-'));
  const entry = join(dir, 'server.mjs');
  const config = join(dir, 'mcp.json');
  writeFileSync(entry, 'export {};');
  writeFileSync(
    config,
    JSON.stringify({ mcpServers: { local: { command: process.execPath, args: [entry] } } }),
  );
  const s = SessionSchema.parse({
    name: 'agent-A',
    dir,
    uuid: crypto.randomUUID(),
    agent: 'claude',
    flags: ['--mcp-config', config, '--dangerously-load-development-channels', 'server:local'],
  });
  try {
    expect(terminalMenu(dialog)?.kind).toBe('development-channels');
    expect(terminalMenu(dialog)?.options).toHaveLength(2);
    expect(developmentChannelAnswer(dialog, s)).toBeNull();
    mkdirSync(dirname(consentPath(s)), { recursive: true });
    writeFileSync(consentPath(s), JSON.stringify({ uuid: s.uuid, ...channelRecipe(s) }));
    expect(developmentChannelAnswer(dialog, s)).toBe('1');
    expect(
      developmentChannelAnswer(
        dialog.replace(
          'WARNING: Loading development channels',
          'WARNING:.Loading/development channels',
        ),
        s,
      ),
    ).toBe('1');
    expect(developmentChannelAnswer(dialog.replace('server:local', 'server:other'), s)).toBeNull();
    expect(developmentChannelAnswer(dialog.replace('   2. Exit', ''), s)).toBeNull();
    expect(developmentChannelAnswer(dialog, { ...s, uuid: crypto.randomUUID() })).toBeNull();
    expect(
      developmentChannelAnswer(dialog, { ...s, flags: [...s.flags, '--model', 'other'] }),
    ).toBeNull();
    writeFileSync(entry, 'export const changed = true;');
    expect(developmentChannelAnswer(dialog, s)).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(consentPath(s), { force: true });
  }
});
