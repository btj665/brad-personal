# Cloudflare Tunnel setup

The tunnel is what lets you reach MeshCentral **from anywhere with no VPN and no open
inbound ports**. The `cloudflared` container dials *out* to Cloudflare's edge and keeps a
persistent connection; your public hostname resolves to Cloudflare, which forwards traffic
down the tunnel to `https://meshcentral:4430` on the private docker network.

You need a domain on Cloudflare (any cheap domain works; move its nameservers to Cloudflare —
free plan is fine).

## Default: dashboard-managed tunnel (token)

This is what `docker-compose.yml` is wired for.

1. Go to **Cloudflare Zero Trust dashboard -> Networks -> Tunnels -> Create a tunnel**.
2. Choose **Cloudflared**, name it (e.g. `home-lab`), and **Save**.
3. On the install screen, copy the **token** — the long string right after `--token` in the
   shown command. Put it in `remote-access/.env` as `CLOUDFLARE_TUNNEL_TOKEN=...`.
   (You do NOT run the shown install command — the `cloudflared` container uses the token.)
4. In the tunnel's **Public Hostname** tab, add a public hostname:
   - **Subdomain/Domain**: e.g. `mesh` / `example.com` (this is your `REPLACE_WITH_YOUR_DOMAIN`).
   - **Type**: `HTTPS`
   - **URL**: `meshcentral:4430`
   - Expand **Additional application settings -> TLS** and turn on **No TLS Verify**
     (MeshCentral serves a self-signed cert internally; Cloudflare still encrypts to the edge).
5. Make sure this same hostname is set as `cert` in `meshcentral/config.json`.
6. `docker compose up -d` and browse to `https://mesh.example.com`.

WebSockets (which MeshCentral's remote desktop and agents rely on) work through Cloudflare
Tunnel automatically — no extra configuration.

## Alternative: locally-managed tunnel (config.yml + credentials)

Prefer your ingress rules in version control? Use `config.yml.example` instead:

1. Install `cloudflared` on any machine, then:
   ```
   cloudflared tunnel login
   cloudflared tunnel create home-lab
   cloudflared tunnel route dns home-lab mesh.example.com
   ```
2. `create` writes a `<TUNNEL_ID>.json` credentials file. Copy it into this `cloudflared/`
   directory (it's gitignored).
3. `cp config.yml.example config.yml` and fill in the tunnel ID and hostname.
4. In `docker-compose.yml`, change the `cloudflared` service to mount this dir and drop the
   token env:
   ```yaml
   cloudflared:
     image: cloudflare/cloudflared:latest
     container_name: cloudflared
     restart: unless-stopped
     command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
     volumes:
       - ./cloudflared:/etc/cloudflared
     depends_on:
       - meshcentral
     networks:
       - remote-access
   ```
5. `docker compose up -d`.
