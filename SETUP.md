# Publishing The Tables

The app has two modes and needs **no setup to run locally**:

- **Guest mode** (default): no backend, no login. Run `npm run dev` or open the
  shareable zip and it plays, with a single play-money balance kept in the
  browser. This is what you already have.
- **Published mode**: a login gate, an authenticator (TOTP) second factor, one
  balance saved in the cloud that carries between games and visits, and an
  owner-only back office. This is what the steps below turn on.

Turning on published mode is entirely configuration — the same code powers both.
It takes about 15 minutes and the free tiers cover it.

---

## 1. Create the backend (Supabase — free)

1. Go to <https://supabase.com>, sign up, and create a **New project**. Pick a
   name and a strong database password (you won't need the password again for
   this). Choose the region closest to your players. Wait for it to finish
   provisioning (~2 minutes).
2. In the project, open **SQL Editor → New query**. Open `supabase/schema.sql`
   from this repo, paste the whole thing in, and click **Run**. It creates the
   tables, the security rules, and the functions. It's safe to re-run if you ever
   need to.
3. Turn on the authenticator factor: **Authentication → (Sign In / Providers or
   Multi-Factor) → enable TOTP / Authenticator app**. (Supabase enables TOTP by
   default on new projects; just confirm it's on.)
4. Recommended for a smooth signup: **Authentication → Providers → Email** and
   turn **Confirm email OFF**. With it off, signup goes straight to the
   authenticator step. (Leave it on if you'd rather require email confirmation
   first — the app handles both; players just log in after confirming.)
5. Get your two keys: **Project Settings → API**. Copy the **Project URL** and the
   **anon / public** key. (Never use the `service_role` key in the app — it's not
   needed and must stay secret.)

## 2. Point the app at it

Create a file named `.env.local` in the repo root (copy `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Run `npm run dev`. You should now see the **login gate** instead of the floor.

## 3. Become the admin

Sign up **first**, before anyone else. The first account created is made the
admin automatically, so the "Back office" button appears in your nav.

(If you ever need to make another account admin, or fix yours: Supabase → **SQL
Editor** →
`update public.profiles set is_admin = true where username = 'you';`)

## 4. Publish the site

The app builds to a folder of static files — host it anywhere. `npm run build`
produces `dist/`. Pick one:

### Netlify (easiest)
1. Push this repo to GitHub (already done for your branch).
2. <https://netlify.com> → **Add new site → Import from Git** → pick the repo.
3. Build command `npm run build`, publish directory `dist`.
4. **Site configuration → Environment variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the same values as your `.env.local`.
5. Deploy. You get a `https://your-site.netlify.app` URL to share.

### Cloudflare Pages
1. <https://pages.cloudflare.com> → **Create → Connect to Git** → pick the repo.
2. Framework preset **Vite**, build command `npm run build`, output `dist`.
3. **Settings → Environment variables**: add the two `VITE_SUPABASE_*` values.
4. Deploy.

### Vercel
1. <https://vercel.com> → **Add New → Project** → import the repo.
2. It detects Vite. Add the two `VITE_SUPABASE_*` **Environment Variables**.
3. Deploy.

That's it. Open the URL on your phone, sign up, scan the QR with an authenticator
app (Google Authenticator, Authy, 1Password, …), and your balance follows you
across every game and every visit.

---

## How it stays honest

- The **anon key is public by design** — it's in the browser bundle. Every table
  in the database is guarded by row-level security, so that key lets a signed-in
  player read and change **only their own** wallet, and only through the
  functions that validate the amounts. It can't touch anyone else's data.
- The **balance is server-authoritative**. The game updates a local copy for
  instant feedback and flushes batches to the database; the database is the truth,
  which is why a refresh or a new device shows the right number.
- The **back office** reads through `admin_*` functions that check `is_admin` in
  the database before returning a single row — so it's the owner's alone even if
  the page were somehow opened by someone else.
- Money **replenishes** when you're broke: hitting `$0` refills to the base stake
  (`$1,000`, set in `schema.sql` and `src/wallet/wallet.ts`) with a short cooldown.

## Changing the starting stake

The base/refill amount is `1000` in two places that must agree:
`src/wallet/wallet.ts` (`BASE_STAKE`) and `supabase/schema.sql` (the `1000`s in
`handle_new_user`, `settle_batch`'s neighbours, and `top_up`). Change both.

## Adding SMS codes later

TOTP is the second factor here. If you later want SMS text codes as an option,
Supabase supports phone MFA via a Twilio (or MessageBird) account — enable it
under **Authentication → Providers → Phone** and add the provider's credentials
in Supabase. No app change is required to offer it alongside the authenticator.
