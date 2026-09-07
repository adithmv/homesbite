'use client';
import { useState } from 'react';
import {
  Bike,
  ChefHat,
  ClipboardList,
  Download,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useStore } from './store';
import { AsyncButton, Gate, PageTitle } from './ui';
import { Stat, OrderTable } from './restaurant';
import { isActive, money } from '@/lib/domain';
export function AdminDashboard() {
  return (
    <Gate role="admin">
      <AdminWorkspace />
    </Gate>
  );
}
function AdminWorkspace() {
  const s = useStore(),
    [tab, setTab] = useState('orders'),
    [filter, setFilter] = useState('all');
  const delivered = s.orders.filter((o) => o.status === 'delivered');
  const waiting = s.orders.filter((o) => o.status === 'ready_for_pickup');
  function exportLedger() {
    const rows = [
      [
        'Order ID',
        'Delivered at',
        'Restaurant',
        'Rider ID',
        'Food value INR',
        'Delivery earning INR',
        'COD collected INR',
        'Settlement',
      ],
      ...delivered.map((o) => [
        o.id,
        o.updated_at,
        s.restaurants.find((r) => r.id === o.restaurant_id)?.name || o.restaurant_id,
        o.rider_id || '',
        (o.subtotal / 100).toFixed(2),
        (o.delivery_fee / 100).toFixed(2),
        (o.total / 100).toFixed(2),
        'MANUAL - NOT CONFIRMED',
      ]),
    ];
    const safe = (value: string) => {
      const escaped = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return `"${escaped.replaceAll('"', '""')}"`;
    };
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.map((r) => r.map(safe).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `homebite-settlement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page dashboard-page">
      <PageTitle
        eyebrow="PLATFORM OPERATIONS"
        title="The neighbourhood at a glance."
        description="Keep kitchens, riders, and orders moving together."
      >
        <button className="button secondary" onClick={exportLedger}>
          <Download size={16} />
          Export settlement ledger
        </button>
      </PageTitle>
      <div className="stats">
        <Stat
          icon={<ClipboardList size={16} />}
          label="Active orders"
          value={String(s.orders.filter(isActive).length)}
        />
        <Stat
          icon={<ChefHat size={16} />}
          label="Approved kitchens"
          value={String(s.restaurants.filter((r) => r.approved).length)}
        />
        <Stat
          icon={<Bike size={16} />}
          label="Online riders"
          value={String(s.riders.filter((r) => r.online && r.approved).length)}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="Delivered order value"
          value={money(delivered.reduce((n, o) => n + o.total, 0))}
        />
      </div>
      {waiting.length > 0 && (
        <div className="hint">
          {waiting.length} order{waiting.length === 1 ? ' is' : 's are'} ready but waiting for a
          rider. Check availability and contact partners if the wait continues.{' '}
          <AsyncButton className="button secondary small" action={() => s.dispatch()}>
            <RefreshCw size={14} />
            Retry matching
          </AsyncButton>
        </div>
      )}
      <nav className="dashboard-tabs" aria-label="Admin sections">
        {['orders', 'restaurants', 'riders'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'orders'
              ? 'All orders'
              : t === 'restaurants'
                ? 'Partner kitchens'
                : 'Delivery partners'}
          </button>
        ))}
      </nav>
      {tab === 'orders' ? (
        <>
          <div className="section-heading">
            <h2>Order activity</h2>
            <label className="sort-select">
              <select
                aria-label="Filter orders"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All orders</option>
                <option value="active">Active orders</option>
                <option value="waiting">Waiting for rider</option>
                <option value="delivered">Delivered</option>
              </select>
            </label>
          </div>
          <OrderTable
            orders={s.orders.filter(
              (o) =>
                filter === 'all' ||
                (filter === 'active' && isActive(o)) ||
                (filter === 'waiting' && o.status === 'ready_for_pickup') ||
                (filter === 'delivered' && o.status === 'delivered'),
            )}
          />
        </>
      ) : tab === 'restaurants' ? (
        <div className="management-list">
          {s.restaurants.map((r) => (
            <div className="management-row" key={r.id}>
              <div>
                <h3>
                  {r.name}{' '}
                  <span className={`pill ${r.approved ? 'green' : 'orange'}`}>
                    {r.approved ? 'Approved' : 'Awaiting approval'}
                  </span>
                </h3>
                <p>
                  {r.address} · {r.cuisine} · {r.open ? 'Open' : 'Paused'}
                </p>
              </div>
              <AsyncButton
                className={`button ${r.approved ? 'secondary' : ''}`}
                action={() => s.approve('restaurant', r.id, !r.approved)}
              >
                <ShieldCheck size={16} />
                {r.approved ? 'Suspend kitchen' : 'Approve kitchen'}
              </AsyncButton>
            </div>
          ))}
        </div>
      ) : (
        <div className="management-list">
          {s.riders.map((r) => (
            <div className="management-row" key={r.id}>
              <div>
                <h3>
                  {r.name}{' '}
                  <span className={`pill ${r.approved ? 'green' : 'orange'}`}>
                    {r.approved ? 'Verified' : 'Awaiting verification'}
                  </span>
                </h3>
                <p>
                  {r.phone} · {r.vehicle} · {r.online ? 'Online' : 'Offline'}
                </p>
                <p>
                  Last location:{' '}
                  {new Date(r.location_updated_at).getFullYear() > 1970
                    ? new Date(r.location_updated_at).toLocaleString('en-IN')
                    : 'Not shared yet'}
                </p>
              </div>
              <AsyncButton
                className={`button ${r.approved ? 'secondary' : ''}`}
                action={() => s.approve('rider', r.id, !r.approved)}
              >
                {r.approved ? 'Suspend rider' : 'Verify & approve'}
              </AsyncButton>
            </div>
          ))}
        </div>
      )}
      <p className="small muted payout-note">
        Partner approval is a manual verification step. Confirm kitchen details and rider identity
        before enabling live operations. The settlement export records amounts owed; reconcile
        actual payouts separately.
      </p>
      {s.demo && (
        <AsyncButton
          className="button secondary small"
          action={async () => {
            s.resetDemo();
          }}
        >
          Reset demo data
        </AsyncButton>
      )}
    </div>
  );
}
