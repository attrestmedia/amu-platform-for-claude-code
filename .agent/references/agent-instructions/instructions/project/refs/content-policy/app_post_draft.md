# App 경험형 기사 초안 작성 (node-app `/magazine/{slug}` · Experience Content)

* 문서 버전: `app-experience-article-draft-v1.2`
* 최종 갱신: 2026-09-09
* 상위 기준: `.agent/amu-platform-guide/BUSINESS-CHARTER.md` → `MARKETING-STRATEGY.md` → `SERVICE-ROLE-MAP.md`
* 설계 계약 정본: `.agent/docs/project/2026/09/20260904_055903__air-400-app-content-model-e1-e3-port.md` (AIR-400)
* 실행 원장: `.agent/todo-amu-integrated-reorganization.json` R4 (AIR-400~403)

---

## 1. 이 문서의 지위 — 매거진 기사가 아니다

**이 문서는 node-app이 `/magazine/{slug}`로 SSR 발행하는 경험형 기사의 초안 규칙이다.** WordPress 매거진 기사를 쓰는 문서가 아니다.

| 산출물 | 표면 | 작성 정본 | 성격 |
| --- | --- | --- | --- |
| 매거진 기사 | WordPress `allmyuniverse.com/{slug}` | `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` | Knowledge Content — 검색·지식·재사용 |
| **App 경험형 기사** | node-app `/magazine/{slug}` | **이 문서** | Experience Content — 독자가 직접 판단·실행하는 콘텐츠 |

> 2026-09-04 이전 이 문서는 매거진 기사 작성 규칙이었다. 매거진 규칙 전체는 `magazine_knowledge_article.md`로 이관했고, 이 문서는 App 경험형 기사 전용으로 역할을 바꿨다.

### 1-1. 이 문서가 소유하지 않는 것

App 경험형 기사도 **AMU의 글**이다. 문체·구조·품질 기준은 매거진 정본을 그대로 따르며 여기서 다시 정의하지 않는다.

| 매거진 정본에서 그대로 가져오는 것 | 위치 |
| --- | --- |
| 문체·인칭·어휘·톤·평어 기준·AI 흔적 제거 | `magazine_knowledge_article.md` §26 |
| 가독성 규칙 | `magazine_knowledge_article.md` §25 |
| Question DNA·도입부 원칙·Question Loop | `magazine_knowledge_article.md` §10 |
| 공통 기사 문법 7단계·Archetype·Episode·Curiosity Type | `magazine_knowledge_article.md` §11 |
| Assumption → Evidence → Reveal | `magazine_knowledge_article.md` §11 |
| AMU Reality Lens | `magazine_knowledge_article.md` §11 |
| 독자 노출 표면(내부 설계 언어 비노출) | `magazine_knowledge_article.md` §11·§21 |
| Cold Open | `magazine_knowledge_article.md` §12 |
| 커버(썸네일) | `magazine_knowledge_article.md` §13 |
| 이미지·비교 실험 | `magazine_knowledge_article.md` §14 |
| 9축 QA | `magazine_knowledge_article.md` §15 |
| Evidence·조건·한계·반례, Evergreen ↔ Temporal 분리 | `magazine_knowledge_article.md` §16~§20 |
| 출처 표기 | `magazine_knowledge_article.md` §26-9 |

**같은 규칙을 이 문서에 복제하지 않는다.** 규칙이 바뀌면 매거진 정본을 고친다.

> **예외 (2026-09-09).** 위 표에서 그대로 가져오는 것은 **문장 품질·사실 근거·표기 기준**이다. **무엇을 목표로 삼고, 어디서 시작해, 어떤 순서로 열고, 무엇을 언제 공개하며, 표현 강도를 어디까지 올리는가는 App 표면에서 다르다** — 그 부분은 §5가 소유하며, 충돌하면 §5가 우선한다. 특히 **SEO 기준과 표현 강도 제약은 매거진 정본에서 가져오지 않는다.**

### 1-2. 이 문서가 소유하는 것

```text
콘텐츠 소유권과 ID namespace
App 표면 편집 원칙 (WOW 우선순위 · 전개 순서 · 공개 시점 · 긴장 유지 · 9축 적용 순서)
매거진 기사와의 관계 (upgrade / related / standalone)
canonical · indexable 판정
E1 / E2 / E3 등급과 승격
moduleType 8종과 슬롯 계약
body ↔ episodes ↔ slots 바인딩
착수 게이트 (유형별)
App 콘텐츠 출력 스키마
```

---

## 2. App 경험형 기사는 별도 콘텐츠 엔티티다

`/magazine/{slug}` 콘텐츠는 **WP 기사를 `post_id`로 참조하는 레코드가 아니라 node-app이 소유하는 독립 콘텐츠 엔티티**다.

```text
contentId    amu:magazine:{slug}     3분절 고정
namespace    magazine                고정
```

- `post_id`와 **절대 섞지 않는다.** `MEASUREMENT-PLAN.md` §9.5가 두 namespace를 분리한다.
- App 콘텐츠를 만들어도 **WordPress 기사는 URL·본문 그대로 남는다.** 승격이 아니라 별도 콘텐츠다.
- 개인화 상태도 별도 저장소를 쓴다. 매거진 개인화와 데이터를 통합하지 않는다(별도 ADR 전까지).

---

## 3. 매거진 기사와의 관계 — 셋 중 하나를 먼저 정한다

착수 전에 `sourceArticle.relationship`을 확정한다. **이 값이 게이트·canonical·indexable을 전부 결정한다.**

| 값 | 뜻 | canonical | indexable |
| --- | --- | --- | --- |
| `upgrade` | 이 WP 기사를 App에서 고도화 | WP 원문 | `false` (noindex) |
| `related` | 주제만 연결, 별개 검색 태스크 | self | `true` |
| `standalone` | WP 원문 없음, 새 검색 태스크 | self | `true` |

### canonical 규칙 — 검색 태스크 중복 원칙

- **같은 검색 태스크를 두 URL이 겨냥하면 안 된다.** `upgrade`는 원문과 같은 태스크를 다루므로 WP를 canonical로 두고 App 표면은 `noindex`다.
- `related`·`standalone`은 **기존 WP 자산과 겨냥 쿼리가 겹치지 않음을 먼저 보인다.** 겹치면 `upgrade`로 처리한다(fail-closed).
- 판정이 서지 않으면 `standalone`으로 밀지 않고 `upgrade`로 둔다. 중복 색인보다 색인 포기가 안전하다.

---

## 4. 착수 게이트

3,325건을 전부 고도화하지 않는다. **선별 기준은 관계 유형에 따라 다르다.**

### 4-1. 공통 게이트 (전 유형)

1. **서비스 연결 타당성** — Archetype이 Primary 서비스에 연결되는가. `make`·`experiment` → Gen Studio / `teardown`·`decision`·`mystery` → Tutors. `simulator`·`build`는 연결 대상 불명이므로 `pending_verdict`.
2. **확장 가치** — E1 정적 스토리를 넘어선 모듈이 독자 질문에 실질적인 답을 주는가. 답이 "아니오"면 **E1로 만든다. 등급을 올리지 않는 것이 정상 결과다.**
3. **Business Fit / Production Cost** — Content ROI가 양수인가. 고비용 E3 모듈은 승격 근거를 명시한다.
4. **중복 회피** — 같은 소재가 이미 `/magazine/{slug}`에 있는가. `contentId` 중복 금지.
5. **편집 계약 충족 가능성** — `heroLine`·`coldOpen`·`coverArtDirection`·`episodes`·`qualityEvidence`를 실제로 채울 수 있는 소재인가. **채울 수 없으면 착수하지 않는다.**
6. **표본 부족** — 판단에 표본이 부족하면 강등·제외가 아니라 `pending_verdict`로 두고 E1 기본 운영을 계속한다.

### 4-2. `upgrade` 전용 — 판정 기준은 검색이 아니라 App 내 행동

`upgrade`는 `noindex`다. **검색 유입을 목표로 하지 않으므로 "검색 가치가 있는 기사"가 아니라 "App 안에서 더 할 일이 있는 기사"를 고른다.**

1. **관계 신호 보유** — 원문 WP 기사에 비영 노출·클릭 **또는** 관계 행동(저장·이어읽기·팔로우 주제 적중)이 있다. 둘 다 0이면 재방문 회유의 근거가 없으므로 제외한다.
2. **확장 여지** — 원문이 답을 주다 만 지점, 독자가 직접 해봐야 아는 지점이 식별된다. 그 지점을 `sectionId` 하나로 지목할 수 있어야 한다.
3. **커버 판정 가능** — `coverReview`의 `retain`/`replace` 판정과 근거를 남길 수 있다.

### 4-3. `standalone` 전용 — 판정 기준은 검색 태스크 신규성

1. **Problem Cluster 귀속** — `MARKETING-STRATEGY.md`의 Problem Cluster 중 하나에 귀속되고 그 클러스터의 서비스 흐름에 연결된다. 귀속되지 않는 소재는 만들지 않는다.
2. **검색 태스크 신규성** — 겨냥 쿼리가 기존 WP 자산과 겹치지 않음을 Search Console 쿼리 분석으로 보인다.
3. **콘텐츠 2분류 균형** — Audience Content와 Product-Market Content 중 어느 쪽인지 명시한다. 한쪽으로 몰지 않는다.

### 4-4. `related`

`standalone`과 동일하게 판정하되, 연결할 WP 기사를 `sourceArticle`에 기록하고 그 기사와 검색 태스크가 겹치지 않음을 함께 보인다.

### 4-5. 착수 규모

첫 사이클은 **`upgrade` 1건 + `standalone` 1건**으로 시작한다. 유형별 게이트가 실제로 다른 결과를 만드는지 확인하기 전에 확대하지 않는다.

---

## 5. App 표면 편집 원칙 — 1차 품질 기준은 "다음 화면을 넘기고 싶은가" (신설 2026-09-09)

**두 표면은 성공 정의가 다르다.** 매거진 기사는 검색 유입과 지식 재사용(Intelligence)이 핵심이고, 검색으로 들어온 독자가 답을 얻으면 목적이 끝난다. App 경험형 기사는 이미 앱 안에 있는 독자가 **화면마다 넘길지 말지를 다시 결정하며**, 독자가 실제로 흥미를 느끼고 끝까지 체험했는가가 유일한 목적이다.

**이 표면의 1차 품질 기준은 "좋은 정보인가"가 아니라 "다음 화면을 넘기고 싶은가"다.**

같은 9축을 쓰지만 통과 순서가 다르고, 편집 판단이 갈릴 때 이기는 쪽도 다르다.

### 5-1. 이 표면은 검색이 아니라 체험이 목적이다

- **매거진의 SEO 게이트를 App 표면의 품질·발행 조건으로 삼지 않는다.** `analyze_article_seo` 점수와 required check는 WordPress 표면의 계약이다. App 콘텐츠는 node-app `appContentValidate`의 구조 계약을 통과하면 된다.
- `title`·`heroLine`·H2·본문은 **검색어가 아니라 독자의 호기심만 기준으로** 쓴다. 첫 문단 키프레이즈 배치, 소제목의 검색어 반복, 정의 선행 같은 SEO 관습을 적용하지 않는다.
- `seoTitle`·`excerpt`·`canonical`·`indexable`은 **색인 처리를 위한 스키마 필드로서** 채운다(§10). 이 필드들은 **본문 편집을 구속하지 않는다.**
- `relationship: "upgrade"`는 `noindex`다(§3). 이 경우 SEO 고려는 아예 없다. `related`·`standalone`도 검색 의도는 `seoTitle`·`excerpt`가 감당하고 그 부담을 본문으로 넘기지 않는다.
- 검색 태스크 중복 방지(§3)는 그대로 지킨다. 이 절은 **본문 편집의 자유**를 말하는 것이지 canonical 판정을 면제하지 않는다.

### 5-2. 설명을 뒤로 밀고 사건을 앞으로 당긴다

```text
상황 → 선택 → 예상 → 반전 → 원리 → 다음 궁금증
```

- 이는 매거진 7단 문법(`magazine_knowledge_article.md` §11)을 대체하지 않는다. **같은 계약을 App 표면의 진행 순서로 다시 배열한 것**이다. `Question`이 상황, `Evidence`·`Tension`이 선택·예상·반전, `Discovery`가 원리, `Next Question`이 다음 궁금증에 대응한다.
- 정의·배경·용어·시장 규모로 열지 않는다. Cold Open(문제·장면·긴장)은 그대로 필수다.
- **첫 화면에서 독자는 설명을 읽기 전에 최소 한 번 직접 고르거나 놀란다.** Primary 슬롯이 본문 후반에만 있으면 착수 전 점검(§11)에서 되돌린다.

### 5-3. 원리는 체험 뒤에 공개한다

- 개념명(앵커링·미끼효과 같은 용어)과 원리 해설은 독자가 선택을 마친 **뒤에** 공개한다.
- **반전을 지연시키는 것이 이 포맷이다.** 매거진의 "핵심 답 과도한 숨김" 금지(`CONTENT-INTELLIGENCE.md` §20)는 **답을 끝내 주지 않는 글**을 막는 규칙이며, 체험 뒤에 공개하는 지연에는 적용하지 않는다.
- 지키는 선은 하나다 — **약속한 것은 반드시 준다.** 훅이 강한 만큼 공개도 강해야 한다(`Hook Strength ≤ Answer Strength`). 끝까지 읽었는데 답이 없으면 그건 지연이 아니라 미제공이다.

### 5-4. 한 섹션에서 다 끝내지 않는다

- 각 Episode는 답을 준 뒤 **다음 Episode를 당기는 미해결 질문이나 조건 변경**을 하나 남긴다.
- 가장 강한 방식은 **앞에서 준 조건 하나만 바꿔 같은 판단을 다시 시키는 것**이다. 새 소재를 추가하는 것보다 같은 소재의 변수를 흔드는 편이 반전을 만든다.
- 마지막은 지식 요약이 아니라 **독자가 세상을 다르게 보게 되는 한 문장**으로 닫는다. 그 문장이 `memorableInsight`다.

### 5-5. 슬롯과 모션은 장식이 아니라 반전 그 자체다

- 슬롯은 본문을 꾸미는 장치가 아니라 **반전이 일어나는 자리**다. **슬롯을 빼도 반전이 그대로 성립하면 그 슬롯은 필요 없다.**
- 모션은 화려함이 아니라 **변화를 보이게 하는 데만** 쓴다 — `값이 바뀜` · `선택지가 추가됨` · `결과가 뒤집힘`.
- 그럼에도 `staticFallback`은 그대로 필수다(§7). 모션 없이 읽어도 반전이 문장으로 전달돼야 한다. 이 둘은 충돌하지 않는다. 모션은 이미 문장에 있는 반전을 증폭할 뿐이다.

### 5-6. 매거진 원문을 그대로 옮기지 않는다

- `upgrade`라도 **매거진 본문을 잘라 사이에 슬롯을 끼우는 방식은 금지한다.** 핵심 인사이트만 소재로 가져와 App 경험으로 새로 쓴다. §2 "별도 콘텐츠 엔티티"의 편집 측면이다.
- `title`도 매거진 제목을 그대로 쓰지 않는다. App `title`은 더 짧고 독자의 행동을 부르는 문장으로 다시 쓴다.

### 5-7. 강도는 열고 사실은 닫는다

**"더 재미있고 자극적으로"는 이 표면에서 허용이 아니라 요구다.** 강도를 낮춰 안전하게 쓴 글은 이 표면에서 실패한 글이다. 제약은 표현 강도가 아니라 **사실성**에 건다.

| 열려 있는 것 (권장) | 닫혀 있는 것 (불변) |
| --- | --- |
| 극적인 도입·단정적인 훅 | 검증되지 않은 숫자·출처 없는 주장 |
| 2인칭 몰입·독자에게 직접 말 걸기 | 근거 없는 공포·존재하지 않는 갈등 |
| 반전 지연·정보 공개 순서 통제 | 분노·혐오로 확보한 체류 |
| 감각적 표현·장면으로 바꾼 숫자 | 약속한 체험을 주지 않는 제목 |
| 사실이 뒷받침되는 과장된 프레이밍 | 성격·유형 진단형 단정 |

- 매거진의 금지 Tension 중 **"과장된 위기"·"사실보다 강한 제목"·"핵심 답 과도한 숨김"은 App 표면에서 표현 강도가 아니라 사실성과 이행 여부로 판정한다.** 사실이 뒷받침되고 약속한 체험을 실제로 주면 강한 표현 자체는 문제 삼지 않는다.
- **진단형 단정만 예외 없이 금지한다.** "당신은 ○○형 인간입니다"가 아니라 **"이번 선택에서는 이런 경향이 나타났다"**로 쓴다. 선택 한 번으로 사람을 규정할 수 없고, `CONTENT-INTELLIGENCE.md` §26의 금융·투자·의료·법률 Interaction 제한과 같은 이유다.

### 5-8. 외부 참고에서 가져오는 것

외부 콘텐츠를 참고로 들 때 가져오는 것은 정보량이나 소재가 아니라 **평범한 대상을 낯설고 궁금하게 보이게 만드는 편집 방식**이다. 포맷·톤·시각 문법을 그대로 모사하지 않는다.

### 5-9. 9축 게이트의 App 표면 적용 순서

축의 정의는 `magazine_knowledge_article.md` §15(원 정본 `CONTENT-INTELLIGENCE.md` §22) 그대로다. **9키는 전부 채우되 가중치가 다르다.**

| 구분 | 축 | App 표면 판정 |
| --- | --- | --- |
| 차단축 | Curiosity · Surprise · Participation · Continuation | 하나라도 미달이면 정보량·등급과 무관하게 반려 |
| 필수축 | Evidence · Payoff · Memorability · Voice | 매거진 기준 그대로 |
| 완화축 | Utility | **실행 체크리스트를 요구하지 않는다.** 체험이 남긴 판단 기준 한 줄이면 충족한다. 실용 정보를 넣으려고 체험의 흐름을 끊지 않는다 |

**SEO 지표는 9축에 없다.** App 표면 품질 판정에 검색 점수를 섞지 않는다(§5-1).

검토자는 각 화면 전환 지점에서 **"여기서 멈춰도 아쉽지 않은가?"**를 묻는다. 아쉽지 않다면 그 지점이 이탈 지점이다.

---

## 6. E1 / E2 / E3 등급

| 축 | E1 Story | E2 Enhanced | E3 Interactive |
| --- | --- | --- | --- |
| 기본값 | **신규 콘텐츠 기본** | 승격 필요 | 승격 필요 |
| 승격 조건 | — | 성과·사업 적합성 또는 명시적 Reference Implementation 근거 | `magazine_knowledge_article.md` + 서비스 연결 타당성 |
| 상호작용 | 정적 본문 | 정적 + 읽기 모듈 | 정적 + 읽기 모듈 + 서비스 실행 |
| 실패 시 | — | — | **정적 본문으로 완결** |
| 표본 부족 | — | `pending_verdict` | `pending_verdict` |

- **조회수 단독 승격 불가.** 노출·클릭만으로 E2/E3로 올리지 않는다.
- **Primary 서비스 1개 상한.** 기사당 primary interaction 후보는 하나다.
- **Do Not Change 1개.** 한 번에 한 변수만 바꾸는 실험 계획 원칙을 지킨다.
- **E3 모듈이 실패해도 최초 질문의 답·근거·판단 기준은 정적 본문만으로 완결돼야 한다.**

---

## 7. 모듈과 슬롯 계약

### 7-1. 허용 `moduleType` 8종이 전부다

```text
static · compare · reveal · checklist · quiz          읽기 모듈
image_embed · content_embed · tutors_embed            서비스 실행 모듈
```

`timeline` 등 목록에 없는 값은 계약에 존재하지 않는다.

| 등급 | 구성 |
| --- | --- |
| E1 Story | `prose` 블록만 |
| E1/E2 공통 | `module` 블록 + `moduleType: "static"` 슬롯 — 정적 슬롯도 계약상 슬롯이다 |
| E2 Enhanced | `prose` + `compare`·`reveal`·`checklist`·`quiz`. **`staticFallback` 필수** |
| E3 Interactive | 위 + `image_embed`·`content_embed`·`tutors_embed` |

### 7-2. 동적 모듈(`*_embed`) 필수 조건

- `serviceKey`는 **모듈이 결정한다.** `tutors_embed` → `tutors`, 나머지 둘 → `gen-studio`. 임의 지정 불가.
- `contextKey`·`allowedProps`는 **필수**다. `image_embed`·`content_embed`는 `templateKey`도 필수다.
- `fallbackVisibility: "omit"`은 동적 모듈에만 허용된다.
- `play`·`store`는 `serviceKey` enum에는 있으나 **슬롯에서는 거부된다.** 연결이 필요하면 계약 확장이 선행한다.

### 7-3. 슬롯 상한

- 슬롯 1~3개, `interactionRole: "primary"` **정확히 1개.**
- 슬롯의 실체(`moduleType`·`staticFallback`·`allowedProps`)는 `slots[]`에만 둔다. `body`의 `module` 블록은 **"이 자리에 그 슬롯이 온다"는 배치 정보만** 갖는다.
- Experience는 반드시 `판단 대상 → 판단할 틈 → reveal` 순서를 갖는다. 표·목록·요약만으로는 Participation을 충족하지 못한다.
- `postId`·`postSlug`·`contractType`·`schemaVersion`은 writer가 넣지 않는다. 서버가 결합한다.

---

## 8. body ↔ episodes ↔ slots 바인딩

```text
body[].sectionId  ──┬──  episodes[].sectionId   1:1 대응
                    └──  slots[].sectionId      슬롯이 놓일 섹션
body[].blockId          문서 내 고유
body(kind:module).slotId  ──  slots[].slotId    반드시 실재
```

- `body`의 배치 순서가 곧 렌더 순서다.
- 대응이 하나라도 깨지면 등록이 차단된다. 초안 단계에서 세 배열을 함께 검산한다.
- Episode마다 `curiosityType` 1개를 지정한다. 값은 `mystery·contradiction·comparison·prediction·detection·decision·reveal` 중 하나다.

---

## 9. 서비스 연결 위치

- 서비스 체험은 **기사 끝 CTA가 아니라 독자가 그 도움을 가장 필요로 하는 Episode 직후**에 둔다.
- 진입 지점을 `entrySectionId`, 돌아올 지점을 `returnSectionId`로 지정한다. `returnSectionId`는 필수다.
- 마지막 행동은 서비스 사용이 아니라 **관계 행동(저장·팔로우·다음 실험 따라가기)**으로 닫아도 된다.
- 서비스 연결 없이도 최초 질문의 답과 판단 기준이 완결돼야 한다.
- 구현 전에는 빈 블록·가짜 버튼·비활성 서비스를 본문에 노출하지 않는다.

---

## 10. 출력 스키마 — `AppMagazineContent`

논리 스키마의 정본은 AIR-400 설계 계약이며, 초안은 아래 필드를 채운다.

```json
{
  "contentId": "amu:magazine:{slug}",
  "namespace": "magazine",
  "slug": "english-kebab-case",
  "title": "독자에게 보이는 H1",
  "seoTitle": "검색 의도용. 키프레이즈로 시작, 25~58자",
  "excerpt": "meta description 원천",
  "heroLine": "제목이 약속한 것을 한 줄로 좁힌 편집 카피",
  "coldOpen": {"problem": "", "scene": "", "tension": ""},
  "body": [
    {"blockId": "b-01", "sectionId": "episode-01", "kind": "prose", "html": ""},
    {"blockId": "b-02", "sectionId": "episode-01", "kind": "module", "slotId": "experience-01"}
  ],
  "episodes": [{"sectionId": "episode-01", "curiosityType": "mystery"}],
  "slots": [{"slotId": "experience-01", "sectionId": "episode-01", "interactionRole": "primary", "intent": "decision", "moduleType": "static", "staticFallback": "JS 없이 읽을 수 있는 대체"}],
  "qualityEvidence": {"curiosity": "", "surprise": "", "evidence": "", "participation": "", "payoff": "", "utility": "", "memorability": "", "continuation": "", "voice": ""},
  "experienceLevel": "story",
  "contentRole": "reach|relationship|trust|expansion|conversion",
  "primaryArchetype": "make|experiment|mystery|decision|teardown|simulator|build",
  "supportingArchetype": "선택, 최대 1개",
  "primaryQuestion": "독자가 끝까지 따라갈 핵심 질문",
  "cover": {
    "coverAssetId": "",
    "heroAssetId": "있으면 coverAssetId와 반드시 달라야 한다",
    "coverArtDirection": {"grammar": "portrait|still_life|conceptual|documentary|graphic", "scene": "", "tension": "", "textPolicy": "none|label"},
    "coverReview": {"mode": "renewal", "decision": "retain|replace", "previousAssetId": "", "criteria": [], "reason": ""}
  },
  "sourceArticle": {"wpPostId": 0, "wpPostSlug": "", "relationship": "upgrade|related"},
  "seo": {"indexable": false, "canonicalUrl": ""},
  "schemaVersion": "app-content.v1",
  "slotContractVersion": "article-experience.v2"
}
```

- `qualityEvidence` **9키 전부**를 채운다. 정의와 통과 기준은 `magazine_knowledge_article.md` §15다.
- `coverReview`는 `relationship: "upgrade"`일 때 **필수**다.
- `sourceArticle`이 없으면 `standalone`이다.
- `revision`·`createdAt`·`updatedAt`은 writer가 넣지 않는다.

---

## 11. 착수 전 · 작성 후 점검

**착수 전**

- ✅ `relationship`(upgrade / related / standalone)을 확정하고 그에 맞는 게이트(§4)를 통과했는가
- ✅ canonical과 `indexable`이 §3 규칙과 일치하는가. `upgrade`인데 `indexable: true`가 아닌가
- ✅ `contentId`가 기존 App 콘텐츠와 중복되지 않는가
- ✅ `heroLine`·`coldOpen`·`coverArtDirection`·`episodes`·`qualityEvidence`를 실제로 채울 수 있는 소재인가
- ✅ 등급을 올릴 근거가 있는가. 없으면 E1인가 (E1이 정상 결과다)
- ✅ Primary 서비스가 1개인가. Archetype과 서비스 연결이 타당한가
- ✅ 첫 화면에 설명보다 먼저 오는 선택·놀람 장면을 만들 수 있는 소재인가 (§5-2)
- ✅ 매거진 본문을 옮기는 게 아니라 인사이트만 가져와 새로 쓰는 계획인가 (§5-6)

**작성 후**

- ✅ `body`·`episodes`·`slots`의 `sectionId`·`slotId` 대응이 전부 맞는가
- ✅ 동적 모듈에 `contextKey`·`allowedProps`(+ `templateKey`)가 있는가. `serviceKey`를 임의 지정하지 않았는가
- ✅ E2/E3 모듈에 `staticFallback`이 있는가. **모듈을 전부 제거해도 글이 완결되는가**
- ✅ `interactionRole: "primary"`가 정확히 1개인가. 슬롯이 3개 이하인가
- ✅ `coverAssetId`와 `heroAssetId`가 서로 다른가. `upgrade`면 `coverReview`를 남겼는가
- ✅ 9축 `qualityEvidence` 9키에 실제 본문 위치·근거가 있는가 (`magazine_knowledge_article.md` §15)
- ✅ 문체·가독성·AI 흔적 제거가 매거진 정본 기준을 통과하는가 (`magazine_knowledge_article.md` §25·§26)
- ✅ 개념명·원리가 독자의 선택 뒤에 오는가. 지연한 답을 끝에서 실제로 주는가 (§5-3)
- ✅ 각 Episode 끝에 다음을 당기는 미해결 질문이나 조건 변경이 있는가 (§5-4)
- ✅ 슬롯을 전부 빼도 반전이 그대로 성립하지는 않는가. 성립한다면 그 슬롯은 장식이다 (§5-5)
- ✅ 마지막 문장이 요약이 아니라 관점을 바꾸는 한 문장인가 (`memorableInsight`, §5-4)
- ✅ 차단축 4개(Curiosity·Surprise·Participation·Continuation)가 전부 통과했는가 (§5-9)
- ✅ 강도를 낮춰 안전하게 쓰지 않았는가. 강한 표현이 사실로 뒷받침되고 약속한 체험을 실제로 주는가 (§5-7)
- ✅ 성격·유형 진단형 단정이 없는가 (§5-7)
- ✅ 내부 설계 언어(`Interaction Slot`·`E1/E2/E3`·`Episode`·`Archetype`·Registry ID)가 독자 표면에 없는가

---

## 참조

- 매거진 기사 작성 정본(문체·SEO·9축·Cold Open·커버·출처): `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`
- 상위 실행 workflow·Brief·중복 방지: `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`
- AI 흔적 제거: `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md`
- App 콘텐츠 모델·E1~E3 승격·선별·canonical 설계 계약: `.agent/docs/project/2026/09/20260904_055903__air-400-app-content-model-e1-e3-port.md`
- 슬롯 계약 구현: `amu_app/node-app/src/libs/server-utils/magazine/magazineEmbedContract.ts`
- 9축·Content Role·Reality Lens·Cover 정본: `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`
- 표면별 이벤트·namespace 분리: `.agent/amu-platform-guide/MEASUREMENT-PLAN.md`
- 실행 원장: `.agent/todo-amu-integrated-reorganization.json` R4

## 개정 이력

| 버전 | 날짜 | 내용 |
| --- | --- | --- |
| `app-experience-article-draft-v1.2` | 2026-09-09 | **파일명을 `new_post_draft.md`에서 `app_post_draft.md`로 변경**했다. `new-post-draft` 스킬(매거진 기사용)과 파일명이 같아 대상 표면이 혼동됐다. **§5를 표면 목적에 맞게 완화**했다 — 매거진 SEO 게이트를 App 표면 발행 조건에서 제외(§5-1), 반전 지연을 포맷으로 허용하고 "약속 이행"만 계약으로 유지(§5-3), 표현 강도를 요구 수준으로 열고 제약을 사실성에 한정(§5-7), Utility를 완화축으로 이동(§5-9). 매거진 표면 기준은 변경 없음 |
| `app-experience-article-draft-v1.1` | 2026-09-09 | **§5 App 표면 편집 원칙 신설.** 1차 품질 기준을 "다음 화면을 넘기고 싶은가"로 고정하고, SEO 관습과 본문 전개가 충돌할 때 본문이 이김을 명시. 전개 순서(`상황 → 선택 → 예상 → 반전 → 원리 → 다음 궁금증`), 원리·개념명의 체험 후 공개(답 은닉은 금지), Episode 간 미해결 질문 유지, 슬롯·모션의 반전 기능, 매거진 본문 전재 금지, 자극의 경계(금지 Tension·진단형 단정 금지), 9축의 App 표면 차단축 4개를 규정. §1-1에 편집 순서 예외를 명시하고 종전 §5~§10을 §6~§11로 이동 |
| `app-experience-article-draft-v1.0` | 2026-09-04 | **역할 전환.** 종전 이 문서는 매거진 기사 작성 규칙이었다. 매거진 규칙 전체(문체·SEO·9축·Cold Open·커버·JSON 데이터 생성 규칙 포함)를 `magazine_knowledge_article.md`로 이관하고, 이 문서는 node-app `/magazine/{slug}` 경험형 기사 초안 전용으로 재작성했다. 내용은 AIR-400 설계 계약을 따른다. |
