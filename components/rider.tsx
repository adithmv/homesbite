'use client';
import { useEffect, useRef, useState } from 'react';
import { Bike, CheckCircle2, Clock3, ExternalLink, MapPin, Phone, Wallet } from 'lucide-react';
import { useStore } from './store';
import { AsyncButton, Empty, Gate, PageTitle } from './ui';
import { Stat, OrderTable } from './restaurant';
import { DeliveryMap } from './map';
import { isActive, money } from '@/lib/domain';
export function RiderDashboard() {
  return (
    <Gate role="rider">
      <RiderWorkspace />
    </Gate>
  );
}
function RiderWorkspace() {
  const s = useStore(),
    [locationError, setLocationError] = useState(''),
    [now, setNow] = useState(0),
    [cashConfirmed, setCashConfirmed] = useState(false);
  const rider = s.riders.find((r) => r.id === s.profile?.id);
  const job = s.orders.find((o) => o.rider_id === s.profile?.id && isActive(o));
  const kitchen = s.restaurants.find((r) => r.id === job?.restaurant_id);
  const completed = s.orders.filter(
    (o) => o.rider_id === s.profile?.id && o.status === 'delivered',
  );
  const updateLocation = useRef(s.setOnline),
    dispatch = useRef(s.dispatch);
  useEffect(() => {
    updateLocation.current = s.setOnline;
    dispatch.current = s.dispatch;
  }, [s.setOnline, s.dispatch]);
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
  useEffect(() => {
    if (!rider?.online || !rider.approved) return;
    if (s.demo) {
      const tick = () =>
        void updateLocation
          .current(true, { lat: s.serviceArea.lat, lng: s.serviceArea.lng })
          .catch(() => {});
      tick();
      const timer = setInterval(tick, 60000);
      return () => clearInterval(timer);
    }
    if (!navigator.geolocation) {
      setLocationError('This browser does not support location sharing.');
      return;
    }
    let last = 0,
      stopped = false;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        if (stopped || Date.now() - last < 15000) return;
        last = Date.now();
        setLocationError('');
        void updateLocation
          .current(true, { lat: p.coords.latitude, lng: p.coords.longitude })
          .catch((e) => setLocationError(e.message));
      },
      () => {
        if (stopped) return;
        setLocationError('Location sharing stopped. Enable location access to receive deliveries.');
        void updateLocation.current(false).catch(() => {});
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
    };
  }, [rider?.online, rider?.approved, s.demo, rider?.id, s.serviceArea.lat, s.serviceArea.lng]);
  async function toggle() {
    if (rider?.online) {
      await s.setOnline(false);
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
  const mapsUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${rider?.lat || s.serviceArea.lat}%2C${rider?.lng || s.serviceArea.lng}%3B${lat}%2C${lng}`;
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
      {locationError && (
        <p className="field-error" role="alert">
          {locationError}
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
          label="Completed deliveries"
          value={String(completed.length)}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="Delivery fees earned"
          value={money(completed.reduce((n, o) => n + o.delivery_fee, 0))}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="COD collected"
          value={money(completed.reduce((n, o) => n + o.total, 0))}
        />
      </div>
      {job ? (
        <div className="rider-layout">
          <section className="panel rider-job">
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
            <DeliveryMap
              markers={[
                ...(kitchen ? [{ lat: kitchen.lat, lng: kitchen.lng, label: kitchen.name }] : []),
                { lat: job.lat, lng: job.lng, label: 'Customer', color: '#d77824' },
                ...(rider
                  ? [{ lat: rider.lat, lng: rider.lng, label: 'You', color: '#386aa8' }]
                  : []),
              ]}
            />
            <p className="small muted">
              Map pins show pickup, drop, and your last shared location. Open directions for a
              route.
            </p>
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
