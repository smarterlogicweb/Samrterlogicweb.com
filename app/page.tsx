import type { Metadata } from 'next';
import Script from 'next/script';
import { HeroSection } from '@/components/sections/HeroSection';
import { generateMetadata as buildPageMetadata, homeMetadata, generateOrganizationSchema } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata(homeMetadata);

export default function HomePage() {
  const websiteJsonLd = homeMetadata.structuredData || {};
  const organizationJsonLd = generateOrganizationSchema();

  return (
    <>
      {/* JSON-LD: WebSite */}
      <Script
        id="ld-json-website"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {/* JSON-LD: Organization */}
      <Script
        id="ld-json-organization"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <HeroSection />
    </>
  );
}