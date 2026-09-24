'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Back } from '@/components/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError('Database connection not available. Please try again.');
      return;
    }

    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') || '').trim().toLowerCase();
    const password = String(f.get('password') || '');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // If account email was not confirmed, attempt auto-confirm and retry
      if (
        signInError &&
        (signInError.message.toLowerCase().includes('not confirmed') ||
          signInError.message.toLowerCase().includes('email not confirmed'))
      ) {
        try {
          await fetch('/api/auth/confirm-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const retry = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          signInData = retry.data;
          signInError = retry.error;
        } catch {
          // ignore retry error
        }
      }

      if (signInError || !signInData?.user) {
        throw new Error(signInError?.message || 'Invalid login credentials.');
      }

      // Verify administrator role in profiles table
      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signInData.user.id)
        .maybeSingle();

      if (profError) {
        throw new Error('Unable to verify account permissions.');
      }

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Access denied. This account does not have administrator privileges.');
      }

      // Admin verified -> redirect to admin workspace (will prompt for MFA if enrolled)
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow" style={{ maxWidth: 420 }}>
      <div className="auth-panel">
        <Back />
        <div className="eyebrow">PLATFORM OPERATIONS</div>
        <h1>Admin Sign In</h1>
        <p className="muted">Enter your administrator credentials to access platform controls.</p>

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
            Admin Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@example.com"
              disabled={busy}
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={busy}
            />
          </label>

          <button className="button full" disabled={busy} type="submit">
            {busy ? (
              <>
                <Loader2 size={16} className="spin" />
                Signing in…
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
          After password authentication, you will be prompted for MFA verification.
        </p>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link href="/login" className="text-button small">
            Switch to customer, kitchen, or rider login
          </Link>
        </div>
      </div>
    </div>
  );
}