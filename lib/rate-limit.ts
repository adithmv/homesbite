import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
let localWindow = { start: 0, count: 0 };
export function requestBucket(request: Request, secret: string) {
  // Only trust the hosting platform's overwritten header. Other hosts share a bucket
  // until a trusted proxy integration is explicitly implemented.
  const ip =
    process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.trim() : undefined;
  return createHmac('sha256', secret)
    .update(`location:${ip && isIP(ip) ? ip : 'shared'}`)
    .digest('hex');
}
export async function limitLocationRequest(request: Request): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const limited = () =>
    Response.json(
      { error: 'Too many location lookups. Wait a minute, or select a map pin.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
    );
  if (!url && process.env.NODE_ENV !== 'production') {
    if (Date.now() - localWindow.start >= 60000) localWindow = { start: Date.now(), count: 0 };
    return ++localWindow.count > 30 ? limited() : null;
  }
  try {
    if (!url || !secret) throw new Error('Missing limiter configuration');
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/consume_location_quota`, {
      method: 'POST',
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucket: requestBucket(request, secret) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('Limiter unavailable');
    const allowed = await response.json();
    if (allowed === false) return limited();
    if (allowed !== true) throw new Error('Invalid limiter response');
    return null;
  } catch {
    return Response.json(
      {
        error:
          'Place search is temporarily unavailable. You can still select a map pin or use device location.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
    );
  }
}
