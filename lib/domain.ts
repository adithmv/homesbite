export type Role = 'customer' | 'restaurant' | 'rider' | 'admin';
export type Status =
  | 'placed'
  | 'restaurant_accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'rider_assigned'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'rejected';
export type Point = { lat: number; lng: number };
export type ServiceArea = Point & { name: string; radius_km: number };
export type Profile = { id: string; name: string; phone: string; role: Role };
export type Restaurant = Point & {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  cuisine: string;
  address: string;
  image: string;
  open: boolean;
  approved: boolean;
  hours: string;
  eta: number;
  rating: number | null;
};
export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  veg: boolean;
  available: boolean;
  image: string;
};
export type Rider = Point & {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  online: boolean;
  approved: boolean;
  location_updated_at: string;
};
export type OrderItem = { menu_item_id: string; name: string; quantity: number; price: number };
export type Order = {
  id: string;
  customer_id: string;
  restaurant_id: string;
  rider_id: string | null;
  status: Status;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  address: string;
  customer_name: string;
  phone: string;
  lat: number;
  lng: number;
  notes: string;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  rider_accepted: boolean;
  declined_rider_ids: string[];
};
export type AppData = {
  serviceArea: ServiceArea;
  profile: Profile | null;
  restaurants: Restaurant[];
  menu: MenuItem[];
  riders: Rider[];
  orders: Order[];
};
export type CartLine = { id: string; quantity: number };
export type Checkout = Point & {
  restaurant_id: string;
  items: CartLine[];
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
};
export const DELIVERY_FEE = 3500; // integer paise throughout
export const PILOT_CENTER: Point = { lat: 12.9716, lng: 77.5946 };
export const SERVICE_RADIUS_KM = 12;
export const DEFAULT_SERVICE_AREA: ServiceArea = {
  ...PILOT_CENTER,
  name: 'Bengaluru',
  radius_km: SERVICE_RADIUS_KM,
};
export function inServiceArea(point: Point, area: ServiceArea) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    distance(point, area) <= area.radius_km
  );
}
export function validateServiceArea(area: ServiceArea) {
  if (
    !area.name.trim() ||
    area.name.trim().length > 80 ||
    ![area.lat, area.lng, area.radius_km].every(Number.isFinite) ||
    Math.abs(area.lat) > 90 ||
    Math.abs(area.lng) > 180 ||
    area.radius_km < 1 ||
    area.radius_km > 100
  )
    throw new Error('Enter an area name, valid coordinates, and a radius between 1 and 100 km.');
}
export const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const labels: Record<Status, string> = {
  placed: 'Order placed',
  restaurant_accepted: 'Accepted by kitchen',
  preparing: 'Being prepared',
  ready_for_pickup: 'Finding a rider',
  rider_assigned: 'Rider assigned',
  picked_up: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Declined by kitchen',
};
export const timeline: Status[] = [
  'placed',
  'restaurant_accepted',
  'preparing',
  'ready_for_pickup',
  'rider_assigned',
  'picked_up',
  'delivered',
];
export const isActive = (order: Order) =>
  !['delivered', 'rejected', 'cancelled'].includes(order.status);
export function distance(a: Point, b: Point) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function validateCheckout(
  input: Checkout,
  restaurant: Restaurant,
  menu: MenuItem[],
  area: ServiceArea = DEFAULT_SERVICE_AREA,
) {
  if (!restaurant.open || !restaurant.approved)
    throw new Error('This kitchen is not accepting orders.');
  if (!input.customer_name.trim() || input.address.trim().length < 10)
    throw new Error('Enter your name and complete delivery address.');
  if (!/^[6-9]\d{9}$/.test(input.phone))
    throw new Error('Enter a valid 10-digit Indian mobile number.');
  if (!inServiceArea(input, area))
    throw new Error(`Delivery is available within ${area.radius_km} km of ${area.name}.`);
  if (!inServiceArea(restaurant, area))
    throw new Error('This kitchen is outside the current service area.');
  if (
    !input.items.length ||
    input.items.length > 30 ||
    new Set(input.items.map((i) => i.id)).size !== input.items.length
  )
    throw new Error('Your cart is invalid.');
  return input.items.map((line) => {
    const item = menu.find(
      (m) => m.id === line.id && m.restaurant_id === restaurant.id && m.available,
    );
    if (!item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20)
      throw new Error('A cart item is unavailable or has an invalid quantity.');
    return { menu_item_id: item.id, name: item.name, quantity: line.quantity, price: item.price };
  });
}
export function canTransition(order: Order, to: Status, actor: Profile, restaurant?: Restaurant) {
  if (actor.role === 'customer')
    return order.customer_id === actor.id && order.status === 'placed' && to === 'cancelled';
  if (actor.role === 'restaurant' && restaurant?.owner_id === actor.id) {
    return (
      (
        {
          placed: ['restaurant_accepted', 'rejected'],
          restaurant_accepted: ['preparing'],
          preparing: ['ready_for_pickup'],
        } as Partial<Record<Status, Status[]>>
      )[order.status]?.includes(to) ?? false
    );
  }
  if (actor.role === 'rider' && order.rider_id === actor.id && order.rider_accepted) {
    return (
      (order.status === 'rider_assigned' && to === 'picked_up') ||
      (order.status === 'picked_up' && to === 'delivered')
    );
  }
  return false;
}
export function nearestRider(
  restaurant: Point,
  riders: Rider[],
  orders: Order[],
  excluded: string[] = [],
  now = Date.now(),
  radiusKm = SERVICE_RADIUS_KM,
) {
  return riders
    .filter(
      (r) =>
        r.online &&
        r.approved &&
        !excluded.includes(r.id) &&
        now - new Date(r.location_updated_at).getTime() < 5 * 60_000 &&
        distance(restaurant, r) <= radiusKm &&
        !orders.some((o) => o.rider_id === r.id && isActive(o)),
    )
    .sort(
      (a, b) => distance(restaurant, a) - distance(restaurant, b) || a.id.localeCompare(b.id),
    )[0];
}
