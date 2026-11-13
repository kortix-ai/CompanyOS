'use client';

import { InteractionSection } from '../../interaction-section';
import { DocPage } from '../doc';

export default function InteractionPage() {
  return (
    <DocPage
      title="Interaction"
      lead="Hover is color only, press is one scale step, focus is the ring. Anything an arrow key drives has no transition."
    >
      <InteractionSection />
    </DocPage>
  );
}
