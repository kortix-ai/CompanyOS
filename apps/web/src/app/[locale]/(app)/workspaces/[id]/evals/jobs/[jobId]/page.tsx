'use client';

import { useParams } from 'next/navigation';

import { EvalJobPage } from '@/features/workspace/evals/eval-job-page';

/** /workspaces/[id]/evals/jobs/[jobId] — one job's scores and trials (the layout gates the flag). */
export default function ProjectEvalJobPage() {
  const { id, jobId } = useParams<{ id: string; jobId: string }>();
  return <EvalJobPage projectId={id} jobId={jobId} />;
}
