import { describe, expect, it } from 'vitest';
import {
  canTransition,
  distance,
  nearestRider,
  PILOT_CENTER,
  validateCheckout,
  type Order,
} from '../lib/domain';
import { demoData } from '../lib/demo';
const data = demoData();
const input = {
  restaurant_id: 'r1',
  items: [{ id: 'm1', quantity: 2 }],
  customer_name: 'Alex',
  phone: '9876543210',
  address: '12 Church Street Bengaluru',
  notes: '',
  ...PILOT_CENTER,
};
const baseOrder = {
  id: 'o1',
  customer_id: 'customer-demo',
  restaurant_id: 'r1',
  rider_id: 'rider-demo',
  status: 'placed',
  rider_accepted: false,
} as Order;
describe('Order rules', () => {
  it('calculates prices from the menu, ignoring forged client fields', () => {
    const lines = validateCheckout(
      { ...input, items: [{ id: 'm1', quantity: 2, price: 1 } as never] },
      data.restaurants[0],
      data.menu,
    );
    expect(lines[0].price).toBe(18900);
  });
  it.each([0, -1, 21, 1.5, NaN])('rejects quantity %s', (quantity) =>
    expect(() =>
      validateCheckout(
        { ...input, items: [{ id: 'm1', quantity }] },
        data.restaurants[0],
        data.menu,
      ),
    ).toThrow(),
  );
  it('rejects other kitchens and duplicate lines', () => {
    expect(() =>
      validateCheckout(
        { ...input, items: [{ id: 'm5', quantity: 1 }] },
        data.restaurants[0],
        data.menu,
      ),
    ).toThrow();
    expect(() =>
      validateCheckout(
        {
          ...input,
          items: [
            { id: 'm1', quantity: 1 },
            { id: 'm1', quantity: 1 },
          ],
        },
        data.restaurants[0],
        data.menu,
      ),
    ).toThrow();
  });
  it('rejects closed kitchens, invalid phones, and out-of-area coordinates', () => {
    expect(() =>
      validateCheckout(input, { ...data.restaurants[0], open: false }, data.menu),
    ).toThrow();
    expect(() =>
      validateCheckout({ ...input, phone: '111' }, data.restaurants[0], data.menu),
    ).toThrow();
    expect(() =>
      validateCheckout({ ...input, lat: 28.6, lng: 77.2 }, data.restaurants[0], data.menu),
    ).toThrow();
    expect(() =>
      validateCheckout({ ...input, lat: NaN }, data.restaurants[0], data.menu),
    ).toThrow();
  });
  it('enforces ownership and transition order', () => {
    const owner = {
      id: 'restaurant-demo',
      name: 'Owner',
      phone: '9876543210',
      role: 'restaurant' as const,
    };
    expect(canTransition(baseOrder, 'restaurant_accepted', owner, data.restaurants[0])).toBe(true);
    expect(canTransition(baseOrder, 'delivered', owner, data.restaurants[0])).toBe(false);
    expect(
      canTransition(
        baseOrder,
        'restaurant_accepted',
        { ...owner, id: 'other' },
        data.restaurants[0],
      ),
    ).toBe(false);
    expect(canTransition(baseOrder, 'cancelled', data.profile!)).toBe(true);
    expect(canTransition({ ...baseOrder, status: 'preparing' }, 'cancelled', data.profile!)).toBe(
      false,
    );
  });
  it('requires the assigned rider to accept before pickup', () => {
    const rider = { id: 'rider-demo', name: 'Sam', phone: '9876543211', role: 'rider' as const };
    expect(canTransition({ ...baseOrder, status: 'rider_assigned' }, 'picked_up', rider)).toBe(
      false,
    );
    expect(
      canTransition(
        { ...baseOrder, status: 'rider_assigned', rider_accepted: true },
        'picked_up',
        rider,
      ),
    ).toBe(true);
  });
});
describe('Nearest rider matching', () => {
  it('calculates haversine distance', () => {
    expect(distance(PILOT_CENTER, PILOT_CENTER)).toBe(0);
    expect(distance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.195, 2);
  });
  it('excludes offline, unapproved, stale, busy, and declined riders', () => {
    const now = Date.now(),
      base = { ...data.riders[0], location_updated_at: new Date(now).toISOString() };
    const riders = [
      { ...base, id: 'offline', online: false },
      { ...base, id: 'unapproved', approved: false },
      { ...base, id: 'stale', location_updated_at: new Date(now - 301000).toISOString() },
      { ...base, id: 'busy' },
      { ...base, id: 'declined' },
      { ...base, id: 'available', lat: 12.98 },
    ];
    expect(
      nearestRider(PILOT_CENTER, riders, [{ ...baseOrder, rider_id: 'busy' }], ['declined'], now)
        ?.id,
    ).toBe('available');
  });
  it('returns no match outside the matching radius', () => {
    expect(
      nearestRider(PILOT_CENTER, [{ ...data.riders[0], lat: 28.6, lng: 77.2 }], []),
    ).toBeUndefined();
  });
});
