'use client';

import { useTranslations } from '@/i18n/use-translations';
import type { WorkspaceEvalJobConfig, WorkspaceEvalSuite } from '@kortix/sdk';
import { useWorkspaceEvalActions } from '@kortix/sdk/react';
import { Button } from '@kortix/ui/button';
import { Field, FieldLabel } from '@kortix/ui/field';
import { Input } from '@kortix/ui/input';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@kortix/ui/modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kortix/ui/select';
import { errorToast, successToast } from '@kortix/ui/toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { evalJobHref } from './evals-page';

const AS_SUITE = '__suite__';

/**
 * "Run an eval": pick a suite, optionally one agent and a model, attempts and
 * concurrency. The fields override the suite's; left empty they keep it. A
 * started job opens its page.
 */
export function RunEvalModal({
  projectId,
  suites,
  suite: initialSuite,
  open,
  onOpenChange,
}: {
  projectId: string;
  suites: WorkspaceEvalSuite[];
  /** The suite to preselect; null: the first runnable one. */
  suite: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('evals');
  const router = useRouter();
  const { start } = useWorkspaceEvalActions(projectId);
  const runnable = suites.filter((s) => s.config);
  const [suite, setSuite] = useState('');
  const [agent, setAgent] = useState(AS_SUITE);
  const [model, setModel] = useState('');
  const [attempts, setAttempts] = useState('');
  const [concurrency, setConcurrency] = useState('');
  // Each open starts from the suite it was opened for.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSuite(initialSuite ?? runnable[0]?.name ?? '');
      setAgent(AS_SUITE);
      setModel('');
      setAttempts('');
      setConcurrency('');
    }
  }
  const selected = runnable.find((s) => s.name === suite);
  // The agents the suite names, plus the two built-in ones.
  const agentChoices = [...new Set([...(selected?.config?.agents ?? []).map((a) => a.name), 'oracle', 'nop'])];

  const submit = () => {
    const config: Partial<WorkspaceEvalJobConfig> = {};
    if (agent !== AS_SUITE) config.agents = [{ name: agent, ...(model.trim() ? { model_name: model.trim() } : {}) }];
    else if (model.trim() && selected?.config) config.agents = selected.config.agents.map((a) => ({ ...a, model_name: model.trim() }));
    if (Number(attempts) >= 1) config.n_attempts = Math.floor(Number(attempts));
    if (Number(concurrency) >= 1) config.n_concurrent_trials = Math.floor(Number(concurrency));
    start.mutate(
      { suite, ...(Object.keys(config).length ? { config } : {}) },
      {
        onSuccess: (job) => {
          successToast(t('started', { job: job.job_name }));
          onOpenChange(false);
          router.push(evalJobHref(projectId, job.job_id));
        },
        onError: (err) => errorToast(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  return (
    <Modal open={open} onOpenChange={(next) => !start.isPending && onOpenChange(next)}>
      <ModalContent variant="base" showCloseButton={!start.isPending} className="sm:max-w-md" data-testid="evals-run-modal">
        <ModalHeader className="pr-14">
          <ModalTitle>{t('runTitle')}</ModalTitle>
          <ModalDescription className="text-pretty">{t('runDescription')}</ModalDescription>
        </ModalHeader>
        <div className="flex flex-col gap-4 px-5 pb-2">
          <Field>
            <FieldLabel>{t('suite')}</FieldLabel>
            <Select value={suite} onValueChange={(value) => { setSuite(value); setAgent(AS_SUITE); }}>
              <SelectTrigger aria-label={t('suite')} data-testid="evals-run-suite">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {runnable.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>{t('agent')}</FieldLabel>
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger aria-label={t('agent')} data-testid="evals-run-agent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AS_SUITE}>{t('agentDefault')}</SelectItem>
                  {agentChoices.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t('model')}</FieldLabel>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('modelPlaceholder')} aria-label={t('model')} />
            </Field>
            <Field>
              <FieldLabel>{t('attempts')}</FieldLabel>
              <Input type="number" min={1} max={100} value={attempts} onChange={(e) => setAttempts(e.target.value)} placeholder={String(selected?.config?.n_attempts ?? 1)} aria-label={t('attempts')} data-testid="evals-run-attempts" />
            </Field>
            <Field>
              <FieldLabel>{t('concurrency')}</FieldLabel>
              <Input type="number" min={1} max={32} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} placeholder={String(selected?.config?.n_concurrent_trials ?? 4)} aria-label={t('concurrency')} />
            </Field>
          </div>
        </div>
        <ModalFooter>
          <Button onClick={submit} disabled={!selected || start.isPending} aria-busy={start.isPending} data-testid="evals-run-start">
            {t('start')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
