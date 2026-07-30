import type {Metadata, Viewport} from 'next';
import {Bricolage_Grotesque, IBM_Plex_Mono, Poppins} from 'next/font/google';
import './globals.css';

// Three roles, deliberately different faces.
//
// Body stays Poppins — it is what the Android app uses, so the two halves of
// FinXAI read as one product rather than two.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

// Display: a grotesque with real width and a slightly un-geometric skeleton.
// Poppins set large only looks like Poppins set large, and a high-contrast serif
// would say "editorial" about a product that is really about money arriving by
// text message.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

// Data — not decoration. This product's raw material IS machine text
// (`*164*S*Y'ello…*EN#`), and money columns are far easier to compare set in
// tabular monospaced figures than in proportional ones.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'FinXAI',
  description: 'FinXAI — expense tracking, synced with your phone.',
};

export const viewport: Viewport = {
  themeColor: '#0B1410',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${bricolage.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
