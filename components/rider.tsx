'use client';
import { useEffect, useRef, useState } from 'react';
import { Bike, CheckCircle2, Clock3, ExternalLink, MapPin, Phone, Wallet } from 'lucide-react';
import { useStore } from './store';
import { AsyncButton, Empty, Gate, PageTitle } from './ui';
import { Stat, OrderTable } from './restaurant';
import { DeliveryMap } from './map';
import { isActive, money, distance } from '@/lib/domain';
import { useRiderGps } from './use-rider-gps';
import { freshnessLabel, locationAge } from '@/lib/tracking';
export function RiderDashboard() {
  return (
    <Gate role="rider">
      <RiderWorkspace />
    </Gate>
  );
}
function RiderWorkspace() {
  const s = useStore(),
    [now, setNow] = useState(0),
    [cashConfirmed, setCashConfirmed] = useState(false);
  const rider = s.riders.find((r) => r.id === s.profile?.id);
  const job = s.orders.find((o) => o.rider_id === s.profile?.id && isActive(o));
  const kitchen = s.restaurants.find((r) => r.id === job?.restaurant_id);
  const completed = s.orders.filter(
    (o) => o.rider_id === s.profile?.id && o.status === 'delivered',
  );
  const dispatch = useRef(s.dispatch);
  const gps = useRiderGps(!!rider?.online && !!rider.approved && !s.demo, (point) =>
    s.setOnline(true, point),
  );
  useEffect(() => {
    dispatch.current = s.dispatch;
  }, [s.dispatch]);
  const demoHeartbeat = useRef(s.setOnline);
  useEffect(() => {
    demoHeartbeat.current = s.setOnline;
  }, [s.setOnline]);
  useEffect(() => {
    if (!s.demo || !rider?.online || !rider.approved) return;
    const tick = () =>
      void demoHeartbeat.current(true, { lat: rider.lat, lng: rider.lng }).catch(() => {});
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [s.demo, rider?.online, rider?.approved, rider?.lat, rider?.lng]);
  useEffect(() => {
    setCashConfirmed(false);
  }, [job?.id]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const assignment = setInterval(() => void dispatch.current().catch(() => {}), 20000);
    return () => {
      clearInterval(timer);
      clearInterval(assignment);
    };
  }, []);
  async function toggle() {
    if (rider?.online) {
      await gps.pause();
      try {
        await s.setOnline(false);
      } catch (error) {
        gps.retry();
        throw error;
      }
      return;
    }
    if (s.demo) {
      await s.setOnline(true, { lat: s.serviceArea.lat, lng: s.serviceArea.lng });
      return;
    }
    const p = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          })
        : reject(new Error('Location is unavailable.')),
    );
    await s.setOnline(true, { lat: p.coords.latitude, lng: p.coords.longitude });
  }
  const remaining =
    job?.assigned_at && now
      ? Math.max(0, 60 - Math.floor((now - Date.parse(job.assigned_at)) / 1000))
      : 0;
  const position = s.demo ? rider : gps.fix || rider;
  const gpsAge = locationAge(gps.fix?.timestamp, now);
  const sharedAge = locationAge(gps.sharedAt || rider?.location_updated_at, now);
  const nextStop = job?.status === 'picked_up' ? job : kitchen;
  const today = completed.filter(
    (o) => new Date(o.updated_at).toDateString() === new Date(now).toDateString(),
  );
  const mapsUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${position?.lat ?? s.serviceArea.lat}%2C${position?.lng ?? s.serviceArea.lng}%3B${lat}%2C${lng}`;
  return (
    <div className="page dashboard-page">
      <PageTitle
        eyebrow="THE RIDER WINDOW"
        title={`Good to see you, ${s.profile?.name}.`}
        description="A few local miles. A lot of happy doorsteps."
      >
        <AsyncButton
          className={`button ${rider?.online ? 'secondary' : ''}`}
          action={toggle}
          disabled={!rider?.approved}
        >
          <span className="live-dot" />
          {rider?.online ? 'Online · Go offline' : 'Go online'}
        </AsyncButton>
      </PageTitle>
      {!rider?.approved && (
        <div className="hint">
          Your rider account is awaiting verification. The platform admin must approve it before you
          can go online.
        </div>
      )}
      {gps.error && (
        <p className="field-error" role="alert">
          {gps.error}
        </p>
      )}
      <div className="stats">
        <Stat
          icon={<Bike size={16} />}
          label="Availability"
          value={rider?.online ? 'Online' : 'Offline'}
        />
        <Stat
          icon={<CheckCircle2 size={16} />}
          label="Deliveries today"
          value={String(today.length)}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="Fees earned today"
          value={money(today.reduce((n, o) => n + o.delivery_fee, 0))}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="COD collected"
          value={money(completed.reduce((n, o) => n + o.total, 0))}
        />
      </div>
      {job && (
        <div className="rider-offer" role="status">
          <div>
            <strong>{job.rider_accepted ? 'Delivery in progress' : 'New delivery offer'}</strong>
            <p className="small">
              {job.rider_accepted
                ? job.status === 'picked_up'
                  ? 'Head to the customer and collect cash.'
                  : `Collect from ${kitchen?.name || 'the kitchen'}.`
                : `Accept within ${remaining}s · Earn ${money(job.delivery_fee)}`}
            </p>
          </div>
          <a className="button" href="#active-delivery">
            {job.rider_accepted ? 'Open delivery' : 'Review offer'}
          </a>
        </div>
      )}
      <section className="panel rider-live-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIVE LOCATION</p>
            <h2>
              {s.demo
                ? 'Demo rider map'
                : rider?.online
                  ? gpsAge < 30
                    ? 'GPS connected'
                    : 'Waiting for fresh GPS'
                  : 'You are offline'}
            </h2>
          </div>
          <span className={`pill ${rider?.online && (s.demo || sharedAge < 30) ? 'green' : ''}`}>
            {s.demo
              ? 'Simulated location'
              : rider?.online && sharedAge < 30
                ? 'Sharing live'
                : 'Not sharing a fresh location'}
          </span>
        </div>
        <div className="tracking-metrics">
          <span>
            <strong>{s.demo ? 'Demo' : freshnessLabel(sharedAge)}</strong>Last successful location
            upload
          </span>
          <span>
            <strong>{gps.fix && !s.demo ? `±${Math.round(gps.fix.accuracy)} m` : '—'}</strong>GPS
            accuracy
          </span>
          <span>
            <strong>
              {position && nextStop ? `${distance(position, nextStop).toFixed(1)} km` : '—'}
            </strong>
            To {job?.status === 'picked_up' ? 'customer' : 'pickup'} · straight-line distance
          </span>
        </div>
        <DeliveryMap
          followPoint={rider?.online && (s.demo || gpsAge < 30) && position ? position : undefined}
          markers={[
            ...(position && (s.demo || sharedAge < 300 || gpsAge < 30)
              ? [
                  {
                    lat: position.lat,
                    lng: position.lng,
                    label: s.demo
                      ? 'Demo rider'
                      : gpsAge < 30
                        ? 'Your live position'
                        : 'Last known position',
                    color: '#386aa8',
                  },
                ]
              : []),
            ...(kitchen
              ? [{ lat: kitchen.lat, lng: kitchen.lng, label: `Pickup: ${kitchen.name}` }]
              : []),
            ...(job ? [{ lat: job.lat, lng: job.lng, label: 'Customer', color: '#d77824' }] : []),
          ]}
        />
        <div className="row-actions">
          {rider?.online && !s.demo && (
            <button type="button" className="button secondary small" onClick={gps.retry}>
              Retry GPS
            </button>
          )}
          {nextStop && (
            <a
              className="button"
              href={mapsUrl(nextStop.lat, nextStop.lng)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Navigate to{' '}
              {job?.status === 'picked_up' ? 'customer' : 'pickup'}
            </a>
          )}
        </div>
        <p className="small muted">
          {s.demo
            ? 'Demo mode uses a simulated pin; no device GPS is shared.'
            : 'Keep this page open and allow location access. Fresh GPS is shared about every 5 seconds while online. Background tabs and locked screens may pause tracking.'}
        </p>
        {!s.demo && rider?.online && sharedAge >= 30 && (
          <p className="hint" role="status">
            Your shared position is out of date. Check GPS permission and your internet connection.
          </p>
        )}
        {!s.demo && gps.fix && gps.fix.accuracy > 100 && (
          <p className="hint">GPS accuracy is low. Move outdoors for a more precise position.</p>
        )}
      </section>
      {job ? (
        <div className="rider-layout">
          <section className="panel rider-job" id="active-delivery">
            <p className="eyebrow">DELIVERY #{job.id.slice(0, 8).toUpperCase()}</p>
            <h2>
              {job.status === 'picked_up'
                ? 'One doorstep away.'
                : job.rider_accepted
                  ? 'Your pickup is ready.'
                  : 'A new delivery, nearby.'}
            </h2>
            {!job.rider_accepted && (
              <div className="hint">
                <Clock3 size={17} /> Accept within {remaining}s. Unanswered offers are reassigned.
              </div>
            )}
            <div className="job-stop">
              <span>1</span>
              <div>
                <p className="eyebrow">PICK UP FROM</p>
                <h3>{kitchen?.name || 'Kitchen'}</h3>
                <p>{kitchen?.address}</p>
                {kitchen && (
                  <a href={mapsUrl(kitchen.lat, kitchen.lng)} target="_blank" rel="noreferrer">
                    Open pickup directions <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
            <div className="job-stop">
              <span>2</span>
              <div>
                <p className="eyebrow">DELIVER TO</p>
                <h3>{job.customer_name}</h3>
                <p>{job.address}</p>
                <p>
                  <a href={`tel:+91${job.phone}`}>
                    <Phone size={14} /> {job.phone}
                  </a>
                </p>
                <a href={mapsUrl(job.lat, job.lng)} target="_blank" rel="noreferrer">
                  Open delivery directions <ExternalLink size={13} />
                </a>
                {job.notes && <p className="hint">{job.notes}</p>}
              </div>
            </div>
            <div className="cod-notice">
              Collect cash at the doorstep<strong>{money(job.total)}</strong>
              <small>Includes {money(job.delivery_fee)} delivery fee</small>
            </div>
            {job.status === 'picked_up' && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={cashConfirmed}
                  onChange={(e) => setCashConfirmed(e.target.checked)}
                />
                I handed over the food and collected {money(job.total)} cash.
              </label>
            )}
            <div className="ticket-actions">
              {!job.rider_accepted ? (
                <>
                  <AsyncButton
                    disabled={remaining === 0}
                    action={() => s.respondToAssignment(job.id, true)}
                  >
                    Accept delivery
                  </AsyncButton>
                  <AsyncButton
                    className="button secondary"
                    action={() => s.respondToAssignment(job.id, false)}
                  >
                    Decline
                  </AsyncButton>
                </>
              ) : job.status === 'rider_assigned' ? (
                <AsyncButton action={() => s.transition(job.id, 'picked_up')}>
                  Confirm food picked up
                </AsyncButton>
              ) : (
                <AsyncButton
                  disabled={!cashConfirmed}
                  action={() => s.transition(job.id, 'delivered')}
                >
                  Confirm delivery & cash
                </AsyncButton>
              )}
            </div>
          </section>
          <section className="panel">
            <h2>
              <MapPin size={20} /> Your delivery route
            </h2>
            <ol className="delivery-steps">
              <li className={job.rider_accepted ? 'done' : 'active'}>Accept delivery</li>
              <li
                className={job.status === 'picked_up' ? 'done' : job.rider_accepted ? 'active' : ''}
              >
                Collect from kitchen
              </li>
              <li className={job.status === 'picked_up' ? 'active' : ''}>
                Deliver and collect cash
              </li>
            </ol>
            <h3>In the bag</h3>
            {job.items.map((item, i) => (
              <p className="small" key={i}>
                {item.quantity} × {item.name}
              </p>
            ))}
          </section>
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={<Bike />}
            title={
              rider?.online ? 'Ready for your next delivery.' : 'Your neighbourhood is waiting.'
            }
            description={
              rider?.online
                ? 'We’ll offer the nearest available pickup automatically. Keep this window open so your location stays fresh.'
                : 'Go online with location sharing enabled to receive nearby delivery offers.'
            }
          />
        </section>
      )}
      <p className="small muted payout-note">
        Delivery fees are accrued earnings. Settlement is manual; this screen does not confirm a
        bank payout. COD collected includes the kitchen’s food value.
      </p>
      <h2 className="past-title">Delivery history</h2>
      <OrderTable orders={completed} />
    </div>
  );
}
