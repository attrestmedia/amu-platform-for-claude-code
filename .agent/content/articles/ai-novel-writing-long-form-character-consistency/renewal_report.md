# 리뉴얼 보고 — `Knowledge-Grounded_Narrative_Engine.md` → Magazine Knowledge 기사

* 작성: 2026-10-12
* 원천: `.agent/references/NODE_APP/signature_interaction_and_interactive_motion/Knowledge-Grounded_Narrative_Engine.md` (원천 파일은 수정하지 않음)
* 산출물: `article.md` · `meta.json` · 이 보고서
* 작성 기준: `CONTENT/TASK-AMU-MAGAZINE/magazine_knowledge_article.md`, `INTELLIGENCE-PATTERN-POLICY.md`, `content_production_workflow.md`
* 상태: **draft — 등록 전 단계 남음(§5)**
* 자매 기사: `../ai-era-content-strategy-why-people-spend-time/` (같은 날 리뉴얼)

---

## 1. 원천 진단

원천은 바이럴 SNS 게시물(Pocket FM Sherpa 소개)과, 이를 AMU 제작 엔진 설계에 대입한 **내부 설계 대화**다(1,045줄).

| 진단 | 내용 | 처리 |
| --- | --- | --- |
| 주어 | "AMU가 Sherpa에서 무엇을 가져올까"가 주어다 → AMU 제거 테스트 불통과 | 주어를 **AI로 장편·연재를 쓰는 창작자의 문제**("왜 캐릭터가 중간에 무너지나")로 교체. 본문에 AMU·서비스명 0회 |
| 중심 질문 | Sherpa 분석·AMU 파이프라인 12단계·서비스 책임·UX 3화면·개인 유니버스 확장·로드맵이 섞임 | 중심 질문 1개: "AI로 긴 이야기를 쓰면, 왜 캐릭터가 중간에 딴사람이 될까?" |
| 근거 | 바이럴 수치(55만 크리에이터·1억 달러·백만장자 3명·1200%), Sherpa 내부 에이전트 이름, MAGNET 논문 | 검증 후 확인된 것만 사용, 회사 측 주장은 근거에서 제외(§3) |
| 내부 언어 | Canon·Narrative Runtime·Gen Studio·Tutors·Play·Episode·Baton Pass 등 | 독자 표면에서 전부 제거. 개념은 "상태표·장면 설계표·떡밥 목록" 같은 창작자 언어로 번역 |
| 캐릭터 예시 | Pioneer·Scholar·Warden(AMU 자리표시자) | 장르 예시(추리 연재의 주인공·집사)로 교체 |

## 2. 원천 항목 채택 판정

| 원천 항목 | 판정 | 기사 내 위치 |
| --- | --- | --- |
| 장편에서 AI가 맥락을 잃는 문제 | adopt + 근거 추가(Lost in the Middle) | H2-1 |
| Sherpa: 다중 에이전트·계층 구조·서사 기억 | adopt (보도로 확인된 범위만) | H2-2 |
| CharacterDefinition / CharacterState 분리, Want·Need·Misbelief·Stress Response | adopt (창작자 언어로) | H2-3 |
| World Truth / Character Knowledge / Character Belief 3분리 | adopt + 독자 참여(오류 찾기) | H2-3 하위 |
| Persona 기반 Character Agent, 행동 후보 3개 → 충돌 조합 선택 | adopt + 근거(Generative Agents, From Personas to Plot) | H2-4 |
| Generator ≠ Verifier, 구조화 추출 후 대조 | adopt + 근거(Huang et al.) | H2-5 |
| Narrative Impact Graph(의존 참조), Subplot Payoff Horizon | adopt (스프레드시트 수준 실무로) | H2-6 |
| Beat Sheet 필드 | adopt — 장면 설계표 | H2-7 |
| AI가 retention을 예측하게 하지 말고 실제 행동을 측정 | adopt — 한계 절 | H2-7 하위 |
| Knowledge Binding(Intelligence → 장면) | **별도 기사 후보** — "지식 콘텐츠를 이야기로" 주제는 자매 기사와 겹쳐 이 기사에서 제외 |
| 서비스 책임 분리, UX 3화면, 개인 유니버스 확장, 구현 단계 A~F, fine-tuning 우선순위 | **기사 대상 아님** — 내부 설계. `INTERACTIVE-NARRATIVE-STANDARD.md`에 이미 채택됨 |
| 바이럴 성과 수치 | **근거로 쓰지 않음** — §3 |

## 3. 근거 검증

`WebFetch`는 이 세션의 네트워크 정책으로 대상 도메인을 해석하지 못했다. 아래는 **`WebSearch` 결과로 확인**한 범위다.

| 주장 | 원천 표기 | 검증 결과 | 기사 반영 |
| --- | --- | --- | --- |
| Sherpa 출시, 10~1,000화, 다중 전문 에이전트(아이디어·리서치·설계·문장·피드백·서사 기억), 캐릭터·세계 → 아크 → 회차 → 장면 계층 | 일부 | 2026-09 출시 보도 다수에서 확인 | 반영 |
| Sherpa 에이전트 이름 `Planner`·`Feedback`·`Storyboard`, `Narrative World Model` | 있음 | **보도에서 해당 명칭 미확인** (가장 가까운 표현: "이야기와 함께 자라는 세계 이해") | 고유 명칭은 쓰지 않음 |
| 콘텐츠 생산 1,200% 증가 | 있음 | 회사 임원 게시물 출처. 같은 시기 회사 캠페인 보도는 "75배"로 지표가 다름 | **근거 제외**, 본문에 "회사 측 발표·지표 상이"로만 언급 |
| 한 작품 매출 1억 달러, 작가 3명 백만장자 | 있음 | 회사 측 주장(독립 검증 없음) / 백만장자 수치는 미확인 | 제외 |
| 55만+ 크리에이터 | 있음 | 회사가 Sherpa 학습 데이터 배경으로 밝힌 수치(77만 작품·55만 크리에이터·55억 시간) | 수치 대신 "수년간 쌓은 실제 청취 데이터"로만 언급 |
| From Personas to Plot (MAGNET·ATLAS), 100쪽, 단일 프롬프트 대비 개선 | 있음(수치 없음) | arXiv 2607.00918 확인. 편집 지적 41%·환각 50% 감소, 포켓FM 소속 저자 포함 | 반영 + 이해관계·규모 한계 명시 |
| 긴 맥락 가운데 정보 활용 저하 | 없음 | Liu et al., TACL 12(2024) 157–173, DOI 10.1162/tacl_a_00638 | 추가 |
| 기억·정리·계획 기반 캐릭터 에이전트 | 없음 | Park et al. 2023, arXiv 2304.03442 | 추가 |
| 자기 수정의 한계 | 없음 | Huang et al., ICLR 2024, arXiv 2310.01798 | 추가 |

## 4. Intelligence 관점 정리

- `intelligenceRole: analysis`, `externalEvidenceLevel: multi_source`, `claimStatus: sourced`.
- Knowledge Unit 7개: evidence 2 · case 1 · principle 3 · tactic 1. `pattern` 표기는 Registry 승격 판정(사람)의 영역이라 쓰지 않고 `principle`로 기록했다.
- 근거 없는 실무 원칙 3개(성격/상태 분리, 사실/지식/믿음 분리, 의존 참조)는 `evidenceRefs: []`로 두었다. 근거를 지어내지 않았다.
- 판정 필드·Pattern·Proof 참조는 원고 메타에 쓰지 않았다(§27·§28).
- **Play The World와의 관계**: 이 기사의 Knowledge Unit은 Story 제작 파이프라인(규약 §7 P5 Character Simulation, §9 Verifier, §9.3 Impact Graph)의 **외부 근거**로 연결할 수 있다. 특히 "캐릭터 에이전트" 원칙은 규약이 "선택" 단계로 둔 P5를 자동화할 때의 판단 근거가 된다.

## 5. 등록 전 남은 단계 (이 세션에서 수행 불가)

| # | 단계 | 이유 |
| --- | --- | --- |
| 1 | 내부 링크 3개 이상 | `amu-magazine` MCP 없음. 자매 기사(`ai-era-content-strategy-why-people-spend-time`)가 발행되면 다른 카테고리 전환 링크 후보 |
| 2 | 이미지 1개 이상 + 커버 | `genstudio` MCP 없음 |
| 3 | 1차 출처 대조 | arXiv·Sherpa 공식 페이지를 WebFetch 가능한 환경에서 확인(특히 41%·50% 수치) |
| 4 | `category` 실재 확인 (`ai-creatives`) | 로컬·운영 taxonomy 조회 |
| 5 | 9축 판정 | 별도 quality reviewer |
| 6 | SEO 게이트 85점·required 통과 | `amu-magazine` MCP |
| 7 | 운영 허용 루트로 파일 이동 후 등록 | 로컬 환경 |

### 이미지 계획 (본문 밖 작업 기록)

| 위치 | 역할 | 방향 | ALT 초안 |
| --- | --- | --- | --- |
| H2-1 직후 | evidence | 텍스트 없는 그래픽 — 양 끝이 밝고 가운데가 흐려지는 긴 띠 | AI 소설 쓰기에서 긴 맥락의 가운데에 묻힌 설정은 가장 놓치기 쉽다. |
| H2-3 하위(오류 찾기) 직후 | reveal | 텍스트 없는 개념 일러스트 — 세 겹으로 겹친 반투명 층 | 세계의 사실과 인물이 아는 것, 인물이 믿는 것을 나누면 반전이 살아난다. |

## 6. 별도 기사 후보

1. 지식을 이야기로 바꿀 때, 왜 지식은 설명이 아니라 사건의 도구로 나와야 할까 — Knowledge Binding
2. 독자가 다음 화를 누르는 장면은 무엇이 다를까 — 이 기사의 `nextQuestion`
3. AI가 만든 결과를 AI로 검사할 때 무엇을 바꿔야 할까 — 생성·검증 분리 일반론(창작 외 업무)
