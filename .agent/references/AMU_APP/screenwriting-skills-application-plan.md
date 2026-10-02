# screenwriting-skills → AMU 콘텐츠 생성 파이프라인 적용 방안

| 항목 | 값 |
| --- | --- |
| 작성 | 2026-10-02 |
| 상태 | `proposed` — 분석·제안 문서. 코드·SSOT·원장 변경 없음 |
| 분석 대상 | `.agent/temp/screenwriting-skills-main` (26개 스킬, 91개 파일, 약 22,000줄. MIT + 인용문 별도 저작권) |
| 대조한 AMU 문서·코드 | `AMU_APP/ssot/interactive-content/AMU_INTERACTIVE_CONTENT_SSOT.md`(SSOT-IC-001), `…_SCHEMAS.md`<br>`NODE_APP/signature_interaction_and_interactive_motion/20260929_065533__motion-story-runtime-design-and-implementation-plan.md`<br>`node-app/src/types/ai/videoGeneration.ts`, `libs/server-utils/video/*`, `components/template/gen-studio/VideoStudioEditor.tsx`<br>`node-app/src/types/card-news/agent.ts`, `libs/server-utils/magazine/editorialStory.ts` |

---

## 0. 결론

1. **이 스킬 묶음은 AMU SSOT의 "빈 칸"을 채우는 작법 엔진으로 쓰기에 아주 잘 맞는다.** SSOT-IC-001은 무엇을 만들고 무엇을 검증할지(산출물·게이트·규칙 ID)는 촘촘히 정했다. 하지만 **어떻게 잘 쓰는지**는 S11 Beat Sheet 필드 목록과 S17 "Writing / Production" 한 줄에서 멈춘다. 스킬은 정확히 그 구간을 다룬다. 장면 설계 5단계, 대사 진단 13문항, 갈등의 4가지 운동, 정보 관리 4도구, act out 8유형, 서스펜스 4단계가 여기에 해당한다.
2. **개념은 이미 상당 부분 겹친다. 그래서 "새 체계 도입"이 아니라 "기존 SSOT 단계에 작법 카드를 꽂는 일"이 된다.** 예를 들면 다음과 같다.
   - `CharacterDefinition.psychology.want / need / fear / misbelief` = Lisa Cron의 "제3의 궤도(욕망 vs 잘못된 믿음)"
   - `Human Tension "A vs B", 양쪽 모두 합리적` = McKee의 "위기 = 진정한 딜레마(두 선 중 하나)"
   - `setupIds / payoffIds`, `exitHook`, `Consequence.deferred` = 시리즈 스킬의 떡밥 회수, act out, "기장식 단위(记账式单元)"

   번역 비용이 작다.
3. **숏폼은 스킬이 명시적으로 다루지 않는 매체다.** README에 "세로형 숏드라마는 배포 논리일 뿐 증류할 극작법이 없어 계획하지 않는다"고 적혀 있다. 다만 같은 README가 **새 매체를 추가하는 공식 방법**도 정해 두었다. 방법은 "새 스킬 1개 + 그 안의 매체 경계표 + `sw-workflow` 진입표 1줄"이고, 일반 계층은 고치지 않는다. AMU는 이 규약을 그대로 따라 **AMU 전용 매체 스킬 3개**를 만들면 된다(§5).
4. **영상 생성이 가장 큰 효과를 본다.** 현재 Gen Studio 영상은 "한 문장 프롬프트 → 4–10초 클립 1개"다(`VideoStudioEditor.tsx:267`). 그 사이에 **Beat → Scene → Shot List** 계층을 넣고 스킬의 장면 작법을 Shot 단위로 내리면, 30–45초 숏드라마를 capability 범위 안의 클립 N개로 설계할 수 있다(§4.1). 특히 "사건은 화면 밖, 반응은 화면 안"(Ozu)과 "2–4초 visual sentence"(Fleabag)는 **AI 영상 모델의 약점(긴 동작, 다인물 상호작용, 일관성)을 피해 가는 작법**이라는 점에서 실익이 크다.
5. **런타임에 스킬 원문을 넣지 않는다.** 원문은 중국어이고, `reference.md`의 인용문은 MIT 대상이 아니다(NOTICE). MIT가 덮는 것은 원칙, 체크리스트, 워크플로, 진입표, 경계표다. 그래서 **AMU 소유의 한국어 Rule Card(`R-CRAFT-*`)로 증류해** 단계별 프롬프트와 Verifier에 넣는다. Claude Code 운영자 작업(사람 + 에이전트 집필)에는 원본 스킬을 그대로 설치해 써도 된다(§6).

---

## 1. 스킬 분석

### 1.1 구성 — 4계층 26개 스킬

| 계층 | 스킬 | AMU 관련도 |
| --- | --- | --- |
| 1 일반 극작법 | `sw-workflow`(진행 관리, story-bible), `sw-premise-theme`, `sw-story-structure`, `sw-character-conflict`, `sw-dialogue`, `sw-scene-craft`, `sw-format-adaptation`, `sw-truby-anatomy`, `sw-genre-anatomy` | **높음** — 매체 무관 원리. 그대로 증류 대상 |
| 2 매체(시리즈) | `sw-series-structure`, `sw-series-engine-bible`, `sw-writers-room`, `sw-sitcom-comedy` | **높음** — Universe / Story Arc / Episode 연속성에 직접 대응 |
| 2 매체(무대·희곡) | `sw-chinese-opera-banqiang(-cases)`, `sw-chinese-opera-qupai(-cases)` | 낮음 — 제외 권장(8개 파일, 약 6,000줄) |
| 3 전통·업계 | `sw-chinese-series-practice`(3분/15분/집말 서스펜스 법칙), `sw-korean-french-screenwriting`, `sw-japanese-screenwriting`, `sw-american-case-studies`, `sw-industry-business` | 중간 — 서스펜스 법칙, 한국식 "감정 먼저", 일본식 "작은 소재" 일부만 사용 |
| 4 원전 코퍼스 | `chekhov-dramaturgy`, `ozu-screenplay-style`, `succession-series-writing`, `sw-series-case-studies` | 중간 — 톤 레퍼런스. 특히 Ozu "사건 화면 밖"은 영상 생성에 유용 |

### 1.2 설계상 특징 (AMU가 차용할 만한 "구조")

| 특징 | 내용 | AMU 차용 포인트 |
| --- | --- | --- |
| **단계 표 + 산출물 + 권고 통과 기준** | `sw-workflow`가 단계별로 "어느 스킬 / 무엇을 산출 / 무엇을 통과 기준으로" 지정한다(단계 0–7, 시리즈 S0–S7) | SSOT §7.1 S01–S24 표와 형태가 같다. 단계마다 "참조 Rule Card" 열만 추가하면 된다 |
| **모든 스킬 = 원칙 + 진단 체크리스트 + 워크플로** | 구조 13문, 인물 14문, 대사 13문, 장면 13문, 시리즈 33문 | SSOT §21 Verifier 항목에 그대로 붙일 수 있다(§3.3) |
| **story-bible.md** | 프로젝트 상태를 1.5만 자 안에 "결정 + 결정 로그 + 다음 단계"로 유지한다 | AMU에서는 `ProductionBrief`(진행 중 상태) + Narrative Runtime이 이 역할을 맡는다 |
| **매체 경계표** | 각 매체 스킬 첫머리에 "어떤 층이 다른 매체로 옮겨지는가" 표를 둔다(예: Chekhov "패턴은 옮기고 단위와 체제는 옮기지 않는다") | 숏폼 / 인터랙티브 / 영상 Shot 매체를 추가할 때 같은 양식을 쓴다 |
| **출력 언어 = 질문 언어, 용어는 원어에 고정** | `sw-workflow/terms.md`가 개념을 영어 원어(logline, act out, beat sheet…)에 고정한다 | AMU 용어집(SSOT §2)과 병합해 한국어 출력용 용어표를 만든다 |
| **check-skills.py** | frontmatter, 설명 길이(≤1024), "Use when" 절, 링크 무결성을 검사한다 | AMU 자체 스킬에도 그대로 적용한다 |
| **"subagent에 단계를 나눠 주지 말 것"** | 전제, 구조, 인물은 한 덩어리라서 나누면 모순이 생긴다. 병렬은 "읽기 전용 진단"에만 쓴다 | SSOT R-PIPE-05(하나의 거대 프롬프트 금지)와 **긴장 관계**다. 해소 방법은 §3.4 |

### 1.3 스킬이 다루지 않는 것 (AMU가 직접 채워야 함)

- **세로형 숏폼 / 숏드라마**: 의도적으로 제외됐다. 3초 훅, 루프, 플랫폼 알고리즘 같은 "배포 논리"가 빠져 있다.
- **인터랙티브 / 분기 서사**: 사용자 선택, Activation Event, 선택 결과 분기가 없다.
- **지식 결합**: 사실 / 해석 / 픽션 경계(SSOT §10.5, §18)가 없다. 반대로 "情节要奇(플롯은 기발해야)" 같은 원칙은 R-CAN-10(사실 왜곡 금지)과 충돌할 수 있어서 **사실 쪽이 이긴다**는 우선순위를 명시해야 한다.
- **AI 영상 / 이미지 생성 제약**: 클립 길이, 레퍼런스 이미지 수, 캐릭터 일관성 같은 제약이 없다.

---

## 2. AMU 현황 요약 (적용 대상)

| 프로세스 | 현재 상태 | 작법 측면의 빈 곳 |
| --- | --- | --- |
| **인터랙티브 아티클 / Canon Episode** (SSOT-IC-001) | S01–S24 파이프라인, G1–G5 게이트, Tier 0/1/2, 10 Beats, Beat Sheet 필드, Verifier 10종이 문서로 확정됨(draft). 구현 로드맵은 Phase A–F | S11 Beat Sheet는 필드만 있고 **장면이 "작동하는지" 판정할 기준이 없다**. S17 집필에는 대사·장면 규칙이 없다. Verifier "Editorial" 항목은 "pacing, tension…" 한 줄뿐이다 |
| **숏폼 (Teaser / Short-form Drama)** | SSOT §23.2 규칙 2개(R-DIST-01: Discovery·Curiosity, R-DIST-02: 최소 만족). editorial-story v2에서 `surfaces.short`(9:16, 기본 45초) 계획(MS-22 AI 보조 Beat 초안은 JUDGE 단계) | 숏폼 **구성 문법이 전혀 없다**. 몇 초에 무엇을, 어디서 끊는지, 무엇을 공개하지 않는지 정해진 게 없다 |
| **Story Mode / Motion Story** | `editorialStory.ts`의 결정론 변환(beat 6종 `hook/context/problem/insight/evidence/outro`, durationMs 5200/6200) | 이 6종은 **설명 축(expository) 문법**이다. "Story 축"용 극적 비트(전환·반전·결정)가 없다 |
| **Gen Studio 영상 생성** | `VideoGenerationRequest` 단일 프롬프트 → provider별 4–10초 클립(google 4/6/8s, xai 5/10s, zai 5/10s). image-to-video와 reference 1–3장 지원 | **장면·숏 계획 계층이 없다**. 여러 클립을 하나의 이야기로 묶는 계약이 없다 |
| **카드뉴스 에이전트** | semantic cards 3–10장(`cover / body / closing`), source `wp_article / operator_instruction / interactive_session` | 카드 배열에 극적 진행(훅 유형, 상승, 결말 유형) 기준이 없다 |

---

## 3. 공통 적용 — SSOT 파이프라인 단계별 매핑

### 3.1 단계 × 스킬 매핑표

SSOT §7.1 표 오른쪽에 "작법 카드" 열을 붙이는 형태다. 각 카드는 §6의 `R-CRAFT-*`로 증류한다.

| SSOT 단계 | 산출물 | 붙일 스킬 (섹션) | 핵심 작법 (증류 대상) |
| --- | --- | --- | --- |
| S02 G1 Worthiness | `EpisodeCandidate` | `sw-industry-business` §2 PROBLEM 7요소, `sw-premise-theme` §10 戏核 | "戏核(극의 핵): 빼면 극이 성립하지 않는가" 테스트를 Narrative Potential 채점 근거로 쓴다 |
| S03 Core Question | `coreQuestion` | `sw-premise-theme` §2 주제 통제 아이디어(가치 + 원인), `sw-series-engine-bible` §11 | Episode 질문은 결정형(R-STRY-02)으로 쓴다. **Story Arc 질문은 "과정 질문"**("How will X keep doing Y in a world that Z?")으로 분리한다 |
| S04 Human Tension | `humanTension` | `sw-premise-theme` §2 사상 vs 반사상, `sw-series-engine-bible` §2 "주제는 한 단어가 아니라 논쟁 가능한 대립 명제" | A vs B 양쪽에 **같은 화력**을 준다. 반대쪽이 바보면 승리에 가치가 없다(R-CONF-02 강화) |
| S05 Premise | `premise` | `sw-premise-theme` §1·§3·§6 (Egri 전제, Cron 제3의 궤도, logline 공식) | Premise 4요소에 **"잘못된 믿음(misbelief)이 깨지는 순간"**을 결말로 고정한다 |
| S07 Casting | `CastingPlan` | `sw-character-conflict` §2–§4, `sw-series-engine-bible` §3 인물망 | 역할 우선(PR-4) 위에 "대립의 통일(무엇이 둘을 묶어 떠날 수 없게 하는가)", "상대에게 칼 한 자루를", "같은 유형 두 명 금지" 체크를 얹는다 |
| S08 Agent Simulation | `SimulationLog` | `sw-character-conflict` §5 "인물은 주관적으로 가장 작은 보수적 행동을 먼저 한다 → 세계가 기대와 다르게 반응(gap)" | 후보 3개를 생성할 때 **"최소 보수 행동 → gap → 더 큰 위험의 2차 행동"** 순서로 상승시킨다. Director의 선택 기준과 정합한다 |
| S09 Conflict | `conflicts` | `sw-character-conflict` §5 정지형·도약형·상승형·예고, 過渡 | Primary Conflict가 "상승형"인지 판정하고, 도약 지점에는 과도기 장면을 보충한다 |
| S10 Plot & Subplot | `plot`, Subplot | `sw-story-structure` §7 서브플롯 4관계(모순 / 반향 / 복선 / 얽힘), `sw-series-engine-bible` §13 Story landmines, §18 기장식 단위 | 서브플롯마다 Main Plot과의 관계 유형을 기록한다(없으면 "분할된 이야기"로 Verifier Major). 인물별 **지뢰(landmine) 1개 + 폭발 Episode 번호** |
| S11 Beat Sheet | `BeatSheet` | `sw-story-structure` §3 BS2 비율, §6 起承转合, `sw-scene-craft` §2 장면 5단계, `sw-series-structure` §3 act out | 10 Beats마다 **가치 극성(+/−) 시작·끝**을 기록한다(같으면 설명 장면이니 삭제). 전환점은 "행동 또는 폭로"만 허용한다 |
| S12 Knowledge Binding | `KnowledgeClaim[]` | `sw-dialogue` §2 "설명은 탄약처럼", `sw-story-structure` §7 "실패마다 주인공이 하나를 더 안다" | Investigation 구간에서 실패 1회 = 새 Claim 1개. 실패 후 새 정보가 없으면 두 장면을 병합한다 |
| S13 Interaction | `Interaction[]` | `sw-story-structure` §8 위기 = 정적 딜레마, `sw-series-structure` §3.5 정보 관리 4도구 | Decision 선택지는 "두 선 또는 두 악"으로 만든다(R-INT-05와 일치). **증거 확인 인터랙션 = dramatic irony 장치**(§3.2) |
| S14 Continuity | `ContinuityPlan` | `sw-series-engine-bible` §18 기장식 단위, §19 "같은 능력의 n번째 사용법"으로 구간 나누기, §10 엔진 실압 측정 | Next Episode Seed마다 **"N화가 한 일 → M화에서 누가 갚는다"**를 구체 번호로 적는다 |
| S16 Production Brief | `ProductionBrief` | `sw-workflow` story-bible "결정 + 결정 로그" | Brief에 `decisionLog[]`를 둔다. 결정을 바꿀 때 사유를 남긴다 |
| S17 Writing | Draft | `sw-scene-craft` §10 한 장면 쓰기, `sw-dialogue`, `sw-format-adaptation` Fountain 계약 | 장면 대본은 **Fountain 텍스트(한국어는 강제 기호 `.` `@` `>`)**로 `Scene.content.script`에 저장한다 → 렌더·검증 파서 재사용 |
| S18 Verification | `VerificationReport` | 5종 진단 체크리스트 | §3.3 |
| S22 Measure | `EpisodeMetrics` | `sw-series-structure` §3.2–3.3 cliffhanger 10유형·act out 8유형 | R-MET-04 "설계 변수 × retention" 분석의 **변수 사전**으로 쓴다(Hook 유형 = 오프닝 8법, Bridge 유형 = act out 8유형) |

### 3.2 인터랙티브 아티클에 특히 유용한 작법 6가지

1. **정보 관리 4도구(Oberg: dramatic irony / surprise / mystery / suspense)를 인터랙션 설계 언어로 쓴다.**
   SSOT는 이미 World Truth / Character Knowledge / Belief를 분리 저장한다(R-CAN-03). 이걸 "**Who knows what when**" 표로 바꾸면 인터랙션 유형이 정해진다.
   - 사용자가 `증거 확인` 인터랙션으로 캐릭터가 모르는 사실을 먼저 알게 된다 → **dramatic irony**. 사용자는 Decision Beat에서 "알고도 고르는" 위치에 선다.
   - 사용자와 캐릭터가 함께 모른다 → mystery. Investigation 구간의 `데이터 조작` / `실험`.
   - Scene 스키마에 `infoTool` 필드를 추가하면 R-MET-04 분석 변수도 생긴다.
2. **Decision Beat = McKee의 "위기"**: 정적 순간, 진정한 딜레마, 화면 밖으로 넘기지 않는다. 그래서 Decision 인터랙션 화면은 **스크롤·자동재생을 멈추는 정지 프레임**으로 설계하는 게 맞다. 선택지 2–3개(R-INT-07)는 각각 "무엇을 잃는가"를 함께 보여준다(Landau의 스테이크 검증: "아무것도 안 하는 것"이 가능한 선택이면 스테이크가 부족하다).
3. **"한 번의 실패 = 한 개의 새 지식"**(魏明伦 4단 고소): Investigation 구간 인터랙션마다 사용자가 얻는 KnowledgeClaim이 1개씩 늘어야 한다. 늘지 않는 인터랙션은 AP-10 Decorative Interaction이다.
4. **Cold Open 오프닝 8법**(陆军: 충돌법 / 포진법 / 의외법 / 당두일봉법 …): R-STRY-05 "설명으로 시작 금지"에 **구체적 대안 목록**을 준다. Brief의 `entertainmentDriver`와 같이 `openingType`으로 기록한다.
5. **결말 8법 + "결말은 잘못된 믿음이 깨지는 순간"**: R-STRY-12 "최소 만족(답 / 부분 답 / 관점 전환)"을 결말 유형으로 구체화한다. 관점 전환 = 점정식(点睛式), 부분 답 = 연신식(延伸式) 등으로 대응시킨다.
6. **Ozu "진짜 말은 외부인에게만 한다", Fleabag "카메라에 대고 말하기"**: Observer / Bridge 캐릭터가 **사용자에게 직접 말하는 장치**(Tutors 대화로 이어지는 출구)의 근거와 사용 규칙이 된다. Fleabag 규칙: 카메라에는 농담만, 사람에게는 진실을. 단 한 번 카메라를 피하는 순간이 정서적 정점이다. 남용하면 장치가 죽는다.

### 3.3 Verifier(S18) ← 진단 체크리스트 매핑

SSOT R-VER-01("다른 검증 단계가 검증한다")은 스킬 `sw-workflow` §6의 "단계 6 다각도 읽기 전용 진단 agent"와 같은 구조다.

| SSOT Verifier | 붙일 체크리스트 | 자동화 가능한 신호 |
| --- | --- | --- |
| Causality (Major) | 구조 진단 13문 중 5·6·8(장면 가치 전환, gap, 우연 금지) | Scene `valueAtStake.open == close`인 장면 수 |
| Persona (Blocking/Major) | 인물 진단 14문 중 5·8(도약형 갈등, 성격에 맞지 않는 행동) | `CharacterDefinition.voice.avoid` 위반 표현 |
| Relationship (Major) | 인물 진단 5(과도기 누락) | `relationshipDelta`가 과도기 장면 없이 2단계 이상 이동 |
| Editorial (Minor–Major) | 대사 13문, 장면 13문 | "이름 가리기" 테스트(LLM 판정), 상대가 이미 아는 사실을 말하는 대사, 반복 비트 3회 이상, 대사 꼬리 핵심어 |
| Setup/Payoff (Major) | 시리즈 진단 ㉜(기장식 단위) | payoff 없는 setupId, M화 번호가 없는 seed |
| Interaction (Major) | 구조 진단 8(위기가 정적 딜레마인가) | 선택지 중 "명백한 오답"이 있으면 quiz로 재분류 |

### 3.4 스킬 원칙과 SSOT의 충돌 해소

| 충돌 | 스킬 쪽 | SSOT 쪽 | 해소 |
| --- | --- | --- | --- |
| 단계 분할 | 전제·구조·인물은 한 맥락에서(subagent 분할 금지) | 단계별 개별 호출, 입력은 직전 산출물로 제한(R-PIPE-05) | 단계별 호출은 유지하고, **매 호출에 "결정 다이제스트"(Brief의 확정 필드 + decisionLog 요약)를 공통 입력**으로 넣는다. 스킬이 걱정한 것은 "맥락 상실"이지 "호출 횟수"가 아니다 |
| 플롯의 기발함 | "情节要奇"(기발해야), 반전 | 사실 왜곡 금지(R-CAN-10), 출처 없는 수치 금지 | 기발함은 **Fiction 계층(인물 선택·관계·사건)**에서만 허용한다. KnowledgeClaim은 잠근다 |
| 클리프행어 | 집말 큰 관자(대형 미끼) | 강한 클리프행어 연속 2회 이하(R-STRY-14), 끝없는 클리프행어 금지 | 스킬 자체도 "스트리밍 일괄 공개 시 이유를 바꿔라 → **갚아야 할 빚을 남겨라**"로 같은 결론을 낸다. AMU는 기장식 단위를 기본으로 쓴다 |
| 분량 지표 | BS2 110쪽 페이지 수 | 모바일 스크롤, 초 단위 | **비율만 옮기고 쪽수는 버린다**(스킬 자신도 "BS2의 백분율은 비율이지 법률이 아니다"라고 한다) |

---

## 4. 프로세스별 적용 방법

### 4.1 영상 생성 — Beat → Scene → **Shot List** 계층 신설

**문제.** provider capability가 클립당 4–10초인데 Gen Studio는 "한 문장 → 한 클립"만 만든다. 이야기 단위(30–45초)와 생성 단위(4–10초) 사이를 잇는 계약이 없다.

**제안 계약 (초안, wire 형태):**

```ts
// Scene(SSOT 스키마 §4.3) 아래에 붙는 영상 전용 하위 계층
interface ShotList {
  schemaVersion: "amu-shot-list.v1";
  sceneId: string;                   // EP-xxxx/SC-n
  targetProvider: "google" | "xai" | "zai";
  targetModel: string;               // VIDEO_CAPABILITY_MATRIX 항목
  aspectRatio: "9:16" | "16:9" | "1:1";
  shots: Shot[];
  estimatedCoins: number;            // shots 합계. estimateVideoGenerationCoins 재사용
}

interface Shot {
  shotId: string;
  order: number;
  durationSec: number;               // capability.durations 중 하나만 허용 (4/6/8 또는 5/10)
  beatRole: "hook" | "escalation" | "turn" | "decision" | "reaction" | "resolution" | "bridge";
  valueDelta: { value: string; from: "+" | "-"; to: "+" | "-" } | null; // 장면 가치 전환 (McKee)
  visualAction: string;              // 보이는 행동만. 대사 금지 (sw-scene-craft §4 "동작 우선")
  offscreenEvent?: string;           // Ozu: 큰 사건은 화면 밖으로, 이 Shot은 반응만 보여 준다
  characterRefIds: string[];         // CHR- → referenceKit 이미지 (image/reference-to-video)
  cameraPreset?: string;             // motion-story §4.2 토큰 재사용 (camera.push 등)
  narrationLine?: string;            // 대사·내레이션은 TTS 트랙으로 분리 (audio 미지원 모델 대응)
  captionLine?: string;              // DOM 자막 (텍스트는 DOM이 권위)
  exitHook?: string;                 // 다음 Shot을 볼 이유 (act out 8유형 중)
}
```

**작법을 Shot 단위로 내리는 규칙 (AI 영상 제약 대응):**

| 작법 (출처) | Shot 규칙 | AI 영상에서의 이점 |
| --- | --- | --- |
| 사건은 화면 밖, 반응은 화면 안 (`ozu-screenplay-style` §2-1) | 가장 큰 사건 1개(사고, 고백, 결렬)는 `offscreenEvent`로 빼고, 그 앞뒤 Shot은 **인물 반응·사물**로 구성한다 | 다인물 액션·물리 상호작용(생성 실패율이 가장 높음)을 피한다. 비용도 줄어든다 |
| Visual sentence 2–4초 (`sw-sitcom-comedy` §7-5, Fleabag) | 트라우마·감정은 대사로 반복하지 않고 **한 장면 이미지**로 넣는다 | 4–6초 클립 1개와 정확히 맞는다 |
| 동작 > 대사, "라디오 쇼가 된다" (`sw-series-structure` §6) | `visualAction`에는 동사만 쓴다. 대사는 `narrationLine`으로 분리한다 | 립싱크·음성 미지원 모델(xai, zai)에서도 성립한다 |
| 장면 5단계 want / obstacle / escalation×3 / decision / resolution (`sw-series-structure` §6) | 30–45초 = Shot 5–8개. escalation Shot 최소 3개 | Shot 수가 capability와 길이에서 결정론적으로 나온다 |
| 도구·회향물 (`sw-scene-craft` §7, Ozu "회향하는 물건") | 핵심 소품 1개를 첫 Shot과 마지막 Shot에 반복한다 | 클립 간 시각적 연속성을 확보한다(캐릭터 일관성 부담 완화) |
| 진입은 늦게, 퇴장은 빨리 (`sw-scene-craft` §3) | 각 Shot은 동작 중간에서 시작하고, 갈등이 해소되기 전에 자른다 | 짧은 클립 길이를 오히려 장점으로 쓴다 |

**구현 경로 (기존 자산 재사용):**
1. Shot List 생성은 운영자 / internal owner의 LLM 호출로 한다. `billAIUsageOrThrow` → AIR-600 trace. JSON schema로 검증하고, capability 밖의 `durationSec`는 거부한다(`validateVideoGenerationRequest` 재사용).
2. Shot마다 `VideoGenerationRequest`를 만들어 `videoGenerationJobQueue`에 일괄 enqueue한다. `clientRequestId = storyId/shotId`로 멱등성을 유지한다.
3. 조립(클립 연결 + 내레이션 + DOM 자막 burn-in)은 motion-story 계획 P-단계의 render worker(Chromium + ffmpeg)에 합류한다. **새 렌더 엔진은 필요 없다.**
4. Gen Studio UI는 "한 문장" 모드를 유지하고, 그 옆에 **"이야기 모드"**(Core Question → 30초 Shot List 미리보기 → 총 코인 견적 → 확인)를 추가한다. 이용자 대면 과금은 별도 계약이 필요하다(motion-story §1, defer 판정 존중).

### 4.2 숏폼 생성 — AMU 숏폼 문법 (스킬 원리 → 초 단위 환산)

SSOT 기준: 숏폼은 Discovery 채널이다. 서사 5단 중 Hook·Conflict에 집중하고(R-DIST-01), 최소 만족을 준다(R-DIST-02). 스킬에서 다음 원리를 가져와 **초 단위**로 환산한다.

| 원리 (출처) | 원래 단위 | 숏폼 환산 (30–45초, 9:16) |
| --- | --- | --- |
| 개장 3분 안에 붙잡기 (`sw-chinese-series-practice` 5.1) | 45분 집의 3분(약 7%) | **0–2초**: 오프닝 8법 중 하나. 설명으로 시작 금지 |
| 15분마다 작은 매듭, 구간 경계 = 정보·권력 이동 (같은 곳, 5.1 단계 경계 검증) | 15분 구간 | **6–10초마다 1회 전환**. 컷 경계는 반드시 "누가 무엇을 알게 됨 / 누가 우위를 잃음"이어야 한다(타이머로 자른 가짜 경계 금지) |
| 큰 동작을 잘게 나눠 단계마다 작은 서스펜스 (지연 5기법 #3) | 장면 | 하나의 행동(문 열기, 메시지 보내기)을 Shot 2–3개로 쪼갠다 |
| 위기 = 정적 딜레마 (`sw-story-structure` §8) | 클라이맥스 직전 | **25–35초**: Decision 직전에 정지한다. "당신이라면?" 캡션 |
| **티저는 극적 질문에 답하지 않는다. 플래시포워드는 클라이맥스 전·중에서만** (`sw-series-structure` 2.4, Oberg) | teaser | Decision의 **결과를 공개하지 않는다** → Magazine 본편으로 연결. R-DIST-01과 정확히 일치한다 |
| 최소 만족 + 갚을 빚 (기장식 단위, 일괄 공개 시 집말 규칙) | 집말 | **35–45초**: 부분 답 또는 관점 전환 1문장(R-DIST-02 충족) + "결과는 본편에서" 대신 **구체적 빚**("민서가 고른 쪽의 대가는 3화에서") |
| 장르는 관객과의 약속, 혁신은 5–10% (`sw-korean-french-screenwriting` 8) | 장르 | 시리즈 숏폼은 포맷(훅 유형, 길이, 캡션 위치)을 고정하고 내용만 바꾼다 |
| 웃음 밀도: 페이지당 2–4개, 첫 장면부터 센다 (`sw-sitcom-comedy` 3.6) | 페이지 | 코미디 숏폼은 **10초당 1개 이상**. 스마일 / 처클 / 래프 구분 |

**표준 템플릿 "숏드라마 30초" (예시):**

```text
[0–2s]   COLD OPEN  — 오프닝 유형: 의외법. 결정 직전의 손(이미지). 캡션: 질문 1문장
[2–8s]   TRIGGER    — Entry Character의 want가 보이는 행동 1개
[8–14s]  ESCALATION 1 — 반대 입장(Challenger)의 합리적 이유 1개 (정보 이동)
[14–20s] ESCALATION 2 — 숨겨진 대가 노출 (권력 이동)   ← Complication
[20–26s] DECISION   — 정지 프레임, 두 선택지와 각각 잃는 것
[26–30s] BRIDGE     — 관점 전환 1문장 + 갚을 빚 1줄 → Magazine 본편
```

**산출 위치:** editorial-story v2 `surfaces.short`와 SSOT Content Asset Set "Teaser / Short-form Drama"가 동일 Beat를 재사용하도록 한다(motion-story 불변식 1: 표면별 카피를 따로 만들지 않는다). 숏폼은 **본편 BeatSheet의 Cold Open~Decision 부분집합**이고, 별도 기획을 하지 않는다(PR-2 Experience First 준수).

### 4.3 Story Mode / editorialStory — "설명 축"과 "이야기 축" 분리

- 현행 beat 6종(`hook / context / problem / insight / evidence / outro`)은 설명 축이다. 그대로 유지한다.
- motion-story 계획이 채택한 "Story 축 / 설명 축" 두 문법 중 **Story 축 beat role**은 SSOT 10 Beats 부분집합으로 정의한다(`cold_open / trigger / conflict / complication / decision / consequence / bridge`).
- AI 보조 Beat 초안(MS-22)의 프롬프트에 다음 3개 Rule Card를 붙인다.
  1. 모든 Scene에 가치 극성 전환이 있어야 한다(없으면 설명 장면으로 보고 병합 또는 삭제).
  2. 전환은 행동 또는 폭로로만 일어난다.
  3. Beat `body`는 원문 의미를 넘지 않는다(기존 규칙 유지, 사실이 우선).

### 4.4 카드뉴스 에이전트 — 起承转合 + 오프닝 / 결말 유형

`cover / body / closing` 3–10장 구조에 다음을 붙인다(스키마 변경 없이 프롬프트·검증만).

| 카드 역할 | 작법 | 검증 |
| --- | --- | --- |
| cover | 오프닝 8법 중 하나, "설명으로 시작 금지" | headline이 정의형("~란?")이면 경고 |
| body (2–8장) | 承 = 단계적 상승. **카드 1장 = 새 정보 1개**(실패 1회 = 지식 1개 원리) | 앞 카드와 같은 정보를 반복하면 경고 |
| body 끝 | 转 = 기존 생각을 흔드는 Complication(R-STRY-07) | 반전 카드 존재 여부 |
| closing | 결말 8법 중 점정식 / 연신식 + CTA는 Activation 이후에만(R-CTA-03) | 판매 CTA가 첫 카드에 있으면 차단 |

---

## 5. AMU 전용 매체 스킬 3종 (스킬 규약대로 추가)

README의 확장 규약("새 스킬 1개 + 매체 경계표 + `sw-workflow` 진입표 1줄, 일반 계층 수정 금지")을 그대로 따른다. 운영자가 Claude Code에서 집필할 때 쓰고, 런타임 Rule Card(§6)의 원천이 된다.

| 스킬 (가칭) | 범위 | 매체 경계표 요지 | `sw-workflow` 진입표 1줄 |
| --- | --- | --- | --- |
| `amu-interactive-episode` | Tier 1 / 2 인터랙티브 아티클·Canon Episode. SSOT S03–S18을 단계 표로 다시 적고, 단계마다 사용할 sw-* 스킬과 섹션을 지정 | 구조·인물·대사·장면 층은 **옮긴다**. 페이지·막 단위는 **옮기지 않는다**(스크롤 / Scene). 클리프행어는 **기장식 단위로 대체**. 사실 계층은 스킬보다 SSOT가 우선 | "AMU 인터랙티브 콘텐츠 → `amu-interactive-episode` 단계 표 사용, 장편 단계 표 미사용" |
| `amu-shortform-drama` | 9:16 15–60초 Teaser / 숏드라마 / Build Log 숏폼 | 서스펜스 법칙·티저 규칙·장면 5단계는 **초 단위로 환산해 옮긴다**. 인물 3차원 표는 **Guest 수준으로 축소**. 막·서브플롯은 **옮기지 않는다**(숏폼은 본편의 부분집합) | "숏폼 → 본편 BeatSheet가 먼저, 그 부분집합으로 작성" |
| `amu-video-shotlist` | Scene → Shot List(§4.1). provider capability 표 포함 | Ozu "사건 화면 밖", Fleabag visual sentence, 장면 5단계를 **Shot 규칙으로 옮긴다**. 대사층은 내레이션 트랙으로 분리 | "AI 영상 → Shot List 없이 생성 요청 금지" |

각 스킬은 원본과 같은 형식(frontmatter `name / description / Use when`, SKILL.md + reference.md)으로 쓰고 `tools/check-skills.py`로 검사한다.

---

## 6. 런타임 적용 원칙 — Rule Card로 증류

### 6.1 왜 원문을 넣지 않는가

| 이유 | 근거 |
| --- | --- |
| 저작권 | NOTICE: MIT가 덮는 것은 원칙, 체크리스트, 워크플로, 표, 규약이다. `reference.md`의 **인용문과 중국어 번역문은 MIT 대상이 아니다**. 프로덕션 프롬프트와 Build Log(공개 콘텐츠)에 인용문을 싣지 않는다 |
| 언어 | 원문은 중국어다. 출력은 한국어. 모델이 번역하며 해석할 때 흔들림이 생긴다 |
| 토큰 비용 | SKILL.md 1개가 150–370줄. 단계당 필요한 것은 5–10개 규칙이다(`sw-workflow` §4 "각 단계의 최소 동작"도 같은 원칙) |
| 검증 가능성 | SSOT는 모든 규칙에 ID를 인용하게 한다(R-VER-05). 원문 문단은 ID가 없다 |

### 6.2 Rule Card 형식 (제안)

```yaml
id: R-CRAFT-SCN-01
stage: [S11, S17, S18]
appliesTo: [episode, shortform, shot]
severity: major            # SSOT 0.2 규범 용어 체계를 따름 (must/should)
rule: "모든 Scene은 시작과 끝의 가치 극성이 달라야 한다. 같으면 설명 장면이므로 정보를 다른 장면에 엮고 삭제한다."
check: "valueAtStake.open != valueAtStake.close"
origin: "sw-scene-craft §1–2 (McKee 장면 정의, 5단계)"   # 출처 표기만, 인용 없음
```

**1차 증류 후보 (약 40개):**
- 장면 12개: 가치 전환, 전환점 = 행동·폭로, 늦게 진입 / 빨리 퇴장, 동작 우선, 반복 비트 금지, 장면 5단계 …
- 대사 10개: 상대가 아는 사실 금지, on-the-nose 금지, 이름 가리기, 두 사람 대화 → 세 방향 대화, 대사 꼬리 핵심어 …
- 인물·갈등 8개: 대립의 통일, 상대의 칼, 상승형 갈등, 과도기, 최소 보수 행동 → gap, 祥云(외부 구원) 금지 …
- 구조·연속성 6개: 위기 = 정적 딜레마, 실패 = 새 지식, 서브플롯 4관계, 기장식 단위, 티저 무답, 결말 = 잘못된 믿음 붕괴
- 숏폼·Shot 4개: §4.1·§4.2 규칙

### 6.3 스키마 additive 확장 후보 (SCHEMAS 문서 개정 대상)

| 대상 | 추가 필드 | 용도 |
| --- | --- | --- |
| `Scene` | `valueAtStake { value, open: "+" \| "-", close: "+" \| "-" }`, `turningPoint: "action" \| "revelation"`, `infoTool: "dramatic_irony" \| "surprise" \| "mystery" \| "suspense"`, `exitHookType`(act out 8유형) | Verifier 자동 신호 + R-MET-04 변수 |
| `ProductionBrief` | `openingType`(오프닝 8법), `endingType`(결말 8법), `decisionLog[]` | 설계 변수 기록, 결정 이력 |
| `Relationship` | `buttons[]`("상대를 가장 아프게 할 수 있는 지점", `sw-series-engine-bible` §24) | 2인 장면 설계 입력 |
| `Subplot` | `relationToMain: "contradiction" \| "echo" \| "foreshadow" \| "complication"`, `landmine { characterId, detonateEpisode }` | 분할된 이야기 방지, 지뢰 일정 |
| `NextEpisodeSeed` | `debt { incurredIn, payer, settleInEpisode }` | 기장식 단위(R-CONT-05 강화) |
| 신규 `ShotList` / `Shot` | §4.1 | 영상 생성 |

---

## 7. 단계별 실행 계획 (SSOT Phase에 맞춤)

| 단계 | 내용 | 산출물 | 선행 / 게이트 | 코드 변경 |
| --- | --- | --- | --- | --- |
| **P0 (즉시)** | 운영자용 Claude Code에 스킬을 설치한다(희곡 4종 제외 22종을 `.claude/skills/`에). AMU 매체 스킬 3종 초안을 작성한다 | `.claude/skills/*`, `amu-*` 3종 | 없음 | 없음 |
| **P1** (SSOT Phase B와 함께) | Rule Card 1차 40개, 단계 × 카드 매핑표(§3.1) 확정. Narrative Planner 프롬프트에 연결 | `R-CRAFT-*` 카드 문서, Planner 프롬프트 | SSOT G2 Brief 템플릿 확정 | 프롬프트 매니저 |
| **P2** (Phase D와 함께) | 스키마 additive 확장(§6.3). 숏폼 문법 → editorial-story v2 `surfaces.short` 생성 규칙 | SCHEMAS 개정안, short 생성 규칙 | Canon / Episode 스키마 구현(Phase A) | Mongoose 스키마(원장 승인 필요) |
| **P3** | Shot List 계약 + 일괄 enqueue + 조립(render worker 합류). Gen Studio "이야기 모드"는 운영자 한정 | `amu-shot-list.v1`, 오케스트레이터 | motion-story render worker PoC, 이용자 과금 계약은 별도 | video 모듈 확장 |
| **P4** (Phase E) | 진단 체크리스트 → Verifier 자동 신호(§3.3) | VerificationReport 항목 | Generator ≠ Verifier 분리 | 검증기 |
| **P5** (Phase F) | `openingType / infoTool / exitHookType` × retention·ICR 분석 | 설계 변수 리포트 | 측정 데이터 축적 | 분석 |

**가장 먼저 검증할 가설** (SSOT R-GOV-05와 정합): "작법 카드를 적용한 Tier 2 Episode가 미적용 Episode보다 Decision 참여율과 ICR이 높은가?" P1 완료 후 A/B로 비교한다.

---

## 8. 리스크와 주의

| 리스크 | 대응 |
| --- | --- |
| 원작자가 숏드라마를 "극작법이 없는 배포 논리"로 본다 → 스킬만으로 숏폼 성과를 보장할 수 없다 | 숏폼 문법은 **가설**로 취급한다. R-MET 측정으로 검증하고 〔초기값〕으로 표기한다 |
| 장편 영화 규칙(페이지, 3막 비율)의 기계적 적용 | 매체 경계표로 "비율만, 단위는 옮기지 않음"을 명시한다 |
| 극적 과장이 사실을 훼손 | Fiction / Knowledge 우선순위를 Rule Card에 명시한다(R-CAN-10이 모든 R-CRAFT보다 우선) |
| 인용문 유출(공개 Build Log, 프롬프트 디버그 화면) | 런타임에는 Rule Card(AMU 저작)만 쓰고, `origin` 필드는 출처 표기만 한다 |
| 과잉 체크리스트로 제작 속도 저하 | 스킬 자체 원칙("통과 기준은 권고이지 차단이 아니다")을 따른다. SSOT Blocking은 사실·Canon·안전에만 두고, 작법은 Major / Minor로 둔다 |
| 컨텍스트 분할로 인한 모순 | §3.4 결정 다이제스트 공통 입력 |

---

## 부록 A. 스킬별 AMU 활용 요약

| 스킬 | 가져올 것 | 버릴 것 |
| --- | --- | --- |
| `sw-workflow` | 단계 표 형식, 결정 로그, 진입표, 매체 추가 규약, terms.md | story-bible 파일 방식(→ Brief / Runtime) |
| `sw-premise-theme` | 주제 통제 아이디어, 제3의 궤도, 戏核 테스트, logline 공식 | 시장 판매 관점 |
| `sw-story-structure` | 가치 전환, 위기 / 클라이맥스, 오프닝·결말 8법, 실패 = 지식 | BS2 페이지 번호 |
| `sw-character-conflict` | 대립의 통일, 상대의 칼, 갈등 4운동, 과도기, 진단 14문 | 정신분석 원형 상세 |
| `sw-dialogue` | 진단 13문, 설명 = 탄약, on-the-nose 금지, 세 방향 대화 | 연극 운율 |
| `sw-scene-craft` | 장면 5단계, 늦게 진입 / 빨리 퇴장, 동작 우선, 도구 6작용 | 무대 공간론 일부 |
| `sw-series-structure` | teaser 규칙, act out 8유형, 정보 관리 4도구, 장면 5요소 | 방송 4막 쪽수 |
| `sw-series-engine-bible` | 주제 = 대립 명제, 과정 질문, 지뢰, 기장식 단위, 인물망, 엔진 실압 | 피칭 문서 |
| `sw-chinese-series-practice` | 3분 / 15분 / 집말 법칙, 4단 서스펜스, 지연 5기법, "하나의 질문" 구도 | 심의·제작 체인 |
| `sw-sitcom-comedy` | 웃음 밀도, Fleabag 직접 대화 장치, visual sentence | 멀티캠 포맷 |
| `sw-korean-french-screenwriting` | 감정 먼저, 대사는 마지막, 장르 = 약속, 인물의 존엄 | — |
| `ozu-screenplay-style` | 사건 화면 밖 / 반응 화면 안, 회향물, 최소 음절 고백 | 시나리오 서식 |
| `chekhov-dramaturgy` / `succession-series-writing` | 무악역 갈등, 컨테이너 에피소드(의식 순서가 막을 대체) | 4막 단위 |
| `sw-genre-anatomy` / `sw-truby-anatomy` | 장르별 비트(미스터리·성장 등 Arc 설계 시) | 12장르 전면 적용 |
| `sw-writers-room` / `sw-industry-business` | 노트 주고받기 원칙(Editorial Review) | 업계·계약 |
| 희곡 4종 | — | 전부 |
