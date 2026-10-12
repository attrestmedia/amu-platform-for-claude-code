# 리뉴얼 보고 — `AMU_Interactive_Episode_System.md` → Magazine Knowledge 기사

* 작성: 2026-10-12
* 원천: `.agent/references/NODE_APP/signature_interaction_and_interactive_motion/AMU_Interactive_Episode_System.md` (원천 파일은 수정하지 않음)
* 산출물: `article.md`(본문) · `meta.json`(§26-10 발행 메타 + §28 지식 계층) · 이 보고서
* 작성 기준: `CONTENT/TASK-AMU-MAGAZINE/magazine_knowledge_article.md` v2.x, `INTELLIGENCE-PATTERN-POLICY.md`, `content_production_workflow.md`(Content Experience Brief·AMU 제거 테스트)
* 상태: **draft — 등록 전 단계 남음(§5)**

---

## 1. 원천 진단

원천은 기사가 아니라 **AMU 내부 전략 대화 기록**이다(3,907줄). 그대로는 Magazine 기사가 될 수 없다.

| 진단 | 내용 | 처리 |
| --- | --- | --- |
| 주어 | AMU의 목표·포지셔닝·서비스 퍼널이 주어다 → AMU 제거 테스트 불통과 | 주어를 **독자(콘텐츠 기획자)의 문제**로 교체. 본문에 AMU·서비스명 0회 |
| 중심 질문 | 목표 설정·Build Log·엔터테인먼트·캐릭터 Canon·규약 초안이 한 문서에 섞임 | 중심 질문 1개로 축소: "AI가 답을 다 주는 지금, 사람들은 어떤 콘텐츠에 시간을 쓸까?" |
| 근거 | Reuters 2026 수치 일부만 인용, 나머지는 가상 예시(조회수 100만 vs 5만, 선택지 6개 실패담) | Reuters 수치 교차 확인, 학술 근거 3건 추가, 가상 예시는 "가상의 비교"로 명시하거나 제거 |
| 내부 언어 | Episode·Canon·Revenue Ladder·MARR·Tutors·Gen Studio 등 | 독자 표면에서 전부 제거(§21) |
| 서비스 CTA | Gen Studio·Tutors·Play로 보내는 퍼널 | 넣지 않음. Primary 서비스 0개(Magazine = Intelligence 원천 전용, PTU-Q-015와도 정합) |

## 2. 원천 항목 채택 판정

| 원천 항목 | 판정 | 기사 내 위치 |
| --- | --- | --- |
| 정보 획득 경로 변화(AI 챗봇·소셜 비디오) | adopt + 근거 검증 | H2-1 |
| Entertainment = 자발적으로 시간을 쓰게 만드는 경험, 짧음이 아니라 몰입 | adopt | H2-2 |
| Wow는 획득 장치이지 결과가 아니다 · Attention × Value × Agency × Continuity | adapt — "진단 관점이지 검증된 공식이 아님"으로 명시 | H2-3 |
| 스토리는 지식을 설명하기 위해 존재하지 않는다 | adopt + 학술 근거(Mar et al. 2021) | H2-4 |
| 선택지 6개 → 아무도 안 누름 | **가상 실패담이라 사실로 쓰지 않음.** 선택 과부하 연구(실험 + 반박 메타분석)로 대체 | H2-5 |
| "왜 사람이 자기 시간을 써서 이걸 봐야 하는가" · 5E · Current→Desired Belief | adopt (독자 언어로 번역) | H2-6 |
| 인터랙티브화하지 않아도 되는 콘텐츠 | adopt — 한계·반례 절 | H2-6 하위 |
| Build Log·메이킹 시리즈 | **별도 기사 후보** (중심 질문 이탈) | — |
| 캐릭터·Canon 세계관 스토리, 규약 초안(§1~§30), Planning System | **기사 대상 아님** — 이미 `INTERACTIVE-NARRATIVE-STANDARD.md`로 정본화된 내부 규약 | — |
| ICR·Magazine Return KPI | 제외 — 내부 지표, MEASUREMENT-PLAN 소관 | — |
| 과거 포지셔닝 문서 언급, Revenue Ladder | 제외 — 내부 맥락 | — |

## 3. 근거 검증

이 세션의 네트워크 정책 때문에 `WebFetch`가 대상 도메인을 해석하지 못했다(`ENOTFOUND`). 아래는 **`WebSearch` 결과로 확인**한 범위다.

| 주장 | 원천 표기 | 검증 결과 | 기사 반영 |
| --- | --- | --- | --- |
| 소셜·동영상 54% > 언론사 웹·앱 51%, 첫 역전, 48개 시장·약 10만 명 | 수치 없이 "처음 앞섰다" | eMarketer·Press Gazette·AdNews 등 복수 보도 일치. 역전은 플랫폼 성장보다 TV·웹사이트 감소 영향이 크다는 맥락도 확인 | 반영 + 한계 문단 |
| AI 챗봇 주간 뉴스 이용 7% → 10% | 있음 | Nieman Lab 등 복수 보도 일치 | 반영 |
| **한국 14%** | 있음 | **확인 불가.** 2차 자료 하나는 한국을 8%로 보도 → 원천 수치 오류 가능성 | **제외** |
| 챗봇 이용 행동: 추가 질문 42%·요약 34%·쉬운 설명 30% | 있음 | 블로그 1건에서만 확인, 원문 미확인 | **제외** (본문은 수치 없이 흐름만 서술) |
| 이야기 글이 설명 글보다 이해·기억에 유리 | 없음(주장만) | Mar et al. 2021, Psychonomic Bulletin & Review, DOI 10.3758/s13423-020-01853-1 확인 | 추가 |
| 선택 과부하 잼 실험 | 없음 | Iyengar & Lepper 2000, JPSP, DOI 10.1037/0022-3514.79.6.995 | 추가 |
| 선택 과부하 평균 효과 거의 0 | 없음 | Scheibehenne et al. 2010, JCR 37(3), DOI 10.1086/651235 확인 | 추가 (반례) |

**등록 전 필수**: 로이터 원문 페이지(`reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/...`)에서 54%·51%·7%·10%를 직접 대조한다. 대조되면 `temporalClaims[].sourceRef`를 원문 URL로 바꿔도 된다.

## 4. Intelligence 관점 정리

- `intelligenceRole: analysis`, `externalEvidenceLevel: multi_source`, `claimStatus: sourced`.
- Knowledge Unit 6개를 기록했다: signal 1 · principle 2 · evidence 1 · anti_pattern 1 · tactic 1. 이 가운데 3개(principle 1, anti_pattern 1, tactic 1)는 `evidenceRefs`가 비어 있다. 기사 정본 §19에 따라 정상이며, sourceRef를 지어내지 않았다.
- 판정 필드(`eligibility`·`reviewStatus`·Pattern·Proof 참조)는 §27·§28에 따라 **원고 메타에 쓰지 않았다**. 적재 시 normalize가 판정한다(근거가 있으므로 예상값은 `candidate`, `qualified`는 사람 검토로만 올라간다).
- **AMU Proof 없음.** 외부 Evidence만 있으므로 "AMU에서 확인됐다"는 표현을 쓰지 않았다.
- **Play The World와의 관계**: 이 기사의 Knowledge Unit(특히 "의미 있는 선택", "지식은 문제의 도구")은 Story 설계 원칙의 외부 근거가 된다. 다만 `the-world` S01 Brief가 기다리는 `Demand Before Build`·최소 주문 수량 KU는 이 기사의 범위가 아니다 — 별도 기사가 필요하다.

## 5. 등록 전 남은 단계 (이 세션에서 수행 불가)

| # | 단계 | 이유 | 담당 도구 |
| --- | --- | --- | --- |
| 1 | **내부 링크 3개 이상** (허브 1 · 같은 카테고리 심화 2 · 다른 카테고리 전환 1) | `amu-magazine` MCP가 이 세션에 없어 실제 포스트 검색 불가. 링크를 추측해 넣지 않았다 | `amu-magazine` MCP 검색 |
| 2 | **이미지 1개 이상** + 커버 | `genstudio` MCP 없음. 본문에 자리표시 이미지를 넣지 않았다 | `genstudio` MCP |
| 3 | 로이터 원문 대조 | §3 | WebFetch 가능한 환경 |
| 4 | `category` 실재 확인 (`marketing-strategy`) | 로컬·운영 taxonomy 조회 필요 | `amu-magazine` MCP |
| 5 | `writing_humanizer.md` 최종 점검 | 이 저장소 스냅샷에 문서 없음 | — |
| 6 | 9축 판정 | writer 자기검수가 아니라 별도 quality reviewer가 내린다(§15) | 별도 reviewer |
| 7 | SEO 게이트 | `convert_article_document` → `analyze_article_seo`(85점·required 통과) → draft dry-run | `amu-magazine` MCP |
| 8 | 파일 경로 | 운영 허용 루트(`/home/attrest-samsung-linux/Project/.agent/content/articles`)로 옮겨 등록 | 로컬 환경 |

### 이미지 계획 (본문 밖 작업 기록)

| 위치 | 역할 | 방향 | ALT 초안(규칙 5 검사 통과용) |
| --- | --- | --- | --- |
| H2-1 직후 | evidence | 텍스트 없는 그래픽 — 두 갈래 경로(검색→읽기 / 질문→요약→적용)의 흐름 대비 | AI 시대 콘텐츠 전략은 사람들이 답을 얻는 길이 바뀌었다는 데서 출발한다. |
| H2-4 직후 | comparison | 텍스트 없는 개념 일러스트 — 흩어진 조각과 하나로 이어진 실 | 이야기는 흩어진 개념을 하나의 원인과 결과로 묶어 기억에 남긴다. |

## 6. 별도 기사 후보 (중심 질문 이탈로 분리)

1. 만든 과정을 공개하면 왜 결과물보다 신뢰를 더 얻을까 — Build in Public·메이킹 시리즈
2. 조회수 말고 "생각이 바뀌었는지"는 무엇으로 측정할까 — 이 기사의 `nextQuestion`
3. 만들기 전에 수요를 확인하는 법 — `the-world` S01 Brief의 Intelligence 원천 후보
