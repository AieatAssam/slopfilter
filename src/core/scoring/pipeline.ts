import type { Post } from '@/core/post';
import type { ScoreBreakdown, ScoringConfig, SignalResult } from './types';
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
    };
  }

  const contributions = usable.map((result) => {
    const weight = config.weights[result.layerId];
    return {
      layerId: result.layerId,
      score: result.score,
      weight,
      weighted: result.score * weight,
      reason: result.reason,
    };
  });
  const totalWeight = contributions.reduce((sum, contribution) => sum + contribution.weight, 0);
  if (totalWeight <= 0) {
    return {
      compositeScore: 0,
      threshold: config.hideThreshold,
      hidden: false,
      contributions,
      reasons: contributions.flatMap(({ reason }) => (reason ? [reason] : [])),
    };
  }

  const compositeScore =
    contributions.reduce((sum, contribution) => sum + contribution.weighted, 0) / totalWeight;
  const veto = VETO_RULES.find((rule) => rule.applies(usable));
  const reasons = contributions.flatMap(({ reason }) => (reason ? [reason] : []));
  if (veto) reasons.push(veto.reason);

  return {
    compositeScore,
    threshold: config.hideThreshold,
    hidden: compositeScore >= config.hideThreshold || veto !== undefined,
    contributions,
    reasons,
  };
}
