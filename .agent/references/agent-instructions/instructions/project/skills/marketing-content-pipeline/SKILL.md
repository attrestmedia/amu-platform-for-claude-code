---
name: marketing-content-pipeline
description: AMU 마케팅 콘텐츠를 블로그 중심으로 설계하고 채널별로 재가공하는 통합 워크플로우
---

# marketing-content-pipeline

## 목적

- 아이디어/작업 로그/기존 글을 기반으로 마케팅 콘텐츠를 빠르게 생산
- 블로그-소셜 채널 간 메시지 일관성 유지

## 참조 문서

- `{{AGENT_ROOT}}/refs/content-policy/marketing_content_pipeline.md` (필수)
- `{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md` (채널/마케팅/광고 적합도 필수)

## 입력

- 소스 유형: Git 작업 로그 또는 기존 아티클 목록 또는 아이디어 메모
- 타깃 독자, 톤, 목표(브랜딩/유입/전환)
- 채널 마커: `@all` 또는 개별 채널

## 실행 절차

1. 소스 요약 후 핵심 메시지 1문장 확정
2. marketing-ops 사용 시 `prepare_local_generation.contentFitStrategies`로 등록 전략과 버전을 확인하고, 로드 오류 시에만 `get_content_fit_strategies`를 1회 호출
3. Naver Blog 주제-목표 하드 게이트 및 채널별 Pre-Fit 수행
4. 통과한 채널의 히어로 콘텐츠/채널별 초안 작성
5. CTA를 말미에 최소 강도로 삽입
6. `channelFit`, `marketingFit`, `adFit`을 별도 산출하고 SEO/가독성/링크/메타 필드 점검

## 출력 기본 형식

1. 오늘의 핵심 주제 요약
2. 채널 운영 플랜
3. 채널별 초안
4. (멀티 기사 입력 시) 히어로/서브 기사 재활용 전략
