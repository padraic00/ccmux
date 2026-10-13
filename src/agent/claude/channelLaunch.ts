import { z } from 'zod';

/** Local channel configuration is typed; caller-supplied Claude argv remains refused. */
export const ClaudeChannelLaunchSchema = z
  .object({
    mcpConfig: z.string().startsWith('/').max(4096),
    servers: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z0-9_-]+$/)
          .max(64),
      )
      .min(1)
      .max(8)
      .refine((values) => new Set(values).size === values.length, 'Duplicate channel servers'),
    promptFile: z.string().startsWith('/').max(4096).optional(),
  })
  .strict();

export function claudeChannelFlags(value: z.infer<typeof ClaudeChannelLaunchSchema>): string[] {
  return [
    '--permission-mode',
    'manual',
    ...(value.promptFile ? ['--append-system-prompt-file', value.promptFile] : []),
    '--mcp-config',
    value.mcpConfig,
    '--dangerously-load-development-channels',
    ...value.servers.map((name) => `server:${name}`),
    '--allowedTools',
    ...value.servers.flatMap((name) => [`mcp__${name}__acknowledge`, `mcp__${name}__reply`]),
  ];
}
