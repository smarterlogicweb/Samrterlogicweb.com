import './globals.css';
import type { Metadata } from 'next';
import { siteConfig } from '@/lib/seo/metadata';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: '%s | SLW',
  },
  description: siteConfig.description,
  alternates: {
    canonical: siteConfig.url,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
  themeColor: '#C73863',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a href="#main-content" className="skip-to-content">Aller au contenu</a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}