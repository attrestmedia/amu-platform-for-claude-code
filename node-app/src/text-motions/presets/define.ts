import { AMU_TEXT_MOTION_TOKENS as T } from '../core/tokens';
import type {
  BlockTextMotionPreset,
  KeyframeTextMotionPreset,
  MotionKeyframe,
  ScrambleTextMotionPreset,
  ShuffleOrderTextMotionPreset,
  SweepTextMotionPreset,
  TypeTextMotionPreset,
} from '../core/types';

/**
 * 프리셋 정의 헬퍼. 모든 프리셋은 공통 기본값(분할/스태거/이징)을 여기서 상속받는다.
 * id 는 const 타입 파라미터로 리터럴이 보존되어 TextMotionPresetId 유니온이 된다.
 */

type Meta = {
  legacyIds: readonly number[];
  name: string;
  description: string;
  category: KeyframeTextMotionPreset['category'];
  tags: KeyframeTextMotionPreset['tags'];
  durationMs: number;
  staggerMs?: number;
  defaultSplit?: KeyframeTextMotionPreset['defaultSplit'];
  easing?: KeyframeTextMotionPreset['easing'];
};

const base = <M extends Meta>(meta: M) => ({
  ...meta,
  defaultSplit: meta.defaultSplit ?? 'char',
  staggerMs: meta.staggerMs ?? T.stagger.normal,
  easing: meta.easing ?? 'ease',
});

export function keyframes<const Id extends string>(
  id: Id,
  meta: Meta & Pick<KeyframeTextMotionPreset, 'perspective' | 'transformOrigin' | 'hiddenBeforeStart'>,
  frames: readonly MotionKeyframe[],
): KeyframeTextMotionPreset & { id: Id } {
  return {
    kind: 'keyframes',
    id,
    ...base(meta),
    hiddenBeforeStart: meta.hiddenBeforeStart ?? meta.category !== 'exit',
    frames,
  };
}

export function type<const Id extends string>(
  id: Id,
  meta: Meta & Pick<TypeTextMotionPreset, 'cursor' | 'cursorBlinkMs'>,
): TypeTextMotionPreset & { id: Id } {
  return { kind: 'type', id, ...base(meta) };
}

export function scramble<const Id extends string>(
  id: Id,
  meta: Omit<Meta, 'durationMs'> & Pick<ScrambleTextMotionPreset, 'charset' | 'frameMs' | 'scrambleFrames'>,
): ScrambleTextMotionPreset & { id: Id } {
  return { kind: 'scramble', id, ...base({ ...meta, durationMs: meta.frameMs * meta.scrambleFrames }) };
}

export function shuffleOrder<const Id extends string>(id: Id, meta: Meta): ShuffleOrderTextMotionPreset & { id: Id } {
  return { kind: 'shuffle-order', id, ...base(meta) };
}

export function block<const Id extends string>(id: Id, meta: Meta): BlockTextMotionPreset & { id: Id } {
  return { kind: 'block', id, ...base({ ...meta, defaultSplit: 'whole' }) };
}

export function sweep<const Id extends string>(id: Id, meta: Meta): SweepTextMotionPreset & { id: Id } {
  return { kind: 'sweep', id, ...base(meta) };
}
