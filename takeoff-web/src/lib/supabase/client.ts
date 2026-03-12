import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured() {
  return SUPABASE_URL !== '' && SUPABASE_URL !== 'your-supabase-url' && SUPABASE_ANON_KEY !== '';
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    // Return a mock client that won't crash in dev/preview mode
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
        signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
        signInWithOAuth: async () => ({ data: { url: null, provider: null }, error: { message: 'Supabase not configured' } }),
        resetPasswordForEmail: async () => ({ data: {}, error: { message: 'Supabase not configured' } }),
      },
      from: () => ({
        select: () => ({ data: [], error: null, order: () => ({ data: [], error: null }) }),
        insert: () => ({ data: null, error: null }),
        update: () => ({ data: null, error: null }),
        delete: () => ({ data: null, error: null }),
      }),
    } as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
