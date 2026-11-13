'use client';

import { useParams } from 'next/navigation';

import { EvalJobView } from '@kortix/ui/customize/evals/eval-job-view';

import { decodeSegment, ProjectAdminRoute } from '@/features/workspace/project-admin/project-admin-route';

/** /workspaces/[id]/admin/evals/jobs/<job_id> — one eval job, in the Evals pane of Customize. */
export default function ProjectAdminEvalJobPage() {
  const { id: projectId, jobId } = useParams<{ id: string; jobId: string }>();
  const job = decodeSegment(jobId);
  return <ProjectAdminRoute projectId={projectId} section="evals" content={<EvalJobView key={job} projectId={projectId} jobId={job} />} />;
}
