'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '../../i18n';
import { useUiViewer } from '../../providers/ui-provider';
import { ModelConnectionLayoutContext } from '../../session/models/model-connection-layout';
import { SubscriptionOffer } from '../../session/models/subscription-offer';
import { firstNameOf } from './first-chat-name';
import { HomeCapabilities } from './home-capabilities';
import { HomeRecentSessions } from './home-recent-sessions';

/** Compact first-chat home. Regular home and session composers keep their own layout. */
export function FirstChat({ projectId, composer }: { projectId: string; composer: ReactNode }) {
  const t = useTranslations('firstChat');
  const viewer = useUiViewer();
  const name = firstNameOf(viewer?.metadata);
  return (
    <ModelConnectionLayoutContext.Provider value="above">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-3xl shrink-0 flex-col gap-8 px-4 py-8">
          <div className="space-y-3 px-4">
            <h1 className="text-foreground text-2xl font-medium tracking-tight text-balance">
              {name ? t('greeting', { name }) : t('greetingNoName')}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{t('intro')}</p>
          </div>
          <div className="space-y-4">
            <SubscriptionOffer projectId={projectId} />
            {composer}
          </div>
          <div className="space-y-5 px-4">
            <HomeRecentSessions projectId={projectId} />
            <HomeCapabilities />
          </div>
        </div>
      </div>
    </ModelConnectionLayoutContext.Provider>
  );
}
