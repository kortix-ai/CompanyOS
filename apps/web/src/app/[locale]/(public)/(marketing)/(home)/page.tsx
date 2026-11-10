import { OnePromptHome } from '@/features/marketing/one-prompt/one-prompt-home';

/**
 * kortix.com: one prompt to your coding agent deploys a template of agents
 * onto your repository. The CompanyOS page that stood here is at /companyos.
 * The rails sit 62px in from each edge, as on every marketing page.
 */
export default function Home() {
  return (
    <main className="bg-background relative mx-auto w-full max-w-[1440px]">
      <div aria-hidden className="bg-border pointer-events-none absolute inset-y-0 left-4 z-10 w-px lg:left-17" />
      <div aria-hidden className="bg-border pointer-events-none absolute inset-y-0 right-4 z-10 w-px lg:right-17" />
      <OnePromptHome />
    </main>
  );
}
