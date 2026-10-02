# Social Marketing Weekly Review (소셜 마케팅 주간 점검)

## 목적

- 매주 1회 정책 정본, Marketing Ops 실행 설정, 성과 수집 상태와 실제 검색 노출을 같은 기준으로 점검한다.
- 데이터 결측을 성과 하락으로 오판하거나, 측정 장애가 있는 상태에서 발행량을 증감하는 일을 막는다.
- 최종 의사결정은 `.agent/amu-platform-guide/MARKETING-STRATEGY.md` §1(도달·재방문 병행 목적, 2026-08-14 개정)과 `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §7(판정 원칙: 재방문 → 관계 행동 → 확장 → 복귀 → 수익)을 따른다.
- **정책-설정 정합 점검 항목(필수)**: `list_keyword_profiles`로 `uploadPolicy.version`을 조회해 지난주 판정에 쓴 버전과 대조한다. cap 수치는 이 응답이 단일 출처이며 문서와 대조하지 않는다(ADR #19).

## 실행 주기

- 주기: 주 1회
- 기준 시간대: `Asia/Seoul`
- 권장 실행: 매주 월요일 09:00 이후
- 비교 범위: 최근 7일 운영 상태 + 최근 28일 성과 추이
- 4주 표본이 부족한 구간에서는 상태 확인을 우선하며, 발행 cap은 `upload_cadence_and_quota.md`의 조정 트리거를 충족할 때만 변경한다.

## 필수 입력

- 정책 정본: `{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`, `{{AGENT_ROOT}}/refs/content-policy/channel_fit_scoring.md`, `{{AGENT_ROOT}}/refs/content-policy/measurement_and_conversion.md`, 본 문서
- 작업 원장: `/home/attrest-samsung-linux/Project/.agent/todo-ledgers/tasks/todo-content.json`
- 운영 큐: `/home/attrest-samsung-linux/Project/.agent/content/articles/queue/upload-queue.json`
- 기준 보고서: `/home/attrest-samsung-linux/Project/.agent/docs/project/2026/07/20260723_094255__social-marketing-performance-strategy-audit.md`
- 대상 네이버 블로그: `https://blog.naver.com/allmyuniverse_com`

## 1. 정책과 Marketing Ops 설정 동기화

1. `marketing-ops.list_keyword_profiles`의 `settings.marketingCriteria.uploadPolicy`를 조회한다.
2. 저장 정책이 없으면 Marketing Ops가 코드 기본값을 사용하는 상태로 판정하고 `policy_source=default`를 기록한다.
3. 정본과 다음 필드를 채널별로 대조한다.
   - `weekdayDailyCap`
   - `weekendDailyCap`
   - `weeklyCap`
   - `minGapHours`
   - `preferredHours`
4. `list_jobs`의 `recommendedUploadSchedules.policyVersion`과 추천 날짜가 정책 cap을 위반하지 않는지 확인한다.
5. 불일치가 있으면 신규 예약을 중지하고 정본 → 코드 기본값 → Marketing Ops 저장 설정 순으로 수정한다. DB 직접 수정은 금지한다.

동기화 기준값은 **`{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`의 채널별 cap 표를 점검 시점에 직접 읽어** 사용한다.
수치를 본 문서에 복제하지 않는다 — cap 수치의 유일한 출처는 그 문서 1곳이다(Charter §0).

대조 대상은 `weekdayDailyCap`, `weekendDailyCap`, `weeklyCap`, `minGapHours`, `preferredHours`이며,
불일치 판정 전에 정본의 불변식(`weeklyCap ≥ weekdayDailyCap×5 + weekendDailyCap×2`)과 조정 트리거를 함께 확인한다.

> 2026-08-05까지 이 자리에 cap 수치 표가 복제되어 있었다. 정본이 2026-08-01에 갱신된 뒤 사본 배포본이 옛 값(threads 1/1/5 등)을
> 그대로 들고 있어, 그 사본으로 점검하면 §1.5의 "불일치 시 신규 예약 중지"가 거짓으로 발동할 수 있었다. 그래서 표를 포인터로 바꿨다.

## 2. 성과 수집과 자격증명 점검

아래 MCP 조회는 read-only로 먼저 실행한다.

1. `marketing-ops.get_token_health(universeId="amu")`
2. `marketing-ops.get_social_performance(days=30)`
3. `marketing-ops.get_marketing_performance(view="channel_contribution", days=28)`
4. `marketing-ops.list_jobs(status="waiting_review,failed", limit=100)`

필수 판정:

- `autoCollect.lastRun.finishedAt`이 48시간 이내인가?
- 최근 7일 자동 수집 실행이 존재하고 실패·스킵 사유가 설명 가능한가?
- Threads/Instagram/LinkedIn의 `canCollectPerformance`와 권한 상태가 정상인가?
- GA4에 최근 3일 이내 데이터와 `page_traffic`, `event_funnel`, `acquisition`, `key_events` 4종이 존재하는가?
- `truncatedChannels`가 있으면 200건 상한을 노출·발행량으로 해석하지 않았는가?
- 첫 누적 스냅샷을 일간 성과로 사용하지 않았는가?

결측 처리:

1. Cron 실행 이력 없음 → Cloudflare Trigger 실재 여부와 Worker/Node cron 응답을 확인한다.
2. 토큰 만료·권한 누락 → 앱 Client Secret과 회원 access token을 구분하고 OAuth 재연결을 수행한다.
3. GA 결측 → `collect_ga_snapshots`를 먼저 dry-run한 뒤 최대 30일 단위로 멱등 백필한다.
4. 소셜 결측 → 권한·수집 설정을 확인한 뒤 `collect_social_performance`를 1회 실행하고 `lastRun` 완료를 확인한다.
5. 같은 오류가 반복되면 발행량 조정이 아니라 수집 코드·설정 오류를 우선 수정한다.

## 3. 네이버 실제 검색 노출 점검

1. 블로그 RSS에서 최근 글 7건의 `title`, `guid`, `pubDate`를 가져온다.
2. 발행 후 48시간이 지난 글만 판정 표본에 포함한다.
3. 네이버 통합검색과 블로그 검색에서 제목 전체를 검색하고 해당 `guid`의 post ID가 결과에 있는지 확인한다.
4. 대표 키워드 검색은 별도 열에 기록하며 제목 전체 검색 결과와 섞지 않는다.
5. 자동 요청이 robots 또는 로그인 요구로 차단되면 Creator Advisor 및 브라우저 수동 확인으로 대체하고 `manual_required`로 기록한다.

기록 필드:

```text
checkedAt, title, postId, publishedAt, ageHours,
exactTitleExposed, keywordExposed, searchPosition, evidenceUrl, note
```

노출률 계산:

```text
48시간 경과 글의 제목 검색 노출 건수 / 48시간 경과 표본 수
```

최신 글을 48시간 이전에 검색해 발견하지 못한 결과는 미노출 실패로 계산하지 않는다.

## 4. 개선·변경 게이트

- 데이터 결측·권한·Cron 장애는 즉시 P0로 수정한다.
- 정책과 Marketing Ops 설정 불일치는 신규 예약을 중지하고 같은 주에 동기화한다.
- 발행량은 표본 부족만으로 변경하지 않는다. 확대는 최근 4주 게시물당 성과 하락 없음 등 `upload_cadence_and_quota.md`의 조건을 충족해야 하며, 스팸·도달 제한 신호에 따른 축소는 즉시 허용한다.
- 4주 후 판단은 게시물당 T+48h/T+7d 중앙값, 주간 총도달, 가입, 첫 생성 성공을 함께 사용한다.
- 합계만 증가하고 게시물당 성과가 30% 이상 하락하며 전체 성과 증가가 10~15% 미만이면 cap을 축소한다.
- 네이버 노출률이 4주차에도 50% 미만이면 발행량을 늘리지 않고 키워드·중복·콘텐츠 구조를 재검토한다.

## 5. 산출물과 완료 조건

- 보고서: `/home/attrest-samsung-linux/Project/.agent/docs/project/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__social-marketing-weekly-review.md`
- 로그: `/home/attrest-samsung-linux/Project/.agent/logs/project/{YYYY}/{MM}/{YYYYMMDD}.json`
- `TASK-SOCIAL-MARKETING-WEEKLY.report`에 보고서 경로를 추가하고 `lastCheckedAt`, `nextCheckAt`, `status`를 갱신한다.

완료 조건:

1. 정책/설정 대조 결과가 채널별로 기록됨
2. 소셜·GA 최신성과 자동 수집 실행이 확인됨
3. 네이버 48시간 경과 표본의 실제 검색 결과가 기록됨
4. 결측이 있으면 원인·조치·재검증 결과가 기록됨
5. 발행량 유지/증량/감량 판단이 데이터 근거와 함께 기록됨
