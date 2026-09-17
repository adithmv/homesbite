'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Point } from '@/lib/domain';
export type MapMarker = Point & { label: string; color?: string; radiusKm?: number };
export function DeliveryMap({
  markers,
  onSelect,
  followPoint,
}: {
  markers: MapMarker[];
  onSelect?: (point: Point) => void;
  followPoint?: Point;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null),
    api = useRef<typeof Leaflet | null>(null),
    callback = useRef(onSelect);
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [following, setFollowing] = useState(true);
  const fitted = useRef(false);
  useEffect(() => {
    callback.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import('leaflet')
      .then((L) => {
        if (disposed || !element.current) return;
        api.current = L;
        const instance = L.map(element.current, { scrollWheelZoom: false }).setView(
          [12.9716, 77.5946],
          12,
        );
        map.current = instance;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(instance);
        layer.current = L.layerGroup().addTo(instance);
        instance.on('click', (event) =>
          callback.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }),
        );
        instance.on('dragstart', () => setFollowing(false));
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
          observer.observe(element.current);
        }
        setReady(true);
      })
      .catch(() => {
        if (!disposed)
          setError(
            'Map could not load. Use place search, current location, or the coordinate fields.',
          );
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      layer.current = null;
      fitted.current = false;
    };
  }, []);
  const markerKey = JSON.stringify(markers),
    selectable = !!onSelect;
  useEffect(() => {
    const L = api.current,
      instance = map.current,
      group = layer.current;
    if (!ready || !L || !instance || !group) return;
    const points = (JSON.parse(markerKey) as MapMarker[]).filter(
      (m) =>
        Number.isFinite(m.lat) &&
        Number.isFinite(m.lng) &&
        Math.abs(m.lat) <= 90 &&
        Math.abs(m.lng) <= 180,
    );
    group.clearLayers();
    let areaBounds: Leaflet.LatLngBounds | undefined;
    for (const m of points) {
      // Coverage overlays must not intercept taps intended to select a new location.
      if (m.radiusKm) {
        const circle = L.circle([m.lat, m.lng], {
          radius: m.radiusKm * 1000,
          color: '#146b47',
          weight: 2,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(group);
        const bounds = circle.getBounds();
        areaBounds = areaBounds ? areaBounds.extend(bounds) : bounds;
      }
      const tip = document.createElement('span');
      tip.textContent = m.label;
      if (selectable) {
        const pin = L.marker([m.lat, m.lng], {
          draggable: true,
          icon: L.divIcon({
            className: 'location-pin',
            html: '<span></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
          .bindTooltip(tip)
          .addTo(group);
        pin.on('dragend', () => {
          const p = pin.getLatLng();
          callback.current?.({ lat: p.lat, lng: p.lng });
        });
      } else
        L.circleMarker([m.lat, m.lng], {
          radius: 9,
          color: m.color || '#146b47',
          weight: 3,
          fillOpacity: 0.8,
        })
          .bindTooltip(tip)
          .addTo(group);
    }
    if (!points.length) return;
    if (!fitted.current && areaBounds) instance.fitBounds(areaBounds, { padding: [20, 20] });
    else if (!fitted.current && points.length > 1)
      instance.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [35, 35],
        maxZoom: 15,
      });
    else if (!fitted.current) instance.setView([points[0].lat, points[0].lng], 15);
    else if (selectable && !instance.getBounds().contains([points[0].lat, points[0].lng]))
      instance.panTo([points[0].lat, points[0].lng]);
    fitted.current = true;
  }, [markerKey, ready, selectable]);
  const followLat = followPoint?.lat,
    followLng = followPoint?.lng;
  useEffect(() => {
    if (
      ready &&
      following &&
      followLat !== undefined &&
      followLng !== undefined &&
      Number.isFinite(followLat) &&
      Number.isFinite(followLng)
    )
      map.current?.panTo([followLat, followLng]);
  }, [ready, following, followLat, followLng]);
  return (
    <div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div
        className="delivery-map"
        ref={element}
        aria-label={
          selectable ? 'Location map: click to select or drag the pin' : 'Delivery locations map'
        }
      />
      {!selectable && (
        <div className="map-actions">
          {followPoint && (
            <button
              type="button"
              className="button secondary small"
              aria-pressed={following}
              onClick={() => setFollowing(!following)}
            >
              {following ? 'Pause following' : 'Follow rider'}
            </button>
          )}
          <button
            type="button"
            className="button secondary small"
            disabled={!ready || !markers.length}
            onClick={() => {
              const points = markers.filter(
                (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
              );
              if (!points.length || !api.current) return;
              setFollowing(false);
              map.current?.fitBounds(
                api.current.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
                { padding: [35, 35], maxZoom: 15 },
              );
            }}
          >
            Show all locations
          </button>
        </div>
      )}
      {selectable && (
        <button
          className="button secondary small"
          type="button"
          disabled={!ready}
          onClick={() => {
            const p = map.current?.getCenter();
            if (p) callback.current?.({ lat: p.lat, lng: p.lng });
          }}
        >
          Use centre of map
        </button>
      )}
    </div>
  );
}
