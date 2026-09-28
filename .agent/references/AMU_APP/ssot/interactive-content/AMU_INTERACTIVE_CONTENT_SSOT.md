# AMU Interactive Content SSOT — 캐릭터·Canon·스토리·에피소드 제작 규약

| 항목 | 값 |
| --- | --- |
| 문서 ID | `SSOT-IC-001` |
| 버전 | 1.0.0-draft |
| 상태 | Draft (승인 전) |
| 최종 수정 | 2026-09-28 |
| 소유자 | TBD — [부록 A. 결정 필요 사항](#부록-a-결정-필요-사항-open-decisions) 참조 |
| 원천 문서 | `.agent/references/AMU_APP/in_progress/AMU_Interactive_Episode_System.md`<br>`.agent/references/AMU_APP/in_progress/Knowledge-Grounded_Narrative_Engine.md` |
| 동반 문서 | [`AMU_INTERACTIVE_CONTENT_SCHEMAS.md`](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md) — 데이터 스키마<br>[`REVIEW_NOTES.md`](./REVIEW_NOTES.md) — 원천 문서 분석·검토 결과 |
| 적용 대상 | Magazine, Social, Tutors, Play, Gen Studio, Store, Marketing Oops 및 이를 제작하는 사람·AI 에이전트 전부 |

---

## 0. 이 문서를 읽는 방법

### 0.1 문서의 지위

- 이 문서는 AMU 인터랙티브 콘텐츠(Interactive Experience / Canon Episode)의 **기획·캐릭터·Canon·스토리·제작·검증·측정**에 대한 **단일 기준(SSOT)** 이다.
- 원천 문서(`in_progress/`)는 논의 기록이며 규범이 아니다. 원천 문서와 이 문서가 충돌하면 **이 문서가 우선**한다.
- AMU를 `커머스형 유니버스 + 게임형 유니버스` 중심으로 정의한 과거 포지셔닝 문서는 **AI 인터랙티브 미디어 정의 이전 문서**로 간주한다. 인터랙티브 콘텐츠 설계 시 해당 문서와 충돌하면 이 문서와 Magazine 중심 성장 루프를 따른다.
- 데이터 구조의 필드 정의는 [`AMU_INTERACTIVE_CONTENT_SCHEMAS.md`](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md)가 SSOT다. 이 문서의 필드 언급은 요약이다.

### 0.2 규범 용어

| 표기 | 의미 | 위반 시 |
| --- | --- | --- |
| **MUST / 반드시** | 예외 없는 필수 규칙 | 게이트 통과 불가(블로킹) |
| **MUST NOT / 금지** | 예외 없는 금지 규칙 | 게이트 통과 불가(블로킹) |
| **SHOULD / 권장** | 기본값. 벗어나려면 사유를 Production Brief에 기록 | 사유 없으면 리뷰 지적 |
| **MAY / 가능** | 선택 사항 | — |

### 0.3 규칙 ID

모든 규칙은 `R-<영역>-<번호>` 형식의 ID를 가진다. 사람·AI 에이전트·검증기(Verifier)는 리뷰 코멘트와 검증 리포트에서 이 ID를 인용한다.

| 영역 코드 | 영역 |
| --- | --- |
| `GOAL` | 목적·North Star |
| `UNIT` | 콘텐츠 단위·Tier |
| `PIPE` | 파이프라인·게이트 |
| `CAN` | Canon |
| `CHR` | 캐릭터 |
| `CAST` | 캐스팅 |
| `SIM` | 캐릭터 에이전트 시뮬레이션 |
| `CONF` | 갈등 |
| `STRY` | 서사 구조 |
| `SUB` | 서브플롯 |
| `KNOW` | 지식·사실성 |
| `INT` | 인터랙션 |
| `CONT` | 연속성 |
| `VER` | 검증 |
| `DIST` | 채널·배포 |
| `CTA` | 서비스 확장·CTA |
| `BLD` | Build Log |
| `MET` | 측정 |
| `GOV` | 거버넌스·권한 |

### 0.4 기본값(초기값) 표기

원천 문서가 수치를 정하지 않은 항목에 이 문서가 처음 정한 수치는 `〔초기값〕`으로 표기한다. 〔초기값〕은 운영 데이터로 조정하는 대상이며, 조정 시 버전을 올리고 [변경 이력](#부록-c-변경-이력)에 기록한다.

---

## 1. 목적과 North Star

### 1.1 전략 전제

| ID | 전제 |
| --- | --- |
| P-01 | 사람들이 지식을 원하지 않게 된 것이 아니다. **지식을 얻기 위해 긴 글을 먼저 찾아 읽는 행동의 독점력이 무너지고 있다.** 정보성 질문은 점점 AI 챗으로 해결된다. |
| P-02 | 사람들이 여전히 스스로 찾아서 시간을 쓰는 거의 유일한 영역은 **엔터테인먼트**다. |
| P-03 | AMU에서 엔터테인먼트는 "자극적인 것"이 아니라 **사용자가 자발적으로 시간을 쓰고 싶게 만드는 경험**이다. 짧음이 아니라 **몰입**이 핵심이다. |
| P-04 | 따라서 AMU는 "정보를 더 잘 정리하는 미디어"로 경쟁하지 않는다. **지식을 경험으로 바꾸는 미디어**로 경쟁한다. (Knowledge as Entertainment, Experience First) |
| P-05 | AMU의 차별 자산은 **자체 캐릭터 + 단일 Canon 세계관 + 현실 세계 Intelligence** 의 결합이다. 캐릭터와 Canon은 콘텐츠를 소비하게 만드는 **서사 엔진**이다. |
| P-06 | 사용자 시간 기준으로 AMU의 경쟁자는 블로그·매거진뿐 아니라 YouTube, Netflix, Instagram, TikTok, Threads, 게임, 웹툰, AI 챗 전부다. |

### 1.2 North Star

> **Meaningful Continuation — 콘텐츠를 경험한 사람이 AMU 안에서 다음 행동을 자발적으로 이어가는가?**

- **R-GOAL-01 (MUST)** 모든 Interactive Experience / Canon Episode는 "경험 후 사용자가 이어갈 다음 행동"을 기획 단계에서 정의한다. 다음 행동이 정의되지 않은 콘텐츠는 인터랙티브로 제작하지 않는다.
- **R-GOAL-02 (MUST)** 조회수·완독률·서비스 클릭률 **단일 지표**를 콘텐츠 성공의 대표 지표로 사용하지 않는다. 대표 지표는 [§26 측정 규약](#26-측정-규약)의 ICR과 Return이다.
- **R-GOAL-03 (MUST)** "와 신기하다(Wow)"는 **Acquisition Mechanism**이지 Business Outcome이 아니다. Wow만 있고 Continuation이 설계되지 않은 콘텐츠는 승인하지 않는다.

### 1.3 목표 사용자 상태 (성공 상태 정의)

모든 Episode가 궁극적으로 만들어야 하는 사용자 반응은 다음이다.

> **"무슨 일이 일어날지 궁금해서 보기 시작했고, 보다 보니 새로운 것을 알게 되었고, 이제 직접 해보고 싶고, 다음 이야기도 보고 싶다."**

사업적 최종 상태: **"다음에도 AMU에 와보고 싶다."**

### 1.4 AMU 성장 순서와의 정합

인터랙티브 콘텐츠는 AMU 성장 순서를 따른다.

```text
발견 → 소비 → 관계 → 재방문 → 확장 → Magazine 복귀 → 수익
```

- **R-GOAL-04 (MUST)** 콘텐츠의 1차 목표는 **제품 판매가 아니라 관계의 시작**이다. 초기 단계에서는 `저장 → 다른 콘텐츠 → 팔로우 → 재방문`만으로 성공으로 본다.
- **R-GOAL-05 (MUST NOT)** Magazine을 제품 판매를 위한 콘텐츠 마케팅 블로그로 만들지 않는다. 서비스(Gen Studio·Tutors·Play·Store)는 **콘텐츠 자체의 다음 행동**으로만 등장한다.

### 1.5 브랜드 약속 (후보)

- "읽고 끝나지 않는다." / "읽었으면, 다음엔 해볼 차례다."
- 포지셔닝: **"사람들이 재미 때문에 들어왔는데, 나갈 때는 무언가 얻어가는 곳."**
- 슬로건 확정은 이 문서의 범위가 아니다. 단, 위 문장은 **제품 설계 원칙**으로 사용한다: 모든 주요 콘텐츠는 "사용자는 이걸 경험한 다음 무엇을 해보고 싶어질까?"에 답해야 한다.

### 1.6 비목표 (Non-goals)

| 비목표 | 이유 |
| --- | --- |
| 모든 콘텐츠의 인터랙티브화 | 인터랙션이 이해·몰입을 개선하지 않으면 비용만 증가 ([§3.3](#33-tier-판정-규칙)) |
| 모든 콘텐츠에 캐릭터 투입 | 단순 정보·사용법에서는 캐릭터가 방해 ([R-UNIT-05](#33-tier-판정-규칙)) |
| 숏폼 전문 미디어화 | 숏폼은 Discovery 채널이다. 깊은 경험은 Magazine에서 제공 |
| 세계관 확장 자체 | 수요 없는 Story를 세계관 유지 목적으로 제작 금지 ([R-CONT-07](#20-연속성-규약-continuity)) |
| 자동 원고 대량 생산 | 품질·Canon 붕괴 위험. 단계별 산출물과 검증이 우선 |
| Audio Drama·다국어 현지화·자체 모델 파인튜닝 | Phase F 이후 ([§29](#29-구현-로드맵)) |

---

## 2. 용어집 (Canonical Terms)

이 문서와 스키마, 코드, 에이전트 프롬프트는 아래 용어만 사용한다. 동의어를 새로 만들지 않는다.

| 용어 | 정의 | 대체 금지 표현 |
| --- | --- | --- |
| **Article** | 인터랙션·캐릭터 없는 일반 Magazine 콘텐츠 (Tier 0) | "일반 기사" 혼용 가능 |
| **Interactive Experience** | 하나의 질문·주제를 직접 경험하게 만든 콘텐츠. Canon 캐릭터 없음 (Tier 1) | "인터랙티브 기사" (구어로만 허용) |
| **Canon Episode** | Canon 세계관 안에서 발생한 하나의 사건 단위. 캐릭터·갈등·지식·인터랙션 포함 (Tier 2). 이 문서에서 단독 "Episode"는 Canon Episode를 뜻한다 | "회차", "스토리 글" |
| **Interactive Product** | Tier 1·2 콘텐츠를 "작은 제품"으로 볼 때의 관점 명칭. 별도 엔티티가 아니다 | — |
| **Universe** | 캐릭터·장소·사건·관계·역사·세계 규칙을 공유하는 Canon 단위 | "세계관" (구어 허용) |
| **Canon** | Universe 안에서 사실로 인정된 공식 설정 | — |
| **Story Arc** | 여러 Episode가 하나의 큰 문제·갈등·변화를 다루는 이야기 구조 | "시즌" |
| **Main Plot** | Story Arc의 중심 사건선 | — |
| **Subplot** | Main Plot과 병행하는 보조 사건선 (Character / Relationship / World·Knowledge) | "떡밥"(구어 허용) |
| **Scene** | Episode 안의 장면 단위 | — |
| **Beat** | 서사 구조상의 기능 단위 (Cold Open, Trigger …). 하나의 Scene이 하나 이상의 Beat를 담는다 | — |
| **Core Question** | Episode가 답하려는 단 하나의 중심 질문 | — |
| **Human Tension** | 지식 문제를 사람이 실제 겪는 문제로 바꾼 긴장 | — |
| **Narrative Premise** | "[캐릭터]가 [목표]를 달성하려 하지만 [갈등] 때문에 [선택]해야 한다" 한 문장 | — |
| **Activation Event** | 사용자가 해당 콘텐츠의 핵심 가치를 경험했다고 판정하는 단일 행동 (예: 자신의 조건 입력 후 결과 확인) | — |
| **Entry Character** | 사용자가 Episode에 진입할 이유를 제공하는 첫 핵심 캐릭터 | — |
| **Bridge Character** | Episode 종료와 다음 Story 가능성을 연결하는 마지막 핵심 캐릭터 | — |
| **Narrative Baton Pass** | 다음 Episode로 중심(캐릭터·문제·장소·지식·관계)을 넘기는 연결 메커니즘 | — |
| **Next Episode Seed** | Episode 종료 시 저장하는 다음 Episode 후보 (최대 3개) | — |
| **Entry State / Exit State** | Episode 시작 시 / 종료 후의 세계·캐릭터·관계 상태 스냅샷 | — |
| **CharacterDefinition** | 캐릭터의 불변(장기) 속성 | — |
| **CharacterState** | 캐릭터의 현재(가변) 상태 | — |
| **World Truth / Character Knowledge / Character Belief** | 세계의 사실 / 캐릭터가 아는 것 / 캐릭터가 사실이라 믿는 것 | — |
| **Knowledge Claim** | Episode에 결합되는 현실 지식의 최소 단위 (Fact / Interpretation, 출처·신선도 포함) | — |
| **Narrative Runtime** | Canon·CharacterState·관계·서브플롯을 보유하는 공통 상태 계층. 특정 서비스 소유가 아니다 | — |
| **Narrative Impact Graph** | Beat·Canon Event·Knowledge 간 의존 관계 그래프. 수정 시 영향 범위 계산에 사용 | — |
| **Build Log** | 인터랙티브 콘텐츠의 제작 과정을 공개하는 정규 시리즈 (가칭 "AMU Build Log") | "메이킹" (구어 허용) |
| **ICR** | Interactive Continuation Rate ([§26.3](#263-핵심-지표-icr)) | — |
| **MARR** | AMU 전사 지표. 정의는 AMU Measurement Plan 문서가 SSOT (이 문서 범위 밖) | — |

---

## 3. 콘텐츠 단위 체계와 Tier

### 3.1 계층 구조

```text
Universe
 ├─ Canon (C0~C5)
 ├─ Character (Definition + State)
 ├─ Relationship
 └─ Story Arc
     ├─ Main Plot
     ├─ Subplot (0..n)
     └─ Canon Episode
         ├─ Scene
         │   └─ Beat
         ├─ Knowledge Claim (binding)
         ├─ Interaction
         ├─ Entry State / Exit State
         └─ Next Episode Seed (0..3)

Magazine
 ├─ Article                  (Tier 0)
 ├─ Interactive Experience   (Tier 1)
 └─ Canon Episode            (Tier 2)
```

### 3.2 Tier 정의

| Tier | 명칭 | 캐릭터 | 인터랙션 | Canon 반영 | 대표 예 |
| --- | --- | --- | --- | --- | --- |
| **0** | Article | 없음 | 없음(또는 최소) | 없음 | 공지, 짧은 업데이트, 사용법 |
| **1** | Interactive Experience | 없음 | 필수 | 없음 | 복리 시뮬레이터, 프롬프트 Before/After 비교, 자기진단 테스트 |
| **2** | Canon Episode | 2명 이상 | 필수 | 필수 (Exit State) | AI 자동화를 둘러싼 캐릭터 간 갈등 드라마 |

- **R-UNIT-01 (MUST)** 모든 Magazine 콘텐츠는 제작 착수 전 Tier를 하나로 확정한다.
- **R-UNIT-02 (MUST)** Tier 2는 반드시 Universe·Story Arc에 소속되고, Exit State와 Canon Change 목록(변경 없음 포함)을 가진다.
- **R-UNIT-03 (MUST NOT)** Tier 1에 Canon 캐릭터를 "카메오"로 등장시켜 Canon 상태를 바꾸지 않는다. Canon 캐릭터가 등장하면 Tier 2다.

### 3.3 Tier 판정 규칙

Intelligence Candidate가 [Episode Worthiness Gate](#8-g1-episode-worthiness-gate)를 거친 결과로 Tier를 정한다.

| 조건 | 결과 |
| --- | --- |
| Interaction Potential 낮음 **또는** 즉시 답이 필요한 사용법/공지/짧은 업데이트 | Tier 0 |
| Interaction Potential 충분, Narrative·Human Tension·Character Relevance 낮음 | Tier 1 |
| Narrative·Human Tension·Character Relevance·Interaction 모두 충분 | Tier 2 |

- **R-UNIT-04 (MUST)** 인터랙션이 이해·몰입을 개선하지 않는 주제는 Tier 0으로 제작한다.
- **R-UNIT-05 (SHOULD)** 캐릭터 활용 가치가 높은 주제만 Tier 2로 올린다: 관점 충돌이 중요한 주제, 인간의 선택이 핵심인 주제, 연속 Story Arc가 가능한 주제, 감정적 몰입이 중요한 주제, 관계 변화가 발생하는 주제.

### 3.4 Content Asset Set (1 Product → N Assets)

Tier 1·2 콘텐츠 하나는 다음 파생 자산을 가질 수 있다. 각 자산은 **서로 다른 역할**을 가져야 하며 단순 재활용이 아니다.

| 자산 | 역할 | 주 채널 |
| --- | --- | --- |
| Main Product | 전체 경험 (본편) | Magazine |
| Teaser / Short-form Drama | 호기심·Discovery | Threads, Instagram, Shorts |
| Build Log | 제작 과정·실패·개선 공개 | Threads, LinkedIn, Instagram |
| Utility Content | 방법·프롬프트·도구·인사이트 | Magazine, Social |
| Proof | 실제 사용 데이터·반응 | Threads, LinkedIn, Magazine |
| Next Version | 데이터 기반 개선판 또는 다음 Episode | Magazine |

---

## 4. 핵심 원칙

| ID | 원칙 | 요지 |
| --- | --- | --- |
| **PR-1** | Entertainment First, Value Always | 먼저 시간을 얻고, 그 시간에 가치를 전달한다 (Attention → Experience → Value). 엔터테인먼트는 입구이지 목적이 아니다 |
| **PR-2** | Experience First, not Article First | 기사를 쓰고 쇼츠로 자르는 것이 아니라, 경험을 먼저 설계하고 그 안에 지식을 넣는다 |
| **PR-3** | Story First, Knowledge as Tool | 지식은 강의가 아니라 캐릭터의 문제를 해결하는 도구로 등장한다 |
| **PR-4** | Role before Character | 이야기에 필요한 역할을 먼저 정하고, 그 역할에 맞는 캐릭터를 캐스팅한다 |
| **PR-5** | Reuse before Create | 신규 캐릭터·서브플롯보다 기존 캐릭터·미해결 서브플롯을 먼저 검색한다 |
| **PR-6** | Canon is Append-first | Canon은 덮어쓰지 않고 새로운 사건으로 변화를 설명한다 |
| **PR-7** | AI Proposes, Humans Canonize | AI는 제안·생성·검증한다. Canon 확정은 사람이 승인한다 |
| **PR-8** | Generator ≠ Verifier | 이야기를 만든 주체와 검증하는 주체를 분리한다 |
| **PR-9** | Intelligence Decides What, Narrative Decides How | 무엇을 다룰지는 Intelligence가, 어떻게 경험하게 할지는 Narrative Planning이 결정한다. Story가 Intelligence를 지배하지 않는다 |
| **PR-10** | Measure before Predict | 초기에는 AI의 재미·리텐션 예측이 아니라 실제 사용자 행동을 측정한다 |
| **PR-11** | Artifacts, not One Prompt | 파이프라인의 각 단계는 명시적 산출물(artifact)을 남긴다. 전체를 하나의 프롬프트로 처리하지 않는다 |
| **PR-12** | Continuity Compounds | 캐릭터·관계·사건은 Episode마다 초기화되지 않고 누적되는 장기 자산이다 |

---

## 5. 프레임워크 정렬 (어떤 프레임워크를 어디에 쓰는가)

원천 문서의 여러 프레임워크는 경쟁 관계가 아니라 **용도가 다르다.** 아래 표가 공식 매핑이다.

| 용도 | 공식 프레임워크 | 사용 시점 | 사용 주체 |
| --- | --- | --- | --- |
| 기획 품질 게이트 | **5E**: Entertain → Engage → Enlighten → Empower → Extend | Production Brief 작성·승인 | Planner, Editor |
| 가치 균형 점수 | **AVAC**: Attention × Value × Agency × Continuity | Brief 승인, 사후 회고 | Editor |
| 사용자 경험 흐름 | **Stop → Play → Gain → Want → Return** | 인터랙션·UX 설계 | UX/Frontend |
| 서사 뼈대 | **Hook → Conflict → Investigation → Decision → Consequence** (5단) | Episode Arc 설계 | Narrative Planner |
| 서사 상세 비트 | **10 Beats**: Cold Open → Trigger → Goal → Conflict → Investigation → Complication → Decision → Consequence → Resolution → Bridge | Beat Sheet 작성 | Narrative Planner, Scene Writer |
| 측정 퍼널 | **Attraction → Experience → Completion → Relationship → Continuation → Return** | 배포 후 | Marketing Oops, Analytics |
| 성장 루프 (Build Log) | **Build → Show → Teach → Invite → Learn** | 파생 자산 운영 | Growth, Content |

### 5.1 단계 매핑표

| 5E | 사용자 흐름 | 서사 5단 | 10 Beats | 측정 퍼널 | AVAC |
| --- | --- | --- | --- | --- | --- |
| Entertain | Stop | Hook | Cold Open, Trigger | Attraction | Attention |
| Engage | Play | Conflict, Investigation | Goal, Conflict, Investigation, Complication | Experience | Agency |
| Enlighten | Gain | Investigation, Decision | Investigation, Decision | Completion | Value |
| Empower | Want | Decision, Consequence | Decision, Consequence, Resolution | Relationship, Continuation | Agency, Value |
| Extend | Return | Consequence (Deferred) | Bridge | Continuation, Return | Continuity |

### 5.2 5E 게이트 질문

| 단계 | 질문 | Brief 필드 |
| --- | --- | --- |
| Entertain | 왜 보게 되는가? (호기심·미스터리·감정·아름다움·긴장·유머·경쟁·발견·관계·자기 투영·성취·놀라움·힐링 중 무엇인가) | `entertainmentDriver` |
| Engage | 무엇을 직접 하게 되는가? | `interactions[]`, `activationEvent` |
| Enlighten | 무엇을 새롭게 이해하게 되는가? | `knowledgeGoal`, `knowledgeClaims[]` |
| Empower | 무엇을 할 수 있게 되는가? | `empowerOutcome` |
| Extend | 다음 행동은 무엇인가? | `primaryCta`, `nextEpisodeSeeds[]` |

- **R-PIPE-01 (MUST)** 5E 중 **Entertain·Engage·Enlighten·Extend 4개**에 명확히 답하지 못하면 Tier 1·2로 제작하지 않는다. Empower는 Tier 2에서 SHOULD.
- **R-PIPE-02 (MUST)** "왜 사람이 자기 시간을 써서 이것을 봐야 하는가?"에 대한 답이 **"유익하니까"뿐**이면 Entertain 미충족으로 판정한다.

### 5.3 AVAC 점수

각 축을 0–5로 채점한다 〔초기값〕.

| 축 | 질문 | 0 | 5 |
| --- | --- | --- | --- |
| Attention | 멈춰 보게 만드는가? | 스크롤을 멈출 이유 없음 | 강한 Hook |
| Value | 쓴 시간만큼 얻는 것이 있는가? | 얻는 것 없음 | 명확한 지식·통찰·결과 |
| Agency | 사용자가 직접 무언가 해볼 수 있는가? | 순수 읽기 | 사용자 선택이 결과를 바꿈 |
| Continuity | 다음 행동으로 이어지는가? | 막다른 길 | 자연스러운 다음 행동 + 복귀 경로 |

- **R-PIPE-03 (MUST)** Tier 1·2는 **모든 축 ≥ 3** 이어야 승인한다 〔초기값〕. 한 축이라도 1 이하면 블로킹 (곱셈 구조: 하나가 0에 가까우면 전체 가치가 무너진다).
- 진단 패턴 (참고):

| 패턴 | A | V | Ag | C | 판정 |
| --- | --- | --- | --- | --- | --- |
| 신기하기만 한 콘텐츠 | 5 | 2 | 3 | 1 | 바이럴 콘텐츠 |
| 정보만 좋은 콘텐츠 | 2 | 5 | 1 | 2 | 좋은 블로그 |
| 제품 홍보형 콘텐츠 | 2 | 2 | 4 | 2 | 광고 |
| **AMU 목표** | 4+ | 4+ | 4+ | 4+ | Interactive Product |

---

## 6. 시스템 아키텍처와 책임 경계

### 6.1 시스템 책임

| 시스템 | 책임 (결정하는 것) | 소유 데이터 |
| --- | --- | --- |
| **Intelligence System** | 무엇을 다룰 것인가 (수요·시의성·가치·중복·Pillar/Cluster·Authority·Relationship·Expansion 가능성) | `ContentCandidate`, Seed 재검증 결과 |
| **Episode Planning System** | 선정된 콘텐츠를 어떤 경험으로 만들 것인가 (Tier, 사건화, 캐스팅, 갈등, 인터랙션, 연속성) | `EpisodeCandidate`, `NarrativePlan`, `CastingPlan`, `ContinuityPlan`, `ProductionBrief` |
| **Narrative Runtime** | 세계가 현재 어떤 상태인가 | `Universe`, `CanonEntry`, `CanonEvent`, `CharacterDefinition`, `CharacterState`, `Relationship`, `Subplot`, `NarrativeImpactGraph` |
| **Gen Studio** | Character / Story / Episode **제작 UI**, 사용자 생성 도구 | 제작 세션, 사용자 생성물 (Canon 원장은 소유하지 않음) |
| **Magazine** | 완성된 Experience / Episode 제공, 시작점이자 복귀점 | 게시물, 게시 상태 |
| **Tutors** | 캐릭터·주제와 대화하며 이해 확장 | 대화 세션 (Canon 읽기 전용) |
| **Play** | 사건과 선택을 직접 체험 | 플레이 세션 (Canon 읽기 전용) |
| **Store** | 검증된 결과물·도구·상품 활용 | 상품 |
| **Marketing Oops** | 배포·성과 측정·학습, Growth Experiment 운영 | `EpisodeMetrics`, 실험 기록 |

- **R-GOV-01 (MUST)** Canon·CharacterState·Relationship·Subplot의 원장(source of record)은 **Narrative Runtime**이다. Gen Studio·Tutors·Play·Magazine은 이를 읽거나 **변경 요청(`CanonChangeRequest`)** 만 할 수 있다.
- **R-GOV-02 (MUST NOT)** Tutors·Play 세션에서 사용자와의 대화 결과가 공식 Canon을 직접 변경하지 않는다. 사용자별 진행 상태는 세션 범위 데이터로 분리한다.
- **R-GOV-03 (SHOULD)** 사용자가 만드는 개인 Universe(Gen Studio)는 동일 파이프라인·스키마를 사용하되 **공식 AMU Universe와 네임스페이스를 분리**한다 (`universe.visibility = "official" | "user"`).

### 6.2 전체 순환

```text
REAL-WORLD INTELLIGENCE
        ↓
Narrative Question (Core Question)
        ↓
Human Tension
        ↓
World / Canon Context Retrieval
        ↓
Character Casting
        ↓
Persona-grounded Character Agents
        ↓
Plot + Subplot Planning
        ↓
Arc → Episode → Scene (Beat Sheet)
        ↓
Knowledge Binding + Interaction Mapping
        ↓
Continuity (Entry / Exit State) + Canon Check
        ↓
Production Brief  ── Human Approval
        ↓
Writing / Production
        ↓
Narrative Verification + Editorial Review ── Human Approval
        ↓
Publish: Magazine / Social / Tutors / Play
        ↓
Audience Behavior (Measure)
        ↓
Canon State Update + Performance Learning
        ↓
Next Episode Seeds → Intelligence Revalidation
        ↓
(다시 Intelligence)
```

---

## 7. 통합 제작 파이프라인

원천 문서의 세 가지 파이프라인(제작 12단계, Planning 16단계, Narrative Intelligence 12단계)을 아래 **단일 파이프라인**으로 통합한다. 단계 번호는 이 표가 기준이다.

### 7.1 단계·산출물·게이트

| 단계 | 이름 | 입력 | 산출물 (artifact) | 게이트 | Tier |
| --- | --- | --- | --- | --- | --- |
| S01 | Intelligence Candidate | 외부 신호, Seed | `ContentCandidate` | — | 전체 |
| S02 | Episode Worthiness Gate | `ContentCandidate` | `EpisodeCandidate` (Tier 확정) | **G1** | 전체 |
| S03 | Core Question | `EpisodeCandidate` | `NarrativePlan.coreQuestion` | — | 1, 2 |
| S04 | Human Tension Extraction | S03 | `NarrativePlan.humanTension` | — | 2 (1은 SHOULD) |
| S05 | Narrative Premise | S04 | `NarrativePlan.premise` | — | 2 |
| S06 | World Context Retrieval | Universe, Canon, Arc | `NarrativePlan.worldContext` | — | 2 |
| S07 | Character Casting | S05, S06 | `CastingPlan` | — | 2 |
| S08 | Character Agent Simulation | `CastingPlan`, CharacterState | `SimulationLog` (행동 후보) | — | 2 |
| S09 | Relationship & Conflict Design | S07, S08 | `NarrativePlan.conflicts` | — | 2 |
| S10 | Plot & Subplot Planning | S09, 미해결 Subplot | `NarrativePlan.plot`, Subplot 갱신안 | — | 2 |
| S11 | Episode Arc & Beat Sheet | S10 | `BeatSheet` | — | 1, 2 |
| S12 | Knowledge Binding | Intelligence 근거 | `KnowledgeClaim[]` ↔ Beat 매핑 | — | 1, 2 |
| S13 | Interaction Mapping | `BeatSheet` | `Interaction[]`, `activationEvent` | — | 1, 2 |
| S14 | Continuity Design | Entry State | `ContinuityPlan` (Entry/Exit State, Baton Pass, Seeds) | — | 2 |
| S15 | Canon Pre-check | S14 | `VerificationReport(stage=plan)` | — | 2 |
| S16 | Production Brief | S03–S15 | `ProductionBrief` | **G2 Brief 승인** | 1, 2 |
| S17 | Writing / Production | Brief | Episode Draft (Scenes, 인터랙션 구현) | — | 1, 2 |
| S18 | Narrative Verification | Draft | `VerificationReport(stage=draft)` | **G3 검증 통과** | 1, 2 |
| S19 | Editorial Review | Draft + Report | 수정본 | — | 1, 2 |
| S20 | Publish Approval | 수정본 | 승인 기록 | **G4 게시 승인** | 1, 2 |
| S21 | Publish & Distribute | 승인본 | Magazine 게시, Social 자산 | — | 1, 2 |
| S22 | Measure | 이벤트 | `EpisodeMetrics` | — | 1, 2 |
| S23 | Canon / State Update | Exit State | `CanonEvent[]`, CharacterState 갱신 | **G5 Canon 승인** | 2 |
| S24 | Seed Registration | Seeds | `NextEpisodeSeed[]` → Intelligence 후보군 | — | 2 |

- **R-PIPE-04 (MUST)** 각 단계는 표의 산출물을 저장한 뒤 다음 단계로 넘어간다. 산출물 없는 단계 건너뛰기를 금지한다.
- **R-PIPE-05 (MUST NOT)** S03–S16을 하나의 거대 프롬프트로 처리하지 않는다. AI 에이전트는 단계별로 호출되고 각 호출의 입력은 **직전 산출물 + 필요한 Canon 검색 결과**로 제한한다.
- **R-PIPE-06 (MUST)** 캐릭터 생성부터 시작하지 않는다. 캐릭터 결정은 S07 이전에 일어날 수 없다.
- **R-PIPE-07 (MAY)** Tier 1은 S04–S10, S14–S15, S23–S24를 생략한다.

### 7.2 상태 머신

```text
content_candidate
    → episode_candidate        (G1 통과, Tier 확정)
    → narrative_plan
    → casting_plan             (Tier 2)
    → continuity_plan          (Tier 2)
    → production_brief         (G2 통과 시 approved)
    → episode: draft → verified (G3) → approved (G4) → published
    → canon_event              (G5, Tier 2)
    → next_episode_seed        → (Intelligence 재검증) → content_candidate
```

- **R-PIPE-08 (MUST)** `next_episode_seed`는 반드시 Intelligence로 돌아가 `content_candidate`로 재평가된다 (양방향 루프). Seed에서 바로 `episode_candidate`로 가는 경로는 존재하지 않는다.
- 상태 전이·필드는 [스키마 문서 §9](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md#9-상태-머신)가 SSOT다.

### 7.3 핵심 의사결정 순서 (항상 유지)

```text
좋은 Intelligence인가?
→ Episode로 만들 가치가 있는가?
→ 인간적인 문제는 무엇인가?
→ 어떤 사건으로 보여줄 것인가?
→ 누가 이 문제를 겪어야 하는가?
→ 기존 캐릭터로 가능한가?
→ 어떤 갈등이 발생하는가?
→ 사용자는 어디에 개입하는가?
→ 결과는 무엇인가?
→ 세계가 어떻게 변했는가?
→ 다음 이야기의 가능성은 무엇인가?
```

---

## 8. G1. Episode Worthiness Gate

### 8.1 ContentCandidate 최소 입력 (S01)

Topic, Core Insight, User Need, Content Role, Source/Evidence, Freshness, Search Demand, Cluster, Related Existing Content, Target Audience, Expected Value, Potential Expansion.

- **R-PIPE-09 (MUST)** Intelligence System은 바로 Episode를 제작하지 않는다. 반드시 `ContentCandidate`를 생성하고 G1을 거친다.

### 8.2 평가 기준

각 기준을 0(없음)·1(약함)·2(강함)로 채점한다 〔초기값〕.

| 기준 | 질문 |
| --- | --- |
| Knowledge Value | 스토리를 제거해도 전달할 가치가 있는 지식인가? |
| Narrative Potential | 사건으로 만들 수 있는가? |
| Human Tension | 실제 인간적인 갈등이 존재하는가? |
| Character Relevance | 캐릭터의 목표·관계와 연결할 수 있는가? |
| Interaction Potential | 사용자가 판단하거나 참여할 지점이 있는가? |
| Continuity Potential | 다른 Episode로 확장할 여지가 있는가? |

### 8.3 판정 〔초기값〕

| 조건 | 결과 |
| --- | --- |
| Knowledge Value = 0 | **반려** (가치 없는 지식은 어떤 Tier로도 제작하지 않음) |
| Interaction Potential = 0 | Tier 0 |
| Interaction Potential ≥ 1 이고 Narrative, Human Tension, Character Relevance **각각 ≥ 1**, 합계 ≥ 4, Continuity ≥ 1 | Tier 2 |
| Interaction Potential ≥ 1 이고 위 Tier 2 조건 미충족 | Tier 1 |

- **R-PIPE-10 (MUST)** Knowledge Value = 0 인 후보는 Narrative Potential이 아무리 높아도 반려한다 (Story Dictated Content 방지).
- **R-PIPE-11 (MUST)** G1 결과(점수·Tier·판정 사유)는 `EpisodeCandidate`에 기록한다.

---

## 9. Core Question · Human Tension · Premise

### 9.1 Core Question (S03)

- **R-STRY-01 (MUST)** Episode당 Core Question은 **정확히 하나**다.
- **R-STRY-02 (MUST)** Core Question은 **사람이 결정·판단·걱정하는 질문**이어야 한다. 정의형 질문("~란 무엇인가")은 Core Question이 될 수 없다.

| 좋은 질문 | 나쁜 질문 (설명 주제) |
| --- | --- |
| AI가 내 일을 없앨까? | AI란 무엇인가? |
| 안정적인 직장을 버리고 창업하는 것이 합리적인가? | 창업이란? |
| 사람은 왜 손해를 보고도 손절하지 못할까? | 손실회피란 무엇인가? |
| 더 많은 선택지가 정말 좋은 것일까? | 복리란 무엇인가? |

### 9.2 Human Tension (S04)

지식 문제를 사람이 실제 겪는 문제로 변환한다: **Knowledge Problem → Human Problem**.

| 지식 | Human Tension |
| --- | --- |
| 복리 | 지금 소비할 것인가, 미래를 위해 포기할 것인가 |
| AI 자동화 | 편해지는 대신 내 역할을 잃는가 |
| 추천 알고리즘 | 편리함과 선택 자유의 충돌 |
| 창업 | 안정성과 가능성의 충돌 |

- **R-STRY-03 (MUST)** Human Tension은 "A vs B" 형태로 표현하고, **A와 B가 모두 합리적인 가치**여야 한다.

### 9.3 Narrative Premise (S05)

> **[캐릭터]가 [목표]를 달성하려 하지만 [갈등] 때문에 [선택]해야 한다.**

- **R-STRY-04 (MUST)** Premise에는 캐릭터·목표·갈등·선택 4요소가 모두 있어야 한다. 하나라도 빠지면 S06으로 진행하지 않는다.
- S05 시점의 [캐릭터]는 **역할(예: "자동화를 밀어붙이는 팀 리더")** 로 적는다. 구체 캐릭터 배정은 S07에서 한다 (R-PIPE-06).

---

## 10. Canon 규약

### 10.1 목적

Canon의 목적은 설정을 많이 만드는 것이 아니라 **콘텐츠가 축적될수록 세계와 관계가 일관되게 확장되도록 하는 것**이다.

### 10.2 Canon 계층

| 계층 | 이름 | 내용 | 변경 난이도 |
| --- | --- | --- | --- |
| **C0** | Core Laws | 세계 자체가 따르는 불변 규칙 | 사실상 불변 |
| **C1** | World | 시대, 지역, 사회, 경제, 기술, 제도 | 매우 높음 |
| **C2** | Character | 캐릭터의 성격·능력·배경·목표 (= `CharacterDefinition`) | 높음 |
| **C3** | Relationship | 캐릭터 간 관계와 역사 | 중간 |
| **C4** | Event | 실제로 발생한 사건 | 추가(append)만 |
| **C5** | Episode Context | 특정 Episode에서만 적용되는 상황·대화 | 낮음 |

- **R-CAN-01 (MUST)** 상위 Canon은 하위 Canon보다 우선한다. 하위 계층의 내용이 상위 계층과 충돌하면 하위 계층을 수정한다.
- **R-CAN-02 (MUST)** C5는 해당 Episode 밖으로 전파되지 않는다. 다음 Episode에 영향을 주려면 C4 Event 또는 C3 변경으로 승격 승인을 받아야 한다.

### 10.3 세 가지 진실 (Truth / Knowledge / Belief) 분리

| 상태 | 의미 | 예 |
| --- | --- | --- |
| **World Truth** | 세계에서 실제로 사실인 것 | Warden은 사건의 진범을 알고 있다 |
| **Character Knowledge** | 해당 캐릭터가 알고 있는 것 | Pioneer는 진범을 모른다 |
| **Character Belief** | 캐릭터가 사실이라고 믿는 것 (틀릴 수 있음) | Pioneer는 Scholar가 무언가 숨긴다고 믿는다 |

> 예시의 Pioneer·Scholar·Warden은 **설명용 원형(archetype) 명칭**이며, 공식 Canon 캐릭터 확정을 의미하지 않는다. 공식 캐릭터 목록은 Narrative Runtime이 SSOT다.

- **R-CAN-03 (MUST)** 세 상태를 별도 저장한다. World Truth를 캐릭터 에이전트·Tutors·Play 캐릭터 응답의 컨텍스트에 그대로 넣지 않는다.
- **R-CAN-04 (MUST)** 캐릭터가 정보를 알게 되는 것은 **사건(C4)을 통해서만** 일어난다 (직접 목격, 전달받음, 조사로 발견). 각 Knowledge 항목은 획득 경로(`acquiredVia`, `sourceEventId`)를 가진다.
- **R-CAN-05 (MUST NOT)** 캐릭터가 알 수 없는 정보를 알고 행동하는 **전지적 NPC**를 만들지 않는다. 이는 [VER-Knowledge](#21-검증-규약-verification) 블로킹 항목이다.

### 10.4 Canon 변경 등급과 승인

| 등급 | 해당 변경 | 승인 |
| --- | --- | --- |
| **Minor** | C5 추가, C4 사건 추가(기존 사실과 무충돌), CharacterState 일반 갱신(감정·위치·현재 목표) | Narrative Planner (AI 제안 + 사람 1인 확인) |
| **Major** | 주요 관계 변경(C3), 캐릭터 신규 생성, Subplot 개시·종결, 장기 Story Arc에 영향을 주는 설정 | Canon Keeper 승인 |
| **Critical** | 캐릭터 핵심 성격 변경(C2), 세계 규칙 변경(C0·C1), 과거 사건 변경(Retcon), 주요 캐릭터 사망·영구 퇴장, 세계관 구조를 바꾸는 사건 | Canon Keeper + Editor-in-Chief 공동 승인 |

- **R-CAN-06 (MUST)** AI는 Canon을 **확정·변경하지 않는다.** AI가 할 수 있는 일: 설정 후보 제안, 기존 Canon을 활용한 스토리 생성, 모순 탐지, 관계 변화 후보 제안, 신규 사건 제안.
- **R-CAN-07 (MUST)** Canon 변경은 **append-first**: 기존 설정을 삭제·덮어쓰기보다 새로운 사건으로 변화 이유를 설명한다.
- **R-CAN-08 (MUST)** Retcon(과거 사건 변경)은 Critical 등급이며, 승인 전 [Narrative Impact Graph](#22-narrative-impact-graph)로 영향받는 Beat·Episode 목록을 산출해 함께 제출한다.
- **R-CAN-09 (MUST)** 모든 Canon 변경은 `CanonChangeRequest`로 기록되고 승인자·승인 시각·근거 Episode를 가진다.

### 10.5 Fact / Interpretation / Fiction 경계

| 구분 | 정의 | 예 |
| --- | --- | --- |
| **Fact** | 검증 가능한 현실 사실 | 특정 연구의 수치 |
| **Interpretation** | 사실을 바탕으로 한 해석 | "업무 단위 재편이 직업 소멸보다 먼저 온다" |
| **Fiction** | AMU 세계관 안에서 창작한 사건·설정 | 캐릭터 간 갈등, 가상 회사 |

- **R-CAN-10 (MUST)** 스토리에 포함되는 지식은 재미를 위해 사실을 왜곡하지 않는다.
- **R-CAN-11 (MUST)** 사용자가 세 가지를 혼동할 가능성이 있으면 UI에서 명확히 구분한다 (예: 근거 칩, 출처 링크, "이 이야기는 픽션입니다" 고지). 경제·투자·AI·과학·역사·건강 주제는 **항상** 구분한다.

---

## 11. 캐릭터 규약

### 11.1 캐릭터의 지위

- AMU 캐릭터는 단순 콘텐츠 진행자가 아니다. 세계 안에서 자신의 **욕망과 관점을 가진 독립적인 행위자**다.
- 캐릭터는 **관점의 그릇**이다. 편집자가 결론을 강요하지 않아도 서로 다른 관점이 자연스럽게 제시되게 한다.

### 11.2 Definition / State 분리

| 구분 | 성격 | 포함 | Canon 계층 |
| --- | --- | --- | --- |
| `CharacterDefinition` | 장기·불변에 가까움 | 성격, 가치관, 기본 욕망(Want), 핵심 공포(Fear), 행동 성향, 말투(Voice), 도덕적 경계 | C2 |
| `CharacterState` | 가변 | 현재 목표, 현재 감정, 위치, 최근 사건, 현재 관계 수치, 보유 정보(Knowledge), 믿음(Belief), 비밀, 상처, 미해결 갈등, 등장 통계 | C3–C5 파생 |

- **R-CHR-01 (MUST)** 두 구조를 분리 저장한다. 한 Episode의 행동·감정으로 `CharacterDefinition`을 자동 갱신하지 않는다. (예: 실패 후 일시적으로 위험 회피적인 상태는 State이지 성격 변경이 아니다.)
- **R-CHR-02 (MUST)** Definition 변경은 Critical 등급 Canon 변경이다 ([§10.4](#104-canon-변경-등급과-승인)).

### 11.3 필수 정의 필드 (3층 Persona)

| 계층 | 필드 | 역할 |
| --- | --- | --- |
| **Identity** | 이름, 역할, 소속, 시대·지역, 외형 특징 | 누구인가 |
| **Psychology** | 핵심 성격, 가치관, 강점, 약점, 편견·한계, **Want**(원하는 것), **Need**(실제로 필요한 것), **Fear**(피하고 싶은 것), **Core Belief**(세계를 보는 기본 믿음), **Misbelief**(이야기 속에서 깨질 수 있는 잘못된 믿음), **Stress Response**(압박 시 행동: 공격·회피·통제·무리한 선택 등), Point of View | 왜 그렇게 행동하는가 |
| **Narrative** | Growth Potential(변화 가능 영역), 지식 도메인, Voice(말투 규칙), 도덕적 경계 | 이야기에서 무엇을 할 수 있는가 |

- **R-CHR-03 (MUST)** 신규 캐릭터는 위 필드를 모두 채워야 승인 요청할 수 있다. 공란은 금지하고 "미정"은 `TBD`로 명시한다 (Guest 등급은 [§11.5](#115-캐릭터-등급) 참조).
- **R-CHR-04 (MUST NOT)** Psychology를 임상 진단(성격장애, 질환명 등)으로 정의하지 않는다. AMU가 쓰는 것은 **행동의 인과관계를 설명하는 Narrative Psychology**다.
- **R-CHR-05 (MUST)** 캐릭터의 주장은 그 캐릭터의 **경험 + 욕망 + 관계 + 이해관계**에서 나와야 한다. 특정 주장이나 지식을 전달하기 위한 허수아비(Strawman)로 만들지 않는다.

### 11.4 관점 원형

캐릭터는 다음과 같은 관점 원형을 하나 이상 대표할 수 있다: 낙관주의자, 회의주의자, 실용주의자, 이상주의자, 위험 선호자, 위험 회피자.

- **R-CHR-06 (SHOULD)** 한 Universe 안의 Core 캐릭터들은 관점 원형이 서로 겹치지 않도록 분포시킨다. Perspective Gap은 신규 캐릭터 생성의 정당한 사유다 ([§11.7](#117-신규-캐릭터-생성-조건)).

### 11.5 캐릭터 등급

| 등급 | 정의 | 필수 필드 | Canon 등록 |
| --- | --- | --- | --- |
| **Core** | Universe의 중심 인물. 여러 Arc에 걸쳐 등장 | 전체 | 필수 (Major 승인) |
| **Recurring** | 특정 Arc에서 반복 등장 | 전체 | 필수 (Major 승인) |
| **Guest** | 1–2개 Episode에 등장, 재등장 가능성 있음 | Identity + Want + Fear + Point of View | 필수 (Minor 승인) |
| **Extra** | 이름 없는 배경 인물 (군중, 점원 등) | 없음 | 등록하지 않음 |

- **R-CHR-07 (MUST NOT)** 단일 Episode의 설명을 위해 **이름 있는 일회성 캐릭터(Disposable Character)** 를 대량 생성하지 않는다. 설명 역할만 필요하면 기존 캐릭터를 쓰거나 Extra로 처리한다.
- **R-CHR-08 (MUST)** Guest가 3번째 Episode에 등장하게 되면 Recurring으로 승격 심사를 받고 누락 필드를 채운다 〔초기값〕.

### 11.6 기존 캐릭터 우선 원칙

- **R-CHR-09 (MUST)** 신규 캐릭터 생성 전 Canon을 검색하고, 검색 결과(후보·탈락 사유)를 `CastingPlan`에 기록한다.
- 다음 조건이 맞으면 기존 캐릭터를 우선한다: 주제와 가치관 연결, 현재 Story Arc와 연관, 기존 관계 발전 가능, 새로운 면을 보여줄 수 있음, 최근 과사용 아님.

### 11.7 신규 캐릭터 생성 조건

다음 중 **하나 이상**이 있을 때만 신규 생성을 고려한다.

| 사유 | 설명 |
| --- | --- |
| Perspective Gap | 기존 캐릭터가 표현할 수 없는 관점이 필요하다 |
| World Expansion | 새로운 직업·지역·집단·산업을 세계에 추가해야 한다 |
| Conflict Requirement | 기존 관계만으로 자연스러운 갈등을 만들 수 없다 |
| Long-term Utility | 앞으로 여러 Episode에서 반복 활용할 가능성이 있다 |

- **R-CHR-10 (MUST)** 판단식: **"이 인물을 제거하면 Episode나 향후 Story Arc가 의미 있게 약해지는가?"** — 아니라면 생성하지 않는다. 답과 근거를 `CastingPlan.newCharacterJustification`에 기록한다.

### 11.8 사용 빈도·피로도 관리

각 캐릭터의 `CharacterState.appearance`에 다음을 기록한다: Last Appearance, Recent Appearance Count, Current Arc, Relationship Load, Unresolved Conflict 수, Current Emotional State, Knowledge Domain, **Narrative Fatigue**.

- **Narrative Fatigue 산정 〔초기값〕**: 최근 10개 Tier 2 Episode 중 해당 캐릭터가 **Protagonist 또는 Entry Character로 등장한 횟수**.
- **R-CHR-11 (SHOULD)** Narrative Fatigue ≥ 4 이면 다음 Episode의 Protagonist 후보 우선순위를 낮춘다. (Supporting 역할은 허용)
- **R-CHR-12 (SHOULD)** 동일 캐릭터가 **연속 3개 Episode를 초과해 Protagonist**가 되지 않게 한다. 예외: 명시된 개인 성장 Arc.
- 목적은 인기 캐릭터 억제가 아니라 **세계가 한 인물에게 종속되는 것을 방지**하는 것이다.

### 11.9 안전·윤리 규칙

- **R-CHR-13 (MUST NOT)** 실존 인물을 캐릭터로 만들거나, 실존 인물·실존 기업을 연상시키는 이름·외형으로 사칭하지 않는다. 실존 인물·기업은 Knowledge Claim의 **출처·사례**로만 언급한다.
- **R-CHR-14 (MUST NOT)** 특정 집단(국적·성별·인종·종교·장애 등)을 "틀린 관점"의 대표로 고정하지 않는다. 관점의 옳고 그름을 집단 속성과 결부하지 않는다.
- **R-CHR-15 (MUST)** 캐릭터가 투자·의료·법률 조언을 사용자에게 **직접 권유**하는 형태로 말하지 않는다 ([R-KNOW-06](#18-지식-결합-규약-knowledge-binding)).

---

## 12. 캐스팅 규약

### 12.1 Role First

캐스팅은 **이야기에 필요한 역할 → 적합한 캐릭터** 순서다.

| Narrative Role | 기능 |
| --- | --- |
| **Protagonist** | 문제를 직접 겪는 중심 인물 |
| **Challenger** | 주인공의 생각·행동에 반대하는 인물 |
| **Guide** | 새로운 지식이나 단서를 제공 |
| **Stakeholder** | 결정 결과에 직접 영향을 받음 |
| **Catalyst** | 사건을 시작하게 만듦 |
| **Observer** | 사용자와 비슷한 위치에서 사건을 바라봄 |
| **Bridge** | 현재 Episode를 다음 Episode로 연결 |

- 한 캐릭터가 여러 역할을 겸할 수 있다.
- **R-CAST-01 (MUST)** Tier 2 Episode는 최소 **Protagonist 1 + (Challenger 또는 Stakeholder) 1** 을 가진다.

### 12.2 등장 인원

| 인원 | 규칙 |
| --- | --- |
| 1명 | **금지** (Tier 2). 갈등을 형성할 수 없다 → Tier 1로 전환 검토 |
| 2명 | 최소 단위. 갈등 형성 가능 |
| **2–4명** | **기본 권장.** 대부분의 Episode는 이 범위 |
| 5명 이상 | 다음 중 하나일 때만 허용: 여러 이해관계를 동시에 다뤄야 함 / 기존 관계가 충분히 구축됨 / 장편 Arc의 클라이맥스 / Ensemble Episode. 사유를 Brief에 기록 |

- 인원 산정은 **대사·행동으로 서사에 영향을 주는 이름 있는 캐릭터** 기준이다. Extra는 제외한다.
- **R-CAST-02 (MUST NOT)** 단순 정보 전달을 위해 인물을 추가하지 않는다. 캐릭터가 늘수록 이해 비용이 급격히 증가한다.

### 12.3 Entry Character

- **R-CAST-03 (MUST)** Entry Character는 사용자가 Episode에 진입할 이유를 제공한다. 다음 중 하나를 반드시 수행한다: 문제를 발견한다 / 문제를 겪는다 / 사건을 일으킨다 / 질문을 제기한다 / 위험에 처한다.
- Entry Character는 단순 진행자·해설자가 아니다.

### 12.4 Bridge Character

- **R-CAST-04 (MUST)** Tier 2 Episode는 Bridge Character를 지정한다. Bridge Character는 다음 중 하나를 수행한다: 새로운 정보를 가져온다 / 현재 결과에 영향을 받는다 / 새로운 질문을 던진다 / 다른 지역·캐릭터를 연결한다 / 다음 문제를 발견한다.

### 12.5 Entry = Bridge 여부

| 패턴 | 적합한 경우 | 흐름 |
| --- | --- | --- |
| 동일 | 캐릭터 중심의 개인 성장 Arc | A로 시작 → 사건 경험 → A의 변화 → A의 다음 선택으로 종료 |
| 상이 | 세계 확장 | A Episode → 마지막에 B 등장 → B가 새 문제 발견 → 다음 Episode는 B 중심 (**Baton Pass**) |

- **R-CAST-05 (SHOULD)** Entry ≠ Bridge 패턴을 기본으로 하여 세계를 확장하되, 개인 성장 Arc에서는 동일 패턴을 사용한다.

---

## 13. 캐릭터 에이전트 시뮬레이션 규약 (S08)

### 13.1 원칙

> **작가 AI가 캐릭터를 움직이는 것이 아니라, 캐릭터가 자신의 Persona를 기반으로 행동 후보를 만들고, Narrative Director가 그 행동들을 이야기로 조정한다.**

이는 "좋은 갈등은 서로 다른 선택이 모두 일정 부분 합리적일 때 발생한다"는 원칙(R-CONF-02)을 시스템으로 구현하는 방법이다.

### 13.2 입력 (캐릭터별)

| 입력 | 출처 |
| --- | --- |
| Goal (현재 목표) | CharacterState |
| Want / Need / Fear / Core Belief / Misbelief / Stress Response | CharacterDefinition |
| Relationship (등장 캐릭터별) | Relationship (C3) |
| Knowledge / Belief | CharacterState — **해당 캐릭터 범위만** |
| 현재 상황 | NarrativePlan.worldContext 중 해당 캐릭터가 인지 가능한 부분 |

- **R-SIM-01 (MUST)** 캐릭터 에이전트에게는 **그 캐릭터가 아는 것만** 제공한다 (R-CAN-03). World Truth·다른 캐릭터의 비밀·향후 Plot을 제공하지 않는다.

### 13.3 출력

- **R-SIM-02 (MUST)** 각 캐릭터 에이전트는 "현재 상황에서 가장 자연스럽게 취할 행동" **후보 3개**를 제안하고, 각 후보에 근거(어떤 Want/Fear/Belief/Relationship에서 나왔는지)를 붙인다 〔초기값: 3개〕.
- **R-SIM-03 (MUST)** Narrative Director는 후보들 중 **충돌 가능성이 가장 높고 양쪽 모두 합리적인 조합**을 선택하고, 선택·탈락 사유를 `SimulationLog`에 남긴다.
- **R-SIM-04 (MUST NOT)** Director는 Plot 편의를 위해 어떤 캐릭터의 후보에도 없는 행동을 강제하지 않는다. 필요한 행동이 후보에 없으면 **상황(입력)을 바꿔** 재시뮬레이션하거나 Plot을 수정한다.

### 13.4 도입 단계

- Phase A–B에서는 사람이 Director 역할, AI가 캐릭터별 후보 생성을 수행한다. Phase C부터 Director 보조 에이전트를 도입한다 ([§29](#29-구현-로드맵)).

---

## 14. 갈등 규약

### 14.1 갈등의 원천

목표 충돌, 이해관계 충돌, 가치관 충돌, 정보 비대칭, 위험 인식 차이, 자원 부족, 시간 압박, 과거 관계, 오해, 선택의 비용.

### 14.2 갈등 유형 (공식 목록)

`Goal vs Goal`, `Value vs Value`, `Individual vs System`, `Short-term vs Long-term`, `Safety vs Opportunity`, `Truth vs Belief`, `Loyalty vs Self-interest`, `Efficiency vs Humanity`, `Freedom vs Stability`, `Knowledge vs Uncertainty`

### 14.3 규칙

- **R-CONF-01 (MUST)** Episode당 Primary Conflict는 **정확히 1개**. Secondary Conflict는 0–1개 〔초기값〕.
- **R-CONF-02 (MUST)** 갈등의 양쪽 입장은 모두 **일정 수준의 합리성**을 가져야 한다. "현명한 캐릭터 vs 멍청한 캐릭터" 구조 금지.
- **R-CONF-03 (MUST)** 새로운 갈등은 가능한 한 **기존 관계 위에** 구축한다. 캐스팅 후 먼저 다음을 조회한다: 서로 아는가 / 이전 갈등 / 신뢰 방향 / 빚·약속 / 미해결 사건 / 숨긴 정보.
- **R-CONF-04 (MUST NOT)** 정보 전달을 위해 억지 싸움을 만들지 않는다 (Forced Conflict). 단순히 캐릭터가 싸우는 것은 갈등이 아니다.

---

## 15. 서사 구조 규약

### 15.1 기본형

```text
Cold Open → Trigger → Goal → Conflict → Investigation → Complication
→ Decision → Consequence → Resolution → Bridge
```

5단 뼈대(Hook → Conflict → Investigation → Decision → Consequence)는 위 10 Beats의 요약이다 ([§5.1](#51-단계-매핑표)).

- 모든 Episode가 동일한 형식을 따를 필요는 없다. 단, 아래 MUST는 모든 Tier 2에 적용한다.

### 15.2 Beat별 규칙

| Beat | 사용자 질문 | 규칙 |
| --- | --- | --- |
| **Cold Open** | "왜 이런 일이 벌어졌지?" | **R-STRY-05 (MUST NOT)** 설명으로 시작하지 않는다. 사건·위험·질문·이상 현상·결정 직전·관계 변화 중 하나로 시작 |
| **Trigger / Goal** | "무슨 일이 일어난 거지?" | 캐릭터의 목표가 명확히 드러난다 |
| **Conflict** | "누가 맞는 거지?" | Primary Conflict가 드러난다 |
| **Investigation** | "진짜 답은 무엇이지?" | **R-STRY-06 (SHOULD)** 지식은 주로 이 구간에 등장. 방식: 데이터 발견, 조사, 기록 열람, 실험, 시뮬레이션, 실패, 사용자 선택, 실제 사례 비교 |
| **Complication** | "어, 그게 다가 아니네?" | **R-STRY-07 (SHOULD)** 답을 찾으면 끝나는 구조를 피하고, 기존 생각을 흔드는 새 정보를 넣는다 (예: 생산성↑ 그런데 초급 직원 학습 속도↓) |
| **Decision** | "나라면 어떻게 할까?" | **R-STRY-08 (MUST)** 결정 주체(주인공 / 여러 캐릭터 / 사용자 / 캐릭터+사용자)를 명시. Tier 2는 가능한 한 사용자가 판단에 참여 |
| **Consequence** | "그래서 무슨 일이 벌어졌지?" | **R-STRY-09 (MUST)** 결정에는 결과가 있다. Immediate(현재 Episode) / Deferred(후속 Episode)를 구분해 기록 |
| **Resolution** | — | 현재 Episode의 Core Question에 **답 또는 관점 전환**을 제공 |
| **Bridge** | "다음은?" | Bridge Character가 Baton Pass 후보를 남김 |

### 15.3 지식-서사 결합 원칙

- **R-STRY-10 (MUST NOT)** "설명할 주제 결정 → 캐릭터에게 설명시킴" 구조를 금지한다.
- **R-STRY-11 (MUST)** "캐릭터의 문제 발생 → 해결 과정에서 지식이 필요해짐" 구조를 사용한다.

| 금지 예 | 권장 예 |
| --- | --- |
| 캐릭터 A와 B가 복리에 대해 이야기한다 | A가 단기 고수익 투자를 선택하려 하고 B는 장기 전략을 주장한다. 두 선택의 결과를 시간축으로 비교하는 과정에서 복리가 자연스럽게 등장한다 |

### 15.4 종료 규칙

- **R-STRY-12 (MUST)** 모든 Tier 2 Episode는 Core Question에 대해 **그 Episode 안에서 최소한의 만족(답, 부분 답, 관점 전환 중 하나)** 을 제공한다.
- **R-STRY-13 (MUST NOT)** 다음 편 유도만을 위해 모든 이야기를 미완성으로 남기지 않는다 (Endless Cliffhanger).
- **R-STRY-14 (SHOULD)** 강한 Cliffhanger(핵심 질문 미해결 + 위기 상태 종료)는 한 Story Arc에서 **연속 2회를 넘지 않는다** 〔초기값〕.

---

## 16. 서브플롯 규약

### 16.1 계층

```text
Story Arc
  ├─ Main Plot
  └─ Subplots
       ├─ Character Subplot        (개인의 변화·성장)
       ├─ Relationship Subplot     (신뢰·갈등·비밀·배신)
       └─ World/Knowledge Subplot  (더 큰 문제, 다음 주제로 확장)
  → Episode → Scene
```

### 16.2 생명주기

```text
seed → active → pressure → collision → payoff → aftermath
                     ↘ deferred (보류)
                     ↘ abandoned (폐기 — Major 승인 필요)
```

### 16.3 규칙

- **R-SUB-01 (MUST)** 모든 Subplot은 `introducedAt`(개시 Episode), `payoffHorizon`(예: 3–8 Episode), `currentState`, `trigger`, `possiblePayoffs[]`를 가진다.
- **R-SUB-02 (MUST)** Episode 설계 시 **새 Subplot을 만들기 전에** 기존 미해결 Subplot 중 이번 사건과 자연스럽게 충돌할 수 있는 것을 먼저 검색하고 결과를 기록한다.
- **R-SUB-03 (SHOULD)** 한 Story Arc의 `active`~`collision` 상태 Subplot은 **동시에 3개 이하** 〔초기값〕.
- **R-SUB-04 (MUST)** `payoffHorizon`을 초과한 Subplot은 다음 Planning에서 **payoff / deferred(사유와 새 horizon) / abandoned** 중 하나로 처리한다. 방치 금지.
- **R-SUB-05 (MUST)** 모든 Setup(떡밥)은 `setupId`를 가지며, Payoff Beat는 해당 `setupId`를 참조한다.

---

## 17. Beat Sheet 규약 (S11)

- **R-STRY-15 (MUST)** Scene Writer는 Beat Sheet 없이 원고를 쓰지 않는다.
- 각 Beat(또는 Scene)는 최소 다음 필드를 가진다.

| 필드 | 의미 |
| --- | --- |
| `beatType` | 10 Beats 중 무엇인가 |
| `pov` | 누구의 관점인가 |
| `goal` | 이 장면에서 원하는 것 |
| `opposition` | 방해하는 것 |
| `knowledgeRevealed[]` | 드러나는 정보 (KnowledgeClaim ID / Canon 정보) |
| `emotionalDelta` | 감정이 어떻게 바뀌는가 |
| `relationshipDelta[]` | 관계가 어떻게 변하는가 |
| `setupIds[]` / `payoffIds[]` | 만드는 / 회수하는 떡밥 |
| `interactionId` | 사용자 개입 여부 |
| `exitHook` | 다음 장면을 왜 봐야 하는가 |
| `dependsOn[]` / `affects[]` | Narrative Impact Graph 참조 |

---

## 18. 지식 결합 규약 (Knowledge Binding)

AMU가 Sherpa류 스토리 엔진과 구별되는 단계다. Episode Planning이 끝났다고 바로 Scene Writing으로 가지 않는다.

- **R-KNOW-01 (MUST)** Intelligence의 정보를 `KnowledgeClaim` 단위로 쪼개고, 각 Claim을 사용할 Beat에 매핑한다.
- **R-KNOW-02 (MUST)** 모든 KnowledgeClaim은 `type(fact | interpretation)`, `statement`, `uncertainty`, `sources[]`, `retrievedAt/freshness`를 가진다. Fiction은 KnowledgeClaim이 아니며 Canon에 저장한다.
- **R-KNOW-03 (MUST)** `type = fact` 인 Claim은 **1개 이상의 검증 가능한 출처**를 가진다. 출처 없는 수치는 원고에 사용할 수 없다.
- **R-KNOW-04 (MUST)** 캐릭터 대사로 전달되는 사실도 KnowledgeClaim을 참조해야 한다. 캐릭터의 **Belief**로서 틀린 말을 하는 것은 허용되지만, 그 경우 Episode 안에서 교정되거나 UI에서 사실과 구분되어야 한다.
- **R-KNOW-05 (MUST)** 시의성 있는 Claim은 게시 시점에 freshness를 재확인한다 〔초기값: 수집 후 90일 경과 시 재확인〕.
- **R-KNOW-06 (MUST)** 투자·금융·건강·법률 주제의 시뮬레이션·결과 화면에는 **"교육·정보 목적이며 개인 조언이 아님"** 고지와 가정(수익률·기간·세금 미반영 등)을 표시한다.
- **R-KNOW-07 (MUST)** 시뮬레이터·계산기는 **계산식과 가정을 사용자가 확인할 수 있게** 공개하고, 대표 입력값에 대한 기대 출력 테스트를 가진다.

---

## 19. 인터랙션 규약

### 19.1 존재 이유

인터랙션은 장식이 아니라 **몰입 장치**다.

- **R-INT-01 (MUST)** 모든 인터랙션은 다음 중 최소 하나를 수행한다: 이해를 높인다 / 몰입을 높인다 / 선택에 참여시킨다 / 개인 결과를 만든다 / 다른 관점을 경험시킨다 / 문제 해결에 참여시킨다 / 이야기 결과에 영향을 준다. `Interaction.purpose`에 기록한다.
- **R-INT-02 (MUST NOT)** 의미 없는 클릭·드래그·탭만 요구하는 인터랙션을 만들지 않는다.
- **R-INT-03 (MUST)** 인터랙션은 Beat Sheet 이후 각 Beat에서 **"사용자가 직접 참여하면 이해나 몰입이 크게 증가하는가?"** 를 물어 배치한다. 스토리에 억지로 끼워 넣지 않는다.

### 19.2 Activation Event

- **R-INT-04 (MUST)** Tier 1·2 콘텐츠는 **정확히 하나의 Activation Event**를 정의한다. 이것이 "유의미한 경험" 판정 기준이며 ICR의 분모가 된다 ([§26.3](#263-핵심-지표-icr)).

| 콘텐츠 | Activation Event 예 |
| --- | --- |
| 투자 시뮬레이션 | 자신의 조건을 입력하고 결과 확인 |
| AI 사진 프롬프트 | Before/After 프롬프트 3개 비교 완료 |
| 생산성 | 자신의 시간 배분 결과 확인 |
| 마케팅 전략 | 자신의 사업 유형 선택 후 전략 확인 |
| Canon Episode | Decision Beat에서 선택 완료 |

### 19.3 인터랙션 유형 (공식 목록)

선택, 드래그, 입력, 데이터 조작, 비교(Before/After), 시뮬레이션, 증거 확인, 캐릭터 질문, 시간 이동, 관점 전환, 결과 예측, 퀴즈/테스트, 생성.

### 19.4 Choice & Consequence

- **R-INT-05 (MUST)** 선택형 인터랙션에서 선택지는 **모두 장단점**을 가진다. "정답 하나 + 명백한 오답" 구조는 퀴즈(`type=quiz`)로 분류하며 Decision Beat에 사용하지 않는다.
- **R-INT-06 (SHOULD)** 선택 결과는 **Choice → Immediate Result → Delayed Consequence** 구조를 사용한다.
- **R-INT-07 (SHOULD)** Decision Beat의 선택지는 **2–3개** 〔초기값〕. (원천 문서의 교훈: 선택지가 많아지면 아무도 누르지 않는다)
- **R-INT-08 (MUST)** 사용자 선택에 따른 분기는 **해당 사용자의 세션 결과**다. 공식 Canon의 다음 Episode는 편집팀이 결정한 공식 경로(`canonicalBranch`)를 따른다. 사용자 선택 집계는 Proof·Build Log·다음 Episode 기획의 입력으로 사용할 수 있다.

### 19.5 UX 원칙

- **R-INT-09 (MUST)** 모바일 우선. 핵심 인터랙션은 한 손 조작으로 가능해야 한다.
- **R-INT-10 (SHOULD)** 핵심 입력은 최소화한다 (원천 사례: 옵션 8개 → 핵심 입력 3개). 첫 인터랙션은 Cold Open 이후 **첫 화면 스크롤 1–2회 안**에 등장한다 〔초기값〕.
- **R-INT-11 (MUST)** 인터랙션이 동작하지 않는 환경(JS 실패, 접근성 도구)에서도 핵심 지식과 결론은 텍스트로 읽을 수 있어야 한다.

---

## 20. 연속성 규약 (Continuity)

### 20.1 Entry / Exit State

- **R-CONT-01 (MUST)** 모든 Tier 2 Episode는 시작 전 **Entry State**, 종료 시 **Exit State**를 정의한다.

| Entry State | Exit State |
| --- | --- |
| 등장 캐릭터 상태 | Character State Changes |
| 캐릭터 관계 | Relationship Changes |
| 미해결 사건 | New / Resolved Conflict |
| 현재 위치 | Location Change |
| Story Arc 상태 | New Knowledge (캐릭터별) |
| 이전 Episode 영향 | Item / Resource Change |
| — | Canon Event, Unresolved Question, Next Episode Hook |

- **R-CONT-02 (MUST)** Episode N의 승인된 Exit State가 Episode N+1(같은 Arc)의 Entry State가 된다. Entry State는 Narrative Runtime의 현재 상태에서 **조회**하며 임의 작성하지 않는다.

### 20.2 Narrative Baton Pass

| 유형 | 의미 |
| --- | --- |
| Character Pass | 다른 캐릭터에게 중심이 이동 |
| Problem Pass | 현재 문제의 결과가 새로운 문제를 만듦 |
| Location Pass | 사건이 다른 지역으로 확장 |
| Knowledge Pass | 발견된 사실이 다른 주제로 이어짐 |
| Relationship Pass | 관계 변화가 새로운 이야기를 만듦 |

- **R-CONT-03 (SHOULD)** 매 Episode마다 최소 하나의 Baton Pass 후보를 기록한다.
- 목적: 이번 편 주인공을 다음 편에서도 억지로 쓰는 문제를 피하면서, 같은 세계관 안에서 A → B → C 캐릭터·주제로 자연스럽게 확장한다.
- Story Arc 확장은 카테고리 이동이 아니라 **이야기의 인과관계가 이어지는 것**이다 (예: AI → 일자리 → 창업 → 경제 → 투자 → 인간관계 → 심리).

### 20.3 Next Episode Seed

- **R-CONT-04 (MUST)** Episode 종료 시 다음 편을 확정하지 않는다. 대신 **Next Episode Seed를 최대 3개** 저장한다.
- **R-CONT-05 (MUST)** 각 Seed는 Baton Pass 유형, 연결 캐릭터, 예상 Core Question, 관련 Subplot을 가진다.

### 20.4 Intelligence ↔ Story 양방향 루프

```text
Intelligence → Episode → Story Seed → Intelligence Validation → Next Episode
```

- **R-CONT-06 (MUST)** Seed는 Intelligence System에서 다음 기준으로 재평가된다: 사용자 관심, 검색 수요, 최근 트렌드, 기존 콘텐츠 성과, 캐릭터 관심도, Story Arc 가치, Relationship 가능성, Expansion 가능성.
- **R-CONT-07 (MUST NOT)** Narrative Continuity만으로 제작을 결정하지 않는다. 세계관이 재미있다는 이유로 수요 없는 콘텐츠를 만들지 않는다 (Story Dictated Content).

---

## 21. 검증 규약 (Verification)

### 21.1 원칙

- **R-VER-01 (MUST)** 원고를 생성한 모델·프롬프트와 **다른 검증 단계**가 검증한다. "네가 만든 이야기의 문제점을 찾아줘"식 자기검증을 유일한 검증으로 쓰지 않는다.
- **R-VER-02 (SHOULD)** 검증기는 원고에서 **구조화된 표현(등장인물·사건·캐릭터별 지식·관계 변화·인용된 사실)** 을 먼저 추출한 뒤 Narrative Runtime의 상태와 **비교**한다.
- **R-VER-03 (MUST NOT)** 검증 점수가 낮다는 이유로 Canon을 자동 수정하지 않는다. 검증기는 **수정안**만 제안한다.

### 21.2 검증 항목

| Verifier | 검사 | 심각도 기본값 |
| --- | --- | --- |
| **Canon** | 기존 설정(C0–C4)과 모순되는가 | Blocking |
| **Persona** | 캐릭터답게 행동했는가 (Definition·Stress Response와 정합) | Blocking(명백한 이탈) / Major |
| **Knowledge Scope** | 캐릭터가 알 수 없는 정보를 알고 있지 않은가 | Blocking |
| **Causality** | 결과의 원인이 충분한가 | Major |
| **Relationship** | 관계 변화가 갑작스럽지 않은가 | Major |
| **Setup/Payoff** | 떡밥이 사라지거나 중복되지 않았는가, horizon 초과 여부 | Major |
| **Intelligence (Fact)** | 사실·출처가 왜곡되지 않았는가, Fact/Interpretation/Fiction 구분 | Blocking |
| **Interaction** | 클릭을 위한 클릭이 아닌가, Activation Event 존재 | Major |
| **Editorial** | pacing, tension, 반복, 설명 과다, 감정선, 다음 행동 욕구 | Minor–Major |
| **Safety** | 실존 인물 사칭, 차별, 투자·의료 직접 권유 | Blocking |

- **R-VER-04 (MUST)** Blocking 항목이 하나라도 있으면 G3를 통과할 수 없다. Major는 해결하거나 사유를 기록해 승인자가 수용해야 한다.
- **R-VER-05 (MUST)** 검증 결과는 `VerificationReport`로 저장하고 위반 항목에 **규칙 ID**를 인용한다.

---

## 22. Narrative Impact Graph

"수정하면 뒤만 다시 계산"을 구현하는 의존성 구조다. 그래프 DB 없이 명시적 참조로 구현한다.

- **R-VER-06 (MUST)** Beat/Scene, CanonEvent, CharacterState 변경, KnowledgeClaim 사이의 참조를 `dependsOn[]`, `affects[]`, `setupIds[]`, `payoffIds[]`, `characterStateRefs[]`, `canonEventRefs[]`, `knowledgeClaimRefs[]`로 저장한다.
- **R-VER-07 (MUST)** 어떤 노드가 수정·삭제되면 그 노드에 의존하는 하위 노드만 `invalidated`로 표시하고, Planner는 **해당 영역만** 재설계한다. 전체 재생성 금지.
- **R-VER-08 (MUST)** 게시된(`published`) Episode가 invalidated 되면 자동 수정하지 않고 Canon Keeper에게 **정정/Retcon 판단**을 요청한다.

```text
예) EP-012 / SC-4 "Pioneer가 Scholar의 비밀을 알게 된다" 삭제
  → Pioneer.knows(secret-x) 무효
  → EP-014/SC-2, EP-016/SC-7, EP-018 relationship-change 만 invalidated
```

---

## 23. 채널·배포 규약

### 23.1 채널 역할

```text
Social (짧고 강한 호기심) → Magazine (깊고 재미있는 경험)
→ Tutors / Gen Studio / Play (직접 행동) → Magazine (새로운 콘텐츠 발견)
```

전략: **Snackable Discovery + Deep Interactive Experience**.

### 23.2 Short-form (Drama / Teaser)

- **R-DIST-01 (MUST)** Short-form은 전체 지식의 요약 채널이 아니다. 주 역할은 **Discovery와 Curiosity**이며 사건·갈등·질문·반전·결과·미스터리·관계 변화 중 일부에 집중한다 (서사 5단 중 주로 Hook·Conflict).
- **R-DIST-02 (MUST)** Short-form 자체에서도 **최소한의 만족감**을 제공한다. 클릭하지 않으면 아무것도 얻을 수 없는 낚시형 구성 금지.

### 23.3 Magazine

- Magazine은 단순 저장소가 아니라 AMU 경험의 **시작점이자 복귀점**이며 Investigation → Decision → Consequence를 깊게 제공한다.
- **R-DIST-03 (MUST)** Tier 2 Episode 페이지는 Story Arc 내 이전/다음 Episode와 등장 캐릭터 페이지로의 경로를 제공한다.

### 23.4 플랫폼별 톤 (가이드)

| 채널 | 적합한 형태 |
| --- | --- |
| Threads | 제작 중 문제·착각·실패 서사, 짧은 질문형 Hook |
| Instagram / Reels / Shorts | 시각적 변화 (Idea → Wireframe → Generation → Prototype → Final), Before/After, 슬라이더 움직임 |
| LinkedIn | "인터랙티브 미디어를 설계하며 배운 것" — 업계 인사이트·지표 관점 |

---

## 24. 서비스 확장·CTA 규약

### 24.1 확장 매핑

| 사용자 의도 | 연결 서비스 |
| --- | --- |
| 더 깊게 이해하거나 질문하고 싶음 | **Tutors** |
| 직접 무언가 만들고 싶음 | **Gen Studio** |
| 이야기·상황을 직접 체험하고 싶음 | **Play** |
| 검증된 결과물·도구·상품을 실제로 활용하고 싶음 | **Store** |

### 24.2 규칙

- **R-CTA-01 (MUST)** 서비스 이동을 강제하지 않는다. 사용자의 현재 의도와 콘텐츠 맥락에 따라 연결한다.
- **R-CTA-02 (MUST)** **Primary CTA는 1개.** Secondary CTA는 최대 1개.
- **R-CTA-03 (MUST)** CTA는 콘텐츠의 Activation Event **이후**에 노출한다. 경험 전에 서비스 CTA를 노출하지 않는다 (저장·공유 등 관계 CTA는 예외).
- **R-CTA-04 (SHOULD)** CTA 우선순위 기본값: `저장 → 팔로우 → 다음 Episode → 관련 Experience → 질문(Tutors) → 만들기(Gen Studio) → 플레이(Play)`. 콘텐츠 목적과 Revenue Ladder 목표 단계에 따라 선택한다.
- **R-CTA-05 (SHOULD)** 서비스 확장 후 다시 Magazine 콘텐츠로 이어지는 복귀 경로를 제공한다.
- **R-CTA-06 (MUST NOT)** 모든 콘텐츠를 Gen Studio로 보내지 않는다. 콘텐츠 유형별 이상 경로(참고):

| 유형 | 경로 |
| --- | --- |
| AI 이미지 제작 | 소비 → 비교 → 만들어보고 싶음 → Gen Studio → 결과 저장/공유 → 관련 Magazine |
| 경제·투자 | 읽기 → 데이터 인터랙션 → 저장 → 관련 콘텐츠 → Tutors 질문 → Magazine 복귀 |
| 심리·성장 | 읽기 → 테스트 → 개인 결과 → 저장 → 관련 콘텐츠 → 재방문 |
| 캐릭터·스토리 | 스토리 → 캐릭터 관심 → 대화 → Play → 다음 스토리 → Magazine 복귀 |

---

## 25. Build Log 규약

완성된 Interactive Product의 제작 과정을 공개하는 정규 시리즈. 가칭 **AMU Build Log** (대안: AMU Making, Behind the Interaction, How We Made This) — 명칭 확정은 [부록 A](#부록-a-결정-필요-사항-open-decisions).

### 25.1 목적

- 단순 홍보가 아니라 **AMU가 새로운 콘텐츠 경험을 계속 발명하는 곳**임을 결과물로 증명하는 브랜드 자산 (말로 포지셔닝하지 않고 결과물로 포지셔닝).
- 완성 콘텐츠가 **소비 욕구**를, Build Log가 **제작 욕구**를 잡는다 → Reader + Learner + Creator 동시 유입.

### 25.2 규칙

- **R-BLD-01 (SHOULD)** Build Log 한 편은 **가장 흥미로운 제작 이야기 하나**만 다룬다. 편마다 주제를 순환한다: UX 실패 → AI 생성 과정 → 데이터 분석 → 인터랙션 아이디어 → 실제 사용자 반응.
- **R-BLD-02 (SHOULD)** 실패 공개를 적극 활용한다 (예: 3D 인터랙션 → 사용자는 스크롤만 함 → 드래그 한 번으로 변경).
- **R-BLD-03 (MUST)** 서비스 언급은 "이 장면은 Gen Studio로 만들었습니다" 수준의 **사실 서술**로 한다. "지금 사용해보세요" 식 판매 문구는 사용자가 직접 해보고 싶어지는 지점에서만 CTA로 제공한다.
- **R-BLD-04 (MUST NOT)** 미공개 Canon(향후 Plot, 캐릭터 비밀), 사용자 개인 데이터, 내부 비용·계약·보안 정보, 원시 사용자 데이터를 공개하지 않는다. Proof에 쓰는 데이터는 집계·익명화한다.
- **R-BLD-05 (SHOULD)** Build Log는 Growth Experiment 기록과 연결한다: `Goal → Hypothesis → Launch → Measure(Stop/Play/Gain/Want/Continue) → Learn → Improve(v2)`.

---

## 26. 측정 규약

### 26.1 원칙

- **R-MET-01 (MUST)** 조회수 단일 KPI 금지 (R-GOAL-02).
- **R-MET-02 (MUST)** 초기(Phase A–E)에는 AI가 리텐션·재미를 **예측**하지 않는다. 실제 사용자 행동을 **측정**한다 (PR-10).

### 26.2 측정 퍼널

| 단계 | 질문 | 대표 지표 (이벤트) |
| --- | --- | --- |
| **Attraction** | 발견하고 멈췄는가 | Social CTR, 영상 retention, Magazine 진입 |
| **Experience** | 실제로 경험을 시작했는가 | `interactive_start`, 첫 인터랙션 참여 |
| **Completion** | 유의미한 지점까지 경험했는가 | **Activation Event 도달**, Decision 참여, Scene 도달률 |
| **Relationship** | 관계가 생겼는가 | 저장, 팔로우(주제/캐릭터), 공유, 이어읽기 |
| **Continuation** | 다음 행동이 발생했는가 | Tutors 질문, Gen Studio 생성, Play 진입, 관련 콘텐츠 |
| **Return** | 다시 돌아왔는가 | 7일 / 28일 Magazine Return |

### 26.3 핵심 지표: ICR

```text
ICR (Interactive Continuation Rate) =
  Activation Event에 도달한 사용자 중,
  동일 세션 또는 이후 7일 이내에
  { 저장, 팔로우, 공유, 관련/다음 콘텐츠 진입, Tutors 질문, Gen Studio 생성, Play 진입 }
  중 하나 이상을 수행한 사용자 수
  ÷
  Activation Event에 도달한 사용자 수
```

- 분모의 "유의미한 경험"은 **Activation Event 도달**로 정의한다 (R-INT-04). 〔초기값: 7일 윈도〕
- **R-MET-03 (MUST)** 모든 Tier 1·2 콘텐츠는 게시 전 Activation Event와 ICR 분자 이벤트의 **트래킹 구현을 완료**한다.
- **장기 지표**: 7d / 28d Magazine Return, AMU 전사 지표 MARR (정의는 AMU Measurement Plan 문서).

### 26.4 Narrative Performance Data (Tier 2 추가)

Scene별 이탈, 특정 장면 재방문, Interaction 참여율, Decision 분포, 캐릭터 대화(Tutors) 진입, 캐릭터 팔로우, 다음 Episode 진입률.

- **R-MET-04 (SHOULD)** 데이터가 충분히 쌓이면 다음 설계 변수와 retention의 관계를 분석한다: Hook 유형, Conflict 유형, 캐릭터 조합, Episode 길이, Scene 밀도, Interaction 위치, Subplot 유형, Bridge 유형. 이는 AMU 자체 데이터 플라이휠이며, 예측 모델 도입은 Phase F 이후.
- **R-MET-05 (MUST)** 모든 이벤트는 `contentId`, `tier`, `episodeId`, `arcId`, `sceneId`(해당 시), `characterIds[]`(해당 시)를 포함한다. 이벤트 스키마는 [스키마 문서 §8](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md#8-측정)을 따른다.

---

## 27. 금지 패턴 (Anti-patterns)

| ID | 이름 | 설명 | 관련 규칙 |
| --- | --- | --- | --- |
| **AP-01** | Topic Costume | 평범한 글에 캐릭터만 씌우는 것 | R-STRY-10, R-UNIT-05 |
| **AP-02** | Lore Inflation | 실제 콘텐츠 가치보다 세계관 설정이 커지는 것 | R-PIPE-10 |
| **AP-03** | Character Inflation | Episode마다 새로운 캐릭터를 만드는 것 | R-CHR-07, R-CHR-10 |
| **AP-04** | Forced Conflict | 정보 전달을 위해 억지 싸움을 만드는 것 | R-CONF-04 |
| **AP-05** | Endless Cliffhanger | 다음 편 유도를 위해 모든 이야기를 미완성으로 남기는 것 | R-STRY-13 |
| **AP-06** | Canon Drift | Episode마다 캐릭터 성격·세계 규칙이 바뀌는 것 | R-CHR-01, R-CAN-06 |
| **AP-07** | Story Dictated Content | 세계관을 이어가기 위해 가치 없는 주제를 제작하는 것 | R-CONT-07 |
| **AP-08** | Omniscient NPC | 캐릭터가 알 수 없는 정보를 알고 행동하는 것 | R-CAN-05 |
| **AP-09** | Strawman Character | 틀린 관점을 대변하기 위한 허수아비 캐릭터 | R-CHR-05, R-CONF-02 |
| **AP-10** | Decorative Interaction | 의미 없는 클릭·드래그 | R-INT-02 |
| **AP-11** | Product Ad Disguise | 콘텐츠를 가장한 제품 광고, 경험 전 서비스 CTA | R-GOAL-05, R-CTA-03 |
| **AP-12** | Wow-only | Attention만 있고 Value·Continuity가 없는 콘텐츠 | R-GOAL-03, R-PIPE-03 |
| **AP-13** | One-Prompt Pipeline | 기획~원고를 거대 프롬프트 하나로 생성 | R-PIPE-05 |
| **AP-14** | Orphan Setup | 회수되지 않고 방치된 떡밥 | R-SUB-04 |
| **AP-15** | Fact Bending | 재미를 위한 사실 왜곡, 출처 없는 수치 | R-CAN-10, R-KNOW-03 |

---

## 28. 거버넌스: 역할과 권한

### 28.1 역할

| 역할 | 책임 |
| --- | --- |
| **Intelligence Owner** | ContentCandidate 선정, Seed 재검증 |
| **Narrative Planner** | S03–S16 수행(사람 또는 AI 보조), Production Brief 작성 |
| **Canon Keeper** | Canon 원장 관리, Major/Critical 변경 승인, Retcon 판단 |
| **Fact Checker** | KnowledgeClaim 출처·정확성 검증 |
| **Editor** | G2 Brief 승인, Editorial Review, G4 게시 승인 |
| **Editor-in-Chief** | Critical Canon 변경 공동 승인, 이 문서의 개정 승인 |
| **Growth / Analytics** | 측정 구현, 성과 분석, Build Log·Proof 데이터 제공 |

> 초기에는 한 사람이 여러 역할을 겸할 수 있다. 단, **Critical Canon 변경과 G4 게시 승인은 AI가 대행할 수 없다.**

### 28.2 AI 에이전트 권한 매트릭스

| 행위 | AI 권한 |
| --- | --- |
| ContentCandidate·EpisodeCandidate 생성, G1 점수 제안 | 허용 (사람 확인) |
| NarrativePlan·CastingPlan·ContinuityPlan·BeatSheet 초안 | 허용 |
| 캐릭터 행동 후보 생성 (Character Agent) | 허용 |
| 신규 캐릭터 **후보** 생성 | 허용 (승인 전까지 `proposed`) |
| 원고·인터랙션 초안 생성 | 허용 |
| VerificationReport 생성 | 허용 (Generator와 분리) |
| CanonChangeRequest 생성 | 허용 |
| Canon 확정·변경, CharacterDefinition 수정 | **금지** |
| G2·G3·G4·G5 최종 승인 | **금지** |
| 게시·배포 실행 | **금지** (승인된 작업의 실행 자동화는 가능) |

### 28.3 문서 개정

- **R-GOV-04 (MUST)** 이 문서의 MUST/MUST NOT 규칙 변경은 Editor-in-Chief 승인과 **minor 이상 버전 증가**가 필요하다. 〔초기값〕 수치 조정은 patch 버전으로 처리하고 변경 이력에 근거 데이터를 기록한다.

---

## 29. 구현 로드맵

| Phase | 구현 | 목표 검증 |
| --- | --- | --- |
| **A** | CharacterDefinition / CharacterState / Knowledge·Belief 분리, Canon C0–C5 원장, CanonChangeRequest | 캐릭터·Canon이 일관되게 저장·조회되는가 |
| **B** | Narrative Planner(S03–S16) + Casting + Production Brief, G1–G2 | 사람이 Brief 기반으로 Episode를 제작할 수 있는가 |
| **C** | Character Agent Simulation (S08) | 캐릭터 기반 갈등이 Forced Conflict보다 자연스러운가 |
| **D** | Subplot / Beat / Scene Planner, Narrative Impact Graph | 떡밥·연속성이 장기적으로 유지되는가 |
| **E** | Canon + Persona + Knowledge + Causality Verifier (G3) | 모순·사실 오류가 게시 전에 잡히는가 |
| **F** | Performance Learning (설계 변수 × retention 분석) | 어떤 서사 설계가 실제로 Return을 만드는가 |
| 이후 | Audio / Video 자동화, Localization, 모델 파인튜닝 | Phase F 결과로 효과 입증 후 |

- **R-GOV-05 (MUST)** 가장 먼저 증명할 가설: **"캐릭터 + Intelligence + Story가 일반 콘텐츠보다 더 높은 몰입·관계·재방문을 만드는가?"** — Phase B 완료 후 Tier 1 vs Tier 2의 ICR·Return 비교로 검증한다.

### 29.1 제작 UI 구조 (Gen Studio)

한 화면에서 모든 것을 생성하지 않는다. 사용자가 **어느 단계에서 무엇을 결정하는지** 명확해야 한다.

| 화면 | 흐름 |
| --- | --- |
| **Character Studio** | Seed → Persona → Psychology → Relationships → Voice → Canon Fit → 승인 |
| **Story Planner** | Core Question → Human Tension → Casting → Main Plot → Subplots → Story Arc → Episode Seeds |
| **Episode Studio** | Episode Plan → Beats → Scenes → Knowledge → Interaction → Draft → Review → Publish |

---

## 30. Production Brief (요약 템플릿)

모든 Tier 1·2 콘텐츠는 제작 착수 전 Production Brief를 작성하고 G2 승인을 받는다. 전체 필드는 [스키마 문서 §6](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md#6-production-brief)가 SSOT다.

```yaml
# Production Brief — 요약
episodeId:            # EP-xxxx
tier:                 # 1 | 2
intelligenceSource:   # ContentCandidate ID
universe / storyArc:  # Tier 2
coreQuestion:
humanTension:         # "A vs B"
narrativePremise:     # [캐릭터]가 [목표]… [갈등]… [선택]
casting:
  entryCharacter:
  protagonist:
  supporting: []
  bridgeCharacter:
  reuseOrNew:         # 재사용/신규 + 신규 사유
conflict:
  primary:            # 공식 유형 중 1
  secondary:          # 0..1
knowledgeMap:         # KnowledgeClaim IDs ↔ Beat
beats:                # BeatSheet ID
interactions: []
activationEvent:
decisionPoint:
consequence:
  immediate:
  deferred:
continuity:
  entryState:         # Runtime 조회 스냅샷 ID
  exitState:
  canonChanges: []    # 없으면 []
  batonPass:
  nextEpisodeSeeds: []  # ≤ 3
distribution:
  shortFormHook:
  magazineExperience:
  buildLogAngle:      # 선택
cta:
  primary:
  secondary:          # ≤ 1
  revenueLadderStage:
fiveE: { entertain, engage, enlighten, empower, extend }
avac:  { attention, value, agency, continuity }   # 각 0–5
successMetric:        # ICR 목표, Return 목표
```

---

## 31. 최종 제작 원칙

**단순히 설명하지 않는다. 사건으로 만든다.**
**단순히 읽게 하지 않는다. 참여하게 한다.**
**단순히 정답을 알려주지 않는다. 판단하게 한다.**
**단순히 지식을 전달하지 않는다. 경험하게 한다.**
**단순히 캐릭터를 등장시키지 않는다. 관계를 축적한다.**
**단순히 한 편을 만들지 않는다. 다음 이야기가 가능한 세계를 만든다.**

시스템 역할 요약:

- **Intelligence**가 무엇을 말할지 결정한다.
- **Narrative Planning**이 어떻게 경험하게 할지 결정한다.
- **Character System**이 누가 그 경험을 살아갈지 결정한다.
- **Canon**이 그 경험이 세계에 무엇을 남기는지 결정한다.
- **Performance Data**가 다음에 무엇을 만들지 다시 결정한다.

```text
Intelligence → Story → Character → Experience → Consequence
→ Canon → Audience Response → Intelligence
```

---

## 부록 A. 결정 필요 사항 (Open Decisions)

| # | 항목 | 현재 상태 | 결정 주체 |
| --- | --- | --- | --- |
| D-01 | 문서 소유자 및 역할별 담당자 지정 (§28.1) | 미정 | 대표 |
| D-02 | 공식 AMU Universe 목록과 Core 캐릭터 확정 (예시의 Pioneer·Scholar·Warden이 공식 캐릭터인지 여부 포함) | 미정 | Canon Keeper |
| D-03 | Build Log 시리즈 명칭 (AMU Build Log / AMU Making / Behind the Interaction / How We Made This) | 후보 | Editor-in-Chief |
| D-04 | 브랜드 약속 문구 ("읽고 끝나지 않는다" 등) | 후보 | 대표 |
| D-05 | 〔초기값〕 수치 (G1 임계값, AVAC 기준, Fatigue, Subplot 수, ICR 윈도 등) 첫 조정 시점 | 운영 데이터 필요 | Growth |
| D-06 | MARR·Revenue Ladder 정의 문서 위치 링크 | 이 저장소에 없음 | Growth |
| D-07 | 사용자 개인 Universe의 공개·공유 정책 (§6.1 R-GOV-03) | 미정 | 대표 |
| D-08 | Narrative Runtime의 저장소 구현 (MongoDB 컬렉션 설계) | 스키마 문서 초안만 존재 | Engineering |

## 부록 B. 참고 자료 (검증 필요)

원천 대화에 인용된 외부 자료이며, **이 문서의 규칙은 아래 수치에 의존하지 않는다.** 대외 콘텐츠·Build Log에 인용하려면 Fact Checker가 원문을 확인한 뒤 KnowledgeClaim으로 등록한다.

| 자료 | 원천 대화에서의 인용 내용 | 상태 |
| --- | --- | --- |
| Reuters Institute, Digital News Report 2026 | 소셜·비디오 네트워크가 뉴스 사이트·앱을 처음 앞섬, AI 챗봇 뉴스 이용 7%→10%(한국 14%), 챗봇 이용 행태(추가 질문 42%, 요약 34%, 쉽게 설명 30%) | 미검증 |
| Pocket FM "Sherpa" 소개 페이지 | Planner / Feedback / Storyboard Agent, Narrative World Model | 미검증 |
| "From Personas to Plot" (arXiv, MAGNET / ATLAS) | 캐릭터 에이전트 기반 장편 생성, scene 단위 world representation 검증 | 미검증 |
| Pocket FM 관련 SNS·인터뷰 수치 | 55만+ 크리에이터, 1억 달러 매출 작품, 생산량 1200% 증가 등 | 미검증 (SNS 2차 인용 포함) |

## 부록 C. 변경 이력

| 버전 | 날짜 | 내용 |
| --- | --- | --- |
| 1.0.0-draft | 2026-09-28 | 원천 문서 2종 분석을 바탕으로 최초 작성. 파이프라인 통합, Tier 체계·Activation Event·ICR 정의·Canon 변경 등급·캐릭터 등급·규칙 ID 체계 신설 |
