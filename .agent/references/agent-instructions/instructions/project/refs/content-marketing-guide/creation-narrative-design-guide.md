# 제작 서사 자체 기획 가이드 (Creation Narrative Design)

> **상위 기준**: 사업 정의는 `.agent/amu-platform-guide/BUSINESS-CHARTER.md`, 마케팅 목적·R 라우팅·claim 검증은
> `.agent/amu-platform-guide/MARKETING-STRATEGY.md`가 단일 기준이다. 본 문서는 그 기준으로 **제작 서사를 에이전트가 직접 설계하는 절차**를 정의한다.

## 1. 목적과 신설 배경 (2026-08-13)

`TASK-CREATION-LOG`의 첫 실행이 **서사 근거 부재(B-4)**로 차단됐다.
자산 메타(assetId·jobId·templateKey·promptHash·과금 원장)로 확인되는 것은 "무엇을 몇 건 만들었는가"까지이고,
**"어떤 사용자 문제 때문에 어떤 제품 결정을 내렸는가"는 자산 어디에도 없다.**
그 결과 TASK가 매번 사용자의 수동 서사 입력을 기다리며 멈췄다.

기존에는 생성 자산 메타와 작업 기록·운영 로그를 제품 결정과 연결하는 공통 절차가 없었다.
`TASK-CREATION-LOG`에는 특히 대응 장치가 없었고, 본 가이드가 그 장치다.

**해결 방향은 "사용자에게 서사를 받는다"가 아니라 "에이전트가 문서화된 근거에서 서사를 설계한다"다.**
이것은 창작 허용이 아니다. 근거 등급과 표현 규칙으로 창작을 차단한 상태에서의 **설계 위임**이다.

## 2. 적용 범위

- **필수**: `TASK-CREATION-LOG` (Gen Studio·Tutors·Play·Store 제작 서사)
- **보조 적용**: 그 밖의 AMU 자체 소재 TASK에서 `referenceReports`·운영 로그가 없어 제품 결정층이 비는 경우
- **비적용**: 일반 주제 기사(투자·자기계발·테크 등), `TASK-AMU-MAGAZINE` 계열

## 3. 핵심 원칙 — 사실층과 편집층의 분리

콘텐츠의 모든 문장은 아래 둘 중 하나에 속하고, **적용되는 규칙이 다르다.**

| 층 | 내용 | 규칙 |
| --- | --- | --- |
| **사실층** | 관측된 것 — 무엇을 언제 몇 건, 어떤 템플릿·모델로 만들었나. 문서에 확정된 제품 결정·서비스 상태 | **창작 절대 금지.** 근거 소스 인용 필수 |
| **편집층** | 그 사실을 독자 문제로 연결하는 프레임·훅·구성·비유 | **에이전트가 설계한다.** 단 §5 표현 규칙 안에서만 |

기존 금지 규칙("소스·사실 근거 없이 콘텐츠나 성과를 창작하지 않는다")은 **사실층에 적용된다.**
편집층의 프레임 설계를 창작으로 보아 TASK를 정지시키지 않는다. 반대로 편집층이라는 이유로 사실층을 넘어서지도 않는다.

## 4. 서사 근거 소스 등급

서사의 세 요소는 아래 등급의 소스에서만 파생한다. **등급별 필수 요건을 채우지 못하면 §7 게이트로 차단된다.**

| 등급 | 소스 | 이 등급에서 얻는 것 |
| --- | --- | --- |
| **S1 — 생성 증거** | `get_generation_evidence_bundle`, `list_recent_generations`, `list_tutor_personas`, `get_prompt_template`, `get_content_asset` | 관측 사실: 건수·시각·templateKey·모델·공개범위·과금. **프롬프트·템플릿 본문에 명시된 제작 의도** |
| **S2 — 정책 정본** | `.agent/amu-platform-guide/` — `SERVICE-ROLE-MAP.md`(역할·핵심 지표·제약·공개 상태), `BUSINESS-CHARTER.md`(§9 기여 게이트), `AUDIENCE-AND-MEMBERSHIP.md`(독자 정의), `MEASUREMENT-PLAN.md`, 서비스별 `*/GUIDE.md` | **확정된 제품 결정과 그 이유.** 여기에 적힌 결정을 서술하는 것은 창작이 아니다 |
| **S3 — 작업 기록** | `.agent/docs/project/**` 보고서, git 커밋, `.agent/logs/project/**` | 특정 시점의 설계 판단·되돌림·회귀 수정·차단 사유 |
| **S4 — 실제 사용처** | `amu-magazine` `search_posts`·`read_post`(자산이 실제 쓰인 기사), `content-ledger.jsonl`, `content-insights.md`, `customer-objections.md` | 사용자에게 보인 변화, 독자가 실제로 말한 문제 |

### 요소별 필수 근거

| 서사 요소 | 필수 근거 | 편집 재량 |
| --- | --- | --- |
| `userProblem` | S2 또는 S4 **1개 이상** (독자 정의·핵심 지표·실제 고객 표현) | 프레임·훅·표현은 설계 가능 |
| `productDecision` | **S2 또는 S3 1개 이상 — 문서 경로와 절·행까지 인용.** S1 단독 불가 | 서술 순서·강조점 |
| `userVisibleChange` | S1 또는 S4 **1개 이상** (실제 자산 또는 실제 사용처) | 표현 |

**`productDecision`을 S1(자산 메타)만으로 세우는 것이 B-4의 실패 지점이다.** 반드시 S2/S3를 동반한다.

## 5. 표현 규칙

### 허용

- 정책 정본에 확정된 결정을 AMU의 결정으로 서술 — 근거 문서·절을 `narrativeBasis`에 남긴다
- 프롬프트·템플릿·페르소나 문서에 **명시된** 제작 의도를 독자 언어로 번역
- 편집적 문제 제기·해석·비유를 **일반론**으로 서술 (`~인 경우가 많다`, `~하기 쉽다`)
- 확인된 자산 건수·기간·templateKey·모델을 실측으로 제시

### 금지

- **없었던 내부 일화의 서술** — 회의·시행착오·실패·팀 대화·"처음에는 ~했다가". S3 보고서 근거가 있을 때만 허용한다
- **미실측 수치·성과** — 건수·비율·기간·개선폭은 S1/S4 실측만. 추정은 "추정"으로 표기
- **문서화되지 않은 향후 계획·출시 시점·기능 예고**
- **독자 반응·후기·인용의 창작** — 실제 댓글은 `customer-objections.md`의 원문만
- **튜터·캐릭터에 문서화되지 않은 설정 부여** — 백스토리·성격·대사는 프롬프트·페르소나 문서 범위 안으로 제한
- **근거 없는 1인칭 회고체** — "우리는 고민했다/깨달았다"를 S3 없이 쓰지 않는다
- 편집층 프레임을 관측 사실처럼 단정하는 서술

### 보고 표기 의무

사용자 보고에는 서사 3요소별로 **어느 문장이 실측이고 어느 문장이 편집 기획인지 구분해 적는다.**
콘텐츠 본문에는 기존 QA Gate의 추정 표기 규칙을 그대로 적용한다.

## 6. 설계 절차

1. **S1 확보** — 자산 증거를 먼저 고정한다(evidence bundle 차단 경고 없음 → `proofLevel` 승격). 여기서 실패하면 서사 설계로 넘어가지 않는다.
2. **S1에서 제작 의도 추출** — 프롬프트·템플릿 본문에 이미 적힌 의도를 뽑는다. 이것은 사실층이다.
3. **S2 조회** — 해당 서비스의 `SERVICE-ROLE-MAP` 역할·핵심 지표·제약, 서비스 `GUIDE.md`, 필요 시 `BUSINESS-CHARTER §9`. 이 자산 묶음이 **어느 제품 결정의 실행인지** 특정한다.
4. **S3 탐색(선택)** — 관련 보고서가 있으면 판단·되돌림을 가져온다. `.agent/docs` 전체 grep 금지 — 파일명(slug)으로 후보를 좁힌 뒤 해당 파일만 읽는다.
5. **S4 확인** — 자산이 실제로 쓰인 기사·소셜을 `search_posts`/ledger로 확인해 `userVisibleChange`를 실측으로 만든다.
6. **3요소 조립** — `userProblem → productDecision → userVisibleChange`. 카탈로그 나열·"~를 구현했습니다"식 서술 금지.
7. **`narrativeBasis` 기록** — §8 규격으로 queue 항목에 남긴다.
8. **§7 게이트 판정** → 통과 시에만 본문 생성으로 진행한다.

## 7. 서사 근거 게이트 (fail-closed)

아래 중 하나라도 미충족이면 **본문을 만들지 않고 `blocked`로 보고한다.**

| # | 조건 |
| --- | --- |
| 1 | `productDecision`에 S2 또는 S3 근거가 1개 이상 있고, 문서 경로와 절·행을 인용했다 |
| 2 | `userVisibleChange`에 S1 또는 S4 근거가 1개 이상 있다 |
| 3 | `userProblem`에 S2 또는 S4 근거가 1개 이상 있다 |
| 4 | 본문의 모든 수치가 S1/S4 실측이거나 "추정"으로 표기됐다 |
| 5 | §5 금지 항목에 걸리는 문장이 없다 |

**근거가 부족하면 서사를 약하게 쓰는 쪽을 택한다.** 근거를 만들어 게이트를 통과시키지 않는다.
게이트 미통과 시 어떤 등급의 근거가 없어서 막혔는지 보고에 적는다 — 다음 사이클의 수집 대상이 된다.

## 8. `narrativeBasis` 기록 규격

queue 항목(`entries[].narrativeBasis`)에 아래 구조로 남긴다.

```json
{
  "designedBy": "agent",
  "designedAt": "2026-08-13T00:00:00+09:00",
  "userProblem": {
    "statement": "독자 문제 1문장",
    "sources": [{ "grade": "S2", "ref": ".agent/amu-platform-guide/SERVICE-ROLE-MAP.md §2 Gen Studio", "note": "핵심 지표 근거" }],
    "editorialFraming": "편집층에서 설계한 프레임 1문장"
  },
  "productDecision": {
    "statement": "제품 결정 1문장",
    "sources": [{ "grade": "S2", "ref": "문서 경로 §절", "note": "" }]
  },
  "userVisibleChange": {
    "statement": "사용자에게 보인 변화 1문장",
    "sources": [{ "grade": "S1", "ref": "asset_… 4건 / templateKey", "note": "" }]
  },
  "gate": { "passed": true, "unmetConditions": [], "checkedAt": "2026-08-13T00:00:00+09:00" },
  "claimsAudit": [{ "claim": "본문의 수치·성과 주장", "evidence": "S1 실측 또는 추정", "verdict": "measured|estimated" }]
}
```

- `sources`가 빈 배열인 요소가 있으면 게이트 미통과다.
- `ref`는 재확인 가능한 형태(문서 경로 + 절, assetId, 기사 slug)로 적는다. 요약문만 남기지 않는다.

## 9. 셀프 체크 (본문 생성 직전)

1. 이 글의 `productDecision`은 어느 문서 몇 절에 적혀 있는가? 즉답할 수 없으면 중단한다.
2. 내가 쓴 문장 중 "AMU 내부에서 일어난 일"로 읽히는 것이 있는가? 있다면 S3 근거가 있는가?
3. 수치가 하나라도 실측이 아닌 것이 있는가?
4. 독자가 이 글에서 자기 상황에 적용할 수 있는 것이 1개 있는가? (없으면 에버그린 게이트 조건 2도 미충족이다)
5. 자산을 카탈로그로 나열하고 있지 않은가?

## 10. 참조

- 에버그린 아카이빙 게이트·QA Gate: `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`
- 기사 규격: `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`
- 채널 사전·사후 적합도: `{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`
- 작업 기록 근거: §4의 S3(보고서·운영 로그·git 커밋)
- MCP 도구 공통 체크리스트: `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`
- 근거 보고서: `.agent/docs/project/2026/08/20260813_110836__task-creation-log-tutor-seoyujin-blocked.md` (B-4)
