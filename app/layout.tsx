import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { StoreProvider } from '@/components/store';
import { Shell } from '@/components/ui';
import { CatalogTools } from '@/components/catalog-tools';
export const metadata: Metadata = {
  title: { default: 'HomeBite — Your neighbourhood, on a plate', template: '%s | HomeBite' },
  description:
    'Discover neighbourhood kitchens in Bengaluru. Freshly prepared meals, transparent prices, and cash on delivery.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <CatalogTools />
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
