'use client';

import type { WorkspaceEvalJobConfig, WorkspaceEvalSuite } from '@kortix/sdk';
import {
  useVisibleAgents,
  useWorkspaceEvalActions,
  useWorkspaceEvalDatasets,
} from '@kortix/sdk/react';
import { useState } from 'react';

import { useTranslations } from '../../i18n';
import { Alert, AlertDescription, AlertTitle } from '../../primitives/alert';
import { Button } from '../../primitives/button';
import { Field, FieldDescription, FieldLabel } from '../../primitives/field';
import { Input } from '../../primitives/input';
import Loading from '../../primitives/loading';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '../../primitives/modal';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../primitives/select';
import { successToast } from '../../primitives/toast';
import { useUiRouter } from '../../providers/ui-provider';
import { evalJobHref } from './eval-meta';

/** What a job runs: a suite of kortix.yaml, or a built-in dataset Kortix ships. */
export type RunTarget = { kind: 'suite'; name: string } | { kind: 'dataset'; name: string };

const AS_SUITE = '__suite__';
const key = (target: RunTarget) => `${target.kind}:${target.name}`;
const parse = (value: string): RunTarget | null => {
  const at = value.indexOf(':');
  const kind = value.slice(0, at);
  return kind === 'suite' || kind === 'dataset' ? { kind, name: value.slice(at + 1) } : null;
};

/**
 * Run an eval: pick a suite or a built-in dataset, an agent, optionally a
 * model, attempts and how many trials run at once. Empty fields keep the
 * suite's own. A started job opens its page.
 */
export function RunEvalModal({
  projectId,
  suites,
  target: initial,
  open,
  onOpenChange,
}: {
  projectId: string;
  suites: WorkspaceEvalSuite[];
  /** The target to preselect; null: the first suite, else the first built-in dataset. */
  target: RunTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('evals');
  const router = useUiRouter();
  const { start } = useWorkspaceEvalActions(projectId);
  const datasets = useWorkspaceEvalDatasets(open ? projectId : null);
  const agents = useVisibleAgents({ projectId });
  const runnable = suites.filter((s) => s.config);
  const builtins = (datasets.data ?? []).filter((d) => d.name.startsWith('kortix/'));

  const [target, setTarget] = useState('');
  const [agent, setAgent] = useState(AS_SUITE);
  const [model, setModel] = useState('');
  const [attempts, setAttempts] = useState('');
  const [concurrency, setConcurrency] = useState('');
  // Each open starts from the target it was opened for.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const first: RunTarget | null =
        initial ?? (runnable[0] ? { kind: 'suite', name: runnable[0].name } : null);
      setTarget(first ? key(first) : '');
      setAgent(first?.kind === 'suite' ? AS_SUITE : '');
      setModel('');
      setAttempts('');
      setConcurrency('');
      start.reset();
    }
  }
  // No suite to preselect: the first built-in dataset, once the list loads.
  if (open && !target && builtins[0]) setTarget(`dataset:${builtins[0].name}`);

  const chosen = parse(target);
  const suite = chosen?.kind === 'suite' ? runnable.find((s) => s.name === chosen.name) : undefined;
  const agentNames = [
    ...new Set([
      ...(suite?.config?.agents ?? []).map((a) => a.name),
      ...agents.map((a) => a.name),
      'oracle',
      'nop',
    ]),
  ];
  const needsAgent = chosen?.kind === 'dataset' && (!agent || agent === AS_SUITE);
  const ready =
    !!chosen && (chosen.kind === 'dataset' || !!suite) && !needsAgent && !start.isPending;

  const submit = () => {
    if (!chosen) return;
    const config: Partial<WorkspaceEvalJobConfig> = {};
    const modelName = model.trim();
    if (agent && agent !== AS_SUITE)
      config.agents = [{ name: agent, ...(modelName ? { model_name: modelName } : {}) }];
    else if (modelName && suite?.config)
      config.agents = suite.config.agents.map((a) => ({
        ...a,
        model_name: modelName,
      }));
    if (Number(attempts) >= 1) config.n_attempts = Math.floor(Number(attempts));
    if (Number(concurrency) >= 1) config.n_concurrent_trials = Math.floor(Number(concurrency));
    if (chosen.kind === 'dataset') {
      config.datasets = [{ name: chosen.name }];
      config.tasks = [];
    }
    start.mutate(
      {
        ...(chosen.kind === 'suite' ? { suite: chosen.name } : {}),
        ...(Object.keys(config).length ? { config } : {}),
      },
      {
        onSuccess: (job) => {
          successToast(t('started', { job: job.job_name }));
          onOpenChange(false);
          router.push(evalJobHref(projectId, job.job_id));
        },
      },
    );
  };
  // The API's `422 eval_invalid` names every problem in `violations`.
  const error = start.error instanceof Error ? start.error : null;
  const body = (error as { data?: { violations?: unknown } } | null)?.data;
  const violations = Array.isArray(body?.violations)
    ? body.violations.filter((v): v is string => typeof v === 'string')
    : [];

  return (
    <Modal open={open} onOpenChange={(next) => !start.isPending && onOpenChange(next)}>
      <ModalContent
        variant="base"
        showCloseButton={!start.isPending}
        className="sm:max-w-lg"
        data-testid="evals-run-modal"
      >
        <ModalHeader className="pr-14">
          <ModalTitle>{t('runTitle')}</ModalTitle>
          <ModalDescription className="text-pretty">{t('runDescription')}</ModalDescription>
        </ModalHeader>
        <form
          className="flex flex-col gap-4 px-5 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) submit();
          }}
        >
          <Field>
            <FieldLabel>{t('whatToRun')}</FieldLabel>
            <Select
              value={target}
              onValueChange={(value) => {
                setTarget(value);
                setAgent(parse(value)?.kind === 'suite' ? AS_SUITE : '');
              }}
            >
              <SelectTrigger aria-label={t('whatToRun')} data-testid="evals-run-target">
                <SelectValue placeholder={t('pickTarget')} />
              </SelectTrigger>
              <SelectContent>
                {runnable.length ? (
                  <SelectGroup>
                    <SelectLabel>{t('suitesGroup')}</SelectLabel>
                    {runnable.map((s) => (
                      <SelectItem key={s.name} value={`suite:${s.name}`}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {builtins.length ? (
                  <SelectGroup>
                    <SelectLabel>{t('builtinGroup')}</SelectLabel>
                    {builtins.map((d) => (
                      <SelectItem key={d.name} value={`dataset:${d.name}`}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            {chosen?.kind === 'dataset' ? (
              <FieldDescription>
                {builtins.find((d) => d.name === chosen.name)?.description}
              </FieldDescription>
            ) : null}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t('agent')}</FieldLabel>
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger aria-label={t('agent')} data-testid="evals-run-agent">
                  <SelectValue placeholder={t('pickAgent')} />
                </SelectTrigger>
                <SelectContent>
                  {chosen?.kind === 'suite' ? (
                    <SelectItem value={AS_SUITE}>{t('agentDefault')}</SelectItem>
                  ) : null}
                  {agentNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name === 'oracle' ? t('agentOracle') : name === 'nop' ? t('agentNop') : name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t('model')}</FieldLabel>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('modelPlaceholder')}
                aria-label={t('model')}
              />
            </Field>
            <Field>
              <FieldLabel>{t('attempts')}</FieldLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={attempts}
                onChange={(e) => setAttempts(e.target.value)}
                placeholder={String(suite?.config?.n_attempts ?? 1)}
                aria-label={t('attempts')}
                data-testid="evals-run-attempts"
              />
            </Field>
            <Field>
              <FieldLabel>{t('concurrency')}</FieldLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={32}
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                placeholder={String(suite?.config?.n_concurrent_trials ?? 4)}
                aria-label={t('concurrency')}
              />
            </Field>
          </div>
          {/* The refusal stays in the modal: a toast disappears before a long violation list is read. */}
          {error ? (
            <Alert variant="destructive" data-testid="evals-run-error">
              <AlertTitle>{t('startFailed')}</AlertTitle>
              <AlertDescription>
                {violations.length ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {violations.map((line) => (
                      <li key={line} className="wrap-break-word">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="wrap-break-word">{error.message}</span>
                )}
              </AlertDescription>
            </Alert>
          ) : null}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            {t('close')}
          </Button>
          <Button
            onClick={submit}
            disabled={!ready}
            aria-busy={start.isPending}
            className="gap-1.5"
            data-testid="evals-run-start"
          >
            {start.isPending ? <Loading className="size-3.5 shrink-0" /> : null}
            {t('start')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
