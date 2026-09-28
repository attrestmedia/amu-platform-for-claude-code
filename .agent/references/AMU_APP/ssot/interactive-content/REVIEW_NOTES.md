# 원천 문서 분석·검토 결과 (Review Notes)

| 항목 | 값 |
| --- | --- |
| 대상 | `in_progress/AMU_Interactive_Episode_System.md`, `in_progress/Knowledge-Grounded_Narrative_Engine.md` |
| 산출물 | [`AMU_INTERACTIVE_CONTENT_SSOT.md`](./AMU_INTERACTIVE_CONTENT_SSOT.md), [`AMU_INTERACTIVE_CONTENT_SCHEMAS.md`](./AMU_INTERACTIVE_CONTENT_SCHEMAS.md) |
| 작성일 | 2026-09-28 |

이 문서는 원천 문서를 SSOT로 바꾸면서 **무엇을 그대로 가져왔고, 무엇이 충돌·누락·모호했으며, 어떻게 해소했는지** 기록한다. SSOT 개정 시 이 문서도 함께 갱신한다.

---

## 1. 원천 문서 요약

### 1.1 `AMU_Interactive_Episode_System.md` — 논의 흐름

| 단계 | 핵심 결론 |
| --- | --- |
| ① 목표 정의 | 최고의 반응은 "와 신기하다"가 아니라 **관계의 시작**. North Star = Meaningful Continuation. Wow는 Acquisition Mechanism |
| ② 작은 제품 + 메이킹 | 인터랙티브 기사 = 작은 Product. 제작 과정을 Build Log 시리즈로 공개 → 1 Product에서 6개 자산 |
| ③ AI 시대 인사이트 | 사람들은 글을 찾아 읽지 않고 AI 챗으로 지식을 얻는다. 시간을 얻는 유일한 입구는 엔터테인먼트 → Knowledge as Entertainment, Experience First |
| ④ 캐릭터 + Canon | 자체 캐릭터와 Canon 세계관을 서사 엔진으로. 기본 단위를 Article → Episode로 |
| ⑤ 규약 초안 v0.1 | Canon C0–C5, 캐릭터 요소, Episode 5단 구조, 30개 조항 |
| ⑥ Planning System v0.1 | Intelligence ↔ Episode Planning 분리, 캐스팅·인원·Baton Pass·Seed 재검증, 40개 조항 |

### 1.2 `Knowledge-Grounded_Narrative_Engine.md` — Sherpa 사례 분석

| 요소 | AMU 적용 결론 |
| --- | --- |
| Persona-grounded Character Agent | 캐릭터가 행동 후보를 제안, Director가 조정 |
| Narrative World State | Definition/State 분리, World Truth/Knowledge/Belief 분리 |
| Arc → Subplot → Episode → Scene | Subplot 생명주기·Payoff Horizon, Beat Sheet 필수 |
| Generator ≠ Verifier | 구조화 추출 후 비교하는 검증 |
| Dependency 기반 부분 재계산 | Narrative Impact Graph |
| 실제 Audience Data 학습 | 예측보다 측정 우선. 데이터 플라이휠은 이후 |
| AMU 고유 단계 | **Knowledge Binding** (Intelligence의 Fact/Interpretation을 Scene에 결합) |
| 서비스 책임 | 제작 UI = Gen Studio, Canon 원장 = 공통 Narrative Runtime |

---

## 2. 강점 (그대로 계승)

1. **목표의 순서가 명확하다** — 호기심 → 몰입 → 가치 → 관계 → 행동 → 복귀. 수익화를 최우선 퍼널로 두지 않는 판단은 Magazine의 신뢰 자산을 지키는 핵심 결정이다.
2. **"서사가 먼저, 지식은 도구"** 원칙이 일관되게 반복된다 (Topic Costume 방지).
3. **Story가 Intelligence를 지배하지 않는 양방향 루프** — 세계관 운영에서 가장 흔한 실패(수요 없는 설정 확장)를 구조적으로 막는다.
4. **Narrative Baton Pass** — 특정 캐릭터 종속 없이 다주제 Magazine을 하나의 세계로 연결하는 실용적 메커니즘.
5. **AI 권한 제한 (제안만, 확정은 사람)** 과 **append-first Canon** — 장기 Canon 품질 유지에 필수.
6. **단계적 로드맵** — Audio·현지화·파인튜닝을 뒤로 미루고 핵심 가설 검증을 먼저 둔 판단.

---

## 3. 발견된 문제와 해소 방법

### 3.1 구조·용어

| # | 문제 | 영향 | SSOT 해소 |
| --- | --- | --- | --- |
| I-01 | **콘텐츠 단위 용어 혼재**: Article, Experience, Episode, Interactive Article, Interactive Product, Interactive Episode가 문맥마다 다른 의미로 쓰임 | 에이전트·개발자가 서로 다른 엔티티를 만들 위험 | §2 용어집으로 단일화. Interactive Product는 "관점 명칭"으로만 정의 |
| I-02 | **"모든 Episode는 캐릭터 2명 이상"과 "모든 콘텐츠에 캐릭터를 넣지 않는다"가 공존**. 캐릭터 없는 인터랙티브 콘텐츠(복리 계산기 등)의 위치가 불명확 | 캐릭터 강제 투입(Topic Costume) 또는 규칙 충돌 | **Tier 0/1/2 체계 신설** (§3). 캐릭터 없는 인터랙티브 = Tier 1 |
| I-03 | **파이프라인 3종 병존**: 규약 v0.1의 12단계, Planning의 16단계, Narrative Engine의 12단계가 단계명·순서가 다름 (예: Canon Check 위치, Knowledge Binding 유무) | 어느 단계가 기준인지 불명 | §7에서 **S01–S24 단일 파이프라인**으로 통합, 단계별 산출물·게이트 명시 |
| I-04 | **프레임워크 7종 병존**: Stop/Play/Gain/Want/Return, 5E, AVAC, 서사 5단, 10 Beats, 측정 6단, Build→Show→Teach→Invite→Learn | 기획 회의마다 다른 프레임워크 사용 | §5에서 **용도별 공식 지정 + 단계 매핑표** |
| I-05 | 과거 포지셔닝 문서(커머스형+게임형 유니버스)와의 우선순위가 대화 속 한 문단으로만 언급 | 에이전트가 과거 문서를 근거로 삼을 위험 | §0.1에 문서 우선순위로 명문화 |

### 3.2 모호한 정의·누락된 기준

| # | 문제 | SSOT 해소 |
| --- | --- | --- |
| I-06 | ICR 분모인 "유의미하게 경험한 사용자"가 정의되지 않음 | **Activation Event** 도달로 정의 (§19.2, §26.3). 콘텐츠당 정확히 1개 |
| I-07 | ICR 측정 기간 미정 | 동일 세션 + 7일 윈도 〔초기값〕 |
| I-08 | Worthiness Gate가 "상당수가 낮다면"으로 정성적 | 6개 기준 0–2 채점 + Tier 판정표 〔초기값〕 (§8) |
| I-09 | AVAC가 예시 점수(10점 척도)만 있고 승인 기준 없음 | 0–5 척도, 모든 축 ≥ 3 승인 〔초기값〕 (§5.3) |
| I-10 | Narrative Fatigue의 산정 방식·임계값 없음 | 최근 10개 Tier 2 중 주연 횟수, ≥ 4면 우선순위 하향, 연속 주연 3회 제한 〔초기값〕 (§11.8) |
| I-11 | Canon 변경 "승인 절차"의 승인자·등급 없음 | Minor / Major / Critical 3등급 + 역할별 승인자 (§10.4, §28) |
| I-12 | "Disposable Character 대량 생성 금지"만 있고, 이름 없는 배경 인물 처리 기준 없음 | **캐릭터 등급(Core/Recurring/Guest/Extra)** 신설, Guest 3회 등장 시 승격 심사 (§11.5) |
| I-13 | Canon 계층(C0–C5)과 Definition/State, Truth/Knowledge/Belief가 별도 논의에서 등장해 관계 불명 | C2 = CharacterDefinition, C4 = CanonEvent, Knowledge/Belief = CharacterState로 매핑 (§10.2–10.3, 스키마 §2–3) |
| I-14 | 사용자 선택(Choice)이 공식 Canon에 어떻게 반영되는지 미정 | 사용자 분기는 세션 결과, 공식 Canon은 `canonicalBranch`를 따름 (R-INT-08) |
| I-15 | 적정 Subplot 동시 운영 수, horizon 초과 시 처리 없음 | 동시 활성 ≤ 3, 초과 시 payoff/deferred/abandoned 중 강제 처리 (§16.3) |
| I-16 | Cliffhanger "남발 금지"의 기준 없음 | 강한 Cliffhanger 연속 2회 제한, 매 Episode 최소 만족 제공 (§15.4) |
| I-17 | 선택지 수 기준 없음 (원천의 실패 사례: 6개 → 아무도 안 누름) | Decision 선택지 2–3개 권장 (R-INT-07) |
| I-18 | CTA "기본 하나"의 노출 시점 없음 | Activation Event 이후 노출 (R-CTA-03) |

### 3.3 리스크 (원천 문서에 없던 항목)

| # | 리스크 | SSOT 해소 |
| --- | --- | --- |
| I-19 | 투자·경제 시뮬레이션이 핵심 사례인데 **투자 조언 오인 리스크** 언급 없음 | 고지 의무, 계산식·가정 공개, 테스트 케이스 (R-KNOW-06/07) |
| I-20 | 실존 인물·기업을 캐릭터화하거나 연상시키는 리스크 | 금지 (R-CHR-13) |
| I-21 | 관점 캐릭터가 특정 집단의 고정관념이 될 리스크 | 금지 (R-CHR-14) |
| I-22 | Build Log에서 미공개 Canon·사용자 데이터 노출 리스크 | 공개 금지 범위 명시, 데이터 집계·익명화 (R-BLD-04) |
| I-23 | Tutors·Play 대화가 공식 Canon을 오염시킬 리스크 | Narrative Runtime 읽기 전용, 세션 데이터 분리 (R-GOV-01/02) |
| I-24 | 사용자 개인 Universe와 공식 Universe 혼재 | 네임스페이스 분리 (R-GOV-03) |
| I-25 | 인터랙션 실패 환경(접근성·JS 오류)에서 콘텐츠 소실 | 텍스트 fallback 필수 (R-INT-11) |
| I-26 | 게시 후 Canon 변경 시 과거 Episode 처리 불명 | 게시본 자동 수정 금지, Canon Keeper 검토 큐 (R-VER-08) |

### 3.4 사실성 관련

| # | 문제 | SSOT 해소 |
| --- | --- | --- |
| I-27 | 원천 대화에 인용된 외부 수치(Reuters Institute 2026, Pocket FM 사용자·매출·생산량, arXiv 논문)가 대화 중 인용이며 원문 검증 기록이 없음. 일부는 SNS 게시물 2차 인용 | 규칙이 이 수치에 **의존하지 않도록** 작성. 부록 B에 "미검증"으로 분리, 대외 인용 시 KnowledgeClaim 등록·Fact Check 필수 |
| I-28 | 예시 캐릭터 Pioneer·Scholar·Warden이 공식 캐릭터인지 불명 | "설명용 원형 명칭"으로 표기, 공식 여부는 결정 사항 D-02로 이관 |
| I-29 | MARR, Revenue Ladder, Magazine Return 등 참조 지표의 정의 문서가 이 저장소에 없음 | 용어집에서 "외부 문서가 SSOT"로 명시, D-06으로 이관 |

---

## 4. SSOT에서 새로 도입한 요소 (원천에 없던 것)

원천 문서의 의도를 운영 가능하게 만들기 위해 추가했으며, 모두 개정 가능 대상이다.

| 요소 | 위치 | 도입 이유 |
| --- | --- | --- |
| 규범 용어(MUST/SHOULD/MAY) + 규칙 ID 체계 | §0.2–0.3 | 사람·AI 리뷰에서 위반 규칙을 정확히 인용하기 위해 |
| 〔초기값〕 표기 | §0.4 | 근거 없는 수치를 확정 규칙처럼 보이지 않게 |
| Tier 0/1/2 | §3 | I-02 해소 |
| Activation Event | §19.2 | I-06 해소, ICR 분모 |
| 게이트 G1–G5 | §7.1 | 사람 승인 지점 명확화 |
| Canon 변경 3등급 | §10.4 | I-11 해소 |
| 캐릭터 등급 4단계 | §11.5 | I-12 해소 |
| 안전·윤리 규칙 | §11.9, §18 | I-19–I-21 |
| AI 권한 매트릭스 | §28.2 | "AI는 제안만" 원칙을 행위 단위로 구체화 |
| 금지 패턴 카탈로그 AP-01–15 | §27 | 원천 7개 + 검토 중 도출 8개 (Omniscient NPC, Strawman, Decorative Interaction, Product Ad Disguise, Wow-only, One-Prompt Pipeline, Orphan Setup, Fact Bending) |
| TypeScript 스키마 + 상태 머신 | 스키마 문서 | 원천 결론("CHARACTER/CANON/STORY-ARC/EPISODE 스키마 분리")의 실행 |

---

## 5. 후속 작업 제안

1. **부록 A 결정 사항(D-01–D-08) 확정** — 특히 D-02(공식 캐릭터 목록)가 없으면 Phase A 착수가 어렵다.
2. **파일럿 1편 역산 검증** — 원천 예시("AI 자동화는 업무 단위부터 재편한다")로 Production Brief를 실제로 작성해 규약의 빈틈 확인.
3. **Tier 1 파일럿 병행** — 복리 시뮬레이터 같은 Tier 1 콘텐츠로 Activation Event·ICR 트래킹을 먼저 검증 (캐릭터 시스템 없이 가능).
4. **에이전트 프롬프트 템플릿화** — S03–S16 각 단계를 스키마 산출물 단위의 에이전트 프롬프트로 분리 (R-PIPE-05).
5. **〔초기값〕 첫 조정** — Tier 2 Episode 10편 게시 후 G1·AVAC·Fatigue 임계값 재검토.
