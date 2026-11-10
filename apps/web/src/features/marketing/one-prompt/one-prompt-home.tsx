'use client';

import { CodePanel } from '@/features/marketing/code-panel';
import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { FILE_TREE, PLANS, PROMPT, STEPS, TEMPLATES, type HomeTemplate } from './content';

const COPIED_MS = 2000;

/** Copies the setup prompt. Says "Copied" only when the clipboard took it. */
function useCopyPrompt() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return { copied, copy };
}

function CopyPromptButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const { copied, copy } = useCopyPrompt();
  return (
    <MarketingButton size="md" variant={variant} className="hit-area-y-1" onClick={copy}>
      <span aria-live="polite">{copied ? 'Copied. Paste it into your agent' : 'Copy the prompt'}</span>
    </MarketingButton>
  );
}

/** The prompt as the reader's coding agent shows it. */
function PromptPanel() {
  const { copied, copy } = useCopyPrompt();
  return (
    <div className="border-border bg-background w-full rounded-sm border">
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="text-muted-foreground font-mono text-xs">Claude Code, Codex or Cursor · your repo</span>
        <button
          type="button"
          onClick={copy}
          className="text-foreground hover:text-muted-foreground font-mono text-xs underline-offset-4 hover:underline"
        >
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="text-foreground overflow-x-auto px-4 py-4 font-mono text-xs leading-6 whitespace-pre-wrap sm:text-sm sm:leading-7">
        <span className="text-muted-foreground select-none">&gt; </span>
        {PROMPT}
      </pre>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="border-border text-muted-foreground rounded-sm border px-2 py-1 font-mono text-xs">
      {children}
    </span>
  );
}

function TemplateBlock({ template, index }: { template: HomeTemplate; index: number }) {
  return (
    <article
      id={template.id}
      className="border-border grid scroll-mt-24 gap-8 border-t px-8 py-12 lg:grid-cols-2 lg:gap-12 lg:px-28 lg:py-16"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
          <h3 className="text-foreground text-2xl font-medium tracking-tight lg:text-3xl">{template.name}</h3>
        </div>
        <p className="text-muted-foreground max-w-xl text-base text-pretty lg:text-lg">{template.summary}</p>
        <div className="flex flex-col gap-2">
          <span className="text-foreground text-sm font-medium">Starts on</span>
          <div className="flex flex-wrap gap-2">
            {template.triggers.map((trigger) => (
              <Chip key={trigger}>{trigger}</Chip>
            ))}
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {template.agents.map((agent) => (
            <li key={agent.name} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <span className="text-foreground min-w-36 font-mono text-sm">{agent.name}</span>
              <span className="text-muted-foreground text-sm">{agent.role}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 self-start">
        <CodePanel title={template.file} lines={template.excerpt} lang="yaml" className="h-auto" />
        <CodePanel title="Or add it yourself" lines={[`kortix templates add ${template.id}`]} lang="sh" className="h-auto" />
      </div>
    </article>
  );
}

/**
 * kortix.com: one prompt to your coding agent deploys a template of 24/7
 * agents onto your repository. The templates are the page; the CompanyOS
 * story lives at /companyos.
 */
export function OnePromptHome() {
  return (
    <>
      <section id="hero" className="relative">
        <div className="grid gap-10 px-8 pt-32 pb-18 lg:grid-cols-[1fr_minmax(0,560px)] lg:items-end lg:gap-14 lg:px-28 lg:pt-40">
          <div className="flex flex-col gap-5">
            <span className="text-muted-foreground font-mono text-xs">One kortix.yaml in your repo · agents 24/7</span>
            <h1 className="text-foreground text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-[44px] lg:leading-13">
              One prompt deploys a Software Factory on your codebase.
            </h1>
            <p className="text-muted-foreground max-w-2xl text-base text-pretty sm:text-lg md:text-xl">
              Or a security loop that attacks your app every night, an AEO loop that grows your search
              visibility, or a changelog that writes itself. Paste the prompt into your coding agent. It runs
              on your Claude or ChatGPT plan, or any API key.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <CopyPromptButton />
              <MarketingButton variant="secondary" size="md" className="hit-area-y-1" asChild>
                <Link href="#templates">See the templates</Link>
              </MarketingButton>
            </div>
          </div>
          <PromptPanel />
        </div>
        <nav aria-label="Templates" className="border-border grid border-t sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((template, index) => (
            <Link
              key={template.id}
              href={`#${template.id}`}
              className="border-border hover:bg-card flex flex-col gap-1.5 border-b px-8 py-5 transition-colors sm:border-r lg:border-b-0 lg:px-7 lg:first:pl-28"
            >
              <span className="text-muted-foreground font-mono text-xs">{String(index + 1).padStart(2, '0')} · {template.triggers[0]}</span>
              <span className="text-foreground text-base font-medium">{template.name}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section id="templates" className="kx-rail-fade relative scroll-mt-16 border-t">
        <div className="flex flex-col gap-3 px-8 py-12 lg:px-28 lg:pt-16 lg:pb-12">
          <h2 className="text-foreground text-2xl font-medium tracking-tight lg:text-3xl">Pick what runs.</h2>
          <p className="text-muted-foreground max-w-2xl text-base text-pretty lg:text-lg">
            Each template is a folder of agents and the events that start them. Kortix approves every one by
            hand. The prompt asks which ones you want.
          </p>
        </div>
        {TEMPLATES.map((template, index) => (
          <TemplateBlock key={template.id} template={template} index={index} />
        ))}
      </section>

      <section id="how" className="border-border border-t px-8 py-12 lg:px-28 lg:py-16">
        <div className="flex flex-col gap-3 pb-10">
          <h2 className="text-foreground text-2xl font-medium tracking-tight lg:text-3xl">What the prompt does.</h2>
          <p className="text-muted-foreground max-w-2xl text-base text-pretty lg:text-lg">
            Your own coding agent does each step with you and asks before every decision. No secret value
            passes through it.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-sm border sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-background ring-border flex flex-col gap-2 p-6 ring-1">
              <span className="text-muted-foreground font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
              <span className="text-foreground text-base font-medium">{step.title}</span>
              <span className="text-muted-foreground text-sm">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="one-file" className="border-border grid gap-10 border-t px-8 py-12 lg:grid-cols-2 lg:gap-14 lg:px-28 lg:py-16">
        <div className="flex flex-col gap-4">
          <h2 className="text-foreground text-2xl font-medium tracking-tight lg:text-3xl">It is one file in your repo.</h2>
          <p className="text-muted-foreground max-w-xl text-base text-pretty lg:text-lg">
            kortix.yaml imports one folder per template. You review it in a pull request like any other code.
            Delete the folder and its line, and the agents stop. Or keep it all in its own repository, and
            your code gets no file at all.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <span className="text-foreground text-sm font-medium">Runs on the plan you already pay for</span>
            <div className="flex flex-wrap gap-2">
              {PLANS.map((plan) => (
                <Chip key={plan}>{plan}</Chip>
              ))}
            </div>
          </div>
        </div>
        <div className={cn('border-border bg-card rounded-sm border px-5 py-4')}>
          <pre className="text-foreground overflow-x-auto font-mono text-xs leading-6">{FILE_TREE.join('\n')}</pre>
        </div>
      </section>

      <section className="border-border flex flex-col items-start gap-5 border-t px-8 py-14 lg:px-28 lg:py-20">
        <h2 className="text-foreground max-w-2xl text-2xl font-medium tracking-tight text-balance lg:text-3xl">
          Your repo already has a coding agent. Give it this prompt.
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <CopyPromptButton />
          <MarketingButton variant="secondary" size="md" className="hit-area-y-1" asChild>
            <Link href="/docs/developers#set-up-an-existing-repository">Read the guide</Link>
          </MarketingButton>
        </div>
      </section>
    </>
  );
}
