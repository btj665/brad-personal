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

## Deploy (Cloudflare Pages)

1. **dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick `btj665/brad-personal`.
2. Name the project something like `baldyshilltop` (keep it separate from the
   games app project).
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `site`
4. **Save and Deploy.**
5. Project → **Custom domains** → add `baldyshilltop.com` and
   `www.baldyshilltop.com`. If the domain's DNS is on Cloudflare, this is one
   click, and HTTPS is provisioned automatically.

`404.html` is served automatically for unknown paths.

## Email addresses used on the site

The site lists `hello@`, `support@` and `privacy@baldyshilltop.com`. Make sure
all three are delivered somewhere. The easiest way is **Cloudflare Email
Routing** (domain → Email → Email Routing) with a catch-all rule that forwards
to your real inbox. Or replace them with a single address you already have.

## Apple Developer Program checklist

- [ ] Site is live over HTTPS at `https://baldyshilltop.com`
- [ ] Your Apple Account / enrollment email uses the `@baldyshilltop.com` domain
- [ ] The legal entity name on the site ("Baldy's Hilltop, LLC") exactly matches
      your D-U-N-S record and state filing
- [ ] Contact email addresses on the site actually receive mail
- [ ] Review the Privacy Policy and Terms before shipping each app, and update
      them if an app collects data beyond what they describe
