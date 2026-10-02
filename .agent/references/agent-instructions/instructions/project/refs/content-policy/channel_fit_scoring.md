# Channel Fit Scoring Rules (채널 적합성 점수화·검증)

## 목적

콘텐츠가 대상 채널 형식과 생성자별 마케팅·광고 전략에 얼마나 부합하는지 발행/제출 전에 분리 점수화한다.
`channelFit`은 채널 형식 품질, `marketingFit`은 마케팅 목표 정렬, `adFit`은 광고 소재 재사용 적합성을 뜻한다.
기존 규칙(social_media_tone, marketing_content_pipeline, content_production_workflow,
naver_google_keyword_marketing, naver_blog_content_strategy)의 기준을 계량화한 것으로,
새로운 품질 기준을 만들지 않는다.

## 적용 시점 (필수, 전략 조회 + 2단 게이트)

0. **(최선행) 정책 정본 확인**: `.agent/amu-platform-guide/BUSINESS-CHARTER.md`의 사업 정의와 `MARKETING-STRATEGY.md`의 마케팅 목적(§1)·**R 라우팅(§6)**·소속 캠페인(§9)을 먼저 확정한다. R 등급/캠페인이 정해지지 않은 상태에서 Pre-Fit을 수행하지 않는다. **문서 내 절 번호는 개정마다 바뀔 수 있다 — 참조 전 `MARKETING-STRATEGY.md`의 실제 목차와 대조한다(2026-08-26 §3/§5 참조가 실제로는 §6/§9로 밀려 있던 걸 발견해 정정).**
   > 구 `P0~P4`(Gen Studio 근접도)는 **R0~R4(관계 기여도)**로 대체됐다(ADR #16). 소셜 생성이면 `list_keyword_profiles`로 `uploadPolicy`도 함께 조회한다(ADR #19).
   > **드리프트 점검**: `marketingCriteria.version`/`updatedAt`이 `MARKETING-STRATEGY.md`의 `문서 버전`/`최종 갱신`보다 오래됐으면, 실행 계층(`channelGuidance` 등)이 최신 전략을 반영하지 못했을 수 있다 — `MARKETING-STRATEGY.md` §17 실행 계층 동기화 체크리스트를 먼저 확인한다(2026-08-26 Discovery Layer 미반영 사고 재발 방지).
0.1. **(선행) 자기 개선 루프**: 콘텐츠 생성 착수 전 이전 콘텐츠의 성과 회고를 먼저 수행한다
   (`{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`의 `자기 개선 루프 (성과 피드백)`) — 회고 결과는 Pre-Fit 판단과 본문 생성 지시에 반영
0.5 **전략 원장 확인**: marketing-ops `prepare_local_generation.contentFitStrategies`로 유니버스별 마케팅/광고 기준과 버전을 확인하고 `{{AGENT_ROOT}}/refs/marketing-guide/*`를 함께 확인한다. 로드 오류 시에만 `get_content_fit_strategies`를 1회 호출한다.
   > 원장 목록에는 레거시 쉼표 분리 저장으로 한 문장이 여러 항목처럼 보이는 데이터가 남아 있을 수 있다. 항목 단위로 기계적 대조하지 말고 문장을 복원해 판단한다. UI와 서버는 새 입력부터 줄바꿈만 항목 경계로 취급한다.
1. **사전 적합도 게이트(Pre-Fit)**: 채널별 본문을 생성하기 **전**, 소재×채널 적합도를 판단해
   부적합 채널은 생성 자체를 스킵한다 (아래 `사전 적합도 게이트` 섹션)
2. **사후 채점(Channel Fit, 100점)**: 소셜/블로그 콘텐츠(naver_blog, linkedin, threads, instagram)
   초안 완성 직후, 발행/제출 전에 적용한다

- marketing-ops `submit_local_generation`의 validation 산출물에 `channelFit`, `marketingFit`, `adFit` 블록을 모두 포함
- 신규 네이버 블로그 글은 `naver_blog_content_strategy.md` 품질 게이트로 필수 적용
- WP 매거진 기사 본문은 기존 `amu-magazine` SEO 게이트(85점)를 그대로 사용하고,
  본 점수는 매거진 기사의 소셜 재가공분에만 적용

## 사전 적합도 게이트 (Pre-Fit, 생성 전 필수)

### 시점과 대상

- marketing-ops `enqueue_content`의 `channels` 지정 전(또는 채널별 draft 작성 착수 전)에 수행
- 기본 후보 채널(threads, linkedin, naver_blog, instagram) 각각에 대해 독립적으로 판정
- instagram은 marketing-ops 지원 채널 — 적합 판정 시 enqueue `channels`에 포함한다. 단 이미지 필수 채널이므로 draft 완료/발행 전 `apply_channel_action(attach_image)`로 이미지를 첨부하고, 이미지 소스가 없으면 Pre-Fit `feasibility`에서 감점/스킵한다 (`content_production_workflow.md` 산출물 표준 참조)
- **instagram 이미지는 기존 자산만 사용한다(2026-08-06 사용자 지시).** 카드뉴스·릴스용 이미지를 새로 생성하지 않는다. 재사용 대상은 ① 소스 기사 본문에 이미 들어간 이미지 ② 해당 소재로 이미 생성해 둔 Gen Studio 자산(`list_images`·`search_images`·`list_recent_generations`) ③ 템플릿 기반 기존 샘플 이미지다. 재사용 가능한 자산이 없으면 **새로 만들지 말고** `feasibility`를 감점해 스킵한다 — 이미지 확보를 위한 `generate_image` 호출은 instagram 사유로는 금지한다
  - 장수는 확보한 기존 자산 수에 맞춘다. 5~7장을 채우려고 이미지를 생성하지 않으며, 1~2장만 있으면 단일 이미지 또는 2장 캐러셀로 구성한다
  - 이 제한은 instagram 재가공에만 적용된다. 매거진 기사 본문용 이미지 생성은 `magazine_knowledge_article.md` 규칙을 그대로 따른다

### 선행 판정 — 주제 귀속 (축 채점보다 먼저, 필수)

**축 점수를 매기기 전에** 소재가 등록된 키워드 클러스터·프로필 중 어디에 귀속되는지 먼저 확정한다.

1. `list_keyword_profiles`로 `clusters`·`profiles`를 조회한다 (매 사이클 조회. 이전 세션 값이나 문서의 값을 기억해서 쓰지 않는다)
2. 소재를 클러스터 1개에 배정한다. 배정 결과와 근거를 Pre-Fit 표에 `클러스터` 열로 남긴다
3. **귀속 클러스터가 없으면 `naver_blog`를 `enqueue_content`의 `channels`에서 제외한다.** 축 채점을 수행하지 않으며, 임시 앵커를 만들어 검색 수요를 확인하지 않는다
4. 클러스터·프로필 신설이 필요하다고 판단하면 **생성을 멈추고 사용자 승인을 먼저 받는다**

> 소재 선정이 채널 배정보다 앞서야 한다. "리뉴얼 대상 구본이니 재가공한다"처럼 대기열 기준으로 채널이 먼저 정해지면
> 이 판정이 사후 정당화로 변한다. `naver-rewrite` 대기열의 구본은 현재 블로그 주제 축과 무관한 것이 다수이므로
> **큐 유입 소재는 예외 없이 이 선행 판정을 통과해야 한다.**

### 평가 축 (20점 만점, 각 0~5점)

| 축 | key | 판단 질문 |
|---|---|---|
| 독자 적합성 | `audience` | 이 채널의 독자가 이 소재에 반응할 근거가 있는가 |
| 전환 연결성 | `conversion` | 채널 안에서 CTA/전환 경로가 자연스럽게 성립하는가 |
| 규격 실현성 | `feasibility` | 소재를 채널 규격·톤으로 재구성할 재료(분량/비주얼/근거)가 충분한가 |
| 시의성·중복 | `timing` | 지금 이 채널에 낼 이유가 있고, 최근 유사 콘텐츠가 없는가(ledger 대조) |

### Discovery 재가공 보정 (threads·instagram, 신설 2026-08-26)

`MARKETING-STRATEGY.md` charter-v3.6(2026-08-24)의 Discovery Layer(`CONTENT-INTELLIGENCE.md` §13~18)에 맞춰 threads·instagram의 marketing-ops `channelGuidance`(version 16, 2026-08-26 갱신)에 **모드 B(Discovery 재가공)**가 추가됐다. AMU 자체 경험/사업 연결이 없는 매거진 소재(빅테크·투자·심리·마케팅이론 등 일반 정보성 리뉴얼 포함)도 아래를 충족하면 threads·instagram에서 `부적합` 처리하지 않는다.

- **Discovery 7문항**(`CONTENT-INTELLIGENCE.md` §16): Familiarity·Surprise·Question·Mechanism·Visual·Utility·Cluster. 6~7개 충족 → `audience`·`feasibility` 축 상단(4~5점) 근거로 인정. 4~5개 충족 → 중간(2~3점). 0~3개 충족 → 기존 4축 채점(모드 A 기준)만으로 판단
- 이 보정은 **threads·instagram에만** 적용한다. linkedin은 channelGuidance에 별도 모드 B(산업 해석)가 있으나 Discovery 7문항 보정 대상은 아니며 기존 4축을 그대로 쓴다. naver_blog는 C-Rank 주제 잠금(`naver_blog_content_strategy.md`)이 우선이라 이 보정을 적용하지 않는다
- Discovery 모드로 채점한 경우 Pre-Fit 표의 사유 칸에 `Discovery n/7`을 함께 적는다
- linkedin 모드 B(산업 해석)는 `audience`·`conversion` 판단 시 "AMU 사업 연결 필수"를 요구하지 않되, 검증된 데이터·통계 기반이어야 한다(추정 소재 금지)
- 이 보정 이전 판정(예: 2026-08-26 세션 초반 7건)은 구버전 channelGuidance(version 15) 기준이었으므로 재평가 시 최신 조회 결과로 다시 판단한다

### 판정과 조치

| 점수 | 판정 | 조치 |
|---|---|---|
| 16~20 | `적합` | 해당 채널 생성 진행 |
| 12~15 | `보류` | 앵글/포맷 조정안을 세워 1회만 재판정, 그래도 15 이하면 스킵 |
| 0~11 | `부적합` | **해당 채널 스킵** (생성하지 않음) |

- 스킵된 채널은 `enqueue_content`의 `channels`에서 제외한다
- '적합' 판정 채널은 곧바로 생성하지 않고, `{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`의 일일 draft 쿼터를 확인한다. cap 미만이면 생성, cap 도달이면 같은 문서의 "선행 생성·예약 등록(D+5 창)" → "대기 큐 등록 게이트" 순으로 판정하고 `channels`에서 제외한다. 같은 날 cap 경쟁 시 퍼널(P0>…>P4)→Pre-Fit 점수→FIFO 순으로 상위만 생성한다
  - 게이트 통과(퍼널 P0/P1 + Pre-Fit 18점 이상) → `.agent/content/articles/queue/upload-queue.json`에 대기 등록하고 "쿼터 대기"로 보고(부적합 스킵과 구분)
  - 게이트 미통과(퍼널 P2 이하 또는 Pre-Fit 16~17) → **큐에 넣지 않고 매거진 draft 완료로 종결**하고 "완료 종결"로 보고. 스킵·드롭이 아니라 정상 결과다
  - **매거진 draft 등록은 이 판정과 무관하게 항상 수행한다.** 소셜 재가공 여부가 기사 완료를 막지 않는다
- **모든 후보 채널이 부적합이면 소스 자체를 보류**하고 사유를 보고한다 (억지 생성 금지)
- 축별 점수에 1줄 근거 필수 (사후 채점과 동일하게 근거 없는 만점 금지)

### 기록 (스킵도 기록한다)

- 스킵 채널은 `.agent/content/content-ledger.jsonl`에 기록하지 않되, 사용자 보고에 채널별 pre-fit 표를 포함한다:
  `채널 | 귀속 클러스터 | pre-fit 점수 | 판정 | 사유(스킵 시)`
- 귀속 클러스터가 없어 스킵한 경우 사유에 `클러스터 미귀속`을 그대로 적고, 점수 칸은 `-`로 둔다 (축 채점을 하지 않았다는 뜻)
- 생성 진행 채널은 사후 channelFit 블록에 `"preFit": 18` 필드를 함께 기록한다
- 같은 소재의 스킵 채널을 나중에 다른 앵글로 되살릴 경우, 새 pre-fit 판정을 다시 수행한다

## 평가 축 (사후 채점, 합계 100점)

| 축 | key | 배점 | 기준 문서 | 핵심 체크 |
|---|---|---|---|---|
| 톤·문체 적합성 | `tone` | 20 | social_media_tone.md | 채널 레지스터(해요/습니다), 반말 혼용, 금지 표현 |
| 규격·구조 | `format` | 15 | marketing_content_pipeline.md 채널 기준 | 분량/H2/리스트/시리즈 규격 |
| 검색·노출 최적화 | `discoverability` | 20 | naver_google_keyword_marketing.md 외 | 채널별 노출 요인(아래 표) |
| 전환 설계 | `conversion` | 15 | content_production_workflow.md + Charter §5 | CTA 1개, 링크 정책, 전환 목표 명시, 라우팅 표와 축 일치 |
| 소스 근거·사실성 | `grounding` | 15 | content_production_workflow.md | 소스 링크/슬러그, 수치 출처, 추정 표기 |
| 중복·리스크 | `riskFree` | 15 | content-ledger, 유사문서 기준 | dedupe 통과, 복붙 없음, 기만·허위 주장 신호 |

### 축별 감점 기준

- `tone` (20): 반말·평어 종결 1건당 -5 / AI 패턴·금지 어휘 1건당 -2 / 채널 레지스터 불일치 -5
- `format` (15): 분량 규격 이탈 -5 / 필수 구조 요소(H2·리스트·체크리스트 등) 누락 1건당 -3
- `discoverability` (20): 키워드 제목 미반영 -8 / 첫 문단(첫 줄) 훅·키워드 부재 -5 / 체류·저장 유도 요소 부재 -4 / 발행 리듬 위반 -3
- `conversion` (15): Primary CTA 0개 또는 2개 이상 -5 / 보조 행동 2개 이상 -5 / 보조가 Primary와 다른 축이면서 관계 행동도 아님 -5 / 본문 링크 정책 위반 -5 / 전환 목표(메타) 미기재 -5 / Charter §5 라우팅과 다른 축의 CTA -15(즉시 부정)
  > **2026-08-14 개정(Charter §5.3)**: 종전 "CTA 총 1개" 규칙은 **"Primary CTA 1개 + 보조 행동 1개까지"**로 완화됐다. 보조 행동이 있다는 이유만으로 감점하지 않는다.
- `grounding` (15): 소스 링크/슬러그 누락 -8 / 근거 없는 수치("추정" 미표기) 1건당 -4
- `riskFree` (15): dedupeKey 중복 -15(즉시 부정) / 원문 문장 복붙(연속 2문장) -8 / 제목-본문 불일치·핵심 조건 은폐·허위 후기·근거 없는 성과 주장 1건당 -4

> `MARKETING-STRATEGY.md`의 "성장 제1원칙 — 강한 표현 허용 원칙"에 따라, 강한 문제 제기·감정적 확대·도발적 질문·극적 대비·실패담은 그 자체로 감점하지 않는다. 실제 경험·확인된 문제·합리적 의견에 기반하는지, 본문이 훅의 약속에 답하는지로 판정한다.

### 채널별 `discoverability` 세부 기준

| 채널 | 노출 요인 |
|---|---|
| naver_blog | 롱테일 키워드 제목/첫 문단, H2 키워드, 체류 유도 구조(목차·이미지·체크리스트), 발행 리듬 |
| linkedin | 첫 줄 훅(통계/반전), 번호 리스트 3~5개, 마무리 질문 |
| threads | 정보 밀도(저장 가치), 150~500자, 시리즈 구조(1/5 등), 강하지만 사실에 근거하고 맥락이 완결된 문장, 줄바꿈 규격 준수(`social_media_tone.md`) — 40자 초과 줄·3줄 초과 문단·본문 내 해시태그 혼입 1건당 -2, 형식 감점 합계 최대 -6 |
| instagram | 재사용 가능한 기존 비주얼 자산 존재, 확보한 장수 안에서의 정보 밀도, 전후 비교/단계 구조 |

## 채점 규칙

- 각 축은 만점에서 감점제로 산출하고, **축별 점수에 1줄 근거를 반드시 남긴다** (근거 없는 만점 금지)
- 감점 근거는 본문에서 실제 문장을 인용해 확인한다 (인상 채점 금지)
- 동일 콘텐츠 재채점은 보완 후 1회만 허용

## 판정 기준

| 점수 | 판정 | 표기 | 조치 |
|---|---|---|---|
| 85~100 | 긍정 | `✅ 긍정 (발행 적합)` | 발행/제출 진행 |
| 70~84 | 조건부 | `⚠️ 조건부 (보완 필요)` | 미달 축 보완 후 재채점 1회 |
| 0~69 | 부정 | `❌ 부정 (재작성)` | 재작성. 동일 소스 2회 연속 부정이면 소스 부적합으로 보고 |

## 생성자별 전략 적합도 (필수)

### `marketingFit`

- 기준: 등록된 목표, 타깃 페르소나, 퍼널, 주요 전환, 핵심 메시지, 필수/제외 주제, 채널별 가이드
- 채널별 초안이 목표와 CTA에 실제로 정렬되는지 평가하며 `channelFit`의 형식 점수를 재사용하지 않는다.

#### 주제 귀속 선결 조건 (fail-closed, 점수 계산보다 먼저)

점수를 매기기 전에 소재가 **등록된 키워드 클러스터·프로필 중 하나에 귀속되는지** 먼저 판정한다
(`list_keyword_profiles`의 `clusters`·`profiles`). 귀속 프로필이 없으면 다음을 강제한다.

- 판정용 **임시 앵커를 새로 만들어 실측하지 않는다.** 임시 앵커로 검색 수요를 확인하는 행위 자체가 "이 소재는 등록된 주제 영역 밖"이라는 증거이며, 그 수치를 적합 근거로 인용하는 것을 금지한다
- 해당 채널 `marketingFit`을 **즉시 `not_fit`(점수 계산 생략)** 으로 확정하고, 본문을 생성하지 않는다
- 이 신호는 `warnings`가 아니라 **`issues`에 기록한다.** `no_registered_keyword_profile_for_*` 계열을 warnings에 넣어 점수·verdict에 반영하지 않는 처리를 금지한다
- 클러스터·프로필 신설은 **사용자 승인 사항**이다. 에이전트가 판단으로 신설하거나, 승인 없이 기존 프로필에 억지로 귀속시키지 않는다
- 이미 enqueue된 job이면 `submit_local_generation`에 `excluded: true` + `exclusionReason`을 제출한다

> 근거: 2026-08-13 `marketing_job_9adb2359e52e4a0a987b397c60f1ab3e`. 등록 프로필 5종 어디에도 속하지 않는 심리·정서 소재가
> 임시 앵커(우울증)로 실측돼 `warnings`에만 기록됐고, 점수에 반영되지 않아 `fit` 88로 검수 대기열까지 올라갔다.
> 보고서: `.agent/docs/project/2026/08/20260813_223040__naver-blog-off-topic-draft-gate-failure-analysis.md`

#### 채점 규칙 (100점 감점제, 미충족 열거 필수)

- `reasons`에는 **충족 항목뿐 아니라 미충족·판정불가 항목을 반드시 함께 열거한다.** 충족 항목만 나열해 고득점을 만드는 것을 금지한다
- 해당 채널 `channelGuidance`의 **전 항목을 빠짐없이 대조**하고, 인용하지 않은 항목이 남으면 채점을 완료하지 않는다

| 사유 | 감점 |
| --- | --- |
| `channelGuidance` 항목 미충족 1건당 | -10 |
| `channelGuidance` 항목 판정불가(근거 부족) 1건당 | -5 |
| `requiredTopics` 미충족 1건당 | -10 |
| `excludedTopics` 해당 | **즉시 `not_fit`** (점수 계산 생략) |
| 주제 귀속 프로필 없음 | **즉시 `not_fit`** (위 선결 조건) |

- 소재 성격상 구조적으로 충족할 수 없는 항목(예: R4 고정으로 확장 CTA가 금지된 소재의 "확장 경험 연결")도 **감점 대상이다.** "이 소재에서는 해당 없음"으로 면제 처리하지 않는다. 면제가 필요하면 그 채널을 스킵하는 것이 올바른 결론이다

### `adFit`

- 기준: 광고 목적, 타깃 오디언스, 오퍼, 랜딩, 필수/금지 주장, 필수 고지, 측정 계획
- 광고 소재로 재사용할 적합성을 평가하는 추천 정보이며 플랫폼 광고 심사 승인이나 성과 보장이 아니다.
- 조회수·클릭·전환·매출의 절대값 예측을 금지한다.

#### 필수 확인 4항목 (감점 기준)

전략 원장(`contentFitStrategies.advertising.criteria`)의 값을 그대로 대조한다. 아래 문구를 이 문서에 옮겨 적지 않는다 — 원장이 단일 출처이며 버전이 바뀐다.

| 항목 | 확인 내용 | 미충족 감점 |
| --- | --- | --- |
| 오퍼 | `criteria.offer` 중 **하나만** 골라 구체적 사용 장면과 함께 제시했는가 | 오퍼 문장 없음 -10 / 2개 이상 혼용 -10 |
| 랜딩 | `criteria.landingPage`로 이어지는 경로가 있는가(기사 링크만 있으면 미충족) | -10 |
| 필수 고지 | 소재에 해당하는 `criteria.requiredDisclosures` 항목을 본문에 포함했는가 | 누락 1건당 -8 |
| 측정 | UTM이 붙어 있는가 — 규격은 `{{AGENT_ROOT}}/refs/content-policy/measurement_and_conversion.md` | -6 |

- `criteria.prohibitedClaims`에 해당하는 표현이 1건이라도 있으면 **즉시 `not_fit`**으로 판정한다(점수 계산 생략).
- 소재별 필수 고지 판단: AI 생성 결과물을 다루면 "생성 결과 편차"와 "발행·상업적 사용 전 검토" 고지가 항상 대상이다. 코인·과금을 언급하면 코인 사용량 고지가, 학습·튜터 소재면 학습 결과 미보장 고지가 추가된다.
- **매거진 기사 재가공분은 오퍼·랜딩·고지가 없는 것이 정상이다.** 이때 adFit이 `needs_work`로 나오는 것은 결함이 아니라 "광고로 쓰려면 별도 버전이 필요하다"는 신호다. 점수를 올리려고 소셜 초안에 광고 문구를 끼워 넣지 않는다(`channelFit`의 `conversion`·`riskFree`와 충돌한다).
- 광고 재사용을 전제로 만든 소재만 위 4항목을 채워 `fit`을 목표로 한다.

### 공통 판정

| 점수 | verdict | UI 추천 뱃지 |
|---|---|---|
| 85~100 | `fit` | `마케팅 적합` / `광고 적합` |
| 70~84 | `needs_work` | `마케팅 보완` / `광고 보완` |
| 0~69 | `not_fit` | `마케팅 부적합` / `광고 부적합` |

- signal은 각각 `green`, `yellow`, `red`로 병기한다.
- 전략이 미등록이면 임의 기준을 만들지 않고 `strategyVersion: 0`, `not_fit`, 미등록 사유를 기록한 뒤 운영자에게 등록을 요청한다.
- 전략 변경 후 이전 결과를 최신처럼 취급하지 않는다. 저장된 `strategyVersion`이 현재 버전보다 낮으면 재검사 대상으로 표시한다.

## 노출 효과 예상 (정성 등급)

- `discoverability` 점수 기반: 18~20 `상` / 14~17 `중` / 13 이하 `하`
- 등급에는 근거 1줄 필수 (예: "상 — 키워드 제목+첫 문단 일치, 체크리스트 포함")
- **조회수/유입량 등 수치 예측은 금지** (근거 없는 확정치 생성 금지 원칙 동일 적용)

## 출력 형식 (표준 validation 적합도 블록)

```json
{
  "channelFit": {
    "channel": "naver_blog",
    "preFit": 18,
    "score": 91,
    "verdict": "긍정",
    "verdictEn": "positive",
    "signal": "green",
    "axes": { "tone": 20, "format": 13, "discoverability": 18, "conversion": 15, "grounding": 13, "riskFree": 12 },
    "axisNotes": {
      "format": "체크리스트 미포함 -2",
      "grounding": "통계 1건 출처 링크 누락 -2(추정 표기로 보완)",
      "riskFree": "원문 유사 표현 1건 재작성 반영 -3"
    },
    "expectedExposure": "상 — 키워드 제목+첫 문단 일치, 체류 유도 구조 충족",
    "checkedAt": "2026-07-08T09:00:00+09:00"
  },
  "marketingFit": {
    "kind": "marketing",
    "channel": "naver_blog",
    "score": 91,
    "verdict": "fit",
    "signal": "green",
    "summary": "등록된 블로그 목표와 타깃·CTA에 적합합니다.",
    "reasons": ["AI 실전 활용 카테고리와 주요 전환이 일치합니다."],
    "recommendations": [],
    "strategyVersion": 3
  },
  "adFit": {
    "kind": "advertising",
    "channel": "naver_blog",
    "score": 76,
    "verdict": "needs_work",
    "signal": "yellow",
    "summary": "광고 소재 재사용 전 오퍼 연결 보완이 필요합니다.",
    "reasons": ["랜딩과 오퍼가 본문에 충분히 연결되지 않았습니다."],
    "recommendations": [{ "action": "오퍼와 랜딩 연결 문장 보강", "reason": "광고 클릭 이후 기대를 맞춥니다." }],
    "strategyVersion": 2
  }
}
```

- marketing-ops validation_report에 위 세 블록을 최상위로 포함한다.
- `.agent/content/content-ledger.jsonl` 항목에는 요약형으로 기록: `"channelFit":{"preFit":18,"score":91,"verdict":"positive"},"marketingFit":{"score":91,"verdict":"fit","strategyVersion":3},"adFit":{"score":76,"verdict":"needs_work","strategyVersion":2}`
- 사용자 보고 시 채널별 1행 표로 요약: `채널 | 점수 | 판정 | 노출 예상 | 주요 보완점`

## impactScore와의 관계 (서버 산출 보조 지표)

- `impactScore`는 node-app 서버(marketing-ops)가 draft 스키마·CTA·링크·이미지 준비 상태로 산출하는 1차 자동 점수다 (신호등: green 85+ / yellow 70~84 / red 0~69).
- **발행 게이트의 기준은 본 문서의 channelFit(에이전트 채점, 축별 근거 필수) 85점이며, impactScore는 검수 UI 신호등 표시·하한 검증용 보조 지표다.**
- `impactScore` 또는 기존 `긍정` 판정을 `마케팅 적합`/`광고 적합`으로 자동 변환하지 않는다. 추천 뱃지는 해당 전략 버전으로 생성된 `marketingFit`/`adFit`만 표시한다.
- `submit_local_generation`의 validation에 channelFit 블록을 포함하면 서버가 최상위로 승격해 검수 UI에 표시한다. 서버 계약(`MarketingValidationReport.channelFit`)과의 정합을 위해 `verdictEn`("positive"|"conditional"|"negative")과 `signal`("green"|"yellow"|"red")을 병기한다.
- 에이전트 채점과 서버 impactScore가 크게 어긋나면(예: 에이전트 90점 vs 서버 red) 발행 전 원인을 확인하고 사용자 보고에 명시한다.

## 금지 사항

- 채점 근거 없는 점수 부여, 관성적 만점
- 부정 판정 콘텐츠의 발행/제출 진행
- 점수 인플레이션: 감점 사유를 알고도 미기재하는 것
- 조회수·유입량 수치 예측 산출
- 사전 게이트 없이 전 채널 일괄 생성하는 것, 부적합 판정 채널을 근거 변경 없이 재생성하는 것
