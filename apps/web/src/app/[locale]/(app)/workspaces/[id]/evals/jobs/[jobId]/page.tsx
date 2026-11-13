import { redirect } from 'next/navigation';

/** /workspaces/[id]/evals/jobs/<job_id> moved into Customize: /workspaces/[id]/admin/evals/jobs/<job_id>. */
export default async function ProjectEvalJobRedirect({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params;
  redirect(`/workspaces/${encodeURIComponent(id)}/admin/evals/jobs/${encodeURIComponent(jobId)}`);
}
