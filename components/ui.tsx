'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Home,
  Leaf,
  MapPin,
  ShoppingBag,
  ShieldCheck,
  X,
  LogOut,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useStore } from './store';
import { Role } from '@/lib/domain';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="HomeBite home">
      <span className="brand-mark">
        <Leaf size={23} strokeWidth={2.5} />
      </span>
      homebite<span className="brand-dot">.</span>
    </Link>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const s = useStore(),
    path = usePathname();
  const [menu, setMenu] = useState(false);
  const ops = ['/restaurant', '/rider', '/admin'].some((p) => path.startsWith(p));
  const count = s.cart.reduce((n, c) => n + c.quantity, 0);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {s.demo && (
        <div className="demo-bar">
          <span>
            <b>DEMO WORKSPACE</b> Explore the full journey. No real orders or payments.
          </span>
          <label>
            View as{' '}
            <select
              aria-label="Demo role"
              value={s.profile?.role || 'customer'}
              onChange={(e) => s.switchRole(e.target.value as Role)}
            >
              <option value="customer">Customer</option>
              <option value="restaurant">Restaurant</option>
              <option value="rider">Rider</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
      )}
      <header className="header">
        <div className="header-inner">
          <Brand />
          {!ops && (
            <div className="delivery-location">
              <MapPin size={19} />
              <div>
                <small>DELIVERING IN</small>
                <strong>
                  {s.serviceArea.name} <ChevronDown size={13} />
                </strong>
              </div>
            </div>
          )}
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link className={path === '/' ? 'active' : ''} href="/">
              Discover
            </Link>
            <Link className={path.startsWith('/orders') ? 'active' : ''} href="/orders">
              My orders
            </Link>
            <Link className={path.startsWith('/restaurant') ? 'active' : ''} href="/restaurant">
              For kitchens
            </Link>
            <Link className={path.startsWith('/rider') ? 'active' : ''} href="/rider">
              For riders
            </Link>
            {s.profile?.role === 'admin' && <Link href="/admin">Admin</Link>}
          </nav>
          <div className="header-actions">
            {s.profile && !s.demo ? (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => void s.signOut()}
              >
                <LogOut size={19} />
              </button>
            ) : !s.demo ? (
              <Link className="login-link" href="/login">
                Sign in
              </Link>
            ) : null}
            <Link className="cart-link" href="/checkout">
              <ShoppingBag size={18} />
              <span>Basket</span>
              <b>{count}</b>
            </Link>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label="Open navigation"
            >
              <ChevronDown />
            </button>
          </div>
        </div>
        {menu && (
          <nav className="mobile-links">
            <Link href="/" onClick={() => setMenu(false)}>
              Discover
            </Link>
            <Link href="/orders" onClick={() => setMenu(false)}>
              My orders
            </Link>
            <Link href="/restaurant" onClick={() => setMenu(false)}>
              Kitchen dashboard
            </Link>
            <Link href="/rider" onClick={() => setMenu(false)}>
              Rider window
            </Link>
            <Link href="/admin" onClick={() => setMenu(false)}>
              Admin
            </Link>
          </nav>
        )}
      </header>
      {(s.error || s.notice) && (
        <div className={`toast ${s.error ? 'error' : ''}`} role={s.error ? 'alert' : 'status'}>
          {s.error || s.notice}
          <button aria-label="Dismiss notification" onClick={s.clearMessage}>
            <X size={18} />
          </button>
        </div>
      )}
      <main id="main">{children}</main>
      <footer>
        <div>
          <Brand />
          <p>Good food. From your neighbourhood.</p>
        </div>
        <div className="footer-links">
          <Link href="/restaurant">Partner with us</Link>
          <Link href="/rider">Deliver with us</Link>
          <Link href="/policies">Policies & support</Link>
        </div>
        <span>
          Made for {s.serviceArea.name}.
          <br />
          Cash on delivery, always clear.
        </span>
      </footer>
    </>
  );
}
export function Gate({ role, children }: { role: Role; children: ReactNode }) {
  const s = useStore();
  if (s.loading) return <Loading />;
  if (s.profile?.role !== role)
    return (
      <div className="page narrow">
        <Empty
          icon={role === 'restaurant' ? <ChefHat /> : role === 'rider' ? <Bike /> : <ShieldCheck />}
          title={`${role[0].toUpperCase() + role.slice(1)} workspace`}
          description={
            s.demo
              ? 'Switch the demo role to explore this workspace.'
              : `Sign in with your ${role} account to continue.`
          }
        />
        {s.demo ? (
          <button className="button center" onClick={() => s.switchRole(role)}>
            Explore as {role}
            <ArrowRight size={16} />
          </button>
        ) : (
          <Link
            className="button center"
            href={`/login?role=${role === 'admin' ? 'customer' : role}`}
          >
            Sign in
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    );
  return <>{children}</>;
}
export function Loading() {
  return (
    <div className="page" role="status">
      <div className="loading-line" />
      <p className="muted">Getting your neighbourhood ready…</p>
    </div>
  );
}
export function Empty({
  icon = <ShoppingBag />,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Back({
  href = '/',
  children = 'Back to kitchens',
}: {
  href?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="back" href={href}>
      <ArrowLeft size={16} />
      {children}
    </Link>
  );
}
export function AsyncButton({
  action,
  children,
  className = 'button',
  disabled = false,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <span className="async-action">
      <button
        className={className}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await action();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Please wait…' : children}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
export const navIcons = { home: Home, restaurant: ChefHat, rider: Bike, orders: ClipboardList };
