import type {
  AdminConnector,
  OnboardingCompanySize,
  OnboardingProfile,
  OnboardingUseCase,
} from '@kortix/sdk';

export const ONBOARDING_STEPS = ['profile', 'model', 'apps', 'finish'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Every use case the API keeps (`ONBOARDING_USE_CASES` in project-settings.ts), in display order. */
export const useCases: readonly OnboardingUseCase[] = [
  'founder',
  'engineering',
  'product_design',
  'sales',
  'marketing',
  'support',
  'finance_ops',
  'hr_recruiting',
  'other',
];

export const companySizes: readonly OnboardingCompanySize[] = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

/** Apps a new workspace is offered, one click each (Composio, as the project's shared account). */
export interface OnboardingApp {
  /** The Composio app id. */
  slug: string;
  name: string;
}

/** The app's logo, from the Composio catalogue it connects through. */
export function appLogoUrl(app: OnboardingApp): string {
  return `https://logos.composio.dev/api/${app.slug}`;
}

export const ONBOARDING_APPS: readonly OnboardingApp[] = [
  { slug: 'github', name: 'GitHub' },
  { slug: 'gmail', name: 'Gmail' },
  { slug: 'googlecalendar', name: 'Google Calendar' },
  { slug: 'notion', name: 'Notion' },
  { slug: 'linear', name: 'Linear' },
];

/** Whether the workspace holds any profile answer the API keeps. */
export function hasSavedProfile(profile: OnboardingProfile): boolean {
  return Boolean(profile.use_case || profile.use_case_note || profile.company_size || profile.company_domain);
}

/**
 * Where the wizard opens: the profile until it holds an answer, else the
 * model. Saved answers live on the workspace, so this resumes on any device.
 */
export function firstOnboardingStep(profile: OnboardingProfile): OnboardingStep {
  return hasSavedProfile(profile) ? 'model' : 'profile';
}

/** `https://www.Acme.com/about` → `acme.com`. Not a validator: the API keeps any non-empty text. */
export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

/**
 * The fields worth sending: only what the person answered. An empty string
 * would not clear a saved answer (the API ignores it), so it is left out, and
 * the note goes only with `other`.
 */
export function profileToSave(input: {
  use_case?: OnboardingUseCase;
  use_case_note: string;
  company_size?: OnboardingCompanySize;
  company_domain: string;
}): OnboardingProfile {
  const profile: OnboardingProfile = {};
  if (input.use_case) profile.use_case = input.use_case;
  const note = input.use_case_note.trim();
  if (input.use_case === 'other' && note) profile.use_case_note = note;
  if (input.company_size) profile.company_size = input.company_size;
  const domain = normalizeDomain(input.company_domain);
  if (domain) profile.company_domain = domain;
  return profile;
}

/**
 * The workspace's connector for an app: a Composio connector this wizard (or
 * the connectors page's one-click add) named after the app.
 */
export function appConnector(connectors: readonly AdminConnector[], app: OnboardingApp): AdminConnector | undefined {
  return connectors.find(
    (connector) => connector.provider === 'composio' && connector.name.trim().toLowerCase() === app.name.toLowerCase(),
  );
}
