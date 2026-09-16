// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({
  events: {} as Record<string, (e: unknown) => void>,
  drag: {} as Record<string, () => void>,
  circleOptions: [] as { interactive?: boolean }[],
  fit: vi.fn(),
}));
vi.mock('leaflet', () => {
  const instance = {
    setView: vi.fn().mockReturnThis(),
    on: (event: string, fn: (e: unknown) => void) => {
      mock.events[event] = fn;
    },
    fitBounds: mock.fit,
    panTo: vi.fn(),
    getBounds: () => ({ contains: () => true }),
    getCenter: () => ({ lat: 10, lng: 76 }),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  };
  return {
    map: () => instance,
    tileLayer: () => ({ addTo: () => {} }),
    layerGroup: () => ({
      addTo() {
        return this;
      },
      clearLayers: () => {},
    }),
    divIcon: () => ({}),
    marker: () => ({
      bindTooltip() {
        return this;
      },
      addTo() {
        return this;
      },
      on(event: string, fn: () => void) {
        mock.drag[event] = fn;
        return this;
      },
      getLatLng: () => ({ lat: 11, lng: 77 }),
    }),
    circle: (_: unknown, options: { interactive?: boolean }) => {
      mock.circleOptions.push(options);
      let added = false;
      return {
        addTo() {
          added = true;
          return this;
        },
        getBounds() {
          if (!added) throw new Error('Circle must be added before reading projected bounds');
          return {};
        },
      };
    },
    latLngBounds: () => ({}),
    circleMarker: () => ({
      bindTooltip() {
        return this;
      },
      addTo() {
        return this;
      },
    }),
  };
});
import { DeliveryMap } from '../components/map';
afterEach(() => {
  cleanup();
  mock.fit.mockClear();
  mock.circleOptions.length = 0;
});
describe('Interactive map regression', () => {
  it('initializes a coverage circle before calculating bounds, keeps it non-interactive, and supports click/drag/centre selection', async () => {
    const select = vi.fn();
    const props = {
      markers: [{ lat: 12, lng: 77, label: 'Area', radiusKm: 12 }],
      onSelect: select,
    };
    const { rerender } = render(<DeliveryMap {...props} />);
    const button = await screen.findByRole('button', { name: 'Use centre of map' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(mock.circleOptions[0].interactive).toBe(false);
    expect(mock.fit).toHaveBeenCalledTimes(1);
    act(() => mock.events.click({ latlng: { lat: 10, lng: 76 } }));
    expect(select).toHaveBeenCalledWith({ lat: 10, lng: 76 });
    act(() => mock.drag.dragend());
    expect(select).toHaveBeenCalledWith({ lat: 11, lng: 77 });
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith({ lat: 10, lng: 76 });
    rerender(
      <DeliveryMap {...props} markers={[{ lat: 10, lng: 76, label: 'Area', radiusKm: 12 }]} />,
    );
    expect(mock.fit).toHaveBeenCalledTimes(1);
  });
});
