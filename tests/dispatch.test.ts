import { afterEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));
import { GET } from '../app/api/dispatch/route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('Protected cron endpoint', () => {
  it('rejects requests when no cron secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(new Request('http://localhost/api/dispatch'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['', 'Bearer wrong', 'Bearer sécret'])(
    'rejects invalid authorization %s',
    async (authorization) => {
      vi.stubEnv('CRON_SECRET', 'secret');
      const response = await GET(
        new Request('http://localhost/api/dispatch', { headers: { authorization } }),
      );
      expect(response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it('returns a setup error without exposing secrets', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const response = await GET(
      new Request('http://localhost/api/dispatch', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(response.status).toBe(503);
  });
  it('invokes the server dispatcher after authentication', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
    rpc.mockResolvedValue({ error: null });
    const response = await GET(
      new Request('http://localhost/api/dispatch', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('dispatch_orders');
    expect(await response.json()).toEqual({ ok: true });
  });
});
