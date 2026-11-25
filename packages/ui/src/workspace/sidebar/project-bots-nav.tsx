'use client';

import type { WorkspaceBot } from '@kortix/sdk';
import { useProjectSessions, useWorkspaceBots } from '@kortix/sdk/react';
import { PauseCircleIcon, PlusIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';

import { useTranslations } from '../../i18n';
import { AgentMark } from '../../internal/components/agent-mark';
import { HoverPrefetchLink } from '../../internal/components/hover-prefetch-link';
import { useIsMobile } from '../../internal/hooks';
import { useComposerPrefillStore } from '../../internal/stores/composer-prefill-store';
import { useUiRouter } from '../../providers/ui-provider';
import { uiRoutes } from '../../lib/routes';
import { Button } from '../../primitives/button';
import Hint from '../../primitives/hint';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '../../primitives/sidebar';
import { spacePreview } from '../spaces/space-identity';

/** `href`, or a page under it. */
function isAt(pathname: string | null, href: string): boolean {
  return !!pathname && (pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The Bots rows of the sidebar (flag `kortix_bot`): one row per agent the
 * person can message, after their own space. My Kortix is that space, so it
 * is not repeated here. A row opens the bot's chat (`/dm/<agent>`). New bot
 * opens that chat with My Kortix with the request in the composer. Rows
 * render once the list arrives; nothing renders while the flag is off.
 */
export function ProjectBotsRows({
  projectId,
  pathname,
  enabled,
  names,
}: {
  projectId: string;
  pathname: string | null;
  enabled: boolean;
  names: (text: string) => string;
}) {
  const t = useTranslations('sidebar.bots');
  const bots = useWorkspaceBots(projectId, { enabled });
  const router = useUiRouter();
  const setPrefill = useComposerPrefillStore((s) => s.setPrefill);
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const shown = (bots.data ?? []).filter((bot) => !bot.builtin);
  if (!enabled || !bots.data) return null;
  // A new bot is made in the person's chat with My Kortix: the request waits in the composer, unsent, to edit first.
  const newBot = () => {
    setPrefill(projectId, t('newBotPrompt'));
    if (isMobile) setOpenMobile(false);
    router.push(`${uiRoutes().project(projectId)}/chat`);
  };
  return (
    <>
      <ChatSectionHeading label={t('title')} actionLabel={t('newBot')} onAction={newBot} />
      {shown.map((bot) => {
        const href = uiRoutes().dm(projectId, bot.name);
        return <BotRow key={bot.name} projectId={projectId} bot={bot} href={href} active={isAt(pathname, href)} names={names} />;
      })}
    </>
  );
}

/**
 * A section heading of the chat sidebar (Bots, Channels): its name, and at
 * the row's right edge a + that adds one (New bot, New channel).
 */
export function ChatSectionHeading({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <li className="text-muted-foreground flex items-center justify-between gap-1 pt-3 pr-1 pb-1 pl-2 text-xs">
      <span className="truncate">{label}</span>
      <Hint label={actionLabel} side="top">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={actionLabel}
          onClick={onAction}
          className="text-muted-foreground hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </Hint>
    </li>
  );
}

/**
 * One bot: its pixel mark, its name, and under it its newest message, or why
 * it does not answer (Paused, Off). Same geometry as a space row.
 */
function BotRow({
  projectId,
  bot,
  href,
  active,
  names,
}: {
  projectId: string;
  bot: WorkspaceBot;
  href: string;
  active: boolean;
  names: (text: string) => string;
}) {
  const t = useTranslations('sidebar.bots');
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  // The chat's thread list: the same cache entry the bot's chat reads.
  const threads = useProjectSessions(projectId, { spaceId: bot.chat_space_id ?? undefined, parent: 'root', enabled: !!bot.chat_space_id });
  const preview = useMemo(() => spacePreview(threads.sessions, names), [threads.sessions, names]);
  const note = bot.status === 'paused' ? t('paused') : bot.status === 'off' ? t('off') : (preview ?? t('noMessages'));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        size="lg"
        isActive={active}
        tooltip={bot.display_name}
        className="text-sidebar-foreground gap-2.5 px-2 [&_[data-slot=agent-mark]>svg]:size-auto! [&_[data-slot=bot-paused]]:size-3!"
      >
        <HoverPrefetchLink
          href={href}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <AgentMark slug={bot.name} size={21} tile={29} label={bot.display_name} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{bot.display_name}</span>
              {bot.status === 'paused' ? (
                <PauseCircleIcon data-slot="bot-paused" role="img" aria-label={t('paused')} className="text-muted-foreground" />
              ) : null}
            </span>
            <span className="text-muted-foreground truncate text-xs font-normal">{note}</span>
          </span>
        </HoverPrefetchLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
