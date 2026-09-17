import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/security-headers';
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'production',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  if (request.nextUrl.protocol === 'https:')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
