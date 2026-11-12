'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { useProjectSessions } from '@kortix/sdk/react';
import { ChatCircleIcon } from '@phosphor-icons/react';
import { useTranslations } from '../../i18n';
import { uiRoutes } from '../../lib/routes';
import { UiLink as Link } from '../../providers/ui-provider';
import {
  getSessionDisplayTitle,
  shortRelative,
} from '../../session/actions/project-session-list-helpers';
import { Button } from '../../primitives/button';
import { Skeleton } from '../../primitives/skeleton';

/** A bounded view of the viewer's recent root sessions, using the SDK visibility contract. */
export function HomeRecentSessions({ projectId }: { projectId: string }) {
  const t = useTranslations('compactHome');
  const query = useProjectSessions(projectId, {
    parent: 'root',
    startedBy: 'me',
    refetchOnWindowFocus: true,
  });
  const href = uiRoutes().sessions(projectId);
  if (!query.isLoading && !query.isError && query.sessions.length === 0)
    return null;
  return (
    <section aria-label={t('recentSessions')} className="space-y-2">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('recentSessions')}</h2>
        {href ? (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground rounded-sm text-xs focus-visible:outline-2"
          >
            {t('viewAll')}
          </Link>
        ) : null}
      </header>
      {query.isLoading ? (
        <Skeleton className="h-10 w-full rounded-md" />
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-muted-foreground">{t('loadError')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            {t('retry')}
          </Button>
        </div>
      ) : (
        <ul className="space-y-1">
          {query.sessions.slice(0, 3).map((session) => (
            <li key={session.session_id}>
              <Link
                href={uiRoutes().session(projectId, session.session_id)}
                className="hover:bg-muted focus-visible:ring-ring flex min-h-11 min-w-0 items-center gap-3 rounded-md px-2 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <ChatCircleIcon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={getSessionDisplayTitle(session)}
                >
                  {getSessionDisplayTitle(session)}
                </span>
                <time
                  dateTime={session.updated_at}
                  className="text-muted-foreground shrink-0 text-xs tabular-nums"
                >
                  {shortRelative(
                    formatDistanceToNowStrict(new Date(session.updated_at)),
                  )}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
