import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ProjectSelector } from '@/features/workspace/project-selector/project-selector';

/**
 * `/projects` — the project selector: create a project, join an invite, or
 * open any project in any account the user belongs to. The landing door
 * (`/projects/start`) sends the user here whenever it has no single obvious
 * project to open.
 */
export default async function ProjectsPage() {
  if ((await headers()).has('x-kortix-browser-slot')) {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Browser identity unavailable');
  }
  return <ProjectSelector />;
}
