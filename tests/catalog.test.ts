import { describe, expect, it } from 'vitest';
import { readCatalog } from '../lib/catalog';
import { demoData } from '../lib/demo';
describe('Optional catalog tool contract', () => {
  it('searches available dishes and returns no private records', () => {
    const result = readCatalog(demoData(), { query: 'paneer' });
    expect(result.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(JSON.stringify(result)).not.toContain('customer_id');
  });
  it('excludes unapproved kitchens', () => {
    const data = demoData();
    data.restaurants[0].approved = false;
    expect(readCatalog(data, {}).map((r) => r.id)).not.toContain('r1');
  });
  it.each([null, [], { query: 1 }, { extra: 'bad' }, { query: 'x'.repeat(201) }])(
    'rejects invalid tool input',
    (input) => expect(() => readCatalog(demoData(), input)).toThrow(),
  );
});
