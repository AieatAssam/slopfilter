import { payloadContract, validatePayloadContract } from './payload';
import { getEntry, resolveSelector, selectorContract } from './selectors';

export interface SelfTestResult {
  ok: boolean;
  failedSelectorIds: readonly string[];
  optionalFailures: readonly string[];
  contractVersion: string;
}

export interface PayloadHealth {
  ok: boolean;
  contractVersion: string;
  operation: string;
  errors: readonly string[];
}

export function payloadHealth(): PayloadHealth {
  const validation = validatePayloadContract(payloadContract);
  return {
    ok: validation.ok,
    contractVersion: validation.ok ? payloadContract.contractVersion : 'invalid',
    operation: validation.ok ? payloadContract.operation : '',
    errors: validation.errors,
  };
}

export function runSelfTest(root: ParentNode): SelfTestResult {
  const failedSelectorIds: string[] = [];
  const optionalFailures: string[] = [];

  for (const entry of selectorContract.entries) {
    if (resolveSelector(root, entry)) continue;
    (entry.required ? failedSelectorIds : optionalFailures).push(entry.id);
  }

  return {
    ok: failedSelectorIds.length === 0,
    failedSelectorIds,
    optionalFailures,
    contractVersion: selectorContract.contractVersion,
  };
}

// Feed-level only: the app shell (primary column plus a timeline region). Post-level selectors are
// absent on every non-timeline route (Explore, Notifications, a profile), so requiring them during
// SPA navigation pauses filtering on routes that simply have no posts yet. A healthy shell means
// "an X feed may appear here"; post-level readiness is re-checked on each attach, not once for the
// lifetime of the page.
export function runFeedSelfTest(root: ParentNode): SelfTestResult {
  const failedSelectorIds: string[] = [];
  for (const id of ['primary-column', 'timeline-container']) {
    if (resolveSelector(root, getEntry(id))) continue;
    failedSelectorIds.push(id);
  }
  return {
    ok: failedSelectorIds.length === 0,
    failedSelectorIds,
    optionalFailures: [],
    contractVersion: selectorContract.contractVersion,
  };
}
