'use client';

import { useFeatureFlag } from '@kortix/sdk/react';
import { StackIcon } from '@phosphor-icons/react';

import { useTranslations } from '../../../i18n';
import { ProjectNavRow } from '../../../internal/layout/project-nav-row';
import { uiRoutes } from '../../../lib/routes';
import { useUiPathname } from '../../../providers/ui-provider';

/** The Spaces row (session groups, flag `session_groups`): the Spaces page; active on it and on one space's page. */
export function ProjectSessionSpacesNavItem({ projectId }: { projectId: string }) {
  const t = useTranslations('sessionSpaces');
  const pathname = useUiPathname();
  const visible = useFeatureFlag(projectId, 'session_groups').enabled;
  const href = projectId ? (uiRoutes().sessionSpaces?.(projectId) ?? null) : null;
  const one = projectId ? (uiRoutes().sessionSpace?.(projectId, '') ?? null) : null;
  if (!href || !visible) return null;
  const active = pathname === href || (one !== null && pathname?.startsWith(one) === true);
  return (
    <ProjectNavRow active={active} label={t('title')} href={href} prefetch>
      <span className="shrink-0">
        <StackIcon />
      </span>
      {t('title')}
    </ProjectNavRow>
  );
}
