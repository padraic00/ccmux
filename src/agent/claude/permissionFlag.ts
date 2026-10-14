/**
 * The flags without any `--permission-mode` setting, in both spellings: the pair
 * `--permission-mode <mode>` and the joined `--permission-mode=<mode>`.
 *
 * The launcher passes the resolved mode itself (per-session override, else machine default, after the
 * root guard). A second copy among the stored flags comes later on the argv and wins, which once
 * pinned every channel session to `manual` while `ccmux mode` reported a different mode. So the mode
 * has one owner, and a stored copy is dropped rather than obeyed. A bare flag with no value after it
 * is dropped alone; the element after it is kept when it is itself a flag.
 */
export function withoutPermissionModeFlag(flags: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i] as string;
    if (flag.startsWith('--permission-mode=')) continue;
    if (flag === '--permission-mode') {
      const next = flags[i + 1];
      if (next !== undefined && !next.startsWith('-')) i++;
      continue;
    }
    out.push(flag);
  }
  return out;
}
