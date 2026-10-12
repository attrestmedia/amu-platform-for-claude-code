# Upload Cadence & Daily Quota Rules (업로드 주기·일일 쿼터·대기 큐)

## 목적

- 채널별 지속가능 발행량에 맞춰 **일일 draft 생성량을 제한**하고, 사전 검수(Pre-Fit) 통과 소재를 쿼터에 따라 **즉시 생성 / 대기 큐**로 라우팅한다.
- 검수 큐 범람과 기계적 대량 발행(유사문서·예약봇 신호)을 방지한다.

## 생성 레버 vs 발행 레버 (구분)

- **생성 레버(에이전트 통제)**: 채널별 일일 draft 생성 cap. **수치는 Marketing Oops `uploadPolicy`가 갖고, 본 문서는 조회·적용 절차를 강제한다.**
- **발행 레버(사용자 통제)**: 실제 게시 시각·정각 회피·저녁 슬롯·답글 활동. 아래 "발행 시각 가이드"는 권고이며 에이전트 강제 대상이 아니다.
- **에이전트 코멘트 의무**: 채널 draft 생성/제출 완료 보고 시, 에이전트는 사용자에게 해당 콘텐츠의 채널·타입에 맞는 **권장 발행 시각을 코멘트로 함께 제시**한다. "발행 시각 가이드"의 콘텐츠 타입별 시각표와 `list_jobs` 응답의 `recommendedUploadDates`(채널별 추천일)를 근거로, 추천일 + 권장 `publishHour`(시)를 함께 제안한다.
- **에이전트는 예약을 실행하지 않는다**(2026-08-05 개정, Charter §10.1). 제안까지가 에이전트 몫이고 예약 등록과 발행은 사용자가 검수 UI에서 확정한다. 아래 "Web/MCP 예약 발행 연동"은 **사용자·Web UI가 수행하는 절차**이며 에이전트 실행 절차가 아니다.

## 일일/주간 draft 생성 쿼터 — **Marketing Oops가 단일 출처** (2026-08-06 개정)

> **이 문서에는 cap 수치를 적지 않는다.** 문서값과 Marketing Oops 설정이 어긋나는 사고가 반복됐다
> (2026-08-06 실측: 문서 threads 2/2/14 vs `uploadPolicy` v9 실제 4/2/24). 원장이 둘이면 드리프트는 재발한다.
> 근거 결정: ADR #19.

```text
SSOT   Marketing Oops  settings.marketingCriteria.uploadPolicy
조회   list_keyword_profiles(universeId)
       → data.settings.marketingCriteria.uploadPolicy
         { version, timezone,
           channels: { <channel>: { weekdayDailyCap, weekendDailyCap,
                                    weeklyCap, minGapHours, preferredHours } } }
변경   update_upload_policy(expectedVersion, channels)
```

### 조회 의무 (fail-closed)

1. **소셜 콘텐츠 생성 사이클을 시작할 때마다 조회한다.** 이전 세션의 값, 이 문서의 과거 기록, 기억에 남은 수치를 쓰지 않는다.
2. 조회한 `version`을 보고와 `content-ledger.jsonl`에 함께 남긴다. 어느 버전으로 판정했는지 남지 않으면 드리프트를 추적할 수 없다.
3. **조회에 실패하면 생성을 중단하고 `blocked`로 보고한다.** cap을 추정하거나 문서값으로 대체하지 않는다.
4. cap 변경은 `update_upload_policy`(`expectedVersion` 필수)로만 한다. 문서를 고쳐 cap을 바꾸려 시도하지 않는다.

### 문서가 강제하는 것 — 수치가 아니라 관계

```text
① weeklyCap = weekdayDailyCap × 5 + weekendDailyCap × 2
   주간 cap이 요일 합보다 작으면 주 후반 요일이 구조적으로 버려진다.
   주말을 쓰지 않는 채널은 weekendDailyCap = 0 으로 명시한다(주간 cap을 줄여 표현하지 않는다).

② preferredHours 개수 >= 일 cap 최대값
   슬롯이 부족하면 같은 시각에 몰린다.

③ 일 cap이 2 이상이면 preferredHours 인접 슬롯 간격 >= minGapHours
```

세 항목은 `scripts/marketingUploadPolicyContract.test.ts`가 검사한다. **cap 변경 시 이 테스트를 먼저 통과시킨다.**

### 채널별 성격 (수치 아님 — 판단 근거)

| 채널 | 성격 |
|---|---|
| threads | 주말도 정상 발행되는 채널. 원본 도배보다 답글 활동 우선 |
| linkedin | B2B는 토·일 참여가 사실상 없어 주말 0이 정상값이다(누락 아님). 출시일 예외는 별도 승인 |
| naver_blog | 검색 유입 채널이라 요일 영향이 작다. 몰아쓰기 금지 |
| instagram | 실제 시각 자산 필요. 게시 빈도의 **일관성**이 도달 회복의 전제 |

- **cap은 상한이지 목표가 아니다.** 실제 발행량은 소재 공급과 Pre-Fit 게이트가 결정하며, cap을 채우기 위해 소재를 억지로 만들지 않는다.
- naver_blog Phase 승급은 자동 금지. `.agent/content/articles/queue/upload-queue.json`의 `naverPhase`를 사용자가 수동 변경하고, 실제 cap 반영은 `update_upload_policy`로 한다.
- Phase 승급 조건(모두 충족): 글마다 검색의도 명확 / 제목·구조 비반복 / 자체 이미지·실제 결과물 포함 / 매거진 문장 미재사용 / 게시물 상당수 검색 수집 / 유입 검색어가 목표 클러스터 일치 / 기사 맥락의 내부 동선 작동.

## 라우팅 절차 (Pre-Fit 직후, 채널 draft 생성 전 필수)

0. **`list_keyword_profiles`로 `uploadPolicy`를 조회한다.** 이 단계를 건너뛴 cap 판정은 무효다. 조회 실패 시 `blocked`로 중단한다.
1. Pre-Fit '적합' 채널에 대해 오늘자 생성수를 집계한다:
   - `.agent/content/content-ledger.jsonl`에서 `date==오늘` 이고 `channel`에 해당 채널이 포함된 항목 수
   - `.agent/content/articles/queue/upload-queue.json`의 `pending`에서 오늘 생성 완료(`status: generated`)된 항목 수
2. 이번 주(월~일, `uploadPolicy.timezone` 기준) 생성수도 집계해 `weeklyCap`과 대조한다.
3. 판정:
   - 일 cap 미만 AND 주간 cap 미만 → 생성 진행(발행 예정일 = 오늘)
   - **오늘 cap 도달 → 곧바로 대기 큐로 보내지 말고 아래 "선행 생성·예약 등록(D+5 창)"을 먼저 적용한다.** D+5 창에도 가용일이 없을 때만 아래 "대기 큐 등록 게이트"를 거쳐 대기 큐 등록 여부를 판정한다(draft 생성하지 않음)
   - Pre-Fit 부적합 → 스킵(기존 규칙, `channel_fit_scoring.md`)
4. 같은 날 cap 경쟁 시 우선순위: **R 등급(R0>R1>R2>R3>R4)** → Pre-Fit 점수 내림차순 → FIFO. 상위가 cap을 차지하고 초과분은 대기 큐로 보낸다.
5. 주말/평일 판정은 발행 대상 날짜(`uploadPolicy.timezone`) 기준.
6. **카테고리 최소 슬롯 보장**: 주간 cap 안에서 `todo-content.json`의 활성 소스 카테고리(TASK-IMAGE-TEMPLATE / TASK-CONTENT-TEMPLATE / TASK-CREATION-LOG)마다 **주 1건**을 먼저 확보한 뒤, 남는 슬롯을 4번의 R 등급 우선순위로 배분한다.
   - 최소 슬롯과 R 등급 우선순위가 충돌하면 **최소 슬롯 보장이 우선**한다. 이 규칙이 없으면 상위 등급이 슬롯을 전부 차지해 카테고리별 성과 비교 표본이 만들어지지 않는다.
   - 해당 주에 그 카테고리의 Pre-Fit 통과 소재가 없으면 슬롯을 비우지 않고 R 등급 우선순위로 넘긴다. **소재를 억지로 만들지 않는다.**
   - 카테고리별 소진·미달 현황은 주간 점검(`social_marketing_weekly_review.md`)에서 확인한다.
   - **TASK-AMU-MAGAZINE은 2026-09-04부로 슬롯 대상에서 제외했다.** 매거진은 검색 색인 회복과 Intelligence 원천 데이터 확보 전용으로 운영하며 소셜 산출물을 만들지 않는다(`todo-content.json` TASK-COMMON `scope.bySourceTask`가 정본). 비운 슬롯은 당분간 4번의 R 등급 우선순위로 배분한다.
   - **TASK-APP-EXPERIENCE(App 인터랙션 콘텐츠)는 아직 슬롯 대상이 아니다.** node-app 발행 경로가 열리고 실제 콘텐츠가 발행된 뒤에 슬롯 승계 여부를 판정한다 — 추적: `.agent/todo-amu-integrated-reorganization.json` AIR-405.

## 선행 생성·예약 등록 (D+5 창)

**목적**: 오늘 하루의 cap만 보고 소진을 멈추면, 내일이면 풀릴 채널의 대기 항목이 그대로 적체된다. cap 집계 기준을 **생성일이 아니라 발행 예정일(`targetPublishDate`)**로 두고, 가까운 미래의 빈 슬롯까지 한 사이클에서 채운다.

- **창 범위**: 오늘(D0) cap이 찬 채널에 한해 **D+1 ~ D+5**(Asia/Seoul)까지 배정한다. D+6 이후는 배정하지 않는다.
- **총량 불변**: 미래 cap을 당겨쓰는 것이 아니라 **그 날짜의 cap을 그 날짜 몫으로 소비**한다. 따라서 주간 총량은 변하지 않고 Charter의 4주 실험 동결 조항과 충돌하지 않는다.
- **배정 판정**: 후보 발행일마다 ① 그 날짜의 평일/주말 일 cap ② 그 날짜가 속한 주(월~일)의 주간 cap을 **둘 다** 만족해야 한다. 주말 cap이 0인 채널(linkedin)은 해당 날짜를 건너뛴다.
- **배정 순서**: 가장 가까운 가용일부터 채우고, 한 날짜가 그 날의 일 cap에 도달하면 다음 날로 넘어간다. 우선순위는 기존 4번(R 등급 → Pre-Fit → FIFO)을 그대로 쓴다.
- **몰아쓰기 방지**: 한 사이클에서 같은 채널·같은 날짜에 배정하는 건수는 그 날짜의 일 cap을 넘지 않는다. 창 전체 배정 건수는 D+1~D+5 잔여 cap 합계를 넘지 않는다.

### 배정 결과 처리 (에이전트는 제안까지, 2026-08-05 개정)

**에이전트는 예약을 실행하지 않는다.** D+5 창 배정은 cap 회계와 발행일 제안까지이며, 실제 예약 등록과 발행은 사용자가 검수 UI에서 확정한다.

- 배정 대상은 **독립 오탈자 검수를 통과해 `waiting_review`에 도달한 draft로 한정**한다. 검수 미완료·`failed` job은 배정 대상이 아니다.
- 배정한 날짜는 큐 항목의 `targetPublishDate`와 `jobId`에 기록하고 `status`는 `generated`를 유지한다. `scheduledPublishAt`은 **사용자가 실제로 예약을 확정한 뒤에만** 채운다.
- 권장 시각은 "콘텐츠 타입별 권장 발행 시각" 표에서 고르고, **보고에 채널·날짜·시(hour)를 함께 적어** 사용자가 그대로 확정할 수 있게 한다. 분은 10~30 사이 값을 제안한다(정각 회피).
- `apply_channel_action`으로 `publishAt`·`publishHour`를 전달하는 예약 호출은 **에이전트 금지**다. `complete`, `publish_member`처럼 발행·완료를 유발하는 액션도 호출하지 않는다.
  > **금지 근거**: 예약 실행 경로가 채널마다 다르게 동작한다. `linkedin`(2026-08-01, uq-20260716-001)과 `naver_blog`(2026-08-05, 동일 채널의 한 콘텐츠 항목)에서 예약 의도 호출이 **즉시 발행 처리로 기록**됐고, 에이전트가 되돌릴 안전 절차가 없다. Charter §10.1 "에이전트 종료 지점 = 검수 대기"를 따른다.
- 사용자가 이미 예약한 항목은 에이전트가 취소·변경하지 않는다. 상태 확인은 채널 step의 `meta.scheduledPublishAt`으로만 판정한다(`list_jobs`의 `recommendedUploadSchedules`는 예약된 채널에도 계속 반환된다).

## 대기 큐 등록 게이트 (마케팅 적합도 — 적체 방지)

**문제**: 매거진 신규 기사·리뉴얼은 계속 나오는데 소셜 채널 cap은 고정이다. Pre-Fit '적합'만으로 큐에 넣으면 pending이 단조 증가하고, 소진 계획이 없는 항목이 큐를 채워 정작 전환에 기여할 소재의 슬롯을 가린다.

**원칙**: 매거진 draft 등록과 대기 큐 등록을 분리한다.

- **매거진 draft 등록은 대기 큐와 무관하게 항상 수행한다.** 신규 기사·리뉴얼의 완료 조건은 `amu-magazine` SEO 게이트 통과 + WordPress draft 등록이며, 소셜 재가공 여부가 이 완료를 막지 않는다.
- 대기 큐(`upload-queue.json`)는 **소셜 재가공을 실제로 진행할 항목만** 담는다. 매거진 산출물의 보관소가 아니다.

**등록 조건** — D+5 창까지 가용 슬롯이 없어 대기 등록을 검토할 때 채널별로 판정한다.

| 판정 | 조건 | 조치 |
|---|---|---|
| 큐 등록 | R 등급 `R0` 또는 `R1` **그리고** 해당 채널 Pre-Fit **18점 이상** | `pending`에 등록 |
| 큐 미등록·완료 | 위 조건 미충족 (`R2` 이하 또는 Pre-Fit 16~17) | 큐에 넣지 않고 **매거진 draft 완료로 종결** |

- 기준 근거: Pre-Fit 16~17은 '적합' 밴드(16~20)의 하단이다. 슬롯이 없어 경쟁이 발생한 상황에서는 밴드 상단만 슬롯을 받는다. 등급 조건은 Charter §5의 R 라우팅(관계 기여도)을 큐 진입에 그대로 적용한 것이다. **새 점수 체계를 만들지 않고 기존 Pre-Fit·R 등급을 그대로 쓴다.**
- 구 `P0~P4` 값이 남아 있는 기존 pending 항목은 소급 수정하지 않는다. 해석은 Charter §5의 전환 매핑을 따른다(`P0`→`R1`, `P1`→`R2`, `P2`→`R1|R2`, `P3`→`R3`, `P4`→`R4`).
- **cap에 여유가 있으면 이 게이트를 적용하지 않는다.** 잔여 슬롯이 있으면 기존 라우팅 절차대로 Pre-Fit 16점 이상에서 생성한다. 이 게이트는 슬롯 경쟁 상황에서만 작동한다.
- 게이트로 큐 등록을 생략한 항목은 **드롭이 아니다.** `dropReason`을 쓰지 않고 `upload-queue.archive.jsonl`에도 넣지 않는다. `.agent/content/content-ledger.jsonl`에 `"socialReuse": "skipped_low_fit"`과 채널별 Pre-Fit 점수·R 등급을 남기는 것으로 종결한다.
- 같은 소재를 나중에 다른 앵글로 되살릴 수 있다. 그때는 `channel_fit_scoring.md`에 따라 Pre-Fit을 새로 판정한다.
- 이 게이트는 **큐 진입만** 통제한다. 이미 `pending`에 있는 항목의 소진·드롭 기준은 아래 "대기 큐 소진"을 그대로 따르며, 게이트 신설을 근거로 기존 pending을 소급 정리하지 않는다(소급 정리는 "드롭 기준"과 30% 승인 규칙을 따른다).
- 사용자 보고에는 채널별로 `채널 | R등급 | Pre-Fit | uploadPolicy version | 큐 등록/완료 종결` 1행을 남긴다. 완료 종결도 스킵이 아니라 **정상 결과**로 보고한다.

## 대기 큐 소진 (다음 생성 사이클 착수 시 필수)

- 새 소스 착수 전에 `upload-queue.json.pending`을 채널별 잔여 cap 범위에서 우선순위 순으로 소진한다(해당 채널 draft 생성 → `status: generated`). **에이전트의 소진 완료 지점은 `generated`(검수 통과 + 발행일 제안)이며 `scheduled`가 아니다.**
- 오늘 cap이 찬 채널은 위 D+5 창으로 이어서 소진한다. **오늘 가용 슬롯이 0이라는 이유만으로 소진 사이클을 종료하지 않는다.**
- 큐 항목의 Pre-Fit이 7일 초과로 오래되면 재판정 후 진행한다.
- 큐 항목에 대응하는 job이 `failed`로 끝났으면 `generated`를 유지하지 않는다. 실제 결과에 맞게 상태를 되돌리고 실패 사유를 기록한다.

### 드롭 기준 (시간·상황)

아래 중 하나에 해당하면 `status: dropped` + `dropReason`을 기록한다. 적체를 줄이려는 목적만으로 드롭하지 않는다.

**시간 사유**

- 시의성 소멸: 사건·릴리즈·시즌에 묶인 소재가 기준일에서 멀어져 지금 발행하면 뒷북이 되는 경우. 빌드인퍼블릭·운영일지 계열은 **최신 2건만 유지**한다.
- Pre-Fit 재판정 탈락: 7일 초과 재판정에서 채널 게이트 점수 미만으로 떨어진 경우(`channel_fit_scoring.md`).
- 창 이월 반복: D+5 창에서도 3사이클 연속 배정되지 못한 항목은 소재·채널 적합성을 재검토하고, 회복 근거가 없으면 드롭한다.

**상황 사유**

- 소스 원문 소멸·변경: 원문 글이 비공개·삭제되었거나 draft 근거(`sourceQuotes`·`allowedClaims`)가 성립하지 않을 만큼 개정된 경우.
- 전략 축 이탈: Charter §5 R 라우팅 재판정에서 R4로 내려가 성립하는 CTA가 없는 경우.
- 중복: 같은 `dedupeKey` 또는 같은 slug·채널 조합이 이미 발행·예약되었거나 ledger에 존재하는 경우.
- 규제·컴플라이언스: `compliance-guardrails.md` 게이트에 걸려 현재 형태로 발행할 수 없는 경우.
- 채널 정책·경로 변경: 해당 채널의 발행 경로가 정책상 막힌 경우. **단 일시적 장애는 드롭이 아니라 보류**이며, 복구 일정이 미정이고 소재의 시의성까지 소멸했을 때만 드롭한다.

**절차**

- 드롭 항목은 원문 전체를 `upload-queue.archive.jsonl`에 append하고(`removedFromQueueAt`·`removedBy`·`dropReason` 부가) `pending`에서 제거한다. `content_archive_management.md`의 "파일 자동 삭제 금지, 정리 시 근거 기록 필수"를 따른다.
- 판정 근거(경과일·재판정 점수·원문 상태)를 `dropReason`에 함께 남긴다. 사유 없는 일괄 드롭은 금지한다.
- 한 사이클에서 `pending`의 **30% 이상을 드롭하려면 사용자 승인을 먼저 받는다.**

## 대기 큐 파일

- 위치: `.agent/content/articles/queue/upload-queue.json`
- 스키마:

> **cap 필드를 이 파일에 새로 쓰지 않는다.** `dailyCaps`·`weekendDailyCaps`·`weeklyCaps` 키가 남아 있다면 **레거시 사본**이며 판정 근거로 쓰지 않는다. cap은 항상 `list_keyword_profiles`의 `uploadPolicy`에서 읽는다(ADR #19).

```json
{
  "version": "1.0",
  "updatedAt": "ISO 8601",
  "naverPhase": 1,
  "pending": [
    {
      "id": "uq-YYYYMMDD-NNN",
      "channel": "naver_blog",
      "source": { "kind": "wp|git|idea", "ref": "slug/커밋/키워드", "slug": "", "title": "" },
      "relationGrade": "R1",
      "preFit": 18,
      "uploadPolicyVersion": 9,
      "enqueuedAt": "ISO 8601",
      "reason": "daily_cap_reached",
      "status": "pending",

      "targetPublishDate": "YYYY-MM-DD",
      "scheduledPublishAt": "ISO 8601",
      "jobId": "marketing_job_...",
      "dropReason": ""
    }
  ]
}
```

- `status` 전이: `pending` → `generated`(draft 생성 완료, **에이전트 종료 지점**) → `scheduled`(사용자가 예약을 확정한 뒤) / `dropped`(드롭). 대응 job이 `failed`로 끝나면 `generated`를 유지하지 않고 되돌린다.
- `targetPublishDate`·`jobId`는 D+5 창 배정 시 에이전트가 채운다. **`scheduledPublishAt`은 사용자가 예약을 확정한 사실을 확인한 뒤에만** 기록하고, 근거는 채널 step의 `meta.scheduledPublishAt`으로 한다. `dropReason`은 드롭 시에만 채운다.
- 기록 원칙: `content_archive_management.md` 준수(기존 항목 임의 수정 최소화, 상태 전이만 갱신).

## 발행 시각 가이드 (사용자 권고, 비강제)

- 정각 1시간 간격 연속 발행 금지 → 10~30분 분산(MCP `publishHour` 예약 시 분 자동 랜덤으로 충족. `publishAt` 직접 지정 시에는 에이전트가 분을 10~30에서 고른다).
- **Threads와 Instagram은 최적 시간대가 서로 반대다.** Threads는 평일 오전, Instagram은 평일 저녁이 강하다. 같은 소재를 두 채널에 낼 때 같은 시각을 쓰지 않는다.
- 네이버 블로그: 오전 검색·전환형 1건 + 저녁 문제해결·입문형 1건 조합.
- Threads: 원본 발행보다 답글·댓글 대화량을 우선(수동).

### 콘텐츠 타입별 권장 발행 시각 (에이전트 코멘트 근거)

에이전트는 draft 제출 완료 보고에서 아래 표를 근거로 채널·타입별 권장 발행 시각을 사용자에게 제안한다. 이 표는 **cap이나 정책값이 아니라 "어떤 콘텐츠를 몇 시에 두면 좋은가"라는 편집 판단**이다.

> **아래 시각은 `uploadPolicy.preferredHours`/`allowedHours`에 포함될 때만 사용할 수 있다.** 실제 허용 시각은 `list_keyword_profiles`(또는 `list_jobs`의 `allowedHours`)로 조회하고, 표의 시각이 허용 목록에 없으면 **표가 아니라 조회값을 따른다.** 분(minute)은 서버가 10~30 사이에서 자동 선택하므로 정각 회피는 자동 충족된다.

| 채널 | 콘텐츠 타입 | 권장 시각(KST) |
|---|---|---|
| threads | 출근길 훅·오늘의 실험 | 07:20 |
| threads | 짧은 AI 활용 팁 | 09:20 |
| threads | 실패·수정·개선 기록 | 11:20 |
| threads | 질문·의견 유도 | 13:10 |
| threads | 운영 데이터·수치 | 15:20 |
| threads | 대표의 짧은 생각 | 17:20 |
| threads | 제품 결과·사례(저녁 검증 슬롯) | 19:20 |
| linkedin | 문제의식·목표(주초) | 화~목 10:20 |
| linkedin | 실전 사례·운영 인사이트 | 화~목 12:20 |
| linkedin | 산업 변화·대표 관점 | 수 15:20 |
| linkedin | 데이터·배운 점 | 목~금 17:20 |
| naver_blog | 검색·관계형(R0/R1) | 09:20 |
| naver_blog | 비교·검토형 | 13:20 |
| naver_blog | 문제 해결·입문형 | 18:20 |
| naver_blog | 심화·정리형 | 21:20 |
| instagram | 업무시간 활용 장면(B2B 각도) | 09:20 또는 12:20 |
| instagram | 결과물 쇼케이스·카드뉴스 | 18:20 또는 21:20 |

- 저녁 반응이 중요한 게임·AI 친구·캐릭터 소재는 저녁 슬롯(19~22시)을 우선 제안한다.
- 위 시각은 초기 시작값이며, "4주 측정 후 조정"의 성과 데이터로 갱신한다.

### 시간대 정책의 근거 (실제 값은 `uploadPolicy.preferredHours`)

> **시각 목록도 이 문서에 적지 않는다.** 실제 `preferredHours`는 `list_keyword_profiles`로 조회한다.
> 아래는 그 값을 정할 때 쓴 **판단 근거**이며 현재 설정값이 아니다.

**근거는 AMU 자체 실측이 아니라 동종 채널의 공개 벤치마크다.** AMU 소셜 계정은 아직 표본이 부족하고, 기존 발행 시각에는 발행 크론 실행 시각의 흔적이 섞여 있어 자체 데이터로 시간대 우열을 판정할 수 없다. 그래서 **AMU와 유사한 컨셉·전략(AI 도구/SaaS·크리에이터·1인 사업자 대상)의 채널에서 일반적으로 통용되는 범위**를 채택하고, 자체 실측은 아래 "시간대별 성과 롤업"으로 쌓아 교정한다.

| 채널 | 벤치마크 근거 |
|---|---|
| threads | Threads 250만 건 분석에서 **평일 오전 6~11시가 전 구간 최고**, 저녁 18~23시는 전 요일 저조. 최고 슬롯은 목 09시·수 12시·수 09시 |
| instagram | Instagram 960만 건 분석에서 **평일 저녁 18~23시가 최고**, 오전 6~11시는 상대적으로 낮음. B2B/SaaS 각도는 평일 09~11시·13~15시 |
| linkedin | B2B 참여의 약 80%가 업무시간(09~17시)에 발생하고 **10~12시가 일일 활동의 촉발 구간**. 두 번째 피크는 15~17시 |
| naver_blog | 공개된 시간대 통계 없음. 검색 유입 채널이라 발행 시각보다 색인·품질이 지배적이므로 한국 검색 사용 패턴(출근 후·점심·퇴근 후·심야)에 맞춰 슬롯만 넓힌다 |

핵심 판단:

- **Threads와 Instagram의 최적 시간대는 정반대다.** 두 채널을 같은 시각 세트로 운영하던 기존 정책이 최소 한쪽에는 항상 불리했다. Threads는 오전으로, Instagram은 저녁으로 갈랐다.
- **Threads 저녁 슬롯을 21시에서 19시 한 칸으로 줄였다.** 기존 정책의 "저녁 슬롯(19~22시) 포함(특히 Threads)" 조항은 벤치마크와 정면으로 어긋난다. 다만 한국 사용자의 퇴근 후 이용을 완전히 배제하지 않기 위해 19시를 **검증 슬롯**으로 남긴다.
- **벤치마크는 시작값이지 정답이 아니다.** 계정 규모·니치·팔로워 시간대에 따라 최적 구간이 달라지고, 실제로 상당수 계정의 최적 시각은 권장 구간 밖에 있다. 아래 롤업으로 자체 표본이 쌓이면 그 값이 벤치마크를 대체한다.

참고 출처: Buffer(Threads 250만 건·Instagram 960만 건 분석), SocialPilot·Kanbox(LinkedIn 68만~480만 건 분석).

### 시간대별 성과 롤업 (자체 실측 축적)

`get_social_performance` 응답에 **`hourlyByChannel`**과 **`hourlyCoverage`**가 포함된다(2026-08-01 신설).

- `hourlyByChannel[]`: `channel`, `hour`(KST 0~23), **`postCount`**, `impressions`, `engagements`, `avgImpressions`, `avgEngagements`, `engagementRate`
- `hourlyCoverage`: `timeZone`, `countedPosts`(발행 시각 메타가 있어 집계된 건수), `totalPosts`
- **`postCount`가 분모다.** 기존 `topPosts`는 engagement 상위 20건만 노출해 "그 시간에 몇 건 올렸는지"를 알 수 없었고, 그래서 시간대별 평균 비교가 성립하지 않았다. 이 롤업이 그 결손을 메운다.
- 판정 기준: 한 시간대의 `postCount`가 **5건 미만이면 판정하지 않는다.** 4주 리뷰에서 `postCount` 5건 이상인 슬롯끼리만 `avgImpressions`·`engagementRate`를 비교하고, 하위 슬롯을 벤치마크 밖 후보로 교체한다.
- `hourlyCoverage.countedPosts / totalPosts` 비율이 낮으면 발행 시각 메타 누락을 먼저 확인한다. 비율을 보지 않고 시간대 순위를 읽지 않는다.

### 추천 시간대 순환 배정 계약

`recommendedHour`는 채널 단위 **순환 커서**로 배정한다. 날짜가 바뀌어도 커서가 이어지고, 같은 날 이미 사용한 시간만 건너뛴다.

- **일 cap은 발행량만 제한하고 시간대 후보 수를 제한하지 않는다.** 이전 구현은 "그 날짜의 몇 번째 배정인가"를 그대로 시간 배열 인덱스로 썼기 때문에, 일 cap보다 뒤에 있는 시간대가 영구히 선택되지 않았다(threads 19·21시, linkedin 12·17시, naver_blog 18시).
- **이미 예약된 job의 `recommendedHour`는 정책 첫 슬롯이 아니라 실제 예약 시각(KST)**이다. 그 시각이 정책 `preferredHours`에서 빠져 있어도 `allowedHours`에 합집합으로 포함해 재예약이 `publish_hour_not_allowed`로 막히지 않게 한다.
- 정책에 시간대를 추가하는 것은 발행량 증가가 아니다. 슬롯 수는 **순환 다양성**을, 일/주 cap은 **발행량**을 담당한다.

## Web/MCP 예약 발행 연동 (추천일 + publishHour)

Marketing Ops의 `마케팅 적합도 기준 > 채널별 추천 업로드 정책`을 실행 정책의 단일 출처로 사용한다. 추천일은 현재 화면의 검색·상태·채널·기간 필터나 페이지 순번이 아니라, 유니버스별 **검수/발행(`waiting_review`) 전체 큐의 생성 순서**와 이미 예약된 슬롯을 기준으로 계산한다. 따라서 같은 큐 상태와 정책 버전에서는 필터를 바꿔도 같은 콘텐츠의 추천일이 변하지 않는다.

`list_jobs`는 하위 호환용 `recommendedUploadDates`와 함께 `recommendedUploadSchedules`를 반환한다. 각 항목에는 `date`, `recommendedHour`, `allowedHours`, `policyVersion`, `recommendationToken`이 포함된다. Web UI와 MCP는 날짜나 분을 자체 확정하지 않고 `publishHour`와 추천 토큰을 서버에 전달하며, 서버가 최신 정책/추천을 재계산한 다음 10~30분 사이의 분을 한 번만 선택한다.

> **적용 대상**: 아래 절차는 **사용자와 Web UI**가 수행한다. 에이전트는 1번(추천값 조회)과 2번(콘텐츠 타입에 맞는 시각 판단)까지만 하고 **3번 예약 호출을 실행하지 않는다**(2026-08-05 개정, Charter §10.1). 에이전트는 판단한 채널·날짜·시를 보고에 적어 사용자가 확정하도록 넘긴다.

예약 절차:

1. 같은 MCP 세션에서 `list_jobs`를 먼저 호출하고 대상 job/channel의 `recommendedUploadSchedules`를 확인한다.
2. `allowedHours` 안에서 콘텐츠 타입에 맞는 `publishHour`를 고른다. 운영자가 정책에 시간을 추가하면 0~23시 범위를 사용할 수 있다.
   - **서버가 준 `recommendedHour`를 관성적으로 그대로 쓰지 않는다.** `recommendedHour`는 채널 순환 커서가 고른 값이고, 콘텐츠 타입과 시각을 맞추는 판단은 에이전트 몫이다. 같은 사이클에서 여러 건을 예약할 때 `allowedHours`의 한 값에 몰아넣지 말고 위 콘텐츠 타입표에 따라 분산한다.
   - 이미 예약된 job이면 `recommendedHour`가 **현재 예약된 실제 시각**이다. 값을 바꾸지 않고 그대로 두면 기존 예약이 유지된다.
3. `apply_channel_action(jobId, channel, channelAction, publishHour=N)`로 예약한다. MCP는 캐시한 `recommendationToken`을 함께 전달하고 서버는 이를 최신 계산 결과와 대조한다.
4. 응답의 `scheduledPublishAt`(추천 예약 시각)을 확인해 사용자에게 보고한다.

규칙(fail-closed):

- `publishHour`를 쓰려면 **같은 MCP 프로세스에서 `list_jobs` 선행 호출**이 필수다. 추천 토큰이 없거나 정책/큐가 바뀌어 토큰이 오래되었으면 `recommendation_stale`로 차단하고 `list_jobs`를 재호출한다.
- `publishAt`(직접 ISO)과 `publishHour`는 **동시 전달 금지**(모호성 오류). 추천일 흐름은 `publishHour`, 수동 지정은 `publishAt` 중 하나만 사용한다.
- 추천 시각이 이미 지났으면 서버가 다음 날 같은 시간으로 이동한다. 이후 고도화에서 휴일/최소 간격을 엄격히 적용할 수 있으므로 응답의 최종 `scheduledPublishAt`을 단일 사실로 사용한다.
- 추천일은 과도한 연속 업로드를 피하기 위한 마케팅 지원 가이드이며 자동 발행 승인이 아니다. 로컬 MCP 작업은 독립 오탈자 검수 통과 원칙을 유지하고, Web UI 작업은 필요 시 `AI 검수 및 수정`을 선택 실행한다.
- 배포/재시작 순서: node-app 배포 → MCP 세션 재시작. `recommendedUploadSchedules` 또는 추천 토큰이 없으면 `publishHour` 예약이 fail-closed로 차단된다.

## cap 조정 정책 (2026-08-01 개정 — 총량 동결 폐지)

기존에는 "4주간 주간 총량을 고정한다"는 하드 동결 조항을 뒀다. 이 방식은 **소재 공급과 마케팅 상황이 바뀌어도 슬롯을 못 옮기게 만들어**, 실제로 2026-07-30·07-31 두 차례 연속으로 "동결과 충돌하지 않는 우회 수단"을 따로 만들어야 했다. 동결을 폐지하고 **판단 기준과 기록 의무**로 대체한다.

### 상시 불변식 (항상 성립해야 함)

앞의 "문서가 강제하는 것 — 수치가 아니라 관계"와 동일하다. `scripts/marketingUploadPolicyContract.test.ts`가 검사하며, **cap 변경 시 이 테스트를 먼저 통과시킨다.**

### 조정 트리거

| 방향 | 조건 | 조치 |
|---|---|---|
| 축소 | 게시량↑ + 게시물당 성과 30%↓ + 전체 성과 10~15% 미만↑ | 해당 채널 일 cap 1단계 축소 |
| 축소 | 채널 계정에 스팸·도달 제한 신호 | 즉시 축소 후 원인 규명 |
| 확대 | 특정 채널 pending이 주간 cap의 2배 이상 적체 **그리고** 최근 4주 게시물당 성과 하락 없음 | 일 cap 1단계 확대 후 공식으로 주간 cap 재산출 |
| 유지 | 게시량↓ + 성과 유지/증가 | 낮은 cap 유지 |
| 한시 상향 | 캠페인·출시·시즌 등 마케팅 사유 | **기간·사유·복귀일을 명시**한 sprint로 운영하고 종료일에 자동 복귀 |

### 절차

- 변경은 `update_upload_policy`(`expectedVersion` 필수)로 반영하고, **변경 일자·사유·근거 수치를 보고서와 `.agent/logs/`에 남긴다.** 근거 없는 변경과 상시 잦은 변경은 금지한다.
  > **변경 후 값을 이 문서에 다시 적지 않는다.** 적는 순간 원장이 둘이 되고 드리프트가 재발한다(ADR #19). 이 문서에는 "왜 바꿨는가"만 남기고 "얼마인가"는 `uploadPolicy`가 갖는다.
- 성과 판정에는 **시간대별 롤업의 `postCount` 5건 이상** 슬롯만 사용한다. 표본 부족 구간으로 cap을 움직이지 않는다.
- naver_blog Phase 승급(일 cap 1 → 2 → 3+)은 여전히 **사용자 수동 변경 사항**이다. 이 조정 정책이 Phase 승급을 자동화하지 않는다.
- 채널 간 슬롯 재배분(총량 보존)은 별도 승인 없이 위 트리거만으로 수행할 수 있다.

### 변경 이력

> **아래 수치는 과거 기록이며 현재 설정값이 아니다.** 현재 cap은 `list_keyword_profiles`의 `uploadPolicy`에서만 읽는다.
> 이 절의 숫자를 판정 근거로 인용하지 않는다.

- **2026-08-06 cap SSOT 이관(사용자 지시, ADR #19)**: 채널별 일/주 cap 수치를 이 문서와 에이전트 룰에서 제거하고 Marketing Oops `settings.marketingCriteria.uploadPolicy`를 단일 출처로 확정. 소셜 생성 사이클마다 `list_keyword_profiles`로 조회하고 실패 시 fail-closed.
  - 근거: 2026-08-06 실측에서 문서값(threads 2/2/14)과 `uploadPolicy` v9 실제값(threads 4/2/24)이 어긋났다. 두 원장이 존재하는 한 같은 사고가 반복된다.
- **2026-08-01 요일 커버리지 정합 개편(사용자 지시)**: 주간 총량 20 → 38. `threads 2/1/6 → 2/2/14`, `instagram 2/1/4 → 2/1/12`, `linkedin 1/0/5 → 1/0/5`(불변), `naver_blog 1/0/5 → 1/1/7`.
  - 근거: 기존 값은 전 채널에서 `weeklyCap < weekdayDailyCap×5 + weekendDailyCap×2`였다. threads는 평일 2×5 + 주말 1×2 = 12건을 쓸 수 있는데 주간 6에서 먼저 막혀 **주 3일치를 쓰면 나머지 요일이 통째로 버려졌다.** 2026-08-01 실측에서 threads 대기 5건이 08-03~08-05에만 배정되고 08-06(목)·08-07(금)이 건너뛰어져 다음 주 08-10으로 밀렸다.
  - threads 주말 cap 1 → 2: Threads는 주말 발행이 정상 동작하는 채널이고, 기존 주말 1은 주간 cap 소진 때문에 실제로는 거의 사용되지 못했다.
  - naver_blog 주말 cap 0 → 1: 검색 유입 채널이라 요일 영향이 작다. **일 cap 1은 불변**이므로 몰아쓰기 금지 원칙과 충돌하지 않는다.
  - linkedin은 변경 없음. B2B는 토·일 참여가 사실상 없어 `weekendDailyCap = 0`이 정상값이고, 이미 공식(1×5 + 0×2 = 5)을 만족한다.
  - **cap은 상한이지 목표가 아니다.** 총량 38은 "주당 38건을 발행한다"가 아니라 "소재가 있으면 요일 누락 없이 소진할 수 있다"는 뜻이다. 실제 발행량은 소재 공급과 Pre-Fit 게이트가 결정한다.
- **2026-08-05 에이전트 예약 실행 권한 철회(사용자 지시)**: 에이전트 종료 지점을 검수 대기(`waiting_review`) + 발행일 제안으로 고정하고, `apply_channel_action`의 예약·완료·발행 액션 호출을 금지했다. 2026-07-31에 열었던 "예약 등록 범위 한정 완화" 조항을 철회한다.
  - 근거: 예약 실행 경로가 채널마다 다르게 동작한다. `linkedin`(2026-08-01, uq-20260716-001)은 `complete` + `publishAt`이, `naver_blog`(2026-08-05, 동일 채널의 한 콘텐츠 항목)는 `complete` + `publishHour`가 예약 대신 **즉시 발행 처리로 기록**됐다. 두 건 모두 MCP 응답 상단은 예약 성공으로 표시했으나 channel log의 `scheduledPublishAt`이 빈 값이었고, 에이전트가 되돌릴 안전 절차가 없다.
  - Charter `charter-v1.5` §7.1에 상위 규칙을 반영했고 본 문서는 그 하위 절차다.
- **2026-07-31 대기 큐 등록 게이트 신설(사용자 지시)**: 슬롯 경쟁 시 큐에 들어갈 자격을 퍼널 P0/P1(현행 R0/R1) + Pre-Fit 18점 이상으로 제한. D+5 창은 **빈 슬롯을 찾는 장치**, 이 게이트는 **슬롯이 없을 때 무엇을 포기할지 정하는 장치**이며 순서는 D+5 창 배정 → 실패 시 게이트 판정이다.
- **2026-07-31 선행 생성·예약 등록(D+5 창) 신설(사용자 승인)**: cap 집계 기준을 생성일 → 발행 예정일로 변경해 D+1~D+5의 빈 슬롯을 같은 사이클에서 채운다.
- **2026-07-30 유휴 슬롯 재배분(사용자 승인)**: `threads 8 → 6`, `linkedin 3 → 5`. 당시 pending 분포가 linkedin 9 / instagram 9 / naver_blog 6 / threads 0이라 배분이 병목이었다. **이때 내린 threads 6은 소재 부족이 근거였고 성과 저하가 아니었다** — 2026-08-01 개편에서 이 전제가 해소돼 되돌렸다.
- **2026-07-29 테스트 스케줄 상향(사용자 승인)**: 주간 총량 11 → 20. 이전 값(threads 1/5, linkedin 1/1, naver_blog 1/3, instagram 1/2)은 소진 속도 부족으로 대기 큐가 51건까지 적체돼 있었다.

- 주간 점검과 정책·Marketing Ops 설정 동기화 절차는 `social_marketing_weekly_review.md`를 따른다.

## 연계 문서

- `channel_fit_scoring.md`(Pre-Fit 게이트), `content_production_workflow.md`(산출물·QA 게이트), `naver_blog_content_strategy.md`(네이버 발행 리듬), `refs/marketing-guide/Social_channel_전략.md`(채널 역할)
