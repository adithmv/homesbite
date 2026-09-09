'use client';
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { Point } from '@/lib/domain';
export type MapMarker = Point & { label: string; color?: string; radiusKm?: number };
export function DeliveryMap({
  markers,
  onSelect,
}: {
  markers: MapMarker[];
  onSelect?: (point: Point) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layer = useRef<LayerGroup | null>(null);
  const callback = useRef(onSelect);
  const currentMarkers = useRef(markers);
  useEffect(() => {
    callback.current = onSelect;
    currentMarkers.current = markers;
  }, [onSelect, markers]);
  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((L) => {
      if (disposed || !element.current) return;
      const first = currentMarkers.current[0] || { lat: 12.9716, lng: 77.5946 };
      map.current = L.map(element.current).setView([first.lat, first.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      for (const m of currentMarkers.current) {
        const tip = document.createElement('span');
        tip.textContent = m.label;
        L.circleMarker([m.lat, m.lng], {
          radius: 9,
          color: m.color || '#146b47',
          weight: 3,
          fillOpacity: 0.8,
        })
          .bindTooltip(tip)
          .addTo(layer.current);
        if (m.radiusKm)
          L.circle([m.lat, m.lng], {
            radius: m.radiusKm * 1000,
            color: '#146b47',
            weight: 2,
            fillOpacity: 0.1,
          }).addTo(layer.current);
      }
      const area = currentMarkers.current.find((m) => m.radiusKm);
      if (area?.radiusKm)
        map.current.fitBounds(
          L.circle([area.lat, area.lng], { radius: area.radiusKm * 1000 }).getBounds(),
          { padding: [20, 20] },
        );
      map.current.on('click', (e) => callback.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      if (currentMarkers.current.length > 1)
        map.current.fitBounds(
          L.latLngBounds(currentMarkers.current.map((m) => [m.lat, m.lng] as [number, number])),
          { padding: [35, 35], maxZoom: 15 },
        );
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  const markerKey = JSON.stringify(markers);
  useEffect(() => {
    const nextMarkers = JSON.parse(markerKey) as MapMarker[];
    if (!map.current || !layer.current) return;
    void import('leaflet').then((L) => {
      if (!map.current || !layer.current) return;
      layer.current.clearLayers();
      for (const m of nextMarkers) {
        const tip = document.createElement('span');
        tip.textContent = m.label;
        L.circleMarker([m.lat, m.lng], {
          radius: 9,
          color: m.color || '#146b47',
          weight: 3,
          fillOpacity: 0.8,
        })
          .bindTooltip(tip)
          .addTo(layer.current);
        if (m.radiusKm)
          L.circle([m.lat, m.lng], {
            radius: m.radiusKm * 1000,
            color: '#146b47',
            weight: 2,
            fillOpacity: 0.1,
          }).addTo(layer.current);
      }
      if (nextMarkers.length)
        map.current.fitBounds(
          L.latLngBounds(nextMarkers.map((m) => [m.lat, m.lng] as [number, number])),
          { padding: [35, 35], maxZoom: 15 },
        );
      const area = nextMarkers.find((m) => m.radiusKm);
      if (area?.radiusKm)
        map.current.fitBounds(
          L.circle([area.lat, area.lng], { radius: area.radiusKm * 1000 }).getBounds(),
          { padding: [20, 20] },
        );
    });
  }, [markerKey]);
  return (
    <div
      className="delivery-map"
      ref={element}
      aria-label={
        onSelect
          ? 'Delivery location map. Click to select, or use the coordinate fields below.'
          : 'Pickup, delivery, and available rider locations'
      }
    />
  );
}
