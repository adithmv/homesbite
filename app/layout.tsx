import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { StoreProvider } from '@/components/store';
import { Shell } from '@/components/ui';
import { CatalogTools } from '@/components/catalog-tools';
import { connection } from 'next/server';
export const metadata: Metadata = {
  title: { default: 'HomeBite — Your neighbourhood, on a plate', template: '%s | HomeBite' },
  description:
    'Discover kitchens in your neighbourhood. Freshly prepared meals, transparent prices, and cash on delivery.',
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request rendering ensures the CSP nonce matches every framework script.
  await connection();
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
