# Deploying The Tables to Cloudflare Pages

The app is a static Vite build (`npm run build` → `dist/`), which is the simple
case for Cloudflare Pages. This takes about 5 minutes.

See `SETUP.md` for the backend (Supabase) half. You can deploy **without** it —
the site then runs in guest mode (no login, a play-money balance kept in the
browser). Add the two Supabase keys below to get the login gate, the authenticator
step, and the saved shared wallet.

> The repo pins Node 22 via `.nvmrc`, so Cloudflare builds with a recent enough
> Node automatically — you don't need to set `NODE_VERSION` yourself.

---

## Path A — Connect your GitHub repo (recommended)

Cloudflare rebuilds and redeploys on every push to the chosen branch.

1. **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
2. **Connect GitHub**, authorize Cloudflare, and pick **`btj665/brad-personal`**.
   It's a private repo — that's fine. If it isn't listed, click
   *Add account / configure repos* and grant access to it.
3. **Set up builds and deployments:**
   - **Production branch:** `claude/casino-video-power-auto-hold-vmt6bw`
     (or merge to `main` first and use that).
   - **Framework preset:** `Vite` (or "None").
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Expand **Environment variables (advanced)**. For **full mode**, add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon (publishable) key |

   Skip both for guest mode. **These are read at build time** (Vite inlines them
   into the bundle), so they must be set here *before* the build — adding them
   later does nothing until you redeploy.
5. **Save and Deploy.** First build is ~1–2 min; you get a
   `https://<project>.pages.dev` URL.
6. Open the URL **on your phone**. In full mode, **sign up first** — the first
   account becomes the admin.

Every later `git push` to that branch deploys automatically.

---

## Path B — Direct upload with Wrangler (no Git connection)

```bash
# 1. Build with your keys (omit the two exports for guest mode)
export VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export VITE_SUPABASE_ANON_KEY="your-anon-key"
npm run build

# 2. Log in to Cloudflare and upload the built folder
npx wrangler login                 # opens a browser to authorize
npx wrangler pages deploy dist --project-name the-tables
```

It prints your `*.pages.dev` URL. Redeploy by re-running both steps. With this
path the keys come from your shell at build time, so there's nothing to set in the
Cloudflare dashboard.

---

## After it's live

- **Custom domain:** Pages project → **Custom domains** → add yours. Cloudflare
  provisions HTTPS.
- **Changed the Supabase keys, or turning on full mode later?** Update the env
  vars in the Pages project → **Settings**, then **Retry deployment** (or push a
  commit) — they only take effect at build time.
- **No routing config needed.** The app is a single page (tab switching is
  client-side state), so there are no deep-link 404s and no `_redirects` file to
  add.
- **Build fails on an old Node?** `.nvmrc` pins Node 22; if you removed it, set a
  `NODE_VERSION` = `22` build environment variable instead.
