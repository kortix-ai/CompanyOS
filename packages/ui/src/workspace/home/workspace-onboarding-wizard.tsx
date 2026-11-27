"use client";

import {
  connectorDerivedState,
  getSlackInstallation,
  getSlackMode,
  getWorkspaceModelPicker,
  listConnectors,
  listConnectToolkits,
  setWorkspaceOnboardingComplete,
  setWorkspaceOnboardingProfile,
  type AdminConnector,
  type KortixProject,
  type OnboardingCompanySize,
  type OnboardingProfile,
  type OnboardingUseCase,
} from "@kortix/sdk";
import { contract, FRESHNESS, qk } from "@kortix/sdk/react";
import { ArrowLeftIcon, ArrowRightIcon, KeyIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useTranslations } from "../../i18n";
import { Rise } from "../../internal/auth/auth-primitives";
import { ConnectorLogo } from "../../internal/connector-logo/connector-logo";
import { SolidCheckIcon } from "../../internal/icons/solid-check-icon";
import { cn } from "../../internal/lib/utils";
import { Alert, AlertActions, AlertDescription } from "../../primitives/alert";
import { Button } from "../../primitives/button";
import { Field, FieldLabel } from "../../primitives/field";
import { Input } from "../../primitives/input";
import Loading from "../../primitives/loading";
import { Skeleton } from "../../primitives/skeleton";
import { UiLink } from "../../providers/ui-provider";
import { isRunnableModel } from "../../session/models/model-availability";
import { ModelConnectionLayoutContext } from "../../session/models/model-connection-layout";
import { ConnectPlanRows } from "../../session/models/subscription-offer";
import { useModelConnectionGate } from "../../session/models/use-model-connection-gate";
import { flattenCatalog } from "../../session/models/use-workspace-model-gate";
import {
  connectApp,
  connectionSlugFor,
} from "../projects/onboarding/connect-app";
import { OnboardingArt } from "./onboarding-art";
import {
  ONBOARDING_APPS,
  ONBOARDING_STEPS,
  appConnector,
  appLogoUrl,
  companySizes,
  firstOnboardingStep,
  hasSavedProfile,
  normalizeDomain,
  profileToSave,
  useCases,
  type OnboardingApp,
  type OnboardingStep,
} from "./workspace-onboarding-steps";

/**
 * The guided setup of a new workspace, before its first chat: who the team is,
 * which model runs, which tools the agents reach. Every answer is a real write
 * that the wizard waits for; a step a person skips stays "Not connected", never
 * "Connected". Finishing stamps the workspace onboarded
 * (`PATCH /workspaces/:id/onboarding`), then `onFinished` opens the first chat.
 *
 * Completion is workspace-wide: the stamp ends the wizard for every member.
 * Answers already saved resume the wizard on any device.
 */
export function WorkspaceOnboardingWizard({
  projectId,
  project,
  onFinished,
}: {
  projectId: string;
  project: KortixProject;
  onFinished: () => void;
}) {
  const t = useTranslations("workspaceOnboarding");
  const savedProfile = readProfile(project);
  const [step, setStep] = useState<OnboardingStep>(() =>
    firstOnboardingStep(savedProfile),
  );
  const index = ONBOARDING_STEPS.indexOf(step);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);
  const go = (next: OnboardingStep) => {
    moved.current = true;
    setStep(next);
  };
  const back = index > 0 ? () => go(ONBOARDING_STEPS[index - 1]) : undefined;
  const next = () =>
    go(ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]);

  const models = useWorkspaceModels(projectId);
  const apps = useWorkspaceApps(projectId);

  return (
    <div
      className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="workspace-onboarding"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pt-16 pb-16">
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={t("progress", {
              current: index + 1,
              total: ONBOARDING_STEPS.length,
            })}
            aria-valuemin={1}
            aria-valuemax={ONBOARDING_STEPS.length}
            aria-valuenow={index + 1}
            className="bg-muted h-1 flex-1 overflow-hidden rounded-full"
          >
            <div
              className="bg-foreground h-full w-full origin-left transition-transform duration-moderate ease-out motion-reduce:transition-none"
              style={{
                transform: `scaleX(${(index + 1) / ONBOARDING_STEPS.length})`,
              }}
            />
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {index + 1}/{ONBOARDING_STEPS.length}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <Rise key={step}>
            <OnboardingArt
              kind={
                step === "profile"
                  ? "workspace"
                  : step === "apps"
                    ? "tools"
                    : step
              }
              label={t("art.workspace")}
              detail={t("art.shared")}
            />
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-foreground text-2xl font-medium tracking-tight text-balance outline-none"
            >
              {t(`${step}.title`)}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">
              {t(`${step}.description`)}
            </p>
            <div className="mt-8">
              {step === "profile" ? (
                <ProfileStep
                  projectId={projectId}
                  saved={savedProfile}
                  onSaved={next}
                  onBack={back}
                />
              ) : step === "model" ? (
                <ModelStep
                  projectId={projectId}
                  models={models}
                  onNext={next}
                  onBack={back}
                />
              ) : step === "apps" ? (
                <AppsStep
                  projectId={projectId}
                  apps={apps}
                  onNext={next}
                  onBack={back}
                />
              ) : (
                <FinishStep
                  projectId={projectId}
                  profileSaved={hasSavedProfile(savedProfile)}
                  models={models}
                  apps={apps}
                  onFinished={onFinished}
                  onBack={back}
                />
              )}
            </div>
          </Rise>
        </div>
      </div>
    </div>
  );
}

function readProfile(project: KortixProject): OnboardingProfile {
  const metadata = project.metadata as
    { onboarding?: OnboardingProfile } | null | undefined;
  return metadata?.onboarding ?? {};
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The step's footer: Back on the left, the forward action filling the rest. */
function StepFooter({
  onBack,
  busy = false,
  children,
}: {
  onBack?: () => void;
  /** A write is in flight: leaving the step now would race its answer. */
  busy?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("workspaceOnboarding");
  return (
    <div className="mt-8 flex items-center gap-2">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="hit-area-y-1 gap-1.5"
          disabled={busy}
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4 shrink-0" />
          {t("back")}
        </Button>
      ) : null}
      <div className="flex flex-1 justify-end gap-2">{children}</div>
    </div>
  );
}

/** A single-choice chip group: one tab stop, native buttons, the choice in `aria-pressed`. */
function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            // 44px tap target on a phone, the dense chip from `sm` up.
            "bg-popover text-foreground hover:bg-accent h-12 rounded-md border px-3 text-sm transition-colors duration-fast sm:h-8",
            value === option.id && "border-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProfileStep({
  projectId,
  saved,
  onSaved,
  onBack,
}: {
  projectId: string;
  saved: OnboardingProfile;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("workspaceOnboarding");
  const queryClient = useQueryClient();
  const [useCase, setUseCase] = useState<OnboardingUseCase | undefined>(
    saved.use_case,
  );
  const [note, setNote] = useState(saved.use_case_note ?? "");
  const [size, setSize] = useState<OnboardingCompanySize | undefined>(
    saved.company_size,
  );
  const [domain, setDomain] = useState(saved.company_domain ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = profileToSave({
    use_case: useCase,
    use_case_note: note,
    company_size: size,
    company_domain: domain,
  });
  const empty = Object.keys(profile).length === 0;

  const save = async () => {
    if (empty) {
      onSaved();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The answer is saved before the step moves on, and the cache takes the
      // server's copy, so a reload resumes from what the server holds.
      const updated = await setWorkspaceOnboardingProfile(projectId, profile);
      // A read already in flight would land after this and put the old row back.
      await queryClient.cancelQueries({
        queryKey: qk.project.summary(projectId),
      });
      queryClient.setQueryData(qk.project.summary(projectId), updated);
      onSaved();
    } catch (cause) {
      setError(t("profile.saveFailed", { reason: errorText(cause) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-6"
    >
      <Field>
        <FieldLabel>{t("profile.useCase")}</FieldLabel>
        <ChoiceChips
          label={t("profile.useCase")}
          options={useCases.map((id) => ({ id, label: t(`useCases.${id}`) }))}
          value={useCase}
          onChange={setUseCase}
        />
        {useCase === "other" ? (
          <Input
            aria-label={t("profile.useCaseNote")}
            placeholder={t("profile.useCaseNote")}
            value={note}
            maxLength={120}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2"
          />
        ) : null}
      </Field>
      <Field>
        <FieldLabel>{t("profile.size")}</FieldLabel>
        <ChoiceChips
          label={t("profile.size")}
          options={companySizes.map((id) => ({
            id,
            label: t("profile.sizeOption", { size: id }),
          }))}
          value={size}
          onChange={setSize}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="workspace-onboarding-domain">
          {t("profile.domain")}
        </FieldLabel>
        <Input
          id="workspace-onboarding-domain"
          placeholder={t("profile.domainPlaceholder")}
          inputMode="url"
          autoComplete="url"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          onBlur={() => setDomain((value) => normalizeDomain(value))}
        />
      </Field>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <StepFooter onBack={onBack} busy={saving}>
        <Button
          type="submit"
          size="lg"
          disabled={saving}
          aria-busy={saving || undefined}
          className="hit-area-y-1 gap-1.5"
        >
          {saving ? <Loading className="size-4 shrink-0" /> : null}
          {empty ? t("skip") : t("continue")}
          {saving ? null : <ArrowRightIcon className="size-4 shrink-0" />}
        </Button>
      </StepFooter>
    </form>
  );
}

type ModelsView = {
  loading: boolean;
  failed: boolean;
  ready: number;
  retry: () => void;
};

/**
 * How many models this viewer can run, from the model list the composer reads.
 * Not the workspace gate's open/blocked verdict: that is a navigation policy,
 * and it can open on a remembered or failed read.
 */
function useWorkspaceModels(projectId: string): ModelsView {
  const query = useQuery({
    queryKey: qk.project.modelPicker(projectId),
    queryFn: () => getWorkspaceModelPicker(projectId),
    ...contract("config"),
    retry: false,
    // A model connected in the provider dialog or in another tab shows up here.
    refetchInterval: (current) =>
      current.state.data &&
      !flattenCatalog(current.state.data).some(isRunnableModel)
        ? 10_000
        : false,
  });
  return {
    loading: query.isLoading,
    failed: query.isError,
    ready: query.data
      ? flattenCatalog(query.data).filter(isRunnableModel).length
      : 0,
    retry: () => void query.refetch(),
  };
}

function ModelStep({
  projectId,
  models,
  onNext,
  onBack,
}: {
  projectId: string;
  models: ModelsView;
  onNext: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("workspaceOnboarding");
  const { openConnectProvider, modal } = useModelConnectionGate(undefined, {
    projectId,
  });
  return (
    <div className="flex flex-col gap-5">
      {modal}
      {models.loading ? (
        <Skeleton className="h-12 w-full" />
      ) : models.failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t("model.readFailed")}</AlertDescription>
          <AlertActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={models.retry}
            >
              {t("tryAgain")}
            </Button>
          </AlertActions>
        </Alert>
      ) : models.ready > 0 ? (
        <div className="bg-popover flex items-center gap-3 rounded-md border px-3 py-3 text-sm">
          <StatusMark done />
          <span className="text-foreground">
            {t("model.ready", { count: models.ready })}
          </span>
        </div>
      ) : (
        <>
          <ModelConnectionLayoutContext.Provider value="above">
            <ConnectPlanRows
              projectId={projectId}
              dismissible={false}
              className="sm:grid-cols-1"
            />
          </ModelConnectionLayoutContext.Provider>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full gap-1.5"
            onClick={() => openConnectProvider("providers")}
          >
            <KeyIcon className="size-4 shrink-0" />
            {t("model.addKey")}
          </Button>
        </>
      )}
      <StepFooter onBack={onBack}>
        <Button
          type="button"
          size="lg"
          className="hit-area-y-1 gap-1.5"
          onClick={onNext}
        >
          {models.ready > 0 ? t("continue") : t("skip")}
          <ArrowRightIcon className="size-4 shrink-0" />
        </Button>
      </StepFooter>
    </div>
  );
}

type AppsView = {
  loading: boolean;
  failed: boolean;
  connectors: AdminConnector[];
  slackInstalled: boolean;
  slackInstallUrl: string | null;
  connected: number;
  refresh: () => void;
};

/** The workspace's connectors and its Slack install, from the Customize pages' cache entries. */
function useWorkspaceApps(projectId: string): AppsView {
  const connectorsQuery = useQuery({
    queryKey: qk.project.connectors(projectId),
    queryFn: () => listConnectors(projectId, { includeSchemas: false }),
    ...contract(FRESHNESS.connectors),
    refetchOnWindowFocus: true,
  });
  const slackInstall = useQuery({
    queryKey: ["channels", "slack-install", projectId],
    queryFn: () => getSlackInstallation(projectId),
    refetchOnWindowFocus: true,
  });
  const slackMode = useQuery({
    queryKey: ["channels", "slack-mode", projectId],
    queryFn: () => getSlackMode(projectId),
  });
  const connectors = connectorsQuery.data?.connectors ?? [];
  const slackInstalled = Boolean(slackInstall.data);
  const connectedApps = new Set(connectors.filter((connector) => connectorState(connector) === "connected").map((connector) => connector.name.trim().toLowerCase()));
  if (slackInstalled) connectedApps.add("slack");
  return {
    loading: connectorsQuery.isLoading || slackInstall.isLoading,
    failed: connectorsQuery.isError || slackInstall.isError,
    connectors,
    slackInstalled,
    slackInstallUrl: slackMode.data?.oauth_available
      ? slackMode.data.install_url
      : null,
    connected: connectedApps.size,
    refresh: () => {
      void connectorsQuery.refetch();
      void slackInstall.refetch();
    },
  };
}

function connectorState(
  connector: AdminConnector | undefined,
): "connected" | "missing" | "needs_account" {
  if (!connector) return "missing";
  const state = connectorDerivedState(connector);
  return state === "connected" ||
    (state === null && connector.status === "active")
    ? "connected"
    : "needs_account";
}

function AppsStep({
  projectId,
  apps,
  onNext,
  onBack,
}: {
  projectId: string;
  apps: AppsView;
  onNext: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("workspaceOnboarding");
  const [search, setSearch] = useState("");
  const matches = (name: string) =>
    name.toLowerCase().includes(search.trim().toLowerCase());
  const catalog = useInfiniteQuery({
    queryKey: ["onboarding-app-catalog", projectId, search.trim()],
    queryFn: ({ pageParam }) => listConnectToolkits(projectId, { q: search.trim(), cursor: pageParam, limit: 24 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor : undefined,
    staleTime: 60_000,
  });
  const catalogApps = catalog.data?.pages.flatMap((page) => page.toolkits) ?? [];
  const shownApps = [...ONBOARDING_APPS.filter((app) => matches(app.name)), ...catalogApps.filter((app) => app.slug.toLowerCase() !== 'slack' && !ONBOARDING_APPS.some((featured) => featured.slug === app.slug))];
  const [connecting, setConnecting] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  // The connector slug a first attempt chose, so a retry reuses the connector
  // it created instead of adding a second one.
  const chosenSlugs = useRef<Record<string, string>>({});

  const connect = (app: OnboardingApp) => {
    if (connecting) return;
    const existing = appConnector(apps.connectors, app);
    const slug =
      existing?.slug ??
      connectionSlugFor(
        app,
        chosenSlugs.current[app.slug],
        apps.connectors.map((connector) => connector.slug),
      );
    chosenSlugs.current[app.slug] = slug;
    setConnecting(app.slug);
    setFailures(({ [app.slug]: _dropped, ...rest }) => rest);
    connectApp(
      {
        projectId,
        app: { slug: app.slug, name: app.name, provider: "composio" },
        connectorSlug: slug,
        created: Boolean(existing),
      },
      undefined,
      apps.refresh,
    )
      .catch((cause: unknown) => {
        const message = errorText(cause);
        // Closing the popup is the person changing their mind, not a failure.
        if (!/popup closed/i.test(message))
          setFailures((current) => ({ ...current, [app.slug]: message }));
      })
      .finally(() => {
        setConnecting(null);
        apps.refresh();
      });
  };

  return (
    <div className="flex flex-col gap-5">
      <Input
        aria-label={t("apps.search")}
        placeholder={t("apps.search")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {apps.loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: ONBOARDING_APPS.length + 1 }, (_, n) => (
            <Skeleton key={n} className="h-12 w-full" />
          ))}
        </div>
      ) : apps.failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t("apps.readFailed")}</AlertDescription>
          <AlertActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={apps.refresh}
            >
              {t("tryAgain")}
            </Button>
          </AlertActions>
        </Alert>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {matches("Slack") ? (
            <AppRow
              logo={<ConnectorLogo source={{ nativeApp: "slack" }} size="md" />}
              name="Slack"
              meta={t("apps.slackMeta")}
              done={apps.slackInstalled}
              action={
                apps.slackInstallUrl ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="hit-area-y-2"
                  >
                    <a
                      href={apps.slackInstallUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("apps.addSlack")}
                    </a>
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="hit-area-y-2"
                  >
                    <UiLink
                      href={`/workspaces/${projectId}/admin/connectors?scope=channels`}
                    >
                      {t("apps.connect")}
                    </UiLink>
                  </Button>
                )
              }
            />
          ) : null}
          {shownApps.map((app) => {
            const busy = connecting === app.slug;
            return (
              <AppRow
                key={app.slug}
                logo={
                  <ConnectorLogo source={{ icon: appLogoUrl(app) }} size="md" />
                }
                name={app.name}
                meta={ONBOARDING_APPS.some((featured) => featured.slug === app.slug) ? t(`apps.meta.${app.slug}`) : app.name}
                done={
                  connectorState(appConnector(apps.connectors, app)) ===
                  "connected"
                }
                error={failures[app.slug]}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    // The 29px button, a 44px tap target inside its row.
                    className="hit-area-y-2"
                    disabled={connecting !== null}
                    aria-busy={busy || undefined}
                    aria-label={t("apps.connectName", { name: app.name })}
                    onClick={() => connect(app)}
                  >
                    {busy ? <Loading className="size-4 shrink-0" /> : null}
                    {t("apps.connect")}
                  </Button>
                }
              />
            );
          })}
        </ul>
      )}
      {catalog.isLoading ? <p role="status" className="text-muted-foreground text-sm">{t('apps.loading')}</p> : null}
      {catalog.isError ? <Alert variant="destructive"><AlertDescription>{t('apps.readFailed')}</AlertDescription><AlertActions><Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>{t('tryAgain')}</Button></AlertActions></Alert> : null}
      {!apps.loading && !apps.failed && !catalog.isLoading && !catalog.isError && !matches('Slack') && shownApps.length === 0 ? <p role="status" className="text-muted-foreground text-sm">{t('apps.noResults')}</p> : null}
      {catalog.hasNextPage ? <Button type="button" variant="outline" disabled={catalog.isFetchingNextPage} aria-busy={catalog.isFetchingNextPage || undefined} onClick={() => void catalog.fetchNextPage()}>{t('apps.loadMore')}</Button> : null}
      <p className="text-muted-foreground text-xs text-pretty">
        {t("apps.more")}{" "}
        <UiLink
          href={`/workspaces/${projectId}/admin/connectors`}
          className="text-foreground underline underline-offset-2"
        >
          {t("apps.browse")}
        </UiLink>
      </p>
      <StepFooter onBack={onBack}>
        <Button
          type="button"
          size="lg"
          className="hit-area-y-1 gap-1.5"
          onClick={onNext}
        >
          {apps.connected > 0 ? t("continue") : t("skip")}
          <ArrowRightIcon className="size-4 shrink-0" />
        </Button>
      </StepFooter>
    </div>
  );
}

function AppRow({
  logo,
  name,
  meta,
  done,
  error,
  action,
}: {
  logo: React.ReactNode;
  name: string;
  meta: string;
  done: boolean;
  error?: string;
  action: React.ReactNode;
}) {
  const t = useTranslations("workspaceOnboarding");
  return (
    <li className="bg-popover flex min-h-20 items-center gap-3 rounded-md border px-4 py-4">
      {logo}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-sm">{name}</span>
        <span
          role={error ? "alert" : undefined}
          className={cn(
            "text-pretty text-xs",
            error ? "text-kortix-red" : "text-muted-foreground",
          )}
          title={error}
        >
          {error ?? meta}
        </span>
      </div>
      {done ? (
        <span role="status" className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
          <StatusMark done />
          {t("connected")}
        </span>
      ) : (
        action
      )}
    </li>
  );
}

/** Done: the green check. Not done: an empty dashed ring, never a check. */
function StatusMark({ done }: { done: boolean }) {
  return done ? (
    <SolidCheckIcon className="text-kortix-green size-4 shrink-0" />
  ) : (
    <span
      aria-hidden
      className="border-muted-foreground size-4 shrink-0 rounded-full border border-dashed"
    />
  );
}

function FinishStep({
  projectId,
  profileSaved,
  models,
  apps,
  onFinished,
  onBack,
}: {
  projectId: string;
  profileSaved: boolean;
  models: ModelsView;
  apps: AppsView;
  onFinished: () => void;
  onBack?: () => void;
}) {
  const t = useTranslations("workspaceOnboarding");
  const queryClient = useQueryClient();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      // Waited for: the wizard leaves only once the server holds the stamp,
      // so a refused write keeps the person here with the reason.
      const updated = await setWorkspaceOnboardingComplete(projectId, true);
      await queryClient.cancelQueries({
        queryKey: qk.project.summary(projectId),
      });
      queryClient.setQueryData(qk.project.summary(projectId), updated);
      onFinished();
    } catch (cause) {
      setError(t("finish.failed", { reason: errorText(cause) }));
      setFinishing(false);
    }
  };

  const rows = [
    {
      key: "profile",
      done: profileSaved,
      label: profileSaved
        ? t("finish.profileSaved")
        : t("finish.profileSkipped"),
    },
    {
      key: "model",
      done: models.ready > 0,
      label:
        models.ready > 0
          ? t("model.ready", { count: models.ready })
          : t("finish.modelMissing"),
    },
    {
      key: "apps",
      done: apps.connected > 0,
      label:
        apps.connected > 0
          ? t("finish.appsConnected", { count: apps.connected })
          : t("finish.appsSkipped"),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ul className="bg-popover divide-border divide-y rounded-md border">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-3 px-3 py-3 text-sm"
          >
            <StatusMark done={row.done} />
            <span
              className={row.done ? "text-foreground" : "text-muted-foreground"}
            >
              {row.label}
            </span>
          </li>
        ))}
      </ul>
      {models.ready === 0 && !models.loading ? (
        <Alert variant="warning">
          <AlertDescription>{t("finish.modelWarning")}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <StepFooter onBack={onBack} busy={finishing}>
        <Button
          type="button"
          size="lg"
          className="hit-area-y-1 gap-1.5"
          disabled={finishing}
          aria-busy={finishing || undefined}
          onClick={() => void finish()}
        >
          {finishing ? <Loading className="size-4 shrink-0" /> : null}
          {t("finish.cta")}
          {finishing ? null : <ArrowRightIcon className="size-4 shrink-0" />}
        </Button>
      </StepFooter>
    </div>
  );
}
