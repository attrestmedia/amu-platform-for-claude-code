---
name: content-prompt-post-draft
description: 콘텐츠 프롬프트 템플릿 기반으로 AI 프롬프트 활용법 기사 초안을 작성하는 스킬
---

# content-prompt-post-draft

## 목적

- 콘텐츠 생성 프롬프트 템플릿을 소스로 AI 프롬프트 활용법을 다루는 실용적인 기사 초안 작성
- Before/After 대비 구조로 프롬프트의 실제 효과를 보여주고, 독자가 바로 적용할 수 있는 가이드 제공
- **{{AGENT_ROOT}}/skills/writing-humanizer** 스킬을 참고하여 자연스러운 한국어 기사로 작성

## 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/content_prompt_post_draft.md` (**필수**)
2. `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` (**필수**, 기본 초안 작성 규칙)
3. `{{AGENT_ROOT}}/refs/content-policy/writing_humanizer.md` (**필수**, 자연스러운 한국어 편집)
4. `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` (**필수**, 초안 문법/형식 기준)
5. `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` (**필수**, MCP 호출 통합 가이드 — 호출 전 우선 참조)
6. `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md` (**필수**, 콘텐츠 템플릿을 `upsert_content_prompt_template`로 등록할 때의 마크다운→페이로드 매핑)
7. `amu-magazine` MCP로 실제의 포스트를 검색 (내부 링크 선정)

## 입력

- 소스 유형: 콘텐츠 프롬프트 템플릿 (content-prompt-template-creation 스킬 출력물 또는 기존 템플릿)
- 주제/타깃 독자/검색 의도 (가능하면 명시)
- 포커스 키프레이즈 (미지정 시 본문 의도에 맞춰 제안)

## 실행 절차

1. `{{AGENT_ROOT}}/refs/content-policy/content_prompt_post_draft.md` 규칙 확인
2. 입력된 프롬프트 템플릿의 구조/역할/변수 등의 세밀한 특성 분석
3. 기사 구조 구성:
   - 오프닝: AI 프롬프트의 일반적 문제점에서 출발 (예: "그냥 써줘"의 한계)
   - 템플릿 소개: 핵심 구조와 해결하는 문제 설명
   - 변수 시스템 해설: `{변수::옵션}` 동적 요소와 `{#if field == "value"}...{/if}` 조건 블록의 유용성과 커스터마이징 방법
   - 활용 예시: 비즈니스/콘텐츠 시나리오별 Before/After 예시
   - 실전 팁: 프롬프트 최적화, 변수 조합 전략
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
   - 프롬프트 구조 해설 섹션 필수 포함
   - Before/After 활용 예시 필수 포함 (비즈니스 관련 시나리오 권장)
3. 내부 링크/외부 링크 제안
4. 삽입 이미지 처리
5. (필요 시) 출처 표기 + 영어 키워드 + JSON 메타데이터

## 필수 체크리스트

- 프롬프트 구조 해설(역할/변수/조건 블록/품질기준)이 원리 수준으로 설명되었는지 확인
- Before/After 예시가 실제 비즈니스/콘텐츠 시나리오로 특화되었는지 확인
- 템플릿에 `{#if field == "value"}...{/if}` 조건 블록이 있으면 선택값별 결과 차이를 독자 관점으로 설명했는지 확인
- 첫 단락에 포커스 키프레이즈 1회 이상 포함
- 본문 길이/키프레이즈 밀도/H2-H3 SEO 규칙 충족
- "당신" 과사용, 번역체 표현, 이중 피동 표현 점검
- 문단 길이/가독성/실행 가능한 액션 가이드 점검
- 링크, 메타데이터 누락 여부 최종 확인
- 이미지 ALT 텍스트에 포커스 키프레이즈 반영 여부
- gen-studio 홍보가 과도하지 않은지 확인 (자연스러운 언급만)
- 초안 전체 문법/형식이 `{{AGENT_ROOT}}/refs/web-content-grammar-guide.md` 기준에 부합하는지 확인
