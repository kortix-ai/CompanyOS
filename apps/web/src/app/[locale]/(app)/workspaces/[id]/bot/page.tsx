'use client';

import { useParams } from 'next/navigation';

import { useTranslations } from '@/i18n/use-translations';

import { useFeatureFlag } from '@kortix/sdk/react';
import { EmptyArt } from '@kortix/ui/empty-art';
import { EmptyState } from '@kortix/ui/empty-state';
import { RobotIcon } from '@phosphor-icons/react';

/**
 * /workspaces/[id]/bot — Bots (flag `kortix_bot`): agents that work in the
 * background and bring back a result. Not built yet: the page says so.
 */
export default function BotPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('botPage');
  const flag = useFeatureFlag(id, 'kortix_bot');
  if (flag.isLoading || !flag.enabled) return null;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <EmptyState media={<EmptyArt icon={RobotIcon} />} title={t('title')} description={t('description')} />
    </div>
  );
}
