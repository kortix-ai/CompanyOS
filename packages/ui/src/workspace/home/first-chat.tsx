'use client';

import type { ReactNode } from 'react';
import { ProjectHomeWelcomeBody } from './welcome-body';

/** First-time and returning users share the same composer and home layout. */
export function FirstChat({
  projectId,
  composer,
}: {
  projectId: string;
  composer: ReactNode;
}) {
  return (
    <ProjectHomeWelcomeBody
      projectId={projectId}
      composer={composer}
      firstVisit
    />
  );
}
