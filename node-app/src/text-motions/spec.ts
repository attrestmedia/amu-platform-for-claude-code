import { isMotionEasing } from './core/easing';
import { AMU_TEXT_MOTION_TOKENS } from './core/tokens';
import type { MotionEasing, StaggerFrom, TextSplit } from './core/types';
import { isTextMotionPresetId, type TextMotionPresetId } from './presets/registry';

/**
 * TextMotionSpec — AMU 가 저장/전송하는 텍스트 모션의 "의미 구조" (렌더러 중립 JSON 계약).
 * LLM 은 코드가 아니라 이 JSON 만 생성하고, parseTextMotionSpec 으로 검증 후 어댑터가 렌더한다.
 * (motion-content-ui-system.md §9–10: Renderer 가 아닌 의미 구조를 SSOT 로)
 */
export interface TextMotionSpec {
  preset: TextMotionPresetId;
  text: string;
  split?: TextSplit;
  durationMs?: number;
  staggerMs?: number;
  delayMs?: number;
  staggerFrom?: StaggerFrom;
  easing?: MotionEasing;
  /** 절차형(shuffle, random 등) 결과를 고정하는 시드. 같은 시드 = 같은 결과 */
  seed?: number;
  loop?: boolean;
  loopDelayMs?: number;
}

/** 프리셋 기본값을 덮어쓰는 옵션 (spec 에서 preset/text 를 뺀 것) */
export type TextMotionOptions = Omit<TextMotionSpec, 'preset' | 'text'>;

export const TEXT_SPLITS: readonly TextSplit[] = ['char', 'word', 'line', 'whole'];
export const STAGGER_FROMS: readonly StaggerFrom[] = ['start', 'end', 'center', 'edges', 'random'];

const SPEC_KEYS = new Set<keyof TextMotionSpec>([
  'preset',
  'text',
  'split',
  'durationMs',
  'staggerMs',
  'delayMs',
  'staggerFrom',
  'easing',
  'seed',
  'loop',
  'loopDelayMs',
]);

export type TextMotionSpecResult = { ok: true; spec: TextMotionSpec } | { ok: false; errors: string[] };

/** 외부 입력(LLM/JSON/DB)을 엄격 검증. 알 수 없는 키도 거부한다. */
export function parseTextMotionSpec(input: unknown): TextMotionSpecResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['spec 은 객체여야 합니다.'] };
  }
  const raw = input as Record<string, unknown>;
  const { limits } = AMU_TEXT_MOTION_TOKENS;

  for (const key of Object.keys(raw)) {
    if (!SPEC_KEYS.has(key as keyof TextMotionSpec)) errors.push(`알 수 없는 필드: ${key}`);
  }
  if (!isTextMotionPresetId(raw.preset)) errors.push(`preset 이 올바르지 않습니다: ${String(raw.preset)}`);
  if (typeof raw.text !== 'string' || raw.text.length === 0) errors.push('text 는 비어있지 않은 문자열이어야 합니다.');
  else if (raw.text.length > limits.maxTextLength) errors.push(`text 는 ${limits.maxTextLength}자 이하여야 합니다.`);

  const range = (key: keyof TextMotionSpec, max: number) => {
    const value = raw[key];
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
      errors.push(`${key} 는 0 이상 ${max} 이하의 숫자여야 합니다.`);
    }
  };
  range('durationMs', limits.maxDurationMs);
  range('staggerMs', limits.maxStaggerMs);
  range('delayMs', limits.maxDelayMs);
  range('loopDelayMs', limits.maxLoopDelayMs);

  if (raw.split !== undefined && !TEXT_SPLITS.includes(raw.split as TextSplit)) {
    errors.push(`split 은 ${TEXT_SPLITS.join(' | ')} 중 하나여야 합니다.`);
  }
  if (raw.staggerFrom !== undefined && !STAGGER_FROMS.includes(raw.staggerFrom as StaggerFrom)) {
    errors.push(`staggerFrom 은 ${STAGGER_FROMS.join(' | ')} 중 하나여야 합니다.`);
  }
  if (raw.easing !== undefined && !isMotionEasing(raw.easing)) {
    errors.push('easing 은 AMU easing 이름 또는 [x1, y1, x2, y2] (x ∈ [0,1]) 이어야 합니다.');
  }
  if (raw.seed !== undefined && (typeof raw.seed !== 'number' || !Number.isInteger(raw.seed))) {
    errors.push('seed 는 정수여야 합니다.');
  }
  if (raw.loop !== undefined && typeof raw.loop !== 'boolean') errors.push('loop 는 boolean 이어야 합니다.');

  return errors.length ? { ok: false, errors } : { ok: true, spec: raw as unknown as TextMotionSpec };
}
