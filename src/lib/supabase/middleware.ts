import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './env';

const PROTECTED_PREFIXES = ['/dashboard', '/onboarding'];
const AUTH_PAGES = ['/login', '/signup'];

/** Refreshes the Supabase session cookie and guards private routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isSupabaseConfigured) {
    // Without Supabase the private area can't work; send people to the setup notice.
    if (isProtected) return NextResponse.redirect(new URL('/login?setup=1', request.url));
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validates the token with Supabase Auth (don't trust getSession() on the server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(path)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return response;
}
