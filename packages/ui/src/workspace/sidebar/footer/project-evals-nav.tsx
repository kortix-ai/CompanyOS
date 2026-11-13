'use client';

import { uiRoutes } from '../../../lib/routes';
import { ProjectNavRow } from '../../../internal/layout/project-nav-row';
import { useTranslations } from '../../../i18n';
import { useFeatureFlag } from '@kortix/sdk/react';
import { ChartBarIcon } from '@phosphor-icons/react';
import { useUiPathname } from '../../../providers/ui-provider';

/** The Evals row shows only with the `evals` flag on, in a host that has the page. */
export function ProjectEvalsNavItem({ projectId }: { projectId: string }) {
  const t = useTranslations('sidebar');
  const pathname = useUiPathname();
  const visible = useFeatureFlag(projectId, 'evals').enabled;
  const href = projectId ? (uiRoutes().evals?.(projectId) ?? null) : null;
  if (!href || !visible) return null;
  return (
    <ProjectNavRow active={pathname?.startsWith(href) === true} label={t('evals')} href={href} prefetch>
      <span className="shrink-0">
        <ChartBarIcon />
      </span>
      {t('evals')}
    </ProjectNavRow>
  );
}
