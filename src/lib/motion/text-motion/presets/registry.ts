import type { TextMotionCategory, TextMotionPreset, TextMotionTag } from '../core/types';
import { TEXT_MOTION_PRESET_LIST, type TextMotionPresetId } from './catalog';

export { TEXT_MOTION_PRESET_LIST, type TextMotionPresetId };

export const TEXT_MOTION_PRESETS: Readonly<Record<TextMotionPresetId, TextMotionPreset>> = Object.freeze(
  Object.fromEntries(TEXT_MOTION_PRESET_LIST.map((preset) => [preset.id, preset])) as Record<
    TextMotionPresetId,
    TextMotionPreset
  >,
);

export const TEXT_MOTION_PRESET_IDS = TEXT_MOTION_PRESET_LIST.map((p) => p.id) as readonly TextMotionPresetId[];

const byLegacyId = new Map<number, TextMotionPreset>(
  TEXT_MOTION_PRESET_LIST.flatMap((preset) => preset.legacyIds.map((legacyId) => [legacyId, preset] as const)),
);

export function isTextMotionPresetId(value: unknown): value is TextMotionPresetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEXT_MOTION_PRESETS, value);
}

export function getTextMotionPreset(id: TextMotionPresetId): TextMotionPreset {
  return TEXT_MOTION_PRESETS[id];
}

/** 원본 문서 번호(1–100)로 조회 */
export function getTextMotionPresetByLegacyId(legacyId: number): TextMotionPreset | undefined {
  return byLegacyId.get(legacyId);
}

export function listTextMotionPresets(filter: {
  category?: TextMotionCategory | readonly TextMotionCategory[];
  tags?: readonly TextMotionTag[];
} = {}): TextMotionPreset[] {
  const categories = filter.category === undefined ? null : ([] as TextMotionCategory[]).concat(filter.category);
  return TEXT_MOTION_PRESET_LIST.filter(
    (preset) =>
      (!categories || categories.includes(preset.category)) &&
      (!filter.tags || filter.tags.every((tag) => (preset.tags as readonly TextMotionTag[]).includes(tag))),
  );
}
