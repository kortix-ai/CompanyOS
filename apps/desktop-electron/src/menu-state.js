const { isAppPath } = require('./nav-rules');

/**
 * The URL a "Copy Current URL" action puts on the clipboard, or null when the
 * window is not on an app page (about:blank, a Chrome error page, a page a
 * redirect committed outside the app): only those open the same session when
 * pasted.
 */
function copyableUrl(url) {
  try {
    const parsed = new URL(url);
    const http = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    return http && isAppPath(parsed.pathname) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function menuContextForUrl(url) {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { inProject: false, hasActiveTab: false };
  }
  const projectId = /^\/(?:workspaces|projects)\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  const inProject = Boolean(projectId && projectId !== 'start' && projectId !== 'new');
  // Every project page is a tab in the window's tab strip
  // (apps/web/src/features/desktop-tabs), so Close Tab works on all of them.
  const hasActiveTab = inProject;
  return { inProject, hasActiveTab };
}

module.exports = { menuContextForUrl, copyableUrl };
