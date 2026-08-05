import importedContract from './selectors.json';

export interface SelectorEntry {
  id: string;
  description: string;
  selectors: readonly string[];
  required: boolean;
}

export interface SelectorContract {
  contractVersion: string;
  entries: readonly SelectorEntry[];
}

export const selectorContract: SelectorContract = importedContract;

export interface ContractValidation {
  ok: boolean;
  errors: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function validateSelectorContract(value: unknown): ContractValidation {
  const errors: string[] = [];

  if (
    !isRecord(value) ||
    typeof value.contractVersion !== 'string' ||
    value.contractVersion.length === 0
  ) {
    errors.push('contractVersion must be a non-empty string');
  }

  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return { ok: false, errors };
  }

  value.entries.forEach((entry, index) => {
    const id =
      isRecord(entry) && typeof entry.id === 'string' && entry.id.length > 0
        ? entry.id
        : `entry-${index}`;
    if (!isRecord(entry)) {
      errors.push(`${id} must be an object`);
      return;
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0)
      errors.push(`${id} must have a non-empty id`);
    if (typeof entry.description !== 'string' || entry.description.length === 0) {
      errors.push(`${id} must have a non-empty description`);
    }
    if (typeof entry.required !== 'boolean') errors.push(`${id} must have a boolean required flag`);
    if (
      !Array.isArray(entry.selectors) ||
      entry.selectors.length === 0 ||
      !entry.selectors.every((selector) => typeof selector === 'string' && selector.length > 0)
    ) {
      errors.push(`${id} must have at least one non-empty selector`);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function resolveSelector(root: ParentNode, entry: SelectorEntry): Element | null {
  for (const selector of entry.selectors) {
    try {
      const match = root.querySelector(selector);
      if (match) return match;
    } catch {
      // An invalid fallback is a non-match; callers must fail open.
    }
  }
  return null;
}

export function getEntry(id: string): SelectorEntry {
  const entry = selectorContract.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`selector entry not found: ${id}`);
  return entry;
}
