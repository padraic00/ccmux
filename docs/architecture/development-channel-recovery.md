# Development channel recovery

Interactive Claude sessions can authorize their local development channels for automatic startup
confirmation. This is an operator decision per conversation, never a machine-wide default.

```
ccmux channel-consent agent-A approve
ccmux channel-consent agent-A status
ccmux restart agent-A
ccmux channel-consent agent-A revoke
```

Approval requires explicit `--mcp-config` and `--dangerously-load-development-channels` flags.
Only `server:` entries backed by an absolute local executable and argument array are supported.
The owner-only consent file binds conversation UUID, directory, session flags, declared env-file
path, MCP config bytes, executable bytes and existing absolute argument-file bytes. Changing
those inputs requires approval again. Imported modules and transitive dependencies are not
fingerprinted; this authorization assumes the operator controls the local server installation.

The terminal parser exposes a `development-channels` menu to monitoring and the guarded terminal
control API. Startup settling only answers a complete known dialog listing exactly the approved
channels. It rechecks the captured pane before submitting and uses the existing one-answer settling
rule. Terminal capture and input are not an atomic provider operation. Unsupported or changed
menus remain blocked for manual review.

Confirmation is not channel readiness. Integrators must check the channel health endpoint and an
acknowledgment/reply probe before advertising that a coordinator can accept requests. Revocation
stops future automatic confirmations; it does not disconnect a channel already running. Stop or
restart the session when immediate disconnection is required.

## Typed control-plane creation

`session.create` accepts `claudeChannel` only for interactive Claude sessions:

```
{
  "runtime": "claude",
  "mode": "tui",
  "claudeChannel": {
    "mcpConfig": "/absolute/path/to/mcp.json",
    "servers": ["local"],
    "promptFile": "/absolute/path/to/coordinator.md"
  }
}
```

The caller also supplies the normal request ID, session name and workspace. This field derives the
channel startup arguments and preallowed acknowledge/reply tools. It does
not authorize startup confirmation: `channel-consent approve` remains an explicit owner action.

The derived arguments carry no permission mode. A channel session runs in its per-session override
or the machine default (normally `auto`), like any other session. Earlier sessions stored
`--permission-mode manual` among their flags, and that copy overrode both. The launcher now drops
any stored `--permission-mode` (pair or `=` form), so the resolved mode is the only one on the argv.
`ccmux mode <name> <mode|default>` removes a stored copy from the session's flags and says so.
Consent hashes those flags, so when such a session had consent, `mode` prints the
`ccmux channel-consent <name> approve` step to run before restart. Consent is never re-approved
automatically.
Raw caller flags are still refused for Claude. Native SDK mode and other providers refuse this
field. Derived arguments participate in the create fingerprint, so a changed configuration cannot
silently reuse an earlier create request.
