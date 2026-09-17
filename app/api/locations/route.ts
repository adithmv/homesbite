import { locationQuery, parsePlaces } from '@/lib/locations';
import { limitLocationRequest } from '@/lib/rate-limit';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const denied = await limitLocationRequest(request);
  if (denied) return denied;
  let query;
  try {
    query = locationQuery(new URL(request.url).searchParams);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  try {
    const base = process.env.PHOTON_BASE_URL || 'https://photon.komoot.io/';
    const url = new URL(query.path, base.endsWith('/') ? base : `${base}/`);
    url.search = query.params.toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Provider unavailable');
    return Response.json(
      { places: parsePlaces(await response.json()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        error:
          'Place lookup is unavailable. You can still choose a pin on the map or use your current location.',
      },
      { status: 503 },
    );
  }
}
