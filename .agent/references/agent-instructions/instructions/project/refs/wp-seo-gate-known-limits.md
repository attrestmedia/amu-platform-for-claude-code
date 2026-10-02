# WP 발행 자동화 SEO 게이트 — 알려진 한계와 실전 규칙

`amu-magazine` MCP의 `analyze_article_seo` / `verify_wordpress_draft`를 사용할 때
반복 검증된 검사기 특성과 대응 규칙. **점수가 기대와 다를 때 본문을 고치기 전에
이 문서로 "검사기 한계인지"를 먼저 판별할 것.**

> 수치 기준: **2026-08-27 `publisher.ts` 전체 대조 완료.** 검사기 로직이 갱신되면 verify 결과의 checks 상세와 대조해 재검증할 것.
> 각 항목에 코드 대조 여부를 표시했다 — ✅ 코드 확인 / ⚠️ 부분 확인 / ⏸️ 코드 밖(운영 절차·converter 소관).

## 0. required check 전체 기준 (2026-08-27 코드 대조)

`passed = score >= minScore && 모든 requiredChecks === true`(`publisher.ts:802`).
**점수가 아무리 높아도 아래 17개 중 하나라도 false면 발행이 차단된다.**

| check | 기준 | 가중치 |
| --- | --- | ---: |
| `hasFocusKeyword` | 키프레이즈 존재 | 5 |
| `hasFocusKeywordInTitle` | **`seoTitle`**에 키프레이즈 포함(H1 아님 — §8) | 8 |
| `hasFocusKeywordAtSeoTitleStart` | `seoTitle`이 키프레이즈로 시작 | 5 |
| `hasFocusKeywordInMetaDescription` | 메타 설명에 키프레이즈 포함 | 8 |
| `hasFocusKeywordInFirstParagraph` | **본문 첫 문단**에 키프레이즈 포함(H1 무관 — §2·§8) | 8 |
| `hasSeoTitleLength` | `seoTitle` 25~58자 | 7 |
| `hasMetaDescriptionLength` | 메타 설명 80~155자 | 8 |
| `hasValidSlugLength` | slug 3~8단어 | 5 |
| `hasFocusKeywordInSlug` | slug에 키프레이즈 단어 포함 | 5 |
| `hasMinimumWordCount` | **300단어 이상(하한만, 상한 없음)** — §2 | 3 |
| `hasEnoughHeadings` | H2/H3 3개 이상 | 6 |
| `hasKeywordHeading` | 키프레이즈 포함 소제목 1개 이상 | 5 |
| `hasInternalLinks` | 내부 링크 3개 이상 | 7 |
| `hasExternalLinks` | 외부 링크 2개 이상 | 7 |
| `hasImageAlt` | ALT 있는 이미지 1개 이상 | 3 |
| `hasKeywordImageAlt` | ALT에 키프레이즈 포함 1개 이상 | 3 |
| `hasKeywordDensity` | 키프레이즈 2회 이상 & 밀도 0~3% 미만 | 4 |

`maxScore = 97`, `minScore` 기본값은 `AMU_PUBLISHER_MIN_SEO_SCORE` 또는 **85**.

## 1. 호출 규칙

- `verify_wordpress_draft`는 반드시 `focusKeyword`와 `seoDescription`을 **명시 전달**한다.
  **원인(2026-08-27 코드 확인)**: `metadataFromWpPost`는 WP 포스트의 title·slug·excerpt만 읽고
  **Yoast meta(`_yoast_wpseo_focuskw`)는 읽지 않는다.** 인자로 주지 않으면 키프레이즈가 빈 값이 되어
  키워드 관련 체크 9개(가중치 합 51)와 메타 설명 길이(8)가 한꺼번에 깨진다.
  점수는 **43점 전후**이며, 이미지·링크까지 미달이면 30점대까지 떨어진다(오탐).
- local·production 검증은 병렬 호출 금지 — local 완료 확인 후 production 순차 진행.

## 2. 본문 작성 시 보정 규칙

- **본문 길이는 게이트 기준이 아니다 (2026-08-27 개정).** 구글은 단어 수를 랭킹 요인으로 쓰지 않는다
  ("Word count is not a ranking factor" — John Mueller). 게이트의 `hasMinimumWordCount`는 검색 최적화 기준이 아니라
  **빈 본문·변환 실패를 걸러내는 방어선**이며 하한 `MIN_WORD_COUNT = 300`뿐이다. **상한은 존재하지 않는다.**
  분량을 채우려고 H2를 추가하거나 문단을 늘리지 않는다. 주제를 다루는 데 필요한 만큼만 쓴다.
  > 과거 이 항목은 "게이트 기준 800단어를 안정 통과하려면 약 900단어 이상으로 보강한다"였다.
  > 2026-08-27에 하한을 800→300, 가중치를 9→3으로 낮추면서 폐기했다. 근거 없는 분량 강제였다.
- **analyze와 verify의 단어 수가 다른 진짜 원인 (2026-08-27 코드 확인)**: verify가 낮게 세는 것이 아니라
  **analyze가 부풀린다.** `analyzeSeo`는 `body = [markdown, html].filter(Boolean).join("\n\n")`로 두 입력을 이어붙이므로
  markdown과 html이 모두 전달되면 본문이 **중복 계산**된다. `verify_wordpress_draft`는 `html`만 넘기므로 1배다.
  두 경로 모두 같은 `countWords`를 쓴다. 따라서 analyze 수치가 verify보다 크게 나오는 것은 정상이며,
  **verify 값이 실제 본문 길이에 가깝다.**
- **첫 단락 검사**: `hasFocusKeywordInFirstParagraph`는 **H1과 무관하게 본문 첫 문단만 검사한다.**
  `getFirstParagraph`(`amu_labs/apps/mcp/amu-magazine/src/publisher.ts`)는 HTML 경로에서 첫 `<p>`만 뽑고,
  마크다운 경로에서도 `<h1>~<h6>` 태그와 `#` 헤딩 라인을 제거한다. 따라서 **제목에 키프레이즈를 넣어도 이 체크는 통과하지 않는다.**
  도입부 첫 문단 안에 키프레이즈를 자연스럽게 1회 배치한다 — 상세: 아래 §8.
  > 2026-08-27 정정: 이 항목은 과거 "focusKeyword를 제목에 연속 부분문자열로 포함해야 통과한다"고 적혀 있었으나
  > §8의 실측(H1에 키프레이즈가 없는 기사의 100/100 통과)과 위 구현 확인으로 반증됐다.
- **코드펜스 기사**: ```json 메타 블록은 반드시 **파일 최상단(첫 번째 펜스)**에 둔다.
  파일 끝에 두면 메타 미파싱으로 30점대 감점. 본문 `#` H1은 `<p>#…</p>` 리터럴로 렌더되므로 사용하지 않는다.
- **인라인 별표**: 본문 산문에 `{변수*::…}`처럼 `*`가 2개 이상 있으면 converter가 `<em>` 쌍으로
  해석해 HTML이 깨진다. 독자용 설명 문장에서는 `*`를 빼고, 템플릿 원문은 코드블록 안에만 유지.
  dryRun payload에서 `<em>` 혼입 여부로 검출한다.

## 3. 구조적 점수 천장 (수정 시도 금지 — 통과로 인정)

아래 케이스는 검사기 구조상 100점이 불가능하다. **slug/키프레이즈를 바꾸지 말고 게이트 통과로 인정**한다.

| 케이스 | 천장 | 원인 | 코드 대조 |
| --- | --- | --- | --- |
| 매거진 리뉴얼(영문 slug + 한글 키프레이즈) | 95점 | `hasFocusKeywordInSlug`(가중치 5) 항상 미통과 — 발행 시 `seoSlugKeyword`로 구제(§9) | ✅ 확인 |
| 키프레이즈에 같은 단어 2회 포함 | 92점 | `hasFocusKeywordInFirstParagraph`(8) 미통과 | ⚠️ 점수만 확인 |
| 긴 templateKey 기사(slug 9단어+) | <100 | `hasValidSlugLength`(5, 3~8단어) + 키프레이즈 미매칭 | ✅ 확인 — 리뉴얼 발행은 §9 예외 |
| 코드펜스 기사 analyze 단계 | 92점 | markdown analyze만 first-paragraph 오탐 — verify(HTML)는 100점 | ⚠️ 점수만 확인 |

> **점수 산식(2026-08-27 확인)**: 가중치 합 `maxScore = 97`, `score = round(획득/97*100)`.
> 위 천장값은 이 산식과 정확히 일치한다(예: 리뉴얼 = (97−5)/97 = 94.8 → 95).
> 2026-08-27 `hasMinimumWordCount` 가중치를 9→3으로 낮춰 maxScore가 103→97이 됐으나,
> **위 세 천장값(95/92/94)은 변하지 않았다**(재계산 확인).
>
> ⚠️ 표시 항목은 **점수 계산만 코드와 일치를 확인**했고 원인 설명은 확정하지 못했다.
> `countKeyword`는 단순 연속 부분문자열 검색이므로 "같은 단어 2회 포함"이 곧바로 미통과를 뜻하지는 않는다.
> 해당 케이스를 다시 만나면 실제 `checks` 상세로 원인을 재확인할 것.

## 4. 이미지 검사 한계

> **2026-09-04 해소.** 아래 오탐은 수정됐다. `extractImages`가 `src` 없는 `<img>`를 전부 버리고 있었는데,
> AMU 본문의 asset 이미지는 렌더 시점에 치환되므로 저장 HTML에 `src`가 없고 `data-asset-id`만 있다.
> `data-asset-id`를 src와 동등한 이미지 식별자로 취급하도록 고쳤다(`publisher.ts:865`).
> 실측: postId 4103 production — 수정 전 `imageCount 0`·94점·`passed false` → 수정 후 `imageCount 1`·**100점·`passed true`**.
> 아래 서술은 2026-09-04 이전 동작의 기록이다.

- ~~asset-id(`![alt](assetId)`) 이미지 기사는 verify에서 `imageCount 0` / 이미지 ALT 미달(94점)로
  나오지만 **정상 동작**이다(검사기가 asset 치환 전 HTML을 읽음).~~ → 위 해소 참조.
  이 오탐은 점수만 깎은 게 아니라 **`publish_wordpress_post`를 하드 블록**하고 있었다(§9와 같은 구조).
- 게이트 구제로 genstudio **공개 webp URL**을 `![alt](https://...)`로 넣던 우회는 더 이상 필요하지 않다.
  ALT는 여전히 필수이며, `src`도 `data-asset-id`도 없는 `<img>`는 계속 이미지로 세지 않는다.

## 5. 리뉴얼(기존 라이브 기사) 특수 규칙

- 리뉴얼 갱신은 라이브 글을 **draft로 강등**시킨다. → 작업 시작 전 반드시 사용자에게 고지하고,
  같은 작업 단위 안에서 발행까지 마쳐 라이브 URL을 복구한다.
- **발행은 에이전트가 수행한다 (2026-09-04 개정).** 영문 slug + 한글 키프레이즈 조합은 `seoSlugKeyword`로
  해소되며, 기존 slug가 9단어 이상인 리뉴얼은 `isRenewal: true`를 명시해 `hasValidSlugLength`만 예외 처리한다.
  리뉴얼 발행은 원상 복구이므로 사용자 승인 없이 자동 실행한다 — `{{AGENT_ROOT}}/rules/safety-governance.md`
  "발행 승인 경계". 종전의 "UI에서 수동 발행" 규칙은 폐기했다(§9).
- 게이트 미통과로 발행이 보류되면 draft로 두고 넘어가지 않는다. 원인(어느 `requiredChecks`가 false인지)과 함께
  즉시 사용자에게 고지한다.
- 리뉴얼 소셜 재가공 시 `prepare_local_generation`의 source는 **공개 중인 구본**이다.
  갱신된 수치/신규 주장 인용 금지 — 에버그린 근거만 사용.

## 6. 소스 수집 폴백

- 네이버 블로그 원문이 WebFetch/브라우저에서 차단되면 `curl`로
  `https://blog.naver.com/PostView.naver?blogId=...&logNo=...`를 요청해
  `se-text-paragraph` 클래스 텍스트를 추출한다.

## 7. 기사 루트 주의

- 콘텐츠 기사 정본은 `/home/attrest-samsung-linux/Project/.agent/content/articles` 한 곳에서 관리한다.
- **amu-magazine `filePath`는 `AMU_PUBLISHER_ALLOWED_ARTICLE_ROOTS`에 등록된 위 경로의 절대경로만 사용**한다(문자열 prefix 검사).
- 이전 Documents 경로나 임의 mirror 경로를 넘기면 즉시 거부된다.

## 8. H1과 SEO 제목은 실제로 분리된다 (2026-08-27 확인)

`resolveSeoMetadata`(`amu_labs/apps/mcp/amu-magazine/src/publisher.ts`)는 `metadata.seoTitle`이 없으면
`title`을 기준으로 `buildSeoTitle`을 호출해 포커스 키프레이즈가 없을 때 자동으로 앞에 붙인다.

```text
seoTitle 미지정 → buildSeoTitle(title, focusKeyword) → "{키프레이즈}: {title}" → _yoast_wpseo_title
```

- 즉 `hasFocusKeywordInTitle`·`hasFocusKeywordAtSeoTitleStart`는 독자에게 보이는 H1(`title`)이 아니라
  자동 생성되거나 직접 지정된 **`seoTitle`을 검사한다.**
- **H1을 키워드-선두로 쓰지 않아도 SEO 게이트 감점이 없다.** 실측: H1에 키프레이즈가 전혀 없는 기사가
  `analyze_article_seo` 100/100 통과(`ai-pronunciation-analysis-voice-feedback`, 2026-08-27).
- `fitSeoTitle`이 58자에서 자르므로, 자동 생성 시 `키프레이즈 + ": " + title`이 58자를 넘기면 뒤가 잘린다.
  긴 H1을 쓸 때는 `seoTitle`을 직접 지정한다.
- 단, **첫 단락(`hasFocusKeywordInFirstParagraph`)에는 키프레이즈가 실제로 들어가야 한다.** 이건 H1과 무관하게
  본문 첫 문단을 검사하므로, 도입부 장면 안에 키프레이즈를 자연스럽게 배치한다.
  근거: `getFirstParagraph`는 JSON 메타를 제거한 뒤 HTML 경로에서 첫 `<p>`만 반환하고,
  마크다운 경로에서는 `<h[1-6]>` 태그와 `^#+\s+` 헤딩 라인을 제거한 첫 문단을 반환한다. H1은 어느 경로에서도 포함되지 않는다.
  (§2의 "첫 단락 검사" 항목과 동일한 사실을 가리킨다 — 상충하는 옛 서술은 2026-08-27에 정정)
- 제목 작성 규칙은 `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`의 "H1 제목 생성 규칙"을 따른다.

## 9. 슬러그 천장과 `seoSlugKeyword` 구제 (2026-09-04 해소)

§3의 "구조적 점수 천장(95점, 수정 시도 금지 — 통과로 인정)"은 `analyze_article_seo`/`create_wordpress_draft`
단계에 적용된다. **`publish_wordpress_post`는 기본적으로 다르지만, slug 보존이 필수인 기존 글 리뉴얼에 한해
`isRenewal: true`를 명시하면 `hasValidSlugLength` 하나만 예외로 인정한다.**

```ts
// publisher.ts:802
passed: score >= minScore && Object.values(requiredChecks).every(Boolean)
```

`passed`는 점수가 아니라 **모든 requiredChecks가 true**여야 한다. 단, `publish_wordpress_post`에
`isRenewal: true`가 명시되고 `hasValidSlugLength`만 false인 경우에는 기존 slug 보존 예외로 `seo.passed`를 true로 계산한다.
다른 required check가 false이면 여전히 발행하지 않는다. 일반 발행 또는 `isRenewal` 미지정 호출에서
`publish_wordpress_post`는 `!seo.passed`면
`minScore`를 아무리 조정해도 무조건 발행을 거부하고 `dryRun`을 강제로 `true`로 되돌린다(2122줄
`"SEO 게이트 미통과로 발행 보류"`). 즉 **영문 슬러그 + 순한글 포커스 키프레이즈** 조합은
`hasFocusKeywordInSlug`가 항상 `false`이므로 **점수가 몇 점이든 발행 자체가 물리적으로 막힌다.**

> **사고 재현(2026-08-27)**: `hybrid-app-webview-microphone-permission` 리뉴얼에서 `create_wordpress_draft`가
> 라이브 포스트를 draft로 강등시킨 뒤, focusKeyword가 `"하이브리드 앱 마이크 권한"`(순한글)이라 `publish_wordpress_post`가
> 거부되며 **글이 draft 상태로 방치**됐다. 라이브 URL이 일시적으로 오프라인이 되는 실제 장애로 이어졌다.

### 2026-09-08 해소 — 리뉴얼 slug 길이 예외

기존 WordPress 글을 같은 URL로 리뉴얼할 때는 slug 변경이 금지되므로, 3~8단어 규칙을 만족하지 않는 기존 slug를
줄일 수 없다. `publish_wordpress_post`에 `isRenewal: true`를 명시한 경우에만 `hasValidSlugLength`를 예외 목록에
추가하고, `hasFocusKeywordInSlug`를 포함한 나머지 required check와 최소 점수는 그대로 검사한다.

```text
publish_wordpress_post({
  postId,
  confirmSlug,
  focusKeyword,
  seoDescription,
  seoSlugKeyword,
  isRenewal: true,
  dryRun,
})
```

`verify_wordpress_draft`에도 동일하게 `isRenewal: true`를 전달해야 검증 결과에서 같은 예외가 적용된다.

이 예외는 호출자가 리뉴얼임을 명시적으로 선언해야만 활성화된다. 신규 글·일반 발행에는 적용하지 않으며,
`seoSlugKeyword`가 없거나 slug 매칭 등 다른 검사가 실패하면 계속 `blocked`로 남긴다. 결과에는
`exceptions: ["hasValidSlugLength"]`를 남겨 예외 적용 사실을 확인할 수 있게 한다.

### 2026-09-04 해소 — `seoSlugKeyword`

**위 하드 블록은 게이트의 구조적 한계가 아니라 툴 스키마 결함이었다.** `resolveSeoMetadata`(`publisher.ts:753`)는
slug 검사용 키워드를 `seoSlugKeyword` → `slugKeyword` → `slug_keyphrase` → `focusKeyword` 체인으로 해석한다.
`create_wordpress_draft`는 기사 파일 메타에서 이 값을 읽지만, `verify_wordpress_draft`·`publish_wordpress_post`는
WP 포스트에서 메타데이터를 재구성하면서 `focusKeyword`·`seoDescription`만 받아 항상 `focusKeyword`로 폴백했다.

두 툴에 `seoSlugKeyword` 파라미터를 추가해 연결했다(2026-09-04 패치).

```text
publish_wordpress_post({ postId, confirmSlug, focusKeyword, seoDescription, seoSlugKeyword, dryRun })
verify_wordpress_draft({ postId, focusKeyword, seoDescription, seoSlugKeyword })
```

- `focusKeyword`는 그대로 한글 키프레이즈다. **`seoSlugKeyword`는 `hasFocusKeywordInSlug` 하나에만 영향을 준다.**
  나머지 키워드 체크 8개는 여전히 실제 키프레이즈로 검사되므로 게이트가 느슨해지지 않는다.
  실측: 같은 메타에서 `seoSlugKeyword` 부재 → `false`(slugKeywordCount 0) / 전달 → `true`(3).

**남용 방지 계약 (필수)**

- 값은 **집필 시점에 기사 메타 블록에 기록된 `seoSlugKeyword`를 그대로 계승**한다. 발행 시점에 slug를 보고 새로 지어내지 않는다.
- 기사 메타에 `seoSlugKeyword`가 없으면 발행하지 않고 `blocked`로 보고한다. 등록 단계에서 누락됐다는 뜻이다.
- 사용한 `seoSlugKeyword` 값과 결과 `requiredChecks.hasFocusKeywordInSlug`를 보고·ledger에 함께 남긴다.
- 이 구제는 §3이 "구조적 천장, 수정 시도 금지, 통과로 인정"으로 판정한 케이스에만 쓴다. 다른 required check를
  우회하는 용도로 확장하지 않는다.

### 대응 — 키프레이즈 설계 (여전히 1순위)

`seoSlugKeyword`는 안전망이지 기본 경로가 아니다. 아래 설계를 먼저 시도한다.

- `create_wordpress_draft`로 라이브 글을 갱신하기 **전에** focusKeyword가 slug와 word-level로 겹치는지
  먼저 계산한다. 겹치지 않으면 draft 등록 전에 키프레이즈를 조정한다 — 등록 후 발견하면 그사이 라이브 글이 내려가 있다.
- 해결책은 slug를 바꾸는 게 아니라(금지) **focusKeyword에 slug와 겹치는 라틴 문자 단어를 자연스럽게 포함**시키는
  것이다. 예: `하이브리드 앱 마이크 권한` → `WebView 마이크 권한` (slug의 `webview`와 겹침). 기술 용어를
  한글 대신 영문 그대로 쓰는 선택은 개발자 대상 글에서 자연스러우므로 억지가 아니다.
- 키워드를 바꾸면 title/seoTitle/seoDescription/첫 단락/키워드 H2에 있던 기존 키프레이즈도 전부 같은 값으로
  맞춰야 한다 — 부분만 바꾸면 `hasFocusKeywordInTitle` 등 다른 체크가 새로 깨진다.
- `AI 발음 분석`처럼 키프레이즈에 영문 약어(`AI`)가 포함되어 있으면 대개 우연히 slug의 `ai-`와 겹쳐 통과한다.
  이 우연에 기대지 말고, 새 글을 시작할 때 seoKeyword를 정하는 단계에서 slug와의 겹침을 먼저 확인한다.
