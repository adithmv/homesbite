import { describe, it, expect } from 'vitest';
import { contentSecurityPolicy } from '../lib/security-headers';
describe('Browser security policy', () => {
  it('requires nonces for scripts, disallows eval in production and only connects to configured services', () => {
    const policy = contentSecurityPolicy('randomNonce', true, 'https://test.supabase.co');
    expect(policy).toContain("script-src 'self' 'nonce-randomNonce' 'strict-dynamic';");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain('wss://test.supabase.co');
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("object-src 'none'");
  });
});
