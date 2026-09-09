import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SERVICE_AREA,
  inServiceArea,
  validateServiceArea,
  validateCheckout,
} from '../lib/domain';
import { demoData } from '../lib/demo';
describe('Service-area rules', () => {
  it('validates boundaries and numeric input', () => {
    expect(inServiceArea(DEFAULT_SERVICE_AREA, DEFAULT_SERVICE_AREA)).toBe(true);
    expect(inServiceArea({ lat: NaN, lng: 0 }, DEFAULT_SERVICE_AREA)).toBe(false);
    for (const radius_km of [0, 101, Infinity, NaN])
      expect(() => validateServiceArea({ ...DEFAULT_SERVICE_AREA, radius_km })).toThrow();
  });
  it('uses the new area for both the kitchen and delivery pin', () => {
    const d = demoData(),
      area = { name: 'Kochi', lat: 9.9312, lng: 76.2673, radius_km: 10 };
    const input = {
      restaurant_id: 'r1',
      items: [{ id: 'm1', quantity: 1 }],
      customer_name: 'Alex',
      phone: '9876543210',
      address: 'Test address in Kochi',
      notes: '',
      ...area,
    };
    expect(() => validateCheckout(input, d.restaurants[0], d.menu, area)).toThrow('kitchen');
    expect(validateCheckout(input, { ...d.restaurants[0], ...area }, d.menu, area)).toHaveLength(1);
  });
});
