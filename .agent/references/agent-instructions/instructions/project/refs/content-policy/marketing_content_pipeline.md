# Marketing Content Pipeline Rules

## 작업 순서

1. 입력 소스 분류: Git 작업 로그, 기존 기사, 아이디어 메모 중 소스를 명확히 구분
2. `{{AGENT_ROOT}}/refs/operational-service-guide.md`의 서비스별 특성에 따른 정확한 타겟 설정
   - 우선 타깃 순서: ① 1인 셀러·스마트스토어·소규모 브랜드 → ② 마케터·콘텐츠·SNS 운영자 → ③ 프리랜서·1인 사업자·크리에이터 → ④ AI 배우는 직장인/학생 → ⑤ 게임/세계관 팬
   - 소구 원칙: "AI 툴"이 아니라 "결과물"을 판다 (예: "AI 이미지 생성"이 아니라 "제품 분해 플랫레이 만들기")
3. `.agent/amu-platform-guide/MARKETING-STRATEGY.md`의 "R Routing" 절 기준으로 **R 등급(R0~R4)**과 목표 행동(관계 행동 또는 기사 맥락의 확장 경험) 1개를 확정
4. marketing-ops 작업이면 `prepare_local_generation.contentFitStrategies`로 유니버스별 마케팅/광고 전략과 버전을 확인하고, 로드 오류 시에만 `get_content_fit_strategies`를 1회 호출
5. 핵심 메시지(히어로 주제) 1개 선정 — 강한 문제 제기·감정적 확대·도발적 질문·극적 대비를 허용하되, 사실·수치·기능 상태는 `MARKETING-STRATEGY.md`의 "성장 제1원칙 — 강한 표현 허용 원칙"과 "Claim 검증" 절에 따라 보수적으로 검증
5.1. Question DNA 확인: `Who → Desire → Obstacle → Question` — 1~5가 불명확하면 작성 전 재검토 (`.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md`의 Question-Driven Content)
5.2. Content Experience Brief 확정: 현행 Content Role → Primary Archetype 1개 → `experienceLevel` → Episode → 정적 fallback을 가진 Interaction Slot → 선택적 Primary 서비스 1개. 기본은 E1 Story이며 E2/E3는 승격 게이트를 통과한 경우에만 적용
6. 채널 범위 확정 전 Pre-Fit과 Naver Blog 주제-목표 하드 게이트 수행
7. 통과 채널의 Magazine Hub는 `Question → Evidence → Tension → Discovery → Experience → Application → Next Question`으로 생성하고, Episode 단위로 채널별 재가공
8. CTA는 말미에 1회만 자연스럽게 삽입
8.1. 광고 소재로 재사용할 버전만 오퍼 1개·랜딩·필수 고지·UTM을 추가한다 (채점 기준은 `{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`의 adFit — 원장 원본은 `contentFitStrategies.advertising.criteria`). 정보성 원문에는 넣지 않는다
9. validation에 `channelFit`, `marketingFit`, `adFit`, 각 `strategyVersion`을 포함
10. 로컬 MCP의 `submit_local_generation` 후 생성 모델과 분리된 `google/gemini-3.5-flash-lite` 독립 오탈자 검수가 채널별 현재 초안 해시로 통과해야 발행 가능. API/과금/응답 오류와 수정 후 stale 상태는 로컬 MCP에서 fail-closed. Web UI의 `AI 검수 및 수정`은 선택 기능이며 발행 필수 게이트가 아님

## Discovery Packet 파이프라인 (2026-08-24 신설)

성과 가능성이 높은 소재는 기사 1건으로 끝내지 않는다.

```text
1 Idea
→ Main Article(Magazine Hub)
→ Short / Threads / Instagram (Discovery Asset)
→ Related Articles (Cluster)
```

- 채널은 Pre-Fit 통과분만 제작한다(모든 채널 의무 제작 금지).
- Discovery 단계에서 곧바로 제품 CTA로 보내지 않는다. 관계 행동(Save·Follow·Continue·Related)이 먼저다.
- 후보는 Question-first로 발굴하고 7문항 게이트를 거친다 — `.agent/amu-platform-guide/CONTENT-INTELLIGENCE.md` §13~§18.
- `hookType`·`questionType`을 메타로 기록해 Marketing Oops가 승자 포맷을 학습한다.

---

## 우선순위 규칙

- 기본값은 **재방문과 관계 행동(저장·팔로우·구독)에 직접 기여하는 R0 콘텐츠**를 최우선으로 한다. 기사 맥락에서 확장 경험이 성립하면 R1이다.
- 광고에서 전환이 검증된 검색 의도의 파생 기사는 R1로 취급한다 — 측정/전환 규약은 `{{AGENT_ROOT}}/refs/content-policy/measurement_and_conversion.md` 참조.
- 소셜 성과 스냅샷(`social_post`) 기준 반응률 상위 주제/훅/포맷/채널은 재가공·후속 바리에이션 우선순위를 높인다 — 스냅샷 수집/조회 규약은 `{{AGENT_ROOT}}/refs/content-policy/measurement_and_conversion.md`의 "소셜 성과 스냅샷 규약" 참조.
- `.agent/content/articles/queue/blog/links.json`(현재 미생성 — 파일이 있을 때만 적용)은 URL만 있으므로 제목/요약/sourceSnapshot 생성 후 R0~R4를 부여한다.
- `.agent/content/articles/queue/magazine/links.json`(현재 미생성 — 파일이 있을 때만 적용)은 제목 키워드로 1차 분류하고, 본문 확인 후 최종 등급을 확정한다.
- 투자/자기계발 글은 매거진 유입에는 유효하지만 Gen Studio 사용 장면이 없으면 P4로 둔다.
- 출시 예정 서비스는 기능 홍보보다 개발 스토리와 사용 시나리오로 다룬다.

## 채널 기준

- Naver Blog: 1,500~2,500자 중심, SEO 구조 반영
- LinkedIn: 150~300자, 인사이트 + 질문 구조
- Threads: 80~200자 포스트 2~5개
- Instagram/Reels: 3~5컷 또는 30~60초 스크립트

## 필수 품질 체크

- 반드시 친근한 존대어('습니다'체/'해요'체)를 기본으로 편안한 정보 제공자의 역할 유지(채널별 어미 기준은 `{{AGENT_ROOT}}/refs/content-policy/social_media_tone.md`의 "어미·존댓말 통일 규칙")
- 매거진 등 평어·반말톤 소스를 채널로 재가공할 때는 반드시 존대어로 변환(소스 어미 그대로 옮기지 않음)
- 한국어 자연문 유지, 번역체 최소화
- 강한 훅 자체를 낚시로 판정하지 않고, 제목-본문 일치·핵심 조건 공개·근거 확인으로 품질을 판정
- Focus Keyphrase/Slug/Meta Description 일관성 유지
- 내부 링크 1개 이상, 외부 신뢰 링크 1개 이상 권장
- 이미지 ALT 및 이미지 프롬프트(필요 시) 포함
- 일반 글을 E2/E3로 과잉 설계하지 않았고, Interaction Slot마다 정적 fallback과 Magazine 복귀 지점이 있는지 확인

## 금지

- 게임/커머스 전략을 동일 콘텐츠에서 무분별하게 혼합
- 근거 없는 통계/비용/정책 수치 작성
- 전체 문서 재출력(수정 라인 중심 최소 패치 원칙 위반)
