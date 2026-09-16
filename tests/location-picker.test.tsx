// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../components/map', () => ({
  DeliveryMap: ({ onSelect }: { onSelect: (p: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onSelect({ lat: 9.9312, lng: 76.2673 })}>
      Mock map click
    </button>
  ),
}));
import { LocationPicker } from '../components/location-picker';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const place = { lat: 9.9312, lng: 76.2673, label: 'Marine Drive, Kochi', region: 'Kochi' };
describe('Shared location picker interactions', () => {
  it('searches only on submission, selects results, and does not submit its parent form', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ places: [place] }) });
    vi.stubGlobal('fetch', request);
    const select = vi.fn(),
      details = vi.fn(),
      submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <LocationPicker point={{ lat: 0, lng: 0 }} onSelect={select} onDetails={details} />
      </form>,
    );
    fireEvent.change(screen.getByLabelText('Search for a place'), { target: { value: 'Kochi' } });
    expect(request).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Search for a place'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: place.label }));
    expect(select).toHaveBeenCalledWith({ lat: place.lat, lng: place.lng });
    expect(details).toHaveBeenCalledWith(place);
    expect(submit).not.toHaveBeenCalled();
  });
  it('selects coordinates immediately even when region lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Lookup offline')));
    const select = vi.fn();
    render(<LocationPicker point={{ lat: 0, lng: 0 }} onSelect={select} />);
    fireEvent.click(screen.getByText('Mock map click'));
    expect(select).toHaveBeenCalledWith({ lat: 9.9312, lng: 76.2673 });
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
  it('requests location only after the user clicks and detects the region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ places: [place] }) }),
    );
    const geo = vi.fn((success) => success({ coords: { latitude: 9.9312, longitude: 76.2673 } }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: geo },
    });
    const select = vi.fn();
    render(<LocationPicker point={{ lat: 0, lng: 0 }} onSelect={select} />);
    expect(geo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(select).toHaveBeenCalledWith({ lat: 9.9312, lng: 76.2673 }));
    expect(await screen.findByText('Kochi')).toBeTruthy();
  });
  it('handles denied geolocation and keeps map selection available', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_: unknown, reject: () => void) => reject() },
    });
    render(<LocationPicker point={{ lat: 0, lng: 0 }} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByText('Mock map click') as HTMLButtonElement).disabled).toBe(false);
  });
});
