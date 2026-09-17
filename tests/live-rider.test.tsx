// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  change: undefined as (() => void) | undefined,
  filter: '',
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.read }) }) }),
    channel: () => ({
      on(_event: string, options: { filter: string }, fn: () => void) {
        mock.filter = options.filter;
        mock.change = fn;
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: mock.remove,
  },
}));
import { useLiveRider } from '../components/use-live-rider';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('Customer realtime rider location', () => {
  it('listens only to the assigned rider, refreshes on updates and clears after completion', async () => {
    mock.read.mockResolvedValue({
      data: { rider_id: 'r1', lat: 10, lng: 76, updated_at: new Date().toISOString() },
      error: null,
    });
    const { result, rerender } = renderHook(({ active }) => useLiveRider('r1', active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(result.current.location?.lat).toBe(10));
    expect(mock.filter).toBe('rider_id=eq.r1');
    mock.read.mockResolvedValue({
      data: { rider_id: 'r1', lat: 11, lng: 76, updated_at: new Date().toISOString() },
      error: null,
    });
    await act(async () => mock.change?.());
    expect(result.current.location?.lat).toBe(11);
    rerender({ active: false });
    expect(result.current.location).toBeNull();
    expect(mock.remove).toHaveBeenCalled();
  });
  it('does not expose the previous rider pin after reassignment', async () => {
    mock.read.mockResolvedValue({
      data: { rider_id: 'r1', lat: 10, lng: 76, updated_at: new Date().toISOString() },
      error: null,
    });
    const { result, rerender } = renderHook(({ rider }) => useLiveRider(rider, true), {
      initialProps: { rider: 'r1' },
    });
    await waitFor(() => expect(result.current.location).not.toBeNull());
    mock.read.mockResolvedValue({ data: null, error: null });
    rerender({ rider: 'r2' });
    expect(result.current.location).toBeNull();
    expect(mock.filter).toBe('rider_id=eq.r2');
  });
});
