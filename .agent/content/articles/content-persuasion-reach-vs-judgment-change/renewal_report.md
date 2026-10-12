# 리뉴얼 보고 — `Changes_Judgment_and_Relational_Behavior.md` → Magazine Knowledge 기사

* 작성: 2026-10-12
* 원천: `.agent/references/CONTENT/TASK-APP-EXPERIENCE/Changes_Judgment_and_Relational_Behavior.md` (원천 파일은 수정하지 않음)
* 산출물: `article.md` · `meta.json` · 이 보고서
* 작성 기준: `CONTENT/TASK-AMU-MAGAZINE/magazine_knowledge_article.md`, `INTELLIGENCE-PATTERN-POLICY.md`, `content_production_workflow.md`
* 상태: **draft — 등록 전 단계 남음(§5)**
* 자매 기사: `../ai-era-content-strategy-why-people-spend-time/`, `../ai-novel-writing-long-form-character-consistency/`

---

## 1. 원천 진단

원천은 SNS 게시물(마케팅 스타트업 대표가 전한 "팔로워·조회수는 낮은데 광고 단가가 높은 인플루언서" 이야기)과, 이를 AMU에 대입한 **내부 전략 대화**다(472줄).

| 진단 | 내용 | 처리 |
| --- | --- | --- |
| 주어 | AMU의 Magazine 구조·Marketing Oops·Proof Bank·상업화가 주어다 → AMU 제거 테스트 불통과 | 주어를 **콘텐츠·인플루언서 마케팅을 평가하는 마케터·크리에이터의 문제**로 교체. 본문에 AMU·서비스명 0회 |
| 출발 사례 | 특정 회사(4AM)의 일화. 데이터·분모 없음. `INTERACTIVE-NARRATIVE-STANDARD.md` 부록 A가 "대외 인용 금지(미검증)"로 분류 | **회사명·일화를 근거로 쓰지 않음.** 같은 질문을 검증 가능한 연구(인플루언서 팔로워-참여 연구 2편)로 다시 세움. 도입부 견적서는 설명용 장면으로만 사용하고 메타 `limitations`에 명시 |
| 근거 | 원천은 근거 없이 논지만 있음 | 학술 근거 4건 추가(§3) |
| 균형 | 원천은 "팔로워·조회수보다 설득"으로 한쪽에 기울어 있음 | 팔로워가 많을수록 효과가 컸다는 연구도 함께 제시해 "도달은 중요하지만 비례하지 않는다"로 균형 |
| 내부 언어 | Verified Reach·Persuasion Proxy·Revenue Ladder·MARR·Growth Ops·Decision Media | 독자 표면에서 제거. "도달 자산·설득 자산·설득 아웃라이어"로 번역 |

## 2. 원천 항목 채택 판정

| 원천 항목 | 판정 | 기사 내 위치 |
| --- | --- | --- |
| Reach Asset vs Persuasion Asset | adopt | H2-2 |
| 설득 = 구매보다 관점 이동이 먼저 | adopt | H2-2 |
| AI 모델 비교 콘텐츠 예시(벤치마크 → 내 작업의 총비용·실패율) | adapt — 특정 모델명 제거, 독자 판단 실험으로 | H2-2 하위 |
| 기존 생각 → 문제 → 재정의 → 증거 → 새 선택 기준 → 실행 | adopt + 근거(프레이밍 실험) | H2-3 |
| 설득력 ≠ 강한 카피, 검증 안 된 성과 주장은 신뢰 훼손 | adopt + 근거(정교화 가능성 모델) | H2-4 |
| Persuasion Proxy(행동별 분리), Traffic/Persuasion Outlier, 학습 기록 5칸 | adopt (진단 관점으로 명시) | H2-5 |
| Current Belief → Desired Belief (뉴스레터 예시) | adopt | H2-6 |
| Magazine 기사 구조에 설득 단계 삽입 | **out of scope** — Magazine 작성 규칙은 `magazine_knowledge_article.md` 소관(규약 부록 A와 같은 판정) |
| Marketing Oops·Proof Bank 연결, 실행 우선순위 P0~P2 | **기사 대상 아님** — 내부 운영 |
| Decision Media·B2B 상업화 | **기사 대상 아님** — 규약 부록 A `defer` |
| 4AM 사례, 게임기 일화 | **제외** — 미검증 일화·소재 이탈 |

## 3. 근거 검증

`WebSearch` 결과로 확인했다(이 세션에서 WebFetch는 대상 도메인 해석 불가).

| 근거 | 확인 내용 | 반영 |
| --- | --- | --- |
| Leung, Gu, Li, Zhang & Palmatier (2022), *Journal of Marketing* 86(6) 93–115, DOI 10.1177/00222429221102889 | 웨이보 2018-10, 게시물 5,835건·인플루언서 2,412명·캠페인 1,256개. 팔로워가 많을수록 효과 큼, 지출 1%당 참여 0.457% | H2-1 |
| Wies, Bleier & Edeling (2023), *Journal of Marketing* 87(3) 383–405, DOI 10.1177/00222429221125131 | 팔로워 증가 → 참여 증가 후 감소, 맞춤 콘텐츠·낮은 브랜드 친숙도가 감소 완화. 2023 AMA/MSI H. Paul Root Award | H2-1. **최적 구간(100만~150만)은 2차 자료뿐이라 쓰지 않음** |
| Tversky & Kahneman (1981), *Science* 211(4481) 453–458, DOI 10.1126/science.7455683 | 생존 프레임 72% 확실안, 사망 프레임 78% 위험안 | H2-3 |
| Petty & Cacioppo, 정교화 가능성 모델 (1986 단행본) | 중심 경로 태도 변화가 더 지속적·반박 저항적·행동 예측적. 동기·능력 조건 필요 | H2-4 |

- 두 인플루언서 연구는 **참여**(공유·반응)를 측정했다. 구매·판단 변화는 측정하지 않았다 → 본문 H2-1 마지막 문단과 메타 `limitations`에 명시.

## 4. Intelligence 관점 정리

- `intelligenceRole: analysis`, `externalEvidenceLevel: multi_source`, `claimStatus: sourced`, `temporalClaims: []`(시점 의존 주장 없음).
- Knowledge Unit 6개: evidence 2 · principle 1 · anti_pattern 1 · tactic 2. 근거 없는 실무 원칙 3개는 `evidenceRefs: []`로 두었다.
- **자매 기사와의 관계**: 첫 기사(`ai-era-content-strategy-why-people-spend-time`)의 "판단 기준 이동 4줄"과 개념이 겹친다. 이 기사는 **측정·평가(도달 vs 설득)** 쪽을, 첫 기사는 **기획(시간을 쓸 이유)** 쪽을 맡도록 나눴다. 등록 시 서로 내부 링크 후보다.
- **Play The World와의 관계**: The World S01(「머리를 자른 다음 날」)의 핵심 판단 이동 "팔로워 = 구매가 아니다"와 같은 축이다. 이 기사의 Knowledge Unit(팔로워-참여 연구)은 S01 Knowledge Claim K1의 **부분 근거**로 쓸 수 있다. 다만 K1은 "무비용 반응과 구매 의사의 차이"이고 이 연구들은 참여만 측정했으므로, K1을 완전히 대체하지는 못한다. `Demand Before Build` 계열 기사는 여전히 필요하다.

## 5. 등록 전 남은 단계 (이 세션에서 수행 불가)

| # | 단계 | 이유 |
| --- | --- | --- |
| 1 | 내부 링크 3개 이상 | `amu-magazine` MCP 없음. 자매 기사 2편 + 인플루언서·마케팅 카테고리 기존 글 검색 |
| 2 | 이미지 1개 이상 + 커버 | `genstudio` MCP 없음 |
| 3 | 1차 출처 대조 | 특히 Wies et al.의 효과 형태, ELM 단행본 서지 |
| 4 | `category` 실재 확인 (`marketing-strategy`) | taxonomy 조회 |
| 5 | 9축 판정 | 별도 quality reviewer |
| 6 | SEO 게이트 85점·required 통과 | `amu-magazine` MCP |
| 7 | 운영 허용 루트로 파일 이동 후 등록 | 로컬 환경 |

### 이미지 계획 (본문 밖 작업 기록)

| 위치 | 역할 | 방향 | ALT 초안 |
| --- | --- | --- | --- |
| H2-1 직후 | evidence | 텍스트 없는 그래픽 — 오르다 완만하게 꺾이는 곡선 | 팔로워가 늘수록 반응도 늘지만, 콘텐츠 설득력은 숫자에 비례해 커지지 않는다. |
| H2-5 직후 | application | 텍스트 없는 개념 일러스트 — 큰 원 무리 사이에서 작지만 진하게 빛나는 원 하나 | 조회수는 평범해도 독자를 다시 돌아오게 만든 글에 다음 기획의 답이 있다. |

## 6. 별도 기사 후보

1. 만들기 전에 수요를 확인하는 법 — 반응(좋아요·투표)과 구매 의사의 차이 (The World S01 K1·K2 원천)
2. 판단을 바꾸는 콘텐츠는 발행 전에 알 수 있을까 — 이 기사의 `nextQuestion`
3. 프레이밍은 어디까지 정당한가 — 설득과 조작의 경계
