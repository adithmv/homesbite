import { Point } from './domain';
export type Place = Point & { label: string; region: string };
export function parsePlaces(value: unknown): Place[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !('features' in value) ||
    !Array.isArray(value.features)
  )
    return [];
  return value.features
    .flatMap((feature) => {
      const [lng, lat] = feature?.geometry?.coordinates || [];
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      )
        return [];
      const p = feature.properties || {};
      const texts = (keys: string[]) =>
        keys.map((k) => (typeof p[k] === 'string' ? p[k] : '')).filter(Boolean);
      return [
        {
          lat,
          lng,
          label: [
            ...new Set(
              texts([
                'name',
                'housenumber',
                'street',
                'district',
                'city',
                'county',
                'state',
                'country',
              ]),
            ),
          ].join(', '),
          region:
            texts(['city', 'town', 'village', 'district', 'county', 'state', 'name'])[0] ||
            'Selected location',
        },
      ];
    })
    .slice(0, 5);
}
export function locationQuery(params: URLSearchParams) {
  const query = params.get('q')?.trim();
  if (query) {
    if (query.length < 3 || query.length > 200)
      throw new Error('Enter a place name between 3 and 200 characters.');
    return { path: 'api/', params: new URLSearchParams({ q: query, limit: '5', lang: 'en' }) };
  }
  const lat = Number(params.get('lat')),
    lng = Number(params.get('lng'));
  if (
    !params.get('lat') ||
    !params.get('lng') ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error('Valid latitude and longitude are required.');
  return {
    path: 'reverse',
    params: new URLSearchParams({ lat: String(lat), lon: String(lng), limit: '1', lang: 'en' }),
  };
}
