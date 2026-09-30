import type { IExtendedNpcData, IStageDoc } from "types/game";
import type { NpcScopeType } from "types/ai";

/**
 * @docHint
 * @purpose gameImageUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-assets
 * @scope shared
 */

const resolveUniverseForType = (universeId: string, type: NpcScopeType, isCommerceUniverse?: boolean) => {
  if (type === "user" && isCommerceUniverse) return "theworld";
  return universeId;
};

export const personaBase = (universeId: string, type: NpcScopeType, isCommerceUniverse?: boolean) =>
  `/assets/personas/${resolveUniverseForType(universeId, type, isCommerceUniverse)}`;

// 문자열이 이미 렌더링 가능한 이미지 경로인지 판단
// - 예전 정적 자산: /assets/personas/...
// - 현재 생성/업로드 자산: /apps/gen-studio/..., /uploads/...
// - 내부 라우트/프록시: /api/...
// - 원격/임시 URL: https://..., data:image/..., blob:...
export const isFullPath = (p: string) => {
  const value = String(p || "").trim();
  return /^https?:\/\//.test(value) || value.startsWith("/") || value.startsWith("data:image/") || value.startsWith("blob:");
};

const resolvePersonaProfileImagePath = (value: string, base: string) => {
  const frame = String(value || "").trim();
  if (!frame) return "";
  return isFullPath(frame) ? frame : `${base}/profile/${frame.replace(/^\/+/, "")}`;
};

type PersonaImagePathMeta = {
  spriteBasePath?: string;
  portraitPath?: string;
  /** Tutors API가 private 프로필 이미지를 표시용으로만 전달할 때 사용하는 URL. */
  profileImageDisplayUrl?: string;
};

// 페르소나 객체만으로 base/portrait/sprite 메타를 일괄 처리
export const fromPersona = (
  persona: IExtendedNpcData,
  opts: {
    universeId: string;
    type: NpcScopeType;
    isCommerceUniverse?: boolean;
  }
) => {
  const defaultBase = `${personaBase(opts.universeId, opts.type, opts.isCommerceUniverse)}/${persona.pid}`;
  const imageMeta = persona as IExtendedNpcData & PersonaImagePathMeta;
  const spriteBasePath = imageMeta.spriteBasePath;
  const base = spriteBasePath && spriteBasePath.length > 0 ? spriteBasePath : defaultBase;

  // 2) portrait 경로 해석
  const portraitPath = imageMeta.portraitPath;
  const profileImageDisplayUrl = imageMeta.profileImageDisplayUrl;
  const hasProfileImageDisplayUrl = Object.prototype.hasOwnProperty.call(imageMeta, "profileImageDisplayUrl");
  const hasStoredProfileImage = Boolean(persona.profiles?.default?.[0]);
  let portrait: string;

  if (hasProfileImageDisplayUrl && (profileImageDisplayUrl || hasStoredProfileImage)) {
    portrait = profileImageDisplayUrl || "";
  } else if (portraitPath && portraitPath.length > 0) {
    portrait = portraitPath;
  } else if (hasStoredProfileImage) {
    portrait = resolvePersonaProfileImagePath(persona.profiles.default[0], base);
  } else {
    portrait = `${base}/${persona.pid}.jpg`;
  }

  return {
    base,
    portrait,
    sprite: persona.sprite ?? null,
  };
};

export const getPersonaProfileFramePaths = (
  persona: IExtendedNpcData,
  opts: {
    universeId: string;
    type: NpcScopeType;
    isCommerceUniverse?: boolean;
  },
  variant = "default"
): string[] => {
  const resolved = fromPersona(persona, opts);
  const frames = persona.profiles?.[variant] ?? persona.profiles?.default ?? [];

  return Array.from(
    new Set(
      frames
        .map((frame) => resolvePersonaProfileImagePath(frame, resolved.base))
        .filter(Boolean)
    )
  );
};

// 캐릭터 프로필(썸네일) 전용 헬퍼
export const getPersonaPortrait = (
  persona: IExtendedNpcData,
  opts: {
    universeId: string;
    type: NpcScopeType;
    isCommerceUniverse?: boolean;
  }
): string => {
  const resolved = fromPersona(persona, {
    universeId: persona.universeId || opts.universeId,
    type: opts.type,
    isCommerceUniverse: opts.isCommerceUniverse,
  });

  return resolved.portrait;
};

// 스테이지 자산 공통 처리
// StageDoc의 background.name / asset.fileName / border.* 값은 런타임에서 바로 접근 가능한 URL로 저장한다.
export const resolveStageAssetPath = (_stage: IStageDoc | null | undefined, fileName: string) => {
  const value = String(fileName || "").trim();
  return value;
};
export const stageBlockPath = (stage: IStageDoc | null | undefined, fileName: string) => resolveStageAssetPath(stage, fileName);
