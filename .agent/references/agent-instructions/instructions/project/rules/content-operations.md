# 콘텐츠 작업 진입 규칙

## 적용 범위

- 콘텐츠 생성, 매거진/블로그/소셜 작성·재가공, 이미지·콘텐츠 프롬프트 템플릿, 콘텐츠 발행·성과 회고 작업에만 적용한다.
- 일반 개발·인프라 작업에는 콘텐츠 세부 정책을 로드하지 않는다.

## 정책 정본 (SSOT)

**정책 내용은 `.agent/amu-platform-guide/`에만 존재한다. 이 룰은 포인터이며 정책을 복제하지 않는다.**
이 룰과 `amu-platform-guide/`가 어긋나면 `amu-platform-guide/`가 우선한다.

| 판단 대상 | 정본 |
| --- | --- |
| 사업 정의·서비스 우선순위·착수 게이트 | `.agent/amu-platform-guide/BUSINESS-CHARTER.md` |
| 마케팅 목적·R 라우팅·캠페인·claim·권한 등급 | `.agent/amu-platform-guide/MARKETING-STRATEGY.md` |
| 회원·AMU ID·가입 정책 | `.agent/amu-platform-guide/AUDIENCE-AND-MEMBERSHIP.md` |
| KPI·이벤트·UTM·성과 판정 | `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` |
| 서비스 역할·동결 판정 | `.agent/amu-platform-guide/SERVICE-ROLE-MAP.md` |
| 채널 바이오·SEO 문구 | `.agent/amu-platform-guide/BRAND-MESSAGING.md` |
| **채널별 일/주 발행 cap** | **Marketing Oops `uploadPolicy` — MCP 조회 (아래 절차 6번)** |

## 중앙 경로

- 작업 원장: `.agent/todo-ledgers/tasks/todo-content.json`
- 콘텐츠 자산: `.agent/content/articles/`, `.agent/content/ai-prompts/`
- 중복 방지 원장: `.agent/content/content-ledger.jsonl` (append-only)
- 성과 교훈 원장: `.agent/content/content-insights.md`
- 고객 반론·구매 장애물 원장: `.agent/content/customer-objections.md` (append-only)
- 룰 정본: `.agent/agent-instructions/instructions/project/`

## 작업 시 필수 절차

0. **사업 헌장과 마케팅 원장을 먼저 확인한다** — `BUSINESS-CHARTER.md`의 사업 정의·기여도 게이트, `MARKETING-STRATEGY.md`의 마케팅의 목적·Discovery Layer·Question-Driven Content·성장 제1원칙·실행 레인·성장 우선순위·서비스별 마케팅 취급·R Routing·CTA·Magnetism·Campaign·Claim 검증·자동화 권한·채널 역할·실행 프로세스·금지·실행 계층 동기화 체크리스트. 실행 순서는 `MARKETING-STRATEGY.md`의 "실행 프로세스" 절을 따르며 **레인(S/T/H)에 따라 절차가 갈린다**.
   > **절 번호(§N)를 그대로 인용하지 않는다.** 이 문서는 개정마다 절이 추가·재배치돼 번호가 자주 밀린다(2026-08-26 §1.2/§5/§7/§8/§9/§10/§14 참조가 전부 실제 위치와 어긋난 채 방치된 걸 발견). 절 제목으로 찾고, 정확한 위치가 필요하면 그 문서의 목차를 직접 확인한다.
1. 요청과 관련된 TASK가 있으면 `.agent/todo-ledgers/tasks/todo-content.json`에서 해당 TASK만 확인한다.
2. 콘텐츠 생성·재가공 전 `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`와 작업 유형에 맞는 `{{AGENT_ROOT}}/refs/content-policy/` 문서만 읽는다.
3. 실행 절차가 정의된 작업은 대응하는 `{{AGENT_ROOT}}/skills/`의 스킬을 온디맨드로 읽는다.
4. 소스·사실 근거 없이 콘텐츠나 성과를 창작하지 않으며, 생성·발행 전 ledger에서 중복을 확인한다.
5. ledger의 기존 행은 수정·삭제하지 않고 새 행만 추가한다. insights도 근거·기준일과 함께 누적한다.
6. **소셜 콘텐츠 생성 사이클마다 발행 cap을 MCP로 조회한다** (아래 "발행 cap 조회 의무").
7. 기사·큐·프롬프트 산출물은 위 중앙 경로 밖에 새로 만들지 않는다.
8. 산출물·적용 이력은 `.agent/logs/`와 `content-ledger.jsonl`이 담당한다.
9. 콘텐츠 메타·ledger 항목에 소속 `campaignId`(없으면 `none` + 사유), **R 등급 판정 근거**, **조회한 `uploadPolicy.version`**을 기록한다.
10. 댓글·문의에서 구매 장애물을 발견하면 `.agent/content/customer-objections.md`에 고객 표현 원문 그대로 append하고, 최소 1개의 후속 작업으로 변환한다.
11. 한글 본문·제목·태그·키워드는 리터럴 UTF-8로만 전달하고, 손으로 쓴 `\uXXXX`·HTML 엔티티로 표현하지 않는다. 원고를 도구 인자로 옮겨 적지 말고 파일·스크립트로 직렬화하며, 저장·발행 후 재조회해 원문과 대조한다 — 상세: `{{AGENT_ROOT}}/rules/text-encoding-integrity.md`

## 발행 cap 조회 의무 (2026-08-06 신설)

**채널별 일/주 발행 cap 수치는 이 룰에도, 하위 정책 문서에도 적지 않는다.**
문서에 적힌 수치와 Marketing Oops 설정이 어긋나는 사고가 반복됐다(2026-08-06 실측에서 threads cap 불일치 확인).

```text
SSOT   Marketing Oops  settings.marketingCriteria.uploadPolicy
조회   list_keyword_profiles(universeId)
       → data.settings.marketingCriteria.uploadPolicy
         { version, timezone, channels: { <channel>: {
             weekdayDailyCap, weekendDailyCap, weeklyCap,
             minGapHours, preferredHours } } }
변경   update_upload_policy(expectedVersion, channels)
```

- **매 사이클 조회한다.** 이전 세션의 값이나 문서의 값을 기억해서 쓰지 않는다.
- 조회한 `version`을 보고와 ledger에 함께 적는다.
- **조회 실패 시 cap 판정을 추정으로 대체하지 않고 생성을 중단하고 `blocked`로 보고한다**(fail-closed).
- cap 변경은 `update_upload_policy`로만 한다. 문서를 고쳐 cap을 바꾸려 시도하지 않는다.
- 라우팅·D+5 창·대기 큐 게이트·드롭 절차는 `{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`를 따른다(그 문서도 cap 수치를 담지 않는다).

## 금지 (2026-08-06 개정)

- **모든 기사에 같은 서비스 CTA를 붙이지 않는다.** 확장 CTA는 기사 맥락을 반드시 동반한다.
- **콘텐츠 발행량을 성과로 보고하지 않는다.** 재방문·관계 행동이 판정 기준이다.
- **페이월·멤버십·프리미엄 콘텐츠·회원 전용 기사를 전제한 표현을 쓰지 않는다.** AMU에 존재하지 않는다.
- 회원 가치 기능(저장·팔로우·이어 읽기·뉴스레터)은 **배포 확인 전까지 소구하지 않는다.**

세부 품질·채널·SEO·발행 절차 기준은 이 룰에 중복하지 않고 `{{AGENT_ROOT}}/refs/content-policy/`의 해당 문서를 단일 기준으로 따르며, 전략·목표·CTA·캠페인·권한·KPI 판단은 `.agent/amu-platform-guide/`의 정책 정본을 따른다.
