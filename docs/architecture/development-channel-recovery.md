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
