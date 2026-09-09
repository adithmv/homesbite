'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AppData,
  ServiceArea,
  DEFAULT_SERVICE_AREA,
  validateServiceArea,
  inServiceArea,
  CartLine,
  Checkout,
  MenuItem,
  Order,
  Restaurant,
  Role,
  Status,
  DELIVERY_FEE,
  canTransition,
  nearestRider,
  validateCheckout,
} from '@/lib/domain';
import { demoData } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

type Store = AppData & {
  demo: boolean;
  loading: boolean;
  cart: CartLine[];
  error: string;
  notice: string;
  clearMessage: () => void;
  notify: (text: string) => void;
  refresh: () => Promise<void>;
  switchRole: (role: Role) => void;
  resetDemo: () => void;
  addItem: (id: string) => void;
  changeQuantity: (id: string, delta: number) => void;
  checkout: (input: Omit<Checkout, 'items'>) => Promise<string>;
  transition: (id: string, status: Status) => Promise<void>;
  respondToAssignment: (id: string, accept: boolean) => Promise<void>;
  saveRestaurant: (restaurant: Partial<Restaurant>) => Promise<void>;
  saveMenuItem: (item: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (id: string) => Promise<void>;
  setOnline: (online: boolean, point?: { lat: number; lng: number }) => Promise<void>;
  approve: (kind: 'restaurant' | 'rider', id: string, approved: boolean) => Promise<void>;
  dispatch: () => Promise<void>;
  saveServiceArea: (area: ServiceArea) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<Store | null>(null);
const DATA_KEY = 'homebite-demo-v1';
const CART_KEY = supabase ? 'homebite-live-cart-v1' : 'homebite-demo-cart-v1';
const empty: AppData = {
  serviceArea: DEFAULT_SERVICE_AREA,
  profile: null,
  restaurants: [],
  menu: [],
  riders: [],
  orders: [],
};
const uid = () => crypto.randomUUID();

function assign(data: AppData): AppData {
  const now = Date.now();
  const orders = data.orders.map((o) => {
    if (
      o.status === 'rider_assigned' &&
      !o.rider_accepted &&
      o.assigned_at &&
      now - Date.parse(o.assigned_at) >= 60000
    ) {
      return {
        ...o,
        status: 'ready_for_pickup' as Status,
        declined_rider_ids: [...o.declined_rider_ids, o.rider_id!],
        rider_id: null,
        assigned_at: null,
      };
    }
    return { ...o };
  });
  for (const order of orders.filter((o) => o.status === 'ready_for_pickup')) {
    const restaurant = data.restaurants.find((r) => r.id === order.restaurant_id);
    if (!restaurant) continue;
    const rider = nearestRider(
      restaurant,
      data.riders,
      orders,
      order.declined_rider_ids,
      now,
      data.serviceArea.radius_km,
    );
    if (rider)
      Object.assign(order, {
        status: 'rider_assigned',
        rider_id: rider.id,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rider_accepted: false,
      });
  }
  return { ...data, orders };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = !supabase;
  const [data, setData] = useState<AppData>(empty);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lastOrderIds = useRef<Set<string> | null>(null);
  const dataRef = useRef(data);
  const refreshGeneration = useRef(0);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const commit = useCallback(
    (next: AppData) => {
      next = { ...next, serviceArea: next.serviceArea || { ...DEFAULT_SERVICE_AREA } };
      dataRef.current = next;
      setData(next);
      if (demo) localStorage.setItem(DATA_KEY, JSON.stringify(next));
    },
    [demo],
  );
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const generation = ++refreshGeneration.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const results = await Promise.all([
        user
          ? supabase.from('profiles').select('*').eq('id', user.id).single()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('restaurants').select('*').order('name'),
        supabase.from('menu_items').select('*').order('name'),
        user ? supabase.from('riders').select('*') : Promise.resolve({ data: [], error: null }),
        user
          ? supabase
              .from('orders')
              .select('*,items:order_items(menu_item_id,name,quantity,price)')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('service_area').select('name,lat,lng,radius_km').eq('id', 1).single(),
      ]);
      if (generation !== refreshGeneration.current) return;
      // During a rolling upgrade, an unmigrated database still enforces the original area.
      const areaMigrationPending = ['PGRST205', '42P01'].includes(results[5].error?.code || '');
      const failed = results.find((r, index) => r.error && !(index === 5 && areaMigrationPending));
      if (failed?.error) {
        setError(
          results[5].error
            ? 'Service area settings are unavailable. Run the 002_service_area.sql update in Supabase, then refresh.'
            : failed.error.message,
        );
        setLoading(false);
        return;
      }
      const next = {
        serviceArea: areaMigrationPending ? { ...DEFAULT_SERVICE_AREA } : results[5].data,
        profile: results[0].data,
        restaurants: results[1].data ?? [],
        menu: results[2].data ?? [],
        riders: results[3].data ?? [],
        orders: results[4].data ?? [],
      } as AppData;
      commit(next);
      setLoading(false);
    } catch (error) {
      if (generation === refreshGeneration.current) {
        setError(error instanceof Error ? error.message : 'Unable to connect. Please try again.');
        setLoading(false);
      }
    }
  }, [commit]);
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'));
    } catch {
      localStorage.removeItem(CART_KEY);
    }
    if (demo) {
      try {
        commit(JSON.parse(localStorage.getItem(DATA_KEY) || 'null') || demoData());
      } catch {
        commit(demoData());
      }
      setLoading(false);
      const sync = (e: StorageEvent) => {
        if (e.key === DATA_KEY && e.newValue) {
          try {
            const incoming = JSON.parse(e.newValue);
            setData({
              ...incoming,
              serviceArea: incoming.serviceArea || { ...DEFAULT_SERVICE_AREA },
            });
          } catch {
            /* ignore corrupt storage */
          }
        }
      };
      window.addEventListener('storage', sync);
      return () => window.removeEventListener('storage', sync);
    }
    void refresh();
    const { data: auth } = supabase!.auth.onAuthStateChange((event, session) => {
      if (
        event === 'SIGNED_OUT' ||
        (event === 'SIGNED_IN' && dataRef.current.profile?.id !== session?.user.id)
      ) {
        ++refreshGeneration.current;
        commit(empty);
        lastOrderIds.current = null;
      }
      setTimeout(() => void refresh(), 0);
    });
    const channel = supabase!
      .channel('homebite-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => void refresh())
      .subscribe();
    const poll = setInterval(() => void refresh(), 15000);
    return () => {
      auth.subscription.unsubscribe();
      void supabase!.removeChannel(channel);
      clearInterval(poll);
    };
  }, [demo, commit, refresh]);
  useEffect(() => {
    if (loading) return;
    const ids = new Set(data.orders.map((o) => o.id));
    if (
      lastOrderIds.current &&
      data.profile?.role === 'restaurant' &&
      data.orders.some((o) => !lastOrderIds.current!.has(o.id) && o.status === 'placed')
    )
      setNotice('A new order has arrived in your kitchen.');
    lastOrderIds.current = ids;
  }, [data.orders, data.profile, loading]);
  useEffect(() => {
    if (!demo || loading) return;
    const timer = setInterval(() => {
      const current = dataRef.current;
      const next = assign(current);
      if (JSON.stringify(next) !== JSON.stringify(current)) commit(next);
    }, 10000);
    return () => clearInterval(timer);
  }, [demo, loading, commit]);
  const writeCart = (next: CartLine[]) => {
    setCart(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  };
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await supabase!.rpc(name, args);
    if (result.error) throw new Error(result.error.message);
    await refresh();
    return result.data;
  }
  const store: Store = {
    ...data,
    demo,
    loading,
    cart,
    error,
    notice,
    refresh,
    clearMessage: () => {
      setError('');
      setNotice('');
    },
    notify: setNotice,
    switchRole(role) {
      if (!demo) return;
      const names = {
        customer: 'Alex',
        restaurant: 'Kitchen owner',
        rider: 'Sam',
        admin: 'Platform admin',
      };
      commit({
        ...dataRef.current,
        profile: { id: `${role}-demo`, role, name: names[role], phone: '9876543210' },
      });
    },
    resetDemo() {
      if (demo) {
        commit(demoData());
        writeCart([]);
        setNotice('Demo has been reset.');
      }
    },
    addItem(id) {
      const item = data.menu.find((m) => m.id === id);
      if (!item?.available) return;
      const other = cart.find(
        (line) => data.menu.find((m) => m.id === line.id)?.restaurant_id !== item.restaurant_id,
      );
      if (other) {
        setError(
          'Your basket contains another kitchen’s food. Empty it before starting a new order.',
        );
        return;
      }
      const found = cart.find((l) => l.id === id);
      if (found && found.quantity >= 20) return;
      writeCart(
        found
          ? cart.map((l) => (l.id === id ? { ...l, quantity: l.quantity + 1 } : l))
          : [...cart, { id, quantity: 1 }],
      );
    },
    changeQuantity(id, delta) {
      writeCart(
        cart
          .map((l) => (l.id === id ? { ...l, quantity: Math.min(20, l.quantity + delta) } : l))
          .filter((l) => l.quantity > 0),
      );
    },
    async checkout(input) {
      const profile = dataRef.current.profile;
      if (profile?.role !== 'customer')
        throw new Error('Sign in as a customer to place your order.');
      const restaurant = data.restaurants.find((r) => r.id === input.restaurant_id);
      if (!restaurant) throw new Error('Kitchen not found.');
      const items = validateCheckout(
        { ...input, items: cart },
        restaurant,
        data.menu,
        data.serviceArea,
      );
      let id: string;
      if (!demo) id = await rpc('place_order', { payload: { ...input, items: cart } });
      else {
        id = uid();
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const now = new Date().toISOString();
        const order: Order = {
          ...input,
          id,
          customer_id: profile.id,
          items,
          status: 'placed',
          subtotal,
          delivery_fee: DELIVERY_FEE,
          total: subtotal + DELIVERY_FEE,
          rider_id: null,
          created_at: now,
          updated_at: now,
          assigned_at: null,
          rider_accepted: false,
          declined_rider_ids: [],
        };
        commit({ ...dataRef.current, orders: [order, ...dataRef.current.orders] });
      }
      writeCart([]);
      return id;
    },
    async transition(id, status) {
      if (!demo) {
        await rpc('transition_order', { order_id: id, next_status: status });
        return;
      }
      const current = dataRef.current;
      const order = current.orders.find((o) => o.id === id);
      if (
        !order ||
        !current.profile ||
        !canTransition(
          order,
          status,
          current.profile,
          current.restaurants.find((r) => r.id === order.restaurant_id),
        )
      )
        throw new Error('That order action is not allowed.');
      commit(
        assign({
          ...current,
          orders: current.orders.map((o) =>
            o.id === id ? { ...o, status, updated_at: new Date().toISOString() } : o,
          ),
        }),
      );
    },
    async respondToAssignment(id, accept) {
      if (!demo) {
        await rpc('respond_assignment', { order_id: id, accepted: accept });
        return;
      }
      const current = dataRef.current,
        order = current.orders.find((o) => o.id === id);
      if (
        !order ||
        current.profile?.role !== 'rider' ||
        order.rider_id !== current.profile.id ||
        order.status !== 'rider_assigned' ||
        order.rider_accepted
      )
        throw new Error('This assignment is no longer available.');
      if (!order.assigned_at || Date.now() - Date.parse(order.assigned_at) >= 60000)
        throw new Error('This assignment has expired.');
      commit(
        assign({
          ...current,
          orders: current.orders.map((o) =>
            o.id !== id
              ? o
              : accept
                ? { ...o, rider_accepted: true }
                : {
                    ...o,
                    status: 'ready_for_pickup',
                    rider_id: null,
                    assigned_at: null,
                    declined_rider_ids: [...o.declined_rider_ids, current.profile!.id],
                  },
          ),
        }),
      );
    },
    async saveRestaurant(values) {
      if (!demo) {
        await rpc('save_restaurant', { payload: values });
        return;
      }
      if (data.profile?.role !== 'restaurant') throw new Error('Restaurant account required.');
      if (!inServiceArea(values as Restaurant, data.serviceArea))
        throw new Error('Kitchen must be inside the configured service area.');
      commit({
        ...data,
        restaurants: data.restaurants.map((r) =>
          r.owner_id === data.profile!.id
            ? { ...r, ...values, id: r.id, owner_id: r.owner_id, approved: r.approved }
            : r,
        ),
      });
    },
    async saveMenuItem(values) {
      if (!demo) {
        await rpc('save_menu_item', { payload: values });
        return;
      }
      const restaurant = data.restaurants.find((r) => r.owner_id === data.profile?.id);
      if (!restaurant) throw new Error('Set up your kitchen first.');
      const item = { ...values, id: values.id || uid(), restaurant_id: restaurant.id } as MenuItem;
      commit({
        ...data,
        menu: data.menu.some((m) => m.id === item.id)
          ? data.menu.map((m) => (m.id === item.id ? item : m))
          : [...data.menu, item],
      });
    },
    async deleteMenuItem(id) {
      if (!demo) {
        await rpc('delete_menu_item', { item_id: id });
        return;
      }
      const item = data.menu.find((m) => m.id === id),
        restaurant = data.restaurants.find((r) => r.id === item?.restaurant_id);
      if (restaurant?.owner_id !== data.profile?.id) throw new Error('Not allowed.');
      commit({ ...data, menu: data.menu.filter((m) => m.id !== id) });
    },
    async setOnline(online, point) {
      if (!demo) {
        await rpc('update_rider', {
          is_online: online,
          latitude: point?.lat ?? null,
          longitude: point?.lng ?? null,
        });
        return;
      }
      if (dataRef.current.profile?.role !== 'rider') throw new Error('Rider account required.');
      const current = dataRef.current;
      commit(
        assign({
          ...current,
          riders: current.riders.map((r) =>
            r.id === current.profile?.id
              ? { ...r, online, ...point, location_updated_at: new Date().toISOString() }
              : r,
          ),
        }),
      );
    },
    async approve(kind, id, approved) {
      if (!demo) {
        await rpc('approve_partner', { partner_kind: kind, partner_id: id, is_approved: approved });
        return;
      }
      if (data.profile?.role !== 'admin') throw new Error('Administrator access required.');
      commit(
        kind === 'restaurant'
          ? {
              ...data,
              restaurants: data.restaurants.map((r) => (r.id === id ? { ...r, approved } : r)),
            }
          : { ...data, riders: data.riders.map((r) => (r.id === id ? { ...r, approved } : r)) },
      );
    },
    async saveServiceArea(area) {
      if (dataRef.current.profile?.role !== 'admin')
        throw new Error('Administrator access required.');
      validateServiceArea(area);
      const values = { ...area, name: area.name.trim() };
      if (!demo) {
        try {
          await rpc('save_service_area', { payload: values });
        } catch (error) {
          if (error instanceof Error && error.message.includes('save_service_area'))
            throw new Error(
              'Run 002_service_area.sql in your Supabase SQL Editor to enable this setting, then refresh.',
            );
          throw error;
        }
        return;
      }
      commit({ ...dataRef.current, serviceArea: values });
    },
    async dispatch() {
      if (!demo) {
        await rpc('dispatch_orders', {});
        return;
      }
      commit(assign(dataRef.current));
    },
    async signOut() {
      if (supabase) {
        await supabase.auth.signOut();
        writeCart([]);
        await refresh();
      }
    },
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider missing');
  return store;
}
