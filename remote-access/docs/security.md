# Security notes

You're exposing admin access to family machines over the internet, so treat this seriously.
None of it is hard, but do all of it.

## Non-negotiables

- **2FA on every account.** `config.json` sets `passwordRequirements.force2factor: true`, so
  each user is prompted to enroll an authenticator on first login. Do not disable it.
- **Lock down registration.** `newAccounts` is `true` only so you can create the first
  account (which auto-becomes site admin). The moment you've done that, set
  `newAccounts: false` in `meshcentral/config.json` and `docker compose restart meshcentral`.
  Otherwise anyone who finds the URL can register.
- **Strong, unique password** for the admin account (12+ chars enforced). Use a password
  manager.
- **Never expose raw RDP/VNC to the internet.** No port-forwarding 3389/5900. All remote
  desktop traffic rides the tunnel + agent, or a Cloudflare Access-protected `cloudflared`
  RDP hostname — never a bare open port.
- **Keep it patched.** `docker compose pull && docker compose up -d` periodically to update
  both MeshCentral and cloudflared. Keep the OS + MeshCentral agents updated too.

## Built-in brute-force protection

`maxInvalidLogin` in `config.json` locks out an IP after repeated bad logins. Tune if needed.

## Optional hardening: Cloudflare Access in front of the console

You can add a Cloudflare **Access** policy so only *your* identity (email one-time-PIN, or an
IdP) can even reach the MeshCentral login page — a strong second gate before MeshCentral's own
auth.

Important caveat: MeshCentral **agents are not browsers** and cannot pass an Access login, so a
blanket Access policy on the hostname will break agent connectivity. If you add Access, you
must **bypass** the agent paths (or use a service token). At minimum bypass these paths for the
agent traffic:

- `/agent.ashx`
- `/meshrelay.ashx`
- `/meshagents` (agent installer downloads)
- `/mescript.ashx`

If that's more fiddliness than you want, it's reasonable to skip Access and rely on
MeshCentral's own 2FA + login throttling, which is already solid for personal use.

## Backups

The `meshcentral/data/` and `meshcentral/backups/` dirs hold your database and certs (they're
gitignored). Back them up somewhere off the host — losing the cert means re-deploying agents.
MeshCentral writes periodic backups into `meshcentral/backups/` automatically.
