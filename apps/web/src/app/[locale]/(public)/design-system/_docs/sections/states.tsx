'use client';

import { StatesSection } from '../../states-section';
import { DocPage } from '../doc';

export default function StatesPage() {
  return (
    <DocPage
      title="States"
      lead="Loading, empty, error and ready for a list, and idle, pending, done and disabled for an action. One primitive per state."
    >
      <StatesSection />
    </DocPage>
  );
}
