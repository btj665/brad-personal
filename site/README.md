# baldyshilltop.com

The public website for **Baldy's Hilltop, LLC**: plain static HTML and CSS, with
no build step and no dependencies. It's separate from the games app at the repo
root.

| Page | Path | Used for |
|---|---|---|
| Home | `/` | Company identity (Apple developer enrollment) |
| Support | `/support.html` | App Store Connect **Support URL** |
| Privacy Policy | `/privacy.html` | App Store Connect **Privacy Policy URL** |
| Terms of Use | `/terms.html` | Optional EULA / terms link |

## Preview locally

```bash
cd site && python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy (Cloudflare Workers)

`site/wrangler.jsonc` makes this folder a static-assets Worker named
`baldyshilltop`. `.assetsignore` keeps the README and config from being served.

1. **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Import a
   repository** → pick `btj665/brad-personal`.
2. On **Set up your application**:
   - **Project name:** `baldyshilltop`
   - **Build command:** *(leave empty)*
   - **Deploy command:** `npx wrangler deploy` (the default)
   - **Advanced settings → Path:** `site`
3. **Deploy.** You get a `https://baldyshilltop.<you>.workers.dev` URL.
4. Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**
   → `baldyshilltop.com`, then again for `www.baldyshilltop.com`.

Every push to `main` that touches `site/` redeploys it.

## Email address used on the site

Every contact link (home, support, privacy and terms) points to
`bjohnson@baldyshilltop.com`. To change it, find and replace it in the `.html`
files.

## Apple Developer Program checklist

- [ ] Site is live over HTTPS at `https://baldyshilltop.com`
- [ ] Your Apple Account / enrollment email uses the `@baldyshilltop.com` domain
- [ ] The legal entity name on the site ("Baldy's Hilltop, LLC") exactly matches
      your D-U-N-S record and state filing
- [ ] `bjohnson@baldyshilltop.com` receives mail
- [ ] Review the Privacy Policy and Terms before shipping each app, and update
      them if an app collects data beyond what they describe
