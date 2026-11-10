import { SelfHostedPage } from '@/features/marketing/self-hosted/self-hosted-page';

import { marketingMetadataLayout } from '@/lib/seo/metadata';

const { generateMetadata } = marketingMetadataLayout('/self-hosted');

export { generateMetadata };

/** `/self-hosted`: run Kortix on your own server with the kortix CLI. */
export default function Page() {
  return <SelfHostedPage />;
}
