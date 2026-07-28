# Remote access hub — MeshCentral + Cloudflare Tunnel

A self-hosted, ScreenConnect-style remote access setup for **personal use** across a home lab /
cluster plus family machines (wife's & mom's). Connect from anywhere, **no VPN, no open inbound
ports**, log in as admin, manage many machines from one web console — and control the remote
screen resolution the way you'd expect from RDP.

## What this gives you

- **[MeshCentral](https://meshcentral.com/)** — one self-hosted web console to manage every
  machine. Small agent installed once per machine; unattended admin access; remote desktop,
  file transfer and terminal. This is the ScreenConnect/TeamViewer replacement.
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)**
  — reach the console from anywhere over HTTPS with no VPN and nothing port-forwarded. The
  `cloudflared` container dials out; your home IP and ports stay closed.
- **Flexible resolution** — RDP-style dynamic resolution for lab boxes, real-screen mirroring
  for helping family. See [`docs/resolution.md`](docs/resolution.md) — this is the part that
  answers "adjust resolution instead of it being locked to the machine."

## Layout

```
remote-access/
├── docker-compose.yml          # MeshCentral + cloudflared
├── .env.example                # -> copy to .env, add your tunnel token
├── meshcentral/config.json     # MeshCentral config (set your domain + lock down after setup)
├── cloudflared/                # Tunnel setup (token method + config.yml alternative)
└── docs/
    ├── resolution.md           # HOW to control screen resolution (read this)
    ├── security.md             # 2FA, lockdown, do-not-expose-RDP, hardening
    └── family-machines.md      # Unattended access + console mirroring for family
```

## Quick start

Prerequisites: a Linux host to run this on (any always-on box / VM / mini PC), Docker +
Docker Compose, and a domain on Cloudflare (free plan is fine).

1. **Get the files onto your host** and `cd remote-access`.
2. **Create the Cloudflare Tunnel** and grab its token — follow
   [`cloudflared/README.md`](cloudflared/README.md). Add a public hostname of type `HTTPS`
   pointing at `meshcentral:4430` with **No TLS Verify** on.
3. **Configure secrets:**
   ```
   cp .env.example .env          # then paste your CLOUDFLARE_TUNNEL_TOKEN
   ```
4. **Set your domain** in `meshcentral/config.json`: replace `REPLACE_WITH_YOUR_DOMAIN` with
   the same public hostname you used in step 2 (e.g. `mesh.example.com`).
5. **Start it:**
   ```
   docker compose up -d
   docker compose logs -f meshcentral   # watch it come up
   ```
6. **Create your admin account:** browse to `https://mesh.example.com`, register (the first
   account automatically becomes site admin), and enroll 2FA when prompted.
7. **Lock down registration:** set `"newAccounts": false` in `meshcentral/config.json`, then
   `docker compose restart meshcentral`. (Details in [`docs/security.md`](docs/security.md).)
8. **Add machines:** create device groups and install the agent per machine —
   see [`docs/family-machines.md`](docs/family-machines.md) for the family workflow and
   [`docs/resolution.md`](docs/resolution.md) for lab machines + resolution control.

## Notes

- `.env`, `meshcentral/data/`, and tunnel credentials are gitignored — no secrets in the repo.
- Update everything with `docker compose pull && docker compose up -d`.
- This is designed for **personal use** across your own household and lab.
