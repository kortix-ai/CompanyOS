import { FactoryHome } from '@/features/marketing/one-prompt/factory-home';
import { loopViews } from '@/features/marketing/one-prompt/loops-content';

/**
 * kortix.com: one prompt adds loops to your repo (Engineering, Marketing,
 * Sales, ...). The loops are read from the template files at build time, so
 * the page always shows what each loop really runs. Its own page from top to
 * bottom; the CompanyOS page that stood here is at /companyos.
 */
export default function Home() {
  return <FactoryHome loops={loopViews()} />;
}
