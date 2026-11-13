'use client';

import { TokenMapSection } from '../../token-map-section';
import { DocPage } from '../doc';

export default function TokensPage() {
  return (
    <DocPage
      title="Token map"
      lead="Each job mapped to its class, its token and the value the browser computes for it now."
    >
      <TokenMapSection />
    </DocPage>
  );
}
