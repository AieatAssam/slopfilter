import { payloadContract, validatePayloadContract } from './payload';
import { resolveSelector, selectorContract } from './selectors';

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
