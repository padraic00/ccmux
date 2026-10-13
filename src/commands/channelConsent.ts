import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { channelRecipe, consentPath } from '../agent/claude/channelConsent.ts';
import { loadMachineConfig } from '../config/machine.ts';
import { findSession, loadSessions } from '../session/registry.ts';
import { atomicWrite } from '../util/atomic.ts';

export async function cmdChannelConsent(args: string[]): Promise<number> {
  const [name, action] = args;
  if (args.length !== 2 || !name || !['approve', 'revoke', 'status'].includes(action ?? '')) {
    console.error('usage: ccmux channel-consent <name> <approve|revoke|status>');
    return 1;
  }
  const s = findSession(loadSessions(loadMachineConfig()), name);
  if (!s) {
    console.error('Session not found');
    return 1;
  }
  try {
    if (action === 'revoke') {
      try {
        unlinkSync(consentPath(s));
      } catch (e) {
        if ((e as { code?: string }).code !== 'ENOENT') throw e;
      }
      console.log('Development-channel authorization revoked');
      return 0;
    }
    const recipe = channelRecipe(s);
    if (action === 'status') {
      const stored = existsSync(consentPath(s))
        ? JSON.parse(readFileSync(consentPath(s), 'utf8'))
        : null;
      console.log(
        JSON.stringify({
          channels: recipe.channels,
          authorized: stored?.uuid === s.uuid && stored?.digest === recipe.digest,
        }),
      );
      return 0;
    }
    mkdirSync(dirname(consentPath(s)), { recursive: true, mode: 0o700 });
    await atomicWrite(
      consentPath(s),
      `${JSON.stringify({ uuid: s.uuid, ...recipe, approvedAt: new Date().toISOString() })}\n`,
    );
    console.log(
      `Authorized ${recipe.channels.join(', ')} for this session and exact launch inputs`,
    );
    return 0;
  } catch (e) {
    console.error(String(e));
    return 1;
  }
}
