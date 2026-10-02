# Content Prompt Post Draft Rules (콘텐츠 프롬프트 전용 기사 생성)

## 목표

1. 콘텐츠 생성 프롬프트 템플릿을 소스로 하여, SEO가 잘 적용된 AI 프롬프트 활용법을 다루는 실용적인 기사 작성
2. 팀 구성 요청 시 비주얼 컨설턴트, 시나리오 플래너, 카피라이터, SEO 에디터, 휴머나이저로 구성된 5명의 팀메이트를 만들어 각 역할간 협업으로 최고의 결과물 생성

## 선행 규칙

- `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` (기본 초안 작성 규칙)
- `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md` (자연스러운 한국어 편집)

> 위 두 규칙을 기본으로 적용하되, 이 규칙의 추가 사항이 우선한다.

## 핵심 차별점 (기존 매거진 기사 작성 정본 대비)

1. 기사 작성 전 해당 기사의 `콘텐츠 프롬프트 템플릿을 우선 등록`할 것
   - 등록은 `genstudio` MCP의 `upsert_content_prompt_template` 도구로 수행 (1차 호출은 `strictNew=true`)
   - 마크다운 → 페이로드 매핑(특히 `output_format` → `outputFormat` snake→camel 정규화 등)은 `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md`, MCP 도구 사용 일반 규칙은 `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` 우선 참조
2. **프롬프트 구조 해설 필수**: 템플릿의 역할 정의/변수 설계/품질 기준이 왜 효과적인지 원리를 설명
3. **프롬프트 예시**: 모든 프롬프트 활용 예시는 "일반 지시 vs 템플릿 활용" 대비 구조로 작성하고, 반드시 `코드 블록` 문법 적용
   - 프롬프트 예시 작성 시 반드시 해당 프롬프트 예시로 생성한 콘텐츠도 함께 추가할 것
4. **타깃 독자**: 콘텐츠 크리에이터, 마케터, 1인 사업자, AI 활용에 관심 있는 직장인
5. **내부 링크**: `amu-magazine` MCP로 실제의 포스트를 검색하여 관련 기사 1~2개 추천
   - 콘텐츠 또는 이미지 프롬프트 관련 링크인 경우 반드시 **https://app.allmyuniverse.com/gen-studio?mode=content&view=detail&templateKey={templateKey}**의 형식으로 적용
6. **Slug 구조**: 기사의 슬러그는 반드시 `content-prompt-guide-{templateKey}` 구조로 생성
7. **메타 정보**: 메타 정보에 `templateKey`를 추가하여 해당 기사에 사용된 템플릿키 명시
8. **카테고리**: 카테고리는 하위 카테고리 `ai-creatives` **1개만** 설정한다. 상위 카테고리(`ai-work`)를 함께 넣지 않는다 — `magazine_knowledge_article.md` "카테고리 구조와 카테고리 slug"
   > 2026-09-12 정정: 종전에 적혀 있던 `amu-creatives`는 local·production 어느 WordPress에도 없는 slug다(실측). 실제 slug는 `ai-creatives`(부모 `AI & Work`)다.
9. **Content Experience Brief**: Primary Archetype은 소재에 따라 `experiment`·`teardown`·`make` 중 1개를 고르고, E1 Story의 정적 비교만으로도 최초 질문에 답하도록 설계. 실제 콘텐츠 생성 연동은 승격·서비스 노출 게이트 통과 후에만 적용

## 기사 구조

1. **Question Hero**: 같은 주제의 평범한 지시와 구조화된 지시 결과를 먼저 보여주고 무엇이 달라졌는지 묻기
2. **Evidence / Teardown**: 결과의 톤·구조·구체성·사실성 차이를 독자가 먼저 관찰하게 하기
3. **Discovery**: 역할·변수·조건·품질 기준이 결과를 바꾸는 원리를 설명
4. **Static Experience**: 선택값 하나를 바꾼 A/B 결과를 비교·예측하게 하고 답을 공개
5. **Make / Experiment**: 하나의 비즈니스 시나리오를 선택해 지시 → 결과 → 검수 → 수정 과정을 완결
6. **Application**: 독자가 자기 주제·채널·목표에 맞춰 어떤 변수를 먼저 바꿀지 판단 기준 제시
7. **한계와 검수**: 프롬프트 복사만으로 품질이 보장되지 않으며 사실 확인·브랜드 검수·채널 적합화가 필요함을 명시
8. **Next Question**: 관련 기사·저장·후속 생성 중 Primary CTA 1개와 보조 행동 최대 1개. 다른 서비스를 같은 기사에서 동시에 유도하지 않음

## 조건 블록 해설 기준

- 템플릿에 `{#if field == "value"}...{/if}` 블록이 포함된 경우, 기사에서는 조건문 자체보다 선택값에 따라 역할·구조·톤·품질기준이 어떻게 달라지는지 설명.
- 콘텐츠 템플릿에서는 채널, 독자 수준, 글 형식, CTA 강도, 출력 포맷, 금지 표현처럼 결과물의 구조와 문체를 바꾸는 선택값을 중심으로 해설.
- Before/After 예시에는 같은 주제라도 조건 선택값에 따라 결과가 어떻게 달라지는지 최소 1회 이상 보여주는 것을 권장.

## 활용 예시 작성 기준

| 콘텐츠 시나리오 | 예시 방향                      |
| --------------- | ------------------------------ |
| 블로그 글 작성  | 주제 선정 → 구조화 → 초안 생성 |
| SNS 콘텐츠      | 플랫폼별 톤 조절, 훅 문장 생성 |
| 마케팅 카피     | 제품 설명, 광고 문구, CTA 작성 |
| 아이디어 발상   | 사고 공식 활용, 브레인스토밍   |
| 이메일/제안서   | 비즈니스 문서 구조화           |
| 고객 응대       | FAQ, 리뷰 응답, CS 템플릿      |

## SEO 특화 사항

- 포커스 키프레이즈: AI 프롬프트/ChatGPT 활용법/프롬프트 엔지니어링/콘텐츠 자동화 관련 롱테일 키워드
- Before/After 예시 섹션에 구체적 활용 키워드 삽입

## 금지 사항

- 프롬프트를 단순 나열만 하고 원리/효과를 설명하지 않는 것
- 프롬프트 복사만으로 충분하다는 식의 과장 (커스터마이징의 중요성 강조)
- gen-studio 서비스를 과도하게 홍보하는 문구 (자연스러운 언급만 허용)
- 일반 지시·템플릿·생성 결과만 나열하고 독자가 직접 비교·판단하는 장면을 두지 않는 것
- 프롬프트 구조를 설명하기 전에 복사·서비스 CTA부터 제시하는 것
- 조건 블록 문법 자체를 과도하게 설명해 독자가 프롬프트 활용보다 개발 문법에 집중하게 만드는 것
- 기존 `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` 금지 사항 모두 동일 적용
