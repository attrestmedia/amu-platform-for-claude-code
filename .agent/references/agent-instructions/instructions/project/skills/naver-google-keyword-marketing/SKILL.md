---
name: naver-google-keyword-marketing
description: Naver와 Google 키워드 마케팅 전략을 롱테일 중심으로 설계하고 조건부 키워드 유형을 통제하는 실행 스킬
---

# naver-google-keyword-marketing

## 목적

- Naver/Google 키워드 전략을 최소 예산-최대 효율 관점으로 설계
- 롱테일 키워드를 기본값으로 사용하고, 불필요한 키워드 확장을 방지

## 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/naver_google_keyword_marketing.md` (필수)
2. `{{AGENT_ROOT}}/refs/content-policy/marketing_content_pipeline.md` (콘텐츠 파이프라인 연계 시)
3. `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md` (기사형 랜딩 초안 필요 시)

## 입력

- 상품/서비스/콘텐츠 주제
- 목표 KPI(리드, 판매, 유입, 조회수 등)
- 예산/기간/채널 우선순위
- 현재 보유 자산(랜딩 페이지, 기존 포스트, 광고 계정, 트래킹 상태)

## 실행 절차

1. 목표와 제약을 확정하고 롱테일 중심 전략으로 기본안을 구성
2. Naver/Google 키워드 맥락을 분리해 키워드 클러스터를 설계
3. 각 키워드를 의도/전환/경쟁/비용 기준으로 우선순위화
4. 기본 출력은 롱테일 키워드만 제시
5. 브랜드/상업적/정보성 키워드는 `필요 조건 충족 시`에만 추가
6. 조건부 키워드 추가 시, 반드시 제시 사유와 예산 영향까지 함께 명시
7. 실행안과 측정안(CTR/CPC/CVR/CPA/순위/유입)을 채널별로 분리 제시

## 출력 기본 형식

1. 전략 요약 (목표, 예산, 채널 우선순위)
2. 롱테일 키워드 우선순위 표
3. Naver 실행안
4. Google 실행안
5. 측정/실험 계획 (2~4주 단위)
6. 조건부 키워드 섹션
   - `미제시` 또는 `제시 + 사유 + 예산 영향`

## 필수 체크리스트

- 롱테일 중심 전략이 본문 전반에서 유지되는가
- 키워드 유형(브랜드/상업적/정보성) 남용이 없는가
- 조건부 키워드 제시 시 근거가 수치/상황과 연결되는가
- Naver/Google 전략이 채널 특성에 맞게 분리되었는가
- 실행 후 개선 가능한 측정 루프가 포함되어 있는가
