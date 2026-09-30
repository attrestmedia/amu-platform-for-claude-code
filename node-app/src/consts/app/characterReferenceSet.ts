// 역할 슬롯 정본. 스키마·validator·UI가 각자 배열을 복제하지 않고 여기만 참조한다.
export const CHARACTER_REFERENCE_IMAGE_ROLES = [
  "profile",
  "frontFullBody",
  "faceCloseup",
  "leftFullBody",
  "rightFullBody",
  "backFullBody",
  "headlessFrontBody",
  "distanceFaceScale",
] as const;
export type CharacterReferenceImageRoleType = (typeof CHARACTER_REFERENCE_IMAGE_ROLES)[number];

/** 없으면 kit을 사용할 수 없는 차단 역할. 기존 kit의 ready 판정을 유지하기 위해 확장하지 않는다. */
export const CHARACTER_REFERENCE_REQUIRED_IMAGE_ROLES = [
  "profile",
  "frontFullBody",
  "faceCloseup",
] as const satisfies readonly CharacterReferenceImageRoleType[];
/** 정체성 축 — 클로즈업 단독보다 원거리 스케일과 한 쌍일 때 전신 생성의 얼굴 드리프트가 줄어든다. */
export const CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES = [
  "faceCloseup",
  "distanceFaceScale",
] as const satisfies readonly CharacterReferenceImageRoleType[];
/** 착장 핏 축 — 헤드리스 컷은 얼굴 없이 핏·기장·비율만 판단하는 기준컷이다. */
export const CHARACTER_REFERENCE_FIT_IMAGE_ROLES = [
  "frontFullBody",
  "headlessFrontBody",
] as const satisfies readonly CharacterReferenceImageRoleType[];
/** 각도 축 — 측면·후면 커버리지. */
export const CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES = [
  "leftFullBody",
  "rightFullBody",
  "backFullBody",
] as const satisfies readonly CharacterReferenceImageRoleType[];

/** 템플릿의 필수 Select 변수명과 역할별 옵션 라벨. 생성 결과를 역할 슬롯에 배정하는 유일한 매핑이다. */
export const CHARACTER_REFERENCE_SHOT_TYPE_VARIABLE_KEY = "샷타입" as const;
export const CHARACTER_REFERENCE_ROLE_SHOT_TYPES: Record<CharacterReferenceImageRoleType, string> = {
  profile: "대표 프로필",
  frontFullBody: "정면 전신",
  faceCloseup: "얼굴 클로즈업",
  leftFullBody: "좌측면 전신",
  rightFullBody: "우측면 전신",
  backFullBody: "후면 전신",
  headlessFrontBody: "헤드리스 정면 전신",
  distanceFaceScale: "원거리 얼굴 스케일",
};
/** 세 패널을 한 장에 담는 시트. 합성 이미지라 단일 역할 슬롯에 배정하지 않고 정체성 앵커 참조로만 쓴다. */
export const CHARACTER_REFERENCE_SHEET_SHOT_TYPE = "캐릭터 시트" as const;
export const CHARACTER_REFERENCE_LOCKED_TEMPLATE_VARIABLE_KEYS = [
  CHARACTER_REFERENCE_SHOT_TYPE_VARIABLE_KEY,
] as const;
