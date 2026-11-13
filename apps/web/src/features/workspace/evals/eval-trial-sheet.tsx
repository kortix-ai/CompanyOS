'use client';

import { useTranslations } from '@/i18n/use-translations';
import type { WorkspaceEvalTiming } from '@kortix/sdk';
import { useWorkspaceEvalTrial, useWorkspaceEvalTrialFile } from '@kortix/sdk/react';
import { Badge } from '@kortix/ui/badge';
import { Button } from '@kortix/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@kortix/ui/sheet';
import { Skeleton } from '@kortix/ui/skeleton';
import Link from 'next/link';
import { useState } from 'react';
import { agentLabel, evalTrialScore } from './eval-meta';

const seconds = (timing: WorkspaceEvalTiming): string =>
  timing.started_at && timing.finished_at ? `${Math.round((Date.parse(timing.finished_at) - Date.parse(timing.started_at)) / 100) / 10} s` : '—';

/** One trial, in a side sheet: rewards, error and policy, timings, tokens, the instruction, and its files. */
export function EvalTrialSheet({ projectId, jobId, trialId, onClose }: { projectId: string; jobId: string; trialId: string | null; onClose: () => void }) {
  const t = useTranslations('evals');
  const detail = useWorkspaceEvalTrial(projectId, jobId, trialId);
  const [picked, setPicked] = useState<string | null>(null);
  const files = detail.data?.files ?? [];
  // The verifier's own output first: it says why the score is what it is.
  const path = picked && files.some((f) => f.path === picked) ? picked : (files.find((f) => f.path === 'verifier/test-stdout.txt') ?? files[0])?.path ?? null;
  const file = useWorkspaceEvalTrialFile(projectId, jobId, trialId, path);
  const trial = detail.data?.trial;
  const score = trial ? evalTrialScore(trial) : null;

  return (
    <Sheet open={!!trialId} onOpenChange={(open) => { if (!open) { setPicked(null); onClose(); } }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="evals-trial-sheet">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{trial?.trial_name ?? t('trial')}</SheetTitle>
          <SheetDescription>{trial ? `${trial.task_path} · ${agentLabel(trial.agent, trial.model)}` : ''}</SheetDescription>
        </SheetHeader>
        {!trial ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 pb-8">
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={score?.passed ? 'success' : trial.exception ? 'warning' : score?.score === null ? 'muted' : 'destructive'} data-testid="evals-trial-result">
                  {score?.score === null ? (trial.status === 'completed' || trial.status === 'errored' ? t('noReward') : t(`trialStatus.${trial.status}`)) : score?.passed ? t('pass') : t('fail')}
                </Badge>
                {trial.rewards
                  ? Object.entries(trial.rewards).map(([key, value]) => (
                      <span key={key} className="text-muted-foreground font-mono text-xs tabular-nums">{`${key} ${value}`}</span>
                    ))
                  : null}
              </div>
              {trial.rewards && !trial.reward_valid ? <p className="text-muted-foreground text-xs">{t('rewardInvalid')}</p> : null}
              {trial.exception ? (
                <div className="bg-kortix-red/15 flex flex-col gap-1 rounded-md p-3 text-xs" data-testid="evals-trial-error">
                  <span className="text-foreground font-medium">{`${trial.exception.exception_type}: ${trial.exception.exception_message}`}</span>
                  <span className="text-muted-foreground">
                    {t('policy', {
                      retry: trial.exception.policy.should_retry ? t('yes') : t('no'),
                      grade: trial.exception.policy.should_grade ? t('yes') : t('no'),
                      valid: trial.exception.policy.has_valid_reward ? t('yes') : t('no'),
                    })}
                  </span>
                </div>
              ) : null}
            </section>
            <section className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-xs font-medium">{t('timings')}</h3>
              <div className="text-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                <span>{`${t('sandbox')} ${seconds(trial.environment_setup)}`}</span>
                <span>{`${t('agentTime')} ${seconds(trial.agent_execution)}`}</span>
                <span>{`${t('verifierTime')} ${seconds(trial.verifier)}`}</span>
                {trial.usage ? <span className="text-muted-foreground">{t('tokens', { input: trial.usage.n_input_tokens.toLocaleString(), output: trial.usage.n_output_tokens.toLocaleString() })}</span> : null}
              </div>
              {trial.session_id ? (
                <Button asChild size="sm" variant="outline" className="mt-1 self-start">
                  <Link href={`/workspaces/${projectId}/sessions/${trial.session_id}`}>{t('openSession')}</Link>
                </Button>
              ) : null}
            </section>
            {detail.data?.instruction ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-muted-foreground text-xs font-medium">{t('instruction')}</h3>
                <p className="text-foreground text-sm whitespace-pre-wrap">{detail.data.instruction}</p>
              </section>
            ) : null}
            <section className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground text-xs font-medium">{t('files')}</h3>
              {files.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t('noFiles')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {files.map((f) => (
                      <Button key={f.path} size="xs" variant={f.path === path ? 'secondary' : 'ghost'} className="font-mono" onClick={() => setPicked(f.path)}>
                        {f.path}
                      </Button>
                    ))}
                  </div>
                  <pre className="bg-muted text-foreground max-h-96 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap" data-testid="evals-trial-file">
                    {file.isLoading ? '…' : (file.data ?? '')}
                  </pre>
                </>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
