---
name: image-template-post-draft
description: 이미지 프롬프트 템플릿 기반으로 소규모 비즈니스 특화 기사 초안을 작성하는 스킬
---

# image-template-post-draft

## 목적

- 이미지 생성 프롬프트 템플릿을 소스로 소규모 비즈니스 운영자를 위한 전문 기사 초안 작성
- 카메라 기종별 특징/효과/셋팅 정보를 포함하고, 프롬프트 예시를 비즈니스 시나리오에 맞춰 특화
- **{{AGENT_ROOT}}/skills/writing-humanizer** 스킬을 참고하여 자연스러운 한국어 기사로 작성

## 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/image_template_post_draft.md` (**필수**)
2. `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` (**필수**, 기본 초안 작성 규칙)
3. `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md` (**필수**, 자연스러운 한국어 편집)
4. `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` (**필수**, 초안 문법/형식 기준)
5. `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` (**필수**, MCP 호출 통합 가이드 — 호출 전 우선 참조)
6. `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md` (**필수**, 이미지 템플릿을 `upsert_image_prompt_template`로 등록할 때의 마크다운→페이로드 매핑)
7. `amu-magazine` MCP로 실제의 포스트를 검색 (내부 링크 선정)

## 입력

- 소스 유형: 이미지 프롬프트 템플릿 (image-template-creation 스킬 출력물 또는 기존 템플릿)
- 주제/타깃 독자/검색 의도 (가능하면 명시)
- 포커스 키프레이즈 (미지정 시 본문 의도에 맞춰 제안)

## 실행 절차

1. `{{AGENT_ROOT}}/refs/content-policy/image_template_post_draft.md` 규칙 확인
2. 입력된 프롬프트 템플릿의 구조/스타일 등의 세밀한 특성 분석
3. 기사 구조 구성:
   - 오프닝: 소규모 비즈니스 운영자의 고민에서 출발
   - 템플릿 소개: 핵심 특징과 스타일 설명
   - 프롬프트에서 찾아낸 세부 특성에 대한 해설: 기종별 이미지 특성, 효과, 추천 셋팅 등
   - 활용 예시: `비즈니스 시나리오별 프롬프트` 예시 또는 `비즈니스에 활용도가 높은 생성 프롬프트` 예시
   - 실전 팁: 커스터마이징 방법, 동적 요소 조절, 조건 블록 선택값 활용
   - 클로징: 핵심 요약 + CTA
4. SEO 요소 구성 (Focus Keyphrase/제목/Slug/Meta Description)
5. 내부 링크 2~3개 + 외부 신뢰 링크 2개 이상 반영
   - 내부 링크는 반드시 `amu-magazine` MCP로 실제의 포스트를 검색하여 작성 중인 글과 관련된 기사로 선정
   - 외부 링크는 반드시 **실제로 존재하는 페이지임을 검증** 한 후 링크 추가
6. 삽입 이미지 처리
   - **생성 이미지**: `![이미지에 추가할 alt 설명 내용](생성된 이미지의 assetId)` 형식
   - **일반 이미지**: `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` 기준
7. 번역체/명령조 제거, 한국어 네이티브 톤으로 최종 다듬기

## 출력 기본 형식

1. Focus Keyphrase / SEO 제목 / Slug / Meta Description
1-1. Content Experience Brief — `contentRole`, `primaryArchetype`, `experienceLevel`, `primaryQuestion`, `coldOpen`, `heroLine`, `coverArtDirection` (매거진 기사는 `episodes[]`·`interactionSlots[]`을 쓰지 않는다 — 2026-09-04)
   > 기사 유형상 축약이 필요하면 생략한 필드와 이유를 함께 적는다. 무단 생략은 하지 않는다.
   > 정의는 `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`, 작성 규칙은 `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`.
2. 본문 초안 (마크다운, H2/H3 포함)
   - 시나리오별 프롬프트 예시 필수 포함 (비즈니스 관련 시나리오 권장)
3. 내부 링크/외부 링크 제안
4. 삽입 이미지 처리
5. (필요 시) 출처 표기 + 영어 키워드 + JSON 메타데이터

## 필수 체크리스트

- 카메라 기종이 템플릿에 있는 경우 기종별 해설 섹션 포함 확인
- 프롬프트 예시가 소규모 비즈니스 시나리오로 특화되었는지 확인
- 템플릿에 `{#if field == "value"}...{/if}` 조건 블록이 있으면 선택값별 결과 차이를 독자 관점으로 설명했는지 확인
- 첫 단락에 포커스 키프레이즈 1회 이상 포함
- 본문 길이/키프레이즈 밀도/H2-H3 SEO 규칙 충족
- "당신" 과사용, 번역체 표현, 이중 피동 표현 점검
- 문단 길이/가독성/실행 가능한 액션 가이드 점검
- 링크, 메타데이터 누락 여부 최종 확인
- 이미지 ALT 텍스트에 포커스 키프레이즈 반영 여부
- 초안 전체 문법/형식이 `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` 기준에 부합하는지 확인
