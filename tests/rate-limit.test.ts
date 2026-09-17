import { afterEach, describe, expect, it, vi } from 'vitest';
import { limitLocationRequest, requestBucket } from '../lib/rate-limit';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('Location API rate limiter', () => {
  it('does not trust spoofable forwarding headers on an unknown host', () => {
    vi.stubEnv('VERCEL', '');
    const a = requestBucket(
      new Request('https://example.com', {
        headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '1.2.3.4' },
      }),
      'secret',
    );
    const b = requestBucket(
      new Request('https://example.com', { headers: { 'x-forwarded-for': '5.6.7.8' } }),
      'secret',
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    vi.stubEnv('VERCEL', '1');
    expect(
      requestBucket(
        new Request('https://example.com', { headers: { 'x-vercel-forwarded-for': '1.2.3.4' } }),
        'secret',
      ),
    ).not.toBe(a);
  });
  it('fails closed when production quota storage is unconfigured or unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect((await limitLocationRequest(new Request('https://example.com')))?.status).toBe(503);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await limitLocationRequest(new Request('https://example.com')))?.status).toBe(503);
  });
  it('returns 429 with retry advice when the shared quota is exhausted', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => false });
    vi.stubGlobal('fetch', fetcher);
    const response = await limitLocationRequest(new Request('https://example.com'));
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).bucket).toMatch(/^[a-f0-9]{64}$/);
  });
});
