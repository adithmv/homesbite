'use client';
import { FormEvent, useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock3,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { useStore } from './store';
import { AsyncButton, Empty, Gate, PageTitle } from './ui';
import {
  isActive,
  labels,
  MenuItem,
  money,
  Order,
  PILOT_CENTER,
  Restaurant,
  Status,
} from '@/lib/domain';
export function RestaurantDashboard() {
  return (
    <Gate role="restaurant">
      <KitchenWorkspace />
    </Gate>
  );
}
function KitchenWorkspace() {
  const s = useStore(),
    [tab, setTab] = useState('orders'),
    [editing, setEditing] = useState<Partial<MenuItem> | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const kitchen = s.restaurants.find((r) => r.owner_id === s.profile?.id);
  const orders = s.orders.filter((o) => o.restaurant_id === kitchen?.id),
    items = s.menu.filter((i) => i.restaurant_id === kitchen?.id);
  const delivered = orders.filter((o) => o.status === 'delivered');
  const today = orders.filter(
    (o) => new Date(o.created_at).toDateString() === new Date().toDateString(),
  );
  return (
    <div className="page dashboard-page">
      <PageTitle
        eyebrow="THE KITCHEN WORKSPACE"
        title={kitchen ? `Hello, ${kitchen.name}.` : 'Let’s set up your kitchen.'}
        description="A little care in the kitchen. A lot of happy neighbours."
      >
        {kitchen && (
          <AsyncButton
            className={`button ${kitchen.open ? 'secondary' : ''}`}
            action={() => s.saveRestaurant({ ...kitchen, open: !kitchen.open })}
          >
            <span className="live-dot" />
            {kitchen.open ? 'Kitchen open · Pause orders' : 'Open kitchen'}
          </AsyncButton>
        )}
      </PageTitle>
      {kitchen && !kitchen.approved && (
        <div className="hint">
          Your kitchen is awaiting platform approval. Complete your profile and menu while the admin
          reviews it.
        </div>
      )}
      <div className="stats">
        <Stat
          icon={<ClipboardList size={16} />}
          label="Orders today"
          value={String(today.length)}
        />
        <Stat
          icon={<ChefHat size={16} />}
          label="In your kitchen"
          value={String(
            orders.filter((o) => ['placed', 'restaurant_accepted', 'preparing'].includes(o.status))
              .length,
          )}
        />
        <Stat
          icon={<CheckCircle2 size={16} />}
          label="Delivered"
          value={String(delivered.length)}
        />
        <Stat
          icon={<Wallet size={16} />}
          label="Delivered food sales"
          value={money(delivered.reduce((n, o) => n + o.subtotal, 0))}
        />
      </div>
      <nav className="dashboard-tabs" aria-label="Kitchen sections">
        {[
          ['orders', 'Orders', ClipboardList],
          ['menu', 'Your menu', Utensils],
          ['profile', 'Kitchen profile', Settings],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Settings;
          return (
            <button
              key={id as string}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id as string)}
            >
              <I size={17} />
              {label as string}
            </button>
          );
        })}
      </nav>
      {!kitchen || tab === 'profile' ? (
        <KitchenForm kitchen={kitchen} />
      ) : tab === 'menu' ? (
        <>
          <div className="section-heading">
            <h2>
              Your menu <span className="count">{items.length}</span>
            </h2>
            <button
              className="button small"
              onClick={() =>
                setEditing({
                  name: '',
                  description: '',
                  category: 'Kitchen favourites',
                  price: 19900,
                  veg: true,
                  available: true,
                  image: '',
                })
              }
            >
              <Plus size={16} />
              Add dish
            </button>
          </div>
          {editing && (
            <MenuEditor key={editing.id || 'new'} item={editing} close={() => setEditing(null)} />
          )}
          <div className="management-list">
            {items.map((m) => (
              <div className="management-row" key={m.id}>
                <div>
                  <h3>
                    {m.name}{' '}
                    <span className={`food-dot inline-food ${m.veg ? '' : 'nonveg'}`}>●</span>
                  </h3>
                  <p>
                    {m.category} · {money(m.price)} · {m.available ? 'Available' : 'Sold out'}
                  </p>
                </div>
                <div className="row-actions">
                  <AsyncButton
                    className="button secondary small"
                    action={() => s.saveMenuItem({ ...m, available: !m.available })}
                  >
                    {m.available ? 'Mark sold out' : 'Make available'}
                  </AsyncButton>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => setEditing(m)}
                  >
                    <Pencil size={17} />
                  </button>
                  {deleting === m.id ? (
                    <div className="confirm-delete">
                      Delete?
                      <AsyncButton
                        className="button danger small"
                        action={async () => {
                          await s.deleteMenuItem(m.id);
                          setDeleting(null);
                        }}
                      >
                        Yes
                      </AsyncButton>
                      <button className="text-button" onClick={() => setDeleting(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label={`Delete ${m.name}`}
                      onClick={() => setDeleting(m.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!items.length && (
            <Empty
              title="Your menu starts here"
              description="Add your first dish, set its price, and let your neighbours discover it."
            />
          )}
        </>
      ) : (
        <>
          <div className="order-board">
            {[
              { title: 'New orders', statuses: ['placed'] },
              { title: 'In preparation', statuses: ['restaurant_accepted', 'preparing'] },
              {
                title: 'Ready & out for delivery',
                statuses: ['ready_for_pickup', 'rider_assigned', 'picked_up'],
              },
            ].map((col) => {
              const list = orders.filter((o) => col.statuses.includes(o.status));
              return (
                <section className="board-column" key={col.title}>
                  <h2>
                    {col.title}
                    <span>{list.length} orders</span>
                  </h2>
                  {list.length ? (
                    list.map((o) => <KitchenTicket order={o} key={o.id} />)
                  ) : (
                    <div className="board-empty">All caught up here.</div>
                  )}
                </section>
              );
            })}
          </div>
          <h2 className="past-title">Completed & closed</h2>
          <OrderTable orders={orders.filter((o) => !isActive(o))} />
        </>
      )}
    </div>
  );
}
export function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="stat">
      <small>
        {icon}
        {label}
      </small>
      <strong>{value}</strong>
    </div>
  );
}
function KitchenTicket({ order: o }: { order: Order }) {
  const s = useStore();
  const next: Partial<Record<Status, { status: Status; label: string }>> = {
    placed: { status: 'restaurant_accepted', label: 'Accept order' },
    restaurant_accepted: { status: 'preparing', label: 'Start preparing' },
    preparing: { status: 'ready_for_pickup', label: 'Ready for pickup' },
  };
  const action = next[o.status];
  return (
    <article className="order-ticket">
      <div>
        <strong>#{o.id.slice(0, 8)}</strong>
        <span className="small muted">
          <Clock3 size={13} />{' '}
          {new Date(o.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <span className="pill green">{labels[o.status]}</span>
      <h3>{o.customer_name}</h3>
      <ul>
        {o.items.map((i, index) => (
          <li key={index}>
            {i.quantity} × {i.name}
          </li>
        ))}
      </ul>
      {o.notes && <p className="small hint">{o.notes}</p>}
      <div className="bill-line">
        <span>Food value</span>
        <strong>{money(o.subtotal)}</strong>
      </div>
      <p className="small muted">Cash collected by rider</p>
      <div className="ticket-actions">
        {action && (
          <AsyncButton action={() => s.transition(o.id, action.status)}>{action.label}</AsyncButton>
        )}
        {o.status === 'placed' && (
          <AsyncButton className="button danger" action={() => s.transition(o.id, 'rejected')}>
            Decline
          </AsyncButton>
        )}
        {o.status === 'ready_for_pickup' && (
          <AsyncButton className="button secondary" action={() => s.dispatch()}>
            Retry rider matching
          </AsyncButton>
        )}
      </div>
    </article>
  );
}
function KitchenForm({ kitchen }: { kitchen?: Restaurant }) {
  const s = useStore(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await s.saveRestaurant({
        ...kitchen,
        name: String(f.get('name')),
        slug: String(f.get('slug')),
        description: String(f.get('description')),
        cuisine: String(f.get('cuisine')),
        address: String(f.get('address')),
        hours: String(f.get('hours')),
        image: String(f.get('image')),
        lat: Number(f.get('lat')),
        lng: Number(f.get('lng')),
        eta: Number(f.get('eta')),
        open: kitchen?.open || false,
      });
      s.notify('Kitchen profile saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel management-form" onSubmit={submit}>
      <h2>Make yourself at home.</h2>
      <p className="muted">Tell your neighbours who’s cooking.</p>
      <div className="form-grid">
        <label>
          Kitchen name
          <input name="name" defaultValue={kitchen?.name} required minLength={2} maxLength={100} />
        </label>
        <label>
          Page address
          <input
            name="slug"
            defaultValue={kitchen?.slug}
            placeholder="your-kitchen-name"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
          />
        </label>
        <label className="span-2">
          Description
          <textarea name="description" defaultValue={kitchen?.description} maxLength={1000} />
        </label>
        <label>
          Cuisine
          <input
            name="cuisine"
            defaultValue={kitchen?.cuisine || 'Indian'}
            required
            maxLength={60}
          />
        </label>
        <label>
          Opening hours
          <input
            name="hours"
            defaultValue={kitchen?.hours || '10:00–22:00'}
            required
            maxLength={100}
          />
        </label>
        <label className="span-2">
          Full kitchen address
          <textarea
            name="address"
            defaultValue={kitchen?.address}
            required
            minLength={10}
            maxLength={500}
          />
        </label>
        <label>
          Latitude
          <input
            type="number"
            name="lat"
            step="any"
            required
            min="-90"
            max="90"
            defaultValue={kitchen?.lat || PILOT_CENTER.lat}
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            name="lng"
            step="any"
            required
            min="-180"
            max="180"
            defaultValue={kitchen?.lng || PILOT_CENTER.lng}
          />
        </label>
        <label className="span-2">
          Banner image URL
          <input
            name="image"
            type={s.demo ? 'text' : 'url'}
            defaultValue={kitchen?.image}
            placeholder="https://…"
            maxLength={2048}
          />
        </label>
        <label>
          Estimated delivery time (minutes)
          <input
            name="eta"
            type="number"
            min={10}
            max={120}
            required
            defaultValue={kitchen?.eta || 30}
          />
        </label>
      </div>
      <p className="small muted">
        Hours are shown to customers. Use the kitchen open / pause button to control order
        acceptance each day.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'Saving…' : 'Save kitchen profile'}
      </button>
    </form>
  );
}
function MenuEditor({ item, close }: { item: Partial<MenuItem>; close: () => void }) {
  const s = useStore(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await s.saveMenuItem({
        ...item,
        name: String(f.get('name')),
        description: String(f.get('description')),
        category: String(f.get('category')),
        price: Math.round(Number(f.get('price')) * 100),
        image: String(f.get('image')),
        veg: f.get('veg') === 'on',
        available: f.get('available') === 'on',
      });
      close();
      s.notify('Menu updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save dish.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="editor" onSubmit={submit}>
      <div className="section-heading">
        <h2>{item.id ? 'Edit dish' : 'Add something delicious'}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label="Close dish editor"
        >
          <X />
        </button>
      </div>
      <div className="form-grid">
        <label>
          Dish name
          <input name="name" defaultValue={item.name} required minLength={2} maxLength={100} />
        </label>
        <label>
          Category
          <input name="category" defaultValue={item.category} required maxLength={80} />
        </label>
        <label className="span-2">
          Description
          <textarea name="description" defaultValue={item.description} maxLength={500} />
        </label>
        <label>
          Price (₹)
          <input
            name="price"
            type="number"
            min={1}
            max={10000}
            step="0.01"
            defaultValue={(item.price || 0) / 100}
            required
          />
        </label>
        <label>
          Photo URL
          <input
            name="image"
            type={s.demo ? 'text' : 'url'}
            defaultValue={item.image}
            placeholder="https://…"
            maxLength={2048}
          />
        </label>
      </div>
      <div className="chips">
        <label className="check-label">
          <input type="checkbox" name="veg" defaultChecked={item.veg} />
          Vegetarian
        </label>
        <label className="check-label">
          <input type="checkbox" name="available" defaultChecked={item.available} />
          Available to order
        </label>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'Saving…' : 'Save dish'}
      </button>
    </form>
  );
}
export function OrderTable({ orders }: { orders: Order[] }) {
  return orders.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Placed</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>#{o.id.slice(0, 8)}</td>
              <td>{o.customer_name}</td>
              <td>
                <span className="pill neutral">{labels[o.status]}</span>
              </td>
              <td>{money(o.total)}</td>
              <td>{new Date(o.created_at).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="board-empty">No orders to show yet.</div>
  );
}
