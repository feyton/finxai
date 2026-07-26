import {createClient as createBareClient, type SupabaseClient} from '@supabase/supabase-js';
import {createClient as createServerClient} from './supabase/server';

/**
 * Resolves the calling user from either a mobile Bearer token or the web
 * session cookie, returning a Supabase client authenticated AS that user —
 * so a subsequent `supabase.from(...)` call sees the right `auth.uid()` for
 * RLS (e.g. inserting into ai_usage_logs, which is owner-scoped).
 */
export async function authedUser(
  request: Request,
): Promise<{user: {id: string; email?: string} | null; supabase: SupabaseClient}> {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    const bare = createBareClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {persistSession: false, autoRefreshToken: false},
        global: {headers: {Authorization: `Bearer ${token}`}},
      },
    );
    const {data} = await bare.auth.getUser(token);
    if (data.user) {
      return {user: data.user, supabase: bare};
    }
  }
  const supabase = await createServerClient();
  const {data} = await supabase.auth.getUser();
  return {user: data.user, supabase};
}
