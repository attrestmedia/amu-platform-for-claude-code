---
name: marketing-ops-agent
description: marketing-ops MCP와 node-app 마케팅 queue를 사용해 로컬 에이전트 기반 콘텐츠 생성/제출/검증 작업을 수행
allowed-tools: Read, Grep, Bash
---

# Marketing Ops Agent Workflow

## 목적

마케팅 콘텐츠 자동화 작업에서 결과물이 로컬 파일에만 남지 않고 node-app 마케팅 운영 툴의 queue, job, step, asset, publish/review 상태로 저장되도록 강제함

## 사용 조건

- 사용자가 `marketing-ops`, 마케팅 queue, 로컬 에이전트, `prepare_local_generation`, `submit_local_generation`, 마케팅 운영 툴 등록을 언급한 경우 사용할 것
- 단순 로컬 문서 작성 작업에는 사용하지 않음

## 필수 흐름

1. `marketing-ops` MCP가 현재 작업 cwd에서 사용 가능한지 확인
   - `{agent_name} mcp list`
   - `marketing-ops` env에 `AGENT_BASE_URL`, `AGENT_API_KEY` 포함 필수
   - uploadPolicy 변경 요청이면 `list_keyword_profiles`로 현재 정책과 버전을 확인한 뒤 `update_upload_policy(expectedVersion=...)`로 필요한 채널만 갱신하고 재조회한다. 버전 충돌은 최신 정책 재조회 후 판단한다.
   - 광고 기준 변경 요청이면 `get_content_fit_strategies`로 현재 기준과 버전을 확인한 뒤 `update_advertising_criteria(expectedVersion=...)`로 필요한 필드만 갱신하고 재조회한다. 정책 문구 원문은 전략 원장 밖에 복제하지 않는다.
   - 일 cap과 함께 `preferredHours`·`minGapHours`의 유효 슬롯 수도 확인한다. Instagram 12시·20시 2슬롯은 `minGapHours=8`을 사용한다.
2. queue 등록이 필요한 경우 `enqueue_content`를 호출
   - slug/url, universeId, queueCategory, reviewMode를 명확히 전달
   - `generationMode`는 **반드시 `local_agent`로 명시**(생략 금지). 생략하면 서버 기본 분기로 떨어져 서버 워커 provider 모델(예: 소형 GPT)이 한국어를 생성하고, 음절 조합이 깨진 저품질 결과가 나온다.
   - `modelName`/`modelProvider`는 server_worker 전용 파라미터이므로 로컬 생성 시 전달하지 않는다.
   - 콘텐츠 본문 생성은 항상 현재 로컬 에이전트가 수행한다. 서버 워커/`poll_worker`에 생성을 위임하지 않는다.
3. 로컬 에이전트 생성은 `prepare_local_generation`으로 시작
   - 응답의 `jobId`, `universeId`, `workerId`, `source`, `channels`, `instructions`, `contentFitStrategies`를 보관
   - 이 단계는 job을 `waiting_input` 상태로 만들 수 있으므로 submit 없이 종료하지 않음
   - 정상 생성 경로에서는 오탈자 사전을 모델 컨텍스트에 선로드하지 않는다. active rule은 제출 시 node-app 서버가 authoritative DB 기준으로 대조한다.
   - `contentFitStrategies` 로드 오류가 있을 때만 `get_content_fit_strategies`를 1회 호출한다.
4. 현재 에이전트 모델이 채널별 draft와 validation JSON을 생성
   - prose만 만들지 않음
   - `threads`, `linkedin`, `naver_blog` 각각의 schema를 지킬 것
   - 운영 검토 UI가 직접 읽는 필드를 반드시 함께 채울 것
     - `threads`: `title`, `text`, `linkUrl`, `hashtags`, `cta`
     - `linkedin`: `headline`, `body`, `text`, `summary`, `commentLink`, `hashtags`, `cta`, `suggestedMode`
     - `naver_blog`: `title`, `summary`, `body`, `html`, `plainText`, `tags`, `cta`
   - `linkedin.body`와 `linkedin.text`는 같은 본문을 넣어 검토 UI와 기존 발행/검증 경로를 동시에 만족시킬 것
- `naver_blog.body`는 검토 UI 본문, `naver_blog.summary`는 검토 UI 요약, `naver_blog.html/plainText`는 저장/검증용 본문으로 모두 채울 것
- 해시태그는 별도 메타데이터 필드에만 저장할 것(`hashtags`, 네이버 블로그는 `tags`). `title`/`headline`/`body`/`text`/`caption`/`summary`/`plainText`/`cta`/`reply`에는 해시태그 토큰을 넣지 말 것. 서버 검증이 이 규칙을 차단 게이트로 검사한다.
   - canonical link는 source URL을 유지
5. `submit_local_generation`으로 drafts 배열을 제출
6. `get_job(view="completion")`으로 `channel_draft`와 `validation_report`의 최신 연결을 확인한다. 각 채널의 `checks.independentProofread`가 `gemini-3.5-flash-lite`, `status="passed"`, `valid=true`여야 완료로 판정한다. 실패·미실행·stale이면 로컬 MCP 작업의 완료/발행 금지다.
   - 로컬 에이전트의 공통 사전 대조·육안 검수를 1차, 서버 고정 저비용 모델 검수를 2차로 본다.
   - 2차 검수 finding이 있으면 `record_typo_candidate`로 전체 유니버스 공통 사전에 기록하고, 현재 로컬 에이전트가 콘텐츠를 수정한 뒤 전체 채널 drafts를 `submit_local_generation`으로 재제출한다.
   - `unavailable`이고 finding이 없으면 동일 draft를 재제출하거나 문장부호를 임의 변경하지 않는다. `get_job(view="proofread")` 1회 확인 후 infrastructure block으로 보고한다.
   - Web UI의 `AI 검수 및 수정`은 운영자 선택 옵션이며, 로컬 MCP의 이 2중 검수 게이트와 혼동하지 않는다.
6.5 `get_job` 응답의 `metrics.localAgent`를 확인한다. `status`가 `submitted`이고 `modelName`이 현재 로컬 에이전트 모델이면 로컬 생성이 맞다. `metrics.localAgent`가 없거나 서버 워커 생성 흔적이 있으면 정책 위반으로 보고하고 재생성한다. `request.generationConfig.modelName`은 enqueue 시점 server_worker 설정값일 뿐(로컬 제출 후에도 그대로 남음) 실제 생성 주체가 아니므로 판정 기준으로 쓰지 않는다.
7. 최종 보고에는 jobId, universeId, channel status, 검증 결과만 요약(성과 데이터를 전략에 반영한 경우 근거 채널/entityId 요약 포함)

## 추천 업로드 일정 (에이전트는 제안까지)

**에이전트 작업은 검수 대기(`waiting_review`)에서 끝난다.** 발행도 예약도 실행하지 않는다(Charter §7.1, 2026-08-05 확정).

- `list_jobs`로 대상 job의 `recommendedUploadSchedules`를 확인한다. 추천일은 저장된 채널 정책과 유니버스별 검수/발행 전체 큐를 반영하며 UI 필터와 무관하다.
- `allowedHours` 안에서 콘텐츠 타입에 맞는 시(hour)를 판단하고, **보고에 채널·날짜·시로 적어** 사용자가 검수 UI에서 확정하도록 넘긴다.
- `apply_channel_action`에 `publishAt`·`publishHour`를 전달하는 예약 호출과 `complete`·`publish_member` 등 발행·완료 액션은 **호출 금지**다.
  > 채널마다 처리 분기가 달라 예약 의도가 즉시 발행으로 기록된 사고가 두 건 있었다(`linkedin` 2026-08-01, `naver_blog` 2026-08-05). MCP 응답 상단이 예약 성공으로 보여도 channel log의 `scheduledPublishAt`이 비어 있을 수 있다.
- 예약 여부 판정은 채널 step의 `meta.scheduledPublishAt`으로만 한다. `recommendedUploadSchedules`는 이미 예약된 채널에도 계속 반환된다.
- 사용자가 확정한 예약은 취소·변경하지 않는다.

## 소셜 성과 데이터 활용 (성과 검증/분석)

소셜 콘텐츠 생성 작업의 전후로 marketing-ops MCP의 소셜 성과 도구를 활용한다.

- **draft 전략 수립 전(권장)**: `get_social_performance`(저장된 스냅샷 조회, provider quota 미소비)로 최근 30일 채널별 반응률/상위 게시물을 확인하고, 성과가 좋았던 채널/주제/훅/CTA를 새 draft 전략에 반영한다. 저장된 스냅샷이 없으면 이 단계는 건너뛴다(작업 차단 아님).
- **발행 완료 후 수집**: `collect_social_performance`로 publish log 기준 성과를 수집한다.
  - 신규 universe/최초 실행(백필): `sinceDays=60~90`
  - 평시 반복 수집: `sinceDays=7~14`
  - 토큰/권한 스모크 테스트: 먼저 `dryRun=true`로 실행해 채널별 `failed` 사유를 확인
- `collect_social_performance`는 provider API quota를 소비하고 agent 키의 `poll_worker` 권한이 필요하다. 같은 세션에서 불필요하게 반복 호출하지 않는다(자동 스케줄 수집이 있으면 조회 위주로 사용).
- 수집 전 `get_token_health`로 Threads/Instagram/LinkedIn 토큰 상태를 확인한다. 만료/무효 토큰은 "재연결 필요"로 보고만 하고 직접 갱신을 시도하지 않는다.
- 성과 수치는 실측 스냅샷 기준으로만 인용한다. 스냅샷이 없는 기간(토큰 만료/수집 공백)의 추세는 복구 불가하므로 "추정"으로 표기한다.
- Naver Blog는 내부 통계 API가 없어 발행 URL 검증 + GA4/UTM 보조 분석 기준으로만 해석한다.

## 금지 사항

- 로컬 폴더에 markdown만 만들고 완료 처리하지 않음
- MCP tool 호출이 실패했는데 임의로 로컬 fallback을 수행하지 않음
- `poll_worker`와 `local_agent`를 혼동하지 않는다. `poll_worker`는 서버 provider API 비용을 사용할 수 있음
- 콘텐츠 채널 본문 생성에 server_worker 모드/`poll_worker`/`modelName`/`modelProvider`를 사용하지 않는다. 이들은 서버 provider 모델을 호출하므로 "로컬 에이전트 직접 생성" 원칙에 위배되고, 한국어 음절 깨짐·톤/브랜딩 규칙 이탈의 직접 원인이 된다. (서버 워커는 로컬 생성이 불가능할 때의 fallback 경로로만 취급)
- 내부 인증 키, provider key, refresh token을 응답에 그대로 쓰지 않음

## 실패 처리

- MCP 미등록: 현재 cwd와 config 경로를 보고하고, `amu_app/node-app` 기준 설정 확인을 안내
- `AGENT_API_KEY` 누락: MCP env 설정 문제로 보고
- `prepare_local_generation` 이후 submit 실패: jobId, workerId, status, reason을 기록하고 recovery 필요성을 보고
- `get_job`에서 asset 미확인: 제출은 되었지만 운영 툴 반영 검증이 실패한 것으로 보고

## 운영자 프롬프트 템플릿 예시

- `marketing-ops-agent` 활용 시 운영자가 명시적으로 아래와 같은 내용의 프롬프트를 전달하지 않아도 아래의 내용을 참고하여 작업을 수행할 것

```text
- 로컬 에이전트 모드(generationMode=local_agent)로 `marketing-ops-agent` 스킬을 활용하여 콘텐츠 생성
- universeId=<universeId>, slug=<slug>
- 로컬 파일은 생성 금지, **marketing-ops MCP**만 사용할 것
- 목표: `enqueue_content -> prepare_local_generation -> 채널별 drafts JSON 생성 -> submit_local_generation -> get_job 검증 완료`
- 실패 시 로컬 fallback 없이 MCP/API 오류와 jobId 보고   
```
