import type {Metadata, Viewport} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinXAI',
  description: 'FinXAI — expense tracking, synced with your phone.',
};

export const viewport: Viewport = {
  themeColor: '#0B0E14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
