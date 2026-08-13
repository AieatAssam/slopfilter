import type { SignalResult } from '@/core/scoring/types';

export interface TextPatternOutput {
  human: number;
  llm: number;
}

export interface TextPatternConfig {
  minChars: number;
}

const noData = (): SignalResult => ({
  layerId: 'text-pattern',
  ok: false,
  score: 0,
  reason: null,
  detail: { status: 'no-data' },
});

export const scoreTextPattern = (
  output: TextPatternOutput | null | undefined,
  text: string,
  config: TextPatternConfig,
): SignalResult => {
  if (text.length < config.minChars || !output) return noData();
  const human = Number.isFinite(output.human) ? Math.max(0, Math.min(1, output.human)) : 0;
  const llm = Number.isFinite(output.llm) ? Math.max(0, Math.min(1, output.llm)) : 0;
  return {
    layerId: 'text-pattern',
    ok: true,
    score: llm,
    reason: null,
    detail: {
      status: 'scored',
      values: { human, llm, characterCount: text.length },
    },
  };
};
