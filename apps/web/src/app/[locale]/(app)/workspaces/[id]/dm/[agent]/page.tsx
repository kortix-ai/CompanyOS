'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { SpaceFileView } from '@/features/drives/space-file-view';
import { SpaceFolderView } from '@/features/drives/space-folder-view';
import { useProjectSendGate } from '@/hooks/projects/use-project-send-gate';
import { useFeatureFlag } from '@kortix/sdk/react';
import { isMyKortixAgentName } from '@kortix/shared';
import { uiRoutes } from '@kortix/ui';
import { BotChatView } from '@kortix/ui/workspace';

/**
 * /workspaces/[id]/dm/[agent] — a bot's chat (flag `kortix_bot`): the
 * person's one chat with that agent, its DM space. Every message is a thread;
 * the bot's newest reply shows under it.
 *
 * Without `kortix_bot` it is an address from before Spaces were the only place
 * to work (`chat` flag): every old DM link opens the person's own space
 * (`/chat`). My Kortix always opens `/chat`. It exists only with `chat` on.
 */
export default function ProjectDmPage() {
  const { id, agent } = useParams<{ id: string; agent: string }>();
  const agentName = decodeURIComponent(agent);
  const router = useRouter();
  const channels = useFeatureFlag(id, 'chat');
  const bots = useFeatureFlag(id, 'kortix_bot');
  const beforeSend = useProjectSendGate(id);
  const botChat = channels.enabled && bots.enabled && !isMyKortixAgentName(agentName);

  useEffect(() => {
    if (channels.enabled && !bots.isLoading && !botChat) router.replace(`${uiRoutes().project(id)}/chat`);
  }, [channels.enabled, bots.isLoading, botChat, id, router]);

  if (!channels.isLoading && !channels.enabled) notFound();
  if (!botChat) return null;
  return (
    <BotChatView
      projectId={id}
      agentName={agentName}
      beforeSend={beforeSend}
      renderFolder={(folder) => <SpaceFolderView projectId={id} {...folder} />}
      renderFile={(file) => <SpaceFileView projectId={id} {...file} />}
      chat
    />
  );
}
