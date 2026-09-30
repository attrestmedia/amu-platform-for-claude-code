# AMU Motion Story — 모션 커버·스토리모드·영상 렌더 설계와 구현 계획

- 작성: 2026-09-29 06:55 KST · claude-opus-5-5 (Main 오케스트레이터, JUDGE)
- 상태: `proposed` — 코드 변경 0, 원장 변경 0, 외부 쓰기 0
- 입력 참고 문서
  - `.agent/references/AMU_APP/motion-content-ui-system.md` (2,957줄, 상단 "최종 결정 => Rendiv + Motion Canvas")
  - `.agent/references/AMU_APP/amu_threejs_experience_plan.md` (2,958줄)
- 대조한 정본·계약
  - `.agent/references/AMU-MAGAZINE/content-experience/editorial-story-manifest-v1.md`
  - `.agent/references/AMU-MAGAZINE/content-experience/visual-runtime-architecture-v1.md`
  - `.agent/references/AMU-MAGAZINE/content-experience/article-experience-manifest-v1.md`
  - `.agent/amu-platform-guide/` 의 BUSINESS-CHARTER, SERVICE-ROLE-MAP, MEASUREMENT-PLAN, DESIGN-GUIDELINES, DESIGN-COMPONENT-SPECS, CONTENT-INTELLIGENCE, COIN-POLICY-MANUAL, MARKETING-STRATEGY
  - 원장: `todo-ledgers/completed/todo-amu-integrated-reorganization.json`(AIR-500~503, G-AIR-10), `todo-ledgers/in-progress/todo-allmyuniverse-home-renewal.json`, `todo-ledgers/in-progress/todo-elevenlabs-media-routing.json`

---

## 0. 결론

1. **새 시스템을 만들 필요는 없다. 이미 있는 Editorial Story를 넓히면 된다.** `amu_threejs_experience_plan.md`는 2026-09-08 AIR-500에서 이미 `adapt` 판정을 받았다. 그 결과로 계약 두 개(`editorial-story.v1`, `editorial-story-visual-runtime.v1`)가 확정됐다. node-app에는 Motion Cover(`AppMagazineMotionCover.tsx`, R3F)와 Story Mode(`AppMagazineStoryMode.tsx`)도 이미 구현돼 있다. 이번 요청 가운데 앞의 세 가지는 이 기반을 넓히는 작업이다.
   - 홈·아카이브 숏폼형 카드
   - 상세 헤더
   - WP 기사의 스토리모드

   영상 렌더와 TTS는 v1 계약이 "후속 별도 계약"으로 미뤄 둔 항목이다. 여기에 v2 계약을 추가한다.

2. **웹 재생에는 Rendiv·Motion Canvas·Remotion을 넣지 않는다. 영상 export에만 렌더 엔진을 둔다.** 이유는 세 가지다.
   - Motion Canvas는 텍스트를 캔버스에 그린다. "텍스트는 DOM이 권위"라는 확정 계약(visual-runtime §1·§7)과 맞지 않는다.
   - 신규 모션 라이브러리는 승인 대상이다(DESIGN-COMPONENT-SPECS §3). lazy runtime 예산도 180KB gzip이다.
   - 웹에 필요한 기능은 이미 설치된 framer-motion·three·R3F와 브라우저 내장 Web Animations API(WAAPI)로 충분하다.

3. **"같은 장면을 웹에서 재생하고 영상으로도 뽑는다"는 목표는 엔진이 아니라 장면을 설계하는 방식으로 달성한다.**
   - 텍스트 reveal·Ken Burns·전환을 **JSON 키프레임 프리셋(WAAPI)**으로 정의한다.
   - 웹은 `animation.play()`로 재생한다. 영상 렌더러는 프레임마다 `animation.currentTime = t`로 시간을 지정해 캡처한다.
   - 같은 프리셋을 node-app(React)과 WordPress(vanilla JS) 양쪽에서 쓸 수 있다. 번들 비용은 0이다.

4. **참고 문서의 "최종 결정(Rendiv + Motion Canvas)"은 착수 전에 재확인이 필요하다.** 2026-09-29 npm 실측 결과는 다음과 같다.
   - Rendiv: `0.2.6`, 메인테이너 1명, 마지막 배포 2026-06-07
   - Motion Canvas: `3.17.2`, 마지막 배포 **2025-02-16**. 19개월째 릴리스가 없다.

   "Story 축 / 설명 축"이라는 두 문법 구상은 그대로 채택한다. 다만 이를 **엔진이 아니라 템플릿 계열**로 구현하고, 엔진은 export 어댑터 뒤에 숨긴 뒤 PoC bake-off로 고르는 방식을 권고한다.
   - 요청 제목의 "리모션"도 선택지에 넣었다. Remotion은 **직원 3명 이하 영리 조직이면 무료(상업 이용 포함)**다.
   - AMU가 이 조건에 해당하는지는 사용자만 판단할 수 있다(OD-MS-02).

5. **착수를 막는 게이트가 두 개 있다.**
   - **G-AIR-10**(soft): Story 계층은 파일럿 성과 판정 전에 확대하지 않는다. 현재 AIR-503이 `pending_verdict`(n=1)이다. 홈·아카이브 전면 적용은 "확대"에 해당한다. 따라서 판정 기준을 먼저 정의하거나 사용자가 명시적으로 예외를 승인해야 한다(OD-MS-01).
   - **홈 소유권 불일치**: 운영 `/`는 node-app이 서빙하는데, 홈 리뉴얼 원장은 WP 테마를 전제로 한다(§2.2).

---

## 1. 참고 문서 판정

AIR-500이 확정한 판정(`editorial-story-manifest-v1.md` §1)을 기본선으로 둔다. 이번에 새로 들어온 `motion-content-ui-system.md`를 판정하고, 기존 판정에 보탤 항목만 추가한다.

| 참고 문서의 주장 | 판정 | 근거 |
| --- | --- | --- |
| 렌더러를 SSOT로 두지 않는다. 중립 Composition 계약 + 어댑터 | **adopt** | 기존 v1 계약의 "의미/표현 분리"와 같은 방향이다. 엔진 교체 비용을 어댑터 하나로 묶는다 |
| AI는 코드가 아니라 JSON을 만들고, 검증된 primitive를 조립한다 | **adopt** | v1 §3.3 `primitiveKey` allowlist 원칙과 같다 |
| 렌더 워커는 Next.js 프로세스와 분리한다. 처음에는 1 worker, 동시성 1~2 | **adopt** | 운영 `node-app-worker`는 메모리 768m이고 Chromium·ffmpeg가 없다(§2.3) |
| 렌더 가능한 콘텐츠는 결정적이어야 한다(`Math.random`·`Date`·`fetch` 금지) | **adopt** | lint 규칙으로 강제한다(§4.4) |
| Motion Design System(Entrance/Emphasis/Exit/Camera/Transition)을 SSOT로 둔다 | **adopt** | DESIGN-GUIDELINES §17의 motion 원칙을 토큰으로 구체화한다 |
| "영상은 출력 포맷 중 하나"다. 웹 인터랙티브가 1차, export는 선택 | **adopt** | v1 계약과 일치한다 |
| 사용자에게 엔진을 노출하지 않는다("스토리형/설명형/자동") | **adopt** | — |
| Rendiv를 Visual/Story 엔진으로 채택 | **adapt** | export 엔진 **후보**로만 둔다. 0.2.6, 단일 메인테이너, 분산 렌더 로드맵 단계. 웹 런타임에는 넣지 않는다 |
| Motion Canvas를 Knowledge/Explainer 엔진으로 채택 | **defer** | 캔버스 텍스트가 DOM 권위와 충돌한다. npm 릴리스가 19개월 정지 상태다. headless 렌더 공식 경로가 약하다(참고 문서 자체 지적 §2299). 설명형은 DOM/SVG 데이터 primitive로 구현한다 |
| 한 영상 안에서 엔진을 섞는 하이브리드(segment + FFmpeg concat) | **defer** | 참고 문서도 "처음부터 구현할 필요 없음"이라고 적었다 |
| After Effects 대비 85~95% 커버 | 참고치 | 벤치마크가 아닌 추정이다. 대외 인용 금지 |

`amu_threejs_experience_plan.md` 후반부 가운데 AIR-500이 보류한 항목이 있다. 이번에 재판정하는 항목만 적는다.

| 항목 | AIR-500 | 이번 판정 | 이유 |
| --- | --- | --- | --- |
| 홈·아카이브 숏폼형 Motion Card(텍스트 줄 단위 루프) | Signature tier 1건으로 제한 | **adapt — 확대 후보** | 사용자 요청의 핵심이다. G-AIR-10 판정 또는 예외 승인이 필요하다 |
| TTS 내레이션 + word sync | 보류 | **adapt — 운영자 제작 한정** | 매거진 내레이션은 이미 운영자 경로로 구현됐다(`magazineNarrationService.ts`). EL-002에 따라 `magazine`/`internal` 호출에는 성인 게이트를 적용하지 않는다 |
| 실제 영상 export(Shorts/Reels) | 보류 | **adapt — 운영자·Marketing Oops 한정** | 이용자 대면 생성·과금은 별도 계약으로 둔다 |
| 개인화 Story·코인 과금("30초 핵심", "투자자 관점") | 보류 | **defer 유지** | 헌장 §6(코인은 기능 사용료)과는 방향이 맞다. 다만 이용자 대면 TTS는 ElevenLabs 연령 조건(트리거 3)에 걸린다. 경제 계약도 없다 |
| Particle Morph 홈 Hero, Gen Studio Interactive Scene 생성 | 거부/보류 | **defer 유지** | 이번 요청 범위 밖이다 |
| 기사 Paywall화 | 거부 | **거부 유지** | ADR #18, 헌장 §6 |

---

## 2. 현재 구현 실측 (파일:라인)

### 2.1 표면별 서빙 주체 — 2026-09-29 운영 실측

```text
curl https://allmyuniverse.com/          → 200, 40KB, _next/static 583회, GA G-R59CLP4F6R  → node-app
curl https://allmyuniverse.com/magazine/ → 200, 83KB, wp-content/themes/amu24 14회, GA G-GDDRCRXCLD → WordPress
```

| 사용자가 말한 화면 | 실제 표면 | 렌더 코드 |
| --- | --- | --- |
| 메인(홈) `/` | **node-app** | `src/components/template/home/HomePageClient.tsx` — WP 최신 5건을 `getPosts({perPage:5})`로 가져와 세로로 나열하고, framer-motion `RevealSection`을 쓴다 |
| 아카이브 `/magazine/` | **WordPress amu24** `home.php` | `home.php:1-9` → `entry.php` 세로 목록. 가로 스와이프·캐러셀은 없다 |
| WP 기사 상세 `/{slug}/` | WordPress `single.php` → `entry.php` | 대표 이미지(`use-templates.php:466-481`, lazy·srcset·fetchpriority 없음) → 카테고리 → h1 → 메타 → 관계 UI |
| App 기사 상세 `/magazine/{slug}` | node-app | `AppMagazineMotionCover.tsx`(interactive 콘텐츠 한정) + `AppMagazineStoryMode.tsx` |

### 2.2 원장 전제 충돌 — 홈 리뉴얼

`todo-allmyuniverse-home-renewal.json`(provisional)은 다음을 전제로 한다.
- 홈 Editorial Deck을 **amu24 테마 PHP SSR + CSS scroll-snap**으로 구현한다.
- 범위 밖 항목에 "node-app 매거진 화면 변경"을 둔다.

그런데 운영 `/`는 node-app이다. 원장의 ASO-GAP-07에 따르면 "운영 홈이 39KB 채워진 페이지를 반환"한다. 이는 위 실측(node-app 40KB)과 일치한다. 따라서 **ASO-GAP-07의 답은 "운영 홈은 WP 페이지가 아니라 node-app"**일 가능성이 높다(추정 — HOM-01-D1이 확인 절차를 소유한다).

모션 카드는 홈 Deck 위에 올라가는 표현 계층이다. 그래서 두 원장의 표면 판정을 먼저 일치시켜야 한다. **이 보고서는 홈=node-app을 전제로 설계한다.**

### 2.3 재사용할 자산

| 자산 | 위치 | 이번 설계에서의 용도 |
| --- | --- | --- |
| Story manifest 변환기(결정론적, LLM 없음) | `node-app/src/libs/server-utils/magazine/editorialStory.ts` (beat 6종, layout 4종, reveal `line\|fade`, durationMs 5200/6200) | v2 확장의 출발점 |
| Story Mode 플레이어 | `AppMagazineStoryMode.tsx` (Radix Dialog, `setTimeout` 자동 진행, reduced-motion 시 자동재생 차단, GA `article_experience_impression`·`magazine_return`) | 9:16 레이아웃·word reveal·내레이션을 붙인다 |
| Motion Cover(R3F, WebGL2 판정, reduced-motion 이중 확인) | `AppMagazineMotionCover.tsx:57,109,117`, `AppMagazineMotionCoverCanvas.tsx` | Signature tier 배경 |
| Spatial Gallery 패턴(dynamic ssr:false, dispose, demand frameloop) | `GenStudioSpatialGallery.tsx`, `SpatialGalleryScene.tsx` | visual-runtime §10 기준 사례 |
| 비디오 잡 큐(ioredis 리스트 + lease + reserve/settle/refund) | `src/libs/server-utils/video/videoGenerationJobQueue.ts:139-346` | 렌더 잡 큐의 구조 템플릿 |
| 비디오 자산 저장(매직바이트·sha256·R2 PUT·HEAD 대조) | `video/videoAssetStorage.ts:62-84` | 렌더 결과 저장. **단, DB 실패 시 보상 삭제가 없다(grep 0건)** — media-storage §10·§11 갭이라 새 경로에서 보완한다 |
| ElevenLabs TTS | `audio/providers/elevenlabsSpeech.ts:278` (`/text-to-speech/{voiceId}`) | `with-timestamps` 미사용(0건) → word sync용 확장 지점 |
| 매거진 내레이션(운영자 게시·재생 정보) | `magazine/magazineNarrationService.ts:281,439`, `models/magazine/MagazineNarrationSchema.ts` | Story 내레이션의 원천 |
| Knowledge 기사 구조(thesis·primaryQuestion·claimStatus) | `magazine/magazineKnowledgeContract.ts:85,186-208` | AI 보조 Beat 초안의 입력 |
| 비용 과금 진입점 | `src/libs/services/aiUsageBilling.ts:243,283,327,389` | LLM Beat 초안의 비용 trace. 이용자 과금은 이번 범위가 아니다 |
| WP↔node HMAC 브리지 + transient 캐시 | `amu24/inc/actions/app-bridge.php:83-97`, `promo-slots.php:85-150` | 아카이브 카드가 manifest를 가져오는 경로 |
| Embed 보안 계약 | `content-experience/embed-security-contract-v1.md`, node `src/app/embed/magazine` | WP 기사 → Story Mode iframe |
| 설치된 의존성 | `package.json`: three 0.185.1, @react-three/fiber 9.7.0, framer-motion ^11.15, gsap ^3.12.5 | 새 패키지 없이 웹 런타임을 구성할 수 있다 |

### 2.4 없는 것 (신규가 필요한 것)

- Chromium·ffmpeg: 컨테이너 두 곳 모두 없고 Dockerfile도 없다. `node:22-bullseye` + 볼륨 방식이다.
- WP 기사용 Story manifest: v1 계약 §3.2에 따르면 WP adapter는 "안정적인 원문 snapshot anchor"를 먼저 만들어야 한다. `editorialStory.ts`는 `app_content`만 지원한다.
- manifest 저장소: 현재 manifest는 요청 시점에 계산된다(추정 — `editorialStory.ts`의 호출 경로를 보면 저장 컬렉션이 없다). 편집 승인(`status: published`)을 담을 저장소가 없다.
- WP 테마 모션 체계: CSS keyframes만 있다(`base/_animation.scss`). 전역 reduced-motion 가드가 없다.
- 홈·아카이브 카드 클릭 계측이 `surface` 속성으로 구분되는지는 미확인이다.

---

## 3. 목표 아키텍처

```text
                       기사 원문 (WP post / App content)
                                   │  sourceRevision 고정
                                   ▼
        ┌──────────── Story Authoring (node-app, 운영자) ─────────────┐
        │ deterministic adapter (현행)  +  AI 보조 Beat 초안 (신규)      │
        │ → 편집자 승인 → editorial_story_manifests (status=published)  │
        └───────────────────────────────┬─────────────────────────────┘
                                        │ editorial-story.v2 (의미 + 표현 의도)
             ┌──────────────────────────┼───────────────────────────┐
             ▼                          ▼                           ▼
     Web Motion Runtime          Narration (선택)              Render Export (선택)
     DOM 텍스트 + WAAPI 프리셋     ElevenLabs with-timestamps     render worker (Chromium+ffmpeg)
     + 선택적 R3F 배경            → alignment → word cue         엔진 어댑터: PoC로 결정
             │                          │                           │
   ┌─────────┼──────────┬────────┐      │                    9:16 MP4 → R2 → video_assets
   ▼         ▼          ▼        ▼      │                           │
 홈 카드   아카이브 카드  상세 Hero  Story Mode ◄─────────┘                    ▼
 (node)    (WP, vanilla) (WP/App) (node, WP는 embed)                 Marketing Oops (Shorts/Reels)
```

**불변식**
1. 의미(Beat)와 표현(Scene)을 분리한다. 표면별 카피를 따로 만들지 않고 같은 Beat를 재사용한다(v1 규칙 4).
2. 텍스트·링크·CTA는 항상 DOM이다. WebGL·영상은 텍스트의 권위가 아니다.
3. 모든 모션은 `t`(ms)의 순수 함수로 정의한다. 웹은 wall clock으로 `t`를 진행하고, export는 frame으로 `t`를 지정한다.
4. 1 영상 = 1 렌더러. 엔진 혼합은 하지 않는다.
5. 독자의 재생은 무료이며 AI 호출이 없다. 생성·렌더 비용은 운영자 작업에서만 발생하고 AIR-600 cost trace로 관측한다.

---

## 4. 설계 상세

### 4.1 데이터 계약 — `editorial-story.v2` (v1 additive 확장)

v1 계약은 unknown field를 허용하지 않는다. 그래서 필드를 추가하지 않고 **`schemaVersion: "editorial-story.v2"`를 새로 발행**한다. consumer는 v1·v2를 모두 읽고, v1은 v2의 부분집합으로 변환한다(article-experience v1→v2 이관과 같은 방식).

```ts
// 계약 초안 — 구현 코드가 아니라 wire 형태 정본 후보
type EditorialBeatRoleV2 = EditorialBeatRole; // v1 계약 enum 9종 유지(hook~cta). 현 코드는 6종만 사용 → 코드가 계약을 따라간다

interface EditorialStorySceneV2 {
  schemaVersion: "editorial-story-scene.v2";
  sceneId: string;
  beatIds: string[];
  layout: "cover" | "statement" | "image_text" | "quote" | "data" | "comparison" | "outro";
  visual?: {
    primitiveKey?: string;        // visual-runtime allowlist
    assetId?: string;             // Gen Studio 자산 ID. URL 금지
    fallbackAssetId?: string;     // primitive 사용 시 필수
    altText?: string;
    camera?: MotionPresetKey;     // "camera.push" | "camera.pan" … Ken Burns
  };
  data?: DataFigureSpec;          // layout=data|comparison 전용. 수치·출처 sourceRefs 필수
  text: {
    reveal: "none" | "line" | "word" | "fade";
    enter?: MotionPresetKey;      // "enter.fade-up" | "enter.mask-reveal" …
    emphasis?: MotionPresetKey;   // "emph.underline" | "emph.number-count"
    maxLines?: number;
  };
  timing: {
    preRollMs: number;            // 배경만 보이는 구간 (참고 문서 PREROLL)
    durationMs: number;           // 텍스트 reveal 포함 본 구간
    holdMs: number;               // 마지막 상태 유지 (FINAL BEAT HOLD)
  };
  transitionOut?: MotionPresetKey; // "trans.cut" | "trans.fade" | "trans.wipe"
}

interface EditorialStoryManifestV2 {
  contractType: "amu-editorial-story-manifest";
  schemaVersion: "editorial-story.v2";
  storyId: string;
  contentRef: EditorialContentRef;       // wp_post | app_content (v1과 동일)
  sourceRevision: string;
  title: string;
  status: "draft" | "ready" | "published" | "retired";
  motionTokensVersion: string;           // §4.2 토큰 스냅샷 버전. 재현성
  beats: EditorialStoryBeat[];
  scenes: EditorialStorySceneV2[];
  sceneOrder: string[];
  surfaces: {
    storyMode: EditorialStorySurface;
    homeCard?: EditorialStorySurface & { tier: "standard" | "motion" | "signature" };
    archiveCard?: EditorialStorySurface & { tier: "standard" | "motion" };
    articleHero?: EditorialStorySurface;
    short?: EditorialStorySurface & { format: "9:16"; maxDurationMs: number }; // export 대상
  };
  narrationRef?: {                       // Scene이 아니라 manifest 수준. v1의 "Scene에 audio 금지" 유지
    narrationId: string;                 // magazine_narrations
    cueSchemaVersion: "story-narration-cues.v1";
  };
  provenance?: EditorialStoryProvenance; // v1 그대로. 비용값·prompt·uid 저장 금지
  revision: string;
  createdAt: string;
  updatedAt: string;
}
```

**v2에 추가되는 무결성 규칙**
- `layout=data|comparison`의 수치는 Knowledge `claimStatus`가 `measured` 또는 `sourced`인 claim만 쓴다. `hypothesis`·`prohibited`는 쓸 수 없다. 그리고 `sourceRefs`가 해소돼야 한다.
- `surfaces.short`는 `status=published`인 manifest만 가질 수 있다. `maxDurationMs`의 기본 권고는 45,000이며 MARKETING-STRATEGY Shorts 구조를 따른다.
- `homeCard`·`archiveCard`는 `sceneIds` 1~2개, 합계 `durationMs + holdMs` 8,000ms 이하로 제한한다(루프 피로 방지).
- `narrationRef`가 가리키는 내레이션의 `sourceTextVersion`은 Beat 텍스트 hash와 일치해야 한다. 불일치하면 내레이션 없이 재생한다.

**저장소**: node-app에 `editorial_story_manifests` 컬렉션을 신설한다.
- 키: `storyId`
- 인덱스: `contentRef`, `status`
- revision 낙관적 잠금을 쓴다. `CardNewsDeckSchema` 패턴을 재사용한다.
- 현행 App 콘텐츠의 결정론적 변환은 `status=ready` 초안을 만드는 adapter로 남긴다.
- 공개 소비는 `published`만 허용한다.

### 4.2 Motion Design Tokens — 단일 JSON, 두 런타임

`motion-tokens.v1.json`을 정본으로 둔다. 위치는 `.agent/references/AMU-MAGAZINE/content-experience/`이고, 파생본을 node-app과 WP에 둔다. WAAPI 키프레임 형식이라 React와 vanilla가 같은 값을 쓴다.

```json
{
  "version": "motion-tokens.v1",
  "duration": { "fast": 160, "base": 240, "slow": 420, "line": 520 },
  "easing": { "standard": "cubic-bezier(0.2, 0, 0, 1)", "exit": "cubic-bezier(0.4, 0, 1, 1)" },
  "presets": {
    "enter.fade-up":     { "keyframes": [{ "opacity": 0, "transform": "translateY(12px)" }, { "opacity": 1, "transform": "none" }], "duration": "line", "easing": "standard" },
    "enter.mask-reveal": { "keyframes": [{ "clipPath": "inset(0 0 100% 0)" }, { "clipPath": "inset(0 0 0 0)" }], "duration": "line", "easing": "standard" },
    "emph.underline":    { "keyframes": [{ "backgroundSize": "0% 2px" }, { "backgroundSize": "100% 2px" }], "duration": "slow", "easing": "standard" },
    "camera.push":       { "keyframes": [{ "transform": "scale(1)" }, { "transform": "scale(1.08)" }], "duration": "scene", "easing": "linear" },
    "trans.fade":        { "keyframes": [{ "opacity": 1 }, { "opacity": 0 }], "duration": "base", "easing": "exit" }
  },
  "stagger": { "line": 380, "word": 90 },
  "readingPace": { "koCharsPerSecond": 9, "minLineMs": 1400 }
}
```

- 수치는 **초안**이다. `readingPace`는 추정값이며 파일럿에서 완주율·이탈 지점으로 보정한다.
- 규칙을 두 가지 둔다. 애니메이션은 `opacity`·`transform`·`clip-path`만 쓴다(width/height/top/left 금지, visual-runtime §3). 뷰당 동시에 움직이는 요소는 1~2개로 제한한다.
- `number-count`는 키프레임으로 표현할 수 없다. 그래서 `t`의 순수 함수(`value = lerp(from, to, ease(t/d))`)로 별도 구현한다. 스크린리더에는 최종값만 노출한다(`aria-live` 없음, 최종 텍스트 DOM 상주).

### 4.3 Web Motion Runtime — 표면별 설계

공통 규칙은 네 가지다. 첫째, 전체 텍스트가 SSR DOM에 먼저 존재하고 reveal은 시각 효과일 뿐이다. 둘째, reduced-motion이면 최종 상태를 정적으로 보여준다. 셋째, 뷰포트당 active 모션 surface는 1개다. 넷째, 자동으로 움직이는 콘텐츠가 5초를 넘으면 일시정지 컨트롤을 둔다(WCAG 2.2.2).

#### (A) 홈 카드 — node-app `/`

- **등급**
  - `signature`: R3F 배경 + 텍스트 루프. 대표 1장만 허용한다.
  - `motion`: 이미지 Ken Burns(WAAPI `camera.push`) + 텍스트 루프.
  - `standard`: 정적.
- **구성**: `HomePageClient`의 최신 5건 영역을 manifest가 있는 기사부터 카드로 대체한다. manifest가 없는 기사는 `standard` 카드로 둔다.
- **좌우 이동**: 홈 리뉴얼 원장의 Interaction Language v2와 조율해야 한다. 원장은 세로 scroll-snap + 좌/우 스와이프를 "카테고리/글 읽기"로 정의한다. 카드 내부에 좌우 캐러셀을 따로 두면 제스처가 충돌한다. 그래서 **카드 전환은 Deck의 세로 snap에 맡기고, 카드는 단일 스토리 루프만 담당**한다(OD-MS-03).
- **재생 조건**
  - IntersectionObserver ≥ 0.6이고 가장 많이 보이는 카드 1장만 재생한다.
  - 2회 루프 후 마지막 프레임에서 정지한다.
  - `document.hidden`이면 정지한다.
  - 카드마다 일시정지/재생 버튼(44×44)을 둔다.
- **LCP**: 첫 카드의 정적 이미지가 LCP 후보다. `fetchpriority="high"`를 주고 `aspect-ratio`를 고정한다. 모션은 hydration 이후에 시작한다.
- **구현 위치**: 신규 `src/components/module/magazine/story/StoryLoopCard.tsx`와 `useStoryTimeline.ts`. `ssr:false` 없이 SSR 텍스트를 유지하고, 모션만 client에서 붙인다.

#### (B) 아카이브 카드 — WordPress `/magazine/`

- React·Three는 쓰지 않는다. PHP SSR 카드 + vanilla JS WAAPI(목표 5KB 이하) + 토큰 JSON을 인라인으로 싣는다.
- **데이터**
  - `amu24_story_fetch()`를 신설한다. `promo-slots.php:85-150`의 HMAC GET + transient(600초/실패 60초) 패턴을 복제한다.
  - 대상 API는 node-app `GET /api/thirdparty/wp/story-surfaces?postIds=…`이다. `archiveCard` surface만 배치로 가져온다.
  - 실패하면 기존 `entry.php` 카드를 그대로 쓴다(fail-closed = 정적).
- **등급**: `motion`까지만 허용한다. WebGL은 쓰지 않는다. 아카이브는 목록이라 동시 노출 카드가 많기 때문이다.
- **테마 제약**
  - 신규 파일(`inc/components/amu24-story-card.php`, `assets/script/functions/amu24-story-motion.js`, `assets/css/scss/components/element/_story-card.scss`)이 필요하다.
  - `split-implementation.md`의 **권한 임시 상향 → 작업 → 원복** 절차를 한 작업 단위 안에서 수행한다.
  - SCSS는 `sass` CLI로 컴파일한다(`wp-theme-ui.md:37-50`).
- **선결 결함**: 대표 이미지 `<img>`에 `width/height/loading/srcset`이 없다(`use-templates.php:477,479`). 모션 카드는 CLS 예산을 지켜야 하므로 이를 먼저 보완한다. 단, 범위를 카드 컴포넌트로 한정한다.
- 전역 reduced-motion 가드를 `_animation.scss`에 추가하고, JS도 `matchMedia`의 change 이벤트를 구독한다.

#### (C) 상세 헤더 — WP `single` · App `/magazine/{slug}`

- **WP**
  - `entry.php:5-27` 헤더에 `articleHero` surface가 있을 때만 적용한다. 대표 이미지 위에 Hook 1~2줄을 reveal한다.
  - 1회 재생 후 정지하고 루프는 하지 않는다. 기사 읽기 진입을 방해하지 않기 위해서다.
  - h1은 기존 위치에 유지한다. reveal 텍스트는 Hook Beat이며 h1을 대체하지 않는다(SEO).
- **App**: 현행 `AppMagazineMotionCover`의 텍스트 레이어를 v2 Scene 렌더러로 교체한다. WebGL 배경 부분은 유지한다.
- **[스토리로 보기] 버튼**
  - 문구는 "영상으로 보기"보다 "스토리로 보기"를 권한다. 실제 영상이 아닌데 영상이라고 표시하면 기대 불일치가 생긴다. 참고 문서 §7도 장기적으로 이름을 바꿀 가능성을 언급했다.
  - CTA 상한 규칙(Primary 1 + Secondary 1)을 지킨다. Story 진입은 기사 내부 모드 전환이므로 서비스 CTA로 세지 않는다(추정 — MEASUREMENT-PLAN §9.5의 `in_page_module` 분류와 일치).

#### (D) Story Mode — 9:16 풀스크린

- **App 기사**: 현행 `AppMagazineStoryMode.tsx`를 확장한다.
  - 세로 9:16 stage를 둔다. 모바일은 전체 화면, 데스크톱은 중앙 9:16 + 좌우 여백이다.
  - word/line reveal과 진행 바를 둔다.
  - 탭 좌/우 = 이전/다음, 길게 누르기 = 일시정지(숏폼 문법), 키보드 ←/→/Space/Esc를 지원한다.
  - `setTimeout` 체인을 **`useStoryTimeline`(rAF 기반 t 진행 + WAAPI seek)**으로 교체한다. 일시정지·재개와 정확한 진행 바를 위해서다.
- **WP 기사**: node-app `/embed/magazine/story/{storyId}`를 신설한다. `noindex`이며 embed-security-contract-v1을 따른다.
  - WP 버튼이 fullscreen `<dialog>` + iframe을 연다.
  - 닫을 때 `postMessage`로 복귀하고 포커스를 트리거로 되돌린다.
  - 두 런타임에 플레이어를 이중 구현하지 않기 위한 선택이다.
- **DESIGN-COMPONENT-SPECS §6** "독립 페이지를 full-screen Dialog로 대체 금지"와의 관계
  - Story Mode는 기사의 표시 모드이지 독립 페이지가 아니다. 현행 구현도 Dialog다.
  - 다만 **중첩 full-screen 오버레이 금지** 규칙 때문에 Story Mode 안에서 다른 Dialog를 열지 않는다.
- **마지막 Scene**: `outro`로 끝나며 본문 해당 섹션(`sourceRefs` anchor)으로 복귀한다. 기존 `magazine_return(in_page_module)` 계측을 재사용한다.

### 4.4 결정성 규칙 (export 전제)

`src/components/module/magazine/story/scenes/**`(장면 컴포넌트) 디렉터리에 ESLint `no-restricted-syntax`/`no-restricted-globals`를 걸어 다음을 금지한다.
- `Math.random`, `Date`, `performance.now`, `fetch`, `setTimeout`, `setInterval`, `window.scroll*`

장면 컴포넌트는 `(scene, beats, tokens, t) → DOM`만 한다. 시간 진행은 상위 `useStoryTimeline`(웹)이나 export driver가 소유한다. 이렇게 두어야 같은 컴포넌트를 렌더 엔진 composition에 그대로 감쌀 수 있다.

### 4.5 Story Authoring — Beat 생성과 편집 승인

| 단계 | 주체 | 입력 | 산출 |
| --- | --- | --- | --- |
| 1. 결정론적 초안 | node-app adapter | App: `heroLine`·`coldOpen`·prose block(현행). WP: 정규화 snapshot + heading/paragraph anchor(신규) | `status=draft` manifest |
| 2. AI 보조 초안(선택) | Gen Studio content pipeline(운영자·internal owner) | Knowledge 기사 `thesis`·`primaryQuestion`·`memorableInsight`·검증된 claim | Beat headline/body 요약, `visualIntent`, layout 제안 |
| 3. 표현 컴파일 | 결정론적 compiler | Beat role → layout·preset 매핑표, readingPace | Scene timing·preset |
| 4. 편집 승인 | 편집자(admin UI) | Scene별 미리보기(웹 플레이어 재사용) | `status=published` |

- 2단계 LLM 호출은 `billAIUsageOrThrow` 경로를 거쳐 AIR-600 trace에 남긴다. 이용자 코인은 쓰지 않는다. owner는 `internal`이다.
- LLM 출력은 JSON schema로 검증하고 enum 밖의 값은 거부한다. AI가 WebGL·CSS 코드를 만들지 않는다.
- Beat `body`는 원문의 의미를 넘지 않는다. 수치·인용은 원문 `sourceRefs`에 있는 것만 허용한다. 창작 수치를 금지한다(content-operations 4번).
- admin 화면은 기존 `src/app/admin/magazine/*`에 `stories/[storyId]`를 추가한다.

### 4.6 내레이션과 Word Sync

- `elevenlabsSpeech.ts`에 `/text-to-speech/{voiceId}/with-timestamps` 호출 옵션을 추가한다. 응답의 문자 단위 alignment를 어절 단위 cue로 접는다.
  - 한국어 어절은 공백 기준이다. 조사가 붙은 어절을 한 단위로 본다.
- **저장**: `AudioAssetSchema`에 `alignment` 필드를 추가하지 않는다. 대신 별도 `story_narration_cues`(`narrationId`, `sceneId`, `cues[{text,startMs,endMs}]`, `sourceTextHash`)를 둔다. 음성 자산 스키마 변경을 피하려는 것이다.
- 재생할 때는 오디오 `currentTime`을 `t`의 원천으로 삼는다. 오디오가 마스터 클럭이다. `word` reveal은 cue 시각에 맞춘다.
- 내레이션이 없거나 로드에 실패하면 readingPace 타이밍으로 재생한다.
- **대상**: 운영자 게시 매거진 내레이션만 쓴다(`magazine` owner). EL-002 판정상 성인 게이트가 적용되지 않는다. 독자는 정적 R2 파일을 재생만 한다.
- **확인 필요(추정)**: `with-timestamps`의 과금·출력 형식이 현 경로(`output_format`)와 같은지는 ElevenLabs 공식 문서로 확인해야 한다. 확인 전까지 NR 단계를 잠근다.

### 4.7 영상 Export — 렌더 워커

**구조**

```text
admin/Agent API "Short 만들기" (운영자, storyId)
  → motion_render_jobs (Mongo) + ioredis queue  ← videoGenerationJobQueue 패턴 복제 (lease, 상태 머신)
  → motion-render-worker (신규 컨테이너, Chromium + ffmpeg, mem 2g, concurrency 1)
       1. /render/story/{storyId}?profile=short-9x16 을 headless로 연다 (내부 전용 라우트, 인증 필수)
       2. 엔진 어댑터가 frame f마다 t = f/fps*1000 을 지정 → WAAPI currentTime seek → 캡처
       3. 내레이션 mp3 연결 + BGM(선택) → ffmpeg mux, H.264 1080×1920 30fps, 자막 burn-in(DOM 텍스트 그대로)
       4. 매직바이트·sha256 → R2 PUT → HEAD 대조 → video_assets 기록 (source: "motion_render")
          DB 실패 시 R2 보상 삭제 (media-storage §10·§11 — 기존 video 경로 갭을 새 경로에서 재현하지 않음)
  → Marketing Oops 소재 등록(기존 업로드 레지스트리 경유)
```

**엔진 어댑터 후보와 bake-off 기준** (OD-MS-02)

| 후보 | 라이선스 | 성숙도(2026-09-29 npm) | 장점 | 리스크 |
| --- | --- | --- | --- | --- |
| Rendiv | Apache-2.0 | 0.2.6, 메인테이너 1명, 최근 배포 2026-06-07 | React 컴포넌트를 그대로 composition으로 쓴다. Player·renderer 분리 | bus factor 1. 분산 렌더 로드맵 단계. 오디오·폰트 엣지 케이스가 검증되지 않았다 |
| Remotion | 특수(직원 ≤3 영리 조직 무료, 초과 시 Company License) | 4.0.529, 활발(2026-09-25) | 가장 성숙하다. 분산 렌더·오디오·자막 생태계 | 조직 규모 조건. "파생물 판매 금지" 조항과 Gen Studio 이용자 대면 영상 생성의 관계는 법무 확인이 필요하다(추정) |
| Revideo | MIT | 0.11.0 (2026-07-10) | 경량, headless `renderVideo()` | generator 기반이라 React 장면 컴포넌트를 재사용하기 어렵다 → 이중 구현 |
| 자체 driver(Playwright screenshot + ffmpeg) | Apache/LGPL | — | 의존성이 최소다. WAAPI seek 설계와 직접 맞는다 | 프레임 캡처 성능·오디오 싱크를 직접 소유해야 한다 |

- **bake-off 과제**(동일 manifest, 30초 9:16, 6 Scene, 내레이션 포함)
  - 렌더 시간, 피크 RAM, CPU 초, 한글 폰트(Pretendard) 정합, 오디오 싱크 오차(±40ms 이내), 재현성(같은 입력 → 같은 sha256 또는 프레임 diff 0)
- **R3F 배경**: 헤드리스 Chromium에는 GPU가 없어 SwiftShader 경로가 매우 느리다(추정). export 프로필에서는 WebGL 배경 대신 `fallbackAssetId` + `camera.push`로 대체한다. 이 역시 fail-closed 원칙이다.
- **Motion Canvas**: bake-off에서 제외한다. 설명형(`data`/`comparison`) 장면은 DOM/SVG primitive로 구현한다. 그러면 웹과 export 양쪽에서 같은 컴포넌트를 쓴다. 차트·다이어그램 수요가 이 primitive로 부족한 것이 실측으로 확인되면 재평가한다.

### 4.8 과금·개인화 (이번 범위 밖, 경계만 고정)

- 독자의 Story 재생·내레이션 청취는 무료이며 코인을 쓰지 않는다(헌장 §6 "코인은 기능 사용료이며 열람료가 아니다", ADR #18).
- 운영자 제작 비용(LLM 초안·TTS·렌더 CPU)은 AIR-600 trace로 관측하고 이용자 코인을 차감하지 않는다.
- "내 관점 Story", "30초 버전" 같은 **개인화 생성**은 이용자 대면 AI 생성이다. 이것을 열려면 다음이 모두 필요하다.
  - 로그인
  - 서버 preflight(`assertPricingPreflightOrThrow`) → 예약 → 정산 → 환불
  - 체험용 무과금 경로 금지(COIN-POLICY §14)
  - **이용자 대면 TTS는 ElevenLabs `verified_adult` 조건(트리거 3)**
  - 별도 경제 계약
- 이 보고서는 설계하지 않는다(`deferred`).

---

## 5. 계측

MEASUREMENT-PLAN §5·§9.5에 따라 **새 이벤트를 만들지 않고** 기존 이벤트에 `surface` 속성을 싣는다.

| 행동 | 이벤트 | 속성 |
| --- | --- | --- |
| 모션 카드 노출(60% 이상, 1초) | `article_experience_impression` | `stage=entry`, `surface=home_card\|archive_card\|article_hero`, `experience_id=editorial-story-card`, `story_revision` |
| 카드 → 기사 진입 | 기존 카드 클릭/`select_content` 계열(**미확인 — 착수 전 확인**) | `surface` |
| Story Mode 진입·완주 | `article_experience_impression` `stage=entry\|complete` (현행) | `surface=story_mode`, `narration=on\|off` |
| Story → 본문 복귀 | `magazine_return` `return_type=in_page_module` (현행) | — |
| Shorts → 매거진 유입 | UTM(`utm_source=youtube\|instagram`, `utm_medium=short`, `utm_content=storyId`) | Shorts 조회수 단독으로는 판정하지 않는다(§12.1) |

- App 표면은 `content_id=amu:magazine:{slug}`을 쓰고 WP 표면은 기존 규약을 따른다. PII는 넣지 않는다.
- 기존 카드 클릭 이벤트가 `surface`를 싣지 못하면 MEASUREMENT-PLAN 개정 절차(§1-1 "지표와 계측을 함께 바꾼다")를 선행한다.

**성과 판정 지표(파일럿)**
- 카드 CTR(motion 대비 standard, 같은 슬롯 A/B)
- Story 진입률·완주율·본문 복귀율
- 28일 재방문 기여(보조)

판정 기준은 OD-MS-01에서 확정한다.

---

## 6. UI 구현 계약 (ui-ux-pro-max 압축, 10항목)

`--design-system`은 영속화 없이 1회 실행했다. 결과: pattern "Scroll-Triggered Storytelling", style "Swiss Modernism 2.0", color accent `#EC4899`, font Libre Bodoni/Public Sans.

| # | 구분 | 계약 |
| --- | --- | --- |
| 1 | 유지 | 색·타이포는 기존 토큰(`theme.css` `@theme`, WP `_colors.scss`)과 Pretendard만 쓴다. 추천 accent(분홍)와 새 폰트는 **제외**한다 — CI §28.4 보라·분홍 금지, SPECS §3 |
| 2 | 유지 | 아이콘은 lucide(양쪽 모두 사용 중) |
| 3 | 개선 | 텍스트 오버레이 가독성을 위해 이미지 위 하단 그라데이션 scrim(중립 토큰)을 두고 대비 4.5:1을 확보한다. 커버 이미지는 CI §28.5의 "텍스트 없음"을 유지하고, 제목은 DOM에만 둔다 |
| 4 | 개선 | 진행 표시: Story Mode 상단 세그먼트 진행 바, 카드 하단 얇은 루프 진행선 |
| 5 | 개선 | 모든 자동 재생 surface에 일시정지 컨트롤(44×44, `aria-pressed`)을 둔다 — WCAG 2.2.2 |
| 6 | 금지 | 뷰당 3개 이상 동시 모션, width/height 애니메이션, 스크롤 하이재킹, 카메라 셰이크 |
| 7 | 금지 | Canvas·영상 안의 유일한 텍스트. 모든 텍스트는 DOM에 먼저 존재한다 |
| 8 | 금지 | 새 모션·UI 라이브러리를 웹 런타임에 추가하는 것(렌더 엔진은 워커 전용) |
| 9 | 검증 | 375/768/1024/1440px, 세로/가로, reduced-motion on/off, 키보드(←/→/Space/Esc/Tab), 스크린리더 읽기 순서 |
| 10 | 검증 | LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1(75p). WP는 light-only를 유지한다(`wp-theme-ui.md:62-65`). node-app은 기존 `data-service-theme` 범위에서만 dark를 지원한다 |

Swiss Modernism의 그리드·위계 원칙은 참고로만 쓴다. 매거진 Motion은 DESIGN-GUIDELINES §17 "왜 움직이는가"에 답할 수 있어야 한다. 숏폼 문법을 쓰는 이유는 "핵심 문장을 읽기 전에 전달한다"로 정의한다.

---

## 7. 규제·정책 게이트 판정

| 게이트 | 판정 | 근거·조건 |
| --- | --- | --- |
| 미성년(§3-1) | **pass** | compliance-guardrails §3-1. 이용자 대면 TTS·개인화는 이번 범위 밖이다. 운영자 매거진 내레이션은 EL-002상 성인 게이트 비적용 |
| 프로바이더 연령 조건(트리거 3) | 운영자 경로 **pass** / 이용자 대면 TTS **blocked** | ElevenLabs `verified_adult` |
| 개인정보 고지(§4·§4-1) | **pass(조건부)** | 수집 항목·식별자 전송·새 프로바이더가 없다. 계측은 기존 이벤트 + 비식별 속성만 쓴다. `with-timestamps`는 기존 ElevenLabs TTS 목적 안이다(추정 — 법무 확인은 NR 단계에서) |
| 경제(server-economy-security) | **pass** | 독자 과금 없음. 운영자 LLM 호출은 기존 과금·trace 경로를 따른다. 개인화 과금은 `deferred` |
| 환전·가상자산 | 해당 없음 | — |
| 상업 이용 권리 — Remotion 라이선스 | **blocked(선택 시)** | 조직 규모 조건 + 이용자 대면 사용 시 FAQ 확인. Rendiv·Revideo·자체 driver 선택 시 해당 없음 |
| 상업 이용 권리 — 생성 이미지·BGM | 기존 Gen Studio 자산 권리 기준 | BGM·SFX 소스를 신규 도입하면 라이선스 확인이 선행돼야 한다 |
| G-AIR-10(soft) | **blocked — 사용자 결정 필요** | AIR-503 `pending_verdict` n=1. 홈·아카이브 적용은 확대에 해당한다 |
| 헌장 §9 기여도(7문항 중 2개 이상) | **pass(가설)** | 품질(경험), 복귀(Story → 본문), 신규 독자(Shorts discovery) 3개. 실측 전 가설이다 |
| MARKETING "모든 글 영상화 금지" | 설계로 준수 | `surfaces.short`는 편집자가 선택한 manifest에만 둔다. Shorts 발행은 `uploadPolicy` MCP 조회 cap을 따른다(fail-closed) |
| production publish | 해당 단계에서 판정 | Marketing Oops 외부 발행은 L3/사용자 승인 대상이다 |

---

## 8. 구현 계획 (Phase · TASK)

티어는 위험도 축의 최댓값으로 정했다. **write set이 겹치는 TASK는 직렬로 둔다.** node-app과 amu_app(WP)은 별개 저장소라 커밋도 저장소별로 한다.

### P0 — 결정과 계약 (코드 없음)

| TASK | 내용 | 티어 | 산출 |
| --- | --- | --- | --- |
| MS-00 | 결정 패킷: OD-MS-01~06 | 사용자 | 결정 기록 |
| MS-01 | 홈 표면 정합: 운영 홈=node-app을 HOM 원장 ASO-GAP-07 해소 근거로 반영, Deck 구현 대상 재판정 | JUDGE | 원장 정정안(Main) |
| MS-02 | `editorial-story.v2` 계약 문서 + JSON Schema + fixture(v1 호환 변환 포함) | JUDGE | `content-experience/editorial-story-manifest-v2.md`, `.schema.json`, `fixtures/` |
| MS-03 | `motion-tokens.v1.json` 정본 + 파생 규칙(node·WP parity 테스트) | JUDGE | 토큰 정본 |
| MS-04 | AIR-503 판정 기준 정의: 최소 표본(콘텐츠 수·세션 수)·기간·판정자·통과선 | JUDGE | G-AIR-10 해제 조건 |

### P1 — 웹 런타임 코어 (node-app)

| TASK | 내용 | 티어 | write set |
| --- | --- | --- | --- |
| MS-10 | `useStoryTimeline`(rAF t 진행, WAAPI seek, pause/resume, reduced-motion, visibility) + 토큰 로더 + `number-count` | BUILD | `src/components/module/magazine/story/{useStoryTimeline.ts,motionTokens.ts}` |
| MS-11 | 장면 컴포넌트(layout 7종) + 결정성 ESLint 규칙 | BUILD | `story/scenes/**`, eslint config 1개 hunk |
| MS-12 | `editorial_story_manifests` 모델·repo·검증기(v1/v2) + 현행 `editorialStory.ts`를 draft adapter로 전환 | JUDGE(데이터) | `src/models/magazine/`, `src/libs/server-utils/magazine/editorialStory*.ts` |
| MS-13 | Story Mode 9:16 개편(현행 컴포넌트 확장, setTimeout 제거) | BUILD | `AppMagazineStoryMode.tsx` |
| 검증 | `pnpm run lint`, `pnpm run typecheck`, `test:editorialStoryModeContract`, 신규 timeline 단위 테스트(seek 결정성), visual-check 375/768/1024/1440 | SCAN | — |

### P2 — 저작 도구와 WP 입력

| TASK | 내용 | 티어 |
| --- | --- | --- |
| MS-20 | WP snapshot anchor adapter(정규화 + heading/paragraph anchor + `sourceRevision` digest) | JUDGE(계약) |
| MS-21 | admin `stories/[storyId]`: 미리보기(웹 플레이어 재사용), Scene 편집(문장·순서·duration·asset), 승인 | BUILD |
| MS-22 | AI 보조 Beat 초안(Gen Studio content pipeline, internal owner, JSON schema 검증, claimStatus 필터) | JUDGE(비용·사실성) |

### P3 — 표면 파일럿 (G-AIR-10 해제 또는 예외 승인 후)

| TASK | 내용 | 티어 | 저장소 |
| --- | --- | --- | --- |
| MS-30 | 홈 Motion Card: 대표 3~5건(signature 1 + motion 2~4), HOM Deck과 통합 | BUILD | node-app |
| MS-31 | 아카이브 Motion Card: `story-surfaces` API(HMAC) + WP 카드·vanilla WAAPI·SCSS, 대표 이미지 CLS 보완, 권한 임시 상향 → 원복 | BUILD(+권한 절차) | node-app API → amu_app 순서 |
| MS-32 | 상세 Hero(WP·App) + [스토리로 보기] | BUILD | 양쪽 |
| MS-33 | WP 기사 Story Mode embed(`/embed/magazine/story/{storyId}`, embed 보안 계약) | JUDGE(보안) | node-app → amu_app |
| 검증 | 표면별 CWV 75p, reduced-motion·저사양 폴백 매트릭스(visual-runtime §9), JS 비활성 WP 렌더, `php -l`, `docker compose config`, 계측 dataLayer 실측 | SCAN + 독립 리뷰 | — |

교차 스코프 순서: **계약(MS-02·03) → node-app API → WP 소비** 순이다. node-app의 `story-surfaces` 응답이 바뀌면 WP가 깨지므로 fixture 계약 테스트를 양쪽에 둔다.

### P4 — 내레이션

| TASK | 내용 | 티어 |
| --- | --- | --- |
| MS-40 | `with-timestamps` 공식 사양 확인(과금·포맷) + provider 옵션 + cue 접기(어절) | JUDGE(프로바이더·비용) |
| MS-41 | `story_narration_cues` + 내레이션 게시 연동 + 플레이어 오디오 마스터 클럭 | BUILD |

### P5 — 영상 Export

| TASK | 내용 | 티어 |
| --- | --- | --- |
| MS-50 | 엔진 bake-off PoC(격리 브랜치/스크래치, 운영 무관): §4.7 기준 4종 측정 | SCAN/BUILD |
| MS-51 | 렌더 워커 컨테이너(Dockerfile 신설, Chromium·ffmpeg·Pretendard), compose 서비스 추가 — dry-run → 헬스체크 → 롤백 세트 | JUDGE(인프라) |
| MS-52 | `motion_render_jobs` 큐·상태 머신·R2 저장(보상 삭제 포함)·`video_assets` 기록 | JUDGE(데이터) |
| MS-53 | Agent API/MCP `render_story_short`(운영자 scope) + Marketing Oops 소재 연계 | JUDGE(외부 발행) |

### P6 — 보류 (별도 계약 필요)

- 개인화 Story·이용자 코인 과금
- 이용자 대면 TTS
- Motion Canvas 설명 축
- 엔진 혼합 하이브리드
- Gen Studio "Interactive Scene" 생성

**규모 추정**(추정, 1인 에이전트 세션 기준)
- P0: 1~2일
- P1: 4~6일
- P2: 4~5일
- P3: 5~7일
- P4: 2~3일
- P5: 6~9일

P3까지만 해도 사용자 요청의 "화면 경험"은 완성된다. P4·P5는 파일럿 성과를 보고 착수한다.

---

## 9. 사용자 결정 필요 (blocking)

| ID | 질문 | 권고 |
| --- | --- | --- |
| OD-MS-01 | G-AIR-10: AIR-503 판정 기준을 먼저 정의할지, 이번 확장을 "새 파일럿"으로 예외 승인할지 | **판정 기준을 먼저 정의(MS-04)**한 뒤 파일럿 표본을 3~5건으로 넓힌다. 헌장 §9.3 "확신이 낮으면 실험 규모를 줄인다"와 맞는다 |
| OD-MS-02 | 영상 엔진: 참고 문서의 "Rendiv + Motion Canvas" 결정을 유지할지, bake-off 후 선택할지. AMU가 Remotion 무료 조건(직원 ≤3 영리 조직)에 해당하는지 | bake-off 후 선택(MS-50). Motion Canvas는 보류 |
| OD-MS-03 | 홈의 "좌우 이동": 카드 내부 캐러셀인지, Interaction Language v2의 Deck 제스처(세로 snap + 좌/우 = 카테고리/읽기)를 따를지 | Deck 제스처를 따르고 카드는 단일 루프만 담당(제스처 충돌 회피) |
| OD-MS-04 | 홈 리뉴얼 원장(WP 전제)을 node-app 기준으로 재작성할지 | 재작성. 운영 `/`는 node-app이다(2026-09-29 실측) |
| OD-MS-05 | 버튼 문구: "영상으로 보기" vs "스토리로 보기" | "스토리로 보기". 실제 영상 export가 붙은 뒤에도 웹 모드와 영상 파일을 구분해 부른다 |
| OD-MS-06 | 파일럿 대상 기사 선정 방식(편집자 지정 고정 목록 vs 조건 자동) | 편집자 지정 고정 목록(HOM-OD-01과 통합 판정) |

---

## 10. 리스크

| 리스크 | 영향 | 완화 |
| --- | --- | --- |
| 정보성 기사가 광고 영상처럼 보여 신뢰가 떨어진다 | 편집 신뢰 훼손 | 등급제, 편집 승인, claimStatus 필터, 대표 3~5건 한정 |
| 모바일 GPU·배터리 소모, 목록 다중 애니메이션 | CWV 회귀 | 뷰포트 1 surface, 아카이브는 WebGL 금지, 루프 2회 제한 |
| 루프 텍스트의 피로·멀미 | 이탈, 접근성 | 일시정지, reduced-motion 정적, 5초 규칙 |
| 운영 비용(기사마다 수작업) | 지속 불가 | 결정론적 초안 + AI 보조 + 표현 컴파일러. 편집자는 승인과 미세 수정만 한다 |
| Rendiv 단일 메인테이너 중단 | export 경로 고사 | 어댑터 격리, 장면 컴포넌트 엔진 비의존, 자체 driver 후보 유지 |
| 헤드리스 Chromium 메모리 누수·크래시 | 워커 장애 | 별도 컨테이너, concurrency 1, 잡당 브라우저 재시작, lease 만료 재큐 |
| WP·node 두 런타임의 모션 드리프트 | 표면 간 불일치 | 토큰 정본 1개 + parity 테스트, WP는 `motion` 등급까지만 |
| 두 원장(HOM·AIR R5)의 가설 중복 검증 | 판정 분산 | MS-01에서 원장 관계 정리(Main 전용) |

---

## 11. 검증 기록

| 항목 | 결과 |
| --- | --- |
| 참고 문서 2건 전문 확인 | 완료(각 약 2,950줄) |
| 기존 계약 3건·원장 3건·정책 정본 대조 | 완료 — 조사 3축(WP 테마·node-app·정책)은 SCAN 서브에이전트가 병렬 수행했고, Main이 핵심 인용을 재조회해 확인했다(`editorialStory.ts:1-60`, `AppMagazineStoryMode.tsx:1-60`, `HomePageClient.tsx` 구조) |
| 운영 표면 서빙 주체 | `curl` 2건 실측(§2.1) — 읽기 전용 GET |
| 라이브러리 성숙도·라이선스 | `npm view`(Rendiv·Motion Canvas·Revideo·Remotion), Remotion LICENSE.md(unpkg 4.0.529) 원문 확인 |
| ui-ux-pro-max | `--design-system` 1회(영속화 없음) + `ux` 도메인 검색 1회 → §6 계약 10항목으로 압축 |
| lint·typecheck·test | **해당 없음** — 코드 변경 0건 |
| visual-check·브라우저 실측 | **미실행** — 구현 전 설계 단계 |
| ElevenLabs `with-timestamps` 공식 사양 | **미확인** — MS-40 선행 조건 |
| 기존 카드 클릭 이벤트의 `surface` 속성 지원 | **미확인** — P3 착수 전 확인 |

## 12. 라우팅 기록

| TASK / step | 역할 | 티어 | 모델 | effort |
| --- | --- | --- | --- | --- |
| 설계 보고 / 참고 문서 분석·통합·판정 | Main | JUDGE | claude-opus-5-5 | 기본 |
| 설계 보고 / WP 테마 현황 | explorer | SCAN | Explore 에이전트 | 기본 |
| 설계 보고 / node-app 비디오·오디오·Story 현황 | explorer | SCAN | Explore 에이전트 | 기본 |
| 설계 보고 / 정책·원장 게이트 | explorer | SCAN | Explore 에이전트 | 기본 |
