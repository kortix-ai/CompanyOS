import { WorkspaceSetupPage } from '@kortix/ui/workspace/setup/workspace-setup-page';

/** `/workspaces/<id>/setup`: the steps only a person can do, on one page. `kortix onboard` opens it. */
export default async function WorkspaceSetupRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceSetupPage projectId={id} />;
}
