import {createBrowserClient} from '@supabase/ssr';

/**
 * Browser Supabase client for Client Components (OAuth sign-in, realtime).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
