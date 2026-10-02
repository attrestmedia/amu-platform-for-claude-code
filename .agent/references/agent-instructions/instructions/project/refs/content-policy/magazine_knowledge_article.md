# AMU Magazine 기사 작성 정본 (WordPress · Knowledge Content)

* 문서 버전: `magazine-knowledge-article-v2.0`
* 최종 갱신: 2026-09-04
* 상위 기준: `.agent/amu-platform-guide/BUSINESS-CHARTER.md` → `MARKETING-STRATEGY.md` → `INTELLIGENCE-PATTERN-POLICY.md`
* 근거 정본: `.agent/references/AMU_APP/amu_integrated_intelligence_system.md`, `.agent/references/.TEMP/amu_integrated_intelligence_system_thread.md`
* 결정 근거: `.agent/docs/project/2026/09/20260904_104000__intelligence-renewal-policy-decisions-and-roadmap.md`, 원장 `.agent/todo-amu-magazine-intelligence-renewal.json` MIR-001

---

## 1. 이 문서의 지위 — 매거진 기사는 여기서 끝난다

**`allmyuniverse.com`에 발행하는 WordPress 매거진 기사의 작성 규칙은 이 문서가 전부다.** 문체·SEO·구조·지식 계층·출력 JSON까지 여기 있다. 매거진 기사를 쓸 때 다른 작성 문서를 함께 읽지 않는다.

AMU에는 서로 다른 두 기사 산출물이 있고 **작성 문서가 다르다.**

| 산출물 | 표면 | 작성 정본 | 성격 |
| --- | --- | --- | --- |
| **매거진 기사** | WordPress `allmyuniverse.com/{slug}` | **이 문서** | Knowledge Content — 검색·지식·재사용이 목적 |
| **App 경험형 기사** | node-app `/magazine/{slug}` | `{{AGENT_ROOT}}/refs/content-policy/app_post_draft.md` | Experience Content — 매거진 기사를 소재로 삼는 별도 콘텐츠 |

- 두 산출물은 **콘텐츠 ID namespace가 다르다.** 매거진은 WordPress `postId`·`slug`, App은 `amu:magazine:{slug}`다. 섞지 않는다.
- **App 경험형 기사는 매거진 기사의 승격판이 아니라 별도 콘텐츠 엔티티다.** 매거진 기사는 URL·본문 그대로 남는다.
- App 문서는 이 문서의 **문체·9축·Cold Open·커버·출처 규칙을 참조**한다. 그 규칙들의 정본은 여기다. App 문서에 같은 규칙을 복제하지 않는다.

절차 문서는 별도다.

| 문서 | 소유 범위 |
| --- | --- |
| `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` §"WP → WP 같은 URL 리뉴얼 절차" | WP → WP 같은 URL 교체 절차 — 원문 진단, 전면 재작성, 실질 개선 판정, 컨트롤러 결합 |
| `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` | 상위 실행 workflow · Brief · 중복 방지 원장 |
| `.agent/amu-platform-guide/INTELLIGENCE-PATTERN-POLICY.md` | Intelligence 적격성 · Pattern 승격 · Evidence/Proof · 점수 축 |

---

## 2. 신규와 리뉴얼은 같은 기준으로 쓴다

**매거진에 등록하는 글의 작성 기준은 신규·리뉴얼이 동일하다.** 두 모드를 위해 서로 다른 품질 기준·문체·구조를 두지 않는다.

```text
작성 기준 (공통)   이 문서
실행 절차 (분기)   신규     → content_production_workflow.md
                   WP → WP  → content_production_workflow.md "WP → WP 같은 URL 리뉴얼 절차" (진단·재작성·교체 등록)
```

`content_production_workflow.md`의 "WP → WP 같은 URL 리뉴얼 절차"가 정하는 것은 **절차**이며, 리뉴얼이라는 이유로 품질 기준을 낮추거나 별도 문체·구조를 쓰지 않는다.

> 2026-09-04 이전 `new_post_draft.md`(2026-09-09 `app_post_draft.md`로 개칭)에 있던 `WP → WP 리뉴얼` 전용 예외는 제거했다. 품질 기준 부분은 전 기사 공통 기준으로 승격했고, 교체 절차 부분은 `content_production_workflow.md`의 "WP → WP 같은 URL 리뉴얼 절차"가 단독으로 소유한다(2026-09-05 `article_renewal.md` 폐기·통합).

---

## 3. 목표

1. 아래 규칙을 준수해 SEO가 잘 적용된 매력적인 기사 초안을 작성한다.
2. 잘 알려진 사실의 나열에서 그치지 않고, 그 사실·현상의 원리와 덜 알려진 부분까지 이해하기 쉽게 설명한다. 제목으로 유입된 독자의 호기심을 궁금증 발견 → 이유 분석 → 원리 설명의 체계적 구조로 이어 `아하 모먼트`를 만든다.
3. 완성된 기사에서 재사용 가능한 지식(Knowledge Unit·Evidence)이 자연스럽게 남도록 쓴다. **다만 첫 번째 독자는 언제나 사람이다.** Pattern Bank를 위한 데이터 입력 화면을 만들지 않는다.

---

## 4. 규칙

1.  반드시 **{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md**의 룰과 아래의 `기본 초안 작성 프롬프트`을 준수하여, 허용된 첨부 글·독립 리서치 자료를 바탕으로 초안 작성
2.  자연스러운 한국어 기사를 작성하고, 번역체는 최소화
3.  Focus Keyphrase/Slug/Meta Description의 일관성 유지
4.  기사는 내부 링크 1개 이상, 외부 신뢰 링크 1개 이상 포함
    - 내부 링크는 반드시 `amu-magazine` MCP로 실제의 포스트를 검색하여 작성 중인 글과 관련된 기사로 선정, 최소 3개 이상의 내부 링크 클러스터를 구축하고 `/slug` 형태로 적용
    - 각 글에서 허브 1개 링크 / 같은 카테고리의 심화 글 2개 링크 / 다른 카테고리의 전환 글 1개 링크로 구성
    - templateKey/Gen Studio CTA는 R1 맥락과 `SERVICE-ROLE-MAP.md`의 Magazine Exposure 게이트를 모두 통과한 기사에만 1개 적용. 일반 기사에는 강제하지 않으며, 연결해도 서비스 없이 본문의 답이 완결돼야 함
    - 외부 링크는 `WebSearch`를 활용하여 반드시 **실제로 존재하는 페이지임을 검증** 한 후 링크 추가
5.  기사에 어울리는 삽입 이미지의 위치를 선정하여 아래 기준에 따라 처리
    - **리뉴얼 기사인 경우** 이미지가 포함되어 있는 경우(`pexels`, `unsplash` 등의 스톡 이미지 포함) 해당 이미지를 자세히 분석한 후 기사에 활용한다. 저작권 리스크가 있거나, 기존의 이미지가 깨진 경우에만 genstudio mcp를 활용해서 새로운 이미지를 생성하여 적용한다.
    - **이미지는 가장 중요한 1-2가지 포인트에 초점을 맞추고, 내용과 관련된 정보성 이미지로 생성**한다.
    - **`alt`·`이미지 설명`은 기사의 문장이지 이미지 설명이 아니다 (2026-09-10 신설 · 2026-09-11 재개정).** 이 문자열은 `alt` 속성과 화면에 보이는 `figcaption`에 **같은 값으로 동시에 출력**되고(`web-automation-project/wp_mng/format_converter/core/html_processor.py`의 `_render_img_figure`), 본문 텍스트 흐름에도 그대로 섞여 들어간다. **캡션만 따로 떼어 읽었을 때 기사의 한 문장으로 읽혀야 한다.**

      아래 3단계를 순서대로 적용한다. 취향 판단이 아니라 검사다.

      1. **금지어 검사 — 하나라도 들어 있으면 실패다. 다시 쓴다.**
         `화면` · `장면` · `모습` · `이미지` · `사진`(기사 주제어인 경우 제외) · `구도` · `배치`
         `보인다` · `보이는` · `놓여 있다` · `담겨 있다` · `정돈되어` · `대비되어` · `펼쳐진다` · `나타난다`
         **`~다`로 끝나는 것만으로는 통과가 아니다.** `…모이는 장면이 보인다`는 명사구 라벨에 술어만 붙인 것이라 실패다 — 2026-09-11 실측 5건이 전부 이 방식으로 형식만 통과했다.
      2. **주어 검사** — 문장의 주어가 **이미지 속 사물**이면 실패, **기사의 개념·판단·독자의 행동**이면 통과다.
      3. **사물은 기본적으로 언급하지 않는다.** 이미지에 그 사물이 실제로 있을 때만 쓸 수 있다.
         추상화·패턴·질감처럼 이름 붙일 사물이 없는 이미지라면 **사물을 하나도 쓰지 않고** 기사 문장만 쓴다.
         이미지의 전체적인 느낌과 분위기에서 힌트를 얻되, 이미지를 설명하려 들지 않는다.

      - **키프레이즈를 문장의 주어 자리에 놓으면 1·2를 동시에 만족시키기 쉽다.** SEO 게이트(`hasKeywordImageAlt`)가 ALT에 키프레이즈를 요구하므로 키프레이즈는 반드시 들어가야 한다. **키프레이즈를 넣으려고 이미지에 없는 사물을 만들지 않는다.**
      - **발행 본문에 `IMAGE_GUIDE` 주석이나 이미지 작업 메모를 넣지 않는다.** `<!-- IMAGE_GUIDE ... -->` 형식의 주석과 `유형:`, `판단:`, `사유:`, `ALT:`, `프롬프트:` 같은 작업 메모는 본문에 절대 출력하지 않는다. 이미지 계획·재사용 판단·생성 프롬프트는 원고 본문 밖의 작업 기록에 둔다.
      - **ALT 문장을 이미지 밖의 본문 문단에 다시 쓰지 않는다.** 이미지 마크다운의 `![설명](URL)`에 설명을 한 번만 적는다. 변환기가 같은 문자열을 `alt`와 화면에 보이는 `figcaption`으로 렌더링하므로 그 전후의 본문 문장·문단·`ALT:` 행에 같은 설명을 중복 삽입하지 않는다. `figcaption`이 그림 설명으로 한 번 표시되는 것은 정상이다.
      - 종결형을 반복하지 않는다. `~것이 중요하다`·`~해야 한다`가 한 기사 안에서, 그리고 연속 리뉴얼 기사 사이에서 반복되면 훈계조가 된다. 단정·질문·대비를 섞는다.
      - 사진으로 확인할 수 없는 상태를 사실처럼 쓰지 않는다. `알림을 줄인`, `6분간 조사한`처럼 화면 밖 사정을 단정하지 않는다.
      - 이 검사는 발행 게이트 `hasCleanImageCaption`으로도 강제된다. **등록 전에 `analyze_article_seo`로 먼저 확인하고, 실패하면 캡션만 최대 3회까지 다시 쓴다** — 절차는 `content_production_workflow.md`의 "등록 전 SEO·캡션 프리플라이트".

      ```text
      실패  부업 집중을 위해 여러 실험 카드가 하나의 실행 보드로 모이는 장면이 보인다.
            1 금지어 `장면`·`보인다` / 2 주어가 `카드` / 3 실제 이미지는 노트에 펜으로 쓰는 손이다
      통과  부업 집중은 선택지를 줄이는 일이 아니라, 탐색하는 시간과 만드는 시간을 나누는 일이다.

      실패  AI 네이티브 앱에서 기존 업무 흐름과 새로운 작업 보드가 대비되어 보인다.
            실제 이미지는 추상 패턴이다. 이름 붙일 사물이 없으므로 사물을 쓰면 안 된다
      통과  AI 네이티브 앱은 익숙한 형태에 엔진만 바꿔 다는 것으로 완성되지 않는다.

      실패  상품 사진 촬영을 위한 제품과 확산광이 화면 안에 정돈되어 있다.
      통과  상품 사진은 넓게 찍은 한 장보다 질감이 드러나는 한 컷에서 갈린다.
      ```
    - **모델 선택은 `{{AGENT_ROOT}}/refs/content-policy/image_model_routing.md`를 따른다.** 비주얼 중요도가 낮은 보조 이미지·후처리 가능한 인포그래픽은 `supporting_visual`, 텍스트 없는 그래픽은 `graphic_no_text`, 이미지 안에 읽을 수 있는 텍스트가 꼭 필요하거나 템플릿 대표 샘플처럼 고품질이 필요한 경우에만 `premium_template_sample`을 사용한다.
    - 생성 이미지(AI 생성):
      > `genstudio` MCP로 이미지 생성 후 `![이미지에 추가할 alt 설명 내용](생성된 이미지의 assetId)` 형식으로 해당 위치에 삽입
      > MCP 호출 절차/페이로드 매핑은 `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`와 `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md` 참조
          1. 메타 정보에 `templateKey`가 있고 등록된 템플릿이 있을 경우 해당 `templateKey`로 `generate_image` 호출
              - 템플릿이 없는 경우 `genstudio` MCP의 `upsert_image_prompt_template` 도구로 먼저 등록(신규는 `strictNew=true`)한 후 해당 `templateKey`로 생성
          2. `genstudio` MCP의 `list_prompts`툴로 적합한 템플릿을 검색하여 해당 템플릿으로 이미지를 생성
              - 검색 우선순위: `q`(slug/title 부분 일치) → `category` 일치 → `tags` 일치
          3. `templateKey` 메타 정보가 없거나 적합한 템플릿이 없으면 `__gen_studio_custom_prompt__`로 요청
          4. `generate_image`에는 목적에 맞는 `routingProfile`과 `textPolicy`를 명시하고, 실제 provider/model과 폴백 여부를 응답에서 확인
    - **일반 이미지(외부/업로드)**:
      > `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md`의 이미지 가이드를 따름
      > `![이미지에 추가할 alt 설명 내용](/YYYY/image_file.jpg)` 또는 `![이미지에 추가할 alt 설명 내용](https://.../image_file.jpg)` 형식
    - **여러 장의 이미지를 비교하거나 보여주는 경우**: 아래의 구조로 이미지 적용
      ```
      #IMG title=이미지들에 대한 설명
      ![이미지1 설명](이미지 주소 또는 assetid)
      ![이미지2 설명](이미지 주소 또는 assetid)
      ...
      #END
      ```
6.  초안은 기본적으로 markdown 문법을 사용하고 특정한 의미 또는 스타일이 필요한 경우에만 제한적으로 커스텀 문법 사용
    - 초안 작성의 자세한 문법 가이드는 반드시 `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md`를 참고
    - 자주 실수하는 것 한번 더 체크
      > `#TABLE`로 시작하면 반드시 `#END`로 닫아주기
      > `#_source_# 참고 자료:`는 링크가 1개인 경우만 사용, 링크가 2개 이상인 경우 `#### 참고 자료` 타이틀과 하단 리스트 형식으로 구성

---

## 5. 두 독자 — 사람과 기계

AMU Magazine의 글은 두 독자를 동시에 갖는다.

```text
사람    읽고 발견하는 미디어
기계    검색엔진 · AI 에이전트 · AMU 서비스가 재사용하는 Knowledge Corpus
```

**첫 번째 독자는 언제나 사람이다.** 이 문서는 사람이 읽을 글을 훼손하지 않으면서, 그 글에서 재사용 가능한 지식이 자연스럽게 남도록 쓰는 방법을 정한다. Pattern Bank를 위한 데이터 입력 화면을 만드는 문서가 아니다.

적용 대상은 매거진에 등록하는 모든 기사다. 소셜 재가공·네이버 adaptation에는 적용하지 않는다.

---

## 6. Article Mode — knowledge가 기본이다

| Mode | 대상 | 투자 |
| --- | --- | --- |
| `knowledge` | 매거진 기사의 **기본값** | 정확성·명확성·정보 밀도·구조·재사용성 |
| `experience` | 검색·소셜·관계 신호가 실측으로 확인된 글만 | Narrative·Visual·Interactive·Tutors·Gen Studio·Play |

- 모든 글을 완성형 고비용 콘텐츠로 만들지 않는다. **먼저 지식으로 내놓고 시장 반응이 제작비를 결정하게 한다.**
- `experience` 승격은 작성 시점의 판단이 아니라 발행 후 성과 판정이다. 작성 단계에서 스스로 experience로 선언하지 않는다.
- `knowledge` 기본값이라고 해서 교과서 목차로 쓰라는 뜻이 아니다. 정보가 실제로 필요한 위치에 최소 충분히 배치한다.

---

## 7. Minimum Sufficient Content

목표는 **짧게 쓰기가 아니다.**

> 핵심 내용을 완전하게 설명하는 데 필요한 최소한의 콘텐츠

- 분량 하한도 상한도 목표가 아니다. 분량을 채우려고 H2·문단·예시를 늘리지 않는다.
- 중요한 글은 길어져도 된다. 설명이 실제로 필요한 만큼 쓴다.
- 제거 대상: 불필요한 서론, 반복 설명, 장식적 스토리텔링, 길이를 늘리기 위한 가상의 상황 설명.

---

## 8. 한 글 = 하나의 중심 질문 또는 명제

```text
약함   스타트업 성공을 위한 10가지 전략
강함   초기 스타트업이 PMF 전에 광고비를 확대하면 안 되는 이유
```

- 하나의 글은 하나의 `primaryQuestion`과 하나의 `thesis`를 갖는다.
- 소재로는 흥미롭지만 중심 질문에서 벗어나는 구간은 삭제하고 **별도 기사 후보로 기록**한다. 두 콘텐츠를 한 기사에 섞지 않는다.
- 중심 질문이 선명할수록 검색 의도·Semantic Retrieval·Topic Cluster·관련 글 추천이 모두 개선된다.

---

## 9. Knowledge Article 기본 구성 프레임

아래는 `knowledge` 기사의 **기본 구성 프레임**이다. **고정 목차가 아니며 모든 항목을 억지로 채우지 않는다.** H2 제목을 이 이름 그대로 쓰라는 뜻도 아니다 — 소제목은 §10의 Question-Driven 구조와 Episode·Curiosity 규칙을 따른다.

```text
핵심 요약      가장 중요한 결론
무엇이 중요한가  문제와 의미
핵심 원리      재사용 가능한 원칙
전략 / 패턴    어떤 행동으로 연결되는가
근거 / 사례    전략을 이해하거나 검증하는 데 필요한 근거
적용 조건      언제 유효한가
한계 / 반례    언제 통하지 않는가
적용 방법      실행 가능한 행동
관련 개념      연결되는 Knowledge
```

이 프레임의 용도는 두 가지다.

1. **작성 전 자기 점검** — 아홉 칸 중 이 글에 필요한 칸이 무엇이고 어디가 비어 있는지 본다. 특히 `적용 조건`과 `한계 / 반례`가 비면 그 글은 성공 사례 나열로 끝난다.
2. **작성 후 추출 대비** — 완성 원고에서 Knowledge Unit을 뽑을 때 이 칸들이 그대로 후보가 된다.

본문의 실제 순서와 표현은 독자에게 가장 자연스러운 흐름을 따른다. 프레임 이름을 소제목으로 노출하지 않는다.

---

## 10. Question-Driven 구조 (도입부·전개)

기사는 정보 전달이 아니라 질문의 연쇄로 전개한다. 상세는 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md` §19~§21을 따른다.

### Question DNA (작성 전 확인)

```text
Who → Desire → Obstacle → Question
```

### 도입부 원칙

제목에서 만든 긴장과 독자의 질문을 첫 문단에서 무효화하지 않는다. 도입은 Primary Archetype과 검색 의도에 따라 Evidence 장면·선택·결과·사례·직접 답 중에서 고른다. `상황 → 이상징후 → 충돌 → 질문`은 가능한 변주 중 하나일 뿐이며 문장 수·순서를 고정하지 않는다. 짧은 Utility·검색 글은 필요한 답을 일찍 제시하고 Mechanism·한계로 깊어질 수 있다.

### 본문 전개 (Question Loop)

```text
질문 → 부분적 답 → 새로운 질문 → 더 깊은 답 → 해석 → 적용
```

- 답을 숨기지 않는다: 답을 주면서 다음 질문을 만든다.
- `Hook Strength ≤ Answer Strength`(질문보다 답이 강해야 한다).

---

## 11. Content Experience 설계

Question DNA를 확인한 뒤 바로 본문을 쓰지 않는다. 먼저 `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`의 Content Experience Brief를 작성한다.

### 공통 기사 문법

```text
Question → Evidence → Tension → Discovery
→ Experience → Application → Next Question
```

이 7단계는 표면 구조를 맞추는 양식이 아니다. `Question`은 읽을 이유, `Evidence`는 믿을 이유, `Tension`은 실제 기대-현실 충돌, `Discovery`는 이해의 보상, `Experience`는 독자 판단, `Application`은 적용 기준, `Next Question`은 답 뒤의 실제 다음 호기심을 담당한다. 단계의 이름만 H2에 붙이는 방식은 불가다.

- 기사의 기본값은 E1 Story다. E2 Enhanced·E3 Interactive는 승격 게이트를 통과한 기사 또는 명시적인 Reference Implementation에만 쓴다.
- `make | experiment | mystery | decision | teardown | simulator | build` 중 Primary Archetype 1개를 고른다. 보조 Archetype은 1개까지 허용한다.
- 각 H2/H3는 Primary Archetype 안에서 하나의 질문·관찰·발견 또는 판단을 진전시키는 Episode로 만든다. 모든 Episode를 같은 모양으로 만들거나 `기능 소개`, `장점`, `활용법` 같은 정보 분류명만으로 소제목을 만들지 않는다.
- **시리즈 형식의 연결 글이라도 글 제목과 본문은 하나의 주제를 가진 하나의 완전한 글로 완성한다.** 이전·다음 편을 읽지 않아도 `primaryQuestion`의 답·근거·적용 기준이 이해돼야 한다. 시리즈 표기와 내부 링크는 완결된 글 뒤의 `nextQuestion`을 연결할 뿐, 빠진 전제나 결론을 다른 편에 맡기는 장치가 아니다.
- **Episode마다 Curiosity Type을 1개씩 지정한다.** 기사 전체에 한 묶음으로 선언하지 않는다 — 전체 선언만 있으면 개별 섹션이 평범한 설명문으로 회귀한다. 값은 mystery·contradiction·comparison·prediction·detection·decision·reveal에서 고른다.
- **모든 기사에 독자가 선택·비교·예측한 뒤 답을 확인하는 정적 Experience를 최소 1회 둔다.** 짧은 뉴스·Utility 글에서 부자연스러우면 `not_applicable`과 이유를 기록한다.
- `Evidence`는 해석·주장보다 먼저 독자가 만날 수 있어야 한다. `Tension`은 독자의 합리적 예상과 검증된 현실의 충돌이어야 하며, 공포·과장·답 숨기기로 만들지 않는다.
- Experience는 반드시 `판단 대상 → 판단할 틈 → reveal` 순서를 가진다. 표·목록·요약만으로는 Participation을 충족하지 못한다.
- `memorableInsight`에는 독자가 자기 언어로 다시 꺼낼 발견을, `nextQuestion`에는 관련 글 목록이 아닌 답 뒤에 실제로 생기는 다음 호기심을 기록한다.
- ‘3초 생각’, ‘정답은’, ‘하지만’ 같은 장치를 반복하거나 모든 H2를 질문형으로 통일하지 않는다. `Hook Strength ≤ Answer Strength`를 지킨다.
- **스크롤할 때마다 새 의문이 생기게 만든다.** 첫 질문 하나로 열고 나머지를 설명으로 채우면 화면의 사건이 바뀌지 않는다.
  Episode마다 독자가 먼저 품을 질문을 하나씩 정하고, 그 질문을 소제목이나 리드 문장으로 노출한다.
  표기는 질문형·서술형을 섞는다 — 갱신되어야 하는 것은 물음표가 아니라 의문 자체다.

### Assumption → Evidence → Reveal (2026-08-27 신설, 2026-09-04 개정 — 본문 설계 사고법)

Tension·Mystery·Prediction처럼 예상이 뒤집히는 Episode를 설계할 때 **독자가 무엇을 예상했고 그 예상이 무엇 때문에 깨지는지**를 먼저 생각한다. 단순 Utility·정의·절차 Episode에 가짜 반전을 만들지 않는다.

> **2026-09-04 개정 — 이 다섯 항목은 본문을 설계하는 사고 순서이며 출력 메타 필드가 아니다.** 종전에는 `episodes[]`에 `question`·`evidence`·`discovery`·`application`·`assumption`·`reveal`을 함께 적게 했으나, 이 여섯 필드는 저장·검증 어느 소비자도 읽지 않고 내용도 `temporalClaims`·`knowledgeUnits`·`qualityEvidence`와 중복이었다. 설계 결과는 본문과 `qualityEvidence`로 확인하며, 매거진 기사에서는 `episodes[]` 자체를 쓰지 않는다 — 근거: `.agent/docs/project/2026/09/20260904_220354__episodes-meta-deprecation-and-storage-readiness.md`

```text
question     독자가 품는 질문
assumption   독자가 자연스럽게 예상하는 답 (대개 상식·직관)
evidence     그 예상과 어긋나는 관찰·데이터·사례
reveal       그래서 실제로는 무엇이었는가
application  그래서 독자는 무엇을 다르게 하는가
```

- 반전형 Episode에서 `assumption`이 비어 있으면 반전이 성립하지 않으므로 다시 설계한다.
- `assumption`은 독자를 깎아내리는 문장이 아니라 **합리적인 예상**이어야 한다. 누구나 그렇게 생각할 만해야 반전이 의미를 갖는다.
- 반전형 Episode에서는 `assumption`을 먼저 성립시킨 뒤 `evidence`로 흔들고 `reveal`로 닫는다. 다만 필요한 답을 과도하게 숨기지 않으며, 검색·Utility 글은 핵심 답을 먼저 주고 더 깊은 Mechanism으로 진행할 수 있다.

### AMU Reality Lens 적용 (2026-08-27 신설, 선택)

정본은 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "AMU Reality Lens" 절이다.

현실을 시스템으로 해석하는 편집 관점이며, **사실을 바꾸는 권한이 아니다.** 쓰기로 했다면:

- 카테고리에 맞는 `world`를 고른다 — Capital(경제·투자·부동산) / Market(비즈니스·스타트업) / Attention(마케팅·그로스) / Player(자기관리·마인드셋·심리) / Tooling(AI) / Build(AMU 자체).
- 은유를 **한 Episode에 집약**하고 그 위치를 `anchorSectionId`에 적는다. 문단마다 조금씩 바르면 정보 밀도만 떨어진다.
- 강도는 기사 유형을 따른다 — 일반 검색·Utility는 `light`(10~20%), Authority·Mechanism은 `standard`(20~40%), 특집·Interactive는 `heavy`(50~70%).
- **은유가 실제 원리와 어긋나면 폐기한다.** 틀린 인과를 심는 비유는 Lens가 아니라 오보다.
- 제목·`seoTitle`·slug·메타 설명에는 Lens 용어를 넣지 않는다. `Universe`·`Player`·`Quest`·`Level`·`NPC` 같은 게임 용어를 독자에게 보이는 제목·소제목에 노출하지 않는다.
- 금융·투자·세무·의료·법률 기사는 Lens를 설명 보조로만 쓰고, 시뮬레이션에는 가정·한계를 표기한다.

### 서비스 연결 위치

- 서비스 체험은 **기사 끝의 CTA가 아니라 독자가 그 도움을 가장 필요로 하는 Episode 직후**에 둔다. 독자가 문제를 이해한 순간이 행동 확률이 가장 높다.
- 위치는 `expansion.entrySectionId`로 선언하고, 돌아올 지점을 `expansion.returnSectionId`로 지정한다.
- 기사 마지막 행동은 서비스 사용이 아니라 **관계 행동(저장·팔로우·다음 실험 따라가기)**으로 닫아도 된다. 서비스는 결론이 아니라 문제 해결 과정 중간에 등장한다.
- 매거진 표면에는 동적 Interaction Slot이 없다. 빈 블록·가짜 버튼·비활성 서비스를 본문에 노출하지 않는다. 동적 모듈이 필요한 소재는 App 경험형 기사(`app_post_draft.md`) 후보로 넘긴다.
- 기사당 Primary 서비스 1개를 상한으로 한다.
- 서비스 연결 없이도 최초 질문의 답과 판단 기준이 완결돼야 하며, 연결 시 원래 기사 또는 다음 기사로 돌아오는 섹션을 지정한다.

### 독자 노출 표면 (2026-08-28 신설)

상세는 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "독자 노출 표면"을 따른다. 작성 시 지켜야 할 것은 셋이다.

- `Article Experience`·`Interaction Slot`·`Experience Level`·`E1/E2/E3`·`Episode`·`Archetype`을
  독자에게 보이는 문자열로 쓰지 않는다. 내부 메타에서만 쓴다.
- **`primaryQuestion`은 화면에 그대로 출력되는 문장이다.** 연구 질문이 아니라 독자가 입 밖에 낼 말로 쓴다.
  아래 "AMU 매거진 본문 톤 잠금"의 "평어체는 딱딱함의 근거가 아니다" 기준을 그대로 적용한다.
- 서비스 체험 블록의 제목·버튼 문구는 기능 이름이 아니라 **지금 여기서 무엇을 할 수 있는가**로 쓴다.

---

## 12. 도입부(Cold Open) 작성 규칙

규격 정본은 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "Cold Open"이다. 작성 시 지킬 것은 셋이다.

- 첫 3~5문장 안에 **문제·장면·긴장** 셋이 모두 있어야 한다. 순서는 자유다.
- 배경 설명·용어 정의·시장 규모로 열지 않는다. 그건 Evidence가 할 일이다.
- `coldOpen` 메타에 세 요소를 한 줄씩 적는다. 적히지 않으면 도입부가 설계되지 않은 것이다.

첫 단락 키프레이즈(SEO required check)와 충돌하지 않는다. 장면 문장 안에 자연스럽게 넣는다.

`heroLine`은 제목의 반복이 아니라 **이 글을 읽으면 무엇을 알게 되는지의 한 줄 약속**이다.
`seoTitle`은 키프레이즈로 시작해야 해서 편집적으로 좁히기 어렵고, `heroLine`이 그 자리를 대신한다.
둘 다 Voice 축의 평가 대상이다.

## 13. 커버(썸네일) 작성 규칙

커버 전략 정본은 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 "Editorial Cover System"이다.
여기서는 기사 작성 시 채워야 할 것만 정한다.

- 메타에 `coverArtDirection`을 채운다: `grammar`(portrait·still_life·conceptual·documentary·graphic 중 1개),
  `scene`(한 장면 묘사), `tension`(이 커버가 품어야 할 기사의 긴장 한 줄), `textPolicy`(기본 `none`).
- `tension`을 한 줄로 못 적으면 그 커버는 장식이다. 장면을 다시 잡는다.
- 커버는 **설명하지 않고 암시한다.** Before/After·화살표·빨간 원·번호 배지·오류 표시·단계 도식은 커버에 넣지 않는다.
  그건 본문 이미지가 할 일이다.
- 커버 안에 기사 제목을 다시 넣지 않는다. 목록 카드에 이미 제목이 붙는다.
- `setCustomThumbnail` 값은 slug와 동일하게 유지한다. 운영 식별자를 writer가 다루지 않는 실행 모드에서는 컨트롤러가 결합한다.
- 커버와 본문 첫 이미지(Hero)는 **다른 이미지다.** 커버는 인상을, Hero는 첫 번째 질문 또는 첫 번째 증거를 담당한다.
  하나로 겸하면 커버가 설명형으로 되돌아간다.

## 14. 이미지·비교 실험

- 본문 이미지마다 `evidence | comparison | failure | reveal | application` 중 역할을 정한다. 장식용 이미지를 근거처럼 사용하지 않는다.
- AI 생성 이미지는 외부 사실이나 일반적 인과관계의 증거가 아니다. 생성 조건과 결과 편차를 밝히고 실제 자료와 구분한다.
- 비교 실험은 한 번에 변수 하나만 바꾸고 나머지 조건을 통제한다. 단일 결과를 보편적 성과로 확대하지 않는다.

## 15. 작성 후 QA — 9축

`qualityEvidence`에 아래 9축의 **본문 위치와 구체 근거**를 기록한다. 축 이름·점수만 채우는 것은 QA가 아니다. **판정은 writer 자기검수가 아니라 별도 quality reviewer가 9축 전부를 `pass`로 내려야 하며, 하나라도 구체 근거가 비면 `blocked`다.** 기사 유형상 권장 요소를 생략할 때는 `not_applicable`과 이유를 기록한다 — 빈칸은 `not_applicable`이 아니다.

| 축 | 확인할 독자 경험 |
| --- | --- |
| Curiosity | 실제 문제에서 출발한 `primaryQuestion`이 있는가 |
| Surprise | 합리적 예상과 다른 검증된 발견이 있는가 |
| Evidence | 설명보다 먼저 관찰·자료·출처를 만나는가 |
| Participation | 답 전에 판단할 틈이 있는가 |
| Payoff | 최초 질문에 훅보다 강한 답을 주는가 |
| Utility | 조건·한계를 포함한 적용 기준이 있는가 |
| Memorability | `memorableInsight`가 다시 말할 발견인가 |
| Continuation | `nextQuestion`이 답 뒤의 실제 호기심인가 |
| Voice | 독자에게 보이는 문장이 사람의 말인가 |

1. 최초 질문에 충분히 답했는가.
2. Evidence 없이 질문과 반전만 만든 구간이 없는가.
3. **숏폼 적합성 진단** — 핵심 Episode 하나만으로 20~60초 콘텐츠가 가능한가. 어렵다면 질문·Evidence·Payoff가 없는 정보 묶음인지 재검토한다. 이는 Story Quality 진단이지 실제 영상 제작 의무나 Episode 수 하드 게이트가 아니다.
4. **독자 참여 지점이 실제로 있는가.** 표·목록·요약은 참여가 아니다. 독자가 답을 보기 전에 예측하거나 고르는 장면이 최소 1회 있어야 한다. 짧은 뉴스·Utility 글은 생략 이유를 기록할 수 있다.
5. **중심축 이탈 점검** — 각 Episode가 `primaryQuestion`에 답하고 있는가. 소재로는 흥미롭지만 중심 질문에서 벗어나는 구간은 삭제하고 **별도 기사 후보로 기록한다.** 두 개의 콘텐츠를 한 기사에 섞지 않는다.
6. **Thematic spine 회수** — 결론에서 중심 메시지를 제목의 질문과 연결해 닫았는가. 마지막 섹션이 새 주제로 흩어지지 않아야 한다.
7. Experience가 장식이 아니라 이해·판단·적용을 실제로 돕는가.
8. 낮은 성과의 일반 기사에 고비용 인터랙션을 선반영하지 않았는가.
9. ‘3초 생각’·‘정답은’·‘하지만’의 반복이나 모든 H2 질문형 같은 패턴화 없이, 각 Episode가 자기 근거와 긴장으로 작동하는가.
10. 시리즈 연결을 제거해도 제목과 본문이 하나의 주제에 대한 완전한 답으로 성립하는가. 핵심 전제·근거·결론을 이전·다음 편에 떠넘기지 않았는가.

---

## 16. Evergreen Principle과 Temporal Claim을 분리한다

경제·투자·AI·기술 주제에서 특히 중요하다. **현재 시점의 주장과 보편적인 원리를 같은 문장에 섞지 않는다.**

```text
Temporal Claim   2021년 금리가 올라갈 가능성이 있다
Evergreen        금리 상승 → 할인율 상승 → 미래 현금흐름의 현재가치 하락
```

- 본문에서는 시점 주장에 **시점과 출처를 명시**한다. "최근", "요즘", "지금"만으로 쓰지 않는다.
- 원리는 시점 표현 없이 독립적으로 성립하도록 쓴다.
- 내부 메타에는 다음처럼 분리해 기록한다.

```json
{
  "evergreenPrinciple": "금리가 상승하면 미래 현금흐름의 현재가치가 낮아지는 경향이 있다.",
  "temporalClaims": [
    { "date": "2021-09", "claim": "...", "status": "historical", "sourceRef": "..." }
  ]
}
```

- 시점이 지난 주장을 현재형으로 남겨두면 그대로 오보가 된다. 리뉴얼 시 가장 먼저 확인할 항목이다.

---

## 17. 사례는 없애는 것이 아니라 역할을 나눈다

```text
Decorative Example   제거
Evidence             유지하고 구조화
```

**제거 대상** — 길이를 늘리기 위한 가상의 상황 설명.

```text
"카페를 운영한다고 가정해보자. 아침에 문을 열고 손님이 들어오고..."
```

**유지 대상** — 전략의 원리를 설명하거나 검증하는 실제 자료.

```text
Duolingo → Brand Character → Creator-like Social Presence → Organic Reach
```

- Evidence는 **설명·주장보다 먼저** 독자가 만날 수 있어야 한다.
- 실제 관찰, 외부 주장, AMU 해석, 가설을 **문장 수준에서 구분**한다. 넷을 한 문단에 섞어 쓰지 않는다.
- 수치·인용·최신 사실은 출처와 관측 시점을 함께 추적한다.
- **Intelligence를 맞추기 위해 사례·인과·반례를 창작하지 않는다.** 없으면 없는 채로 둔다.

---

## 18. 조건·한계·반례를 함께 쓴다

성공 사례 모음으로 끝나는 글은 재사용할 수 없다. 같은 행동이 어떤 조건에서 통하고 어떤 조건에서 실패하는지가 지식의 핵심이다.

```text
High Frequency Posting          어떤 상황에서 유효
Low Frequency + High Engagement 다른 상황에서 더 유효
```

기사에는 최소 다음이 자연스럽게 드러나야 한다.

| 요소 | 독자에게 보이는 형태 |
| --- | --- |
| Mechanism | 왜 그렇게 되는가 |
| Conditions | 언제 유효한가 |
| Limitations | 무엇을 보장하지 않는가 |
| Counter-example | 반대로 작동한 사례 또는 조건 |

- 서로 반대되는 결과를 만나면 하나를 버리지 않고 **조건·대상·시점의 차이**로 쓴다.
- 단일 사례를 보편 법칙으로 확대하지 않는다. AI 생성 이미지·단일 실험 결과는 외부 사실의 증거가 아니다.

---

## 19. Knowledge Unit — 기사보다 작은 재사용 단위

하나의 기사에서 여러 개의 독립된 지식이 나온다.

```text
Article
├─ Knowledge Unit 1  Demand Before Build
├─ Knowledge Unit 2  Fake Door Test
└─ Knowledge Unit 3  Dropbox MVP Case
```

writer는 원고 완성 후 내부 메타에 Knowledge Unit 후보를 기록한다. **본문에는 노출하지 않는다.**

> **필드명·구조의 정본은 저장 계약이다 (2026-09-05).** 아래는 node-app `magazine_knowledge_units`
> (`magazine-knowledge-unit.v1`)의 필드를 그대로 쓴다. 원고 메타에서 이름을 바꾸거나 축약하지 않는다.

```text
unitType      case | evidence | signal | tactic | principle | pattern | anti_pattern | hypothesis
statement     한 문장 진술
articleSpan   본문 어디서 나온 지식인가 — 해당 소제목 문구를 그대로 적는다 (2026-09-04: episodes 폐기로 sectionId 참조를 대체)
mechanism     작동 원리
conditions[]  유효 조건
limitations[] 한계
evidenceRefs[] 근거. 문자열 URL 목록이 아니라 아래 8필드 객체다
```

`evidenceRefs[]`의 각 항목은 `INTELLIGENCE-PATTERN-POLICY.md` §5.1의 Evidence 최소 계약 그대로다.

```text
id           kebab-case 식별자. 기사 안에서 고유
sourceType   자료 성격 한 단어 (case · report · interview · observation …)
sourceRef    http(s) URL 또는 승인된 opaque reference(urn:·doi:·amu:). 그 외 scheme은 저장이 거부된다
articleSpan  이 근거가 쓰인 본문 위치 — 해당 소제목 문구
observedAt   관측 시점. YYYY-MM-DD 또는 ISO datetime
claimStatus  measured | sourced | hypothesis | prohibited
supports     이 근거가 무엇을 지지하는가 한 문장
limitations[] 이 근거가 보장하지 않는 것
```

- 본문을 문장 단위로 쪼개 모든 조각을 unit으로 만들지 않는다. **독자가 판단하거나 검색이 재사용할 수 있는 최소 충분 단위**만 만든다.
- 후보가 0개인 기사는 정상이다. 억지로 만들지 않는다.
- `evidenceRefs`가 빈 배열인 unit도 정상이다. **근거가 없는데 `sourceRef`를 지어내지 않는다.**
- 종전 `sourceRefs`(문자열 배열)는 2026-09-05에 폐기했다. 저장 계약이 8필드 객체를 요구하므로 문자열만 남기면 관측 시점·claim 상태가 유실된다.

---

## 20. Evidence와 Proof를 섞지 않는다

정본은 `.agent/amu-platform-guide/PROOF-BANK.md`와 `INTELLIGENCE-PATTERN-POLICY.md` §5다. 작성 시 지킬 것은 셋이다.

- **외부 사례는 AMU의 Proof가 아니다.** 외부에서 관찰한 것을 AMU가 검증한 것처럼 쓰지 않는다.
- AMU 자체 측정도 **분모·기간·조건·허용 claim이 확정되기 전에는 Proof가 아니라 Signal**이다.
- 모델의 confidence는 근거 강도가 아니다. 근거로 인용하지 않는다.

```text
외부 관찰   "Duolingo는 TikTok에서 브랜드 캐릭터로 도달을 만들었다"     → Evidence
AMU 검증    "AMU가 같은 방식을 4주 실험해 X를 얻었다(분모·기간 명시)"   → Proof 후보
```

---

## 21. 내부 설계 언어를 독자 표면에 노출하지 않는다

다음은 `title`·`seoTitle`·H2·eyebrow·본문·메타 설명 어디에도 쓰지 않는다.

```text
Pattern 이름 · Pattern # · Registry ID · Evidence Level · Primary Pattern
Knowledge Unit · unitType · intelligenceRole · 내부 점수 · auditScore
Article Experience · Interaction Slot · Experience Level · E1/E2/E3 · Episode · Archetype
Universe · Player · Quest · Level · NPC (Reality Lens 게임 용어)
```

- Pattern은 이름으로 부르지 않고 **상황 → 행동 → 메커니즘 → 결과**로 보여준다.
- `primaryQuestion`은 화면에 그대로 출력되는 문장이다. 연구 질문이 아니라 독자가 입 밖에 낼 말로 쓴다.

---

## 22. 서비스 연결

정본은 `MARKETING-STRATEGY.md`의 R Routing·CTA 절과 `SERVICE-ROLE-MAP.md`다.

- **모든 기사에 같은 서비스 CTA를 붙이지 않는다.** 확장 CTA는 기사 맥락을 반드시 동반한다.
- 기사당 Primary 서비스 **1개**를 상한으로 한다.
- 서비스 연결 없이도 최초 질문의 답과 판단 기준이 완결돼야 한다.
- 페이월·멤버십·프리미엄 콘텐츠·회원 전용 기사를 전제한 표현을 쓰지 않는다. AMU에 존재하지 않는다.

---

## 23. H1 제목 생성 규칙

`title`(독자에게 보이는 H1)과 `seoTitle`(검색엔진 `<title>`)은 **목적이 다른 별개 필드다. 하나로 합쳐 쓰지 않는다.**

### H1 — 독자의 궁금증을 여는 기본 원칙

아래는 강한 기본형이지 모든 제목의 고정 템플릿이 아니다. Primary Archetype·검색 의도·기사 유형에 따라 장면형·결과형·선택형·명료한 Utility형으로 변주할 수 있다. 통과 기준은 독자의 실제 질문·가치가 보이고 제목의 약속을 본문이 충분히 갚는가다.

1. 가능하면 독자가 자기 상황으로 읽을 수 있는 주어와 현재의 문제를 쓴다. AMU·서비스명·팀을 주어로 삼을 때도 독자 가치가 먼저 보여야 한다.
2. Tension형 기사는 기능명보다 기대와 현실의 충돌을 제목에 드러낼 수 있다. 장면형·결과형·Utility형에는 같은 문법을 억지로 적용하지 않는다.
3. `~이유`, `~왜 ~할까` 같은 궁금증 종결어는 선택지다. 모든 제목을 질문형·이유형으로 닫지 않는다.
4. 강한 기본형 중 하나는 `[독자가 당연하게 여기는 사실] + 역접 + [모순되는 현실] + 이유`다.
5. **H1에 포커스 키프레이즈를 넣지 않아도 된다.** 검색 노출은 `seoTitle`이 담당한다.

Tension형 기사에서 독자 질문을 선명하게 하는 한 가지 비교 예시다. 다른 Archetype의 제목까지 이 형태로 복제하지 않는다.

```text
약함  AI 발음 분석, 받아쓴 글자 말고 목소리를 듣기로 한 이유   (기능·제작 결정 중심)
강함  AI가 내 말을 전부 알아들었지만, 발음은 여전히 이상한 이유  (독자 문제·인지 충돌 중심)
```

### seoTitle — 검색 의도를 담당

- 포커스 키프레이즈로 시작하고 25~58자를 지킨다.
- 생략하면 `publisher.ts`의 `buildSeoTitle`이 `"{키프레이즈}: {title}"` 형태로 자동 생성해 `_yoast_wpseo_title`에 저장한다. 자동 생성 결과가 어색할 때만 직접 지정한다.
- **자체 SEO 게이트의 `hasFocusKeywordInTitle`·`hasFocusKeywordAtSeoTitleStart`는 `title`이 아니라 이 `seoTitle`을 검사한다.** H1을 키워드-선두로 쓰지 않아도 감점이 없다 — 상세: `{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md`

---

## 24. 필수 SEO 규칙

### SEO 기본 구조

- 포커스 키프레이즈: 검색 노출을 원하는 대표 롱테일 키워드 1개
- SEO 제목(`seoTitle`): 포커스 키프레이즈로 시작, 25~58자. **위 "H1 제목 생성 규칙"에 따라 `title`과 분리해 쓴다**
- URL 슬러그: 소문자, 하이픈(-) 사용, 핵심 단어 3~6개
- 메타 설명: 키프레이즈 1회 이상 포함, 핵심 가치 표현, 80~155자

### 본문 SEO 규칙

- 첫 단락: 키프레이즈 최소 1회 자연스럽게 삽입
- 본문 길이: **하한도 상한도 목표로 삼지 않는다.** 구글은 단어 수를 랭킹 요인으로 쓰지 않는다("Word count is not a ranking factor" — John Mueller). 주제를 충분히 다루는 데 필요한 만큼 쓰고, 분량을 채우려고 H2·문단·예시를 늘리지 않는다. 게이트의 300단어 하한은 빈 본문·변환 실패 방어선일 뿐이다 — 상세: `{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md` §2
- 키프레이즈 밀도: 본문 전체에서 2~5회 자연스럽게 등장 (3% 미만 유지)
- 소제목(H2/H3): 1~2개에 키프레이즈 또는 유사 표현 사용
- 내부 링크: 최소 3개 이상 (관련 글, 시리즈, 핵심 콘텐츠). **개수보다 관련성의 강도가 우선한다** — 아래 "내부 링크 배치 규칙" 참조
- 외부 링크: 최소 2개 이상 (신뢰할 수 있는 공식 자료, 통계, 원문)

### 내부 링크 배치 규칙 (2026-08-27 신설)

- 내부 링크는 **독자가 다음 질문을 품는 순간**에만 넣는다. 링크 개수를 채우려고 주제 연결이 약한 글을 끌어오지 않는다.
- 링크 문장이 `~에서도 같은 형태로 드러난다`, `~와 결이 같은 이야기다`처럼 **연결 근거를 설명해야만 성립**하면 그 링크는 억지다. 빼는 편이 낫다.
- 최소 3개를 채우지 못할 만큼 관련 글이 없으면 링크를 억지로 만들지 말고, 그 사실을 보고에 남긴다. 약한 링크 1개보다 3개가 낫지 않다.
- 이미지: 최소 1개 + `alt`/캡션은 규칙 5의 캡션 작성 문법을 따르고 키프레이즈를 문장 안에 포함

### 발행 자동화 전 SEO 게이트

기사 등록 자동화를 사용할 때는 `amu-magazine` MCP의 자체 SEO 게이트를 발행 전 필수 검증으로 사용한다.

> 검사기의 알려진 한계(한국어 단어 수 저평가, slug/키프레이즈 구조적 천장, asset-id 이미지 미집계 등)와
> 대응 규칙은 반드시 `{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md`를 먼저 확인한다.

1. `convert_article_document`로 기사 markdown을 기존 `format_converter` 기준 HTML로 변환한다.
2. `analyze_article_seo`로 Focus Keyphrase/SEO 제목/Slug/Meta Description/첫 단락/H2-H3/내부 링크/외부 링크/이미지 ALT/키프레이즈 밀도를 점검한다.
3. 자체 SEO 점수는 기본 85점 이상이어야 하며, 필수 required check가 모두 통과해야 발행 가능 상태로 본다.
4. `create_wordpress_draft`는 기본 `dryRun: true`로 먼저 payload를 확인한 뒤, `target: "local"`(기본) 또는 `target: "both"`(local+production 동시)로 등록한다. 등록 전 자체 SEO 분석은 기본 생략되므로(`skipSeoAnalysis=true`) SEO 리포트가 필요하면 `skipSeoAnalysis: false`를 명시한다. 사전 검증은 위 2~3 단계의 `analyze_article_seo`로 수행한다.
5. `verify_wordpress_draft`로 실제 저장된 draft HTML을 다시 읽어 SEO를 재검증한다.
6. 운영 반영은 항상 production draft 등록 후 재검증하고, 통과 시에만 `publish_wordpress_post`를 사용한다.

주의:

- Yoast UI의 녹색불과 자체 SEO 게이트는 동일한 점수가 아니다. 자체 게이트는 운영 자동화를 위한 품질 기준이다.
- production publish는 `AMU_PUBLISHER_ALLOW_PRODUCTION_PUBLISH=true`, `dryRun=false`, `confirmSlug` 일치, SEO 게이트 통과가 모두 필요하다.
- `AMU_WP_*_APP_PASSWORD`는 WordPress 로그인 비밀번호가 아니라 관리자 화면에서 별도로 발급하는 Application Password다.
- **기사 `filePath`는 반드시 `AMU_PUBLISHER_ALLOWED_ARTICLE_ROOTS`에 등록된 루트(현 운영값: `/home/attrest-samsung-linux/Project/.agent/content/articles`) 아래의 절대경로로 전달한다.** 동일 파일의 mirror 경로(예: `/home/attrest-samsung-linux/Project/.agent/content/articles/...`)는 즉시 `허용되지 않은 기사 파일 경로입니다` 에러로 거부된다.
- **`create_wordpress_draft`와 `verify_wordpress_draft`는 local과 production을 동일 메시지에서 병렬 호출하지 않는다.** local 단계를 먼저 마무리하고 결과를 확인한 뒤, 별도 단계에서 production을 처리한다. 병렬 호출 시 MCP 측 직렬 대기 + production REST 응답 지연으로 장시간 hang이 발생한 사례가 있다(정상 단일 호출은 30초 이내 완료).
- 사람이 직접 등록/업데이트해야 하는 경우(에이전트 호출 latency 우회 등)에는 동일 operation을 공유하는 CLI를 사용할 수 있다. 사용 예시는 `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` 부록 또는 `amu_labs/apps/mcp/amu-magazine/README.md`의 `wp:draft` 섹션을 참조한다.
  - `pnpm --filter @amu_labs/mcp-amu-magazine wp:draft --file <md경로> --target local --update-existing` (로컬 draft 등록/갱신)
  - `--target both --update-existing --yes`로 local+production 동시 처리(운영 쓰기 포함은 `--yes` 필수)
  - 자체 SEO 분석은 CLI에서도 기본 생략. 필요 시 `--analyze-seo` 명시.

---

## 25. 가독성을 위한 필수 규칙

- 연결어: '무엇보다도', '왜냐하면', '따라서', '게다가'와 같은 연결어를 사용하여 글을 매끄럽게 연결, 다음에 나올 내용을 암시하여 글의 흐름을 자연스럽게 만들기
- 문장 시작 부분: 문장을 다양하게 구성하여 글의 가독성을 높이고 흐름을 원활하게 만들기
- 단어 난이도: 흔하지 않고 어려운 단어 대신 쉬운 단어로 이해하기 쉽게 만들기
- 단락 길이: 단락을 나누고, 짧게 작성하며, 핵심 문장에는 충분한 생각 담기
- 소제목 배치: 글을 쉽게 이해하고 원하는 정보를 찾을 수 있도록 충분한 소제목 사용하기
- 문장 길이: 문장을 너무 길게(20단어 이상) 쓰지 않고, 간결하게 만들기
- 수동태: 수동태를 사용할 때는 항상 능동태로 바꾸는 것이 더 나은 대안이 있는지 고려하기

---

## 26. 문체와 글 작성 규칙

- 초안 작성 시 아래 규칙을 최우선으로 적용

### 역할 정의

- 소셜미디어에서 큰 호응을 이끌어내는 설득력 있고 매력적인 문체를 가진 전문 작가이자 SEO 전문가
- 인사이트를 제공하는 콘텐츠에 특화된 전문가로 지식과 인사이트를 기반으로 한 영미권 자기계발 콘텐츠(Dan Koe, Mark Manson 스타일)의 구조적 설득력을 보여주는 자연스러운 한국어 기사를 작성

### 핵심 문체 원칙 - 자기계발 에세이

- 장르: 자기계발/생산성/비즈니스/일상의 인사이트를 제공하는 에세이
- 톤: 직설적이되 따뜻, 권위적이되 겸손, 도발적이되 공감적
- 구조: 영미권 long-form newsletter 스타일의 논리 구조와 세련된 문장 감각
- 목표: 독자의 행동 변화/생각의 전환을 유도하는 "Transformational Content"

### 핵심 문체 공식

- 버나드 쇼의 재치 + 헤밍웨이의 간결함 + 글의 자연스러운 리듬감
- 한 문장 = 한 생각 (영어식 복문 금지)
- 핵심 먼저, 수식은 뒤로 (두괄식)
- 읽었을 때 입에서 자연스럽게 나오는 문장
- 불필요한 조사/접속사는 과감히 생략

### AMU 매거진 본문 톤 잠금

- 모든 기사의 본문은 **평어 기반 자기계발 에세이 톤**을 기준으로 작성한다.
- 본문 기본 종결은 `~다`, `~한다`, `~된다`, `~있다`, `~아니다`, `~게 된다`, `~니까`, `~거든`, `~잖아`를 중심으로 잡는다.
- `습니다/합니다/됩니다/있습니다/했습니다/보겠습니다` 중심의 보고서체, 설명문체, 기관 블로그체는 매거진 본문 톤이 아니다. 인용문, 외부 자료명, 문맥상 필요한 1-2회 예외를 제외하고 남용하지 않는다.
- `해요/예요/돼요/있어요` 중심의 친근한 존대어는 소셜 콘텐츠 재가공에는 사용할 수 있지만, AMU 매거진 본문에서는 전체 레지스터가 되면 안 된다.
- 초안 완성 후 마지막에 문체 QA를 수행한다: `습니다/합니다/됩니다`가 문단마다 반복되면 평어 에세이 톤으로 다시 고친다. `해요체`와 `습니다체`가 섞여 있으면 매거진 본문 기준으로 통일한다.

#### 평어체는 딱딱함의 근거가 아니다 (2026-08-28 신설)

평어로 쓴다고 문장이 저절로 좋아지지 않는다. 같은 평어라도 보고서 문장과 독자에게 말 거는 문장은 다르다.
2026-08-28 실측에서 본문 근거는 충분한데 질문과 소제목이 연구 계획서처럼 읽힌다는 지적이 나왔다.

- 한 문장에 조건절이나 병렬 명사구를 세 개 이상 쌓지 않는다. 정의·범위·예외를 한 문장에 다 넣지 않는다.
- 명사구로 끝나는 개념 나열(`~의 범위와 한계`, `~에 대한 판단 기준`)을 문장의 주어·목적어로 반복하지 않는다.
- 소리 내어 읽어본다. 사람이 실제로 그렇게 말하지 않으면 고친다.
- 평어를 유지한 채로 말랑하게 만드는 수단은 어미가 아니라 **문장 길이와 리듬**이다. 짧은 문장을 섞고,
  단정 뒤에 한 박자 쉬는 문장을 둔다.

```text
딱딱  의류 상품 페이지의 모델 착용샷을 AI로 만들 때, 어디까지가 실제로 쓸 수 있는
      범위이고 어디부터가 반품과 규제로 되돌아오는가
말랑  AI 착용샷, 실제 상품 페이지에 어디까지 써도 괜찮을까?

딱딱  그래서 어디까지 AI 모델 착용샷을 쓰고, 어디부터 실사로 남기나
말랑  그럼 어디까지 AI로 쓰고, 어디부터 실사로 남길까?
```

이 규칙은 H1·H2·`primaryQuestion`·리드 문단에 특히 강하게 적용한다. 근거 문단의 정밀한 표현까지
말랑하게 바꾸라는 뜻이 아니다. **판단과 근거는 그대로 두고 독자를 부르는 문장만 자연스럽게 만든다.**

### 글 작성 규칙

#### 1. 문장 구조

**금지 패턴**

| 번역체 (금지) | 한국어다운 표현 (권장) |
|---|---|
| "당신이 ~한다면, 아마 ~할 것이다" | "~하면 ~하게 된다" 또는 주어 생략 |
| "~라고 단순히 스스로를 설득하는 것보다 훨씬 더 깊은 곳에서 시작된다" | "~라는 다짐만으론 안 된다. 더 깊은 데서 시작해야 한다." |
| "부패한 토대 위에 훌륭한 삶을 지으려 했기 때문이다" | "토대가 썩었는데 그 위에 뭘 짓겠다고?" |
| "~에 대해 깊은 불편함과 혐오감을 느낄 것이다" | "~가 역겨워질 것이다." |

**권장 패턴**

- 긴 수식어구 → 별도 문장으로 분리
- "~것이다" 연속 → "~다", "~하게 된다", "~니까" 등으로 변주
- 명사형 종결 → 동사형 종결 우선 ("변화의 시작" → "변하기 시작한다")
- 피동형 과다 사용 금지 ("발견되어진다" → "찾게 된다")

**예시**

```text
[Before - 번역체]
"자신을 진정으로 변화시키면, 목표에 도움이 되지 않는 모든 습관은 혐오스러워진다. 나쁜 습관이 모여 결국 어떤 망가진 삶을 만들어내는지 뼈저리게 자각하기 때문이다."

[After - 한국어다운 문장]
"진짜로 달라지면, 나쁜 습관이 역겨워진다. 이게 쌓이면 어떤 꼴이 되는지 뼈저리게 알게 되니까."
```

#### 2. 인칭 사용 규칙

"당신"을 반복하면 어색하거나 공격적인 느낌. 아래 전략으로 분산:

| 상황 | 권장 표현 |
|---|---|
| 일반적 진술 | 주어 생략 (한국어는 주어 생략이 자연스러움) |
| 독자와 연대감 형성 | "우리" 사용 |
| 저자의 경험 공유 후 투영 유도 | "나"로 시작 → 독자가 자연스럽게 대입 |
| 직접 호명 필요시 | "여러분" (단, 과용 금지) |
| 강한 직접 호소 | "당신" (글 전체에서 3-5회 이내로 제한) |

**예시**

```text
[Before]
"당신이 나와 비슷하다면, 아마 새해 결심 같은 건 참 어리석다고 생각할 것이다."

[After]
"나와 비슷한 사람이라면, 새해 결심 같은 건 좀 어리석다고 느낄 것이다."
```

#### 3. 어휘 선택 규칙

| 번역투/추상어 | 한국어다운 표현 |
|---|---|
| 심리적 굴착(Psychological Excavation) | 마음 파헤치기, 속마음 캐기 |
| 부조화(Dissonance) | 찝찝함, 뭔가 안 맞는 느낌 |
| 조건화된 습관 | 몸에 밴 버릇 |
| 정체성을 방어한다 | 나라는 사람을 지키려 한다 |
| 인식의 렌즈 | 보는 눈, 관점 |
| 메타적 관점 | 한 발 물러서서 보는 시각 |
| 사이버네틱스 | (풀어서 설명 후) 방향 조정 능력 |

단, 핵심 브랜딩 용어는 유지:

- "비전", "안티 비전" 등과 같은 핵심 개념어는 유지
- 처음 등장할 때 쉬운 말로 1회 풀이 후 사용 권장

#### 4. 톤 규칙

| 명령조 (피하기) | 동행조 (권장) |
|---------------|---------------|
| "펜과 종이를 준비하라" | "펜이랑 종이 하나 꺼내보자" |
| "다음 과정을 따라야 한다" | "나는 이렇게 했다. 맞으면 쓰고, 아니면 버려도 된다" |
| "이제 시작하겠다" | "자, 시작해보자" |
| "반드시 ~해야 한다" | "~하면 확실히 달라진다" |
| "이 프로토콜을 정확히 따를 것을 권장한다" | "이대로 한번 해보자. 효과가 있다면 계속 쓰면 된다" |

핵심 원칙:

- 저자도 함께 고민하고 있다는 뉘앙스
- 독자의 선택권을 존중하는 표현
- "나도 그랬다" → "이렇게 해봤다" → "효과가 있었다" 흐름

#### 5. 글 구조 규칙

아래 흐름은 `problem/insight`형 기사의 보조 규칙이다. 상위의 Content Experience Brief와 Primary Archetype이 구조를 우선 결정한다.

해당 유형의 예시 흐름: 문제 제기 → 인사이트 → 해결책 → 요약. 다른 Archetype에는 복제하지 않는다.

1. 오프닝 (Hook): 도발적/공감적 첫 문장으로 시작
   - 예시: "~라고 생각한 적 있을 거다", "솔직히 말하면, ~", "대부분의 사람들이 모르는 게 있다"

2. 문제 제기: 구체적인 상황 묘사 등으로 독자의 고통/불편함을 정확히 짚기
   - 예시: "이런 경험 있지 않나?"

3. 인사이트 전개: 왜 그런지 원인 분석
   - 숫자/번호로 섹션 구분하기
   - 각 섹션에 명확한 소제목 달기
   - 인용문으로 권위 부여

4. 해결책/실행 가이드 제시: 구체적인 액션 아이템
   - 체크리스트, 질문 리스트, 단계별 가이드
   - 예시: "오늘 당장 해볼 수 있는 한 가지"

5. 클로징: 핵심 메시지 압축 + 여운
   - 한 문장으로 요약
   - 독자에게 던지는 마지막 질문 또는 선언

#### 6. 예시/비유의 한국화

글로벌 예시를 한국 독자에게 와닿는 맥락으로 전환:

| 원문 예시 | 한국화 예시 |
|---|---|
| 수천억 원의 CEO | 월 1000 찍는 1인 사업가 |
| 보디빌더 | 새벽 5시에 헬스장 가는 직장인 |
| 미국 스타트업 성공 사례 | 토스, 당근마켓, 마켓컬리, 배달의민족 등 국내 스타트업 사례 |
| "퇴사하고 창업" | "안정적인 직장 vs 하고 싶은 일" 갈등 |
| 억만장자의 아침 루틴 | 퇴근 후 사이드 프로젝트 하는 N잡러의 루틴 |

사용할 수 있는 한국적 레퍼런스:

- 공시생, 취준생, 이직러의 현실
- 네이버 블로그/스마트스토어/쿠팡 파트너스 경험
- 부동산/주식 투자 고민
- 번아웃, 워라밸, 조용한 사직(quiet quitting)
- MZ세대 특성, 586세대와의 갈등

### 필수 글 작성 규칙

#### 절대 사용 금지 규칙

- "~해봅시다", "~하시겠습니까?" (어색한 격식체)
- "~되어지다", "~해지게 되다" (이중 피동)
- "~라고 할 수 있겠다", "~인 것으로 보인다" (불필요한 회피)
- "~에 있어서", "~함에 있어" (번역투 조사)
- "그것은", "이것은" 반복 (대명사 과다)
- "또한", "핵심적인", "지속적인", "활기찬", "지형(추상)", "태피스트리" (AI 고빈도 어휘)
- "~의 역할을 합니다", "~을 자랑합니다", "~을 선보이며" (계사 회피 패턴)
- "~하며..., ~하며..., ~하며..." 연속 구문 (피상적 분석 패턴)
- 이모지로 제목/글머리 장식, 불필요한 굵은 글씨 남용
- 한국 직장인, 한국 자영업자들 처럼 부자연스러운 '한국' 강조 문장 (불필요한 강조)

#### 권장 표현 규칙

- "~다", "~한다", "~게 된다" (간결한 종결)
- "~니까", "~거든", "~잖아" (구어체 연결)
- "솔직히", "사실", "결국" (자연스러운 전환)
- 주어 생략 (한국어의 자연스러운 특성 활용)

#### 글 작성 전 반드시 고려하기

1. 이 키워드를 검색한 사람은 무엇을 해결하고 싶은가?
2. 어떤 정보/인사이트를 얻고 싶어 하는가?
3. 검색 후 어떤 행동을 하고 싶은가?

#### 문제 공간 vs 솔루션 공간 구분하기

- 사용자가 요청하는 "솔루션"이 아니라
- 그 뒤에 숨은 "진짜 문제"를 파악하고 해결

#### 전문성과 가독성 균형 맞추기

**전문성**

- 글 작성 전 반드시 최신 데이터/연구 검색
- 실제 통계, 연구 결과, 구체적 사례로 근거 강화
- 잘 알려지지 않은 주제 → 글로벌 서비스/브랜드와 비교 포함
- 검증된 전문가 수준의 지식 베이스 활용

**가독성**

- 일반 독자도 전문 내용을 쉽게 이해할 수 있도록
- Hemingway Editor Grade 7-9 수준
- 20단어 이상 긴 문장은 전체의 25% 이하
- 단락 길이 4~6문장 이하
- 전환어 적극 사용: "하지만", "그런데", "결국", "무엇보다", "한편"

#### 실용적 가치 제공하기

필요시 독자가 바로 활용할 수 있는 실용적 섹션 추가:

- 체크리스트
- 질문 리스트
- 단계별 가이드
- "오늘 당장 해볼 수 있는 것"
- Before/After 비교

### 26-9. 출처 및 마무리 규칙

#### 출처 표기

- '참고 콘텐츠'에 출처 정보와 URL이 있을 경우: `#_source_# 참고 자료: 출처, ["제목"](url)`
- '참고 콘텐츠'에 출처 정보만 있을 경우: `#_source_# 참고 자료: 출처, "제목"`
- 마크다운 강조 표현(볼드/이탤릭) 사용 금지

### 26-10. JSON 데이터 생성 규칙

#### 담당 아이디 매핑

| 주제 | 담당 ID |
|---|---|
| Business, Economy & Investment | life2 |
| Economy & Investment | csy8129 |
| Marketing, Growth & Productivity | choco_51 |
| AI & Work | tech_adopter |
| AMU & Build in Public | attrest_admin |

#### 카테고리 구조와 카테고리 slug

**한 포스트는 카테고리를 정확히 1개만 갖는다. 그 1개는 대괄호 안의 최상위 카테고리가 아니라, 해당 대상 WordPress에 실제로 정의된 하위 카테고리 중 하나여야 한다 (2026-09-12 신설, 2026-09-27 resolver 보정).**

- `category`에는 **하위 카테고리 slug 하나만** 적는다. 쉼표로 둘 이상 적지 않는다.
- **최상위 카테고리 slug(`business`·`economy-investment`·`marketing`·`growth-productivity`·`ai-work`·`amu-build-in-public`)를 `category`에 적지 않는다.** 최상위는 하위 카테고리의 부모로 이미 표현되며, 포스트에 함께 달면 매거진 표면에 카테고리가 두 줄로 노출된다(2026-09-12 실측).
- 등록 전 `taxonomy=category`를 로컬과 운영에서 각각 조회한다. WordPress가 반환한 실제 slug·name·parent가 해당 환경의 정본이며, 카테고리 ID는 환경마다 따로 해석한다. 한 환경의 ID를 다른 환경에 재사용하지 않는다.
- `create_wordpress_draft`는 실제 등록 전에 `dryRun: true, target: "both"`로 실행해 두 환경의 `targetResults.categoryIds`를 확인한다. 두 결과가 모두 선택한 실제 하위 용어를 가리켜야 한다. dry-run 실패·용어 누락·대상 결과 누락이 있으면 어느 쪽에도 쓰지 않는다.
- `category`에는 실제 하위 카테고리의 **정확한 slug**를 우선 사용한다. 이름 입력은 해당 환경의 실제 용어 이름과 정확히 일치할 때만 허용한다. 부분 검색·유사 이름·추정 alias로 다른 카테고리를 고르지 않는다.
- 동일 URL 리뉴얼에서 기존 분류를 유지하면 `category`를 생략한다. 분류를 지정·교정해야 하면 기존 포스트의 실제 카테고리와 기사 주제를 대조하고, 로컬·운영 각각에 같은 의미의 실제 하위 카테고리가 존재하는지 확인한 뒤 대상별 ID로 해석한다.
- 한 환경에서만 용어가 존재하거나 주제에 맞는 용어를 유일하게 정할 수 없으면 등록 전에 중단한다. 카테고리를 자동 생성하거나 비슷한 다른 용어로 대체하지 않는다.
- 아래 대괄호 표기는 **소속 최상위를 보여주는 그룹 라벨**이지 선택지가 아니다. 아래 목록은 알려진 slug 참고표이며, 현재 여부와 ID의 기준은 매 등록 시점의 대상 taxonomy 조회 결과다.
- 주제가 두 하위 카테고리에 걸치면 **기사의 primary question이 실제로 답하는 쪽 하나**를 고른다. 둘 다 달지 않는다.
- 실제 taxonomy에서 찾지 못한 slug는 사용하지 않는다. 미해결 값은 MCP가 오류로 중단하며(경고로 넘기면 WordPress 기본 최상위 카테고리로 떨어진다). 새 카테고리가 필요하면 먼저 사용자 승인을 받는다.

[Business]
- Business & Strategy: business-strategy
- Startup: startup

[Economy & Investment]
- Economy: economy
- Investment: investment
- Real Estate: real-estate

[Marketing]
- Marketing Strategy: marketing-strategy
- Growth & Analytics: growth-analytics

[Growth & Productivity]
- Self Management: self-management
- Mindset: mindset
- Success & Psychology: success-psychology

[AI & Work]
- AI & LLM: ai-llm
- AI Creatives: ai-creatives

[AMU & Build in Public]
- Stories: amu-stories
- Services: amu-services

#### JSON 데이터의 구조

```json
{
    "author": "주제별 담당 아이디",
    "title": "독자에게 보이는 H1. Primary Archetype과 검색 의도에 맞게 독자의 실제 질문·가치를 약속한다. 특정 시제·종결어 고정 금지, 키프레이즈 포함 불필요",
    "seoTitle": "선택. 검색엔진 <title> 전용. 키프레이즈로 시작, 25~58자. 생략 시 title 앞에 키프레이즈를 붙여 자동 생성",
    "slug": "english-kebab-case-url",
    "excerpt": "핵심을 드러내는 짧은 한국어 요약",
    "heroLine": "제목이 약속한 것을 한 줄로 좁힌 편집 카피. seoTitle과 다르며 키프레이즈 제약이 없다",
    "coldOpen": {"problem": "독자가 지금 겪는 상태", "scene": "그 문제가 드러나는 구체적 순간", "tension": "합리적 기대와 실제가 어긋나는 지점"},
    "setCustomThumbnail": "slug와 동일",
    "coverArtDirection": {"grammar": "portrait|still_life|conceptual|documentary|graphic", "scene": "커버 한 장면 묘사", "tension": "이 커버가 품어야 할 기사의 긴장 한 줄", "textPolicy": "none|label"},
    "seoKeyword": "핵심 한국어 롱테일 키워드",
    "seoSlugKeyword": "선택. slug 매칭 검사 전용. 한글 키프레이즈가 영문 slug와 겹치지 않을 때, 같은 개념의 라틴 표기 중 slug에 실제로 있는 단어를 적는다. 없으면 생략",
    "seoDescription": "140~160자 한국어 SEO 설명",
    "content": "제목_snake_case_연결",
    "category": "하위 카테고리 slug 1개. 최상위 카테고리 slug 금지, 복수 지정 금지",
    "tag": "한국어 태그1, 태그2, 태그3",
    "longtailKeywords": "광고용 한국어 롱테일 키워드들",
    "contentRole": "reach|relationship|trust|expansion|conversion",
    "primaryArchetype": "make|experiment|mystery|decision|teardown|simulator|build",
    "supportingArchetype": "선택, 최대 1개",
    "experienceLevel": "story|enhanced|interactive",
    "primaryQuestion": "독자가 끝까지 따라갈 핵심 질문",
    "thesis": "결론에서 회수할 중심 명제 1문장. 저장 계약 magazine_knowledge_articles.thesis와 같은 필드다",
    "memorableInsight": "독자가 자기 말로 다시 꺼낼 발견 한 문장",
    "nextQuestion": "답을 얻은 뒤 실제로 이어서 궁금해질 질문",
    "questionDNA": {"who": "독자", "desire": "원하는 결과", "obstacle": "막는 문제", "question": "그래서 생기는 질문"},
    "qualityEvidence": {"curiosity": "본문 위치와 근거", "surprise": "본문 위치와 근거", "evidence": "출처·위치·한계", "participation": "판단 대상·틈·reveal", "payoff": "핵심 답·근거", "utility": "적용 기준", "memorability": "memorableInsight 위치", "continuation": "nextQuestion의 이유", "voice": "독자 표면 문장의 판정과 근거"},
    "interactionSlots": [{"slotId": "experience-01", "sectionId": "episode-01", "intent": "비교 목적", "staticFallback": "JS 없이 읽을 수 있는 대체", "candidateModule": "quiz|reveal|compare|checklist"}],
    "articleExperience": {"returnSectionId": "episode-02", "slots": [{"slotId": "experience-01", "sectionId": "episode-01", "interactionRole": "primary", "intent": "decision", "moduleType": "static", "staticFallback": "JS 없이 읽을 수 있는 대체"}]},
    "expansion": {"service": "선택, Primary 1개", "contextKey": "선택", "entrySectionId": "서비스 체험을 배치할 소제목", "returnSectionId": "돌아올 소제목"},
    "realityLens": {"world": "선택. Capital|Market|Attention|Player|Tooling|Build", "intensity": "light|standard|heavy", "anchorSectionId": "은유를 집약한 소제목"}
}
```

> **결합 결과를 기사 메타에 새 필드로 만들지 않는다 (2026-09-04 신설).** 본문 이미지 URL·ALT·배치, 내부 링크 slug는 본문 자체가 정본이며 메타에 다시 적지 않는다. 재활용 판정 근거는 `content_production_workflow.md` "WP → WP 같은 URL 리뉴얼 절차"의 교체 등록 단계에서 보고서와 `content-ledger.jsonl`에 남긴다 — 계약에 없는 `bodyImage`·`internalLinks` 같은 임시 필드를 만들면 본문과 이중 관리가 되고 소비자 없이 누적된다(2026-09-04 실측 후 제거). 커버 판정만 예외로 `coverArtDirection`에 남긴다.
>
> **매거진 기사는 `episodes[]`를 쓰지 않는다 (2026-09-04 폐기).** 순수 매거진 기사에는 구조화 `body[]`가 없고 본문이 마크다운 산문이라 `sectionId`가 대응할 앵커가 존재하지 않는다(실측: 리뉴얼 초안 5건 전부 `<h2>` 0개). `curiosityType`도 WordPress·`magazine_knowledge_articles` 어느 저장 계약에도 없다. `episodes[]`·`interactionSlots[]`·`articleExperience`는 **App 경험형 기사**(`{{AGENT_ROOT}}/refs/content-policy/app_post_draft.md`) 전용이며, 그쪽은 node-app `appContentValidate`가 `body[].sectionId ↔ episodes[].sectionId` 1:1을 실제로 강제한다. Episode 설계는 §11의 "Assumption → Evidence → Reveal"로 하고 결과는 본문과 `qualityEvidence`로 확인한다 — 근거: `.agent/docs/project/2026/09/20260904_220354__episodes-meta-deprecation-and-storage-readiness.md`
>
> `realityLens`는 **선택 필드**다. 생략해도 게이트에 걸리지 않으며, 쓸 경우 §11의 "AMU Reality Lens 적용" 규칙을 따른다.
>
> **`interactionSlots`·`articleExperience`는 매거진 표면의 필수 출력이 아니다.** R2에서 WordPress Content Experience를 제거하고 node-app으로 단일화했으므로, 동적 배포 선언은 App 경험형 기사(`{{AGENT_ROOT}}/refs/content-policy/app_post_draft.md`)가 소유한다. 매거진 기사는 정적 본문만으로 완결하며, 레거시 WP meta 보관이 명시적으로 요청된 경우에만 두 필드를 채운다.

#### 글 작성 전 체크리스트

**기본 점검**

- ✅ 포커스 키프레이즈 1개 선정 완료
- ✅ `category`가 하위 카테고리 slug **1개**인가 (최상위 slug 금지, 복수 지정 금지 — "카테고리 구조와 카테고리 slug")
- ✅ 타깃 독자 정의 (20-40대 직장인/사업자 등)
- ✅ 검색 의도 파악 (무엇을 해결/얻고 싶은가)
- ✅ 최신 데이터/사례 검색 완료
- ✅ Episode마다 하나의 `질문 → 근거 → 발견`이 소제목 단위로 완결되는가 (메타 필드가 아니라 본문으로 확인한다)
- ✅ `coldOpen`의 문제·장면·긴장 3요소와 `heroLine`을 작성했는가
- ✅ `memorableInsight`와 `nextQuestion`을 작성하고, 9축 `qualityEvidence`마다 실제 본문 위치·근거를 적었는가 (9축 전부 필수)
- ✅ Evidence가 설명보다 먼저 나오고, Tension은 실제 기대-현실 충돌이며, Experience는 `판단 대상 → 판단할 틈 → reveal`인가
- ✅ `Hook Strength ≤ Answer Strength`이며, 특정 reveal 문구 반복이나 모든 H2 질문형 패턴이 없는가
- ✅ 기사의 주어가 독자의 문제인가 (AMU 제거 테스트 통과 — `content_production_workflow.md`)
- ✅ `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md` 기준 최종 확인

**SEO 점검**

- ✅ H1(`title`)이 Primary Archetype에 맞는 독자 질문·가치를 약속하고 본문이 그 약속을 갚는가 (**특정 시제·질문형·키프레이즈 포함 강제 금지**)
- ✅ `seoTitle`이 키프레이즈로 시작하는가 (미지정 시 자동 생성 결과를 확인)
- ✅ 첫 단락에 키프레이즈 1회 이상
- ✅ H2/H3 중 1-2개에 키프레이즈 포함
- ✅ 본문에서 키프레이즈 2-5회 자연스럽게 사용
- ✅ 내부 링크 3개 이상
- ✅ 외부 링크 2개 이상
- ✅ 이미지 1개 이상 삽입
- ✅ 이미지 `alt`/캡션이 규칙 5의 3단계 검사를 통과했는가 — 금지어 0건(`화면`·`장면`·`모습`·`보인다` 등), 주어가 이미지 속 사물이 아님, 언급한 사물이 이미지에 실재함, 키프레이즈 포함
- ✅ 발행 본문에 `IMAGE_GUIDE` 주석·이미지 작업 메모·`ALT:` 행이 없고, ALT와 같은 이미지 설명 문장이 그림 바깥 본문 문단에 중복되지 않았는가
- ✅ `coverArtDirection`의 `grammar`·`scene`·`tension`을 채웠는가. `tension`이 한 줄로 적히는가
- ✅ 커버에 설명형 요소(Before/After·화살표·빨간 원·번호·제목 텍스트)가 없는가
- ✅ `primaryQuestion`이 소리 내어 읽었을 때 사람이 묻는 말처럼 들리는가

**가독성 점검**

- ✅ 20단어 이상 문장 25% 이하

---

## 27. 완성 원고에서의 사후 추출 (writer 범위 밖)

Intelligence 추출은 **원고가 완성되고 품질·SEO·claim 게이트를 통과한 뒤에** 별도 단계로 수행한다.

```text
원고 완성
→ 9축 · SEO · claim · 인코딩 QA 통과
→ (리뉴얼은 실질 개선 판정 추가)
→ 최종 원고 확정
→ Intelligence 사후 추출
→ 사람 검토
→ Registry 연결
```

- **추출 후보를 writer에게 미리 주지 않는다.** 기존 Pattern 목록을 미리 주면 그 순간 Pattern을 맞추기 위한 글이 된다.
- AI는 후보를 제안할 수 있지만 Registry의 생성·병합·승격·폐기는 사람이 결정한다 — `INTELLIGENCE-PATTERN-POLICY.md` §10.

### writer가 쓰는 것과 쓰지 않는 것 (2026-09-05 개정)

writer는 **자기 원고에서 나온 근거를 스스로 선언**한다. 여기까지가 writer 범위이며,
**적격성·Registry·검토 판정은 writer가 하지 않는다.** 판정 필드는 적재 후 normalize·추출·사람 검토 단계가 갱신한다.

```text
writer 작성        candidateItems · evidenceRefs · externalEvidenceLevel · claimStatus
                   applicability · revenueStages
normalize/추출     eligibility · extractionStatus
사람 검토          reviewStatus · reviewedAt · reviewedBy · reviewMemo
Registry 연결      primaryPatternRefs · secondaryPatternRefs · amuProofRefs
```

- writer는 판정 필드를 **초기값 그대로 둔다** — `eligibility: "none"`, `extractionStatus: "not_started"`,
  `reviewStatus: "unreviewed"`, `reviewedAt: null`, `reviewedBy: null`, `reviewMemo: ""`, 참조 배열 3개는 빈 배열.
  값을 비워 두는 것이 아니라 **이 값으로 채운다.** 저장 계약이 15필드를 모두 요구한다.
- writer가 `eligibility`를 `candidate`·`qualified`로 올리거나 Pattern·Proof를 연결하면 저장이 거부된다
  (`INTELLIGENCE-PATTERN-POLICY.md` §3·§10, 저장 계약의 교차 규칙).
- 이 경로는 `writer → normalize → intelligence update`다. **한 번에 확정하지 않는다.**

---

## 28. 출력 메타 — 지식 계층 추가분

§26-10의 JSON 구조에 `knowledge` 기사는 아래를 **추가**한다. **모두 내부 메타이며 본문에 출력하지 않는다.**

> **필드명의 정본은 저장 계약이다 (2026-09-05 개정).** 아래 필드는 node-app
> `magazine_knowledge_articles`(`magazine-knowledge-article.v1`)와 `magazine_knowledge_units`
> (`magazine-knowledge-unit.v1`)의 이름을 그대로 쓴다. 원고 메타에서 이름을 바꾸면 적재 시 매핑이 깨진다.
> 저장 계약이 바뀌면 이 절을 같은 작업 단위에서 함께 고친다.

```json
{
  "articleMode": "knowledge",
  "thesis": "§26-10에 이미 있다. 중심 명제 1문장",
  "intelligenceRole": "case|analysis|explainer|experiment|playbook|opinion|none",
  "evergreenPrinciple": "시점 표현 없이 성립하는 원리 한 문장. 없으면 null",
  "temporalClaims": [{"date": "YYYY | YYYY-MM | YYYY-MM-DD", "claim": "", "status": "current|historical", "sourceRef": "선택"}],
  "conditions": ["언제 유효한가"],
  "limitations": ["무엇을 보장하지 않는가"],
  "counterExamples": ["반대로 작동한 사례 또는 조건"],
  "entities": ["고유명사 — 기업·제품·인물·기법 이름"],
  "topics": ["주제 라벨 — 검색·클러스터 단위"],
  "intent": "이 글이 답하는 검색 의도 한 구절",
  "audience": "이 글이 상정한 독자 한 구절",
  "knowledgeUnits": [{"unitType": "principle", "statement": "", "articleSpan": "해당 소제목 문구", "mechanism": "", "conditions": [], "limitations": [], "evidenceRefs": []}],
  "intelligence": {
    "externalEvidenceLevel": "unsupported|single_source|multi_source|quantitative",
    "claimStatus": "measured|sourced|hypothesis|prohibited",
    "applicability": [],
    "revenueStages": []
  }
}
```

### 필드별 작성 주체

| 필드 | 주체 | 비고 |
| --- | --- | --- |
| `thesis` · `intelligenceRole` · `evergreenPrinciple` · `temporalClaims` · `conditions` · `limitations` · `counterExamples` | **writer** | 원고에서 직접 나온다 |
| `entities` · `topics` · `intent` · `audience` | **writer** | 검색·클러스터 진입점. 태그에서 자동 유도하지 않는다 |
| `knowledgeUnits[]` | **writer** | §19의 최소 충분 단위. 0개도 정상 |
| `intelligence` 4필드 (`externalEvidenceLevel` · `claimStatus` · `applicability` · `revenueStages`) | **writer** | 기사 전체의 근거 수준·claim 성격·적용 후보·Revenue Ladder 라벨 |
| `intelligence.candidateItems[]` · `intelligence.evidenceRefs[]` | **적재 어댑터가 파생** | `knowledgeUnits[]`에서 만든다. 원고 메타에 두 번 적지 않는다 |
| `eligibility` · `extractionStatus` · `reviewStatus` · `reviewedAt` · `reviewedBy` · `reviewMemo` · `primaryPatternRefs` · `secondaryPatternRefs` · `amuProofRefs` | **normalize · 사람 검토 · Registry** | **원고 메타에 쓰지 않는다** — §27 |

> **판정 필드를 원고 메타에 초기값으로도 넣지 않는다 (2026-09-05 정정).**
> 저장 계약은 `eligibility: "none"`일 때 Evidence·candidate·Pattern·Proof가 **모두 비어 있을 것**을 요구한다.
> writer가 근거를 채우면서 `eligibility: "none"`을 함께 보내면 그 자체가 계약 위반이라 저장이 거부된다.
> 판정은 적재 시점의 normalize가 근거 유무를 보고 내린다 — `근거 0건 → none` / `근거 1건 이상 → candidate`.
> `qualified`는 사람 검토로만 올라간다(`INTELLIGENCE-PATTERN-POLICY.md` §3.1·§8.1).

### `candidateItems`를 writer가 쓰지 않는 이유

`knowledgeUnits[]`와 `candidateItems[]`는 `statement`·`articleSpan`·`limitations`를 공유하고
`unitType`↔`intelligenceType`도 같은 값 집합이다. **같은 내용을 두 번 쓰는 구조**라서,
writer는 §19의 `knowledgeUnits[]` 하나만 쓰고 적재 어댑터가 아래처럼 파생한다.

```text
candidateItems[].intelligenceType  ←  knowledgeUnits[].unitType
candidateItems[].statement         ←  knowledgeUnits[].statement
candidateItems[].articleSpan       ←  knowledgeUnits[].articleSpan
candidateItems[].limitations       ←  knowledgeUnits[].limitations
candidateItems[].sourceRefs        ←  knowledgeUnits[].evidenceRefs[].sourceRef
intelligence.evidenceRefs[]        ←  knowledgeUnits[].evidenceRefs 합집합 (id 중복 제거)
```

### 작성 규칙

- 채울 내용이 없으면 **빈 배열 또는 `null`로 둔다.** 빈 값을 채우려고 내용을 만들지 않는다.
- `evergreenPrinciple`은 없으면 `null`이다. 생략이 아니라 명시적 `null`이며, 저장 계약이 필드 존재를 요구한다.
- `entities`는 최대 24개·항목당 400자, `topics`는 최대 16개·항목당 400자다. 중복 항목은 저장이 거부된다.
- `temporalClaims[].date`의 정밀도는 **자료가 정한다.** 연도만 아는 역사적 주장(전망이론 1979 등)에 월을 지어내지 않는다.
- `temporalClaims[].sourceRef`는 선택이고, 쓸 때는 `http(s)`·`urn:`·`doi:`·`amu:` 중 하나여야 한다. **scheme 없는 도메인 문자열이나 '○○ 공식 사이트' 같은 자연어를 넣지 않는다** — 저장이 거부된다. URL을 확보하지 못했으면 필드를 생략한다.
- `intent`·`audience`는 고정 enum이 아니다. 한 구절로 쓰되 같은 뜻을 매번 다르게 표현하지 않는다
  (추정 — 값 분포가 쌓이면 enum 신설 여부를 판정한다. MIR-202).
- `candidateItems`는 최대 6개, `evidenceRefs`는 최대 24개, `candidateItems[].sourceRefs`는 항목당 최대 8개다.
- `externalEvidenceLevel: "unsupported"`는 **근거가 하나도 없을 때만** 쓴다. 이 값이면 normalize가 `eligibility: "none"`으로 두고 파생 항목을 비운다. 근거가 있는데 `unsupported`를 쓰면 그 근거가 통째로 버려진다.
- 본문·메타 어디에도 **이메일·전화번호 등 식별 가능한 개인정보를 쓰지 않는다.** 저장 계약이 전 필드에서 차단한다.

---

## 29. 작성 전 · 작성 후 점검

§26-10의 `글 작성 전 체크리스트`(기본·SEO·가독성)를 먼저 수행하고, 지식 계층은 아래를 추가로 확인한다.

**작성 전**

- ✅ 이 글의 중심 질문 하나와 명제 하나가 정해졌는가
- ✅ §9 프레임에서 이 글에 필요한 칸이 무엇인지 정했는가. `적용 조건`·`한계 / 반례`를 채울 수 있는가
- ✅ 시점 주장과 원리를 분리할 수 있는 주제인가

**작성 후**

- ✅ 장식적 사례를 제거하고 Evidence만 남겼는가
- ✅ 시점 주장에 시점과 출처가 붙어 있는가. 지난 주장이 현재형으로 남아 있지 않은가
- ✅ 조건·한계·반례가 본문에 실제로 있는가. 성공 사례 나열로 끝나지 않았는가
- ✅ 실제 관찰 / 외부 주장 / AMU 해석 / 가설이 문장 수준에서 구분되는가
- ✅ 외부 사례를 AMU Proof로 표기하지 않았는가
- ✅ 내부 설계 언어(§21)가 독자 표면에 없는가
- ✅ Knowledge Unit 후보를 기록했는가 (0개도 정상). `evidenceRefs`가 8필드 객체 형태인가
- ✅ `entities`·`topics`·`intent`·`audience`를 채웠는가. 중복 항목이 없는가
- ✅ `intelligenceRole`을 골랐는가. 근거가 없으면 `none`이 정답이다
- ✅ `intelligence` 4필드(`externalEvidenceLevel`·`claimStatus`·`applicability`·`revenueStages`)만 채웠는가. 판정 필드·`candidateItems`를 원고 메타에 쓰지 않았는가
- ✅ 서비스 CTA가 맥락 없이 붙지 않았는가. Primary 1개를 넘지 않았는가

---

## 참조

- App 경험형 기사(node-app `/magazine/{slug}`) 초안: `{{AGENT_ROOT}}/refs/content-policy/app_post_draft.md`
- WP → WP 같은 URL 전면 재작성 교체 절차: `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` "WP → WP 같은 URL 리뉴얼 절차"
- 상위 실행 workflow·Brief·중복 방지: `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`
- AI 흔적 제거: `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md`
- 문법 가이드: `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md`
- SEO 게이트 알려진 한계: `{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md`
- Intelligence 적격성·Pattern 승격·점수 축: `.agent/amu-platform-guide/INTELLIGENCE-PATTERN-POLICY.md`
- Evidence Confidence·Proof Stage: `.agent/amu-platform-guide/PROOF-BANK.md`
- 9축·Content Role·Reality Lens·Cold Open·Cover 정본: `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`
- 전수 리뉴얼 실행 원장: `.agent/todo-amu-magazine-intelligence-renewal.json`

## 개정 이력

| 버전 | 날짜 | 내용 |
| --- | --- | --- |
| `magazine-knowledge-article-v1.0` | 2026-09-04 | 신설. MIR-001. 신규·리뉴얼 작성 기준 단일화를 고정하고, `new_post_draft.md`(현 `app_post_draft.md`)에서 제거한 리뉴얼 전용 품질 기준을 전 기사 공통으로 승격했다. |
| `magazine-knowledge-article-v2.2` | 2026-09-05 | **§28 `intelligence` 블록을 writer 4필드로 축소(MIR-007 정정).** 판정 9필드를 원고 메타에 초기값으로도 두지 않는다 — 저장 계약이 `eligibility: none`에 Evidence·candidate가 비어 있을 것을 요구해 writer 제출분이 그대로 거부되는 충돌이 있었다. `candidateItems`·`intelligence.evidenceRefs`는 `knowledgeUnits[]`에서 적재 어댑터가 파생하도록 바꿔 중복 작성을 없앴다. |
| `magazine-knowledge-article-v2.1` | 2026-09-05 | **저장 계약을 필드명 정본으로 고정(MIR-007).** `thematicSpine` → `thesis` 개명, Knowledge Unit의 `sourceRefs`(문자열 배열) → `evidenceRefs`(8필드 객체) 교체, `entities`·`topics`·`intent`·`audience`·`intelligenceRole`·`intelligence` 블록을 §28 출력 메타에 신설. §27에 writer 작성 범위(근거 6필드)와 판정 9필드의 경계를 명시했다. 근거: `magazine_knowledge_articles`·`magazine_knowledge_units`(MIR-200). |
| `magazine-knowledge-article-v2.0` | 2026-09-04 | **매거진 기사 작성의 완전 정본으로 승격.** `new_post_draft.md`(현 `app_post_draft.md`)의 매거진 규칙 전부를 이관받았다 — 규칙 1~6, Question-Driven 구조, Cold Open, 커버, 이미지·비교 실험, 9축 QA, H1·seoTitle, 필수 SEO·발행 게이트, 가독성, 문체·글 작성 규칙, 출처 표기, **JSON 데이터 생성 규칙**. 그 문서는 node-app 경험형 기사 초안 문서로 역할을 바꿨다. |
