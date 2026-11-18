import type { Metadata } from 'next';
import { AppProviders } from '@/components/app-providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  ),
  title: { default: 'InqFlow', template: '%s · InqFlow' },
  description: 'A clear place for every customer inquiry.',
  icons: { icon: '/favicon.ico', apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    title: 'InqFlow',
    description: 'A clear place for every customer inquiry.',
    images: ['/brand/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
