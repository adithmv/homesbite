'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Role } from '@/lib/domain';
import { useStore } from './store';
import { Back } from './ui';
export function Login({ initialRole = 'customer' }: { initialRole?: Role }) {
  const s = useStore(),
    router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'new-password'>('login'),
    [role, setRole] = useState<Role>(initialRole),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('new-password');
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    const f = new FormData(e.currentTarget),
      email = String(f.get('email')),
      password = String(f.get('password'));
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        setMessage('If an account exists, a password reset link is on its way.');
        return;
      }
      if (mode === 'new-password') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage('Password updated. You can sign in with your new password.');
        setMode('login');
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              name: String(f.get('name')),
              phone: String(f.get('phone')),
              role,
              vehicle: String(f.get('vehicle') || 'Bike'),
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage('Check your email to confirm your account, then return here to sign in.');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please verify your email before signing in.');
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      await s.refresh();
      router.push(
        profile.role === 'restaurant'
          ? '/restaurant'
          : profile.role === 'rider'
            ? '/rider'
            : profile.role === 'admin'
              ? '/admin'
              : s.cart.length
                ? '/checkout'
                : '/',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete this request.');
    } finally {
      setBusy(false);
    }
  }
  if (s.demo)
    return (
      <div className="page narrow">
        <Back />
        <h1>Welcome to the demo.</h1>
        <p className="muted">
          Use the role switcher at the top to explore customer, kitchen, rider, and admin
          workspaces. No account is needed in the demo.
        </p>
        <Link className="button" href="/">
          Find your next meal
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="page">
      <div className="auth-panel">
        <Back />
        <p className="eyebrow">A PLACE AT THE TABLE</p>
        <h1>
          {mode === 'reset'
            ? 'Forgot your password?'
            : mode === 'new-password'
              ? 'Choose a new password.'
              : mode === 'signup'
                ? 'Make yourself at home.'
                : 'Welcome back.'}
        </h1>
        <p className="muted">
          {mode === 'signup'
            ? 'Fresh meals and neighbourhood favourites await.'
            : 'Sign in to your HomeBite account.'}
        </p>
        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError('');
                setMessage('');
              }}
            >
              Sign in
            </button>
            <button
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => {
                setMode('signup');
                setError('');
                setMessage('');
              }}
            >
              Create account
            </button>
          </div>
        )}
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>
                I’m here to
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="customer">Order food</option>
                  <option value="restaurant">Run a kitchen</option>
                  <option value="rider">Deliver food</option>
                </select>
              </label>
              <label>
                Full name
                <input name="name" required autoComplete="name" maxLength={100} />
              </label>
              <label>
                Mobile number
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  pattern="[6-9][0-9]{9}"
                  title="10-digit Indian mobile number"
                  required
                  maxLength={10}
                  autoComplete="tel-national"
                />
              </label>
              {role === 'rider' && (
                <label>
                  Vehicle
                  <select name="vehicle">
                    <option>Bike</option>
                    <option>Scooter</option>
                    <option>Bicycle</option>
                  </select>
                </label>
              )}
            </>
          )}
          {mode !== 'new-password' && (
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={mode === 'login' ? 1 : 12}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode !== 'login' && <small className="muted">Use at least 12 characters.</small>}
            </label>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Update password'}
            <ArrowRight size={16} />
          </button>
        </form>
        {mode === 'login' ? (
          <button
            className="text-button auth-back"
            onClick={() => {
              setMode('reset');
              setError('');
              setMessage('');
            }}
          >
            Forgot password?
          </button>
        ) : mode === 'reset' ? (
          <button className="text-button auth-back" onClick={() => setMode('login')}>
            Back to sign in
          </button>
        ) : null}
        {mode === 'signup' && (
          <p className="small muted auth-back">
            Kitchen and rider accounts require admin approval before going live. By creating an
            account, you accept the <Link href="/policies">platform policies</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
