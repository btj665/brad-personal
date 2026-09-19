// The one connection to the backend.
//
// The whole app is otherwise a static, client-only site, and it stays that way
// when no backend is configured: if the two Vite env vars aren't set, `supabase`
// is null and everything upstream falls back to a local guest wallet with no
// login gate. That keeps `npm run dev` and the shareable zip working with nothing
// to set up. Set the two vars (see SETUP.md) and the same build turns into the
// published, gated, cloud-saved version — no code change.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** True when a backend is wired up. When false the app runs in guest mode. */
export const backendConfigured = Boolean(url && anonKey)

/** The client, or null in guest mode. The anon key is meant to be public — every
 *  table is guarded by row-level security in the database, so the key alone grants
 *  nothing a signed-out visitor shouldn't have. The service-role key is never
 *  shipped to the browser; admin reads go through security-definer functions. */
export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

/** Narrows the nullable client at a call site that has already checked it. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('backend not configured')
  return supabase
}
