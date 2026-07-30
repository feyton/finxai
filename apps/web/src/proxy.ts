// Renamed from middleware.ts for Next 16: the `middleware` file convention and
// named export are deprecated in favour of `proxy`, to make the network boundary
// explicit. Behaviour is unchanged.
//
// The proxy runtime is always Node.js and cannot be configured — the edge runtime
// is not supported here. That suits this app: updateSession refreshes a Supabase
// auth cookie via @supabase/ssr, which runs fine on Node and was never relying on
// edge.
import {type NextRequest} from 'next/server';
import {updateSession} from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
