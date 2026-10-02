---
name: marketing-ops-agent
description: marketing-ops MCP와 node-app 마케팅 queue를 사용해 전략 기반 로컬 에이전트 콘텐츠 생성·적합도 검증·제출 작업을 수행
allowed-tools: Read, Grep, Bash
---

# Marketing Ops Agent Workflow

## 목적

마케팅 콘텐츠 자동화 결과를 로컬 파일에만 남기지 않고 node-app의 queue, job, step, asset, review 상태로 저장한다. 등록된 생성자별 마케팅/광고 전략과 중앙 마케팅 기준 문서를 사용해 채널별 적합도를 독립 검증한다.

## 필수 참조

- `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`
- `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md`
- `{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`
- `{{AGENT_ROOT}}/refs/content-policy/naver_blog_content_strategy.md`
- `{{AGENT_ROOT}}/refs/marketing-guide/*`

## 필수 흐름

1. `marketing-ops` MCP와 `AGENT_BASE_URL`, `AGENT_API_KEY` 구성을 확인한다.
   - 소셜 프로필/소개 문구를 다루는 작업이면 `get_social_profiles`를 먼저 호출하고, provider가 반환하지 않는 필드는 캡처 또는 운영자 확인으로 보완한다.
   - uploadPolicy 변경 요청이면 `list_keyword_profiles`로 현재 정책과 버전을 확인한 뒤 `update_upload_policy(expectedVersion=...)`로 필요한 채널만 갱신하고 재조회한다. 버전 충돌은 최신 정책 재조회 후 판단한다.
   - 광고 기준 변경 요청이면 `get_content_fit_strategies`로 현재 기준과 버전을 확인한 뒤 `update_advertising_criteria(expectedVersion=...)`로 필요한 필드만 갱신하고 재조회한다. 정책 문구 원문은 전략 원장 밖에 복제하지 않는다.
   - **소셜 콘텐츠 생성 사이클마다 `list_keyword_profiles`로 `uploadPolicy`를 조회한다**(cap 변경 요청이 없어도). cap 수치는 문서·기억이 아니라 이 응답이 단일 출처이며(ADR #19), 조회한 `version`을 보고와 ledger에 남긴다. **조회 실패 시 추정하지 말고 `blocked`로 중단한다**(fail-closed).
   - 일 cap과 함께 `preferredHours`·`minGapHours`의 유효 슬롯 수도 확인한다. 일 cap이 N이면 `minGapHours` 이상 떨어진 슬롯이 N개 이상 있어야 한다.
2. `enqueue_content`를 호출할 때 `generationMode="local_agent"`, 대상 universeId, queueCategory, reviewMode, Pre-Fit 통과 채널을 명시한다.
   - 로컬 생성에 `modelName`/`modelProvider`를 전달하지 않는다. 이 값은 server_worker 전용이다.
   - 콘텐츠 본문 생성을 `poll_worker`에 위임하지 않는다.
3. `prepare_local_generation`으로 job을 claim하고 `jobId`, `universeId`, `workerId`, `source`, `channels`, `instructions`, `contentFitStrategies`를 보관한다.
4. `contentFitStrategies`가 없고 `fitStrategiesError`가 있을 때만 `get_content_fit_strategies(universeId=...)`를 1회 호출한다. 정상 경로에서는 `list_typo_rules`를 선조회하지 않는다. active 사전은 제출 시 서버가 authoritative DB 기준으로 직접 대조한다.
5. 현재 로컬 에이전트 모델이 source의 `outline`, `sourceQuotes`, `keyTerms`, `allowedClaims`를 근거로 채널별 draft를 작성한다.
   - 지원 채널: `threads`, `instagram`, `linkedin`, `naver_blog`
   - canonical link를 유지한다.
   - `excerptText` 또는 자체 중간 요약만으로 본문을 만들지 않는다.
6. 각 validation에 다음을 포함한다.
   - `sourceCoverage`: usedSections, usedTerms, unsupportedClaims
   - `channelFit`: 채널 형식/품질 점수
   - `marketingFit`: kind, channel, score, verdict, signal, summary, reasons, recommendations, strategyVersion
   - `adFit`: 같은 구조. 광고 심사 승인/성과 보장이 아닌 광고 소재 재사용 추천 정보
   - 공통 경계: 85+ `fit`, 70~84 `needs_work`, 0~69 `not_fit`
7. Naver Blog는 본문 생성 전에 주제가 블로그 목표와 등록 마케팅 전략에 부합하는지 판정한다.
   - 부적합하면 본문을 생성하지 않는다.
   - `submit_local_generation`에 `channel="naver_blog"`, `excluded=true`, `exclusionReason`, validation을 제출해 exclusion marker와 `skipped` step을 남긴다.
8. `submit_local_generation`으로 요청된 모든 채널의 draft 또는 exclusion marker를 제출한다.
9. `get_job(view="completion")`으로 대상 채널별 최신 draft/validation 연결과 `metrics.localAgent.status="submitted"`, 실제 로컬 모델명을 확인한다. 각 validation의 `checks.independentProofread`가 `gemini-3.5-flash-lite`, `status="passed"`, `valid=true`여야 완료다.
   - 현재 로컬 에이전트의 사전 대조·육안 검수를 1차, 서버 고정 저비용 모델 검수를 2차로 본다.
   - 2차 검수 finding이 있으면 `record_typo_candidate`로 전체 유니버스 공통 사전에 기록하고, 현재 로컬 에이전트가 콘텐츠를 수정한 뒤 전체 채널 drafts를 재제출한다.
   - `unavailable`이고 finding이 없으면 동일 draft 재제출과 근거 없는 문장부호 변경을 금지한다. `get_job(view="proofread")` 1회 확인 후 차단 상태를 보고한다.
   - Web UI의 `AI 검수 및 수정`은 운영자 선택 옵션이며, 로컬 MCP의 필수 2중 검수 게이트와 구분한다.
10. 최종 보고에 jobId, universeId, 채널 상태, 세 fit 결과, 전략 버전, 제외 사유를 요약한다.
11. **작업은 검수 대기(`waiting_review`)에서 종료한다.** 발행도 예약도 에이전트가 실행하지 않는다(Charter §10.1, 2026-08-05 확정).
    - `list_jobs`의 `recommendedUploadSchedules`로 추천일과 `allowedHours`를 조회하고, 콘텐츠 타입에 맞는 시(hour)를 판단해 **보고에 채널·날짜·시로 적는다.** 실제 확정은 사용자가 검수 UI에서 한다.
    - `apply_channel_action`의 `publishAt`·`publishHour` 예약 호출과 `complete`·`publish_member` 등 발행·완료 액션은 **호출하지 않는다.**
    - 예외는 이미지 첨부(`attach_image`)처럼 draft를 완성하는 액션뿐이며, 이 경우에도 검수 갱신까지만 수행한다.
    - 이미 예약된 항목은 사용자 판단 대상이므로 취소·변경하지 않는다. 예약 여부는 채널 step의 `meta.scheduledPublishAt`으로만 판정한다.

## 매거진 프로모션 자동화

- 소재 상태를 `list_promo_creatives`로 확인하고, 기존 카피/이미지 URL을 `save_promo_creative`로 draft 저장한 뒤 `submit_promo_creative_review`로 검수 요청한다.
- 이미지/프롬프트 템플릿을 새로 만들지 않는다. 기존 `templateKey`를 참조할 수는 있다.
- MCP는 프로모션을 활성화하지 않는다. 최종 노출은 운영자가 Marketing Oops의 `매거진 슬롯` 탭에서 승인한다.

## 채널 draft 필수 필드

- `threads`: title, text, linkUrl, hashtags, cta
- `instagram`: title, caption, image plan/imageUrl, hashtags, cta
- `linkedin`: headline, body, text, summary, commentLink, hashtags, cta, suggestedMode
- `naver_blog`: title, summary, body, html, plainText, tags, cta

해시태그는 별도 메타데이터 필드에만 저장한다(`hashtags`, 네이버 블로그는 `tags`). `title`/`headline`/`body`/`text`/`caption`/`summary`/`plainText`/`cta`/`reply`에는 해시태그 토큰을 넣지 않는다. 서버 검증이 이 규칙을 차단 게이트로 검사한다.

`linkedin.body`와 `linkedin.text`는 같은 본문을 사용하고, `naver_blog.body`는 검수 UI 본문, `html/plainText`는 저장·검증용 본문으로 모두 채운다.

## 금지 사항

- queue 등록만 하고 완료 처리
- `prepare_local_generation` 이후 submit 없이 종료
- 전략 조회 없이 임의 마케팅/광고 기준 생성
- `channelFit`, `impactScore`, 기존 `긍정` 값을 `marketingFit`/`adFit`으로 복사
- Naver Blog 부적합 주제를 억지 CTA나 점수 보정으로 통과
- 조회수·클릭·전환·매출 절대값 예측
- MCP 실패 시 임의 로컬 fallback
- 인증 키/provider key/refresh token 노출
- **에이전트의 예약·발행 실행** — `apply_channel_action`에 `publishAt`·`publishHour`를 전달하거나 `complete`·`publish_member`로 발행·완료 처리하는 것(2026-08-05 확정, Charter §10.1). 발행일은 보고에 제안만 하고 확정은 사용자가 한다
- 사용자가 확정한 기존 예약의 임의 취소·변경

## 운영자 프롬프트 기본값

```text
generationMode=local_agent로 enqueue_content
→ prepare_local_generation
→ prepare 응답의 contentFitStrategies 확인
→ 채널별 draft + channelFit + marketingFit + adFit 생성
→ submit_local_generation
→ get_job(view="completion") 완료 검증
```
