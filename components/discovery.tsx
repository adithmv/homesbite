'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  Leaf,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Utensils,
  X,
} from 'lucide-react';
import { useStore } from './store';
import { Back, Empty, Loading } from './ui';
import { money } from '@/lib/domain';
import { FOOD_IMAGE } from '@/lib/demo';

export function Discover() {
  const s = useStore();
  const [query, setQuery] = useState(''),
    [cuisine, setCuisine] = useState('All kitchens'),
    [veg, setVeg] = useState(false),
    [sort, setSort] = useState('recommended');
  const categories = [
    'All kitchens',
    ...new Set(s.restaurants.filter((r) => r.approved).map((r) => r.cuisine)),
  ];
  const restaurants = useMemo(
    () =>
      s.restaurants
        .filter(
          (r) =>
            r.approved &&
            (cuisine === 'All kitchens' || r.cuisine === cuisine) &&
            (!veg || s.menu.some((m) => m.restaurant_id === r.id && m.veg && m.available)) &&
            `${r.name} ${r.cuisine} ${s.menu
              .filter((m) => m.restaurant_id === r.id)
              .map((m) => m.name)
              .join(' ')}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => (sort === 'fastest' ? a.eta - b.eta : Number(b.open) - Number(a.open))),
    [s.restaurants, s.menu, cuisine, veg, query, sort],
  );
  if (s.loading) return <Loading />;
  return (
    <div className="page discover-page">
      <section className="hero">
        <div className="hero-content">
          <span className="pill light">
            <span className="live-dot" /> FROM YOUR NEIGHBOURHOOD
          </span>
          <h1>
            A little closer.
            <br />A lot more <em>homely.</em>
          </h1>
          <p>
            Your favourite local kitchens. Freshly made meals.
            <br className="desktop-only" /> Delivered with a little extra care.
          </p>
          <a className="button orange" href="#kitchens">
            Find your next favourite <ArrowRight size={18} />
          </a>
          <div className="hero-proof">
            <span>
              <Leaf size={15} /> Local kitchens
            </span>
            <span>
              <ShieldCheck size={15} /> Pay on delivery
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            src={FOOD_IMAGE}
            alt="A freshly prepared Indian thali with roti and vegetable dishes"
          />
          <div className="photo-label">
            <span className="photo-icon">
              <Utensils size={22} />
            </span>
            <div>
              <strong>Comfort, served fresh.</strong>
              <small>Good food starts close to home.</small>
            </div>
          </div>
        </div>
      </section>
      <div className="discovery-heading" id="kitchens">
        <div>
          <p className="eyebrow">GOOD FOOD, CLOSE BY</p>
          <h2>What are you craving?</h2>
        </div>
        <span className="location-note">
          <MapPin size={16} /> Bengaluru · 12 km pilot area
        </span>
      </div>
      <div className="search-row">
        <div className="search-box">
          <Search size={21} />
          <input
            aria-label="Search kitchens or dishes"
            placeholder="Search for a kitchen, dish, or a little inspiration"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={17} />
            </button>
          )}
        </div>
        <label className="sort-select">
          <SlidersHorizontal size={17} />
          <select aria-label="Sort kitchens" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recommended">Open first</option>
            <option value="fastest">Fastest delivery</option>
          </select>
        </label>
      </div>
      <div className="filter-row">
        <div className="chips">
          {categories.map((c, i) => (
            <button
              key={c}
              className={`chip ${cuisine === c ? 'selected' : ''}`}
              onClick={() => setCuisine(c)}
            >
              {i === 0 && <Utensils size={15} />} {c}
            </button>
          ))}
        </div>
        <label className="veg-filter">
          <input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} />
          <Leaf size={16} /> Veg options
        </label>
      </div>
      <div className="section-heading">
        <h2>
          Kitchens you’ll feel at home with <span className="count">{restaurants.length}</span>
        </h2>
        <span className="muted">Made fresh. Worth the wait.</span>
      </div>
      {restaurants.length ? (
        <div className="restaurant-grid">
          {restaurants.map((r, index) => (
            <Link href={`/r/${r.slug}`} className="restaurant-card" key={r.id}>
              <div className={`restaurant-image image-${index % 3}`}>
                <img src={r.image || FOOD_IMAGE} alt={`${r.name} food`} loading="lazy" />
                <span className="image-badge">
                  {r.open ? 'NEIGHBOURHOOD FAVOURITE' : 'CURRENTLY CLOSED'}
                </span>
                <span className="eta-badge">
                  <Clock3 size={13} />
                  {r.eta}–{r.eta + 10} min
                </span>
              </div>
              <div className="restaurant-info">
                <div className="card-title">
                  <h3>{r.name}</h3>
                  <span className="rating">{r.rating ? `★ ${r.rating}` : 'New'}</span>
                </div>
                <p>{r.cuisine} · Freshly prepared</p>
                <div className="card-bottom">
                  <span>
                    <MapPin size={14} />
                    {r.address.split(',')[0]}
                  </span>
                  <strong>
                    ₹35 delivery <ArrowRight size={15} />
                  </strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No kitchens found"
          description={
            s.demo
              ? 'Try another dish or clear your filters.'
              : 'Try another search. New partner kitchens appear after approval.'
          }
        />
      )}
      <div className="promise-strip">
        <div>
          <span className="promise-icon">
            <ChefIcon />
          </span>
          <div>
            <h3>Local kitchens. Real people.</h3>
            <p>Order directly from the places that make your neighbourhood.</p>
          </div>
        </div>
        <div>
          <span className="promise-icon">
            <ShieldCheck />
          </span>
          <div>
            <h3>One clear total.</h3>
            <p>Food + ₹35 delivery. Pay when your meal arrives.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function ChefIcon() {
  return <Utensils size={24} />;
}
export function RestaurantMenu({ slug }: { slug: string }) {
  const s = useStore(),
    [category, setCategory] = useState('All'),
    [veg, setVeg] = useState(false);
  if (s.loading) return <Loading />;
  const r = s.restaurants.find((r) => r.slug === slug && r.approved);
  if (!r)
    return (
      <div className="page">
        <Back />
        <Empty
          title="This kitchen isn’t available"
          description="Explore another neighbourhood favourite."
        />
      </div>
    );
  const items = s.menu.filter((m) => m.restaurant_id === r.id);
  const shown = items.filter(
    (m) => (category === 'All' || m.category === category) && (!veg || m.veg),
  );
  const subtotal = s.cart.reduce(
    (sum, l) => sum + (s.menu.find((m) => m.id === l.id)?.price || 0) * l.quantity,
    0,
  );
  return (
    <div className="page">
      <Back />
      <section className="kitchen-hero">
        <div>
          <p className="eyebrow">YOUR NEIGHBOURHOOD KITCHEN</p>
          <h1>{r.name}</h1>
          <p>{r.description}</p>
          <div className="kitchen-meta">
            <span>
              <Utensils size={16} />
              {r.cuisine}
            </span>
            <span>
              <Clock3 size={16} />
              {r.eta}–{r.eta + 10} min
            </span>
            <span>₹35 delivery</span>
          </div>
          <p className="small muted">
            <MapPin size={14} /> {r.address} · Hours: {r.hours}
          </p>
          <span className={`pill ${r.open ? 'green' : 'neutral'}`}>
            {r.open ? 'Taking orders now' : 'Kitchen is closed'}
          </span>
        </div>
        <img src={r.image || FOOD_IMAGE} alt={`Food from ${r.name}`} />
      </section>
      <div className="menu-layout">
        <section>
          <div className="filter-row">
            <div className="chips">
              {['All', ...new Set(items.map((m) => m.category))].map((c) => (
                <button
                  className={`chip ${category === c ? 'selected' : ''}`}
                  key={c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className="veg-filter">
              <input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} />
              Veg only
            </label>
          </div>
          <h2>{category === 'All' ? 'On the menu' : category}</h2>
          {shown.length ? (
            shown.map((m) => (
              <article className="menu-item" key={m.id}>
                <div className="menu-item-content">
                  <span
                    className={`food-dot ${m.veg ? '' : 'nonveg'}`}
                    aria-label={m.veg ? 'Vegetarian' : 'Non-vegetarian'}
                  >
                    ●
                  </span>
                  <h3>{m.name}</h3>
                  <strong>{money(m.price)}</strong>
                  <p>{m.description}</p>
                  {!m.available && <span className="pill neutral">Sold out for now</span>}
                </div>
                <div className="menu-item-side">
                  {m.image && <img src={m.image} alt={m.name} loading="lazy" />}
                  {s.cart.some((l) => l.id === m.id) ? (
                    <Quantity id={m.id} />
                  ) : (
                    <button
                      className="add-button"
                      disabled={!m.available || !r.open}
                      onClick={() => s.addItem(m.id)}
                    >
                      ADD <span>+</span>
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty title="Nothing here just yet" description="Try another menu category." />
          )}
        </section>
        <aside className="basket-preview panel">
          <span className="eyebrow">YOUR BASKET</span>
          <h2>A good meal starts here.</h2>
          {s.cart.length ? (
            <>
              {s.cart.map((l) => (
                <div className="basket-line" key={l.id}>
                  <span>
                    {l.quantity} × {s.menu.find((m) => m.id === l.id)?.name || 'Unavailable item'}
                  </span>
                  <strong>
                    {money((s.menu.find((m) => m.id === l.id)?.price || 0) * l.quantity)}
                  </strong>
                </div>
              ))}
              <div className="total-line">
                <span>Food subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <p className="small muted">₹35 delivery added at checkout</p>
              <Link className="button full" href="/checkout">
                Continue to checkout
                <ArrowRight size={17} />
              </Link>
            </>
          ) : (
            <>
              <p className="muted">Add something delicious from the menu.</p>
              <div className="basket-doodle">
                <Utensils size={48} />
              </div>
            </>
          )}
          <p className="small basket-note">
            <ShieldCheck size={15} /> Cash on delivery. No upfront payment.
          </p>
        </aside>
      </div>
    </div>
  );
}
export function Quantity({ id }: { id: string }) {
  const s = useStore();
  const q = s.cart.find((l) => l.id === id)?.quantity || 0;
  return (
    <div className="quantity">
      <button
        aria-label={`Remove one ${s.menu.find((m) => m.id === id)?.name}`}
        onClick={() => s.changeQuantity(id, -1)}
      >
        −
      </button>
      <span>{q}</span>
      <button
        disabled={q >= 20}
        aria-label={`Add one ${s.menu.find((m) => m.id === id)?.name}`}
        onClick={() => s.changeQuantity(id, 1)}
      >
        +
      </button>
    </div>
  );
}
