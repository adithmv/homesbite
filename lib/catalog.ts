import { inServiceArea, type AppData } from './domain';
export function readCatalog(data: AppData, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected an object.');
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((k) => k !== 'query') ||
    (value.query !== undefined && typeof value.query !== 'string')
  )
    throw new Error('query must be a string.');
  const query = (value.query as string | undefined)?.trim().toLowerCase() || '';
  if (query.length > 200) throw new Error('Search is too long.');
  return data.restaurants
    .filter((r) => r.approved && inServiceArea(r, data.serviceArea))
    .map((r) => ({
      id: r.id,
      name: r.name,
      open: r.open,
      cuisine: r.cuisine,
      url: `/r/${r.slug}`,
      items: data.menu
        .filter((m) => m.restaurant_id === r.id && m.available)
        .map((m) => ({ id: m.id, name: m.name, pricePaise: m.price, vegetarian: m.veg })),
    }))
    .filter((r) =>
      `${r.name} ${r.cuisine} ${r.items.map((i) => i.name).join(' ')}`
        .toLowerCase()
        .includes(query),
    );
}
