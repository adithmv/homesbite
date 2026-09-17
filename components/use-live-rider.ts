'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Point } from '@/lib/domain';

export function useLiveRider(riderId: string | null | undefined, active: boolean) {
  const [location, setLocation] = useState<
    (Point & { updated_at: string; rider_id: string }) | null
  >(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    setLocation(null);
    if (!supabase || !riderId || !active) return;
    const client = supabase;
    let stopped = false,
      generation = 0;
    const read = async () => {
      const ticket = ++generation;
      try {
        const { data, error } = await client
          .from('rider_locations')
          .select('rider_id,lat,lng,updated_at')
          .eq('rider_id', riderId)
          .maybeSingle();
        if (!stopped && ticket === generation && !error) setLocation(data);
      } catch {
        /* Keep the last timestamp visible during a connection interruption. */
      }
    };
    void read();
    const channel = client
      .channel(`delivery-location-${riderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rider_locations',
          filter: `rider_id=eq.${riderId}`,
        },
        () => void read(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void read();
      });
    const timer = setInterval(() => void read(), 15000);
    const resume = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      void client.removeChannel(channel);
    };
  }, [riderId, active]);
  return { location: active && location?.rider_id === riderId ? location : null, now };
}
