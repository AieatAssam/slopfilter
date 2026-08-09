import type { Post } from '@/core/post';
import type { ScoreBreakdown, ScoreContribution, ScoringConfig, SignalResult } from './types';
import { VETO_RULES } from './weights';

export function scorePost(
  post: Post,
  results: readonly SignalResult[],
  config: ScoringConfig,
): ScoreBreakdown {
  void post;
  const usable = results.filter((result) => result.ok);
  if (usable.length === 0) {
    return {
      compositeScore: 0,
      threshold: config.hideThreshold,
      hidden: false,
      contributions: [],
      reasons: [],
      totalWeight: 0,
      requiredDelta: Math.max(0, config.hideThreshold),
    };
  }

  const contributions = usable.map((result) => {
    const weight = Math.max(0, config.weights[result.layerId] ?? 0);
    const contribution: ScoreContribution = {
      layerId: result.layerId,
      score: Math.max(0, Math.min(1, result.score)),
      weight,
      weighted: Math.max(0, Math.min(1, result.score)) * weight,
      reason: result.reason,
    };
    if (result.detail) contribution.detail = result.detail;
    return contribution;
  });
  const totalWeight = contributions.reduce((sum, contribution) => sum + contribution.weight, 0);
  if (totalWeight <= 0) {
    return {
      compositeScore: 0,
      threshold: config.hideThreshold,
      hidden: false,
      contributions,
      reasons: contributions.flatMap(({ reason }) => (reason ? [reason] : [])),
      totalWeight,
      requiredDelta: Math.max(0, config.hideThreshold),
    };
  }

  // PRD section 4: composite is the additive sum of weighted layer scores, not a weighted mean.
  // Called layers add; absent, disabled, or gated layers abstain and never dilute.
  const compositeScore = Math.max(
    0,
    Math.min(
      1,
      contributions.reduce((sum, contribution) => sum + contribution.weighted, 0),
    ),
  );
  const veto = VETO_RULES.find((rule) => rule.applies(usable));
  const reasons = contributions.flatMap(({ reason }) => (reason ? [reason] : []));
  if (veto) reasons.push(veto.reason);

  return {
    compositeScore,
    threshold: config.hideThreshold,
    hidden: compositeScore >= config.hideThreshold || veto !== undefined,
    contributions,
    reasons,
    totalWeight,
    requiredDelta: Math.max(0, config.hideThreshold - compositeScore),
  };
}
