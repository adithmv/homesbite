'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Role, inServiceAreas, Point } from '@/lib/domain';
import { LocationPicker } from './location-picker';
import { Place } from '@/lib/locations';
import { useStore } from './store';
import { Back } from './ui';
import { Captcha } from './captcha';
export function Login({ initialRole = 'customer' }: { initialRole?: Role }) {
  const s = useStore(),
    router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'new-password' | 'quick-register'>('login'),
    [role, setRole] = useState<Role>(initialRole),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [registrationPoint, setRegistrationPoint] = useState<Point | null>(null);
  const [registrationPlace, setRegistrationPlace] = useState<Place | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const captchaEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    setCaptchaToken('');
  }, [mode]);
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
      if (captchaEnabled && mode !== 'new-password' && !captchaToken)
        throw new Error('Complete the verification before continuing.');
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
          captchaToken,
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
      if (mode === 'quick-register') {
        const name = String(f.get('name'));
        const phone = String(f.get('phone'));
        const vehicle = String(f.get('vehicle') || 'Bike');
        const lat = registrationPoint?.lat;
        const lng = registrationPoint?.lng;
        if (
          role === 'restaurant' &&
          (!registrationPoint || !inServiceAreas(registrationPoint, s.serviceAreas))
        )
          throw new Error(
            'Select a kitchen location inside the service area before creating your account.',
          );
        if (
          role === 'rider' &&
          (!registrationPoint || !inServiceAreas(registrationPoint, s.serviceAreas))
        )
          throw new Error(
            'Select your location inside the service area before creating your account.',
          );
        const response = await fetch('/api/auth/direct-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, phone, role, vehicle, lat, lng }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Registration failed');
        if (result.session) {
          // Set the session in Supabase client
          await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
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
      if (mode === 'signup') {
        if (
          role === 'restaurant' &&
          (!registrationPoint || !inServiceAreas(registrationPoint, s.serviceAreas))
        )
          throw new Error(
            'Select a kitchen location inside the service area before creating your account.',
          );
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              name: String(f.get('name')),
              phone: String(f.get('phone')),
              role,
              vehicle: String(f.get('vehicle') || 'Bike'),
              ...(registrationPoint
                ? {
                    initial_location: {
                      ...registrationPoint,
                      label: registrationPlace?.label || '',
                      region: registrationPlace?.region || '',
                    },
                  }
                : {}),
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage('Check your email to confirm your account, then return here to sign in.');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
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
      setCaptchaToken('');
      setCaptchaAttempt((n) => n + 1);
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
                : mode === 'quick-register'
                  ? 'Quick register — instant access'
                  : 'Welcome back.'}
        </h1>
        <p className="muted">
          {mode === 'signup'
            ? 'Fresh meals and neighbourhood favourites await.'
            : mode === 'quick-register'
              ? 'No email verification, no CAPTCHA, no admin approval wait.'
              : 'Sign in to your HomeBite account.'}
        </p>
        {(mode === 'login' || mode === 'signup' || mode === 'quick-register') && (
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
              Create account (email verify)
            </button>
            <button
              className={mode === 'quick-register' ? 'active' : ''}
              onClick={() => {
                setMode('quick-register');
                setError('');
                setMessage('');
              }}
            >
              <Zap size={16} /> Quick register
            </button>
          </div>
        )}
        <form onSubmit={submit}>
          {((mode === 'signup') || (mode === 'quick-register')) && (
            <>
              <label>
                I'm here to
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
          {((mode === 'signup') || (mode === 'quick-register')) && (
            <div>
              <h3>
                {role === 'restaurant' ? 'Kitchen location (required)' : role === 'rider' ? 'Your location (required)' : 'Your location (optional)'}
              </h3>
              <LocationPicker
                point={registrationPoint || s.serviceArea}
                label={role === 'restaurant' ? 'Kitchen pickup' : 'Selected location'}
                onSelect={(p) => {
                  setRegistrationPoint(p);
                  setRegistrationPlace(null);
                }}
                onDetails={(place) => setRegistrationPlace(place)}
              />
              {registrationPoint && (
                <p className="small">
                  Latitude: {registrationPoint.lat.toFixed(6)} · Longitude:{' '}
                  {registrationPoint.lng.toFixed(6)}
                </p>
              )}
              {(role === 'restaurant' || role === 'rider') && (
                <p className="small muted">
                  Choose your actual {' '}
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
                defaultValue={process.env.NODE_ENV === 'development' && mode === 'login' ? 'agronilife@gmail.com' : undefined}
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
                minLength={mode === 'login' ? 1 : 8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                defaultValue={process.env.NODE_ENV === 'development' && mode === 'login' ? 'Admin..123456' : undefined}
              />
              {(mode !== 'login' && mode !== 'quick-register') && <small className="muted">Use at least 12 characters.</small>}
              {(mode === 'quick-register') && <small className="muted">Use at least 8 characters.</small>}
            </label>
          )}
          {captchaEnabled && mode !== 'new-password' && mode !== 'quick-register' && (
            <Captcha key={`${mode}-${captchaAttempt}`} onToken={setCaptchaToken} />
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
                  : mode === 'quick-register'
                    ? 'Quick register'
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
        {mode === 'quick-register' && (
          <p className="small muted auth-back">
            <Zap size={14} /> Quick register: no email verification, no CAPTCHA, instant access.
            Kitchen & rider accounts are auto-approved. By registering, you accept the
            <Link href="/policies">platform policies</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
