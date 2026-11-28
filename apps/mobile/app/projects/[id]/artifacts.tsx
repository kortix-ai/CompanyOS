/**
 * `/projects/[id]/artifacts` — the project's artifacts (shared docs and
 * pages), opened from the drawer's Artifacts row. Its PageHeader shows the
 * hamburger, which opens the project drawer. The project comes from
 * ProjectRouteProvider: a drawer push carries no route params. A row opens
 * the artifact in the viewer sheet over this page (`ArtifactViewerSheet`); Ask
 * AI in a row's actions opens project home with the artifact attached.
 */
import { ArtifactsPage } from '@/components/artifacts/ArtifactsPage';
import { useCoveringRoute, useProjectRoute } from '@/components/session/ProjectRoutes';

export default function ProjectArtifactsScreen() {
  const { projectId, openDrawer, newSession } = useProjectRoute();
  // A session opened from the drawer replaces this page with the view.
  useCoveringRoute();

  return <ArtifactsPage projectId={projectId} onOpenDrawer={openDrawer} onNewChat={newSession} />;
}
