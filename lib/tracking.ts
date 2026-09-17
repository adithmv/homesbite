import { Point } from './domain';
export type GpsFix = Point & { accuracy: number; timestamp: number };
export function locationAge(timestamp: string | number | undefined, now: number) {
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp;
  return time && Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 1000)) : Infinity;
}
export function validFix(fix: GpsFix, now = Date.now()) {
  return (
    Number.isFinite(fix.lat) &&
    Number.isFinite(fix.lng) &&
    Math.abs(fix.lat) <= 90 &&
    Math.abs(fix.lng) <= 180 &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    Number.isFinite(fix.timestamp) &&
    fix.timestamp <= now + 5000 &&
    locationAge(fix.timestamp, now) < 30
  );
}
export function freshnessLabel(age: number) {
  if (!Number.isFinite(age)) return 'Waiting for GPS';
  if (age < 5) return 'Updated just now';
  if (age < 60) return `Updated ${age}s ago`;
  return `Last update ${Math.floor(age / 60)}m ago`;
}
