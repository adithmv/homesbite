'use client';
import { useEffect, useRef, useState } from 'react';
import { Point } from '@/lib/domain';
import { GpsFix, validFix } from '@/lib/tracking';

// Keep the latest device fix separate from the last successful server upload.
export function useRiderGps(enabled: boolean, publish: (point: Point) => Promise<void>) {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState('');
  const [sharedAt, setSharedAt] = useState<number>();
  const [retry, setRetry] = useState(0);
  const sender = useRef(publish);
  const stop = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    sender.current = publish;
  }, [publish]);
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setError('GPS is unavailable in this browser.');
      return;
    }
    let stopped = false,
      lastAttempt = 0;
    let latest: GpsFix | null = null;
    let pending: Promise<void> | null = null;
    function send() {
      if (stopped || pending || !latest || !validFix(latest) || Date.now() - lastAttempt < 5000)
        return;
      lastAttempt = Date.now();
      pending = sender
        .current({ lat: latest.lat, lng: latest.lng })
        .then(() => {
          if (!stopped) {
            setSharedAt(Date.now());
            setError('');
          }
        })
        .catch(() => {
          if (!stopped)
            setError(
              'Location upload failed. Reconnecting automatically; your customer may see an older position.',
            );
        })
        .finally(() => {
          pending = null;
        });
    }
    setError('');
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) return;
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        if (!validFix(next)) {
          setError('Waiting for a fresh GPS fix.');
          return;
        }
        latest = next;
        setFix(next);
        send();
      },
      (failure) => {
        if (stopped) return;
        latest = null;
        setError(
          failure.code === 1
            ? 'Location permission was denied. Enable it in browser settings, then retry GPS.'
            : 'GPS signal is unavailable. Move to an open area or retry GPS.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const timer = setInterval(send, 5000);
    const resume = () => {
      if (document.visibilityState === 'visible') send();
    };
    window.addEventListener('online', send);
    document.addEventListener('visibilitychange', resume);
    const halt = async () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      window.removeEventListener('online', send);
      document.removeEventListener('visibilitychange', resume);
      await pending;
    };
    stop.current = halt;
    return () => {
      void halt();
    };
  }, [enabled, retry]);
  return { fix, error, sharedAt, pause: () => stop.current(), retry: () => setRetry((n) => n + 1) };
}
