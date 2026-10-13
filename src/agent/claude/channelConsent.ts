import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { STATE_DIR } from '../../config/paths.ts';
import type { Session } from '../../types.ts';
import { detectPrompt, paneTail, terminalMenu } from './prompts.ts';

export const consentPath = (s: Session) => join(STATE_DIR, 'channel-consent', `${s.uuid}.json`);

/** Fail closed: only explicit local server entries in one config file can be authorized. */
export function channelRecipe(s: Session) {
  if (s.agent !== 'claude' || (s.runtime && s.runtime !== 'tui'))
    throw Error('Requires Claude TUI');
  const at = s.flags.indexOf('--dangerously-load-development-channels');
  const configAt = s.flags.indexOf('--mcp-config');
  if (at < 0 || configAt < 0) throw Error('Explicit channel and MCP config flags required');
  const channels: string[] = [];
  for (const value of s.flags.slice(at + 1)) {
    if (value.startsWith('--')) break;
    channels.push(...value.split(','));
  }
  if (!channels.length || channels.some((c) => !/^server:[\w-]+$/.test(c)))
    throw Error('Only local server channels can be authorized');
  if (
    new Set(channels).size !== channels.length ||
    s.flags.filter((f) => f === '--mcp-config').length !== 1 ||
    s.flags.filter((f) => f === '--dangerously-load-development-channels').length !== 1
  )
    throw Error('Ambiguous launch flags');
  const config = s.flags[configAt + 1];
  if (!config || !isAbsolute(config)) throw Error('MCP config must be an absolute file path');
  const configText = readFileSync(config, 'utf8');
  const servers = JSON.parse(configText).mcpServers;
  const files: [string, string][] = [[config, configText]];
  for (const channel of channels) {
    const server = servers[channel.slice(7)];
    if (
      !server ||
      !isAbsolute(server.command) ||
      !Array.isArray(server.args) ||
      server.args.some((a: unknown) => typeof a !== 'string')
    )
      throw Error('Expected an absolute local command and argument array');
    files.push([server.command, readFileSync(server.command).toString('base64')]);
    for (const arg of server.args as string[]) {
      if (isAbsolute(arg) && existsSync(arg))
        files.push([arg, readFileSync(arg).toString('base64')]);
    }
  }
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        uuid: s.uuid,
        dir: s.dir,
        flags: s.flags,
        envFile: s.envFile,
        channels,
        files,
      }),
    )
    .digest('hex');
  return { channels, digest };
}

export function developmentChannelAnswer(text: string, s: Session): string | null {
  if (detectPrompt(text)?.kind !== 'development-channels') return null;
  try {
    const recipe = channelRecipe(s);
    const consent = JSON.parse(readFileSync(consentPath(s), 'utf8'));
    if (consent.digest !== recipe.digest || consent.uuid !== s.uuid) return null;
    const displayed = paneTail(text, 40).match(/^\s*Channels:\s*(.+)$/m)?.[1];
    if (
      !displayed ||
      JSON.stringify(
        displayed
          .split(',')
          .map((c) => c.trim())
          .sort(),
      ) !== JSON.stringify([...recipe.channels].sort())
    )
      return null;
    const menu = terminalMenu(text);
    if (!menu?.options.length) return null;
    return (
      paneTail(text, 40).match(/(\d+)\.\s*I am using this for local development\s*$/m)?.[1] ?? null
    );
  } catch {
    return null;
  }
}
