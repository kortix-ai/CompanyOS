'use client';

import { ArrowClockwiseIcon, ArrowSquareOutIcon, CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useId, useMemo, useState } from 'react';

import { useTranslations } from '../../i18n';
import { cn } from '../../internal/lib/utils';
import { copyToClipboard } from '../../internal/lib/utils/clipboard';
import { Button } from '../../primitives/button';
import Loading from '../../primitives/loading';
import { errorToast, successToast } from '../../primitives/toast';
import { SESSION_TRANSCRIPT_CLASS } from '../../session/thread/session-transcript-class';

import { EXISTING_REPO_DOCS_URL, existingRepoSetupPrompt, repositoryLabel } from './existing-repo-setup-prompt';

/**
 * Project home for a workspace whose repository runs no agent: a linked
 * repository with no `kortix.yaml`, or one that declares no agent and leaves
 * My Kortix off. Without it the composer refuses every send with "No agents
 * available to you", which reads as a permission problem to the person who
 * owns the workspace.
 *
 * Kortix never writes to a linked repository. A person who may change the
 * project copies a prompt into their own coding agent, which writes
 * `kortix.yaml` in their clone, validates it and pushes it. "Check again"
 * re-reads the project; the page becomes the usual home once an agent exists.
 *
 * A person who may read the manifest but not change the project sees who can
 * set it up instead. A plain member never reaches this page: the server
 * answers `manifest_health.state: 'restricted'` to them, and the composer's
 * "ask a manager" refusal already says the right thing.
 */
export function ExistingRepoSetup({
  repoUrl,
  branch,
  canSetUp,
  checking,
  onCheckAgain,
}: {
  repoUrl: string | null | undefined;
  branch: string | null | undefined;
  /** The viewer holds `project.write`: they can push the file. */
  canSetUp: boolean;
  checking: boolean;
  onCheckAgain: () => void;
}) {
  const t = useTranslations('existingRepoSetup');
  const headingId = useId();
  const promptId = useId();
  const repository = repositoryLabel(repoUrl);
  const prompt = useMemo(() => existingRepoSetupPrompt({ repository, branch }), [repository, branch]);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    if (await copyToClipboard(prompt)) {
      setCopied(true);
      successToast(t('copied'));
    } else {
      errorToast(t('copyFailed'));
    }
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section
        aria-labelledby={headingId}
        className={cn(
          SESSION_TRANSCRIPT_CLASS,
          'flex flex-col gap-8 pt-16 pb-8 lg:pt-24',
          'transition-opacity duration-(--duration-slow) ease-out starting:opacity-0',
        )}
      >
        <div className="flex flex-col gap-3">
          <h1 id={headingId} className="text-foreground text-2xl font-medium tracking-tight text-balance">
            {t('title')}
          </h1>
          <p className="text-muted-foreground max-w-prose text-base leading-7 text-pretty">
            {repository
              ? t.rich('intro', {
                  repository,
                  code: (chunks) => <code className="text-foreground font-mono text-sm break-all">{chunks}</code>,
                })
              : t.rich('introNoName', {
                  code: (chunks) => <code className="text-foreground font-mono text-sm break-all">{chunks}</code>,
                })}
          </p>
        </div>

        {canSetUp ? (
          <>
            {/* One click is the whole job here: the copy is the first control. */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={copyPrompt}>
                  {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                  {copied ? t('copyAgain') : t('copy')}
                </Button>
                <Button variant="outline" onClick={onCheckAgain} disabled={checking}>
                  {checking ? <Loading className="text-foreground size-4 shrink-0" /> : <ArrowClockwiseIcon aria-hidden />}
                  {checking ? t('checking') : t('checkAgain')}
                </Button>
                <Button variant="ghost" asChild>
                  <a href={EXISTING_REPO_DOCS_URL} target="_blank" rel="noreferrer">
                    {t('docs')}
                    <ArrowSquareOutIcon aria-hidden />
                  </a>
                </Button>
              </div>
              <p className="text-muted-foreground text-sm leading-5">{t('autoCheck')}</p>
            </div>

            <ol className="text-foreground flex list-decimal flex-col gap-2 pl-5 text-sm leading-6">
              <li>{t('steps.copy')}</li>
              <li>{t('steps.run')}</li>
              <li>{t.rich('steps.push', {
                branch: branch || t('defaultBranch'),
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}</li>
            </ol>

            <div className="flex flex-col gap-2">
              <label htmlFor={promptId} className="text-foreground text-sm font-medium">
                {t('promptLabel')}
              </label>
              <textarea
                id={promptId}
                readOnly
                value={prompt}
                rows={10}
                onFocus={(event) => event.currentTarget.select()}
                className="border-border bg-muted/40 text-foreground w-full resize-none rounded-md border p-4 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm leading-6">{t('member')}</p>
        )}
      </section>
    </div>
  );
}
