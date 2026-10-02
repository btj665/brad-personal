/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Supabase project URL. Public. Unset in guest mode. */
  readonly VITE_SUPABASE_URL?: string
  /** The Supabase anon (publishable) key. Public — row-level security guards the
   *  data, not this key. Unset in guest mode. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
