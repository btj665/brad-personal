# RustDesk relay (optional) — the simplest family experience

This is an **optional alternative/adjunct** to MeshCentral. RustDesk feels like AnyDesk/
TeamViewer: the person you're helping just opens the RustDesk app, and it's about as friendly
as it gets for non-technical family. You self-host the two server components (`hbbs` +
`hbbr`) so nothing depends on a third-party cloud.

## Read this first: it does NOT ride the Cloudflare Tunnel

Unlike MeshCentral, **RustDesk's native clients speak raw TCP/UDP** on ports 21115–21117.
Cloudflare's **free** Tunnel only carries HTTP/S, so it **cannot** proxy RustDesk's protocol.
Practically, to reach this relay from anywhere you have two honest options:

1. **Run it on a host with a public IP** — a cheap VPS ($4–6/mo) is the standard RustDesk
   self-host pattern. Open the ports below in its firewall.
2. **Forward the ports on your home router** to the machine running this stack. Works, but it
   *does* open inbound ports — the one thing the MeshCentral setup avoids. Your call on the
   tradeoff.

> The web client's websocket ports (21118/21119) *can* optionally be published through the
> Cloudflare Tunnel, but the desktop/mobile apps your family will actually use cannot. If
> "no open ports at all" matters most to you, prefer MeshCentral and skip RustDesk.

### Ports to expose (VPS firewall or router forward)

| Port | Proto | Component | Purpose |
| --- | --- | --- | --- |
| 21115 | tcp | hbbs | NAT type test |
| 21116 | tcp + udp | hbbs | ID registration / hole punching |
| 21117 | tcp | hbbr | relay |
| 21118 | tcp | hbbs | web client (optional) |
| 21119 | tcp | hbbr | web client relay (optional) |

## Setup

1. Set the relay address: in `docker-compose.yml`, replace `REPLACE_WITH_PUBLIC_HOST` with the
   public IP or hostname clients will reach (your VPS/home public address).
2. Start it:
   ```
   docker compose -f docker-compose.yml up -d
   ```
3. Grab the public key `hbbs` generated (clients need it to trust your server):
   ```
   cat data/id_ed25519.pub
   ```
4. Configure each client (yours + family) in RustDesk -> Settings -> Network -> ID/Relay
   Server:
   - **ID Server**: `your-public-host:21116`
   - **Relay Server**: `your-public-host:21117`
   - **Key**: the string from step 3
   You can hand family a pre-configured client so they don't touch settings — see RustDesk's
   docs on baking the config into the installer.
5. On the family machine, set a **permanent password** in RustDesk for unattended access.

## Resolution note

RustDesk mirrors the console like MeshCentral does, so the same rule from
[`../docs/resolution.md`](../docs/resolution.md) applies: for a headless lab box, add a virtual
display (dummy plug or `IddSampleDriver`) so you can pick arbitrary resolutions. RustDesk can
then change the remote resolution from its toolbar when a display is present.

## Which should I use?

- **Family who just want help, easiest UX** → RustDesk (accepting the port-forward/VPS need).
- **One console to manage everything, no open ports, RDP-style resolution on lab boxes** →
  MeshCentral (the main stack).
- Running both is fine — they don't conflict.
