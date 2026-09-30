import { AMU_TEXT_MOTION_TOKENS as T } from '../core/tokens';
import { block, keyframes, scramble, shuffleOrder, sweep, type } from './define';

/**
 * AMU Text Motion 프리셋 카탈로그.
 * 원본: .agent/references/NODE_APP/text-motion-library/amu_text_motion_library.md (001–100, 독립 HTML 100개)
 *
 * 원본의 중복 로직(글자 분할, 스태거, 총 길이 계산, 루프, setTimeout 타이머)은 모두 제거하고
 * 프리셋마다 "고유한 부분(키프레임/파라미터)"만 데이터로 남겼다.
 * 공통 동작은 core(segment → timeline → keyframes → style)에서 단일 경로로 처리한다.
 *
 * 정합화 메모
 * - 026 과 029 는 동일 모션 → roll-in 하나로 통합 (legacyIds: [26, 29])
 * - 018/019 는 원본 100% 프레임이 opacity 0 이라 흔들린 뒤 사라지는 버그 → opacity 1 로 보정
 * - 054/055 는 원본에 @keyframes(spotlightSweep, blinkCursor) 정의 누락 → 엔진에서 구현
 * - 3D 계열은 perspective 토큰으로 통일 (원본에 perspective 가 없어 translateZ 가 무효였던 072/094/095/097 포함)
 * - letter-spacing 은 기준 트래킹(--amu-text-motion-tracking) 대비 증분(em)으로 표기
 * - 색상은 #fff 하드코딩 대신 currentColor 기반 (라이트/다크 테마 자동 대응)
 */

const D = T.duration;
const S = T.stagger;
const P = T.perspective;

export const TEXT_MOTION_PRESET_LIST = [
  // ───────────────────────── Basic entrance ─────────────────────────
  keyframes(
    'fade-in',
    { legacyIds: [1], name: 'Fade In', description: '글자가 순서대로 서서히 나타난다.', category: 'entrance', tags: ['basic', 'elegant'], durationMs: D.slow },
    [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }],
  ),
  keyframes(
    'slide-up',
    { legacyIds: [4], name: 'Slide Up', description: '글자가 아래에서 위로 밀려 올라온다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, y: '100%', opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'slide-down',
    { legacyIds: [11], name: 'Slide Down', description: '글자가 위에서 아래로 내려온다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, y: '-100%', opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'slide-from-left',
    { legacyIds: [12], name: 'Slide From Left', description: '글자가 왼쪽에서 밀려 들어온다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, x: '-100%', opacity: 0 }, { offset: 1, x: 0, opacity: 1 }],
  ),
  keyframes(
    'slide-from-right',
    { legacyIds: [13], name: 'Slide From Right', description: '글자가 오른쪽에서 밀려 들어온다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, x: '100%', opacity: 0 }, { offset: 1, x: 0, opacity: 1 }],
  ),
  keyframes(
    'fall-down',
    { legacyIds: [34], name: 'Fall Down', description: '글자가 위에서 짧게 떨어지며 나타난다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, y: -50, opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'rise-up',
    { legacyIds: [35], name: 'Rise Up', description: '글자가 아래에서 짧게 떠오르며 나타난다.', category: 'entrance', tags: ['basic', 'slide'], durationMs: D.normal },
    [{ offset: 0, y: 50, opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'staircase',
    { legacyIds: [74], name: 'Staircase', description: '넓은 간격으로 한 글자씩 계단을 오르듯 등장한다.', category: 'entrance', tags: ['slide', 'elegant'], durationMs: D.normal, staggerMs: S.dramatic },
    [{ offset: 0, y: 50, opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'fly-in-up',
    { legacyIds: [48], name: 'Fly In Up', description: '글자가 멀리 아래에서 빠르게 날아든다.', category: 'entrance', tags: ['slide', 'dramatic'], durationMs: D.slow, staggerMs: S.tight },
    [{ offset: 0, y: 200, opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'fly-in-down',
    { legacyIds: [49], name: 'Fly In Down', description: '글자가 멀리 위에서 빠르게 날아든다.', category: 'entrance', tags: ['slide', 'dramatic'], durationMs: D.slow, staggerMs: S.tight },
    [{ offset: 0, y: -200, opacity: 0 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'giant-slide',
    { legacyIds: [73], name: 'Giant Slide', description: '크게 확대된 글자가 왼쪽에서 미끄러지며 제자리를 찾는다.', category: 'entrance', tags: ['slide', 'scale', 'dramatic'], durationMs: D.medium },
    [{ offset: 0, x: '-200%', scale: 3, opacity: 0 }, { offset: 1, x: 0, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'speed-dash',
    { legacyIds: [78], name: 'Speed Dash', description: '기울어진 채 빠르게 돌진해 멈춘다.', category: 'entrance', tags: ['slide', 'dramatic'], durationMs: D.normal },
    [
      { offset: 0, x: '-200%', skewX: -45, opacity: 0 },
      { offset: 0.7, x: '10%', skewX: -10, opacity: 1 },
      { offset: 1, x: 0, skewX: 0, opacity: 1 },
    ],
  ),

  // ───────────────────────── Scale ─────────────────────────
  keyframes(
    'scale-in',
    { legacyIds: [5], name: 'Scale In', description: '점에서 원래 크기로 커지며 나타난다.', category: 'entrance', tags: ['basic', 'scale'], durationMs: D.normal },
    [{ offset: 0, scale: 0, opacity: 0 }, { offset: 1, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'zoom-in',
    { legacyIds: [27], name: 'Zoom In', description: '빠르게 확대되며 나타난다.', category: 'entrance', tags: ['scale'], durationMs: D.normal, easing: 'amu-standard' },
    [{ offset: 0, scale: 0, opacity: 0 }, { offset: 1, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'zoom-out',
    { legacyIds: [28], name: 'Zoom Out', description: '크게 시작해 원래 크기로 줄어들며 나타난다.', category: 'entrance', tags: ['scale'], durationMs: D.normal },
    [{ offset: 0, scale: 2, opacity: 0 }, { offset: 1, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'pop-in',
    { legacyIds: [36], name: 'Pop In', description: '살짝 넘치게 커졌다가 자리잡는다.', category: 'entrance', tags: ['scale', 'playful'], durationMs: D.normal },
    [{ offset: 0, scale: 0.5, opacity: 0 }, { offset: 0.8, scale: 1.2, opacity: 1 }, { offset: 1, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'elastic-scale',
    { legacyIds: [67], name: 'Elastic Scale', description: '탄성 있게 튕기며 커진다.', category: 'entrance', tags: ['scale', 'elastic', 'playful'], durationMs: D.slow },
    [
      { offset: 0, scale: 0, opacity: 0 },
      { offset: 0.6, scale: 1.3, opacity: 1 },
      { offset: 0.8, scale: 0.9, opacity: 1 },
      { offset: 1, scale: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'zip-in',
    { legacyIds: [85], name: 'Zip In', description: '살짝 회전하며 빠르게 튀어나온다.', category: 'entrance', tags: ['scale', 'rotate', 'playful'], durationMs: D.normal },
    [
      { offset: 0, scale: 0, opacity: 0 },
      { offset: 0.8, scale: 1.1, rotate: 10, opacity: 1 },
      { offset: 1, scale: 1, rotate: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'slit-in-vertical',
    { legacyIds: [37], name: 'Slit In Vertical', description: '세로로 가늘게 열리며 나타난다.', category: 'entrance', tags: ['scale'], durationMs: D.normal },
    [{ offset: 0, scaleY: 0, opacity: 0 }, { offset: 1, scaleY: 1, opacity: 1 }],
  ),
  keyframes(
    'slit-in-horizontal',
    { legacyIds: [38], name: 'Slit In Horizontal', description: '가로로 가늘게 열리며 나타난다.', category: 'entrance', tags: ['scale'], durationMs: D.normal },
    [{ offset: 0, scaleX: 0, opacity: 0 }, { offset: 1, scaleX: 1, opacity: 1 }],
  ),
  keyframes(
    'springy',
    { legacyIds: [81], name: 'Springy', description: '바닥에서 스프링처럼 솟아오른다.', category: 'entrance', tags: ['scale', 'elastic', 'playful'], durationMs: D.medium, transformOrigin: 'bottom' },
    [
      { offset: 0, scaleY: 0, opacity: 0 },
      { offset: 0.5, scaleY: 1.5, opacity: 1 },
      { offset: 0.75, scaleY: 0.8 },
      { offset: 1, scaleY: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'water-drop',
    { legacyIds: [69], name: 'Water Drop', description: '물방울처럼 떨어져 납작하게 퍼졌다가 모양을 찾는다.', category: 'entrance', tags: ['scale', 'elastic', 'playful'], durationMs: D.medium },
    [
      { offset: 0, y: -100, scaleX: 0.1, scaleY: 2, opacity: 0 },
      { offset: 0.5, y: 0, scaleX: 1.5, scaleY: 0.5, opacity: 1 },
      { offset: 1, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
    ],
  ),

  // ───────────────────────── Blur / Focus ─────────────────────────
  keyframes(
    'blur-in',
    { legacyIds: [6], name: 'Blur In', description: '흐릿한 상태에서 초점이 맞으며 나타난다.', category: 'entrance', tags: ['blur', 'elegant'], durationMs: D.slow },
    [{ offset: 0, blur: 12, scale: 1.1, opacity: 0 }, { offset: 1, blur: 0, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'focus-in',
    { legacyIds: [31], name: 'Focus In', description: '크고 흐릿한 글자가 줄어들며 선명해진다.', category: 'entrance', tags: ['blur', 'scale', 'elegant'], durationMs: D.slow },
    [{ offset: 0, blur: 12, scale: 1.5, opacity: 0 }, { offset: 1, blur: 0, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'blur-in-right',
    { legacyIds: [46], name: 'Blur In Right', description: '오른쪽에서 모션블러와 함께 들어온다.', category: 'entrance', tags: ['blur', 'slide'], durationMs: D.medium },
    [{ offset: 0, x: 50, blur: 10, opacity: 0 }, { offset: 1, x: 0, blur: 0, opacity: 1 }],
  ),
  keyframes(
    'blur-in-left',
    { legacyIds: [47], name: 'Blur In Left', description: '왼쪽에서 모션블러와 함께 들어온다.', category: 'entrance', tags: ['blur', 'slide'], durationMs: D.medium },
    [{ offset: 0, x: -50, blur: 10, opacity: 0 }, { offset: 1, x: 0, blur: 0, opacity: 1 }],
  ),
  keyframes(
    'blur-drop',
    { legacyIds: [86], name: 'Blur Drop', description: '흐릿하게 위에서 떨어지며 선명해진다.', category: 'entrance', tags: ['blur', 'slide'], durationMs: D.medium },
    [{ offset: 0, y: -50, blur: 10, opacity: 0 }, { offset: 1, y: 0, blur: 0, opacity: 1 }],
  ),
  keyframes(
    'blur-rise',
    { legacyIds: [87], name: 'Blur Rise', description: '흐릿하게 아래에서 떠오르며 선명해진다.', category: 'entrance', tags: ['blur', 'slide'], durationMs: D.medium },
    [{ offset: 0, y: 50, blur: 10, opacity: 0 }, { offset: 1, y: 0, blur: 0, opacity: 1 }],
  ),
  keyframes(
    'smoke-in',
    { legacyIds: [64], name: 'Smoke In', description: '연기 속에서 모습을 드러낸다.', category: 'entrance', tags: ['blur', 'elegant', 'dramatic'], durationMs: D.slow },
    [{ offset: 0, y: -20, scale: 1.5, blur: 20, opacity: 0 }, { offset: 1, y: 0, scale: 1, blur: 0, opacity: 1 }],
  ),
  keyframes(
    'slot-drop',
    { legacyIds: [66], name: 'Slot Drop', description: '슬롯머신 릴처럼 흐릿하게 떨어져 멈춘다.', category: 'entrance', tags: ['blur', 'bounce', 'playful'], durationMs: D.medium },
    [
      { offset: 0, y: '-300%', blur: 5, opacity: 0 },
      { offset: 0.5, y: '20%', blur: 2, opacity: 1 },
      { offset: 1, y: 0, blur: 0, opacity: 1 },
    ],
  ),

  // ───────────────────────── Bounce ─────────────────────────
  keyframes(
    'bounce-in',
    { legacyIds: [8], name: 'Bounce In', description: '위에서 떨어져 통통 튄다.', category: 'entrance', tags: ['bounce', 'playful'], durationMs: D.medium, staggerMs: S.loose },
    [
      { offset: 0, y: -50, opacity: 0, easing: [0.8, 0, 1, 1] },
      { offset: 0.5, y: 15, opacity: 1, easing: [0, 0, 0.2, 1] },
      { offset: 0.75, y: -5, opacity: 1, easing: [0.8, 0, 1, 1] },
      { offset: 1, y: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'drop-in',
    { legacyIds: [14], name: 'Drop In', description: '무겁게 떨어져 한 번 튕긴다.', category: 'entrance', tags: ['bounce', 'dramatic'], durationMs: D.medium, staggerMs: S.relaxed },
    [
      { offset: 0, y: '-200%', opacity: 0 },
      { offset: 0.6, y: '20%', opacity: 1 },
      { offset: 0.8, y: '-10%', opacity: 1 },
      { offset: 1, y: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'bounce-in-left',
    { legacyIds: [41], name: 'Bounce In Left', description: '왼쪽에서 들어와 튕기며 멈춘다.', category: 'entrance', tags: ['bounce', 'slide'], durationMs: D.medium },
    [
      { offset: 0, x: -50, opacity: 0 },
      { offset: 0.6, x: 10, opacity: 1 },
      { offset: 0.8, x: -5, opacity: 1 },
      { offset: 1, x: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'bounce-in-right',
    { legacyIds: [42], name: 'Bounce In Right', description: '오른쪽에서 들어와 튕기며 멈춘다.', category: 'entrance', tags: ['bounce', 'slide'], durationMs: D.medium },
    [
      { offset: 0, x: 50, opacity: 0 },
      { offset: 0.6, x: -10, opacity: 1 },
      { offset: 0.8, x: 5, opacity: 1 },
      { offset: 1, x: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'slingshot',
    { legacyIds: [72], name: 'Slingshot', description: '먼 뒤쪽에서 새총처럼 튀어나온다.', category: 'entrance', tags: ['3d', 'scale', 'dramatic'], durationMs: D.slow, perspective: P.normal },
    [
      { offset: 0, z: -500, scale: 0.1, opacity: 0 },
      { offset: 0.6, z: 100, scale: 1.2, opacity: 1 },
      { offset: 1, z: 0, scale: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'boomerang',
    { legacyIds: [94], name: 'Boomerang', description: '회전하며 멀리서 날아와 제자리로 돌아온다.', category: 'entrance', tags: ['3d', 'rotate', 'dramatic'], durationMs: D.slow, perspective: P.normal },
    [
      { offset: 0, z: -500, rotate: 45, opacity: 0 },
      { offset: 0.5, z: 100, rotate: -10, opacity: 1 },
      { offset: 1, z: 0, rotate: 0, opacity: 1 },
    ],
  ),

  // ───────────────────────── Rotate / Roll ─────────────────────────
  keyframes(
    'rotate-in',
    { legacyIds: [10], name: 'Rotate In', description: '회전하며 커져서 나타난다.', category: 'entrance', tags: ['rotate', 'scale', 'playful'], durationMs: D.normal },
    [{ offset: 0, rotate: -180, scale: 0, opacity: 0 }, { offset: 1, rotate: 0, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'roll-in',
    { legacyIds: [26, 29], name: 'Roll In', description: '통처럼 굴러 왼쪽에서 들어온다.', category: 'entrance', tags: ['rotate', 'slide', 'playful'], durationMs: D.medium },
    [{ offset: 0, x: '-100%', rotate: -120, opacity: 0 }, { offset: 1, x: 0, rotate: 0, opacity: 1 }],
  ),
  keyframes(
    'roll-in-top',
    { legacyIds: [39], name: 'Roll In Top', description: '위에서 굴러 내려온다.', category: 'entrance', tags: ['rotate', 'slide'], durationMs: D.medium },
    [{ offset: 0, y: -50, rotate: -120, opacity: 0 }, { offset: 1, y: 0, rotate: 0, opacity: 1 }],
  ),
  keyframes(
    'roll-in-bottom',
    { legacyIds: [40], name: 'Roll In Bottom', description: '아래에서 굴러 올라온다.', category: 'entrance', tags: ['rotate', 'slide'], durationMs: D.medium },
    [{ offset: 0, y: 50, rotate: 120, opacity: 0 }, { offset: 1, y: 0, rotate: 0, opacity: 1 }],
  ),
  keyframes(
    'swing',
    { legacyIds: [15], name: 'Swing', description: '진자처럼 좌우로 흔들리다 멈춘다.', category: 'emphasis', tags: ['rotate', 'playful'], durationMs: D.slow },
    [
      { offset: 0, rotate: 15, opacity: 0 },
      { offset: 0.2, rotate: 15, opacity: 1 },
      { offset: 0.4, rotate: -10, opacity: 1 },
      { offset: 0.6, rotate: 5, opacity: 1 },
      { offset: 0.8, rotate: -5, opacity: 1 },
      { offset: 1, rotate: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'pendulum',
    { legacyIds: [90], name: 'Pendulum', description: '위쪽을 축으로 매달린 듯 흔들리며 나타난다.', category: 'entrance', tags: ['rotate', 'elegant'], durationMs: D.slower, transformOrigin: 'top' },
    [
      { offset: 0, rotate: 10, opacity: 0 },
      { offset: 0.5, rotate: -5, opacity: 1 },
      { offset: 1, rotate: 0, opacity: 1 },
    ],
  ),

  // ───────────────────────── 3D flip ─────────────────────────
  keyframes(
    'flip-in',
    { legacyIds: [9], name: 'Flip In', description: '아래쪽을 축으로 앞으로 젖혀지며 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.medium, perspective: P.near, transformOrigin: 'bottom' },
    [{ offset: 0, rotateX: -90, opacity: 0 }, { offset: 1, rotateX: 0, opacity: 1 }],
  ),
  keyframes(
    'flip-in-x',
    { legacyIds: [92], name: 'Flip In X', description: 'X축으로 뒤집히며 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.normal, perspective: P.near },
    [{ offset: 0, rotateX: 90, opacity: 0 }, { offset: 1, rotateX: 0, opacity: 1 }],
  ),
  keyframes(
    'flip-in-y',
    { legacyIds: [93], name: 'Flip In Y', description: 'Y축으로 뒤집히며 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.normal, perspective: P.near },
    [{ offset: 0, rotateY: 90, opacity: 0 }, { offset: 1, rotateY: 0, opacity: 1 }],
  ),
  keyframes(
    'rotate-in-x',
    { legacyIds: [44], name: 'Rotate In X', description: 'X축 회전으로 조금 더 천천히 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.medium, perspective: P.near },
    [{ offset: 0, rotateX: 90, opacity: 0 }, { offset: 1, rotateX: 0, opacity: 1 }],
  ),
  keyframes(
    'rotate-in-y',
    { legacyIds: [43], name: 'Rotate In Y', description: 'Y축 회전으로 조금 더 천천히 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.medium, perspective: P.near },
    [{ offset: 0, rotateY: 90, opacity: 0 }, { offset: 1, rotateY: 0, opacity: 1 }],
  ),
  keyframes(
    'flip-bounce',
    { legacyIds: [82], name: 'Flip Bounce', description: '뒤집히며 등장한 뒤 반동으로 흔들린다.', category: 'entrance', tags: ['3d', 'rotate', 'bounce'], durationMs: D.slow, perspective: P.near },
    [
      { offset: 0, rotateX: 90, opacity: 0 },
      { offset: 0.5, rotateX: -20, opacity: 1 },
      { offset: 0.75, rotateX: 10, opacity: 1 },
      { offset: 1, rotateX: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'cube-flip-x',
    { legacyIds: [76], name: 'Cube Flip X', description: '큐브의 윗면이 굴러오듯 X축으로 회전한다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.medium, perspective: P.near },
    [{ offset: 0, rotateX: -90, z: 50, opacity: 0 }, { offset: 1, rotateX: 0, z: 0, opacity: 1 }],
  ),
  keyframes(
    'cube-flip-y',
    { legacyIds: [77], name: 'Cube Flip Y', description: '큐브의 옆면이 굴러오듯 Y축으로 회전한다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.medium, perspective: P.near },
    [{ offset: 0, rotateY: -90, z: 50, opacity: 0 }, { offset: 1, rotateY: 0, z: 0, opacity: 1 }],
  ),
  keyframes(
    'rotate-3d-in',
    { legacyIds: [83], name: 'Rotate 3D In', description: '대각선 축으로 입체 회전하며 나타난다.', category: 'entrance', tags: ['3d', 'rotate', 'dramatic'], durationMs: D.slow, perspective: P.normal },
    [{ offset: 0, rotateXYZ: 90, opacity: 0 }, { offset: 1, rotateXYZ: 0, opacity: 1 }],
  ),
  keyframes(
    'unfold-vertical',
    { legacyIds: [60], name: 'Unfold Vertical', description: '접힌 종이가 세로로 펼쳐지듯 나타난다.', category: 'entrance', tags: ['3d'], durationMs: D.medium, perspective: P.normal },
    [{ offset: 0, rotateX: -90, opacity: 0 }, { offset: 1, rotateX: 0, opacity: 1 }],
  ),
  keyframes(
    'unfold-horizontal',
    { legacyIds: [61], name: 'Unfold Horizontal', description: '접힌 종이가 가로로 펼쳐지듯 나타난다.', category: 'entrance', tags: ['3d'], durationMs: D.medium, perspective: P.normal },
    [{ offset: 0, rotateY: -90, opacity: 0 }, { offset: 1, rotateY: 0, opacity: 1 }],
  ),
  keyframes(
    'swing-in',
    { legacyIds: [88], name: 'Swing In', description: '위쪽에 매달린 간판이 내려오듯 나타난다.', category: 'entrance', tags: ['3d', 'rotate'], durationMs: D.slow, perspective: P.normal, transformOrigin: 'top' },
    [{ offset: 0, rotateX: -100, opacity: 0 }, { offset: 1, rotateX: 0, opacity: 1 }],
  ),
  keyframes(
    'space-in',
    { legacyIds: [95], name: 'Space In', description: '깊은 공간 저편에서 다가온다.', category: 'entrance', tags: ['3d', 'scale', 'dramatic'], durationMs: D.slower, perspective: P.normal },
    [{ offset: 0, scale: 0.2, z: -1000, opacity: 0 }, { offset: 1, scale: 1, z: 0, opacity: 1 }],
  ),
  keyframes(
    'perspective-in',
    { legacyIds: [96], name: 'Perspective In', description: '화면 앞쪽에서 뒤로 물러나며 자리잡는다.', category: 'entrance', tags: ['3d'], durationMs: D.slow, perspective: P.far },
    [{ offset: 0, z: 300, opacity: 0 }, { offset: 1, z: 0, opacity: 1 }],
  ),

  // ───────────────────────── Skew ─────────────────────────
  keyframes(
    'skew-in-up',
    { legacyIds: [56], name: 'Skew In Up', description: '기울어진 채 아래에서 올라온다.', category: 'entrance', tags: ['slide'], durationMs: D.medium },
    [{ offset: 0, y: '100%', skewY: 20, opacity: 0 }, { offset: 1, y: 0, skewY: 0, opacity: 1 }],
  ),
  keyframes(
    'skew-in-down',
    { legacyIds: [57], name: 'Skew In Down', description: '기울어진 채 위에서 내려온다.', category: 'entrance', tags: ['slide'], durationMs: D.medium },
    [{ offset: 0, y: '-100%', skewY: -20, opacity: 0 }, { offset: 1, y: 0, skewY: 0, opacity: 1 }],
  ),
  keyframes(
    'skew-in-left',
    { legacyIds: [58], name: 'Skew In Left', description: '기울어진 채 왼쪽에서 들어온다.', category: 'entrance', tags: ['slide'], durationMs: D.medium },
    [{ offset: 0, x: '-100%', skewX: 30, opacity: 0 }, { offset: 1, x: 0, skewX: 0, opacity: 1 }],
  ),
  keyframes(
    'skew-in-right',
    { legacyIds: [59], name: 'Skew In Right', description: '기울어진 채 오른쪽에서 들어온다.', category: 'entrance', tags: ['slide'], durationMs: D.medium },
    [{ offset: 0, x: '100%', skewX: -30, opacity: 0 }, { offset: 1, x: 0, skewX: 0, opacity: 1 }],
  ),

  // ───────────────────────── Emphasis ─────────────────────────
  keyframes(
    'pulse',
    { legacyIds: [16], name: 'Pulse', description: '한 번 크게 맥박치며 나타난다.', category: 'emphasis', tags: ['scale'], durationMs: D.normal },
    [{ offset: 0, scale: 1, opacity: 0 }, { offset: 0.5, scale: 1.2, opacity: 1 }, { offset: 1, scale: 1, opacity: 1 }],
  ),
  keyframes(
    'heartbeat-burst',
    { legacyIds: [79], name: 'Heartbeat Burst', description: '심장 박동처럼 두 번 뛰며 나타난다.', category: 'emphasis', tags: ['scale', 'elastic'], durationMs: D.slow },
    [
      { offset: 0, scale: 0.5, opacity: 0 },
      { offset: 0.3, scale: 1.2, opacity: 1 },
      { offset: 0.5, scale: 0.9, opacity: 1 },
      { offset: 0.7, scale: 1.1, opacity: 1 },
      { offset: 1, scale: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'flash',
    { legacyIds: [17], name: 'Flash', description: '두 번 깜빡이며 시선을 끈다.', category: 'emphasis', tags: ['basic'], durationMs: D.slower },
    [
      { offset: 0, opacity: 1 },
      { offset: 0.25, opacity: 0 },
      { offset: 0.5, opacity: 1 },
      { offset: 0.75, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'shake-x',
    { legacyIds: [18], name: 'Shake X', description: '좌우로 떨리며 나타난다.', category: 'emphasis', tags: ['playful'], durationMs: D.slow },
    [
      { offset: 0, x: 0, opacity: 0 },
      ...[0.1, 0.3, 0.5, 0.7, 0.9].map((offset) => ({ offset, x: -10, opacity: 1 })),
      ...[0.2, 0.4, 0.6, 0.8].map((offset) => ({ offset, x: 10, opacity: 1 })),
      { offset: 1, x: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'shake-y',
    { legacyIds: [19], name: 'Shake Y', description: '위아래로 떨리며 나타난다.', category: 'emphasis', tags: ['playful'], durationMs: D.slow },
    [
      { offset: 0, y: 0, opacity: 0 },
      ...[0.1, 0.3, 0.5, 0.7, 0.9].map((offset) => ({ offset, y: -10, opacity: 1 })),
      ...[0.2, 0.4, 0.6, 0.8].map((offset) => ({ offset, y: 10, opacity: 1 })),
      { offset: 1, y: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'tada',
    { legacyIds: [20], name: 'Tada', description: '짠! 하고 흔들리며 등장한다.', category: 'emphasis', tags: ['scale', 'rotate', 'playful'], durationMs: D.slow },
    [
      { offset: 0, scale: 1, opacity: 0 },
      ...[0.1, 0.2].map((offset) => ({ offset, scale: 0.9, rotate: -3, opacity: 1 })),
      ...[0.3, 0.5, 0.7, 0.9].map((offset) => ({ offset, scale: 1.1, rotate: 3, opacity: 1 })),
      ...[0.4, 0.6, 0.8].map((offset) => ({ offset, scale: 1.1, rotate: -3, opacity: 1 })),
      { offset: 1, scale: 1, rotate: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'jello',
    { legacyIds: [21], name: 'Jello', description: '젤리처럼 출렁이며 나타난다.', category: 'emphasis', tags: ['elastic', 'playful'], durationMs: D.slow },
    [
      { offset: 0, x: 0, opacity: 0 },
      ...[-12.5, 6.25, -3.125, 1.5625, -0.78125, 0.390625, -0.1953125].map((skew, i) => ({
        offset: Number(((i + 1) * 0.111).toFixed(3)),
        skewX: skew,
        skewY: skew,
        opacity: 1,
      })),
      { offset: 1, x: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'rubber-band',
    { legacyIds: [22], name: 'Rubber Band', description: '고무줄처럼 늘었다 줄었다 한다.', category: 'emphasis', tags: ['scale', 'elastic', 'playful'], durationMs: D.slow },
    [
      { offset: 0, scale: 1, opacity: 0 },
      { offset: 0.3, scaleX: 1.25, scaleY: 0.75, opacity: 1 },
      { offset: 0.4, scaleX: 0.75, scaleY: 1.25, opacity: 1 },
      { offset: 0.5, scaleX: 1.15, scaleY: 0.85, opacity: 1 },
      { offset: 0.65, scaleX: 0.95, scaleY: 1.05, opacity: 1 },
      { offset: 0.75, scaleX: 1.05, scaleY: 0.95, opacity: 1 },
      { offset: 1, scale: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'wave',
    { legacyIds: [23], name: 'Wave', description: '파도처럼 글자가 차례로 솟았다 내려온다.', category: 'emphasis', tags: ['playful'], durationMs: D.medium, staggerMs: S.loose },
    [{ offset: 0, y: 0, opacity: 1 }, { offset: 0.5, y: -15, opacity: 1 }, { offset: 1, y: 0, opacity: 1 }],
  ),
  keyframes(
    'stretch',
    { legacyIds: [24], name: 'Stretch', description: '가로로 늘어났다 돌아온다.', category: 'emphasis', tags: ['scale', 'elastic'], durationMs: D.normal },
    [{ offset: 0, scaleX: 1, opacity: 0 }, { offset: 0.5, scaleX: 1.5, opacity: 1 }, { offset: 1, scaleX: 1, opacity: 1 }],
  ),
  keyframes(
    'squeeze',
    { legacyIds: [25], name: 'Squeeze', description: '세로로 눌렸다 돌아온다.', category: 'emphasis', tags: ['scale', 'elastic'], durationMs: D.normal },
    [{ offset: 0, scaleY: 1, opacity: 0 }, { offset: 0.5, scaleY: 0.5, opacity: 1 }, { offset: 1, scaleY: 1, opacity: 1 }],
  ),
  keyframes(
    'wobble',
    { legacyIds: [50], name: 'Wobble', description: '좌우로 비틀거리며 나타난다.', category: 'emphasis', tags: ['rotate', 'playful'], durationMs: D.slower },
    [
      { offset: 0, x: '0%' },
      { offset: 0.15, x: '-15%', rotate: -5, opacity: 1 },
      { offset: 0.3, x: '10%', rotate: 3 },
      { offset: 0.45, x: '-10%', rotate: -3 },
      { offset: 0.6, x: '5%', rotate: 2 },
      { offset: 0.75, x: '-2%', rotate: -1 },
      { offset: 1, x: '0%', opacity: 1 },
    ],
  ),
  keyframes(
    'glitch',
    { legacyIds: [30], name: 'Glitch', description: '화면 오류처럼 떨리며 나타난다.', category: 'emphasis', tags: ['tech'], durationMs: D.quick, staggerMs: S.dramatic },
    [
      { offset: 0, x: 0, y: 0, opacity: 0 },
      ...[
        [-2, 2],
        [-2, -2],
        [2, 2],
        [2, -2],
        [-2, 2],
        [-2, -2],
        [2, 2],
        [2, -2],
        [-2, 2],
      ].map(([x, y], i) => ({ offset: (i + 1) / 10, x, y, opacity: 1 })),
      { offset: 1, x: 0, y: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'glitch-rgb',
    { legacyIds: [68], name: 'Glitch RGB', description: 'RGB 채널이 어긋났다 맞춰지며 나타난다.', category: 'emphasis', tags: ['tech', 'glow'], durationMs: D.quick, staggerMs: S.dramatic },
    [
      { offset: 0, rgbSplit: 2, opacity: 0 },
      { offset: 0.2, rgbSplit: -2, opacity: 1 },
      { offset: 0.4, rgbSplit: 2 },
      { offset: 0.6, rgbSplit: -2 },
      { offset: 0.8, rgbSplit: 1 },
      { offset: 1, rgbSplit: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'flicker',
    { legacyIds: [45], name: 'Flicker', description: '고장난 형광등처럼 빠르게 깜빡이다 켜진다.', category: 'emphasis', tags: ['tech'], durationMs: D.slowest },
    [
      ...[0, 0.02, 0.04, 0.08, 0.12, 0.16, 0.2].map((offset) => ({ offset, opacity: 0 })),
      ...[0.01, 0.03, 0.05, 0.09, 0.13, 0.17, 0.21, 1].map((offset) => ({ offset, opacity: 1 })),
    ],
  ),
  keyframes(
    'flicker-in',
    { legacyIds: [100], name: 'Flicker In', description: '세 번 깜빡인 뒤 켜진 채로 유지된다.', category: 'entrance', tags: ['tech'], durationMs: D.slowest },
    [
      { offset: 0, opacity: 0 },
      { offset: 0.1, opacity: 1 },
      { offset: 0.2, opacity: 0 },
      { offset: 0.3, opacity: 1 },
      { offset: 0.4, opacity: 0 },
      { offset: 0.5, opacity: 1 },
      { offset: 1, opacity: 1 },
    ],
  ),

  // ───────────────────────── Glow / Outline / Shadow ─────────────────────────
  keyframes(
    'glow-in',
    { legacyIds: [7], name: 'Glow In', description: '빛나며 나타났다가 발광이 가라앉는다.', category: 'entrance', tags: ['glow', 'elegant'], durationMs: D.slower },
    [
      { offset: 0, opacity: 0, glowSize: 0, glowAlpha: 0 },
      { offset: 0.5, opacity: 1, glowSize: 20, glowAlpha: 1 },
      { offset: 1, opacity: 1, glowSize: 0, glowAlpha: 0 },
    ],
  ),
  keyframes(
    'pulse-neon',
    { legacyIds: [91], name: 'Pulse Neon', description: '네온관처럼 발광이 약해졌다 다시 밝아진다.', category: 'emphasis', tags: ['glow', 'tech'], durationMs: D.long },
    [
      { offset: 0, neon: 1, opacity: 1 },
      { offset: 0.5, neon: 0.45, opacity: 0.5 },
      { offset: 1, neon: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'outline-to-solid',
    { legacyIds: [62], name: 'Outline To Solid', description: '외곽선으로 나타난 뒤 속이 채워진다.', category: 'entrance', tags: ['outline', 'elegant'], durationMs: D.slow },
    [
      { offset: 0, stroke: 1, fill: 0, opacity: 0 },
      { offset: 0.5, stroke: 1, fill: 0, opacity: 1 },
      { offset: 1, stroke: 0, fill: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'solid-to-outline',
    { legacyIds: [63], name: 'Solid To Outline', description: '채워진 글자가 나타난 뒤 외곽선만 남는다.', category: 'emphasis', tags: ['outline'], durationMs: D.slow },
    [
      { offset: 0, stroke: 0, fill: 1, opacity: 0 },
      { offset: 0.5, stroke: 0, fill: 1, opacity: 1 },
      { offset: 1, stroke: 1, fill: 0, opacity: 1 },
    ],
  ),
  keyframes(
    'shadow-first',
    { legacyIds: [75], name: 'Shadow First', description: '그림자가 먼저 떠오르고 글자가 뒤따른다.', category: 'entrance', tags: ['shadow', 'elegant'], durationMs: D.slow },
    [
      { offset: 0, shadowY: 50, shadowBlur: 20, shadowAlpha: 0, fill: 0, opacity: 0 },
      { offset: 0.5, shadowY: 0, shadowBlur: 5, shadowAlpha: 0.8, fill: 0, opacity: 1 },
      { offset: 1, shadowY: 0, shadowBlur: 0, shadowAlpha: 0, fill: 1, opacity: 1 },
    ],
  ),
  keyframes(
    'text-shadow-pop',
    { legacyIds: [99], name: 'Text Shadow Pop', description: '입체 그림자와 함께 튀어나온다.', category: 'entrance', tags: ['shadow', 'playful'], durationMs: D.normal },
    [
      { offset: 0, extrude: 0, x: 0, y: 0, opacity: 0 },
      { offset: 1, extrude: 4, x: -4, y: -4, opacity: 1 },
    ],
  ),

  // ───────────────────────── Tracking (letter-spacing) ─────────────────────────
  keyframes(
    'tracking-expand',
    { legacyIds: [52], name: 'Tracking Expand', description: '자간이 좁은 상태에서 펼쳐지며 나타난다.', category: 'entrance', tags: ['spacing', 'elegant'], durationMs: D.slowest, defaultSplit: 'whole', staggerMs: S.none },
    [{ offset: 0, letterSpacing: -0.55, opacity: 0 }, { offset: 1, letterSpacing: 0, opacity: 1 }],
  ),
  keyframes(
    'tracking-contract',
    { legacyIds: [53], name: 'Tracking Contract', description: '넓게 퍼진 자간이 모이며 나타난다.', category: 'entrance', tags: ['spacing', 'elegant'], durationMs: D.slowest, defaultSplit: 'whole', staggerMs: S.none },
    [{ offset: 0, letterSpacing: 0.95, opacity: 0 }, { offset: 1, letterSpacing: 0, opacity: 1 }],
  ),
  keyframes(
    'expand-forward',
    { legacyIds: [97], name: 'Expand Forward', description: '자간이 펼쳐지며 뒤에서 앞으로 다가온다.', category: 'entrance', tags: ['spacing', '3d', 'dramatic'], durationMs: D.slower, defaultSplit: 'whole', staggerMs: S.none, perspective: P.far },
    [{ offset: 0, letterSpacing: -0.55, z: -700, opacity: 0 }, { offset: 1, letterSpacing: 0, z: 0, opacity: 1 }],
  ),
  keyframes(
    'squeeze-expand',
    { legacyIds: [84], name: 'Squeeze Expand', description: '납작하게 눌린 글자가 자간과 함께 튀어오른다.', category: 'entrance', tags: ['spacing', 'elastic'], durationMs: D.slow },
    [
      { offset: 0, letterSpacing: -0.55, scaleY: 0.1, opacity: 0 },
      { offset: 0.5, letterSpacing: 0.15, scaleY: 1.2, opacity: 1 },
      { offset: 1, letterSpacing: 0, scaleY: 1, opacity: 1 },
    ],
  ),

  // ───────────────────────── Transient (등장 후 퇴장) ─────────────────────────
  keyframes(
    'anti-gravity',
    { legacyIds: [70], name: 'Anti Gravity', description: '떠올랐다가 위로 흩어져 사라진다.', category: 'transient', tags: ['elegant'], durationMs: D.extended, staggerMs: S.dramatic },
    [
      { offset: 0, y: 0, opacity: 0 },
      { offset: 0.5, y: -20, opacity: 1 },
      { offset: 1, y: -50, opacity: 0 },
    ],
  ),
  keyframes(
    'falling-leaves',
    { legacyIds: [71], name: 'Falling Leaves', description: '낙엽처럼 흔들리며 떨어져 사라진다.', category: 'transient', tags: ['rotate', 'elegant'], durationMs: D.long, staggerMs: S.dramatic },
    [
      { offset: 0, x: 0, y: -50, rotate: 0, opacity: 0 },
      { offset: 0.5, x: 20, y: 0, rotate: 45, opacity: 1 },
      { offset: 1, x: -20, y: 50, rotate: 90, opacity: 0 },
    ],
  ),
  keyframes(
    'movie-credits',
    { legacyIds: [80], name: 'Movie Credits', description: '엔딩 크레딧처럼 올라왔다가 위로 사라진다.', category: 'transient', tags: ['slide', 'elegant'], durationMs: D.extended, staggerMs: S.dramatic },
    [
      { offset: 0, y: 50, opacity: 0 },
      { offset: 0.2, opacity: 1 },
      { offset: 0.8, opacity: 1 },
      { offset: 1, y: -50, opacity: 0 },
    ],
  ),

  // ───────────────────────── Exit ─────────────────────────
  keyframes(
    'smoke-out',
    { legacyIds: [65], name: 'Smoke Out', description: '연기처럼 흩어지며 사라진다.', category: 'exit', tags: ['blur', 'elegant'], durationMs: D.slow },
    [{ offset: 0, y: 0, scale: 1, blur: 0, opacity: 1 }, { offset: 1, y: -20, scale: 1.5, blur: 20, opacity: 0 }],
  ),
  keyframes(
    'swing-out',
    { legacyIds: [89], name: 'Swing Out', description: '위쪽을 축으로 젖혀지며 사라진다.', category: 'exit', tags: ['3d', 'rotate'], durationMs: D.slow, perspective: P.normal, transformOrigin: 'top' },
    [{ offset: 0, rotateX: 0, opacity: 1 }, { offset: 1, rotateX: -100, opacity: 0 }],
  ),
  keyframes(
    'contract-back',
    { legacyIds: [98], name: 'Contract Back', description: '자간이 좁아지며 뒤로 멀어져 사라진다.', category: 'exit', tags: ['spacing', '3d'], durationMs: D.slower, defaultSplit: 'whole', staggerMs: S.none, perspective: P.far },
    [{ offset: 0, letterSpacing: 0, z: 0, opacity: 1 }, { offset: 1, letterSpacing: -0.55, z: -500, opacity: 0 }],
  ),

  // ───────────────────────── Procedural reveal ─────────────────────────
  type('typewriter', {
    legacyIds: [2],
    name: 'Typewriter',
    description: '타자기처럼 한 글자씩 입력된다.',
    category: 'reveal',
    tags: ['basic', 'tech'],
    durationMs: 0,
    staggerMs: S.loose,
    cursor: false,
    cursorBlinkMs: D.slower,
  }),
  type('terminal-type', {
    legacyIds: [55],
    name: 'Terminal Type',
    description: '깜빡이는 커서와 함께 터미널처럼 입력된다.',
    category: 'reveal',
    tags: ['tech'],
    durationMs: 0,
    staggerMs: S.dramatic,
    cursor: true,
    cursorBlinkMs: D.slower,
  }),
  scramble('shuffle', {
    legacyIds: [3],
    name: 'Shuffle',
    description: '무작위 문자가 돌다가 원래 글자로 확정된다.',
    category: 'reveal',
    tags: ['tech'],
    staggerMs: 60,
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()',
    frameMs: 30,
    scrambleFrames: 15,
  }),
  scramble('binary-decode', {
    legacyIds: [33],
    name: 'Binary Decode',
    description: '0과 1이 해독되며 원래 글자가 드러난다.',
    category: 'reveal',
    tags: ['tech'],
    staggerMs: 120,
    charset: '01',
    frameMs: 40,
    scrambleFrames: 20,
  }),
  shuffleOrder('random-reveal', {
    legacyIds: [32],
    name: 'Random Reveal',
    description: '글자가 무작위 순서로 하나씩 켜진다.',
    category: 'reveal',
    tags: ['tech', 'playful'],
    durationMs: 0,
    staggerMs: S.normal,
  }),
  block('block-reveal', {
    legacyIds: [51],
    name: 'Block Reveal',
    description: '색 블록이 덮었다가 걷히며 텍스트가 드러난다.',
    category: 'reveal',
    tags: ['elegant', 'dramatic'],
    durationMs: D.slower,
    staggerMs: S.none,
    easing: 'amu-anticipate',
  }),
  sweep('spotlight', {
    legacyIds: [54],
    name: 'Spotlight',
    description: '어두운 텍스트 위로 조명이 훑고 지나가며 밝혀진다.',
    category: 'reveal',
    tags: ['glow', 'elegant'],
    durationMs: D.extended,
    staggerMs: S.none,
    defaultSplit: 'whole',
    easing: 'linear',
  }),
] as const;

export type TextMotionPresetId = (typeof TEXT_MOTION_PRESET_LIST)[number]['id'];
