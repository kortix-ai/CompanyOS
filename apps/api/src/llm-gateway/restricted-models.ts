/**
 * Restricted managed models: served to a project only once a Kortix operator
 * turns them on for it (`PUT /v1/admin/api/projects/:id/restricted-models`).
 * Every other project neither lists nor reaches them: the gateway answers as
 * for a model that does not exist (resolve-candidates.ts).
 *
 * Platinum marks these `private` like the voice models, but a private model is
 * otherwise callable by every paid project (the voice calls them by id), so
 * the flag cannot carry this gate: the ids here do.
 *
 * Today: Morph's abliterated models (refusal directions removed), Platinum
 * PR #3798 (owner's call, 2026-11-27: never on for everyone).
 */
export const RESTRICTED_MANAGED_MODEL_IDS: readonly string[] = [
  'kimi-k3.1-pro-abliterated',
  'deepseek-v4.1-flash-abliterated',
];

/** `projects.metadata` key: the restricted ids an operator turned on. Workspace roles never write it. */
export const RESTRICTED_MODELS_METADATA_KEY = 'restricted_models';

export function isRestrictedManagedModelId(id: string): boolean {
  return RESTRICTED_MANAGED_MODEL_IDS.includes(id);
}

/** The restricted ids turned on for a project; anything else stored there is ignored. */
export function readRestrictedModelGrants(metadata: unknown): string[] {
  const value = (metadata as Record<string, unknown> | null)?.[RESTRICTED_MODELS_METADATA_KEY];
  return Array.isArray(value) ? RESTRICTED_MANAGED_MODEL_IDS.filter((id) => value.includes(id)) : [];
}
