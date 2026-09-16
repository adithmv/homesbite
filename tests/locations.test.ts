import { afterEach, describe, expect, it, vi } from 'vitest';
import { locationQuery, parsePlaces } from '../lib/locations';
import { GET } from '../app/api/locations/route';
afterEach(() => vi.unstubAllGlobals());
const feature = {
  geometry: { coordinates: [76.2673, 9.9312] },
  properties: { name: 'Marine Drive', city: 'Kochi', state: 'Kerala', country: 'India' },
};
describe('Location lookup', () => {
  it('maps longitude/latitude into correct named coordinates and region', () => {
    expect(parsePlaces({ features: [feature] })).toEqual([
      { lat: 9.9312, lng: 76.2673, label: 'Marine Drive, Kochi, Kerala, India', region: 'Kochi' },
    ]);
  });
  it('rejects malformed coordinates and provider responses', () => {
    expect(parsePlaces({ features: [{ geometry: { coordinates: [0, NaN] } }, null] })).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
  });
  it.each(['q=ab', 'lat=91&lng=0', 'lat=&lng=4', 'lat=0&lng=Infinity', 'q=' + 'a'.repeat(201)])(
    'rejects invalid request %s',
    (query) => expect(() => locationQuery(new URLSearchParams(query))).toThrow(),
  );
  it('accepts zero coordinates and safely encodes a search', () => {
    expect(locationQuery(new URLSearchParams('lat=0&lng=0')).path).toBe('reverse');
    expect(locationQuery(new URLSearchParams({ q: 'Kochi & beach' })).params.get('q')).toBe(
      'Kochi & beach',
    );
  });
  it('returns a useful failure without losing manual map selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const response = await GET(new Request('http://localhost/api/locations?q=Kochi'));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('map');
  });
  it('forwards only validated parameters to the configured provider', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    vi.stubGlobal('fetch', mock);
    const response = await GET(
      new Request('http://localhost/api/locations?q=Kochi&url=https://bad.example'),
    );
    expect(response.status).toBe(200);
    expect(String(mock.mock.calls[0][0])).toContain('photon.komoot.io/api/');
    expect(String(mock.mock.calls[0][0])).not.toContain('bad.example');
    expect((await response.json()).places[0].region).toBe('Kochi');
  });
});
