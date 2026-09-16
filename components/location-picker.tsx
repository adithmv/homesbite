'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { Point } from '@/lib/domain';
import { Place } from '@/lib/locations';
import { DeliveryMap } from './map';
export function LocationPicker({
  point,
  onSelect,
  radiusKm,
  label = 'Selected location',
  onDetails,
}: {
  point: Point;
  onSelect: (point: Point) => void;
  radiusKm?: number;
  label?: string;
  onDetails?: (place: Place) => void;
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Place[]>([]),
    [region, setRegion] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    pending = useRef<AbortController | null>(null),
    details = useRef(onDetails),
    select = useRef(onSelect);
  useEffect(() => {
    details.current = onDetails;
    select.current = onSelect;
  }, [onDetails, onSelect]);
  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
    },
    [],
  );
  async function lookup(params: URLSearchParams, signal: AbortSignal) {
    const response = await fetch(`/api/locations?${params}`, { signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Location lookup failed.');
    return body.places as Place[];
  }
  function begin() {
    const id = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError('');
    return { id, controller };
  }
  async function choose(point: Point) {
    const { id, controller } = begin();
    select.current(point);
    setResults([]);
    setRegion('');
    setBusy(true);
    try {
      const places = await lookup(
        new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) }),
        controller.signal,
      );
      if (generation.current !== id) return;
      const place = places[0];
      if (place) {
        setRegion(place.region);
        details.current?.({ ...place, ...point });
      } else setError('Pin selected. No region name found; enter the address manually.');
    } catch (error) {
      if (generation.current === id)
        setError(error instanceof Error ? error.message : 'Could not detect the region.');
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }
  async function search() {
    const { id, controller } = begin();
    if (query.trim().length < 3) {
      setError('Enter at least 3 characters to search.');
      setBusy(false);
      return;
    }
    setBusy(true);
    setResults([]);
    try {
      const places = await lookup(new URLSearchParams({ q: query.trim() }), controller.signal);
      if (generation.current === id) {
        setResults(places);
        if (!places.length) setError('No places found. Try a town, landmark, or postcode.');
      }
    } catch (error) {
      if (generation.current === id) setError((error as Error).message);
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }
  function locate() {
    const { id } = begin();
    setBusy(true);
    if (!navigator.geolocation) {
      setError('Location detection is unavailable. Search or select a map pin.');
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (generation.current === id)
          void choose({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        if (generation.current === id) {
          setError(
            'Location access was denied or unavailable. Search for your place or choose a pin.',
          );
          setBusy(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
  }
  return (
    <section className="location-picker" aria-label="Choose location">
      <div className="location-search">
        <label>
          Search for a place
          <input
            value={query}
            maxLength={200}
            placeholder="Town, area, landmark, or postcode"
            onChange={(e) => {
              setQuery(e.target.value);
              generation.current++;
              pending.current?.abort();
              setBusy(false);
              setResults([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
        </label>
        <button type="button" className="button" onClick={() => void search()} disabled={busy}>
          <Search size={16} />
          Search
        </button>
        <button type="button" className="button secondary" onClick={locate} disabled={busy}>
          <LocateFixed size={16} />
          Use my location
        </button>
      </div>
      {results.length > 0 && (
        <ul className="location-results" aria-label="Place search results">
          {results.map((place, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  begin();
                  setBusy(false);
                  setResults([]);
                  setRegion(place.region);
                  select.current({ lat: place.lat, lng: place.lng });
                  details.current?.(place);
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <DeliveryMap markers={[{ ...point, label, radiusKm }]} onSelect={(p) => void choose(p)} />
      <p className="small muted">
        Click the map, drag the pin, or move the map and choose its centre. Coordinates fill
        automatically. Device location requires your permission.
      </p>
      {busy && <p role="status">Finding your location…</p>}
      {region && (
        <p role="status">
          <strong>Detected region:</strong> {region}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="small muted">
        Place search and region detection use OpenStreetMap data via Photon.
      </p>
    </section>
  );
}
