# 게임 에셋 생성 — 코드·설정 검토 (Assets Studio → 런타임)

- 작성일: 2026-10-15
- 선행 문서: `20261015_play-stage-mobile-performance-audit.md`
- 대상: `node-app/`
  - 생성 템플릿: `consts/game/gameAssetTemplates.ts`, `worldAssetTemplates.ts`, `worldAssetCatalog.ts`, `admin/game-assets/spriteActionModel.ts`
  - 파이프라인: `libs/server-utils/game/sprite*.ts`, `chromaKey*.ts`, `worldAssetGenerationService.ts`, `api/game/assets/publish/route.ts`
  - 런타임 소비: `hooks/game/core/useGameInit.ts`, `hooks/game/stage/useStageNpcs.ts`·`useStageObstacles.ts`, `utils/game/spriteSheetUtils.ts`·`isometricRender.ts`·`helperUtils.ts`
- 성격: 정적 코드 분석. 생성 결과물 실물은 보지 않았으므로, 화질 판정은 "구조상 이렇게 될 수밖에 없다"는 근거로만 적었다.

---

## 0. 요약

Assets Studio 파이프라인 자체는 탄탄하다. 아래 단계가 모두 계약과 코드로 갖춰져 있다.

- anchor → bible(5방향) → base4 / diagonal4 → 방향별 재생성 → 크로마키 v2(YCbCr, despill, 적응형 팔레트) → 셀 검증 → WebP 합성 → 발행 게이트

문제는 **"생성"과 "런타임 표시" 사이에 공유된 규격이 없다**는 점이다. 생성 측은 "셀 256px 안에 캐릭터 하나"까지만 정하고, 런타임은 그 셀을 자기 상수(60px, 4:5 비율, 앵커 = 셀 바닥)로 늘려 그린다. 그래서 아래 다섯 가지가 구조적으로 생긴다.

1. **비율 왜곡**: 정사각 셀(1:1)을 60×75(4:5)로 그린다. 캐릭터가 세로로 25% 늘어난다(G-1).
2. **캐릭터마다 다른 크기와 떠 있는 발**: 셀 안에서 캐릭터가 차지하는 비율과 발 위치를 정규화하지 않는다. 런타임 앵커는 셀 바닥(0.5, 1)이다(G-2).
3. **에셋 간 조명·화풍 불일치**: 월드 오브젝트만 "광원 좌상단"을 명시하고, 캐릭터·타일셋 템플릿은 "consistent lighting"만 적었다. `visual_style` 선택지도 템플릿마다 다르다(A-1·A-2).
4. **월드 에셋은 후처리 없이 저장된다**: 투명 배경을 지원하지 않는 Google 모델로 "transparent background"를 요구한다. 크로마키, 여백 제거(trim), 앵커·높이 자동 산출이 모두 없다(W-1~W-3).
5. **해상도 낭비**: 1024px 캔버스나 256px 셀을 화면에서는 60~130px로 그린다. 모바일 GPU 메모리를 4~16배 쓰고, 축소 시 지글거림(aliasing)이 생긴다(R-1).

해결 방향은 하나다. **유니버스 단위 "에셋 런타임 계약(Asset Runtime Contract)"**을 설정으로 두고, 생성 프롬프트 변수·후처리·검증·발행 메타·런타임 표시가 모두 이 값을 읽게 한다(§3).

---

## 1. 현재 파이프라인 (코드 확인)

```
[캐릭터]
anchor(정면 1장) ─▶ bible 5방향(1열 5셀) ─▶ base4 + diagonal4 (또는 sheet4 그리드)
     │                   │ verifyCharacterBibleAsset              │
     │                   ▼                                        ▼
     │          크로마키 v2 → 셀 검증                  postProcessSheetAsset (크로마키·alpha 분석)
     │                                                           ▼
     │                                         reflowGrid → 셀 256×256 (fit: "fill")
     │                                                           ▼
     │                                         verifySheetSlices (빈 셀·잘림·행 내 높이 편차)
     │                                                           ▼
     │                                         (대칭 가능 액션) mirrorSpriteDirectionStrip
     │                                                           ▼
     └────────────────────────────▶ composeSpriteSheet → WebP q90 / 8행 × N프레임
                                                                 ▼
                                   런타임: Sprite.width/height = 60 × (1 : 1.25), anchor (0.5, 1)

[월드 오브젝트·타일]
카테고리·프리셋 → generateSaveAndBillImages (Google 1K) → createGameAsset(draft, 원본 그대로)
   → 관리자가 footprint·anchor·isoHeightPx 입력 → publish 게이트(값 존재·범위만 검사)
   → 런타임: width = footprint 폭, height = isoHeightPx (각각 독립 지정)
```

---

## 2. 검토 항목

### A. 아트 방향 (스타일·조명) — "모든 에셋이 같은 게임처럼 보이는가"

**A-1. 광원 방향이 템플릿마다 다르거나 없다**
- 월드 오브젝트(`worldAssetTemplates.ts:46`)는 "single light source from the upper-left, one contact shadow"를 명시한다.
- 캐릭터 anchor·bible·sheet·direction 템플릿과 타일셋·프롭 템플릿은 "consistent lighting / shadow direction"만 있고 방향을 지정하지 않는다. 그래서 한 캐릭터 안에서는 일관돼도, 캐릭터·타일·건물 사이에서는 광원이 제각각이 된다. 스크린샷 수준의 통일감을 결정하는 가장 큰 요소다.
- **설정화**: `artBible.lightDirection`(예: `upper-left, 45° elevation`), `artBible.shadowStyle`(예: 접지 그림자만, 별도 레이어). 모든 템플릿 본문에 같은 변수를 주입한다.

**A-2. `visual_style` 선택지가 템플릿마다 다르다**
- 캐릭터: `premium 2.5D isometric game art | soft anime game asset | clean stylized mobile RPG`
- 프롭: `… | clean stylized strategy sim assets | soft futuristic city objects`
- 월드: `premium 2.5D isometric game art | clean stylized mobile RPG`
- 사용자나 운영자가 에셋마다 다른 값을 고르면 한 맵 안에 화풍이 섞인다.
- **설정화**: 스타일은 **유니버스 단위로 1회 고정**하고(`artBible.styleKey`), 에셋별 선택지에서 뺀다. 스타일마다 화풍 문구, 외곽선 정책(두께·색), 채도·명도 범위, 금지 요소를 함께 정의한다.

**A-3. 팔레트**
- 크로마키용 적응형 팔레트는 있지만(`chromaKeyAdaptivePreset.ts`), **아트용 팔레트 제약**은 없다.
- 유니버스 팔레트(주조색 5~8개)를 프롬프트에 넣고, 생성 후 색 분포가 팔레트에서 얼마나 벗어났는지를 검증 지표로 기록하는 정도면 충분하다. 실패 처리가 아니라 경고로 둔다.

**A-4. 스타일 기준 이미지(reference)**
- 캐릭터는 anchor가 정체성 기준 역할을 한다. 하지만 **유니버스 공통 스타일 기준 이미지**(대표 캐릭터 1장 + 대표 타일 1장)를 모든 생성에 함께 넣는 경로는 없다.
- `inputPolicy.referenceImage.maxCount`가 4라서 자리는 있다. 정체성 기준(anchor)과 스타일 기준을 프롬프트에서 역할 구분해 넣는다(예: "Image A identity, Image S style only").

### G. 기하 규격 (스케일·기준선·비율·앵커) — "게임 안에서 제자리에 서 있는가"

**G-1. 런타임 비율 왜곡** ⚠ 확인 필요
- 셀은 256×256(1:1)인데 런타임은 `calculateSpriteSize(60, SPRITE_RATIO.default = 1:1.25)`로 **60×75**를 지정한다(`useGameInit.ts:261`, `useStageNpcs.ts:116`, `gameConstants.ts:10-19`). 가로 0.234배, 세로 0.293배로 늘려 그리는 것이라 캐릭터가 세로로 약 25% 늘어 보인다.
- 4:5 비율은 시트 이전의 단일 이미지 스프라이트 시절 상수로 보인다. 시트 에셋은 **프레임 메타(`frameWidth/frameHeight`)의 비율을 따라야** 한다. 레거시 단일 이미지만 기존 비율을 쓰게 분기한다.
- 실제 화면 캡처로 왜곡 여부부터 확인할 것을 권한다.

**G-2. 셀 안의 캐릭터 크기와 발 위치를 정규화하지 않는다**
- 프롬프트는 "feet on a consistent baseline inside every cell, with enough margin"까지만 요구한다.
- 서버 검증(`spriteSheetVerifier.ts`)은 **행 안의** bbox 높이 편차(≤25%)와 잘림만 본다. 셀 안에서 캐릭터가 차지하는 비율이나 발 위치의 **절대값**은 보지 않는다.
- 런타임 앵커는 셀 바닥(0.5, 1)이다. 그 결과:
  - 캐릭터 A는 셀의 90%를 채우고 B는 65%를 채우면, 같은 60px로 그려도 **B가 30% 작아 보인다.**
  - 발이 셀 바닥에서 10% 위에 있으면 런타임에서 **약 7px 떠 있다**. 접지 그림자를 넣으면 더 눈에 띈다.
  - 방향마다(앞·뒤·대각) 발 위치가 다르면 방향을 바꿀 때 **캐릭터가 위아래로 튄다**.
- **후처리 정규화(가장 효과가 큼)**: 합성 전에 캐릭터의 전체 프레임에서 alpha bbox를 구해 아래를 강제한다.
  - 기준선: 발 접지점(하단 불투명 픽셀 행)을 셀 높이의 `baselineRatio`(예: 0.92)에 맞춘다.
  - 크기: 걷기 사이클 **중앙값** 높이를 `targetFillRatio`(예: 0.78)에 맞추는 균일 스케일을 캐릭터 전체에 하나만 적용한다. 프레임마다 따로 맞추면 걷기 동작의 높낮이가 사라진다.
  - 가로 중심: 발 접지점 x를 셀 중앙에 맞춘다.
  - 결과 `baselineRatio`와 `pivot`을 시트 메타에 기록하고, 런타임 앵커는 그 값을 쓴다.
- **검증 추가**: 방향 간 기준선 편차, 캐릭터 간 fill 비율 편차.

**G-3. 셀 리사이즈가 `fit: "fill"`이다**
- `reflowGridToStrip`과 `reflowSheet4GridToRuntimeRows`가 원본 셀을 `fit: "fill"`로 256×256에 맞춘다(`spriteSheetComposer.ts`).
- 원본 그리드가 정사각이 아닌 경우가 **f8 프로파일에서 두 군데** 있다(`gameAssetTemplates.ts` `SPRITE_SHEET_PROFILES.f8`).
  - `sheet4Generation` 1024×1536 / 4열×8행 → **256×192 셀** → 256×256으로 늘리면 세로 1.33배 왜곡
  - `directionGeneration` 1536×1024 / 4열×2행 → **384×512 셀** → 256×256으로 줄이면 가로 0.67배·세로 0.5배라 가로가 1.33배 넓어지는 왜곡
  - 즉 f8은 생성 경로(시트 일괄 생성 vs 방향 재생성)에 따라 **반대 방향으로** 찌그러져서, 같은 캐릭터 안에서도 방향마다 체형이 달라질 수 있다. v2(512×512 셀)와 f6(256×256·512×512 셀)은 정사각이라 문제가 없다.
- **수정**: `fit: "contain"`(투명 배경 패딩) + G-2 정규화. 또는 프로파일 정의 단계에서 원본 셀이 정사각이 아니면 거부한다(설정 검증).

**G-4. 캐릭터 대 타일 스케일 계약이 없다**
- 타일 폭은 128px(`gameConstants.ts:194`), 캐릭터는 60px 고정이다. 이 비율은 생성 측이 모른다.
- **설정화**: `geometry.characterHeightInTiles`(예: 1.4타일 높이)를 정하면 런타임 표시 크기, 생성 시 권장 fill 비율, 월드 오브젝트 높이 기준(문 높이, 나무 높이)이 모두 이 값에서 나온다.

### N. 애니메이션 계약

**N-1. fps가 이동 틱(30ms)에 양자화된다**
- `ticksPerFrame = round(1000 / (fps × 30))`이므로 실제 재생 속도가 의도와 다르다.
  - 8fps → 8.33fps
  - 10fps(attack) → 11.1fps
  - 12fps(run) → 11.1fps
- 공격 판정 타이밍을 프레임에 맞추는 ARPG에서는 문제가 된다. 성능 보고서 P0-2(경과 시간 기반 루프)와 함께 **ms 단위 누적**으로 바꾼다.

**N-2. 이동 속도와 보폭이 연결되지 않아 발이 미끄러진다(foot sliding)**
- 이동 속도(`step` px/틱)와 걷기 애니메이션(fps·프레임 수)이 독립 상수다. 화면상 보폭과 실제 이동 거리가 맞지 않으면 "미끄러지는" 느낌이 난다. 체감 퀄리티 차이가 큰 부분이다.
- **설정화**: 액션별 `strideLengthPx`(1사이클 이동 거리, 표시 크기 기준)를 두고 `이동 속도 = stride × fps / frameCount`로 런타임 이동 속도를 유도한다. 또는 반대로 속도에서 fps를 유도한다.

**N-3. 액션 세트와 시트 구조**
- 액션 프리셋은 walk·run·attack·defend·down이고(`spriteActionModel.ts`), 시트 1장 = 액션 1개 × 8방향이다. ARPG 캐릭터 1명은 idle·walk·run·attack×n·skill·hit·down으로 **시트 6~8장**이 되고, 엔티티 수만큼 곱해진다.
- 고려할 것:
  - **idle**: 지금은 walk 1프레임(`idleFps` 0)을 idle로 쓴다. 숨쉬기는 런타임 y 오프셋으로 흉내 낸다. 전용 idle 2~4프레임이 있으면 정지 화면의 품질이 크게 오른다.
  - **비반복 액션의 이벤트 프레임**: attack은 몇 번째 프레임에 타격 판정을 할지(`hitFrame`), 이펙트를 어디서 띄울지(`fxAnchor`)를 메타로 가져야 한다. 지금 `ISpriteActionDoc`에는 `loop`만 있다.
  - **방향 축소 옵션**: 몬스터와 소형 펫은 4방향 + 좌우 반전으로 충분한 경우가 많다. 액션·엔티티 등급별로 방향 수를 설정한다(생성 비용 절반).
- **반전(mirroring) 주의**: `symmetryEligible` 액션은 좌우를 반전해 재사용한다. 비대칭 디자인(한 손 무기, 가르마, 엠블럼, 한쪽 어깨 장식)은 반전하면 무기 손이 바뀐다. 반전 허용 여부를 액션이 아니라 **캐릭터 디자인 속성**(bible 단계에서 판정하거나 운영자가 체크)과 결합해야 한다.

**N-4. 시트 메타 fps 고정**
- `buildSpriteSheetMeta`가 `fps: 8`을 고정으로 쓴다. 액션 프리셋의 fps(run 12, attack 10)가 시트 메타에 반영되는지 확인이 필요하다.

### K. 배경 제거·가장자리

- 크로마키 v2(YCbCr), despill, 적응형 팔레트 선택, 품질 지표까지 이미 잘 갖춰져 있다.
- 추가로 고려할 점:
  - **K-1. 키 색상 선택을 캐릭터 팔레트에 연결**: 기본값은 magenta다. 분홍·보라 계열 캐릭터는 anchor 팔레트를 분석해 green이나 blue를 **자동 선택**하는 것을 기본 동작으로 한다. 적응형 팔레트 코드가 이미 있다.
  - **K-2. 축소 후 가장자리 무늬(fringe)**: 256px에서는 안 보이던 반투명 가장자리 잔여색이 60~120px로 줄이면 분홍 테두리로 보일 수 있다. 검증은 **런타임 표시 크기로 축소한 미리보기**에서 해야 한다. Assets Studio 미리보기도 실제 게임 배경색과 표시 크기로 보여 준다.
  - **K-3. 반투명 피처(머리카락, 망토 끝, 이펙트)**: 크로마키로는 반투명을 복원할 수 없다. 이펙트처럼 반투명이 본질인 에셋은 투명 배경을 지원하는 모델(OpenAI 계열 `supportsTransparentBackground: true`)이나 가산 혼합(additive) 렌더링 전용 파이프라인으로 분리한다.

### W. 월드 오브젝트·타일

**W-1. 투명 배경을 지원하지 않는 모델에 투명 배경을 요구한다**
- 월드 템플릿 기본 모델은 Google(`AMU_GAME_SPRITE_GOOGLE_MODEL`)이고, `SPRITE_MODEL_OPTIONS`에서 이 모델은 `supportsTransparentBackground: false`다. 그런데 템플릿 본문은 "transparent background"를 요구한다.
- 이런 요구를 받은 모델은 흔히 **가짜 체커보드 무늬나 흰 배경을 그린다**. `worldAssetGenerationService.ts`는 결과를 후처리 없이 그대로 `createGameAsset`한다.
- **수정**: 캐릭터처럼 단색 크로마키 배경을 요구하고 → 서버 크로마키 v2 → alpha 검증(체커보드 감지 포함) → 실패 시 무과금 재시도 또는 운영자 검토로 보낸다. 모델 옵션의 `supportsTransparentBackground`에 따라 배경 지시문을 자동으로 고른다.

**W-2. 여백 제거와 앵커·높이를 자동으로 산출하지 않는다**
- 1:1 캔버스 가운데 오브젝트가 있는 원본이 그대로 저장된다. 런타임은 `width = footprint 폭`, `height = isoHeightPx`를 **각각 독립적으로** 지정한다(`useStageObstacles.ts:61-68`, `isometricRender.ts:132-145`).
  - 여백이 포함된 채로 늘어나 오브젝트가 작고 떠 보인다.
  - 운영자가 입력한 `isoHeightPx`가 원본 비율과 다르면 **찌그러진다**.
- **수정**: 생성 후 alpha bbox로 trim한다. 접지 다이아몬드 하단 꼭짓점(또는 접지 그림자 중심)으로 `anchor`를 자동 추정한다. `isoHeightPx = footprint 폭 px × (trim 높이 / trim 폭)`으로 **비율을 보존해 자동 산출**한다. 발행 게이트(`publish/route.ts:150-200`)는 지금 값의 존재와 범위만 확인하는데, 여기에 "이미지 비율과 지정 크기의 비율 차이 ≤ 3%" 검사를 추가한다.

**W-3. 타일 이음새**
- 지면 타일은 "seamless tileable"을 프롬프트로만 요구한다. 생성 후 **3×3 반복 배치 미리보기와 가장자리 픽셀 연속성 지표**를 검증에 넣는다. 다이아몬드 마스크 밖 픽셀은 정확히 투명이어야 한다(마스크로 강제 클리핑).
- 지면은 타일 1장 단위보다 **타일셋 + 전이 타일(풀↔흙 경계)** 체계가 스크린샷 수준의 바닥 품질을 만든다. ARPG 확장 시 우선순위가 높다.

**W-4. 오브젝트 높이 기준**
- `size_class`는 single-tile / multi-tile 두 단계뿐이다. G-4의 캐릭터 높이 계약에 맞춰 오브젝트 높이 기준을 둔다. 예: 문 1.3 × 캐릭터, 가로등 2.0 ×, 나무 2.5~3.5 ×. 이 기준을 프롬프트와 자동 `isoHeightPx` 산출의 상한·하한으로 쓴다.

### R. 출력 해상도·포맷·런타임 예산

**R-1. 생성 해상도와 표시 해상도의 차이**

| 에셋 | 저장 해상도 | 표시 크기(현재 상수) | 배율 |
|---|---|---|---|
| 캐릭터 셀 | 256×256 | 60×75 | 약 4배 |
| 캐릭터 시트 | 1024~2048 × 2048 | — | GPU 8~16MB/장 |
| 월드 오브젝트 | 1K 캔버스(여백 포함) | 128~256px | 4~8배 |

- 고해상도 원본은 **마스터로 보관**한다(재가공, 마케팅용). 런타임 배포본은 **등급별로 파생**한다.
  - 표시 크기 × 2배(고해상도 화면) = high
  - × 1.25 = mobile-low
- 축소는 서버(sharp lanczos)에서 미리 해 둔다. 런타임에서 4배 축소하면 밉맵이 없을 때 지글거림이 생긴다.
- 시트 메타에 `variants: { high, low }` URL·크기·sha256을 둔다. 클라이언트는 기기 등급으로 고른다.

**R-2. 아틀라스·draw call**
- 월드 오브젝트는 장마다 개별 텍스처다. 스테이지 발행(`stageReleaseManifestService`) 시점에 **스테이지가 쓰는 오브젝트를 아틀라스로 묶는 단계**를 넣으면 draw call과 로딩 요청 수가 크게 준다. 발행 시점은 에셋이 확정된 때라 가장 자연스러운 위치다.

**R-3. 포맷**
- WebP q90 / alphaQuality 100은 적절하다. iOS 오래된 버전 지원 범위를 확인하고, 필요하면 PNG 대체본을 둔다.
- GPU 압축 텍스처(KTX2/Basis)는 엔티티가 수백 개가 되는 시점에 검토한다(pixi 8 지원).

**R-4. 메모리 예산을 발행 게이트로**
- 스테이지 발행 시 "이 스테이지가 로드하는 텍스처의 GPU 메모리 합계"를 계산한다. 기기 등급별 예산(예: low 64MB / mid 128MB)을 넘으면 경고하거나 차단한다. 성능 문제를 런타임이 아니라 **제작 단계에서** 막는 장치다.

### V. 검증 게이트 보강 (요약)

| 단계 | 지금 검사 | 추가 권장 |
|---|---|---|
| bible·sheet 셀 | 빈 셀, 경계 잘림, 행 내 높이 편차 ≤25% | 방향 간 기준선 편차, fill 비율 범위, 정체성 일치도(anchor와 색 히스토그램·실루엣 비교), 방향 정확도(지정 방향을 실제로 보고 있는지 — 이 부분은 vision 판단이 필요하며 JEV-208/209 Clef 이미지 판단의 후보) |
| 크로마키 | alpha 품질 지표 | 표시 크기 축소본의 fringe 지표, 체커보드 무늬 감지 |
| 월드 오브젝트 | (없음) | alpha 검증, trim 후 비율, 접지 앵커 추정 신뢰도 |
| 타일 | (없음) | 3×3 이음새 연속성, 다이아몬드 마스크 밖 투명 |
| 발행 | footprint·anchor·isoHeightPx 존재·범위 | 이미지 비율 대비 지정 크기 오차, 스테이지 GPU 메모리 예산 |

### C. 비용·재현성·운영

- **C-1. 실패 단위 재생성**: 방향 단위 재생성(`characterSpriteDirectionV3`)이 이미 있어 좋다. 검증에서 실패한 방향만 자동으로 재생성 후보로 올리고, 재생성 횟수 상한과 비용 상한을 설정으로 둔다.
- **C-2. 재현성 기록**: AI 이미지 모델은 seed 재현을 보장하지 않는다. 그래서 **템플릿 key·version, 주입 변수 전체, 참조 이미지 sha256, 모델명, 후처리 정책 버전(크로마키 프로필, 정규화 파라미터)**을 에셋 메타에 남겨야 같은 결과를 "같은 조건으로 다시" 만들 수 있다. 지금은 templateKey·provider·modelName은 있지만 버전과 후처리 파라미터는 일부만 남는다.
- **C-3. 계약 버전**: 위 정규화(G-2)나 해상도 파생(R-1)을 도입하면 기존 발행 에셋과 계약이 달라진다. `contractVersion`으로 런타임이 분기해야 한다. 기존 v2 4프레임 호환 계약(`SPRITE_SHEET_V2_CONTRACT`)과 같은 방식을 따른다.
- **C-4. 모델 교체 영향**: 모델을 바꾸면(`SPRITE_MODEL_LOCK`, 대체 모델) 화풍이 달라진다. 유니버스 안에서는 **모델도 artBible의 일부로 고정**하고, 교체할 때는 기존 에셋 재생성 계획과 함께 진행한다.

### X. ARPG 확장 시 추가로 필요한 에셋 유형

- **몬스터**: 캐릭터 파이프라인을 재사용하되 방향 수, 액션 세트, 크기 등급(소·중·대·보스)을 엔티티 등급 설정으로 분리한다.
- **이펙트(VFX)**: 반투명·가산 혼합 전용이다. 크로마키가 아니라 검은 배경 + additive, 또는 투명 지원 모델을 쓴다. 프레임 시퀀스 규격(fps, 원점, 크기 등급)이 따로 필요하다.
- **장비 교체**: 장비마다 캐릭터 전체 시트를 다시 생성하면 비용이 폭발한다. 장비를 시각적으로 바꾸려면 레이어 분리(몸·무기 분리) 계약이 필요하다. 1단계에서는 장비를 시각 변화 없이 스탯만 바꾸는 것으로 범위를 제한하는 것을 권한다.
- **UI 아이콘**: 아이템·스킬 아이콘은 정사각, 고정 크기, 테두리 규격을 정한다. 월드 에셋과 다른 템플릿이 필요하다.

---

## 3. 제안 — 유니버스 단위 에셋 런타임 계약 (설정 스키마 초안)

```ts
// consts/game/assetRuntimeContract.ts (초안)
export type AssetRuntimeContract = {
  contractVersion: 3;
  artBible: {
    styleKey: string;                    // 유니버스 1개 고정 — 템플릿 visual_style 대체
    stylePrompt: string;
    lightDirection: "upper-left";        // 모든 템플릿에 주입
    shadowPolicy: "contact-only";        // 접지 그림자만, 배경 그림자 금지
    outline: { enabled: boolean; colorHint?: string };
    palette: string[];                   // 주조색 hex 5~8개 (경고 지표용)
    styleReferenceAssetIds: string[];    // 스타일 기준 이미지 (identity 와 별도 역할)
    imageModel: { provider: string; modelName: string }; // 유니버스 내 고정
  };
  geometry: {
    projection: "isometric-2to1";
    tileWidthPx: 128;
    characterHeightInTiles: 1.4;         // 런타임 표시 크기·생성 fill 의 공통 원천
    cell: { size: 256; targetFillRatio: 0.78; baselineRatio: 0.92 };
    objectHeightBands: Record<"door" | "lamp" | "tree", [min: number, max: number]>; // 캐릭터 높이 배수
  };
  animation: {
    clock: "ms";                          // 틱 양자화 제거
    actions: Record<string, {
      frames: 4 | 6 | 8; fps: number; loop: boolean;
      directions: 4 | 8;                  // 몬스터·펫은 4 + mirror
      strideLengthPx?: number;            // 이동 액션 — foot sliding 방지
      hitFrame?: number; fxAnchor?: { x: number; y: number };
    }>;
    mirrorPolicy: "design-symmetric-only";
  };
  output: {
    master: { keep: true };
    variants: { high: { scale: 2 }; low: { scale: 1.25 } }; // 표시 크기 대비
    format: "webp"; quality: 90;
  };
  budgets: {
    stageGpuMemoryMB: { low: 64; mid: 128; high: 256 };
    maxRegenerationsPerDirection: 2;
  };
};
```

적용 지점:
1. **프롬프트**: `artBible.*`와 `geometry.cell.*`를 템플릿 변수로 주입하고, 템플릿 본문에서 스타일·조명 선택지를 제거한다.
2. **후처리**: G-2 정규화, W-2 trim·앵커·높이 산출, R-1 변형 생성.
3. **검증**: §2-V 표의 추가 지표.
4. **발행 메타**: `contractVersion`, `pivot`, `baselineRatio`, `variants`, 생성 재현 정보(C-2).
5. **런타임**: 표시 크기 = `characterHeightInTiles × tile 높이 환산`, 비율 = 프레임 비율, 앵커 = 메타 `pivot`. 레거시(contract < 3)는 현행 경로를 유지한다.

이 계약은 시스템 설정(유니버스별 override + 코드 기본값)으로 두되, **이미 발행된 에셋에 영향을 주는 값(geometry, output)은 계약 버전을 올려서만 바꾼다.**

---

## 4. 우선순위

| 순서 | 항목 | 효과 | 범위 |
|---|---|---|---|
| 1 | G-1 런타임 비율 왜곡 확인·수정 (시트는 프레임 비율 사용) | 즉시 보이는 품질 | 런타임 2곳 |
| 2 | A-1·A-2 광원·스타일 공통 변수화 (템플릿 본문 수정) | 에셋 간 통일감 | 템플릿 상수 + 시드 동기화 |
| 3 | W-1 월드 에셋 크로마키 후처리 + 배경 지시 자동 선택 | 체커보드·흰 배경 제거 | 월드 생성 서비스 |
| 4 | G-2·G-3 기준선·fill 정규화, `fit: "contain"` | 크기 통일, 떠 있는 발 제거 | 합성 단계 + 시트 메타 + 런타임 앵커 |
| 5 | W-2 trim + 앵커·isoHeightPx 자동 산출 + 발행 비율 검사 | 오브젝트 찌그러짐·떠 있음 제거 | 생성 후처리 + publish 게이트 |
| 6 | R-1 해상도 변형 + R-4 스테이지 메모리 예산 | 모바일 메모리·선명도 | 합성·발행·텍스처 로더 |
| 7 | N-1·N-2 ms 기반 애니메이션 + 보폭 연동 | 걷기 체감 | 성능 보고서 P0-2와 함께 |
| 8 | §3 계약 스키마 정식화 + 계약 v3 | 이후 확장의 기반 | 설정·마이그레이션 |

1~3은 기존 발행 에셋과 계약을 깨지 않는다. 4번부터는 계약 버전(C-3)을 함께 설계해야 한다.
