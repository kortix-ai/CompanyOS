import { isRoleSlug, ROLE_SLUGS, roles, type RoleSlug } from '@/features/marketing/careers/content';
import { RolePage } from '@/features/marketing/careers/role-page';
import { safeJsonForHtml } from '@/lib/security/safe-json';
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

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * schema.org `JobPosting`, so the opening is eligible for job search results. Built from the
 * page's own copy. No `baseSalary`: no pay numbers are published (see the accuracy gate in
 * `careers/content.ts`).
 */
function jobPostingJsonLd(slug: RoleSlug) {
  const role = roles[slug];
  const { posting } = role;
  const section = (title: string, rows: readonly { k: string; v: string }[]) =>
    `<p><strong>${escapeHtml(title)}</strong></p><ul>${rows
      .map((row) => `<li><strong>${escapeHtml(row.k)}:</strong> ${escapeHtml(row.v)}</li>`)
      .join('')}</ul>`;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: role.meta.title.replace(/ — Kortix careers$/, ''),
    description: [
      `<p>${escapeHtml(role.hero.sub)}</p>`,
      section(role.own.title, role.own.rows),
      section(role.year.title, role.year.items),
      section(role.have.title, role.have.rows),
    ].join(''),
    datePosted: posting.datePosted,
    employmentType: 'FULL_TIME',
    directApply: true,
    url: `${CANONICAL_ORIGIN}/careers/${slug}`,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Kortix',
      sameAs: CANONICAL_ORIGIN,
      logo: `${CANONICAL_ORIGIN}/icon-512.png`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: posting.locality,
        ...(posting.region ? { addressRegion: posting.region } : {}),
        addressCountry: posting.country,
      },
    },
    ...(posting.remoteCountry
      ? {
          jobLocationType: 'TELECOMMUTE',
          applicantLocationRequirements: { '@type': 'Country', name: posting.remoteCountry },
        }
      : {}),
  };
}

export default async function CareersRolePage(props: PageProps) {
  const { role } = await props.params;
  if (!isRoleSlug(role)) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonForHtml(jobPostingJsonLd(role)) }}
      />
      <RolePage slug={role} />
    </>
  );
}
