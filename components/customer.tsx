'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  LocateFixed,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from './store';
import { AsyncButton, Back, Empty, Gate, Loading, PageTitle } from './ui';
import { Quantity } from './discovery';
import { DeliveryMap, MapMarker } from './map';
import { DELIVERY_FEE, isActive, labels, money, timeline } from '@/lib/domain';
import { supabase } from '@/lib/supabase';
export function CheckoutPage() {
  return (
    <Gate role="customer">
      <CheckoutForm />
    </Gate>
  );
}
function CheckoutForm() {
  const s = useStore(),
    router = useRouter();
  const [point, setPoint] = useState({ lat: s.serviceArea.lat, lng: s.serviceArea.lng }),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const items = s.cart.map((l) => ({ ...l, item: s.menu.find((m) => m.id === l.id) }));
  const restaurant = s.restaurants.find((r) => r.id === items[0]?.item?.restaurant_id);
  const subtotal = items.reduce((n, l) => n + (l.item?.price || 0) * l.quantity, 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (!confirmed)
        throw new Error(
          'Confirm your delivery pin using the map, coordinates, or your current location.',
        );
      if (!restaurant) throw new Error('Kitchen unavailable.');
      const form = new FormData(e.currentTarget);
      const id = await s.checkout({
        restaurant_id: restaurant.id,
        customer_name: String(form.get('name')),
        phone: String(form.get('phone')),
        address: String(form.get('address')),
        notes: String(form.get('notes')),
        ...point,
      });
      router.push(`/orders/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to place order.');
    } finally {
      setBusy(false);
    }
  }
  const locate = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is unavailable. Use the map or coordinates.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint({ lat: p.coords.latitude, lng: p.coords.longitude });
        setConfirmed(true);
      },
      () => setError('Location access was denied. Select the delivery pin on the map instead.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  if (!items.length)
    return (
      <div className="page narrow">
        <Empty
          title="Your basket is waiting"
          description="Find something delicious from a neighbourhood kitchen."
        />
        <Link className="button center" href="/">
          Explore kitchens
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  return (
    <div className="page">
      <Back href={restaurant ? `/r/${restaurant.slug}` : '/'}>Back to menu</Back>
      <PageTitle
        eyebrow="ONE LAST THING"
        title="Let’s bring it home."
        description="Fresh food, a clear total, and payment at your door."
      />
      <form className="checkout-layout" onSubmit={submit}>
        <section className="panel">
          <h2>
            <MapPin size={21} /> Delivery details
          </h2>
          <div className="form-grid">
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                defaultValue={s.profile?.name}
              />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                autoComplete="tel-national"
                inputMode="tel"
                pattern="[6-9][0-9]{9}"
                title="10-digit Indian mobile number"
                maxLength={10}
                required
                defaultValue={s.profile?.phone}
              />
            </label>
            <label className="span-2">
              Complete address
              <textarea
                name="address"
                autoComplete="street-address"
                required
                minLength={10}
                maxLength={500}
                placeholder="Flat / house number, building, street, area, and landmark"
              />
            </label>
          </div>
          <div className="section-heading">
            <h3>Set your delivery pin</h3>
            <button className="text-button" type="button" onClick={locate}>
              <LocateFixed size={16} />
              Use my location
            </button>
          </div>
          <DeliveryMap
            markers={[{ ...point, label: 'Deliver here' }]}
            onSelect={(p) => {
              setPoint(p);
              setConfirmed(true);
            }}
          />
          <p className="small muted">
            Click the map or enter coordinates. Available within {s.serviceArea.radius_km} km of{' '}
            {s.serviceArea.name}.
          </p>
          <div className="form-grid">
            <label>
              Latitude
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                value={point.lat}
                onChange={(e) => {
                  setPoint({ ...point, lat: Number(e.target.value) });
                  setConfirmed(true);
                }}
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                value={point.lng}
                onChange={(e) => {
                  setPoint({ ...point, lng: Number(e.target.value) });
                  setConfirmed(true);
                }}
                required
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            This pin matches my delivery address.
          </label>
          <label>
            Delivery notes <span className="muted">(optional)</span>
            <textarea
              name="notes"
              maxLength={500}
              placeholder="e.g. Ring the bell at the side entrance"
            />
          </label>
        </section>
        <aside>
          <div className="panel order-summary">
            <p className="eyebrow">YOUR ORDER FROM</p>
            <h2>{restaurant?.name}</h2>
            {items.map((l) => (
              <div className="checkout-item" key={l.id}>
                <div>
                  <strong>{l.item?.name || 'Unavailable item — remove to continue'}</strong>
                  <p>{money(l.item?.price || 0)}</p>
                </div>
                <Quantity id={l.id} />
              </div>
            ))}
            <div className="bill-line">
              <span>Food subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="bill-line">
              <span>Delivery fee</span>
              <span>{money(DELIVERY_FEE)}</span>
            </div>
            <div className="total-line">
              <strong>Total to pay</strong>
              <strong>{money(subtotal + DELIVERY_FEE)}</strong>
            </div>
            <div className="payment-box">
              <ShieldCheck size={23} />
              <div>
                <strong>Cash on delivery</strong>
                <p>Pay your rider when your meal arrives.</p>
              </div>
              <Check size={19} />
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button full"
              disabled={busy || items.some((i) => !i.item?.available)}
              type="submit"
            >
              {busy
                ? 'Placing order…'
                : `Place ${s.demo ? 'demo ' : ''}order · ${money(subtotal + DELIVERY_FEE)}`}
              <ArrowRight size={17} />
            </button>
            <p className="small muted">
              By ordering, you agree to our{' '}
              <Link href="/policies">order and cancellation policies</Link>.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
export function OrderHistory() {
  const s = useStore();
  return (
    <Gate role="customer">
      <div className="page">
        <PageTitle
          eyebrow="YOUR TABLE, YOUR FAVOURITES"
          title="My orders"
          description="Follow your next meal or look back at a good one."
        />
        {s.orders.filter((o) => o.customer_id === s.profile?.id).length ? (
          <div className="history-grid">
            {s.orders
              .filter((o) => o.customer_id === s.profile?.id)
              .map((o) => (
                <Link className="panel history-card" href={`/orders/${o.id}`} key={o.id}>
                  <div className="section-heading">
                    <span className={`pill ${isActive(o) ? 'green' : 'neutral'}`}>
                      {labels[o.status]}
                    </span>
                    <span className="small muted">#{o.id.slice(0, 8)}</span>
                  </div>
                  <h2>{s.restaurants.find((r) => r.id === o.restaurant_id)?.name || 'Kitchen'}</h2>
                  <p className="muted">
                    {o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
                  </p>
                  <div className="card-bottom">
                    <span>{new Date(o.created_at).toLocaleString('en-IN')}</span>
                    <strong>
                      {money(o.total)} <ArrowRight size={17} />
                    </strong>
                  </div>
                </Link>
              ))}
          </div>
        ) : (
          <>
            <Empty
              title="Your first favourite is out there"
              description="Your orders will appear here once you’ve found your next meal."
            />
            <Link className="button center" href="/">
              Discover kitchens
            </Link>
          </>
        )}
      </div>
    </Gate>
  );
}
export function OrderTracking({ id }: { id: string }) {
  const s = useStore(),
    [riderPoint, setRiderPoint] = useState<MapMarker | null>(null);
  const order = s.orders.find((o) => o.id === id);
  useEffect(() => {
    if (
      !supabase ||
      !order?.rider_id ||
      !order.status ||
      ['delivered', 'cancelled', 'rejected'].includes(order.status)
    ) {
      setRiderPoint(null);
      return;
    }
    let stopped = false;
    const riderId = order.rider_id;
    const read = async () => {
      const { data } = await supabase!
        .from('rider_locations')
        .select('lat,lng,updated_at')
        .eq('rider_id', riderId)
        .maybeSingle();
      if (!stopped)
        setRiderPoint(
          data && Date.now() - Date.parse(data.updated_at) < 300000
            ? { lat: data.lat, lng: data.lng, label: 'Rider location', color: '#d77824' }
            : null,
        );
    };
    void read();
    const timer = setInterval(() => void read(), 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [order?.rider_id, order?.status]);
  if (s.loading) return <Loading />;
  if (!order)
    return (
      <div className="page">
        <Back href="/orders">My orders</Back>
        <Empty
          title="Order not found"
          description="Sign in to the account that placed this order."
        />
      </div>
    );
  const r = s.restaurants.find((r) => r.id === order.restaurant_id),
    cancelled = ['cancelled', 'rejected'].includes(order.status),
    step = timeline.indexOf(order.status);
  const demoRider = s.demo ? s.riders.find((r) => r.id === order.rider_id) : null;
  const markers: MapMarker[] = [
    { lat: order.lat, lng: order.lng, label: 'Your delivery address', color: '#db7b28' },
    ...(r ? [{ lat: r.lat, lng: r.lng, label: r.name }] : []),
    ...(riderPoint
      ? [riderPoint]
      : demoRider
        ? [{ lat: demoRider.lat, lng: demoRider.lng, label: 'Demo rider' }]
        : []),
  ];
  return (
    <div className="page">
      <Back href="/orders">My orders</Back>
      <PageTitle
        eyebrow={`ORDER #${order.id.slice(0, 8).toUpperCase()}`}
        title={
          cancelled
            ? 'This order has ended.'
            : order.status === 'delivered'
              ? 'A good meal, delivered.'
              : 'Your next good meal is on its way.'
        }
        description={`From ${r?.name || 'your kitchen'} · ${new Date(order.created_at).toLocaleString('en-IN')}`}
      />
      <div className="tracking-layout">
        <section className="panel">
          <div className="tracking-status">
            <span className="empty-icon">
              {order.status === 'delivered' ? <CheckCircle2 /> : <Clock3 />}
            </span>
            <div>
              <h2>{labels[order.status]}</h2>
              <p className="muted">
                {order.status === 'ready_for_pickup'
                  ? 'Your food is ready. We’re looking for an available rider.'
                  : order.status === 'rider_assigned' && !order.rider_accepted
                    ? 'Waiting for your rider to accept the pickup.'
                    : order.status === 'picked_up'
                      ? 'Your rider has your food and is heading to your address.'
                      : cancelled
                        ? 'No payment has been collected.'
                        : order.status === 'delivered'
                          ? 'Thanks for ordering from your neighbourhood.'
                          : 'This page updates as your order moves forward.'}
              </p>
            </div>
          </div>
          {!cancelled && (
            <ol className="timeline">
              {timeline.map((status, i) => (
                <li className={i <= step ? 'completed' : ''} key={status}>
                  <span>{i < step ? <Check size={14} /> : i + 1}</span>
                  <div>
                    <strong>{labels[status]}</strong>
                    {i === step && <small>Current stage</small>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <DeliveryMap markers={markers} />
          <p className="small muted">
            Map shows location pins, not a calculated route. Rider location appears while a delivery
            is active and location sharing is fresh.
          </p>
          {s.demo && (
            <div className="hint">
              Try the full journey: switch to Restaurant to prepare this order, then Rider to
              deliver it. <Link href="/restaurant">Open kitchen →</Link>
            </div>
          )}
        </section>
        <aside>
          <div className="panel">
            <h2>Order details</h2>
            {order.items.map((i, index) => (
              <div className="basket-line" key={index}>
                <span>
                  {i.quantity} × {i.name}
                </span>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            <div className="bill-line">
              <span>Delivery</span>
              <span>{money(order.delivery_fee)}</span>
            </div>
            <div className="total-line">
              <strong>Cash {order.status === 'delivered' ? 'collected' : 'on delivery'}</strong>
              <strong>{money(order.total)}</strong>
            </div>
            <h3>
              <MapPin size={17} /> Delivery address
            </h3>
            <p>
              {order.customer_name}
              <br />
              {order.address}
            </p>
            <p className="small muted">
              <Phone size={14} /> {order.phone}
            </p>
            {order.notes && <p className="small">Note: {order.notes}</p>}
            {order.status === 'placed' && s.profile?.id === order.customer_id && (
              <AsyncButton
                className="button secondary full"
                action={() => s.transition(order.id, 'cancelled')}
              >
                Cancel order
              </AsyncButton>
            )}
            <p className="small muted">
              Cancellation is available until the kitchen accepts your order.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
