// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  level: vi.fn(),
  verify: vi.fn(),
  enroll: vi.fn(),
  refresh: vi.fn(),
  factors: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: mock.level,
        listFactors: mock.factors,
        challengeAndVerify: mock.verify,
        enroll: mock.enroll,
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.mock('../components/store', () => ({
  useStore: () => ({ refresh: mock.refresh, signOut: vi.fn() }),
}));
import { AdminMfa } from '../components/admin-mfa';
beforeEach(() => {
  mock.level.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
  mock.factors.mockResolvedValue({ data: { totp: [{ id: 'factor-1' }] }, error: null });
  mock.verify.mockResolvedValue({ error: null });
  mock.refresh.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('Admin MFA gate', () => {
  it('hides admin content until verification succeeds and refreshes authorized data', async () => {
    render(
      <AdminMfa>
        <div>Private admin workspace</div>
      </AdminMfa>,
    );
    expect(screen.queryByText('Private admin workspace')).toBeNull();
    fireEvent.change(await screen.findByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and open admin' }));
    await screen.findByText('Private admin workspace');
    expect(mock.verify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(mock.refresh).toHaveBeenCalled();
  });
  it('keeps the workspace hidden on failed verification', async () => {
    mock.verify.mockResolvedValue({ error: new Error('incorrect') });
    render(
      <AdminMfa>
        <div>Private admin workspace</div>
      </AdminMfa>,
    );
    fireEvent.change(await screen.findByLabelText('Six-digit code'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and open admin' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Private admin workspace')).toBeNull();
  });
  it('permits a session already verified with MFA and offers enrollment otherwise', async () => {
    mock.level.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
    const view = render(
      <AdminMfa>
        <div>Private admin workspace</div>
      </AdminMfa>,
    );
    await screen.findByText('Private admin workspace');
    view.unmount();
    mock.level.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
    mock.factors.mockResolvedValue({ data: { totp: [] }, error: null });
    render(
      <AdminMfa>
        <div>Private admin workspace</div>
      </AdminMfa>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set up authenticator' })).toBeTruthy(),
    );
  });
});
