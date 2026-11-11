/**
 * `/contact` copy: the ways to reach Kortix and what a demo covers. Its own
 * module, with no React, so the page and its Markdown twin
 * (`/markdown/contact.md`, src/lib/seo/public-content.ts) print the same lines.
 */

export const CONTACT_EMAIL = 'hey@kortix.ai';
export const SUPPORT_EMAIL = 'support@kortix.com';
export const SECURITY_EMAIL = 'security@kortix.com';
export const DISCORD_URL = 'https://discord.com/invite/RvFhXUdZ9H';

/* Every line traces to a row in kortix-brand `claims.md`, word for word. No
   number: the star count is the only sanctioned one, and it is not here. */
export const VALUE_PROPS = [
  {
    title: 'A tailored walkthrough',
    desc: 'See agents run your actual workflows end to end, not a generic demo.',
  },
  {
    title: 'Deploy your way',
    // ACCURACY: not "air-gapped" — `self-host start` pulls images from
    // docker.io. Isolated topologies get scoped with us, not self-served.
    desc: 'Run it on Kortix Cloud, in your VPC, or on your own on-prem network.',
  },
  {
    title: 'Access and audit',
    desc: 'Per-resource permissions for people and agents. Roles, groups, and an audit trail. SAML 2.0 single sign-on and SCIM 2.0.',
  },
  {
    title: 'Compliance',
    desc: 'SOC 2 Type I verified.',
  },
  {
    title: 'Yours to own',
    desc: 'Open source. Read it, fork it, audit it. Any model provider with your own keys.',
  },
];

// The email rows copy their address on click (`CopyRow`); Community opens
// the Discord invite in a new tab (`LinkRow`), like the careers page's links.
export const CHANNELS = [
  { label: 'General', value: CONTACT_EMAIL },
  { label: 'Support', value: SUPPORT_EMAIL },
  { label: 'Security', value: SECURITY_EMAIL },
  { label: 'Community', value: 'Discord', href: DISCORD_URL },
] as const;
