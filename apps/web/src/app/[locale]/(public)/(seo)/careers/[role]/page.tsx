import { isRoleSlug, ROLE_SLUGS, roles } from '@/features/marketing/careers/content';
import { RolePage } from '@/features/marketing/careers/role-page';
import { CANONICAL_ORIGIN } from '@kortix/ui/internal/lib/site-metadata';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ role: string }>;
}

/** Only the role pages in `ROLE_SLUGS` exist; any other slug is a real 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return ROLE_SLUGS.map((role) => ({ role }));
}

/** English-only metadata: the role pages are not in the translated catalog yet. */
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { role } = await props.params;
  if (!isRoleSlug(role)) return {};
  const { title, description } = roles[role].meta;
  const url = `${CANONICAL_ORIGIN}/careers/${role}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: [{ url: '/images/careers/shackleton.png', width: 380, height: 253, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/images/careers/shackleton.png'] },
    alternates: { canonical: url },
  };
}

export default async function CareersRolePage(props: PageProps) {
  const { role } = await props.params;
  if (!isRoleSlug(role)) notFound();
  return <RolePage slug={role} />;
}
