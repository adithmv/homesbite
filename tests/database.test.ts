import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
let db: PGlite;
const ids = {
  customer: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  owner: '00000000-0000-4000-8000-000000000003',
  otherOwner: '00000000-0000-4000-8000-000000000004',
  rider: '00000000-0000-4000-8000-000000000005',
  rider2: '00000000-0000-4000-8000-000000000006',
  admin: '00000000-0000-4000-8000-000000000007',
};
let kitchen: string, item: string;
async function root() {
  await db.exec('reset role');
}
async function user(id: string | null) {
  await root();
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)",
    [id || '', id ? 'authenticated' : 'anon'],
  );
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
}
async function rpc(name: string, args: unknown[] = []) {
  const out = await db.query<Record<string, unknown>>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`,
    args,
  );
  return out.rows[0]?.result;
}
const payload = () => ({
  restaurant_id: kitchen,
  items: [{ id: item, quantity: 2 }],
  customer_name: 'Customer',
  phone: '9876543210',
  address: '12 Church Street, Bengaluru',
  lat: 12.9716,
  lng: 77.5946,
  notes: '',
});
async function place() {
  await user(ids.customer);
  return (await rpc('place_order', [payload()])) as string;
}
async function ready(id: string) {
  await user(ids.owner);
  await rpc('transition_order', [id, 'restaurant_accepted']);
  await rpc('transition_order', [id, 'preparing']);
  await rpc('transition_order', [id, 'ready_for_pickup']);
}
async function rows(table: string) {
  return (await db.query<Record<string, unknown>>(`select * from public.${table}`)).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create publication supabase_realtime;`);
  // PGlite bundles gen_random_uuid but not pgcrypto. All application SQL is otherwise unchanged.
  const migration = readFileSync(
    new URL('../supabase/migrations/001_homebite.sql', import.meta.url),
    'utf8',
  ).replace('create extension if not exists pgcrypto;', '');
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await root();
  await db.exec('truncate auth.users cascade');
  for (const [key, id] of Object.entries(ids)) {
    const role =
      key === 'owner' || key === 'otherOwner'
        ? 'restaurant'
        : key.startsWith('rider')
          ? 'rider'
          : 'customer';
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      { name: key, phone: '9876543210', role, vehicle: 'Bike' },
    ]);
  }
  await db.query("update public.profiles set role='admin' where id=$1", [ids.admin]);
  await user(ids.owner);
  await rpc('save_restaurant', [
    {
      name: 'Test Kitchen',
      slug: 'test-kitchen',
      description: 'Fresh food',
      cuisine: 'Indian',
      address: '12 Church Street Bengaluru',
      hours: '10:00–22:00',
      image: '',
      lat: 12.975,
      lng: 77.601,
      eta: 30,
      open: true,
    },
  ]);
  kitchen = (await rows('restaurants'))[0].id as string;
  await rpc('save_menu_item', [
    {
      name: 'Thali',
      description: 'Lunch',
      category: 'Meals',
      price: 18900,
      veg: true,
      available: true,
      image: '',
    },
  ]);
  item = (await rows('menu_items'))[0].id as string;
  await user(ids.admin);
  await rpc('approve_partner', ['restaurant', kitchen, true]);
  await rpc('approve_partner', ['rider', ids.rider, true]);
  await rpc('approve_partner', ['rider', ids.rider2, true]);
  await user(ids.rider);
  await rpc('update_rider', [true, 12.973, 77.6]);
  await user(ids.rider2);
  await rpc('update_rider', [true, 12.98, 77.61]);
}, 15000);
afterAll(async () => {
  await db?.close();
});
describe('Production database order flow', () => {
  it('places, accepts, prepares, assigns the nearest rider, collects COD, and delivers', async () => {
    await user(ids.customer);
    const id = (await rpc('place_order', [
      { ...payload(), subtotal: 1, total: 1, delivery_fee: 0 },
    ])) as string;
    let order = (await rows('orders'))[0];
    expect(order.subtotal).toBe(37800);
    expect(order.total).toBe(41300);
    expect((await rows('order_items'))[0].price).toBe(18900);
    await ready(id);
    await user(ids.rider);
    order = (await rows('orders'))[0];
    expect(order.rider_id).toBe(ids.rider);
    expect(order.status).toBe('rider_assigned');
    await expect(rpc('transition_order', [id, 'picked_up'])).rejects.toThrow('not allowed');
    await rpc('respond_assignment', [id, true]);
    await rpc('transition_order', [id, 'picked_up']);
    await rpc('transition_order', [id, 'delivered']);
    await user(ids.customer);
    expect((await rows('orders'))[0].status).toBe('delivered');
    expect((await rows('order_events')).map((e) => e.status)).toEqual([
      'placed',
      'restaurant_accepted',
      'preparing',
      'ready_for_pickup',
      'rider_assigned',
      'picked_up',
      'delivered',
    ]);
    expect(await rows('rider_locations')).toHaveLength(0);
  });
  it('isolates customer, kitchen, rider and anonymous data and forbids direct mutations', async () => {
    const id = await place();
    for (const actor of [ids.other, ids.otherOwner, ids.rider2]) {
      await user(actor);
      expect(await rows('orders')).toHaveLength(0);
      expect(await rows('order_items')).toHaveLength(0);
      await expect(rpc('transition_order', [id, 'restaurant_accepted'])).rejects.toThrow(
        'not allowed',
      );
    }
    await user(ids.customer);
    await expect(db.query('update public.orders set total=1 where id=$1', [id])).rejects.toThrow(
      'permission denied',
    );
    await expect(
      db.query("update public.profiles set role='admin' where id=$1", [ids.customer]),
    ).rejects.toThrow('permission denied');
    await expect(rpc('approve_partner', ['rider', ids.customer, true])).rejects.toThrow(
      'Administrator',
    );
    await user(null);
    expect(await rows('restaurants')).toHaveLength(1);
    await expect(rows('orders')).rejects.toThrow('permission denied');
    await expect(rpc('place_order', [payload()])).rejects.toThrow('permission denied');
  });
  it('only allows cancellation before acceptance', async () => {
    const id = await place();
    await user(ids.other);
    await expect(rpc('transition_order', [id, 'cancelled'])).rejects.toThrow();
    await user(ids.customer);
    await rpc('transition_order', [id, 'cancelled']);
    expect((await rows('orders'))[0].status).toBe('cancelled');
    await user(ids.owner);
    await expect(rpc('transition_order', [id, 'restaurant_accepted'])).rejects.toThrow();
  });
  it('rejects late cancellation and skip-ahead kitchen transitions', async () => {
    const id = await place();
    await user(ids.owner);
    await expect(rpc('transition_order', [id, 'delivered'])).rejects.toThrow();
    await rpc('transition_order', [id, 'restaurant_accepted']);
    await user(ids.customer);
    await expect(rpc('transition_order', [id, 'cancelled'])).rejects.toThrow();
  });
  it('reassigns declined offers and never lets the previous rider accept', async () => {
    const id = await place();
    await ready(id);
    await user(ids.rider);
    await rpc('respond_assignment', [id, false]);
    expect(await rows('orders')).toHaveLength(0);
    await expect(rpc('respond_assignment', [id, true])).rejects.toThrow();
    await user(ids.rider2);
    expect((await rows('orders'))[0].rider_id).toBe(ids.rider2);
  });
  it('reassigns timed-out offers and rejects late acceptance', async () => {
    const id = await place();
    await ready(id);
    await root();
    await db.query("update public.orders set assigned_at=now()-interval '61 seconds' where id=$1", [
      id,
    ]);
    await user(ids.rider);
    await expect(rpc('respond_assignment', [id, true])).rejects.toThrow('expired');
    await rpc('dispatch_orders');
    expect(await rows('orders')).toHaveLength(0);
    await user(ids.rider2);
    expect((await rows('orders'))[0].rider_id).toBe(ids.rider2);
  });
  it('keeps orders waiting when no riders are available, then matches when one goes online', async () => {
    await user(ids.rider);
    await rpc('update_rider', [false, null, null]);
    await user(ids.rider2);
    await rpc('update_rider', [false, null, null]);
    const id = await place();
    await ready(id);
    await user(ids.customer);
    expect((await rows('orders'))[0].status).toBe('ready_for_pickup');
    await user(ids.rider);
    await rpc('update_rider', [true, 12.973, 77.6]);
    expect((await rows('orders'))[0].status).toBe('rider_assigned');
  });
  it('does not give a busy rider a second order', async () => {
    const first = await place();
    await ready(first);
    await user(ids.other);
    const second = (await rpc('place_order', [payload()])) as string;
    await ready(second);
    await user(ids.admin);
    const orders = await rows('orders');
    expect(orders).toHaveLength(2);
    expect(new Set(orders.map((o) => o.rider_id)).size).toBe(2);
  });
  it('rejects invalid, repeated, unavailable and out-of-zone cart data', async () => {
    await user(ids.customer);
    for (const bad of [
      { ...payload(), items: [] },
      { ...payload(), items: [{ id: item, quantity: -1 }] },
      { ...payload(), items: [{ id: item, quantity: 1.2 }] },
      {
        ...payload(),
        items: [
          { id: item, quantity: 1 },
          { id: item, quantity: 1 },
        ],
      },
      { ...payload(), phone: '123' },
      { ...payload(), lat: 28.6, lng: 77.2 },
      { ...payload(), lat: null },
    ])
      await expect(rpc('place_order', [bad])).rejects.toThrow();
    await user(ids.owner);
    await rpc('save_menu_item', [
      { id: item, name: 'Thali', price: 18900, category: 'Meals', available: false },
    ]);
    await user(ids.customer);
    await expect(rpc('place_order', [payload()])).rejects.toThrow('unavailable');
  });
  it('does not let signup metadata create an administrator', async () => {
    await root();
    const id = '00000000-0000-4000-8000-000000000099';
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      { name: 'Attacker', phone: '9876543210', role: 'admin' },
    ]);
    await user(id);
    expect((await rows('profiles'))[0].role).toBe('customer');
    await expect(db.query('select private.dispatch()')).rejects.toThrow('permission denied');
  });
  it('shares rider location only with the active assigned customer', async () => {
    const id = await place();
    await ready(id);
    await user(ids.customer);
    expect((await rows('rider_locations')).map((r) => r.rider_id)).toEqual([ids.rider]);
    await user(ids.other);
    expect(await rows('rider_locations')).toHaveLength(0);
    await user(ids.otherOwner);
    expect(await rows('rider_locations')).toHaveLength(0);
  });
});
