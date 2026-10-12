# Play · The World 시작 설계 — 첫 캐릭터·Series Arc·Play 환경·Intelligence

* 문서 상태: `draft` — 기획 산출물(P0 이전 A0 + P7 Series Arc 계획). 공식 Canon·출판 승인 아님
* 작성: 2026-10-12
* 기준 정본: `.agent/references/CONTENT/INTERACTIVE-SSOT/INTERACTIVE-NARRATIVE-STANDARD.md` v1.0 (이하 **규약**)
* 원천 흐름: `.agent/references/CONTENT/INTERACTIVE-SSOT/interactive_article_process.md` (이하 **TEMP**)
* 실행 원장: `todo-interactive-story-content-system.json` (ISCS) — `implementationAuthorized=false`
* 동반 문서: [`01_story-s01-after-the-cut_brief.md`](./01_story-s01-after-the-cut_brief.md) — 첫 Story Production Brief

> 이 문서는 **설계**다. 코드·DB·Canon revision을 만들지 않는다. 규약 §8에 따라 Brief와 기획 산출물은
> `.agent/content/` 아래에만 두고 운영 DB에 쓰지 않는다(`G-ISC-DATA`).

---

## 0. 한눈에 보기

| 항목 | 설계안 |
| --- | --- |
| 유니버스 | `the-world` (`DEFAULT_WORLD_UNIVERSE`) — 인간형 캐릭터의 현대 도시 성장 시뮬레이션(학습·거래·미션·관계) |
| 주인공 | **하린 (Harin)** — 패션 인플루언서·모델, 숏컷 스타일. 목표는 자기 이름의 패션 브랜드를 시작하는 것 *(이름은 후보, §7 결정 1)* |
| 메인 Series Arc | **프레임 밖으로 (Out of Frame)** — "보여지는 사람"에서 "만드는 사람"으로 |
| 사용자 판단 이동(아크 전체) | "관심을 많이 받으면 사업은 된다" → "관심은 출발점일 뿐, 수요·원가·신뢰는 따로 확인하고 쌓아야 한다" |
| 첫 Story | **S01 「머리를 자른 다음 날」** — 팔로워 수와 구매 수요는 다르다(Demand Before Build) |
| Home 형태 | 세로 숏폼 Story(장면 카드 + 텍스트 모션 + 선택 2회) |
| Play 연결 | 하린의 스튜디오를 거점으로 한 The World 도시 구역 5곳 + Intelligence 아카이브 |
| CTA | 기본: "다른 선택으로 다시 보기" / Play 공개 후: "이 캐릭터로 나만의 스토리 시작하기" |

TEMP 5단계와 이 문서의 대응:

| TEMP 단계 | 규약 단계 | 이 설계의 위치 |
| --- | --- | --- |
| 1. 캐릭터 생성(캐릭터 시트·액션 시트) | A0-1·A0-2 | §1·§2 |
| 2. 기본 맵·게임 에셋 배치 | A0-3 | §4 |
| 3. 주인공 메인 스토리라인 인터랙티브 아티클 설계 | P0~P12 | §3 + 동반 Brief |
| 4. CRUD 등록 후 홈 노출 | P13~P16 (ISCS, 규약 부록 A "Play 전용 CRUD" → ISCS로 adapt) | §6 게이트 |
| 5. CTA "이 캐릭터로 나만의 스토리 시작하기" | 규약 §11.3 | §5.3 |

---

## 1. A0-1 유니버스 — The World

### 1.1 코드 관찰 (node-app — **이 브랜치 스냅샷 기준, 최신 아님**)

> 이 브랜치의 `node-app/`은 최신 코드가 아니다. 예를 들어 규약이 구현 정본으로 인용하는
> `src/types/story/interactiveStory.ts`(PTU-002 사이클 1, `6f13194a`)가 이 스냅샷에는 없다.
> 아래 관찰은 **설계 근거로만** 쓰고, 구현 착수 전에 최신 node-app에서 다시 확인한다.

- `consts/app/universe.ts`: `DEFAULT_WORLD_UNIVERSE = "the-world"`, 판타지 계열은 `the-empire`.
- 게임 에셋 템플릿(`consts/game/gameAssetTemplates.ts`)이 The World를 이렇게 정의한다:
  `"isometric strategy growth simulation, learning, trade, missions, relationships"`. 존(zone) 후보는
  `central plaza · learning district · commerce market · training arena · quiet residential block`.
- 페르소나 타입 매핑(`tutors/personas/route.ts`, `utils/app/tutorsOnboarding.ts`)에서 `monster → the-empire`,
  그 밖(인간형) → `the-world`다. **즉, 사실상 The World는 인간형 유니버스로 운영되고 있다.**
- 이 스냅샷의 `IUniverse`(`types/game/universe.ts`)에는 **"생성 가능한 캐릭터 타입" 필드가 없다.** 최신 코드에도 없다면 TEMP가 요구한 옵션은 신규 작업이다(§7 결정 3, `ISC-OD-05`). *(최신 코드 재확인 필요)*

### 1.2 T0 Core Law 제안 (draft — admin 승인 필요, 규약 §4.3)

| ID(가) | Tier/Entity | 내용 |
| --- | --- | --- |
| `tw-law-001` | T0 `core-law` | The World는 현대 도시를 닮은 세계다. 마법·초자연 능력은 없다. 성장은 **학습·거래·관계·미션**으로만 일어난다 |
| `tw-law-002` | T0 `core-law` | 이 유니버스에서 생성 가능한 캐릭터 타입은 **인간(human)**이다 (몬스터형은 `the-empire`) |
| `tw-law-003` | T0 `core-law` | 세계 안의 지식은 **Intelligence 아카이브**에 기록되며, 캐릭터는 아카이브에서 얻었거나 직접 겪은 것만 안다(전지적 NPC 금지, 규약 §4.4) |
| `tw-law-004` | T0 `core-law` | 실존 기업·인물·브랜드는 세계 안 행위자로 등장하지 않는다. 실제 사례는 아카이브의 **기록(Fact 층)**으로만 존재한다(규약 §6.3) |

> `tw-law-003`은 Play의 Intelligence System(§5)을 세계관 규칙으로 고정하는 장치다. Magazine 지식이
> 세계 안 "기록"으로 들어오되, 사용자 UI에서 Magazine 기사로 이동시키지 않는다(PTU-Q-015).

### 1.3 T1 World — 지역(region) 제안

| ID(가) | 이름 ko / en | 성격 | Story·Play 역할 |
| --- | --- | --- | --- |
| `tw-region-studio` | 하린의 스튜디오 / Harin's Studio | 촬영·콘텐츠 제작 공간 겸 작은 작업실 | 거점(Home base). 관심·팬 관계 |
| `tw-region-textile` | 원단 거리 / Textile Row | 원단·부자재 상가 골목 | 소싱·가격 협상 |
| `tw-region-atelier` | 문 사장의 샘플실 / Moon's Atelier | 패턴·샘플·소량 생산 공방 | 생산·원가·최소 주문 수량 |
| `tw-region-popup` | 팝업 스트리트 / Popup Street | 단기 매장이 열리고 닫히는 거리 | 판매·고객 반응 |
| `tw-region-archive` | 아카이브 / The Archive | 세계의 기록 보관소 | **Intelligence System** 표면 |

- 실존 지명(동대문 등)을 쓰지 않는다. 장소는 현실에서 영감을 받은 **Fiction**이다.

---

## 2. A0-2 캐릭터

캐스팅 순서는 규약 §7.4(역할 → 기존 캐릭터 → 신규)를 따른다. The World에는 공식 Story 캐릭터가 없으므로
첫 Series Arc에 필요한 최소 인원만 신규로 만든다. **세 명 모두 규약 §4.3 "신규 공식 캐릭터" 승인 대상이다.**

### 2.1 주인공 — 하린 (Protagonist · Entry Character)

**Identity (T2)**

| 항목 | 값 |
| --- | --- |
| 이름 | 하린 / Harin *(후보 — §7 결정 1)* |
| 역할 | 패션 인플루언서·모델 → 브랜드 창업자 |
| 소속 | 시작 시: 에이전시 소속 모델 (강 실장 담당) |
| 유니버스 | `the-world` · 타입 `human` |
| 외형 | 레퍼런스 이미지(Gen Studio `1786571106645-gpt-image-2-8e6e1699-3nn0g9.webp`) 기준 + **숏컷**. 캐릭터 시트에서 고정 |
| 말투 | 짧고 솔직하다. 카메라 앞에서는 밝고 리드미컬하게, 혼자일 때는 단문으로 생각한다. 영어 패션 용어를 섞되 남발하지 않는다 |

> 레퍼런스 이미지는 이 세션의 네트워크 정책 때문에 직접 확인하지 못했다. 얼굴·체형·색감은 이미지 기준으로
> 캐릭터 시트 생성 시 확정한다. TEMP 제안대로 **숏컷을 공식 외형으로 채택**하고, 숏컷이 된 계기를 S01 Cold Open으로 쓴다.

**Psychology (T2)**

| 항목 | 값 |
| --- | --- |
| 핵심 성격 | 감각적·추진력 있음·사람을 잘 읽음. 거절을 어려워함 |
| 가치관 | "입는 사람이 자기다워지는 옷"이 좋은 옷이다 |
| 강점 | 트렌드 감각, 스타일링 안목, 카메라 앞 표현력, 팬과의 신뢰 |
| 약점 | 숫자·원가·재고 감각 부족. 불안하면 크게 보여주려 한다 |
| 편견/한계 | 반응(좋아요·댓글)을 결과로 착각한다 |
| **Want** | 자기 이름의 패션 브랜드로 "얼굴"이 아니라 **"안목"**으로 인정받는 것 |
| **Need** | 관심과 수요·신뢰를 구분하고, 작게 확인하며 쌓는 법을 받아들이는 것 |
| **Fear** | 유행처럼 소비되고 잊히는 것. 모델 일이 끊기면 아무것도 남지 않는 것 |
| **Core Belief** | 보여지는 것이 곧 가치다 |
| **Misbelief** | **팔로워가 많으면 브랜드는 팔린다** (관심 = 수요) |
| Stress Response | 불안하면 더 크게 발표하고, 더 많이 약속한다 |
| 도덕적 경계 | 팬을 속이지 않는다 — 광고를 광고 아닌 척하지 않고, 없는 상품을 있는 척 팔지 않는다 |
| Growth Potential | 크리에이터 → 경영자. "보여지는 사람"에서 "판단하는 사람"으로 |

- `Misbelief → 변화`가 사용자의 `currentBelief → desiredBelief`를 끈다(규약 §5.2). 아크 전체가 이 Misbelief를 단계적으로 깨는 구조다(§3).
- **안전 메모(규약 §9.2 Safety)**: 모델 직업을 다루지만 체중·다이어트·외모 비교를 갈등 소재로 쓰지 않는다. 외모 압박은 "계약 조항"처럼 산업 구조로만 다루고, 캐릭터 몸에 대한 평가 대사를 넣지 않는다.

**Narrative State (S01 Entry State)**

| 항목 | 값 |
| --- | --- |
| 현재 목표 | 아무도 모르게 3년간 그려온 디자인 노트를 세상에 내놓기 |
| 감정 | 해방감과 불안이 섞임 (머리를 자른 직후) |
| 위치 | `tw-region-studio` |
| 최근 사건 | 긴 머리를 숏컷으로 자름 |
| 관계 | 강 실장 — 계약(`bound-oath`) / 문 사장 — 모름(`unknown`) |
| Knowledge | 팬 반응을 읽는 법. 생산·원가는 모름 |
| Belief | "투표에서 산다고 하면 산다" |
| 비밀 | 디자인 노트의 존재 |

### 2.2 강 실장 (Challenger)

| 항목 | 값 |
| --- | --- |
| 역할 | 하린의 에이전시 담당 실장. 7년째 하린의 일정을 관리 |
| Want | 하린의 커리어(그리고 회사)를 안정적으로 지키기 |
| Fear | 회사가 흔들리는 것 — **하린에게 말하지 않은 사정**이 있다(Relationship Subplot) |
| Core Belief | "검증된 수입이 먼저다" |
| Misbelief | "인플루언서 브랜드는 대부분 반짝하고 끝난다" |
| 말투 | 존댓말, 짧고 실무적. 걱정을 잔소리로 표현한다 |
| 관점 | **안정·위험회피.** 허수아비가 아니다 — 그의 걱정은 현금흐름 측면에서 타당하다 |

### 2.3 문 사장 (Guide · Bridge Character)

| 항목 | 값 |
| --- | --- |
| 역할 | 원단 거리 골목 끝 샘플실 사장. 30년 차 패턴사 |
| Want | 소량 생산으로도 버티는 공방을 지키기 |
| Fear | 거리의 공방들이 하나둘 문을 닫는 것 (World/Knowledge Subplot) |
| Core Belief | "옷은 숫자로 만든다. 감각은 그 다음이다" |
| Misbelief | "요즘 인플루언서들은 사진만 찍고 만들지는 않는다" — 하린을 처음엔 의심한다 |
| 말투 | 반말 섞인 무심한 말투, 핵심만 말함 |
| 관점 | **실용.** 생산 현실(최소 주문 수량·원가·재고)을 아는 사람 |

### 2.4 관계 그래프 (T3 제안 — draft)

| Edge | 시작 관계 | 아크 내 변화 후보(승인 필요) | 비고 |
| --- | --- | --- | --- |
| 하린 ↔ 강 실장 | `bound-oath` (에이전시 계약) | → `estranged` 또는 → `ally` (S04 이후) | `bound-oath↔estranged`는 배타 쌍 — 동시 선언 불가, append 이벤트로만 전이 |
| 하린 ↔ 문 사장 | `unknown` | → `mentor`(문 → 하린) (S02~S03) | `kin↔unknown`만 배타. mentor 전이 시 unknown은 deprecated 처리 |
| 강 실장 ↔ 문 사장 | 없음 | 과거 인연 Seed 후보(미사용) | Lore Inflation 방지 — 필요할 때만 |

### 2.5 시각 자산 요건 (규약 §5.3)

**캐릭터 시트** — 정면·측면·후면 전신 + 얼굴 클로즈업. 숏컷 실루엣·기본 의상(데일리 룩) 고정.

**액션 시트** — S01~S03에 필요한 `emotionalDelta` 범위로 만든다. 장면마다 외형이 바뀌면 Canon Drift다.

| # | 표정/동작 | 쓰는 장면 |
| --- | --- | --- |
| A1 | 거울 앞, 짧아진 머리를 만지는 담담한 표정 | S01 Cold Open |
| A2 | 휴대폰 알림을 보고 굳는 표정 | S01 Trigger |
| A3 | 통화 중, 입술을 깨무는 망설임 | S01 Conflict |
| A4 | 디자인 노트에 스케치하는 집중 | S01 Goal / 공통 |
| A5 | 라이브 촬영 중 밝은 웃음(카메라 앞 페르소나) | S01 분기 A |
| A6 | 결과 화면을 보며 당황 → 생각에 잠김 | S01 Investigation / Consequence |
| A7 | 원단을 손끝으로 만지며 고르는 진지함 | S01 Complication / S02 |
| A8 | 작게 안도하는 미소 | S01 Resolution |
| A9 | 팔짱 끼고 결심한 정면 | 아크 공통 (Key visual) |

강 실장·문 사장은 초기에 **캐릭터 시트 + 액션 시트 4종(기본·걱정/의심·놀람·미소)**만 만든다(최소 범위).

**액션 시트 프롬프트 초안** (TEMP "추가 예상 작업", Gen Studio 템플릿 후보. 실호출 비용은 `G-ISC-AI-COST` 승인 후):

```text
Create a character action sheet for All My Universe: The World.
Reference: use the attached character sheet as the identity anchor — same face, same short-cut hairstyle,
same proportions, same base outfit in every panel.
Character: {character_name}, {character_role}, {personality_keywords}.
Layout: 3 columns x 3 rows, evenly spaced panels, upper-body framing (waist up), consistent camera height.
Panels (left→right, top→bottom): {panel_list::A1 calm touching short hair in mirror|A2 frozen looking at phone|...}
Style: {visual_style::clean semi-real editorial illustration|soft anime-inspired portrait}, consistent lighting,
neutral light background, no environment detail.
Rules: identical identity across panels, expression and pose change only, no text, no captions,
no logos, no brand marks, no watermark, no extra people.
{negative}
```

- 생성 엔진은 기존 `gameAssetTemplates.ts`의 템플릿 구조(`templateText` + `{param::options}`)에 맞춘다.
- 스프라이트(4x4 isometric walk)는 기존 `characterSprite`/`character-sprite-v2` 파이프라인을 그대로 쓴다. 의상 테마는 `urban explorer gear` 대신 하린의 데일리 룩으로 `{extra}`에 지정한다.

---

## 3. 메인 Series Arc — 「프레임 밖으로 (Out of Frame)」

### 3.1 아크 정의

| 항목 | 값 |
| --- | --- |
| `seriesArcId`(가) | `tw-arc-harin-out-of-frame` |
| 큰 문제 | 남의 브랜드의 "얼굴"이던 하린이, 자기 이름의 브랜드를 시작하고 지켜낼 수 있는가 |
| Main Plot | 첫 컬렉션 → 첫 판매 → 첫 위기 → 두 번째 컬렉션 |
| 캐릭터 변화 | Misbelief "관심 = 수요" → "관심은 출발점, 수요·원가·신뢰는 따로 확인하고 쌓는다" |
| 사용자 판단 이동 | 크리에이터 경제·창업을 다룰 때 "팔로워·조회수"가 아니라 "수요·단위경제·신뢰"를 보게 된다 |
| Subplot (3종) | ① Character: 보여지는 나 vs 만드는 나 ② Relationship: 강 실장이 숨긴 에이전시의 사정 ③ World/Knowledge: 원단 거리 공방들의 생존 |

### 3.2 Story 라인업 (후보 — 각 Story는 P0~P1 재검증 필수)

규약 §7.8·§7.9: 다음 Story를 확정하지 않는다. 아래는 **편집 계획**이며, 각 Story는 해당 지식을 뒷받침하는
Magazine Intelligence(Knowledge Unit)가 확인될 때만 제작한다(Story Dictated Content 금지).

| # | 제목(가) | Core Question | 지식 도메인(Intelligence 필요) | Primary Conflict | Entry → Bridge | Baton Pass |
| --- | --- | --- | --- | --- | --- | --- |
| **S01** | 머리를 자른 다음 날 | 팔로워가 많으면 내 브랜드는 팔릴까? | 관심 신호 vs 구매 신호, 만들기 전 수요 검증 | Safety vs Opportunity | 하린 → 문 사장 | Problem(최소 주문 수량) |
| S02 | 300벌의 약속 | 처음부터 많이 만들면 싸지는데, 왜 위험할까? | 최소 주문 수량·단가·재고 리스크 | Short-term vs Long-term | 문 사장 → 하린 | Knowledge(원가 구조) |
| S03 | 가격표를 붙이는 밤 | 팬이 기대하는 가격과 남는 가격, 무엇을 지킬까? | 원가·마진·가격 포지셔닝 | Value vs Value | 하린 → 하린 | Relationship(강 실장 연락) |
| S04 | 거절할 수 없는 협찬 | 돈이 되는 협찬이 브랜드 신뢰를 깎는다면? | 광고 표시·이해상충·브랜드 신뢰 *(법적 사실은 법무 확인 Claim만)* | Loyalty vs Self-interest | 강 실장 → 하린 | Character(강 실장의 사정) |
| S05 | 품절, 그다음 | 다 팔렸는데 왜 돈이 없을까? | 현금흐름·리오더 판단 | Knowledge vs Uncertainty | 하린 → 문 사장 | Location(팝업 스트리트) |
| S06 | 두 번째 컬렉션 | 잘 팔린 걸 또 만들까, 내가 믿는 걸 만들까? | 브랜드 정체성·위임 | Freedom vs Stability | 하린 → (신규 후보) | World(아크 2 씨앗) |

- Subplot payoffHorizon: ② 강 실장의 사정 — 도입 S01, 회수 S04 (horizon 3) / ③ 공방 생존 — 도입 S01(배경), 압력 S02, 회수 S05~S06.
- S04는 광고 표시 관련 **법적 Fact를 다루므로** Knowledge Claim은 `legal-policy-review` 확인 전 Interpretation 층으로만 쓴다(규약 §6.3·§10).
- 신규 캐릭터는 S06 이전에 만들지 않는다(Character Inflation 방지). S06 Bridge 후보 역할만 예약한다: "하린 브랜드에 합류하고 싶어 하는 젊은 디자이너"(Perspective Gap).

### 3.3 아크의 감정 곡선

```text
S01 해방·불안  →  S02 현실의 벽  →  S03 첫 확신  →  S04 신뢰의 위기  →  S05 성공의 역설  →  S06 정체성
   (Hook)          (Complication)      (Small win)       (Midpoint)          (Dark turn)         (Resolution)
```

---

## 4. A0-3 Play 환경 — 하린의 The World

> Play 시뮬레이션 구현·지도·노드·미니게임은 `todo-play-world-minigame.json`(PWM) 게이트 소관이다(ISC-007).
> 아래는 **콘텐츠 측 요구사항**이다. 보상·코인·XP·확률형 요소를 **Story**에 넣지 않는다(ISCS scope.out).

### 4.1 맵 구성 (isometric 2:1, 기존 stageTileset·propBuildingSheet 템플릿 사용)

| 구역 | 타일셋 `zone` 파라미터 | 프롭·건물 `asset_purpose` | 핵심 행동 |
| --- | --- | --- | --- |
| 하린의 스튜디오 | `quiet residential block` | `starter town services` (촬영 조명·행거·작업대) | 콘텐츠 제작, 팬 반응 확인, 디자인 |
| 원단 거리 | `commerce market` | `commerce store fixtures` (원단 롤·부자재 진열대) | 소싱, 가격 협상 |
| 문 사장의 샘플실 | `commerce market` 변형 | 재봉틀·패턴 테이블·샘플 행거 | 샘플 제작, 생산 수량 결정 |
| 팝업 스트리트 | `central plaza` | 팝업 부스·피팅룸·계산대 | 판매, 고객 반응 |
| 아카이브 | `learning district` | 서가·열람 테이블·기록 단말 | **Intelligence 획득·열람** |

### 4.2 미션 구조 (Series Arc와 1:1 대응 — 시뮬레이션은 Story와 같은 판단을 다른 형식으로 겪게 한다)

| Story | Play 미션(가) | 시뮬레이션이 다루는 판단 | 필요한 Intelligence |
| --- | --- | --- | --- |
| S01 | 「첫 신호」 — 팬 반응과 사전 예약을 나눠 보기 | 어떤 반응을 수요로 볼 것인가 | 관심 신호 vs 구매 신호 |
| S02 | 「수량 정하기」 — 샘플실에서 생산 수량을 정하기 | 단가 vs 재고 위험 | 최소 주문 수량·재고 |
| S03 | 「가격표」 — 원가표를 보고 가격 정하기 | 마진 vs 팬 기대 | 원가·마진 |
| S04~S06 | Story 확정 후 설계 | — | — |

- 미션의 결과값·밸런스 수치는 이 문서가 정하지 않는다(PWM 소관).
- Story의 `world.flag`(예: `harin_launch_path`)는 **해당 사용자의 Narrative Runtime**에만 남는다. Play가 이 플래그를 읽어 미션 시작 상태를 바꿀지는 ISC-007 연결 계약에서 정한다.

---

## 5. Intelligence System — 게임 안에서 지식을 얻는 구조

### 5.1 원칙

1. **문제가 먼저, 지식은 나중.** 아카이브에서 지식을 미리 읽게 하지 않는다. 미션·Story에서 문제를 겪은 뒤 해당 지식이 열린다(규약 §6.1).
2. **원천은 Magazine Knowledge Unit(읽기 전용).** `magazine_knowledge_units`(`magazine-knowledge-unit.v1`)의 `unitType · statement · mechanism · conditions[] · limitations[] · evidenceRefs[]`를 그대로 투영한다. 게임용으로 내용을 바꾸지 않는다.
3. **조건과 한계를 함께 보여준다.** 카드 앞면 = statement, 뒷면 = conditions·limitations·근거 표시. "이렇게 하면 매출 N배" 같은 성과 주장을 만들지 않는다(Copy-as-Persuasion 금지).
4. **Magazine으로 보내지 않는다.** 출처 표시는 근거 표시일 뿐 CTA가 아니다(규약 §11.3). 기사 링크 버튼을 두지 않는다.
5. **근거가 없는 지식은 카드가 되지 않는다.** `evidenceRefs`가 비면 `hypothesis`로 표시하거나 쓰지 않는다. sourceRef를 지어내지 않는다.

### 5.2 카드 형식 (UI 문구에 내부 용어 노출 금지)

| 카드 영역 | 원천 필드 | 사용자 표기 예 |
| --- | --- | --- |
| 제목 | `statement` 요약 | "좋아요는 박수, 결제는 약속" |
| 한 줄 | `statement` | — |
| 왜 그런가 | `mechanism` | — |
| 언제 통하나 | `conditions[]` | — |
| 주의할 점 | `limitations[]` | — |
| 근거 | `evidenceRefs[]` (sourceType·observedAt·claimStatus) | "기록 · 2026-xx-xx 기준" |
| 획득 맥락 | Story/미션 ID | "하린의 첫 신호에서 얻음" |

### 5.3 S01이 여는 Intelligence (Knowledge Unit 후보 — **실존 확인 필요**)

| 카드(가) | unitType | 필요한 Knowledge Unit | 상태 |
| --- | --- | --- | --- |
| 좋아요는 박수, 결제는 약속 | `principle` | 무비용 반응(좋아요·투표)과 비용을 치르는 행동(결제·예약)은 다른 수요 신호다 | **미확인** — Magazine에 해당 KU가 있는지 확인 |
| 만들기 전에 확인하기 | `tactic` | Demand Before Build / 사전 예약·대기 명단으로 수요 확인 | `magazine_knowledge_article.md` §19 예시에 `Demand Before Build`·`Fake Door Test` KU가 언급됨 → **실제 저장 여부·evidenceRefs 확인 필요** |
| 최소 주문 수량 | `signal`/`principle` | 의류 생산의 최소 주문 수량과 재고 위험 | **미확인** — 없으면 S02 착수 전 Intelligence 확보 필요 |

> **Fake Door Test 주의**: 존재하지 않는 상품을 결제까지 받는 방식은 소비자 신뢰·전자상거래 고지 문제가 생길 수 있다.
> S01은 하린의 도덕적 경계("없는 상품을 있는 척 팔지 않는다")에 따라 **"만들 예정임을 밝힌 사전 예약"**으로만 다룬다.
> 사전 예약의 법적 고지 의무 등은 Fact로 쓰지 않는다(법무 미확인).

---

## 6. 제작·공개 게이트 (현재 위치)

| 단계 | 필요한 것 | 게이트 | 현재 |
| --- | --- | --- | --- |
| A0 Canon 등록 (T0·지역·캐릭터·관계) | admin 승인 | 규약 §4.3 | 이 문서 = 제안 |
| 캐릭터 시트·액션 시트 생성 | 템플릿·모델·호출 상한·비용 승인 | `G-ISC-AI-COST` | open |
| 유니버스 캐릭터 타입 옵션 | 소유 원장 지정 후 구현 | `ISC-OD-05` | open |
| S01 Brief 승인 | 사용자 검토 + Intelligence 바인딩 | 규약 §8 | Brief draft 완료 |
| S01 draft 저장 | Story 저장소 | `G-ISC-DATA`(ISC-000) → ISC-002 | 저장소 없음 — fixture 수준만 가능 |
| 검수·출판 | Verifier(§9.2) + 사람 승인 | ISC-005 | planned |
| Home 피드 노출 | 표면 소유 확정 | `G-ISC-HOME-SURFACE`·HOM-01 | open |
| Play CTA 노출 | Play 공개 단계 | `G-ISC-PUBLIC` | `story.runtime` admin_only |

---

## 7. 사용자 결정 필요 사항

| # | 결정 | 권장안 |
| --- | --- | --- |
| 1 | 주인공 이름 | **하린 (Harin)** — 한국어·영어 발음이 같고 브랜드명으로 확장 가능("HARIN" / 브랜드명은 S03 이후 별도 결정) |
| 2 | S01~S03 Intelligence 원천 | Magazine에서 `Demand Before Build`·`Fake Door Test` KU와 최소 주문 수량 관련 기사를 확인해 `sourceRefs`로 묶는다. 없으면 S01은 Interpretation 층 Claim만으로 진행하고, S02는 Intelligence 확보 후 착수 |
| 3 | `ISC-OD-05` 소유 원장 | 유니버스 캐릭터 타입 옵션·액션 시트 템플릿 = `todo-character-model-genesis-validation.json`, 첫 캐릭터와 Series Arc = ISCS(이 원장) ISC-003 입력 |
| 4 | 숏폼 장면 미디어 계약 | 규약 §8의 `storyBeats`는 `prompt + choices`만 갖는다(최신 `interactiveStory.ts`는 이 브랜치에 없어 미확인). 장면별 이미지·모션(숏폼 카드)을 담을 필드가 없다 → **ISC-001 계약 v1에 `scenes[]`(media·caption·motion) 추가를 제안** |
| 5 | 코드 기준점 | 구현 착수(ISC-001 이후) 전에 최신 node-app을 이 브랜치에 반영하거나 기준 커밋을 알려 주시면, §1.1·§2.4·§2.5의 코드 관찰을 다시 확인한다 |
| 6 | "이 캐릭터로 나만의 스토리 시작하기"의 의미 | 공식 유니버스 `the-world`에서 하린을 주인공으로 사용자 개인 run을 시작(공식 Canon + 사용자별 Narrative Runtime). 사용자 개인 유니버스 생성은 규약 §15 보류이므로 포함하지 않는다 |
