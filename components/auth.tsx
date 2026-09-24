'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Role, inServiceAreas, Point } from '@/lib/domain';
import { LocationPicker } from './location-picker';
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
  const [registrationPoint, setRegistrationPoint] = useState<Point | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('new-password');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError('Database connection not available. Please try again.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');

    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') || '').trim().toLowerCase();
    const password = String(f.get('password') || '');

    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        setMessage('If an account exists for this email, a password reset link has been sent.');
        return;
      }

      if (mode === 'new-password') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage('Password updated successfully. You can now sign in.');
        setMode('login');
        return;
      }

      if (mode === 'signup') {
        const name = String(f.get('name') || '').trim();
        const phone = String(f.get('phone') || '').trim();
        const vehicle = String(f.get('vehicle') || 'Bike');
        const lat = registrationPoint?.lat;
        const lng = registrationPoint?.lng;

        if (!name) throw new Error('Please enter your full name.');
        if (!phone || !/^[6-9][0-9]{9}$/.test(phone)) {
          throw new Error('Please enter a valid 10-digit Indian mobile number.');
        }

        if (
          role === 'restaurant' &&
          (!registrationPoint || !inServiceAreas(registrationPoint, s.serviceAreas))
        ) {
          throw new Error(
            'Select a kitchen location inside the service area before creating your account.',
          );
        }

        if (
          role === 'rider' &&
          (!registrationPoint || !inServiceAreas(registrationPoint, s.serviceAreas))
        ) {
          throw new Error(
            'Select your base location inside the service area before creating your account.',
          );
        }

        // Direct registration: bypasses email verification completely!
        let session = null;

        try {
          const response = await fetch('/api/auth/direct-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, phone, role, vehicle, lat, lng }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'Direct registration failed.');
          }
          session = result.session;
        } catch (apiErr) {
          // Fallback to direct client RPC if API endpoint is unreachable
          console.warn('API direct-register call fell back to client RPC:', apiErr);
          const { error: rpcErr } = await supabase.rpc('direct_register', {
            p_email: email,
            p_password: password,
            p_name: name,
            p_phone: phone,
            p_role: role,
            p_vehicle: vehicle,
            p_lat: lat ?? 12.9716,
            p_lng: lng ?? 77.5946,
          });
          if (rpcErr) throw rpcErr;

          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInErr) throw signInErr;
          session = signInData.session;
        }

        if (session) {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        }

        await s.refresh();
        router.push(
          role === 'restaurant'
            ? '/restaurant'
            : role === 'rider'
              ? '/rider'
              : s.cart.length
                ? '/checkout'
                : '/',
        );
        return;
      }

      // mode === 'login'
      let signInResult = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // If user had unconfirmed email from prior system, auto-confirm it in DB and retry sign-in
      if (
        signInResult.error &&
        (signInResult.error.message.toLowerCase().includes('not confirmed') ||
          signInResult.error.message.toLowerCase().includes('email not confirmed'))
      ) {
        try {
          await fetch('/api/auth/confirm-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          // Retry sign-in after confirming email
          signInResult = await supabase.auth.signInWithPassword({
            email,
            password,
          });
        } catch {
          // ignore retry failure and let error handling proceed
        }
      }

      if (signInResult.error) throw signInResult.error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Authentication failed. Please check your credentials.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const userRole = profile?.role || (user.user_metadata?.role as Role) || 'customer';

      await s.refresh();
      router.push(
        userRole === 'restaurant'
          ? '/restaurant'
          : userRole === 'rider'
            ? '/rider'
            : userRole === 'admin'
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
                ? 'Create your account.'
                : 'Welcome back.'}
        </h1>
        <p className="muted">
          {mode === 'signup'
            ? 'Direct access to home-cooked meals. No email verification required.'
            : mode === 'reset'
              ? 'Enter your email to receive a password reset link.'
              : 'Sign in to your HomeBite account.'}
        </p>

        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs">
            <button
              type="button"
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
              type="button"
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
                I&apos;m here to
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="customer">Order food</option>
                  <option value="restaurant">Run a kitchen</option>
                  <option value="rider">Deliver food</option>
                </select>
              </label>
              <label>
                Full name
                <input name="name" required autoComplete="name" maxLength={100} placeholder="e.g. Priya Sharma" />
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
                  placeholder="e.g. 9876543210"
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

          {mode === 'signup' && (
            <div>
              <h3>
                {role === 'restaurant'
                  ? 'Kitchen location (required)'
                  : role === 'rider'
                    ? 'Your location (required)'
                    : 'Your location (optional)'}
              </h3>
              <LocationPicker
                point={registrationPoint || s.serviceArea}
                label={role === 'restaurant' ? 'Kitchen pickup' : 'Selected location'}
                onSelect={(p) => setRegistrationPoint(p)}
              />
              {registrationPoint && (
                <p className="small">
                  Latitude: {registrationPoint.lat.toFixed(6)} · Longitude:{' '}
                  {registrationPoint.lng.toFixed(6)}
                </p>
              )}
              {(role === 'restaurant' || role === 'rider') && (
                <p className="small muted">
                  Choose your actual{' '}
                  {role === 'restaurant' ? 'kitchen pickup' : 'home/base'} location. Available service areas:{' '}
                  {s.serviceAreas.map((a) => a.name).join(', ')}.
                </p>
              )}
            </div>
          )}

          {mode !== 'new-password' && (
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
              />
            </label>
          )}

          {mode !== 'reset' && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'signup' && (
                <small className="muted">Use at least 6 characters.</small>
              )}
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
            <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
            Instant access: no email verification required. Kitchen and rider accounts are auto-activated.
            By creating an account, you accept the{' '}
            <Link href="/policies">platform policies</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
