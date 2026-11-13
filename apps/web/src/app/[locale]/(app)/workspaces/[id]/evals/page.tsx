'use client';

import { useParams } from 'next/navigation';

import { EvalsPage } from '@/features/workspace/evals/evals-page';

/** /workspaces/[id]/evals — leaderboard, suites and jobs (the layout gates the flag). */
export default function ProjectEvalsPage() {
  const { id } = useParams<{ id: string }>();
  return <EvalsPage projectId={id} />;
}
