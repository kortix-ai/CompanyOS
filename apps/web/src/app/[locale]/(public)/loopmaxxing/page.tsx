import { FactoryHome } from '@/features/marketing/one-prompt/factory-home';
import { catalogViews, loopViews } from '@/features/marketing/one-prompt/loops-content';

/**
 * kortix.com: one prompt adds loops to your repo. The featured loops and the
 * catalog's status are read from the template files at build time, so the
 * page shows what this build really ships. Its own page from top to bottom;
 * the CompanyOS page that stood here is at /companyos.
 */
export default function Home() {
  return <FactoryHome loops={loopViews()} catalog={catalogViews()} />;
}
