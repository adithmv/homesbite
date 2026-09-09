'use client';
import { FormEvent, useState } from 'react';
import { useStore } from './store';
import { DeliveryMap } from './map';
import { inServiceArea, validateServiceArea } from '@/lib/domain';
export function ServiceAreaSettings() {
  const s = useStore();
  const [area, setArea] = useState({ ...s.serviceArea });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const valid =
    [area.lat, area.lng, area.radius_km].every(Number.isFinite) &&
    Math.abs(area.lat) <= 90 &&
    Math.abs(area.lng) <= 180 &&
    area.radius_km >= 1 &&
    area.radius_km <= 100;
  const excluded = valid ? s.restaurants.filter((r) => !inServiceArea(r, area)) : [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      validateServiceArea(area);
      await s.saveServiceArea(area);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the service area.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel management-form" onSubmit={submit} onChange={() => setSaved(false)}>
      <h2>Service area</h2>
      <p className="muted">
        Choose the centre and how far HomeBite delivers. Click the map to move the centre, or enter
        its coordinates.
      </p>
      <label>
        Area name
        <input
          required
          maxLength={80}
          value={area.name}
          onChange={(e) => setArea({ ...area, name: e.target.value })}
          placeholder="e.g. Kochi"
        />
      </label>
      {valid && (
        <DeliveryMap
          markers={[
            {
              lat: area.lat,
              lng: area.lng,
              label: area.name || 'Service area centre',
              radiusKm: area.radius_km,
            },
          ]}
          onSelect={(point) => {
            setArea({ ...area, ...point });
            setSaved(false);
          }}
        />
      )}
      <div className="form-grid">
        <label>
          Centre latitude
          <input
            type="number"
            required
            min={-90}
            max={90}
            step="any"
            value={Number.isNaN(area.lat) ? '' : area.lat}
            onChange={(e) => setArea({ ...area, lat: e.target.valueAsNumber })}
          />
        </label>
        <label>
          Centre longitude
          <input
            type="number"
            required
            min={-180}
            max={180}
            step="any"
            value={Number.isNaN(area.lng) ? '' : area.lng}
            onChange={(e) => setArea({ ...area, lng: e.target.valueAsNumber })}
          />
        </label>
        <label>
          Delivery radius (km)
          <input
            type="number"
            required
            min={1}
            max={100}
            step="any"
            value={Number.isNaN(area.radius_km) ? '' : area.radius_km}
            onChange={(e) => setArea({ ...area, radius_km: e.target.valueAsNumber })}
          />
        </label>
      </div>
      <p className="small muted">
        Radius is measured in a straight line, not road distance. It also sets the maximum
        rider-to-kitchen distance for new assignments. Existing orders are not cancelled.
      </p>
      {valid && excluded.length > 0 && (
        <div className="hint">
          {excluded.length} kitchen{excluded.length === 1 ? ' is' : 's are'} outside this area and
          will not accept new orders: {excluded.map((r) => r.name).join(', ')}.
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="success" role="status">
          Service area saved. New orders now use these boundaries.
        </p>
      )}
      <button className="button" disabled={busy || !valid} type="submit">
        {busy ? 'Saving…' : 'Save service area'}
      </button>
    </form>
  );
}
