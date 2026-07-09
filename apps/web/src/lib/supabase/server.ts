import {createServerClient, type CookieOptions} from '@supabase/ssr';
import {cookies} from 'next/headers';

type CookieToSet = {name: string; value: string; options: CookieOptions};

/**
 * Server-side Supabase client bound to the request's cookies.
 * Use in Server Components, Route Handlers, and Server Actions.
 * Honors the same RLS (owner_id = auth.uid()) the mobile app relies on.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({name, value, options}) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
