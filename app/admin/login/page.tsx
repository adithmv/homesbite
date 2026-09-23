'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

const ADMIN_EMAIL = 'agronilife@gmail.com';
const ADMIN_PASSWORD = 'Admin..123456';

export default function AdminLoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [autoCreating, setAutoCreating] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');

    try {
      // First, try to sign in directly
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      if (!signInError && signInData.session) {
        // Success - redirect to admin dashboard (will trigger MFA)
        router.push('/admin');
        return;
      }

      // If user not found, try to create via direct_register RPC
      if (signInError?.message?.includes('Invalid login credentials') || signInError?.status === 400) {
        setAutoCreating(true);
        setMessage('Admin account not found. Creating...');

        const { data: rpcData, error: rpcError } = await supabase.rpc('direct_register', {
          p_email: ADMIN_EMAIL,
          p_password: ADMIN_PASSWORD,
          p_name: 'Platform Admin',
          p_phone: '9876543210',
          p_role: 'admin',
          p_vehicle: 'Bike',
          p_lat: 12.9716,
          p_lng: 77.5946,
        });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        setMessage('Account created. Signing in...');

        // Now sign in with the newly created account
        const { data: newSignInData, error: newSignInError } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

        if (newSignInError || !newSignInData.session) {
          throw new Error('Account created but auto sign-in failed. Please try again.');
        }

        router.push('/admin');
        return;
      }

      // Other sign-in errors
      throw new Error(signInError?.message || 'Sign in failed');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
      setAutoCreating(false);
    }
  }

  async function handleAutoCreate() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('Creating admin account...');

    try {
      const { error: rpcError } = await supabase.rpc('direct_register', {
        p_email: ADMIN_EMAIL,
        p_password: ADMIN_PASSWORD,
        p_name: 'Platform Admin',
        p_phone: '9876543210',
        p_role: 'admin',
        p_vehicle: 'Bike',
        p_lat: 12.9716,
        p_lng: 77.5946,
      });

      if (rpcError) throw new Error(rpcError.message);

      setMessage('Admin account created! You can now sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow" style={{ maxWidth: 400 }}>
      <div className="auth-panel">
        <div className="eyebrow">PLATFORM ADMIN</div>
        <h1>Admin Access</h1>
        <p className="muted">Secure entry for platform administrators.</p>

        {message && (
          <p role="status" className="success" style={{ marginBottom: 16 }}>
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="field-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={ADMIN_EMAIL}
              readOnly
              style={{ background: 'var(--muted)', cursor: 'not-allowed' }}
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              defaultValue={ADMIN_PASSWORD}
              readOnly
              style={{ background: 'var(--muted)', cursor: 'not-allowed' }}
            />
          </label>

          <button className="button full" disabled={busy} type="submit">
            {busy ? (
              <>
                <Loader2 size={16} className="spin" />
                {autoCreating ? ' Creating account…' : ' Signing in…'}
              </>
            ) : (
              <>
                Sign in to Admin
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 16, textAlign: 'center' }}>
          <ShieldCheck size={14} style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />
          After sign-in, you'll be prompted for MFA verification.
        </p>

        <button
          className="text-button"
          onClick={handleAutoCreate}
          disabled={busy}
          style={{ marginTop: 8, display: 'block', width: '100%' }}
        >
          {busy && autoCreating ? 'Creating…' : 'Create admin account (if not exists)'}
        </button>
      </div>
    </div>
  );
}