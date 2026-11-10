import { localizedMarketingMetadata } from '@/lib/seo/metadata';
import type { ReactNode } from 'react';

// The CompanyOS story, the home page until the one-prompt home replaced it.
export function generateMetadata() {
  return localizedMarketingMetadata('/companyos');
}

export default function CompanyOsLayout({ children }: { children: ReactNode }) {
  return children;
}
