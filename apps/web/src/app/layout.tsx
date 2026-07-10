import type {Metadata, Viewport} from 'next';
import {Poppins} from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FinXAI',
  description: 'FinXAI — expense tracking, synced with your phone.',
};

export const viewport: Viewport = {
  themeColor: '#0B0F0D',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.className}>
      <body>{children}</body>
    </html>
  );
}
