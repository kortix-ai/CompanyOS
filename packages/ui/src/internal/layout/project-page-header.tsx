'use client';

import { useSettingsPageTitle } from '../../primitives/settings-section-header';
import { useOptionalSidebar } from '../../primitives/sidebar';
import { SidebarToggle } from './sidebar-toggle';

/**
 * The one header of a standalone project page (Spaces, Goals, Apps, Artifacts,
 * Files, Calendar, a goal, an artifact): 44px tall (`h-12`), 11px gutters
 * (`px-3`), the sidebar toggle, the title as the page's `<h1>` on the toggle's
 * line, and the actions 8px apart (`gap-2`) at the trailing edge. Actions are
 * `size="sm"` buttons or `size="icon-base"` icon buttons (both 29px), the
 * primary one in the default variant. A page that draws its own row (the
 * artifact viewer) uses `PROJECT_PAGE_HEADER_CLASS`, never its own numbers.
 *
 * The title-bar classes (`kx-titlebar-row`, `kx-titlebar-tabs`) let the
 * desktop app give the row its window-control band. `breadcrumb` sits before
 * the title ("Goals ›"), `titleAccessory` after it (a docs link).
 *
 * The e2e journey `18-apps-ui` finds the page by the `<h1>`.
 */
export const PROJECT_PAGE_HEADER_CLASS =
  'kx-titlebar-row kx-capability-titlebar border-border relative flex h-12 shrink-0 items-center gap-2 border-b px-3';

export function ProjectPageHeader({
  title,
  titleAccessory,
  breadcrumb,
  children,
}: {
  title: string;
  /** The parent page before the title (a link and a separator): "Goals › <goal>". */
  breadcrumb?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const sidebar = useOptionalSidebar();
  // Inside Workspace settings (Repository) the settings page header above is
  // the page's h1 and names the page: this row is only the browser's toolbar.
  const inSettings = useSettingsPageTitle() !== null;
  return (
    <div className={PROJECT_PAGE_HEADER_CLASS} data-sidebar-collapsed={sidebar?.state === 'collapsed' || undefined}>
      <SidebarToggle />
      <div className="kx-titlebar-tabs flex h-full min-w-0 flex-1 items-center gap-1.5">
        {breadcrumb}
        {inSettings ? null : <h1 className="text-foreground truncate text-sm font-medium">{title}</h1>}
        {titleAccessory}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}
