'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AsyncButton } from './ui';
type Event = {
  id: number;
  actor_id: string | null;
  action: string;
  target_id: string;
  created_at: string;
};
export function SecurityLog() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loaded, setLoaded] = useState(false);
  return (
    <section className="panel">
      <h2>Admin security log</h2>
      <p>
        Recent service-area changes and partner approvals. Passwords, addresses and GPS coordinates
        are not recorded here.
      </p>
      {!supabase ? (
        <p className="hint">Security logs and MFA are available in live mode.</p>
      ) : (
        <AsyncButton
          action={async () => {
            const { data, error } = await supabase!.rpc('read_security_events');
            if (error)
              throw new Error(
                'Security log unavailable. Verify MFA and apply the security migration to the matching database.',
              );
            setEvents(data || []);
            setLoaded(true);
          }}
        >
          Load latest events
        </AsyncButton>
      )}
      {loaded && !events.length && <p>No security events recorded yet.</p>}
      {events.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString('en-IN')}</td>
                  <td>{event.action}</td>
                  <td>{event.actor_id || 'Database operator'}</td>
                  <td>{event.target_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
