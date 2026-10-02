---
name: new-post-draft
description: AMU 매거진 신규 기사 초안을 한국어 네이티브 문체와 SEO 기준으로 작성하는 워크플로우
---

# new-post-draft

## 목적

- 첨부 글/아이디어를 바탕으로 **{{AGENT_ROOT}}/skills/writing-humanizer** 스킬을 참고하여 자연스러운 한국어 기사 초안을 작성
- 번역체를 줄이고, SEO/링크/이미지 규칙을 동시에 충족
- 같은 WP URL을 갱신하는 요청은 일반 신규 초안이 아니라 `wp_to_wp_replace`로 라우팅한다. 기존 글의 topic만 새 writer에게 허용하고, 새 기사로 교체 등록한다.
- **시리즈 형식의 연결 글이라도 글 제목과 본문은 하나의 주제를 가진 하나의 완전한 글로 완성한다.** 이전·다음 편을 읽어야 핵심 질문의 답·근거·적용 기준이 성립하는 초안은 통과시키지 않는다.

## 필수 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`: 초안 작성을 위한 기본 규칙 
2. `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md`: 초안 문법/글 작성 형식의 기준
3. `{{AGENT_ROOT}}/skills/writing-humanizer/SKILL.md`: 자연스러운 문장 다듬기
4. `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`: 일반 신규 기사 또는 리뉴얼 후 컨트롤러가 `amu-magazine` 검색·`genstudio` 이미지 생성/등록을 수행할 때 우선 참조
5. `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md`: 일반 신규 기사 또는 리뉴얼 후 컨트롤러가 `templateKey`를 등록할 때만 참조
6. 일반 신규 기사 또는 리뉴얼 후 컨트롤러만 `amu-magazine` MCP로 실제 내부 링크용 포스트 검색
7. `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`: WP → WP 같은 URL 리뉴얼의 원문 진단·전면 재작성·9축 품질 게이트·실질 개선 판정

> `wp_to_wp_replace`에서도 4~6번의 도구·자료를 그대로 사용한다. 대상 URL 원문, ledger, AMU 콘텐츠 저장소, 기존 Gen Studio prompt/template/asset은 리뉴얼 writer의 정상 입력이다.

## 착수 게이트: 중복·유사 기사 선점 검사 (필수)

매거진에는 이미 4,000건 이상의 기사가 등록되어 있다. 신규 주제로 보이는 소재도 기존 기사와 겹칠 가능성이 높고,
같은 주제의 글이 늘어날수록 서로 색인 경쟁을 일으켜 오가닉 유입이 분산된다.
**신규 작성은 기본값이 아니다.** 아래 검사에서 같은 URL을 갱신할 기존 기사가 확정되면 일반 초안 작성을 중단하고, **원문 진단을 거쳐 전면 재작성하는 WP → WP 교체 리뉴얼**로 라우팅한다.

### 1단계 — 후보 조회 (소재 확정 직후, 초안 작성 전)

`amu-magazine` MCP로 아래를 모두 조회한다. 제목 문자열 일치 검사만으로는 개념 중복을 잡을 수 없다.

```text
search_posts({ query: <핵심 개념어>, limit: 20 })           # 한글/영어·동의어·롱테일 질의마다 반복
search_posts({ query: <핵심 개념어>, limit: 20, page: 2 })  # 유사 결과가 이어지면 page 2~3까지 확장
browse_posts({ categoryId: <대표 카테고리>, limit: 50 })     # 소재의 대표 카테고리 훑기
search_posts({ query: <독자의 질문>, limit: 20 })             # 제목 아닌 질문 축도 확인
```

- 검색어는 기사 제목 문구가 아니라 **개념어와 독자가 실제로 검색할 질문**으로 만든다.
- 후보의 세부 본문 대조가 필요하면 writer와 분리된 컨트롤러/리뷰어가 수행한다. WP → WP 리뉴얼 대상의 제목·본문·excerpt·H2/H3·논지·주장·사실·출처·인용·이미지·메타는 writer context에 넣지 않는다.
- `.agent/content/content-ledger.jsonl`에서 같은 `dedupeKey` + `type: "article"` 항목도 함께 대조한다.
- 조회에 실패하면 판정을 추정으로 대체하지 않고 **초안 작성을 중단하고 `blocked`로 보고**한다(fail-closed).

### 2단계 — 정체성 4축 판정

| 축 | 기사의 판정 기준 |
| --- | --- |
| ① 핵심 소재·주제 | 글이 다루는 대상 자체 |
| ② 독자의 검색 의도·질문 | 어떤 질문에 답하는 글인가(정보 확인 · 비교 · 실행 방법 · 사례) |
| ③ 결론·핵심 주장(앵글) | 독자가 읽고 나서 무엇을 다르게 하게 되는가 |
| ④ 타깃 독자·퍼널 | 독자층과 P0~P4 판정 |

- **3축 이상 일치 → 중복.** 신규 작성 금지. 같은 URL 갱신이 요청·승인된 경우에만 `content_production_workflow.md` “WP → WP 같은 URL 리뉴얼 절차”로 라우팅하고, 그렇지 않으면 중복 사유를 보고한다.
- **2축 일치 → 유사.** 아래 분리 허용 기준을 충족할 때만 별도 신규 기사를 쓴다. 충족하지 않으면 같은 URL 리뉴얼 여부를 판정하되, 기존 본문에 섹션·사례·데이터를 덧붙이는 방식은 사용하지 않는다.
- **1축 이하 → 신규 작성.**

### 3단계 — 분리 허용 기준 (유사인데 새로 써도 되는 경우)

하나 이상 충족해야 하며, 충족한 항목을 **판정 근거로 기록**한다.

- 검색 의도가 명확히 갈라져 하나의 글이 두 의도를 동시에 만족시키지 못한다(예: '무엇인가' vs '어떻게 하는가')
- 한 기사로 합치면 질문 흐름이 끊기고, 이를 메우기 위한 분기 설명이 H2 3개를 넘는다
- 타깃 독자·퍼널이 달라 CTA 축이 서로 충돌한다(한 글 1축 1CTA를 유지할 수 없다)
- 기존 기사가 허브 역할이고 새 글이 심화 편으로 내부 링크 클러스터(허브1+심화2+전환1)를 구성한다

### 4단계 — 같은 URL 리뉴얼은 전면 재작성 교체 모드

- `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`를 먼저 적용한다. `slug`/`postId`/`category`는 운영 컨트롤러가 교체 등록 시점에 결합한다.
- 원문·성과 신호·축적 지식(ledger·`content-insights`·`customer-objections`)·기존 Gen Studio 자산·승인된 Intelligence Pattern을 모두 읽고 원문 진단을 먼저 수행한다. 진단 없이 착수하지 않는다.
- 진단 결과를 새 Brief에 반영하고, 새 근거로 보강해 전면 재작성한다. 원문 문장을 그대로 옮기거나 원문의 H2 순서를 기본 구조로 삼지 않는다.
- 새 원고는 **집필자와 분리된 quality reviewer**의 9축(Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice) 검토와 실질 개선 4항 판정을 통과해야 한다. 컨트롤러가 링크·이미지·SEO를 결합한 결과가 원고의 질문·논지·구조를 바꾸면 검토부터 다시 수행하고, 그 뒤에만 `updateExistingBySlug: true`로 같은 URL을 교체한다.
- 기존 이미지 asset과 prompt/template은 `freshImageBrief`의 역할·권리·최신성·내용 적합성을 충족하면 재활용한다. ALT·캡션·배치는 새 본문 기준으로 다시 정한다.
- 이는 기존 문단을 수정하거나 덧붙이는 갱신이 아니다. WP → 네이버/소셜 파생은 source-based adaptation으로 별도 스킬 라우팅한다.

> 원장 기반 작업에도 이 판정이 적용된다. 어느 경로로 진입하든, 일반 신규 작성과 WP → WP 전면 재작성 교체 리뉴얼을 혼동하지 않는다.

## 입력

- 소스 유형: 첨부 글, 기존 아티클, 아이디어 메모
- 주제/타깃 독자/검색 의도(가능하면 명시)
- 포커스 키프레이즈(미지정 시 본문 의도에 맞춰 제안)

## 실행 절차

0. **착수 게이트를 먼저 통과** — 위 `착수 게이트: 중복·유사 기사 선점 검사`의 1~2단계를 수행한다. 같은 URL 갱신이 확정되면 일반 초안이 아니라 4단계의 `wp_to_wp_replace`로 전환하고, 별도 신규 기준도 없으면 중복 사유를 보고한다.
1. `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` 규칙을 먼저 확인하고 글의 목표와 검색 의도를 정리
2. Primary Archetype을 먼저 고르고 그 흐름으로 Episode를 설계한다. `문제 제기 → 인사이트 → 해결책 → 요약` 같은 단일 고정 구조를 모든 기사에 적용하지 않는다.
3. 번역체/명령조를 줄이고, 한국어 네이티브 톤(동행조)으로 문장 다듬기
4. **일반 신규 기사만** Focus Keyphrase/SEO 제목/Slug/Meta Description을 일관되게 구성. WP → WP 리뉴얼 writer는 slug를 받거나 출력하지 않으며, 운영 컨트롤러가 통과한 원고에만 운영 식별자를 결합한다.
5. 일반 신규 기사는 내부 링크 3개 이상, 외부 신뢰 링크 2개 이상 포함
   > 내부 링크는 반드시 `amu-magazine` MCP로 실제의 포스트를 검색하여 작성 중인 글과 관련된 기사로 선정
   > 외부 링크는 `WebSearch`를 활용하여 반드시 **실제로 존재하는 페이지임을 검증** 한 후 링크 추가
   > `wp_to_wp_replace` writer는 내부 AMU 검색 대신 `internalLinkIntents`만 출력하고, 외부 검색에서 AMU 도메인·대상 URL을 제외한다.
6. 일반 신규 기사는 기사에 어울리는 삽입 이미지의 위치를 선정하여 아래 기준에 따라 처리
   - `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`의 **`## 규칙`의 `5항`**을 반드시 확인하고 준수할 것
   - `wp_to_wp_replace` writer는 prompt/template/asset 조회·생성 없이 `freshImageBrief`만 출력한다.
   - 리뉴얼 후 컨트롤러는 `content_production_workflow.md` “WP → WP 같은 URL 리뉴얼 절차”의 재활용 게이트를 통과한 기존 이미지 asset을 활용할 수 있다. 적합한 기존 자산이 없거나 새 이미지가 `freshImageBrief`에 더 적합하면 새로 선택·생성한다.
7. 발행 자동화 대상이면 `amu-magazine` MCP의 `analyze_article_seo` 기준을 통과할 수 있도록 첫 단락 키프레이즈, 메타 설명, 내부/외부 링크, 이미지 ALT를 최종 점검한다. slug 길이·등록 식별자 점검은 WP → WP 리뉴얼 writer가 아니라 운영 컨트롤러의 통과 후 단계다.
8. 필요 시 출처 표기, 영어 키워드, JSON 메타데이터까지 함께 출력

## 출력 기본 형식

아래 형식은 일반 신규 기사에 적용한다. WP → WP 전면 재작성 교체 리뉴얼 writer는 다음 전용 형식을 사용하며 slug·postId·category는 출력하지 않는다(컨트롤러가 결합).

1. `CONTENT-INTELLIGENCE.md` §25와 필드가 일치하는 새 Content Experience Brief (`topic`, `contentRole`, `primaryArchetype`, `supportingArchetype`, `experienceLevel`, `primaryQuestion`, `thesis`, `memorableInsight`, `nextQuestion`, `questionDNA`, optional `expansion`, optional `realityLens`, `qualityEvidence`)
   - `realityLens { world, intensity, anchorSectionId }`는 선택 필드다. 생략해도 통과이며, 쓸 경우 `CONTENT-INTELLIGENCE.md`의 "AMU Reality Lens" 절과 `magazine_knowledge_article.md`의 적용 규칙을 따른다.
2. 원문 진단 + 새 근거 보강 기반 본문 초안·새 출처·`freshImageBrief`·`internalLinkIntents`
3. Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice 9축의 본문 위치·근거
4. 운영 컨트롤러가 확인할 통과/blocked 판정 (운영 식별자 제외)

### 일반 신규 기사

1. Focus Keyphrase / SEO 제목 / Slug / Meta Description
2. 본문 초안(마크다운, H2/H3 포함)
3. 내부 링크/외부 링크 제안
   - 내부 링크는 반드시 `amu-magazine` MCP로 실제의 포스트를 검색하여 작성 중인 글과 관련된 기사로 선정
   - 외부 링크는 반드시 **실제로 존재하는 페이지임을 검증** 한 후 링크 추가
4. 삽입 이미지 처리
   - 생성 이미지: 본문 내 `![이미지에 추가할 alt 설명 내용](생성된 이미지의 assetId)` 형식으로 삽입
   - 일반 이미지: `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` 기준 처리
5. (필요 시) 출처 표기 + 영어 키워드 + JSON 메타데이터
   - JSON 메타데이터의 `category`는 **하위 카테고리 slug 정확히 1개**다. 최상위 카테고리 slug와 복수 지정은 금지 — `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`의 "카테고리 구조와 카테고리 slug"

## 필수 체크리스트

- 착수 게이트 통과 — 대조한 기존 기사 운영 식별자, 일치 축, 최종 판정(신규/전면 재작성 교체 리뉴얼/생성 안 함)을 운영 보고에 기록
- 카테고리 — 일반 신규 기사는 `category`가 하위 카테고리 slug 1개인지 확인한다(최상위 slug·복수 지정 금지). WP → WP 리뉴얼 writer는 `category`를 출력하지 않는다
- WP → WP 전면 재작성 교체 리뉴얼: 원문 진단 기록과 새 근거 보강을 확인하고, 집필자와 분리된 quality reviewer가 판정한 9축(Curiosity / Surprise / Evidence / Participation / Payoff / Utility / Memorability / Continuation / Voice)의 구체 근거를 확인
- WP → WP 리뉴얼은 quality reviewer가 `memorableInsight`·`nextQuestion`과 9축에 더해 실질 개선 4항(낡은 사실 정정 · 새 메커니즘·조건·한계 추가 · 구조 재도출 · 원문 문장 잔존 없음)을 판정했는지 확인
- 반전형 Episode의 Tension이 실제 기대-현실 충돌인지, 기사 전체의 Experience가 `판단 대상 → 판단할 틈 → reveal`을 가지는지, `Hook Strength ≤ Answer Strength`와 패턴화 금지를 확인
- 시리즈 표기와 앞뒤 글 링크를 제거해도 제목과 본문이 하나의 주제에 대한 완전한 글인지 확인. 핵심 전제·근거·결론을 다른 편에 맡기면 실패

아래 SEO·링크·이미지 항목은 일반 신규 기사 또는 두 검토 후 운영 컨트롤러가 확인한다. `wp_to_wp_replace` writer에게 실행시키지 않는다.

- 첫 단락에 포커스 키프레이즈 1회 이상 포함
- 본문 길이/키프레이즈 밀도/H2-H3 SEO 규칙 충족
- "당신" 과사용, 번역체 표현, 이중 피동 표현 점검
- 문단 길이/가독성/실행 가능한 액션 가이드 점검
- 링크, 메타데이터 누락 여부 최종 확인
- 이미지 처리 방식 확인
  - WP → WP 리뉴얼의 기존 이미지 asset은 controller-only 재활용 게이트(권리·최신성·새 `freshImageBrief` 적합성) 통과 여부 확인
  - ALT 텍스트에 포커스 키프레이즈 반영 여부
  - 초안 전체 문법/형식이 `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` 기준에 부합하는지 확인

## 발행 자동화 연계

사용자가 WordPress 등록 자동화를 요청한 경우 다음 순서로 진행한다. `wp_to_wp_replace`에서는 writer가 이 절을 실행하지 않는다. quality → 1차 independence 검토 뒤 운영 컨트롤러가 링크·이미지·SEO를 결합하고, 최종 패키지 independence 재검토를 통과한 다음 운영 식별자를 결합해 수행한다.

1. `convert_article_document`로 markdown → HTML 변환 결과와 metadata를 확인
2. `analyze_article_seo`로 자체 SEO 게이트 확인
3. 미통과 항목은 초안에서 직접 수정한 뒤 재검사
4. `create_wordpress_draft`는 먼저 `dryRun=true`로 payload 확인. 등록 전 자체 SEO 분석은 기본 생략(`skipSeoAnalysis=true`)이므로 추가 리포트가 필요할 때만 `skipSeoAnalysis: false` 명시
5. 명시적 요청 시 로컬 draft 등록(`target: "local"`) 후 `verify_wordpress_draft`로 재검증
6. 운영 반영은 production draft 등록(`target: "production"`) 등록 → `verify_wordpress_draft` → `publish_wordpress_post` 순서로만 진행
7. 사람이 직접 처리해야 하는 등록/업데이트는 동일 operation을 공유하는 CLI `pnpm --filter @amu_labs/mcp-amu-magazine wp:draft` 로 대체 가능. 옵션·예시는 `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` 부록 참조

운영 발행은 `AMU_PUBLISHER_ALLOW_PRODUCTION_PUBLISH=true`, `dryRun=false`, `confirmSlug` 일치, SEO 게이트 통과가 모두 필요하다.
