# AMU 인터랙티브 서사 콘텐츠 규약 (Interactive Narrative Standard, SSOT)

> **이 문서의 지위**: AMU **Interactive Story**(캐릭터·Canon 세계관·선택·연속 서사를 쓰는 독립 콘텐츠)의 기획·캐스팅·서사 설계·제작·검증·출판·Canon 반영·학습 규약의 단일 출처.
>
> **상태: `approved` — 2026-10-12 사용자 지시로 SSOT 승격.** 승격 시 Magazine Editorial Story·Tutors 관련 내용을 제외했다(Magazine 기사 = Intelligence 리소스 전용, Tutors = Play 통합 후 제거). `todo-interactive-story-content-system.json`의 `G-ISC-NARRATIVE-STANDARD`는 이 개정으로 해소된다.

* 문서 버전: `interactive-narrative-standard-v1.0`
* 최초 작성: 2026-09-28 (v0.1 draft) · 승격: 2026-10-12
* 상위 기준: `BUSINESS-CHARTER.md` → `MARKETING-STRATEGY.md`
* 인접 정본: `SERVICE-ROLE-MAP.md`(ISCS·Play·Magazine 경계), `play/GUIDE.md`(Play 소비), `INTELLIGENCE-PATTERN-POLICY.md`(Intelligence 원천), `MEASUREMENT-PLAN.md`(KPI·이벤트), `PROOF-BANK.md`(대외 주장)
* 구현 정본(코드가 권위): node-app `src/types/story/interactiveStory.ts`(Story 콘텐츠 계약), `src/types/game/narrative-canon.ts`(Canon), `src/types/game/narrative-runtime.ts`(Narrative Runtime), `src/libs/server-utils/narrative/canonValidator.ts`(Canon 쓰기 권한)
* 실행 원장: `.agent/todo-ledgers/in-progress/todo-interactive-story-content-system.json`(ISCS), `.agent/todo-ledgers/in-progress/todo-amu-play-tutors-unification.json` PTU-002(Story runtime)
* 원천 논의(정본 아님 — 이 문서가 채택한 항목만 효력):
  - `.agent/references/AMU_APP/in_progress/AMU_Interactive_Episode_System.md`
  - `.agent/references/AMU_APP/in_progress/Knowledge-Grounded_Narrative_Engine.md`
  - `.agent/references/MARKETING/in_progress/Changes_Judgment_and_Relational_Behavior.md` (2026-10-01)
  - `.agent/references/.TEMP/interactive_article_process.md` (게임 에셋 기반 Story 제작 흐름)

---

## 0. 이 문서가 소유하는 것과 소유하지 않는 것

| 이 문서가 소유한다 | 소유하지 않는다 — 정본 |
| --- | --- |
| Interactive Story의 North Star·성공 상태 정의 | KPI 이벤트명·산식·GA4 설정 — `MEASUREMENT-PLAN.md` (Story 이벤트는 ISC-008) |
| 용어(Interactive Story·Series Arc·Design Beat·Canon Tier)와 기존 용어와의 경계 | Story 콘텐츠 필드·타입·버전 규칙 — node-app `interactiveStory.ts` + ISC-001 계약 v1 |
| Story Planning 파이프라인 단계·단계별 산출물·게이트 | Story 저장·출판 lifecycle·관리 API — ISCS 원장 ISC-002 |
| 캐릭터 정의·상태·지식 분리 원칙, 캐스팅·신규 생성 기준 | Canon 저장 스키마·레이어·전이·쓰기 권한 — node-app `narrative-canon.ts`·`canonValidator.ts` |
| 공식 Canon 변경 승인 경계(편집 판단) | 사용자 진행 상태 전이·reducer·멱등 — `narrative-runtime.ts`, PTU-002 |
| 서사 검증(Verifier) 항목 — ISC-005 출판 검수 체크리스트의 원천 | Intelligence 적격성·Pattern 승격 — `INTELLIGENCE-PATTERN-POLICY.md` |
| 연속성(Entry/Exit State·Baton Pass·Seed) 규칙 | Home 표면 소유·피드 계약 — HOM 원장·ISC-006 |
| Build Log 파생 시리즈의 편집 원칙 | 채널 발행 cap — Marketing Oops `uploadPolicy`(MCP 조회) |
| 서사 성과 학습의 데이터 원칙 | 규제·개인정보 판정 — `.claude/rules/compliance-guardrails.md` |

- **Magazine 기사 작성 규칙(7단 문법·9축·E1~E3·Archetype)은 이 문서가 다루지 않는다** — `CONTENT-INTELLIGENCE.md`. Magazine은 이 문서에서 **Intelligence 원천**으로만 등장한다(§11).
- **수치(발행 cap·KPI 목표치·가격)를 적지 않는다.** 이 문서의 수치는 설계 상한(캐릭터 수·Seed 수·CTA 수)뿐이다.

---

## 1. 목적과 North Star

### 1.1 목적

Interactive Story는 기사에 캐릭터를 얹은 콘텐츠가 아니다. **실제 세계의 지식(Intelligence)을 캐릭터가 겪는 사건으로 번역하고, 사용자가 선택으로 그 사건에 개입해 지식과 판단을 경험하며, 그 결과가 캐릭터의 역사(Narrative Runtime)와 세계(Canon)에 남아 다음 이야기를 낳는 구조**다.

```text
Intelligence(Magazine 등) → Story Planning → Story 제작(ISCS) → 검수 → 출판
→ Home 숏폼 피드 · Play 소비 → 선택 → Narrative Runtime 반영
→ 성과 측정 → (승인 시) 공식 Canon 반영 → Next Seed → Intelligence 재검증
```

### 1.2 North Star — Meaningful Continuation

> **Story를 경험한 사람이 AMU 안에서 다음 행동을 자발적으로 이어가는가.**

- 다음 행동의 예: 다음 Story 보기 · 다른 선택으로 다시 해보기 · 캐릭터로 Play 시작 · 캐릭터와 대화(Play CharacterChat) · 재방문.
- 조회수·완주율 단독으로 성공을 판정하지 않는다. "와, 신기하다(Wow)"는 **획득 장치(Hook)이지 사업 결과가 아니다.**
- **Magazine 기사 방문·복귀는 Story의 성공 조건이 아니다**(PTU-Q-015). 기사로 돌려보내는 CTA·지표를 Story에 두지 않는다.
- 배포되지 않은 기능(저장·팔로우·알림 등)은 목표 행동·CTA로 쓰지 않는다.
- 성공 상태(사용자 반응 기준):

  > "무슨 일이 일어날지 궁금해서 보기 시작했고, 선택하다 보니 생각이 바뀌었고, 이 캐릭터의 다음 이야기도 보고 싶고, 직접 해보고 싶다."

### 1.3 성공 공식 — 4요소 비상쇄

`Attention × Value × Agency × Continuity`

| 요소 | 질문 |
| --- | --- |
| Attention | 피드에서 멈춰 보게 만들었는가 |
| Value | 쓴 시간만큼 얻은 것이 있는가 — 핵심은 **판단 기준의 변화**(§1.5) |
| Agency | 사용자가 직접 선택했고, 그 선택이 의미 있었는가 |
| Continuity | 경험이 다음 Story·Play·재방문으로 이어졌는가 |

- 곱셈 표기는 **하나라도 0에 가까우면 전체 가치가 무너진다**는 뜻이다. 점수 합산으로 약한 축을 상쇄하지 않는다.
- 판정 근거는 점수가 아니라 실제 장면·선택 위치와 실측 이벤트다.

### 1.4 기본 철학 — Entertainment First, Value Always

- **Entertainment = 사용자가 자발적으로 시간을 쓰게 만드는 경험.** 자극·짧음·유머와 동의어가 아니다. 숏폼 UI를 써도 목표는 짧음이 아니라 몰입이다.
- 순서는 `Attention → Experience → Value`다. 먼저 시간을 얻고, 그 시간에 가치를 전달한다.
- 기획 1순위 질문: **"왜 사람이 자기 시간을 써서 이것을 봐야 하는가?"** 답이 "유익하니까"뿐이면 Story로 만들지 않는다.
- 품질 5문(5E): **Entertain**(왜 보게 되는가) · **Engage**(무엇을 직접 선택하는가) · **Enlighten**(무엇을 새로 이해하는가) · **Empower**(무엇을 할 수 있게 되는가) · **Extend**(다음 행동은 무엇인가). 대부분에 답하지 못하면 Story로 제작하지 않는다.

### 1.5 Value의 핵심 — 판단 기준의 변화 (2026-10-01 원천 채택)

> 좋은 콘텐츠는 사람을 많이 데려오고, 강한 콘텐츠는 들어온 사람의 **생각과 다음 행동**을 바꾼다.

- Story의 Value는 정보량이 아니라 **사용자가 무엇을 중요하게 봐야 하는지가 바뀌는 것**이다. 기획 단계에서 반드시 적는다:

  ```text
  currentBelief   사용자가 Story 전에 가진 생각 · 판단 기준
  desiredBelief   Story 후에 갖게 될 판단 기준
  evidence        그 이동을 정당화하는 근거(Knowledge Claim)
  nextAction      바뀐 판단으로 할 수 있는 다음 행동
  ```

- 이 이동은 **캐릭터의 `Misbelief → 변화`(§5.2)와 맞물려야 한다.** 사용자는 설명을 듣고가 아니라 캐릭터의 선택과 그 결과를 보며 판단 기준을 바꾼다.
- **설득 ≠ 강한 카피.** FOMO·검증되지 않은 성과 주장("이렇게 하면 매출 4배")은 설득이 아니라 신뢰 훼손이다. 설득은 `근거 → 해석 → 판단 기준 → 실행`에서 나온다.
- `currentBelief → desiredBelief`를 적을 수 없으면 정보 콘텐츠다. Story로 만들지 않는다.

---

## 2. 용어와 경계 (충돌 해소)

`interactive`라는 단어는 AMU 안에서 서로 다른 세 가지를 가리켜 왔다. **이 문서와 하위 산출물은 아래 표기만 쓴다.**

| 이 문서의 용어 | 뜻 | 혼동 대상 | 경계 |
| --- | --- | --- | --- |
| **Interactive Story** (`Story`) | ISCS가 제작·버전·출판하는 독립 콘텐츠. 1개 Story = 1개 사건 단위. 코드 `InteractiveStory`(`storyId`·불변 `storyVersion`). 사용자 표현 "Home 인터랙티브 아티클"·"숏폼 드라마"는 이것을 가리킨다 | ① Magazine **Article Embed**(기사 안 AI 대화·이미지 위젯 — **종료**, PTU-Q-016 D-3) ② Gen Studio **대화형 템플릿 세션**(CT 계열) ③ Magazine **인터랙티브 기사**(`CONTENT-INTELLIGENCE.md`의 기사 안 편집 콘텐츠 유형) | Story는 Magazine 기사 안에 들어가지 않고 기사에 의존하지 않는다. ①②③을 Story라고 부르지 않는다 |
| **Series Arc** | 여러 Story가 하나의 큰 문제·갈등·변화를 다루는 **편집(공식) 아크** | node-app `IStoryArcDoc`(`uid` 스코프 **사용자별 런타임 아크**) | Series Arc는 편집 계획 산출물이다. 런타임 `StoryArc`로 저장하거나 재해석하지 않는다 |
| **Design Beat** | 기획 단계의 장면 설계 단위(Beat Sheet 행, §7.5) | ① 코드 `StoryBeat`(출판된 Story의 `prompt`+`choices`) ② 런타임 `IStoryBeatDoc` | Design Beat 여러 개가 출판 시 하나 이상의 `StoryBeat`로 변환된다. 선택이 없는 Design Beat는 앞뒤 `StoryBeat`의 서술로 흡수된다 |
| **Canon Tier** | 편집 판단용 우선순위 T0~T5(§4.1) | 코드 **Canon Layer** C0~C3 | 저장 레이어는 코드가 권위다. 원천 논의의 C0~C5 표기는 쓰지 않는다 |
| **Play Character** | 캐릭터의 런타임 identity | Tutors `PersonaSchema` | Tutors는 종료되어 Play에 통합된다. `PersonaSchema`는 legacy data mapping 대상일 뿐 캐릭터 기준이 아니다(변환은 PTU migration owner 판정) |
| **Section Episode** | `CONTENT-INTELLIGENCE.md`의 Magazine 기사 섹션 단위 | — | Magazine 기사 내부 용어다. Story 문서에서 맨 단어 `Episode`를 쓰지 않는다 |

- **사용자 화면에 설계 언어를 노출하지 않는다.** `Series Arc`·`Canon`·`Baton Pass`·`Design Beat`·`ISCS`는 내부 용어다.
- 원천 논의의 캐릭터 이름(`Pioneer`·`Scholar`·`Warden`)은 **예시 자리표시자**다. 공식 Canon 캐릭터로 간주하지 않는다.

---

## 3. 적용 범위와 Story 판정

### 3.1 적용 대상

| 적용한다 | 적용하지 않는다 |
| --- | --- |
| ISCS가 출판하는 모든 Interactive Story(Home 숏폼 피드·Play 소비) | Magazine 기사 작성·리뉴얼 — `CONTENT-INTELLIGENCE.md` |
| Story의 Series Arc·Next Seed 기획 | Play 사용자별 런타임 상태 전이 자체 — 코드 계약 |
| Story 제작을 위한 공식 캐릭터·유니버스 설정 | 사용자 개인 유니버스(`personal-universe`) 창작 — 별도 계약 전까지 비적용(§15) |
| Story·캐릭터 파생 Short-form·Build Log 콘텐츠 | Gen Studio 대화형 템플릿 세션(CT 계열) |

### 3.2 Story로 만들지 않는 경우

- 단순 정보 확인·짧은 업데이트·공식 공지·즉시 답이 필요한 사용법.
- 선택이 이해나 판단을 바꾸지 않는 주제(§1.5 판단 이동을 적을 수 없는 주제).
- **캐릭터 활용 가치가 높은 조건**: 관점 충돌이 핵심이다 · 인간의 선택이 핵심이다 · 연속 아크가 가능하다 · 감정적 몰입이 중요하다 · 관계 변화가 발생한다.
- **모든 Magazine 소재를 Story로 만들지 않는다.** Worthiness Gate(§7.2)를 통과한 소재만 재구성한다.

### 3.3 포지셔닝 가드

Story를 늘려도 AMU 전체 정의는 `BUSINESS-CHARTER.md`를 따른다. `캐릭터 챗봇 플랫폼`·`관계형 탐험 게임 플랫폼`·`게임형 AI 플랫폼`을 AMU 전체 정의로 쓰지 않는다 — `INDEX.md` 브랜딩 기준.

---

## 4. Canon 원칙

Canon은 AMU 세계관 안에서 사실로 인정되는 공식 설정이다. 목적은 설정을 많이 만드는 것이 아니라 **Story가 쌓일수록 세계와 관계가 일관되게 확장되게 하는 것**이다.

### 4.1 Canon Tier — 편집 우선순위

충돌 시 상위 Tier가 하위 Tier보다 우선한다. 저장 위치는 코드의 Canon Layer가 결정한다.

| Tier | 편집 의미 | 코드 저장 대응(`CANON_ENTITY_LAYER`) |
| --- | --- | --- |
| T0 Core Laws | 세계가 따르는 불변 규칙(유니버스 컨셉·생성 가능한 캐릭터 타입 포함) | `core-law` → C0 |
| T1 World | 시대·지역·사회·세력·종·사물 | `history`·`timeline` → C1, `species`·`faction`·`region`·`object` → C2 |
| T2 Character | 인물 정의(성격·가치·능력·배경) | `character` → C3 |
| T3 Relationship | 캐릭터 간 관계와 역사 | `relation` → C3 (관계 유형은 `CANON_RELATION_TYPE_VALUES`) |
| T4 Event | 공식적으로 발생한 사건·미해결 떡밥 | `event` → C1, `mystery`·`open-loop` → C3 |
| T5 Story Context | 특정 Story 안에서만 유효한 상황·대사 | **Canon에 저장하지 않는다.** Story 콘텐츠에만 존재 |

> 저장 레이어 번호와 편집 우선순위는 **다른 축**이다. Tier 번호로 레이어를 추정하지 않는다.

### 4.2 두 종류의 "결과" — 사용자 진행과 공식 Canon을 섞지 않는다

| 구분 | 무엇이 바뀌나 | 누가 바꾸나 | 저장 |
| --- | --- | --- | --- |
| **사용자 진행 결과** | 그 사용자의 Story 진행·관계 친밀도·월드 플래그 | 사용자의 선택 → allowlist `narrativeEffects` → Narrative Runtime reducer | 사용자별 `UserStoryState` 등(PTU-002) |
| **공식 Canon 변경** | 모든 사용자가 공유하는 세계 설정·사건·관계 | 편집 판단 + 관리자 승인 | Canon revision(`official` namespace) |

- **한 사용자의 선택이 공식 Canon을 바꾸지 않는다.** 집계된 사용자 선택을 근거로 공식 Canon을 바꾸려면 §4.3 승인을 거친다.
- Story가 쓸 수 있는 effect는 코드 allowlist(`story.beat.activate`·`story.beat.complete`·`relation.affinity.adjust`·`world.flag.set`)뿐이다. 새 effect가 필요하면 PTU-002·ISC-001 계약 변경으로만 추가한다(PTU-Q-008).

### 4.3 공식 Canon 변경 권한

- **AI는 Canon을 확정·변경하지 않는다.** 코드상 `ai`·`system` actor는 Canon 쓰기 자체가 거부되고, `official` namespace는 `admin`만 쓸 수 있다 — `canonValidator.ts` `isCanonWriteAllowed`. (모든 쓰기 경로가 이 검증기를 호출하는지는 **추정 — 미확인.** 확인 경로: Canon write route·repo 호출부 grep. ISC-001 D2에서 함께 확인한다.)
- AI가 할 수 있는 것: 설정 후보 제안, 기존 Canon 기반 초안, 모순 탐지, 관계·사건 변화 후보 제안.
- **승인 필수 변경**: 캐릭터 핵심 성격 변경 · 주요 관계 변경 · 세계 규칙 변경 · 과거 사건 변경 · 주요 캐릭터 사망/퇴장 · 세계 구조를 바꾸는 사건 · 장기 아크에 영향을 주는 설정 · 신규 공식 캐릭터.
- **append-first**: 기존 설정을 삭제·덮어쓰지 않고, 새 사건으로 변화 이유를 설명한다. `published` revision은 `deprecated`로만 전이한다(`CANON_ALLOWED_TRANSITIONS`).
- 관계 배타 쌍(`ally↔rival` 등)은 publish 전에 lore conflict로 차단된다 — 서사 설계도 이 제약을 전제로 한다.

### 4.4 세계의 사실과 캐릭터의 인식 — 3분리

| 상태 | 뜻 | 현재 구현 |
| --- | --- | --- |
| World Truth | 세계에서 실제로 사실인 것 | Canon revision payload |
| Character Knowledge | 해당 캐릭터가 알고 있는 것 | `allowedKnowledge`·`forbiddenKnowledge`(Canon payload·`NarrativeDirective`) |
| Character Belief | 캐릭터가 사실이라고 믿는 것(틀릴 수 있음) | **미구현** — 기획 산출물(Casting Plan)에만 기록 |

캐릭터는 자신이 알 수 없는 정보를 말하거나 행동 근거로 쓰지 않는다(전지적 NPC 금지). Play CharacterChat에서 사용자가 캐릭터와 직접 대화하므로 이 분리는 대화 표면에서 더 엄격하다.

---

## 5. 캐릭터 규약

### 5.1 캐릭터는 독립 행위자이자 관점의 그릇이다

- 캐릭터는 진행자·설명 도구가 아니다. 각자 욕망과 관점을 가진 행위자다.
- 캐릭터는 서로 다른 관점(낙관·회의·실용·이상·위험선호·위험회피)을 대표할 수 있지만, **특정 주장을 전달하는 허수아비로 만들지 않는다.** 주장은 캐릭터의 `경험 + 욕망 + 관계 + 이해관계`에서 나와야 한다.

### 5.2 정의(Definition)와 상태(State)를 분리한다

한 Story에서 겁먹은 모습을 보였다고 캐릭터를 "겁 많은 사람"으로 바꾸지 않는다. 일시 상태를 정의로 승격하는 것은 §4.3 승인 필수 변경이다.

| 계층 | 필수 항목 | 성격 |
| --- | --- | --- |
| **Identity** (Definition) | 이름·역할·소속·유니버스·외형 특징·말투 | 누구인가 — Canon T2 |
| **Psychology** (Definition) | 핵심 성격·가치관·강점·약점·편견/한계 · `Want` · `Need` · `Fear` · `Core Belief` · `Misbelief`(이야기 속에서 깨질 수 있는 믿음) · `Stress Response` · 도덕적 경계 · `Growth Potential` | 왜 그렇게 행동하는가 — Canon T2 |
| **Narrative State** (State) | 현재 목표·감정·위치·최근 사건·관계·보유 정보(Knowledge)·믿음(Belief)·비밀·상처·미해결 갈등 | 지금 무엇을 할 것인가 — Canon T3/T4 또는 기획 레지스트리 |

- Psychology는 임상 진단이 아니라 **행동의 인과를 설명하는 Narrative Psychology**다. 실존 정신질환 진단명을 캐릭터 속성으로 쓰지 않는다.
- 캐릭터의 `Misbelief → 변화`가 사용자의 `currentBelief → desiredBelief`(§1.5)를 끌고 가는 엔진이다.

### 5.3 시각 자산 요건 (게임 에셋 기반 Story)

Story와 Play가 같은 캐릭터를 쓰므로, 공식 캐릭터는 Story 기획 전에 아래 자산을 갖춘다. 생성 파이프라인 자체는 `todo-character-model-genesis-validation.json`·Gen Studio 소관이다.

| 자산 | 용도 | 비고 |
| --- | --- | --- |
| **캐릭터 시트** | 기본 외형·정면/측면 기준 | identity 고정의 기준 이미지 |
| **액션 시트** | 표정·동작 변화(Story 장면·CharacterChat 반응) | Story 장면 감정 변화(`emotionalDelta`)를 표현할 수 있는 범위로 만든다 |
| 스프라이트·맵·월드 에셋 | Play 시뮬레이션 환경 | `character-sprite-v2` 파이프라인 |

- 캐릭터는 **유니버스의 컨셉(T0)과 생성 가능한 캐릭터 타입**(예: 인간·몬스터·둘 다) 안에서 만든다. 유니버스 설정을 벗어난 캐릭터는 P11 Canon Check에서 차단한다.
- 같은 캐릭터의 Story 장면·Play 스프라이트·CharacterChat 이미지는 같은 캐릭터 시트를 기준으로 한다. 장면마다 외형이 바뀌면 Canon Drift다.

### 5.4 운영 상태 레지스트리 (공식 캐릭터 전용)

캐스팅 판단을 위해 공식 캐릭터마다 아래를 기록한다. **현재 저장 스키마가 없다** — 구현 전까지 기획 산출물에 누적하고, 스키마화는 부록 C에서 판정한다.

`lastAppearance` · `recentAppearanceCount` · `currentSeriesArc` · `relationshipLoad` · `unresolvedConflicts` · `currentEmotionalState` · `knowledgeDomain` · `narrativeFatigue`

- `narrativeFatigue`가 높으면 등장 우선순위를 낮춘다. 목적은 **세계가 한 인물에게 종속되지 않게 하는 것**이다.

---

## 6. 서사 원칙

### 6.1 스토리는 지식을 설명하기 위해 존재하지 않는다 (최상위 서사 원칙)

| 금지 | 권장 |
| --- | --- |
| 설명할 주제 결정 → 캐릭터에게 설명시킴 | 캐릭터의 문제 발생 → 해결 과정에서 지식이 필요해짐 |
| "A와 B가 복리에 대해 이야기한다" | "A는 단기 고수익을, B는 장기 전략을 주장한다. 두 선택의 결과를 비교하는 과정에서 복리가 등장한다" |

지식은 강의 내용이 아니라 **문제를 해결하는 도구이자 판단 기준을 바꾸는 근거**로 등장한다.

### 6.2 갈등은 정답 싸움이 아니다

- 좋은 갈등은 **서로 다른 선택이 모두 일정 부분 합리적일 때** 생긴다. `현명한 캐릭터 vs 멍청한 캐릭터` 구도는 금지한다.
- 갈등의 원천: 목표 충돌 · 이해관계 충돌 · 가치관 충돌 · 정보 비대칭 · 위험 인식 차이 · 자원 부족 · 시간 압박 · 과거 관계 · 오해 · 선택의 비용.
- Story마다 **Primary Conflict 1개**를 기본으로 한다. 유형: `Goal vs Goal` · `Value vs Value` · `Individual vs System` · `Short-term vs Long-term` · `Safety vs Opportunity` · `Truth vs Belief` · `Loyalty vs Self-interest` · `Efficiency vs Humanity` · `Freedom vs Stability` · `Knowledge vs Uncertainty`. Secondary Conflict는 필요할 때만 쓴다.
- 새 갈등은 가능한 한 **기존 관계 위에** 구축한다.

### 6.3 Fact · Interpretation · Fiction 3분리

| 층 | 뜻 | 규칙 |
| --- | --- | --- |
| Fact | 검증 가능한 사실 | 출처·기준일 필수(`sourceRefs`·Knowledge Claim). 재미를 위해 왜곡하지 않는다. 대외 주장이면 `PROOF-BANK.md`·`INTELLIGENCE-PATTERN-POLICY.md` §5 Evidence 수준을 따른다 |
| Interpretation | 사실에 근거한 해석 | 해석임을 알 수 있게 쓴다. 불확실성을 숨기지 않는다 |
| Fiction | AMU 세계관 안에서 창작한 사건·인물·설정 | 사용자가 사실로 오인할 수 있으면 화면에서 구분한다 |

- 경제·투자·AI·과학·역사·건강처럼 사실성이 중요한 주제는 엄격하게 적용한다.
- **금융·투자·세무·의료·법률 Story의 선택은 판단 교육·정보 이해에 한정한다.** 캐릭터가 사용자에게 개인화 추천·진단·매수/매도 지시를 하는 것처럼 보이면 안 된다.
- **실존 인물·기업·기관을 Fiction 속 행위자로 만들지 않는다.** 실존 사례는 Fact 층(작중 자료·기록)으로만 등장시킨다. (명예훼손·퍼블리시티 판단은 **추정** — 도입 전 `legal-policy-review` 확인 필요.)

### 6.4 Choice & Consequence

- 선택은 실제 의미가 있어야 한다. 두 선택 모두 장단점이 있어야 하며, 정답 하나와 명백한 오답 하나는 선택이 아니라 퀴즈다.
- 구조: `Choice → Immediate Result → Deferred Consequence`.
  - **Immediate Result** = 코드 `StoryChoice.result`(선택 직후 보여주는 결과 서술).
  - **Deferred Consequence** = `narrativeEffects`(관계·월드 플래그)가 이후 Story·Play에서 다르게 드러나는 것. 연속 서사의 핵심 자산이다.
- **선택 결과는 공개 view에 effect를 노출하지 않는다** — 코드 `InteractiveStoryChoiceView`가 `narrativeEffects`를 제외한다. 선택 전에 결과 수치를 보여주지 않는다.
- 진행 중인 run은 시작 시 고정한 `storyVersion`으로만 진행한다. 새 버전 출판이 기존 사용자의 결과를 바꾸지 않는다(ISC-002).

### 6.5 인터랙션 원칙

- 인터랙션은 장식이 아니다. 다음 중 최소 하나를 해야 한다: 이해를 높인다 · 몰입을 높인다 · 판단에 참여시킨다 · 개인 결과를 만든다 · 다른 관점을 경험시킨다 · 이야기 결과에 영향을 준다.
- Story의 기본 인터랙션은 **선택(choice)**이다. 그 밖의 조작(드래그·입력·생성)은 StoryPlayer 계약이 지원할 때만 쓴다. 지원하지 않는 상호작용을 화면만으로 흉내 내지 않는다.
- **스토리를 먼저 만든 뒤 선택을 억지로 끼우지 않는다.** 각 Design Beat에서 "사용자가 여기서 고르면 이해나 몰입이 크게 늘어나는가"를 묻고, 그렇다면 그 Beat를 선택 지점으로 만든다.
- 한 Story의 선택 지점은 서사가 감당할 수 있는 만큼만 둔다. 선택이 많을수록 좋은 것이 아니다(원천 Build Log 사례: 선택지 6개 → 아무도 누르지 않음).

### 6.6 표현 형식 — 숏폼 Story

- Home에서는 **세로 숏폼(영상 피드형) UI**로 소비된다. 텍스트·이미지·영상·모션을 조합한 장면 단위로 넘긴다.
- 숏폼이어도 Story는 **그 자체로 최소한의 만족(자기 Core Question에 대한 답)**을 준다. 다음 편 유도를 위해 답을 숨기지 않는다.
- 장면 이미지·영상은 §5.3 캐릭터 자산과 Gen Studio 생성 파이프라인으로 만든다. AI 생성 고지는 §10을 따른다.
- 사용 가능한 엔터테인먼트 동기: 호기심 · 미스터리 · 감정 · 아름다움 · 긴장 · 유머 · 경쟁 · 발견 · 관계 · 자기 투영 · 성취 · 놀라움 · 힐링. **Story 성격에 맞는 동기만 쓴다.**

---

## 7. Story 제작 파이프라인

원천 논의의 세 파이프라인(제작 12단계 · Planning 16단계 · Narrative Pipeline 12단계)과 게임 에셋 기반 제작 흐름(`.TEMP/interactive_article_process.md`)을 **하나로 통합**한다. **각 단계는 명시적 산출물을 남기며, 단계를 하나의 거대한 프롬프트로 합치지 않는다.**

```text
A0 유니버스·캐릭터·에셋 준비 (없을 때만)  → universe_setup · character_assets
P0 Intelligence Candidate                → content_candidate
P1 Worthiness Gate                       → story_candidate (pass/fail + 사유)
P2 Narrative Conversion                  → narrative_plan (Core Question·Human Tension·Belief Shift·Premise)
P3 World Context Retrieval               → narrative_plan.worldContext
P4 Casting                               → casting_plan
P5 Character Simulation (선택)            → casting_plan.actionCandidates
P6 Relationship·Conflict·Subplot         → narrative_plan.conflict / subplots
P7 Series Arc → Story → Design Beat       → beat_sheet
P8 Knowledge Binding                     → beat_sheet.knowledgeClaims
P9 Choice Mapping                        → beat_sheet.choices (+ narrativeEffects 후보)
P10 Continuity Design                    → continuity_plan (Entry/Exit State·Baton Pass·Seeds)
P11 Canon Check                          → canon_check
P12 Production Brief                     → production_brief  ← 제작의 단일 입력
P13 Story 제작 (ISCS draft)               → InteractiveStory draft (+ 장면 에셋)
P14 Narrative Verification               → verification_report  ← Generator와 분리
P15 출판 검수 · 사람 승인                  → publicationStatus: review → published (ISC-005)
P16 출판 · 노출                           → Home 피드 · Play 진입점
P17 Measure                              → performance_snapshot
P18 공식 Canon 변경 제안 · 승인             → canon revision (draft → published, admin)
P19 Next Seed 등록                        → next_story_seed → P0로 재진입
```

### 7.1 A0 — 유니버스·캐릭터·에셋 준비

Story에 필요한 캐릭터·에셋이 없을 때만 수행한다. 순서는 고정이다.

1. **유니버스 컨셉·캐릭터 타입 확인** — 유니버스의 T0 규칙과 생성 가능한 캐릭터 타입.
2. **캐릭터 생성** — Definition(§5.2) + 캐릭터 시트·액션 시트(§5.3). 공식 캐릭터는 §4.3 승인 대상.
3. **Play 환경 준비** — 캐릭터 컨셉에 맞는 기본 맵·게임 에셋(Play 소비가 계획된 경우).
4. 이후 P0부터 진행한다. **캐릭터를 먼저 만들었다고 그 캐릭터에 맞춰 수요 없는 주제를 만들지 않는다**(Story Dictated Content 금지). 주인공 캐릭터의 메인 Series Arc는 P0~P1을 통과한 Intelligence 소재로 채운다.

- 유니버스 오너·비오너 사용자의 캐릭터 생성 흐름은 사용자 창작(`personal-universe`) 영역이며 §15 보류 대상이다. 이 단계는 **공식(admin) Story 제작**에 한정한다.

### 7.2 P0~P1 — 후보와 Worthiness Gate

- P0 입력은 **Intelligence에서 온다.** Magazine 기사·Intelligence 후보·Pattern Registry는 읽기 전용 원천이며 `sourceRefs`(`kind: magazine_intelligence`)로 기록한다. `sourceRefs`는 선택이다 — 원천 없이도 Story는 유효해야 한다(ISC-004).
- **Magazine에 쓰지 않는다.** Story를 위해 기사를 수정하거나, 기사에 Story·Play 진입을 삽입하지 않는다(PTU-Q-015).
- `content_candidate` 최소 필드: Topic · Core Insight · User Need · Source/Evidence · Freshness · Target Audience · Expected Value · Potential Expansion · 관련 기존 Story.
- **Worthiness Gate 6문** — 대부분 낮으면 Story로 만들지 않는다.

| 축 | 질문 |
| --- | --- |
| Narrative Potential | 사건으로 만들 수 있는가 |
| Human Tension | 실제 인간적 갈등이 있는가 |
| Character Relevance | 캐릭터의 목표·관계와 연결되는가 |
| Choice Potential | 사용자가 의미 있게 고를 지점이 있는가 |
| Continuity Potential | 다른 Story로 확장할 여지가 있는가 |
| **Knowledge Value** | **스토리를 제거해도 전달할 가치가 있는 지식·판단 기준인가** |

`Knowledge Value`가 낮으면 다른 축이 높아도 불통과다.

### 7.3 P2 — Narrative Conversion

- **Core Question**: Story마다 하나. 설명 주제("AI란 무엇인가")가 아니라 Story Question("AI가 내 일을 없앨까?")이어야 한다.
- **Human Tension**: `Knowledge Problem → Human Problem`. 예) 복리 → 지금 쓸 것인가, 미래를 위해 포기할 것인가.
- **Belief Shift**: `currentBelief → desiredBelief`(§1.5). 적을 수 없으면 P3로 넘어가지 않는다.
- **Narrative Premise** — 한 문장 검증: **"[캐릭터]가 [목표]를 이루려 하지만 [갈등] 때문에 [선택]해야 한다."** 네 요소 중 하나라도 없으면 P3로 넘어가지 않는다.

### 7.4 P3~P6 — 세계 맥락·캐스팅·관계

- **P3**: 관련 Canon(장소·과거 사건·관계·미해결 `open-loop`/`mystery`)을 먼저 불러온다. **새 Subplot을 만들기 전에 기존 미해결 떡밥 가운데 이번 사건과 충돌할 수 있는 것부터 검색한다.**
- **P4 캐스팅 순서**: `이야기에 필요한 역할 → 적합한 기존 캐릭터 → (없을 때만) 신규 생성`. 캐릭터 생성부터 시작하지 않는다.
  - **Narrative Role**(한 캐릭터가 여러 역할 가능): `Protagonist` · `Challenger` · `Guide` · `Stakeholder` · `Catalyst` · `Observer` · `Bridge`.
  - **인원 상한**: 최소 2명 · 기본 2~4명 · 5명 이상은 다수 이해관계·기구축 관계·장편 아크·앙상블일 때만. 단순 정보 전달을 위해 인물을 추가하지 않는다.
  - **기존 캐릭터 우선 조건**: 주제·가치관 연결 · 현재 Series Arc와 연관 · 기존 관계 발전 · 새 면 · 최근 과사용 아님.
  - **신규 캐릭터 생성 조건**(하나 이상): `Perspective Gap` · `World Expansion` · `Conflict Requirement` · `Long-term Utility`. **판단식**: "이 인물을 빼면 이번 Story나 향후 아크가 의미 있게 약해지는가?" 아니면 만들지 않는다. 신규 캐릭터는 A0를 거친다.
- **P5 Character Simulation (선택)**: 각 캐릭터에 현재 World State·Want·Fear·Misbelief·관계·**보유 지식만** 주고 "가장 자연스러운 행동 후보 3개"를 받는다. 충돌 가능성이 가장 높은 조합을 고른다. 목적은 Forced Conflict 감소다. 자동화 전에는 기획자가 같은 질문을 수기로 수행한다.
- **P6**: 기존 관계(서로 아는가·과거 갈등·신뢰 방향·빚/약속·미해결 사건·숨긴 정보)를 먼저 확인한다.
  - **Subplot 3종**: Character(개인 변화) · Relationship(신뢰·갈등·비밀·배신) · World/Knowledge(더 큰 문제·다음 주제 확장).
  - Subplot 편집 상태와 코드 `open-loop.status` 대응: `seed`·`active`·`pressure`·`deferred` → `open` / `collision` → `advancing` / `payoff`·`aftermath` → `resolved`.
  - 모든 Subplot은 `introducedAt`·`payoffHorizon`(예: 3~8 Story)·`currentState`·`trigger`·`possiblePayoff`를 기록한다. payoffHorizon을 넘긴 Subplot은 다음 P3에서 우선 검색한다.

### 7.5 P7 — Series Arc → Story → Design Beat

- 원고를 바로 쓰지 않는다. `Series Arc → Main Plot + Subplots → Story → Design Beat` 순으로 분해한다.
- **Story 기본 흐름(5단)**: `Hook → Conflict → Investigation → Decision → Consequence`.
- **상세 Beat(10단, 선택)**: `Cold Open → Trigger → Goal → Conflict → Investigation → Complication → Decision → Consequence → Resolution → Bridge`.
  - Cold Open은 설명으로 시작하지 않는다(사건·위험·질문·이상 현상·결정 직전·관계 변화). 숏폼 첫 장면이 곧 Attention이다.
  - 지식은 주로 **Investigation**에서 등장한다.
  - **Complication**: 답을 찾으면 끝나는 구조를 피하고 기존 생각을 흔드는 새 근거를 넣는다. 새 근거도 Fact 층 규칙을 따른다.
  - **Decision** 주체: 주인공 · 여러 캐릭터 · 사용자 · 캐릭터+사용자. 가능하면 사용자가 선택한다.
- **Design Beat 최소 필드**:

| 필드 | 뜻 |
| --- | --- |
| `beatId` · `order` | 식별·순서 |
| `pov` | 누구의 관점인가 |
| `goal` · `opposition` | 이 장면에서 원하는 것·방해하는 것 |
| `knowledgeRevealed` | 드러나는 정보(Knowledge Claim 참조) |
| `emotionalDelta` · `relationshipDelta` | 감정·관계 변화(액션 시트 표현 범위 안) |
| `setupIds` · `payoffIds` | 만드는 떡밥·회수하는 떡밥 |
| `choice` | 사용자 선택 여부(없으면 `none`) |
| `visualAsset` | 장면 이미지·영상·모션 요구 |
| `exitHook` | 다음 장면을 넘겨야 하는 이유 |
| `dependsOn` · `affects` · `characterStateRefs` · `canonEventRefs` · `knowledgeClaimRefs` | Narrative Impact Graph 참조(§9.3) |

### 7.6 P8 — Knowledge Binding

AMU 고유 단계다. Beat 설계 뒤, 원고 작성 전에 Intelligence 근거를 Beat에 묶는다.

- **Knowledge Claim 최소 필드**: `claimId` · `layer`(fact/interpretation) · `statement` · `uncertainty` · `source`(가능하면 `sourceRefs` 항목) · `freshness`(기준일).
- Fiction은 Knowledge Claim이 아니다. Claim 없이 사실 주장을 하는 Beat는 P14에서 차단한다.
- `freshness`가 지난 Claim을 쓰는 새 `storyVersion`·후속 Story는 재검증한다.

### 7.7 P9 — Choice Mapping

- 선택 지점마다 `label`(선택지) · `result`(즉시 결과) · `narrativeEffects` 후보(allowlist 4종) · Deferred Consequence 메모를 적는다.
- 모든 선택지는 합리적이어야 한다(§6.2·§6.4). 한 선택지가 명백히 옳으면 선택 지점에서 뺀다.
- `relation.affinity.adjust`의 대상 캐릭터는 이 Story에 실제 등장한 캐릭터여야 한다.

### 7.8 P10 — Continuity Design

- **Entry State**(시작 전): 등장 캐릭터 상태 · 관계 · 미해결 사건 · 위치 · Series Arc 상태 · 이전 Story 영향.
- **Exit State**(종료 후): Character State 변화 · 관계 변화 · 새 지식 · 새/해결된 갈등 · 미해결 질문 · 위치 변화 · 자원 변화 · 공식 Canon 변경 후보 · Next Hook. **공식 Exit State가 다음 Story의 Entry State가 된다.** 사용자별 진행 결과(§4.2)는 사용자 Narrative Runtime에 남는다.
- **Entry Character**: 사용자에게 진입 이유를 준다 — 문제를 발견/겪는다 · 사건을 일으킨다 · 질문을 던진다 · 위험에 처한다.
- **Bridge Character**: 종료와 다음 가능성을 잇는다 — 새 정보를 가져온다 · 결과에 영향받는다 · 새 질문을 던진다 · 다른 지역/캐릭터를 연결한다.
  - Entry = Bridge: 개인 성장 아크. Entry ≠ Bridge: 세계 확장 — **Narrative Baton Pass**.
- **Baton Pass 유형**: `Character` · `Problem` · `Location` · `Knowledge` · `Relationship`. 가능하면 Story마다 Pass 후보를 최소 1개 기록한다.
- **다음 Story를 확정하지 않는다.** `next_story_seed`를 **최대 3개** 저장하고, 각 Seed는 P0로 돌아가 Intelligence 재검증을 받는다.
- **인위적 Cliffhanger를 남발하지 않는다.** 각 Story는 자기 Core Question에 대한 답을 그 안에서 준다.

### 7.9 Intelligence ↔ Story 양방향 루프

```text
Intelligence → Story → Story Seed → Intelligence Validation → Next Story
```

- Seed 재검증 판단 요소: 사용자 관심 · 검색·관심 수요 · 최근 트렌드 · 기존 Story 성과 · 캐릭터 관심도 · Series Arc 가치 · 관계 가능성 · 확장 가능성.
- **Narrative Continuity만으로 제작을 결정하지 않는다.** 세계관을 잇기 위해 수요 없는 주제를 만들지 않는다.
- 이 루프는 **데이터 계층**에서만 Magazine과 만난다. 사용자 UI에서 Story ↔ 기사 이동을 만들지 않는다.

### 7.10 의사결정 순서 (고정)

```text
좋은 Intelligence인가 → Story로 만들 가치가 있는가 → 인간적 문제는 무엇인가
→ 사용자의 판단 기준은 무엇에서 무엇으로 바뀌는가 → 어떤 사건으로 보여줄 것인가
→ 누가 겪어야 하는가 → 기존 캐릭터로 가능한가 → 어떤 갈등인가
→ 사용자는 어디서 고르는가 → 결과는 무엇인가 → 세계가 어떻게 변했는가
→ 다음 이야기의 가능성은 무엇인가
```

---

## 8. Production Brief — 제작의 단일 입력

P13 제작은 **승인된 Production Brief만 입력으로 받는다.** 비어 있는 필드는 사유를 적는다(`not_applicable: <이유>`). `→`는 ISCS 코드 계약(`InteractiveStory`)으로 옮겨지는 필드다.

```text
storyId                → InteractiveStory.storyId           # ASCII
storyVersion           → InteractiveStory.storyVersion      # 출판 후 불변, 수정은 새 버전
universeId             → InteractiveStory.universeId
title · summary        → InteractiveStory.title · summary   # { ko, en }
sourceRefs[]           → InteractiveStory.sourceRefs        # 선택, magazine_intelligence
seriesArcId
canonRevisionRef       # 기획 시점에 참조한 Canon revision
coreQuestion
humanTension
beliefShift            # { currentBelief, desiredBelief, evidence, nextAction }
narrativePremise
characters[]           # { characterId, roles[], reuse|new, stateSnapshotRef, assetRefs }
entryCharacterId
bridgeCharacterId
primaryConflict        # §6.2 유형
secondaryConflict      # optional
subplots[]             # { subplotId, type, editorialState, payoffHorizon }
knowledgeClaims[]      # §7.6
designBeats[]          # §7.5
storyBeats[]           → InteractiveStory.beats             # { beatId, prompt, choices[{choiceId,label,result,narrativeEffects}] }
immediateConsequence
deferredConsequence
entryState · exitState
canonChangeProposals[] # 공식 Canon 변경 후보 — 모두 draft, 승인 필요 표기
nextStorySeeds[]       # 최대 3
batonPass              # type + 대상
surfaces               # home_feed · play (진입 맥락은 표시용, 서버 판정에 쓰지 않음)
primaryCta             # 1개 + 보조 최대 1개. 공개 상태인 기능만
successMetric          # MEASUREMENT-PLAN·ISC-008 지표에서만 선택
complianceGate         # §10 판정 결과
```

- 한글 필드값은 리터럴 UTF-8로 저장하고 되읽어 대조한다 — `.claude/rules/text-encoding-integrity.md`.
- Brief의 저장 위치는 ISC-000(데이터 분류)·ISC-002(저장소) 결과를 따른다. 확정 전에는 `.agent/content/` 아래에만 두고 운영 DB에 쓰지 않는다(`G-ISC-DATA`).

---

## 9. 검증 (Generator ≠ Verifier) — ISC-005 출판 검수의 원천

### 9.1 분리 원칙

- Story를 만든 에이전트가 자기 Story를 검증하는 구조에만 의존하지 않는다 — `.claude/rules/agent-orchestration.md` §9.
- 검증은 "문제점을 찾아줘" 재질문이 아니라, **Story에서 구조화 표현(등장인물·보유 지식·관계 변화·사건·주장·effect)을 추출해 Canon·Brief와 대조**하는 방식을 우선한다.
- AI 생성 초안은 사람 검수 없이 `published`가 될 수 없다(ISC-003·ISC-005).

### 9.2 Verifier 항목

| Verifier | 검사 | 차단 여부 |
| --- | --- | --- |
| Contract | `assertInteractiveStoryRegistry`(ISC-001 계약 검증기) 통과, effect allowlist·i18n `{ko,en}` | 차단 |
| Canon | 기존 설정·관계 배타 쌍·유니버스 캐릭터 타입과 모순되는가 | 차단 |
| Persona | Definition·Stress Response에 맞게 행동했는가, 외형이 캐릭터 시트와 일치하는가 | 차단 |
| Knowledge | 캐릭터가 알 수 없는 정보를 쓰는가(`forbiddenKnowledge`) | 차단 |
| Causality | 결과의 원인이 충분한가 | 차단 |
| Relationship | 관계 변화가 근거 없이 급변하는가, affinity 대상이 등장인물인가 | 차단 |
| Choice | 모든 선택지가 합리적인가, 정답형 퀴즈가 아닌가, effect 노출이 없는가 | 차단 |
| Belief Shift | `currentBelief → desiredBelief`가 장면과 선택으로 실제 일어나는가 | 차단 |
| Intelligence | 사실·출처가 왜곡됐는가, Fact/Fiction 경계가 무너졌는가 | 차단 |
| Setup/Payoff | 떡밥이 사라지거나 중복됐는가, payoffHorizon 초과 | 경고 |
| Editorial | 속도·긴장·반복·설명 과다·다음 장면을 넘기고 싶은가 | 경고 |
| Safety | 전 연령 공통 안전 기준(compliance §3-1 설계 원칙), 금칙 | 차단 |
| Compliance | §10 판정과 화면 문구가 일치하는가 | 차단 |

- **점수가 낮다고 Canon을 자동 수정하지 않는다.** Verifier는 수정안만 제안한다.

### 9.3 Narrative Impact Graph — 뒤만 다시 계산

과거 Story의 사건을 고치면 모든 후속 Story를 다시 만들지 않는다. Design Beat의 `dependsOn`·`affects`·`setupIds`·`payoffIds`·`characterStateRefs`·`canonEventRefs`·`knowledgeClaimRefs` 참조로 **영향받는 Beat만 invalid로 표시**하고 그 범위만 재설계한다. 출판된 Story는 새 `storyVersion`으로만 고친다. 그래프 DB를 도입하지 않고 명시적 참조로 구현한다.

---

## 10. 규제·안전 게이트

Story마다 `complianceGate`에 아래를 판정해 적는다. 판정 정본은 `.claude/rules/compliance-guardrails.md`이며 여기서는 적용 지점만 정한다. **개발과 공개 판정을 나눠 적는다**(§3-2).

| 항목 | 적용 지점 | 판정 |
| --- | --- | --- |
| 미성년 | Story·캐릭터 전반 | **`pass`**(§3-1). 성인 전용·청소년유해 요소를 넣으면 트리거 1 — 해당 Story 비공개 |
| 공개 단계 | `story.runtime` feature | 개발: `pass(admin_only, §3-2)` / 공개: `G-ISC-PUBLIC` 통과 전 `blocked` |
| 사용자 진행 데이터 | 선택·run·관계 반영 | `G-ISC-DATA`(ISC-000) 판정 전 persistent 데이터 생성 금지 |
| 대화 로그 | Play CharacterChat 연계 | §4·§4-1 수집 항목·고지 기준. 미확정이면 공개 `blocked` |
| 음성 | 오디오 Story·캐릭터 음성 | §3 원음 동의·TTL·삭제 + 트리거 3(프로바이더 연령 조건). admin에게도 provider 호출을 열지 않을 수 있음(§3-2) |
| 개인화 피드 | Home 피드 정렬 | 비개인화로 시작. 행동 기반 정렬은 §4-1 이용 목적 추가 트리거 |
| 금융·의료·법률 | 해당 주제 Story | 판단 교육 한정(§6.3). 개인화 지시로 읽히면 `blocked` |
| 실존 주체 | 실존 인물·기업 등장 | Fact 층으로만. 가상 행위 부여는 `blocked`(추정 — 법무 확인 전) |
| AI 생성 고지 | 생성 이미지·영상·대사 | AI 생성 결과임을 고지한다 |
| 경제 | AI 보조 각색·장면 생성 비용 | cost-preflight(`G-ISC-AI-COST`). Story 시청은 과금하지 않는다. 보상·코인·XP·확률형 요소를 Story에 넣지 않는다(ISCS scope.out) |

---

## 11. 서비스 역할과 표면

### 11.1 책임 분리

| 시스템 | Story에서의 책임 | 소유하지 않는 것 |
| --- | --- | --- |
| **Magazine** | **Intelligence 원천 전용** — 기사·지식·사건·인물·맥락을 읽기 전용으로 제공(`sourceRefs`) | Story 노출·진입·복귀·CTA. Story를 위한 기사 수정 |
| **Interactive Story Content System (ISCS)** | Story 제작·검수·버전·출판·카탈로그 | 사용자 진행 상태, 공식 Canon 쓰기 |
| **Play** (Narrative Runtime) | Story 실행·선택 반영·Canon·Relationship·CharacterChat·미션·탐험 | Story 원본 편집, 편집 Series Arc |
| **AMU Home** | 숏폼 Story 피드 소비 | Play 진입 강제 |
| Gen Studio | 캐릭터·장면 에셋 생성, AI 보조 각색 엔진(템플릿 프로세스) | Canon·Character State·Story 소유 |
| Marketing Oops | Story·Build Log 파생 콘텐츠 배포·성과·학습, 발행 cap | 서사 판단 |

- **Tutors는 종료되어 Play에 통합된다.** 캐릭터 대화·학습은 Play CharacterChat이 계승한다. 이 문서는 Tutors를 표면·확장 대상으로 쓰지 않는다.
- **Canon·Character State를 Gen Studio 소유 데이터로 만들지 않는다.**

### 11.2 표면

- **Home 숏폼 Story 피드**: 세로 숏폼 UI. Magazine Editorial Deck(기사 탐색)과 분리된 표면이다(PTU-Q-016 D-5). Home 사용자가 Play에 진입해야 Story가 완결되는 구조를 만들지 않는다. 표면 소유·정렬은 ISC-006·ISC-OD-04.
- **Play**: 같은 `storyId`·`storyVersion`·runtime을 소비하고 미션·탐험·캐릭터 활동과 잇는다(ISC-007). 지도·노드 연결은 PWM 게이트를 따른다.
- **Short-form 외부 채널**: Story의 장면·갈등을 소재로 한 Discovery 콘텐츠. 전체 Story 요약 채널이 아니며 그 자체로 최소한의 만족을 준다. 발행량은 `uploadPolicy` MCP 조회로만 판정한다.
- 최종 공개 URL 체계는 ISC-OD-01이 정한다. `/play/story/[storyId]`는 개발 검증 shell이다.

### 11.3 CTA

- **Primary CTA 1개 + 보조 최대 1개.** 기본 Primary는 **Story 맥락의 다음 경험**이다: 다음 Story · 다른 선택으로 다시 보기 · **"이 캐릭터로 나만의 스토리 시작하기"(Play)**.
- Play 진입 CTA는 Play·해당 기능의 **공개 단계가 열린 사용자에게만** 보인다. `admin_only` 기능으로 보내는 CTA를 일반 사용자에게 노출하지 않는다.
- Magazine 기사로 보내는 CTA를 Story에 두지 않는다. 출처 표기(`sourceRefs`)는 근거 표시이지 CTA가 아니다.
- 서비스 홍보를 위해 Story를 만들지 않는다. CTA는 사용자가 스스로 "해보고 싶다"를 품는 지점(Consequence 직후)에 둔다.

---

## 12. 성과와 학습

### 12.1 성과 단계

| 단계 | 질문 | 측정 정본 |
| --- | --- | --- |
| Attraction | 피드에서 멈췄는가 | `story_view`(후보, ISC-008) |
| Experience | 시작했는가 | `story_start`(후보) |
| Agency | 선택했는가 | `story_choice`(후보) |
| Completion | 끝까지 갔는가 | `story_complete`(후보) |
| Continuation | 다음 Story·재시도·Play 시작·CharacterChat으로 이어졌는가 | ISC-008 확정 이벤트 |
| Return | 다시 왔는가 | 28일 재방문 사용자(`MEASUREMENT-PLAN.md`) |

- **이벤트명·속성은 이 문서가 확정하지 않는다** — ISC-008이 `MEASUREMENT-PLAN.md` owner와 확정한다. `magazine_return`은 Story 지표로 쓰지 않는다.
- 발행량을 성과로 보고하지 않는다 — `.claude/rules/content-operations.md`.

### 12.2 Reach와 Persuasion을 나눠 본다 (2026-10-01 원천 채택)

- **Reach Asset**(많이 발견됨)과 **Persuasion Asset**(본 사람의 판단·행동이 바뀜)은 다른 자산이다. 하나를 없애지 않고 역할을 구분한다.
- 진단용 보조 지표 후보 **Persuasion Proxy** = 관계·지속 행동을 한 사용자 ÷ 충분히 경험한 사용자. **하나의 점수로 합쳐 순위를 매기지 않고 행동별로 분리해 본다.** 채택·정의는 `MEASUREMENT-PLAN.md` 소관이며 채택 전까지 이 이름으로 성과를 보고하지 않는다. (원천의 `Interactive Continuation Rate`도 같은 후보로 통합한다.)
- 성과 분석에서 아웃라이어를 두 종류로 찾는다: **Traffic Outlier**(노출·시청이 비정상적으로 높음) · **Persuasion Outlier**(시청은 평범한데 완주·재시도·다음 Story·Play 시작이 높음). 다음 Series Arc 소재 선정에는 Persuasion Outlier를 우선 참고한다.
- Persuasion Outlier에서 `어떤 사용자에게 → 어떤 문제 → 어떤 판단 이동 → 어떤 근거 → 어떤 행동`을 추출해 학습 기록으로 남긴다. 대외 주장으로 쓰려면 `PROOF-BANK.md` 등급을 따른다.

### 12.3 Narrative Performance Learning

- **AI가 retention을 예측하게 하지 않는다. 실제 행동을 측정한다.** 사람이 실제로 계속 본 Story를 학습한다.
- 학습 차원 후보: Hook 유형 · Conflict 유형 · 캐릭터 조합 · Story 길이 · Beat 밀도 · 선택 위치 · Subplot 유형 · Bridge/Baton 유형 · Belief Shift 유형.
- 해석은 `CONTENT-INTELLIGENCE.md`의 분포 기반 규칙(중앙값·상위 10%)을 준용한다. **표본이 충분해지기 전에는 차원별 인과를 주장하지 않는다.**
- 모델 fine-tuning은 우선순위가 아니다. `좋은 Schema + 명시적 State + 정확한 Retrieval + 단계별 Agent + Verifier + 실제 성과 데이터`를 먼저 만든다.

---

## 13. Build Log (메이킹 파생 시리즈)

완성된 Story를 **작은 제품(Small Product)**으로 보고, 그 제작 과정을 별도 콘텐츠 자산으로 만든다. 가칭 `AMU Build Log`(시리즈명 확정은 `BRAND-MESSAGING.md` 소관).

- 순환: `Build → Show → Teach → Invite → Learn → 다음 버전`.
- 한 Story에서 파생 가능한 역할: Main Product · Teaser · Making(아이디어·제작·실패·결과). **재활용이 아니라 각 파생물이 다른 역할을 가져야 한다.**
- **매번 전부 공개하지 않는다.** Story마다 가장 흥미로운 제작 이야기 하나만 고른다(UX 실패 · AI 생성 과정 · 데이터 분석 · 선택 설계 · 실제 반응).
- **실패·성과 공개는 실측 근거가 있을 때만** 쓴다. 대외 주장이면 `PROOF-BANK.md` 등급을 따른다. 가상의 실패담을 만들지 않는다.
- Gen Studio 노출은 "이 장면은 Gen Studio로 만들었다" 수준의 사실 서술로 한다.
- 캠페인을 설계할 때 메시지 앞에 `Current Belief → Desired Belief → Evidence → Next Action`을 먼저 적는다(Marketing Oops campaign hypothesis와 같은 구조).
- 채널 문법·claim·캠페인 귀속은 `MARKETING-STRATEGY.md`와 `.claude/refs/content-policy/`, ledger·발행 cap 조회 의무는 `.claude/rules/content-operations.md`를 따른다.

---

## 14. 금지 패턴

| 패턴 | 뜻 | 차단 지점 |
| --- | --- | --- |
| Topic Costume | 평범한 정보에 캐릭터만 씌운다 | P1 Worthiness |
| Lore Inflation | 콘텐츠 가치보다 설정이 커진다 | P11 Canon Check |
| Character Inflation | Story마다 새 캐릭터를 만든다 | P4 판단식 |
| Forced Conflict | 정보 전달을 위해 억지 싸움을 만든다 | P5·P6, Verifier Causality |
| Endless Cliffhanger | 다음 편 유도를 위해 모든 이야기를 미완으로 남긴다 | P10 |
| Canon Drift | Story마다 성격·외형·세계 규칙이 바뀐다 | Verifier Canon/Persona |
| Story Dictated Content | 세계관을 잇기 위해 가치 없는 주제를 만든다 | P1 Knowledge Value, §7.9 |
| Omniscient NPC | 캐릭터가 알 수 없는 정보로 행동한다 | Verifier Knowledge |
| Strawman Character | 캐릭터를 주장 전달용 허수아비로 쓴다 | Verifier Persona |
| Quiz Disguised as Choice | 정답 하나와 오답으로 된 선택 | Verifier Choice |
| Copy-as-Persuasion | FOMO·검증 안 된 성과 주장으로 판단을 움직이려 한다 | Verifier Intelligence, §1.5 |
| One-shot Mega Prompt | 파이프라인 전체를 한 프롬프트로 생성한다 | §7 산출물 규칙 |
| Product-First Story | 서비스 홍보를 위해 Story를 만든다 | §11.3 |
| Magazine Coupling | Story를 기사 안에 넣거나, 기사 방문·복귀를 Story의 조건·CTA로 둔다 | §7.2·§11.3 (PTU-Q-015) |
| Article Embed 재도입 | 종료된 기사 내 AI 대화·이미지 위젯을 Story 이름으로 되살린다 | §2 (PTU-Q-016 D-3) |
| Personal → Official Leak | 한 사용자의 선택 결과를 공식 Canon으로 반영한다 | §4.2 |

---

## 15. 단계적 구현 (현재 위치)

| 단계 | 내용 | 현재 상태(2026-10-12 기준) |
| --- | --- | --- |
| 0 | 규약 확정(이 문서)·용어 정합 | **approved v1.0** |
| Runtime | Story 선택 확정·멱등·Narrative 반영 | PTU-002 사이클 1 완료(node-app `6f13194a`, `story.runtime` admin_only) |
| A | Character Definition / State / Knowledge 분리 | 부분 — Canon `character`(C3)·`allowedKnowledge`/`forbiddenKnowledge`, Belief·운영 레지스트리 없음 |
| B | Story 계약 v1·카탈로그·출판 lifecycle | ISC-000(ready) → ISC-001 → ISC-002 |
| C | 제작 도구·AI 보조 각색 | ISC-003 (`G-ISC-AI-COST`) |
| D | 출판 검수(§9 Verifier 연결) | ISC-005 |
| E | Home 피드·Play 소비 | ISC-006·ISC-007 |
| F | 측정·Performance Learning | ISC-008 |
| G | Character Agent Simulation·Impact Graph 자동화 | 미착수 — 파일럿 Story 이후 판단 |
| 보류 | 사용자 개인 유니버스·사용자 캐릭터 생성·사용자 생성 Story(숏폼 생성) | `personal-universe` 공개 정책·개인정보·비용 계약 선행. 별도 설계 |
| 보류 | 오디오·영상 자동화·현지화 | Story가 일반 콘텐츠보다 몰입·지속·재방문을 더 만든다는 것이 먼저 증명돼야 한다 |

- 구현 순서·상태·파일럿 Story 소재 선정은 실행 원장이 소유한다. 이 문서에 TASK 상태를 쓰지 않는다(위 표는 승격 시점의 위치 표시).
- 캐릭터 생성 = `todo-character-model-genesis-validation.json`, 캐릭터 에셋 재사용 = `todo-character-interactive-article.json`(Article Embed 범위는 superseded), Play 세계관 = `todo-play-world-minigame.json`.

---

## 16. 최종 제작 원칙

- 설명하지 않는다 — **사건으로 만든다.**
- 보게만 하지 않는다 — **선택하게 한다.**
- 정답을 알려주지 않는다 — **판단 기준을 바꾼다.**
- 지식을 전달하지 않는다 — **경험하게 한다.**
- 캐릭터를 등장시키지 않는다 — **관계를 축적한다.**
- 한 편을 만들지 않는다 — **다음 이야기가 가능한 세계를 만든다.**

```text
Intelligence가 무엇을 말할지 결정한다.
Story Planning이 어떻게 경험하게 할지 결정한다.
Character System이 누가 그 경험을 살아갈지 결정한다.
Narrative Runtime이 사용자의 선택을 그 사용자의 역사에 남긴다.
Canon이 세계에 무엇이 남는지 결정한다(승인된 것만).
Performance Data가 다음에 무엇을 만들지 다시 결정한다.
```

---

## 부록 A. 원천 논의 채택 판정

| 원천 항목 | 판정 | 비고 |
| --- | --- | --- |
| North Star `Meaningful Continuation` · 4요소 공식 · 5E | **adopt** | §1, Magazine 연속성 → Story·Play 연속성으로 |
| 5단계 경험(Stop·Play·Gain·Want·Return) | **adapt** | 기획 설명용. 계측은 §12.1 |
| Interactive Article = Small Product | **adopt** | §13 |
| Build Log 시리즈 | **adapt** | §13, 실측 근거 한정 |
| Canon Policy C0~C5 | **adapt** | Tier T0~T5, 저장은 코드 C0~C3 |
| 세 파이프라인 + 게임 에셋 제작 흐름 | **merge** | §7 A0·P0~P19 |
| Character Definition/State/Knowledge/Belief | **adopt** | §4.4·§5.2 |
| Character Agent Simulation | **adopt(선택)** | §7.4 P5 |
| Subplot Engine · Payoff Horizon | **adopt** | §7.4, `open-loop` 매핑 |
| Beat Sheet | **adopt** | §7.5 Design Beat |
| Generator/Verifier 분리 | **adopt** | §9 |
| Narrative Impact Graph | **adopt(참조 필드만)** | §9.3 |
| Knowledge Binding | **adopt** | §7.6 |
| 판단 기준 변화·Current/Desired Belief (2026-10-01) | **adopt** | §1.5·§7.3·§13 |
| Reach vs Persuasion Asset · Traffic/Persuasion Outlier | **adopt(분석 원칙)** | §12.2 |
| Persuasion Proxy · ICR | **defer** | MEASUREMENT-PLAN 판정 |
| Magazine 기사 구조에 설득 단계 삽입(2026-10-01 §3) | **out of scope** | Magazine 기사 규칙은 `CONTENT-INTELLIGENCE.md` 소관. 이 문서에 넣지 않는다 |
| Decision Media·B2B 상업화 | **defer** | 데이터 축적 후 `BUSINESS-CHARTER.md` 판단 |
| Home 숏폼 Story·CTA "이 캐릭터로 나만의 스토리 시작하기" (TEMP) | **adopt** | §6.6·§11 |
| 캐릭터 시트·액션 시트·유니버스 캐릭터 타입 (TEMP) | **adopt** | §5.3·§7.1 |
| 유니버스 오너/비오너 사용자 캐릭터 생성, 사용자 숏폼 Story 생성 (TEMP) | **defer** | §15 보류 — personal-universe 계약 선행 |
| "Play 전용 CRUD 시스템에 등록" (TEMP) | **adapt** | 등록·출판 시스템은 ISCS(node-app 독립 콘텐츠 시스템)다. Play 전용이 아니다 |
| Magazine Editorial Story · Magazine 시작점/복귀점 · 기사 Story 삽입 | **reject** | 2026-10-12 지시 — Magazine 기사는 Intelligence 리소스 전용(PTU-Q-015) |
| Tutors 확장·Tutors embed·캐릭터 대화 위젯 | **reject** | Tutors 종료·Play 통합, Article Embed 종료(PTU-Q-016 D-3) |
| 콘텐츠 기본 단위를 Article → Experience로 전환 | **reject(현 형태)** | Story는 독립 콘텐츠 시스템으로 분리됐다. Magazine 단위를 바꾸지 않는다 |
| Character Studio · Story Planner · Episode Studio 3화면 UX | **adapt** | ISC-003 제작 도구 설계 입력. 원클릭 전편 생성 금지(§14) |
| AI Audience Agent retention 예측 · fine-tuning | **reject(현 단계)** | §12.3 |
| Sherpa·Pocket FM 수치, arXiv 인용, Reuters 2026 수치, 4AM 사례 | **대외 인용 금지(미검증)** | 내부 참고로만 |

## 부록 B. 충돌 해소 목록

| # | 충돌 | 해소 |
| --- | --- | --- |
| B-1 | `Episode` — Magazine 섹션 단위 vs 서사 단위 | Story 문서에서 `Episode` 미사용, 단위는 `Interactive Story`(§2) |
| B-2 | Canon C0~C5(원천) vs C0~C3(코드) | Tier + 코드 레이어 권위(§4.1) |
| B-3 | Story Arc — 편집 vs 사용자 런타임 | `Series Arc`(§2) |
| B-4 | `interactive` 3중 의미(Article Embed·CT 세션·Story) | §2 표 |
| B-5 | 원천의 Magazine 시작/복귀점 vs PTU-Q-015 | Magazine = Intelligence 원천 전용(§11) |
| B-6 | 원천의 Tutors 확장 vs Tutors 종료 | Play CharacterChat(§11) |
| B-7 | 사용자 선택 결과 vs 공식 Canon | §4.2 분리 |
| B-8 | TEMP "Play 전용 CRUD" vs ISCS 독립 시스템 | ISCS(부록 A) |
| B-9 | Canon 쓰기 권한(종전 미확인) | `canonValidator.ts:25-35` — ai·system 거부, official은 admin만(호출 경로 전수는 추정) |

## 부록 C. 승격 시 정합 결과와 남은 일

| # | 대상 | 2026-10-12 처리 |
| --- | --- | --- |
| C-1 | `INDEX.md` | SSOT 표에 등록 |
| C-2 | `play/GUIDE.md` | Story 기획 규칙 포인터 추가 |
| C-3 | `SERVICE-ROLE-MAP.md` | ISCS 원장 실존 반영·포인터 |
| C-4 | `CONTENT-INTELLIGENCE.md` | 기사 내 `Story / Episode Design`·인터랙티브 기사와 Interactive Story 구분 포인터 |
| C-5 | `content_production_workflow.md`(정본) | "Interactive Story·특집" 표기를 기사 유형 표기로 정정 |
| C-6 | `app_post_draft.md`(정본) | Article Embed 종료·Tutors 종료 배너 |
| C-7 | ISCS 원장 | `G-ISC-NARRATIVE-STANDARD` 해소 판정, references 갱신 |
| 남음 | `MEASUREMENT-PLAN.md` | Story 이벤트·Persuasion Proxy 채택 — ISC-008 |
| 남음 | 캐릭터 운영 레지스트리 스키마 | §5.4 — 파일럿 Story 3건 이후 |
| 남음 | Canon 쓰기 경로 전수 확인 | ISC-001 D2 |
| 남음 | 유니버스 캐릭터 타입 옵션·액션 시트 프롬프트 (TEMP) | 소유 원장 배정 — ISCS 원장 `ISC-OD-05` |
