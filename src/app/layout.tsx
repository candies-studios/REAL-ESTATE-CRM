import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './globals.css';
import { brand } from '@/config/brand';
import { siteUrl } from '@/lib/supabase/env';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { type: 'website', siteName: brand.name, title: brand.name, description: brand.description },
};

export const viewport: Viewport = { themeColor: '#0b1b33' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
