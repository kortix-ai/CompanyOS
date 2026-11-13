'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';

import { useTranslations } from '@/i18n/use-translations';
import { FeatureGateScreen } from '@kortix/ui/customize/shared/feature-gate-screen';
import { useFeatureFlag } from '@kortix/sdk/react';

/**
 * /workspaces/[id]/evals* — the project's evals. It exists only with the
 * project's `evals` flag on: off, a deep link shows only that the flag is off,
 * and no eval data loads.
 */
export default function ProjectEvalsLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('evals');
  const evals = useFeatureFlag(id, 'evals');

  if (evals.isLoading) return null;
  if (!evals.enabled) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <FeatureGateScreen featureKey="evals" featureName={t('title')} description={t('gateDescription')} />
      </div>
    );
  }
  return <>{children}</>;
}
