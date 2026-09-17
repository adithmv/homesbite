// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRiderGps } from '../components/use-rider-gps';
import { locationAge, validFix } from '../lib/tracking';
let success: PositionCallback;
let failure: PositionErrorCallback;
const clear = vi.fn();
function position(timestamp = Date.now(), lat = 10): GeolocationPosition {
  return {
    timestamp,
    coords: { latitude: lat, longitude: 76, accuracy: 12 },
  } as GeolocationPosition;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T10:00:00Z'));
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
        success = ok;
        failure = fail;
        return 42;
      }),
      clearWatch: clear,
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('Rider GPS lifecycle', () => {
  it('publishes fresh fixes, throttles uploads, and stops sending old coordinates', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useRiderGps(true, publish));
    await act(async () => success(position()));
    expect(publish).toHaveBeenCalledWith({ lat: 10, lng: 76 });
    await act(async () => success(position(Date.now(), 11)));
    expect(publish).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(publish).toHaveBeenLastCalledWith({ lat: 11, lng: 76 });
    await act(async () => {
      vi.advanceTimersByTime(31000);
    });
    const count = publish.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(publish).toHaveBeenCalledTimes(count);
  });
  it('waits for an in-flight upload before going offline and ignores later GPS callbacks', async () => {
    let finish!: () => void;
    const publish = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useRiderGps(true, publish));
    act(() => success(position()));
    let paused = false;
    const done = result.current.pause().then(() => {
      paused = true;
    });
    expect(paused).toBe(false);
    await act(async () => {
      finish();
      await done;
    });
    expect(paused).toBe(true);
    expect(clear).toHaveBeenCalledWith(42);
    await act(async () => {
      success(position());
      vi.advanceTimersByTime(10000);
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('reports failures, retries network uploads, and clears watchers on unmount', async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useRiderGps(true, publish));
    await act(async () => success(position()));
    expect(result.current.error).toContain('upload failed');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.error).toBe('');
    act(() => failure({ code: 1 } as GeolocationPositionError));
    expect(result.current.error).toContain('permission');
    unmount();
    expect(clear).toHaveBeenCalledWith(42);
  });
  it('does not start GPS while offline and rejects invalid or stale fixes', () => {
    renderHook(() => useRiderGps(false, vi.fn()));
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
    expect(validFix({ lat: 91, lng: 76, accuracy: 10, timestamp: Date.now() })).toBe(false);
    expect(validFix({ lat: 10, lng: 76, accuracy: 10, timestamp: Date.now() - 31000 })).toBe(false);
    expect(locationAge(undefined, Date.now())).toBe(Infinity);
  });
});
