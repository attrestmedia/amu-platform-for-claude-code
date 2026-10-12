# AMU Intelligence Pattern System 정책 (SSOT)

> **이 문서의 지위**: AMU Magazine 기사에서 재사용 가능한 Intelligence를 판정·추출·검토하고 Pattern Registry에 연결하는 기준의 단일 출처.
>
> 이 문서에서 공식 명칭은 `AMU Intelligence Pattern System`이다. 참고 문서와 초기 요청의 `Interlligence`는 같은 시스템을 가리키는 오탈자로 취급한다.

* 문서 버전: `intelligence-pattern-policy-v1.3`
* 최종 갱신: 2026-09-05
* 상위 기준: `BUSINESS-CHARTER.md` → `MARKETING-STRATEGY.md`
* 인접 정본: `CONTENT-INTELLIGENCE.md`, `PROOF-BANK.md`, `MEASUREMENT-PLAN.md`

---

## 1. 최상위 원칙

1. Magazine의 첫 번째 독자는 사람이다. Pattern Bank를 위한 데이터 입력 화면으로 만들지 않는다.
2. Intelligence는 좋은 기사를 만드는 과정에서 발견하고, 완성된 기사에서 구조화한다.
3. 사실·사례·해석·Pattern·가설·Proof를 서로 바꾸어 부르지 않는다.
4. 외부 사례에서 관찰된 Pattern은 AMU의 Proof가 아니다.
5. Pattern의 가치는 개수가 아니라 실제 의사결정과 `Next Action`에 재사용되는가로 판단한다.
6. AI는 후보를 제안할 수 있지만 Registry의 생성·병합·승격·폐기는 승인된 규칙과 사람 검토가 결정한다.

```text
독자에게 가치 있는 기사
→ 기사 품질 검토
→ Intelligence 후보 추출
→ 근거·중복·한계 검토
→ Registry 연결
```

`Pattern을 넣기 위한 기사 작성`은 순서를 거꾸로 뒤집으므로 금지한다.

---

## 2. 다른 AMU 체계와의 경계

| 체계 | 뜻 | Intelligence Pattern과의 관계 |
| --- | --- | --- |
| Content Intelligence `Winning Pattern` | 성과 데이터에서 찾은 `Topic × Hook × Format × Content Role × Audience` 조합 | 편집·성과 패턴이다. 전략 원리인 Intelligence Pattern과 자동 병합하지 않는다 |
| Article Experience E1~E3 | 기사의 독자 경험 수준 | 기사 표현·상호작용 축이다. Evidence 등급이나 Pattern 성숙도와 무관하다 |
| Proof Bank | AMU에서 계측·검증해 허용된 주장 | Pattern의 근거로 연결할 수 있지만 Pattern 자체가 Proof로 승격되지는 않는다 |
| Magazine Knowledge Layer | 검색·관련 글·맥락 검색 계층 | Pattern Registry를 검색할 수 있으나 검색 결과가 정본을 변경하지 않는다 |
| Marketing Oops | 현재 병목과 다음 행동을 선택하는 성장 운영 계층 | 승인된 Pattern·AMU Proof·현재 데이터를 읽어 추천 근거로 사용한다 |

모든 구현 필드와 API에서 `intelligencePattern` 네임스페이스를 사용해 기존 `Winning Pattern`과 혼동하지 않는다.

---

## 3. 두 단계 적격성 게이트

기사 발행 품질과 Intelligence 등록 가치는 별개다. Intelligence 게이트 미통과는 일반 기사의 발행 실패를 뜻하지 않는다.

### 3.1 Intelligence Article 적격성

| Gate | 판단 질문 | 필수 근거 |
| --- | --- | --- |
| A1 실제 현상 | 누가 무엇을 했고 무엇이 관찰됐는가 | 출처가 있는 사건·행동·결과 또는 AMU 관찰 |
| A2 추적 가능한 Evidence | 핵심 사실과 해석의 출처를 다시 확인할 수 있는가 | URL·문서·실험·관찰 시점과 claim 상태 |
| A3 메커니즘 | 결과 나열을 넘어 왜 그렇게 됐는지 분석하는가 | 원인·작동 구조와 대안 설명 |
| A4 조건과 한계 | 언제 작동하고 언제 일반화하면 안 되는가 | 적용 조건·반례·불확실성 |
| A5 독자·AMU 가치 | 독자 또는 AMU의 콘텐츠·제품·성장·마케팅·창작·AI 활용·비즈니스·생산성 판단에 쓰이는가 | 구체적인 판단 또는 행동 변화 |
| A6 기사 완결성 | Pattern 메타 없이도 질문·근거·답·적용이 완결되는가 | `CONTENT-INTELLIGENCE.md`의 9축 본문 근거 |

판정은 다음 세 값만 사용한다.

| 값 | 기준 | 조치 |
| --- | --- | --- |
| `none` | A1·A2·A5 중 하나라도 없거나 단순 전달·목록·감상에 머문다 | 추출하지 않는다. 일반 기사로는 별도 품질 게이트에 따라 발행 가능 |
| `candidate` | A1·A2·A5는 있으나 메커니즘·한계·검토가 미완료다 | 후보 메타만 저장하고 Registry 검색·추천에서는 제외 |
| `qualified` | A1~A6을 모두 본문 근거로 통과한다 | 승인된 Intelligence 타입과 기존 Pattern 연결을 검토 |

다음 유형은 기본적으로 `none`에서 시작한다: 단순 뉴스 전달, 제품 스펙 소개, 사실 목록, 근거가 부족한 트렌드 소개, 짧은 의견, 순수 에세이, 단순 사용법. 다만 실제 사례·메커니즘·한계를 새로 입증하면 `candidate`로 재판정할 수 있다.

### 3.2 Pattern 승격 적격성

`qualified` 기사라고 새 Pattern이 반드시 생기지는 않는다. 새 Pattern 또는 기존 Pattern의 새 Evidence로 연결하려면 별도로 다음을 통과해야 한다.

1. `조건 → 행동·구조 → 메커니즘 → 기대 결과`를 한 묶음으로 설명할 수 있다.
2. 특정 기업명·인물·일회성 수치가 없어도 다른 문제에 적용할 수 있다.
3. 최소 두 개의 독립 사례·출처에서 반복 관찰됐거나, 재현 가능한 정량 근거가 있다.
4. 사실·출처 주장·AMU의 해석을 구분하고, 직접 확인하지 못한 의도는 `hypothesis`로 표기한다.
5. 작동하지 않는 조건이나 반례를 최소 하나 기록한다.
6. 기존 Registry의 ID·alias·의미 유사 후보를 먼저 조회한다.

단일 사례는 새 Pattern의 `active` 승격 근거가 아니다. `Case`, `Signal`, `Hypothesis` 또는 기존 Pattern의 보조 Evidence로 저장한다. 적합한 Pattern이 없으면 빈 `primaryPatternRefs[]`가 정상 결과다.

---

## 4. Intelligence 타입과 역할

### 4.1 데이터 타입

| 타입 | 정의 | 최소 조건 |
| --- | --- | --- |
| `Case` | 실제로 발생한 사건·행동·결과 | 추적 가능한 Evidence 1개 이상 |
| `Evidence` | 주장이나 관찰을 지지하는 자료 | 출처·시점·claim 상태 |
| `Signal` | 기회·위험·변화를 나타내는 초기 징후 | 관찰과 해석을 분리하고 확정 표현 금지 |
| `Tactic` | 특정 상황에서 수행하는 구체적 방법 | 대상·순서·실행 조건 |
| `Principle` | 여러 판단에 적용하는 일반 원칙 | 근거·적용 범위·한계 |
| `Pattern` | 특정 조건에서 반복 관찰되고 다른 문제에도 재사용 가능한 행동·구조·전략 원리 | Pattern 승격 게이트 통과 |
| `Anti-pattern` | 반복적으로 실패·비효율·위험을 만드는 구조 | 실패 메커니즘·회피 조건 |
| `Hypothesis` | 아직 검증되지 않은 설명이나 예상 | 검증 상태와 다음 확인 방법 |
| `Proof` | AMU에서 직접 계측·검증되어 대외 사용 범위가 확정된 결과 | `PROOF-BANK.md`의 승인된 참조 |

회사명·제품명·인물·날짜·매출 수치·시장 규모는 `Entity`, `Fact`, `Metric`이지 Pattern이 아니다.

### 4.2 Intelligence Role

기존 `Content Role`·`Article Archetype`과 별개로 다음 중 하나를 둔다.

```text
case | analysis | explainer | experiment | playbook | opinion | none
```

`Intelligence Role`은 기사 형식을 설명할 뿐 적격성을 보장하지 않는다. 예를 들어 `analysis`도 출처와 한계가 없으면 `none`이며, `playbook`도 반복 근거가 없으면 `candidate`다.

---

## 5. Evidence와 Proof 계약

### 5.1 외부 Evidence 수준

LLM의 `confidence: 0.91` 같은 숫자를 근거 강도로 사용하지 않는다. `externalEvidenceLevel`은 다음 값만 사용한다.

| 값 | 의미 | 허용 범위 |
| --- | --- | --- |
| `unsupported` | 의견·추정만 있고 추적 가능한 근거가 없다 | `candidate`의 Hypothesis만 가능 |
| `single_source` | 단일 사례·인터뷰·공식 자료·직접 관찰 | Case·Signal·Hypothesis, 기존 Pattern 보조 근거 |
| `multi_source` | 서로 독립적인 복수 사례·출처 | Pattern 승격 검토 가능 |
| `quantitative` | 방법·분모·기간을 확인할 수 있는 정량 자료 | Pattern 승격 검토 가능, 일반화 한계 필수 |

각 Evidence에는 최소 `sourceType`, `sourceRef`, `articleSpan`, `observedAt`, `claimStatus`, `supports`, `limitations`를 남긴다. `articleSpan`은 원출처를 대체하지 않고 기사에서 그 Evidence가 쓰인 위치를 가리킨다. `claimStatus`는 사업 헌장의 `measured | sourced | hypothesis | prohibited`를 그대로 쓴다.

### 5.2 AMU Proof 분리

- `amuProofRefs[]`에는 `PROOF-BANK.md` 또는 후속 승인 Registry의 유효한 ID만 연결한다.
- AMU 데이터가 있다는 이유만으로 Proof라고 부르지 않는다. 실험 정의·분모·기간·판정·허용 claim이 확정돼야 한다.
- 외부 Evidence만 있으면 “유사 사례에서 관찰됐다”고 표현한다.
- AMU Proof가 연결된 경우에만 해당 Proof의 허용 문구 범위 안에서 “AMU에서도 확인됐다”고 표현한다.
- `amuProofRefs[]`가 비어 있는 것은 결함이 아니다. 추정 ID나 임시 Proof를 만들지 않는다.

---

## 6. 자연스러운 기사 작성 정책

### 6.1 Reader Layer와 Intelligence Layer

독자에게 보이는 `Reader Layer`는 `CONTENT-INTELLIGENCE.md`의 Content Experience System과 9축 품질 게이트를 따른다. 새 고정 목차를 추가하지 않는다.

```text
장면·문제
→ 실제 사건과 Evidence
→ 기대와 현실의 긴장
→ 작동 메커니즘
→ 조건·한계
→ 독자가 적용할 판단 기준
```

백엔드 `Intelligence Layer`만 적격성·타입·Pattern 참조·Evidence·한계·적용 범위를 구조화한다.

### 6.2 Pattern을 이야기로 보여주는 법

Pattern 이름을 설명하는 대신 다음 흐름을 기사 안에서 증명한다.

1. 독자가 알아볼 수 있는 구체적인 상황을 보여준다.
2. 주체가 무엇을 바꿨는지 행동으로 보여준다.
3. 그 변화가 결과에 영향을 준 메커니즘을 Evidence와 함께 해석한다.
4. 작동 조건과 실패할 조건을 함께 밝힌다.
5. 독자가 자기 상황에 옮길 판단 기준으로 마무리한다.

본문에 `Pattern #3`, `Primary Pattern`, `Evidence Level`, Registry ID 같은 내부 라벨을 노출하지 않는다. 널리 쓰이는 개념명이 독자 이해에 필요할 때만 일반 기사 용어로 설명할 수 있다.

### 6.3 수량과 범위

- `Primary Pattern`: 0~3개. 기사의 `primaryQuestion`과 직접 연결된 것만 둔다.
- `Secondary Pattern`: 0~3개. 핵심 답을 보조할 때만 둔다.
- Pattern이 6개를 넘으면 기사 범위가 과도하거나 추출이 세분화된 것으로 보고 분리·병합을 재검토한다.
- `qualified` 기사라도 재사용 가능한 원리가 없으면 Pattern 참조 0개가 정상이다.

### 6.4 금지

- Pattern 개수를 채우기 위한 사례·인과·반례 창작
- 모든 H2를 질문형이나 같은 reveal 문법으로 만드는 형식 패턴화
- 메타 키워드를 제목·리드·소제목에 반복 삽입
- 외부 성공 사례를 보편 법칙이나 AMU 성과로 단정
- 적용 조건을 숨긴 채 성공 사례만 나열
- 내부 분석 Sheet를 그대로 공개 본문으로 변환
- Pattern·서비스 CTA·수익 경로를 한 기사에 무리하게 모두 노출

---

## 7. 작성·추출·승인 흐름

```text
1. Source Intake
2. Article Eligibility Precheck
3. Research / Verification
4. Case Deconstruction
5. Editorial Angle·Content Experience Brief
6. Article Writing
7. 9축 Quality Review·Claim Review
8. 완성 원고에서 Intelligence Candidate 추출
9. 기존 Registry 검색: Reuse / Alias / Merge Candidate / Create Candidate
10. 사람 검토
11. 기사 meta 저장·발행 대기
12. 승인된 Registry 연결
13. 성과·재사용 결과 Review
```

4단계의 내부 후보는 조사 누락을 찾기 위한 도구일 뿐 기사 문장이나 Pattern 생성을 미리 고정하지 않는다. 최종 구조화는 7단계까지 통과한 완성 원고를 기준으로 다시 수행한다.

WP → WP 같은 URL 리뉴얼에서는 기존 기사 원문·성과·Pattern을 writer나 원문 비공개 quality reviewer에게 전달하지 않는다. 새 원고의 독립성 검토가 끝난 뒤 controller가 새 원고에서만 Intelligence를 추출하고 기존 Registry와 대조한다.

---

## 8. Article Intelligence 최소 계약

> **정본 위치 변경 (v1.1, 2026-09-04).** Article Intelligence의 저장 정본은 **node-app**이다. WordPress `amu_article_intelligence` post meta 계약(v1.0)은 **폐기**한다.
>
> 근거 — 실측에서 해당 meta는 local 1건·production 1건(둘 다 postId 15135)뿐이고, 모두 `eligibility=none`에 candidate·Evidence·Pattern·Proof가 전부 빈 검증 fixture였다. 보존할 데이터가 없어 compatibility adapter를 둘 이유가 없다. 폐기 실행·순서·게이트는 `.agent/todo-amu-magazine-intelligence-renewal.json`의 MIR-002와 `G-MIR-05`가 소유한다.
>
> 아래 **필드 의미 계약과 저장·권한 경계는 그대로 유효**하며, 저장 위치만 WordPress post meta에서 node-app collection으로 옮긴다. Registry·추출 pipeline은 이 계약을 확장하지 않고 별도 계약으로 둔다.

필드 집합은 다음으로 확정한다.

```text
contractType
schemaVersion
policyVersion
articleRevision
eligibility
intelligenceRole
extractionStatus
reviewStatus
primaryPatternRefs[]
secondaryPatternRefs[]
candidateItems[]
evidenceRefs[]
externalEvidenceLevel
claimStatus
limitations[]
applicability[]
revenueStages[]
amuProofRefs[]
reviewedAt
reviewedBy
reviewMemo
```

`contractType`은 `article-intelligence-declaration`, `schemaVersion`은 `article-intelligence.v1`이다. `postId`·`postSlug`는 현재 글과 일치해야 하며 `articleRevision`은 WordPress `modified_gmt` 문자열을 사용한다. 입력에 revision이 있으면 현재 revision과 다를 때 stale로 거부한다.

**저장 위치는 node-app이다.** WordPress에는 이 선언을 저장하지 않으며, WordPress는 `postId`·`slug`·`modified_gmt`를 제공하는 원본 시스템으로만 참조한다. 종전 v1.0의 WordPress key `amu_article_intelligence`, 테마 모듈 `inc/actions/article-intelligence.php`·`article-intelligence-editor.php`, MCP `register_article_intelligence`는 폐기 대상이며 새로 사용하지 않는다.

`candidateItems[]`는 `id`, `intelligenceType`, `statement`, `articleSpan`, `sourceRefs[]`, `limitations[]`를 필수로 하며 선택적 `registryRef`만 허용한다. `evidenceRefs[]`는 `id`, `sourceType`, `sourceRef`, `articleSpan`, `observedAt`, `claimStatus`, `supports`, `limitations[]`를 필수로 한다. 후보·Evidence 원문은 복제하지 않고 안전한 source reference와 기사 span만 저장한다. `reviewMemo`는 관리자 검토 사유이며 공개 응답에 노출하지 않는다.

`extractionStatus`는 `not_started | in_progress | extracted | stale | failed`를 사용한다. `revenueStages[]`는 `MEASUREMENT-PLAN.md`의 현행 Revenue Ladder 표시 라벨(`Reach`, `Consumption`, `Relationship`, `Signup`, `Return`, `Expansion`, `Magazine Return`, `Revenue`)만 참조한다. 별도 enum이나 단계 수를 추가하지 않는다.

적격성이 `none`이고 candidate·Evidence·Pattern·Proof가 모두 비어 있는 초기 메타는 “근거 없음” 상태를 기록하는 빈 선언이므로 `externalEvidenceLevel: unsupported`를 허용한다. `candidate` 이상에서 `unsupported`를 사용하면 Hypothesis candidate만 허용한다.

### 8.1 작성 주체 분리 (v1.2, 2026-09-05 신설)

**선언을 한 번에 확정하지 않는다.** 작성 경로는 `writer → normalize → intelligence update`이며,
writer는 자기 원고에서 나온 근거만 선언하고 적격성·Registry·검토 판정은 하지 않는다.

| 구분 | 필드 | 주체 |
| --- | --- | --- |
| 근거 | `externalEvidenceLevel` · `claimStatus` · `applicability[]` · `revenueStages[]` | **writer** |
| 파생 | `candidateItems[]` · `evidenceRefs[]` | **적재 어댑터** — 원고의 `knowledgeUnits[]`에서 만든다 |
| 추출 | `eligibility` · `extractionStatus` | normalize 단계 |
| 검토 | `reviewStatus` · `reviewedAt` · `reviewedBy` · `reviewMemo` | 사람 검토 |
| 연결 | `primaryPatternRefs[]` · `secondaryPatternRefs[]` · `amuProofRefs[]` | Registry 연결 (사람 결정 — §10) |

- **writer는 판정 필드를 원고 메타에 쓰지 않는다. 초기값으로도 넣지 않는다.**
  이 계약은 `eligibility: none`일 때 Evidence·candidate·Pattern·Proof가 **모두 비어 있을 것**을 요구하므로,
  근거를 채운 선언에 `eligibility: none`을 함께 보내면 그 자체로 거부된다.
- `eligibility` 판정은 적재 시점의 normalize가 근거 유무로 내린다.

  ```text
  근거 0건        → eligibility: none        (externalEvidenceLevel도 unsupported)
  근거 1건 이상   → eligibility: candidate
  qualified       → §3.1 A1~A6를 사람이 확인한 뒤에만
  ```

- `candidateItems[]`와 `knowledgeUnits[]`는 `statement`·`articleSpan`·`limitations`를 공유하고
  `intelligenceType`↔`unitType`도 같은 값 집합이다. **writer에게 둘 다 쓰게 하지 않는다** —
  writer는 `knowledgeUnits[]`만 쓰고 적재 어댑터가 `candidateItems[]`·`evidenceRefs[]`를 파생한다.
- 이 분리는 §7의 작성·추출·승인 흐름과 같은 규칙이며, 저장 위치가 node-app으로 옮겨진 뒤의 실행 형태를 명시한 것이다.
- 원고 메타의 필드명·구조는 저장 계약(`magazine_knowledge_articles`)을 정본으로 하며 목록은
  `.claude/refs/content-policy/magazine_knowledge_article.md` §28이 소유한다.

- 선언은 구조화 object 1개로 저장하고 schema 검증·입력 정규화·권한 검사를 서버에서 강제한다.
- 임의 HTML·script·iframe·실행 가능한 payload, 인증 정보, 개인화 결과, 사용자 행동 원문, 비공개 고객 데이터는 저장하지 않는다.
- v1 Evidence는 공개 비개인 자료의 최소 참조와 집계·비식별 AMU 지표로 제한한다. 식별 가능한 인터뷰·리뷰 원문, 회원 행동, 비공개 고객 자료는 사람 승인만으로 예외 처리하지 않는다.
- 식별 가능한 자료가 꼭 필요하면 `legal-policy-review`를 선행하고 목적·법적 근거·동의/철회·보유기간·삭제·접근권·감사 계약을 별도 task로 승인하기 전까지 fail-closed 한다.
- 원문 자료 전체를 복제하지 않고 안정적인 출처 참조와 claim 연결만 저장한다.
- Pattern 이름 문자열보다 Registry ID를 저장한다. Registry 전에는 candidate 상태로 두며 공개 API에 노출하지 않는다.
- candidate 원문·검토 메모·상세 Evidence는 관리자 또는 내부 Registry 범위에 두고 공개 응답에서 제외한다.
- `applicability`는 추천 후보 정보일 뿐 CTA·서비스 노출·실행 권한이 아니다. 서비스 공개와 실행은 `SERVICE-ROLE-MAP.md`와 서버 권위 Registry가 별도로 판정한다.
- 선언이 없거나 유효하지 않아도 공개 기사의 본문·SEO·정적 독서 경험은 유지한다. Article Intelligence는 공개 렌더링을 구동하지 않는다.

---

## 9. Pattern Registry 정책

### 9.1 생성 전 중복 판정

```text
정규화 이름·alias 검색
→ 의미 유사 후보 검색
→ Evidence·조건·메커니즘 비교
→ Reuse / Alias / Merge Candidate / Create Candidate
```

AI가 유사하다고 판단했다는 이유만으로 자동 병합하지 않는다. 서로 반대되는 결과는 하나를 삭제하지 않고 조건·대상·시점 차이를 기록한다.

### 9.2 상태

서로 다른 의미를 하나의 enum에 섞지 않고 세 축으로 관리한다.

| 축 | 값 | 뜻 |
| --- | --- | --- |
| `maturity` | `candidate | emerging | active` | 승인·반복 근거의 성숙도 |
| `scopeStatus` | `general | contextual` | 일반 적용인지 특정 시장·채널·기간 한정인지 |
| `healthStatus` | `current | weakening | deprecated` | 최근 Evidence·반례 기준의 현재 유효성 |

- `candidate`: 미승인 또는 반복 근거 부족. 추천 API 제외.
- `emerging`: 복수 근거가 있으나 재사용 이력이 부족하다. 기본 Next Action 추천에서는 제외하고 연구·검토 surface에서만 보인다.
- `active`: 반복 근거·조건·한계·사람 승인·최근 검토가 모두 있다.
- `contextual`: 요청의 시장·채널·기간이 저장된 scope와 일치할 때만 사용할 수 있다.
- `weakening`: 최근 반례나 환경 변화로 신뢰가 낮아졌다. 추천 제외.
- `deprecated`: 현재 의사결정에 사용하지 않는다. 과거 연결은 보존한다.

초기 추천 allowlist는 `maturity=active`, `healthStatus=current`, `reviewDueAt` 미경과만 허용한다. `scopeStatus=contextual`은 요청 context가 정확히 일치해야 한다.

각 Pattern은 `firstObserved`, `lastObserved`, `lastReviewed`, `reviewDueAt`, `owner`, `aliases`, `counterEvidence`를 가진다. 승인 시 변동성에 따라 재검토 기한을 정한다: AI·플랫폼·가격·알고리즘처럼 변동성이 큰 것은 90일 이내, 시장·제품·운영 process는 180일 이내, 상대적으로 안정적인 원칙은 365일 이내다. 기한이 지나면 자동 폐기하지 않고 추천에서 제외한 뒤 재검토한다.

---

## 10. 자동화 권한과 fail-closed

### AI가 할 수 있는 것

- 기사 적격성 후보와 근거 위치 제안
- 타입·Pattern 후보·alias 후보 추출
- 기존 Registry 유사 후보 검색
- Evidence·한계·반례 누락 경고
- 사람 검토용 diff와 추천 근거 생성

### AI가 할 수 없는 것

- Pattern 자동 생성·병합·삭제·`active` 승격
- `candidate`를 승인된 추천 데이터로 노출
- 외부 Evidence를 AMU Proof로 변환
- 식별 가능한 개인정보·회원 행동 원문·비공개 고객 자료 등록. v1에서는 사람 승인만으로도 허용하지 않으며 별도 법무·목적·보유·삭제·접근권 계약이 선행돼야 한다
- 근거 없는 confidence 숫자로 게이트 우회

Registry·API 조회 실패, policy/schema/article revision 불일치, reviewer·Evidence·한계 누락, Evidence 참조 손상, 승인 상태 불명은 `candidate` 또는 `not_available`로 끝낸다. 현재 병목·측정 기준·전략 버전을 확인하지 못하면 Marketing Oops의 Next Action 생성도 중단한다. 기사 발행 자체는 기존 콘텐츠 게이트로 별도 판단하되, Intelligence 추천·API 노출은 fail-closed 한다.

---

## 11. 성공 판정

Pattern 수·메타 채움률·추출량은 운영량이지 성과가 아니다. 단계별 성공은 다음으로 판단한다.

1. 승인 Pattern이 실제 `Next Action`의 근거로 인용된 비율
2. 추천에 사용된 Pattern의 Evidence·한계·Proof 추적 가능성
3. Pattern 기반 실험이 `scale | iterate | stop` 판단으로 끝난 비율
4. 중복 Pattern 재사용률과 잘못된 자동 생성 차단률
5. Pattern 사용 후 Magazine 또는 관련 콘텐츠로 이어진 학습 루프
6. 기사 품질·Voice·SEO·독자 경험이 meta 도입 전보다 악화되지 않았는지

조회수·클릭·Pattern 개수만으로 성공을 선언하지 않는다. KPI와 이벤트 이름은 `MEASUREMENT-PLAN.md`에서 확정한다.

---

## 12. 점수 축 분리 계약 (v1.1, 2026-09-04 신설)

전수 리뉴얼과 Intelligence 추출이 같은 기사를 두고 서로 다른 판단을 내린다. 이 판단들을 하나의 총점으로 합치면 **한 축의 실패를 다른 축의 높은 점수가 가린다.** 축은 넷이며 서로 상쇄하지 않는다.

| 축 | 무엇을 재는가 | 쓰이는 곳 | 자동 판정의 한계 |
| --- | --- | --- | --- |
| `auditScore` | 기존 글의 **존치 가치** | `contentValue` 축 판정의 입력 | `urlAction`(병합·삭제·색인 제외)을 자동 실행하지 않는다 |
| `readerQualityScore` | 새 원고의 **9축 독자 경험 품질** | Content QA·writer 피드백 | 한 축 hard fail을 평균으로 상쇄할 수 없다 |
| `intelligenceEligibility` | 추출 결과의 **근거·구조 충족도** | 사람 검토 우선순위 정렬 | Pattern `active`·Proof `validated` 승격에 쓸 수 없다 |
| `performanceSignal` | 발행 후 **실제 독자·검색·관계 행동** | observation·Winner 선별 | role별·cohort별로 해석한다. 평균 단독 사용 금지 |

### 12.1 비상쇄 규칙

- **총점 필드를 만들지 않는다.** UI·리포트·API 어디에도 네 축을 합산한 단일 숫자를 두지 않는다.
- 한 축의 hard fail은 그 축에서만 해소한다. 다른 축의 점수·사람의 간단한 확인으로 통과시키지 않는다.
- 축 사이에 가중치를 두어 교환하지 않는다. `auditScore`가 높다고 `readerQualityScore` 미달 원고를 발행하지 않는다.
- 모델 confidence는 어느 축의 점수도 아니다. `modelConfidence`가 있어도 Evidence·Proof·점수 필드로 복사하지 않는다.

### 12.2 Pattern 승격은 점수로 판정하지 않는다

§3.2와 §10을 그대로 유지한다. 위 네 축 중 **무엇도 Pattern `maturity` 승격이나 Proof 승격의 근거가 아니다.**

- `intelligenceEligibility`가 만점이어도 단일 사례는 `candidate` 이상이 될 수 없다.
- Evidence가 하나도 없는 confidence 0.95 후보는 `qualified`가 될 수 없다.
- 승격은 반복 근거·조건·한계·사람 승인·최근 검토가 모두 있을 때 사람이 결정한다.

### 12.3 각 점수에 남길 최소 기록

```text
scoreVersion   산출 기준의 버전
policyVersion  판정 시점의 정책 버전
inputDigest    무엇을 보고 매겼는가
scorerType     rule | model | human
computedAt     산출 시점
explanations[] 왜 그 값인가 (축별 사유)
```

기준일과 근거 없이 저장된 점수는 재판정 대상이다. 기준이 바뀌면 과거 점수를 소급 수정하지 않고 새 `scoreVersion`으로 다시 매긴다.

### 12.4 이미 존재하는 게이트를 재구현하지 않는다

`readerQualityScore`의 9축과 SEO 판정은 **이미 구현돼 있다.** 새 시스템은 결과를 저장·조회할 뿐 같은 검사를 다시 만들지 않는다.

| 대상 | 기존 구현 |
| --- | --- |
| 9축 qualityEvidence 기계 검사 | `amu-magazine` MCP `analyze_article_quality` (2026-09-04 개칭 — 종전 `analyze_article_experience`) |
| SEO 항목·점수·required check | `amu-magazine` MCP `analyze_article_seo` |
| 발행 차단 게이트 | `publish_wordpress_post`의 required check 전항목 통과 |
| 작성 기준 | `magazine_knowledge_article.md` (독자 표면·지식 계층 모두 소유. App 경험형 기사는 별도 표면이며 `app_post_draft.md`가 소유한다) |

> **알려진 제약**: 영문 slug와 한글 포커스 키프레이즈를 함께 쓰면 `hasFocusKeywordInSlug`가 구조적으로 false다. `seoSlugKeyword` 지정 경로가 아니면 MCP 발행이 막히므로, 해당 기사는 처음부터 관리자 UI 수동 발행을 전제로 잡는다. 이 제약을 점수 조정으로 우회하지 않는다.

### 12.5 감사 축과 세부 점수의 관계

`auditScore`는 단일 숫자가 아니라 아래 하위 축의 집합이다. 하위 축을 합산해 하나로 표시하더라도 **처분 판정은 하위 축을 직접 본다.**

```text
Knowledge Value          유용한 정보·원리·전략을 담고 있는가
Evergreen Value          지금도 유효하거나 에버그린으로 전환 가능한가
Evidence Traceability    원리를 설명·검증하는 근거를 추적할 수 있는가
Strategic Fit            AMU가 다루는 영역에 의미가 있는가
Retrieval Value          앞으로의 검색·질문에 답하는 데 쓰일 수 있는가
Uniqueness               다른 콘텐츠와 중복되지 않는 독립 지식이 있는가
```

- 가중치는 코드 상수가 아니라 감사 설정으로 둔다. pilot 이후 보정한다.
- `off_topic`은 처분 값이 아니라 Strategic Fit의 입력 하나다. 그것만으로 즉시 삭제하지 않는다. 콘텐츠 자산 보호·대표 글 여부·301/410·canonical·내부 링크를 별도로 검토한다.

### 12.6 처분은 2축으로 기록한다 (v1.1, 2026-09-04 신설)

**콘텐츠 가치 판정과 실제 처리 방법을 하나의 값으로 합치지 않는다.** 합치면 "글에 지식이 없다"와 "URL을 없앤다"가 같은 판단이 되어, URL 자산 손실이 지식 판정에 딸려 나간다.

| 축 | 질문 | 값 |
| --- | --- | --- |
| `contentValue` | 이 글에서 재사용 가능한 유효 지식을 추출할 수 있는가 | `keep` · `refresh` · `rebuild` · `duplicate` · `expired` |
| `urlAction` | 그래서 이 URL과 본문을 어떻게 할 것인가 | `none` · `update` · `merge_301` · `archive_noindex` · `remove_410` · `blocked` |

- `contentValue`는 **글 자체의 값**이며 URL·사이트 구조를 고려하지 않는다. 입력은 §12.5의 6축이다.
- `urlAction`은 **사이트 구조의 판단**이다. `archive_noindex`(URL·본문은 유지하되 색인에서 내림)는 기록 가치는 있으나 검색 가치가 낮은 글의 자리이며, 단일 enum에는 넣을 곳이 없던 값이다.

기본 매핑은 다음이며 **자동 실행 규칙이 아니다.** 조합이 기본과 다르면 사유를 남긴다.

```text
keep      → none
refresh   → update
rebuild   → update
duplicate → merge_301 (canonical 후보 있음) / update (없음)
expired   → remove_410 (대체 콘텐츠·링크 자산 정리 확인 후) / archive_noindex (기록 가치 있음)
```

- `merge_301` · `remove_410` · `archive_noindex`는 **사람 승인 전 실행 0건**이다.
- `contentValue`가 낮다는 이유만으로 `urlAction`을 자동 결정하지 않는다.
- 판정 근거가 부족하면 `blocked`로 두고 다음 항목으로 진행한다. 추정으로 채우지 않는다.

> 실행 계약은 `.agent/todo-amu-magazine-intelligence-renewal.json`의 `dispositionContract` 절에 있다.
- 성과 신호가 **없는 것**과 성과가 **낮은 것**을 같은 값으로 저장하지 않는다.

---

## 13. 관련 문서

- `.agent/todo-amu-integrated-reorganization.json` R8 — Pattern Registry·추출·API·Marketing Oops·Proof Bank 실행 정본
- `.agent/todo-amu-magazine-intelligence-renewal.json` — 전수 리뉴얼·기사 정본 모델·Knowledge Unit·검색 계층 실행 정본
- `.agent/agent-instructions/instructions/project/refs/content-policy/magazine_knowledge_article.md` — 기사 작성 시 지식 계층 규칙
- `CONTENT-INTELLIGENCE.md`
- `MARKETING-STRATEGY.md`
- `PROOF-BANK.md`
- `MEASUREMENT-PLAN.md`
- `.agent/todo-ledgers/completed/2026/09/todo-amu-magazine-content-improvement.json`

---

## 14. 개정 이력

| 버전 | 날짜 | 변경 |
| --- | --- | --- |
| `intelligence-pattern-policy-v1.0` | 2026-08-29 | 기사 적격성과 Pattern 승격 게이트 분리, Reader/Intelligence Layer, Evidence/Proof 분리, 타입·Registry lifecycle·AI 권한·최소 meta 계약 확정 |
| `intelligence-pattern-policy-v1.3` | 2026-09-05 | §8.1 정정 — writer 작성 범위를 근거 4필드로 축소하고 판정 필드를 원고 메타에서 제외했다. `eligibility: none` 교차 규칙과 writer 제출분이 충돌해 저장이 거부되던 설계 오류를 해소했다. `candidateItems`·`evidenceRefs`는 `knowledgeUnits[]`에서 적재 어댑터가 파생한다. normalize의 eligibility 판정 규칙(근거 0건 → none / 1건 이상 → candidate / qualified는 사람)을 명시했다 |
| `intelligence-pattern-policy-v1.2` | 2026-09-05 | §8.1 작성 주체 분리 신설(MIR-007) — `writer → normalize → intelligence update` 경로를 고정하고 근거 6필드(writer)와 추출·검토·연결 9필드(사람·후속 단계)의 경계를 명시했다. 원고 메타 필드명의 정본이 node-app 저장 계약임을 함께 표기했다 |
| `intelligence-pattern-policy-v1.1` | 2026-09-04 | §8 저장 정본을 WordPress post meta에서 node-app으로 이전하고 `amu_article_intelligence` 계약을 폐기(MIR-002, 실측 데이터 0건). §12 점수 축 분리 계약 신설(MIR-003). §12.6 처분 2축 계약 신설 — 콘텐츠 가치 판정과 URL 처리 방법을 분리(QM-2). 필드 의미 계약과 권한 경계는 v1.0을 그대로 승계 |
