'use client';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from './store';

export function AdminMfa({ children }: { children: ReactNode }) {
  const store = useStore();
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [factorId, setFactorId] = useState('');
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [enrollment, setEnrollment] = useState<{ qr_code: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const refresh = useRef(store.refresh);
  useEffect(() => {
    refresh.current = store.refresh;
  }, [store.refresh]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let stopped = false;
    const check = async () => {
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (stopped) return;
      if (error) {
        setVerified(false);
        setError('Unable to verify your session. Sign in again.');
        setLoading(false);
        return;
      }
      setVerified(data.currentLevel === 'aal2');
      if (data.currentLevel !== 'aal2') {
        const result = await client.auth.mfa.listFactors();
        if (stopped) return;
        if (result.error) setError('Unable to load authenticator details. Sign in again.');
        else {
          setFactors(result.data.totp);
          setFactorId((id) => id || result.data.totp[0]?.id || '');
        }
      }
      setLoading(false);
    };
    void check();
    const { data: listener } = client.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (!stopped) void check();
      }, 0);
    });
    return () => {
      stopped = true;
      listener.subscription.unsubscribe();
    };
  }, []);
  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const { data, error } = await supabase!.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `HomeBite admin ${new Date().toISOString()}`,
      });
      if (error) throw error;
      setFactorId(data.id);
      setEnrollment(data.totp);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not set up the authenticator.');
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setCode('');
      setEnrollment(null);
      await refresh.current();
      setVerified(true);
    } catch {
      setError('Verification failed. Enter the current six-digit code and try again.');
    } finally {
      setBusy(false);
    }
  }
  if (verified) return <>{children}</>;
  return (
    <div className="page narrow">
      <section className="panel">
        <p className="eyebrow">ADMIN SECURITY</p>
        <h1>Verify with your authenticator</h1>
        {loading ? (
          <p role="status">Checking your session…</p>
        ) : (
          <>
            <p>Admin access requires a password and a code from an authenticator app.</p>
            {!factorId && (
              <button className="button" disabled={busy} onClick={() => void enroll()}>
                Set up authenticator
              </button>
            )}
            {enrollment && (
              <div>
                <p>Scan this QR code with your authenticator. Keep the setup key private.</p>
                {/* Supabase returns an SVG data URL; no raw SVG is injected into the DOM. */}
                <img
                  src={enrollment.qr_code}
                  width={220}
                  height={220}
                  alt="Authenticator setup QR code"
                />
                <details>
                  <summary>Enter setup key manually</summary>
                  <code className="mfa-secret">{enrollment.secret}</code>
                </details>
              </div>
            )}
            {factorId && (
              <form onSubmit={verify}>
                {factors.length > 1 && (
                  <label>
                    Authenticator
                    <select value={factorId} onChange={(e) => setFactorId(e.target.value)}>
                      {factors.map((factor) => (
                        <option key={factor.id} value={factor.id}>
                          {factor.friendly_name || 'Authenticator'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Six-digit code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </label>
                <button className="button" disabled={busy || code.length !== 6}>
                  Verify and open admin
                </button>
              </form>
            )}
            <p className="small muted">
              Lost your authenticator? Contact the Supabase project owner to verify your identity
              and recover access.
            </p>
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="text-button" onClick={() => void store.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}
