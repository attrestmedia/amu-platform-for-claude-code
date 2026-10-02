# Measurement & Conversion Rules (측정/전환 추적 실행 절차)

> **정본은 `.agent/amu-platform-guide/MEASUREMENT-PLAN.md`다.**
> KPI 계층·이벤트 스펙·UTM 규약·GA4 설정 정의는 그 문서에만 존재한다.
> **본 문서는 조회 절차와 도구 사용법을 담당**하며, 충돌 시 MEASUREMENT-PLAN이 우선한다.

## 목적

콘텐츠·광고·전환 실험의 학습 데이터가 유실되지 않도록 **조회·수집 절차**를 고정한다.
**측정 정의 없이 광고 집행·전환 실험을 제안하지 않는다** (Week 0 원칙).
집중 스프린트 등 대량 발행 실험의 착수 조건은 Charter §8.3을 따른다(계측이 끊긴 기간의 발행분은 `pre_measurement`로 분리).

## GA4 실측 선조회 (마케팅 전략 설계 전 필수)

전략·캠페인·슬롯 설계를 **캡처 이미지나 과거 보고서의 수치로 시작하지 않는다.** 착수 시점에 `marketing-ops` MCP로 GA4 설정과 수집 상태를 직접 조회하고, 그 응답을 근거로 설계한다. 조회하지 않고 세운 목표치는 근거 없는 수치(Charter §9.4)로 취급한다.

### 절차

1. `get_ga_configuration({ universeId: "amu", propertyIds: ["311756914", "488820875"], eventLookbackDays: 28 })`
   - 읽기 전용이며 provider quota를 소비하지 않는다. Measurement Protocol secret·접근 권한 목록은 응답 범위 밖이다.
   - `deniedPropertyIds`가 비어 있지 않으면 OAuth 재연결이 필요한 상태다. 추정으로 메우지 말고 재연결을 요청한다.
2. 응답의 `properties[].readiness`로 게이트를 판정한다.
   - `readyForConversionAnalysis=false` → 전환 판정형 실험·광고 집행 착수 금지 (Week 0 원칙).
   - `readyForPromoReporting=false` → 슬롯 A/B 승자 확정 금지. 폴백 렌더와 초안 작성까지만 진행한다.
   - `requiredKeyEvents[].configurationStatus`(설정 여부)와 `collectionStatus`(실제 수집 여부)를 **구분해서** 읽는다. 설정만 되고 수집이 없는 상태를 "정상"으로 보고하지 않는다.
3. `crossProperty.continuityStatus`로 매거진↔앱 연속성을 확인한다.
4. 저장된 성과가 필요하면 `get_marketing_performance`, 신규 수집이 필요하면 `collect_ga_snapshots`를 이어서 호출한다. 슬롯별 노출·클릭은 `get_marketing_performance(view="promo_performance")`이며 맞춤 측정기준 등록 후에만 유효하다.
5. 조회 결과 중 판단 근거로 쓴 수치는 **조회 일자와 함께** 보고서·원장에 남긴다. GA는 기간이 흐르면 같은 쿼리도 다른 값을 준다.

### 속성 인벤토리 (조회 기준 2026-07-29)

| 속성 | Property ID | Measurement ID | 시간대 | 이벤트 보존 |
| --- | --- | --- | --- | --- |
| 매거진 `allmyuniverse.com` | `311756914` | `G-GDDRCRXCLD` | Asia/Seoul | 14개월 |
| 앱 `app.allmyuniverse.com` | `488820875` | `G-R59CLP4F6R` | America/Los_Angeles | **2개월** |

### 구조적 제약 (설계 시 반드시 반영)

- **매거진과 앱은 서로 다른 속성이고 Measurement ID도 다르다**(`continuityStatus=multiple_measurement_ids`). 크로스 도메인 설정으로 하나의 퍼널이 되지 않는다. 매거진 세션 → 앱 전환을 단일 속성 퍼널로 그리지 말고, **전환 판정은 앱 속성의 절대 건수**로 하고 매거진 속성은 유입·노출 진단에만 쓴다.
- **두 속성의 시간대가 다르다.** 일별 지표를 나란히 놓으면 최대 하루가 어긋난다. 일 단위 비교가 필요하면 기준 시간대를 명시하고, 어긋남을 보정하지 않은 비교는 "추정"으로 표기한다.
- **앱 속성의 이벤트 보존이 2개월이다.** 1~2주 캠페인 회고는 가능하지만 분기·연간 비교는 성립하지 않는다. 장기 추세가 필요한 지표는 GA 조회에 의존하지 말고 `marketing_performance_daily` 스냅샷 적재분을 근거로 쓴다.
- 매거진 속성의 `page_view / totalUsers`가 1에 가까우면(2026-07-29 조회 시 25,678 / 24,075 = 1.07) 비인간 트래픽이 지표를 지배하는 신호다. 이 상태의 CTR·조회수는 승격·폐기 판정 근거로 쓰지 않는다.

## GA4 이벤트 · UTM — 정의는 MEASUREMENT-PLAN

**이벤트 스펙과 UTM 규약의 정본은 `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §3·§6이다.** 여기에 복제하지 않는다.

2026-08-06 개정 요지(전체 목록은 정본 참조):

- **관계 행동 이벤트 10종이 신설**됐다 — `content_save`, `topic_follow`, `continue_reading`, `newsletter_subscribe`, `article_share`, `signup_complete` 등. 현재 매거진 속성에 이 계열이 **0종**이라 새 지표를 측정할 수 없는 상태다.
- 앱 진입 이벤트(`gen_studio_entry`·`tutors_entry`·`play_entry`)에 **`post_slug`·`post_id` 필수**. 기사 맥락 없는 진입은 차별점 상실 신호로 본다.
- **`magazine_return` 신설** — 앱 사용 후 매거진 복귀. L4의 핵심 지표.
- `first_generation_success`·`coin_recharge_complete`는 **L4·L5 제품·수익 지표로 강등**됐다. 마케팅 성과 판정의 1차 기준이 아니다.

## UTM 컨벤션 (요약 — 정본은 MEASUREMENT-PLAN §6)

- 광고 → 템플릿: `utm_source={naver|google}&utm_medium=cpc&utm_campaign=genstudio_template&utm_content={template_key}`
- 기사 → 앱 CTA: `utm_source=blog&utm_medium=article_cta`
- 매거진 프로모션 슬롯 → 앱: `utm_source=magazine&utm_medium=promo_slot&utm_campaign={campaignId|evergreen}&utm_content={slotId}__{creativeId}`
- 소셜 → 앱/기사: `utm_source={threads|linkedin|instagram}&utm_medium=social`
- 네이버 블로그 → 앱/기사: `utm_source=naver_blog&utm_medium=owned-media` (node-app `MARKETING_DEFAULT_UTM_MEDIUM_BY_CHANNEL` 기준)
- **캠페인 소속 콘텐츠는 `utm_campaign={campaignId}`를 반드시 부여**한다(`cmp-YYYYMM-<slug>`, 정의: Charter §8). 상시 자산은 `utm_campaign=evergreen`.
- 같은 캠페인의 채널·포맷 편차를 보려면 `utm_content`에 키를 넣는다(예: `utm_content=threads_before_after`).
- 블로그(allmyuniverse.com) ↔ 앱(app.allmyuniverse.com)은 크로스 도메인 추적 전제.
- 프로모션 슬롯은 `amu_cta_location={slotId}`를 함께 전달하고, 기사 문맥에서는 `amu_post_id`, `amu_post_slug`, `amu_template_key`를 가능한 범위에서 추가한다.

## 매거진 프로모션 보조 이벤트

- `promo_impression`: 소재가 뷰포트에 50% 이상 1초간 노출됐을 때 1회 전송한다.
- `promo_click`: 슬롯 CTA 클릭 시 전송한다.
- 공통 파라미터: `slot_id`, `creative_id`, `campaign_id`, `variant`, `cta_location`, `post_id`, `post_slug`, `template_key`.
- 보조 이벤트는 슬롯 CTR·A/B 진단용이며 핵심 전환 판정은 `first_generation_success`와 `coin_recharge_complete`를 우선한다.
- GA4에서 위 파라미터를 맞춤 측정기준으로 등록하고, 블로그↔앱 크로스 도메인과 referral exclusion을 검증하기 전에는 슬롯 승자 판정을 확정하지 않는다.

### 계측 준비도 — 스냅샷을 이 문서에 두지 않는다

**준비도 표는 조회 시점마다 달라진다. 여기에 적으면 곧 낡은 값이 된다.**
착수 시점에 `get_ga_configuration`을 **직접 조회**하고, 그 응답의 `readiness`를 그대로 판정 근거로 쓴다.

- 최신 실측 스냅샷과 수정 대상 항목은 `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §4에 있다(2026-08-06 기준: 양쪽 속성 `readyForConversionAnalysis=false`, 매거진 주요 이벤트 3종 미설정, `industryCategory` 오설정, Google Signals 불일치).
- 프로모션 맞춤 측정기준 4종(`slot_id`·`creative_id`·`campaign_id`·`variant`)을 등록하기 전에 `MARKETING_GA_PROMO_REPORT_ENABLED=true`를 켜지 않는다. 등록 없이 켜면 슬롯 리포트가 빈 차원으로 적재된다.
- 과거 보고서의 준비도 서술을 현재 상태로 인용하지 않는다.

## 판정 원칙 (2026-08-06 개정)

```text
콘텐츠·캠페인   재방문 → 관계 행동(저장·팔로우·구독) → 확장 실행 → 복귀 → 수익
광고(유료 획득)  가입 CPA → 첫 생성률 → 충전 CPA   ← 기존 순서 유지
```

- 콘텐츠·캠페인 성과의 1차 판정 지표는 **재방문과 관계 행동**이다. 클릭·CTR·노출은 진단 지표이지 판정 지표가 아니다.
- 광고는 유료 획득이므로 비용 대비 전환으로 판정하는 기존 순서를 계속 쓴다.
- 키워드/캠페인 확장은 "관계 행동 또는 전환이 발생한 항목"만.
- 근거 없는 성과 수치 생성 금지 — 실측 데이터가 없으면 "추정" 표기.
- 상세: `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §7

## 소셜 성과 스냅샷 규약

- 소셜 채널(Threads/Instagram/LinkedIn/Naver Blog) 성과는 조회 시점 API 호출이 아니라 **일별 누적 스냅샷 적재** 기준으로 판정한다 (node-app `marketing_performance_daily`, `entityType=social_post`).
- 에이전트는 marketing-ops MCP 도구를 사용한다: `get_social_performance`(조회, provider quota 미소비) / `collect_social_performance`(수집, quota 소비 — 백필 `sinceDays=60~90`, 평시 `7~14`, 사전 `dryRun=true` 스모크).
- 토큰 만료/수집 공백 기간의 일별 변화량은 복구할 수 없다 — 해당 기간의 추세 해석은 "추정"으로 표기하고, `get_token_health`로 토큰 상태를 선확인한다.
- Naver Blog는 내부 통계 API가 없으므로 발행 URL 검증 + GA4/UTM 보조 분석 기준으로만 판정한다.
- 소셜 반응(노출/반응률)은 참고 지표이며, 최종 판정은 위 "판정 원칙"의 전환 지표(가입 CPA → 첫 생성률 → 충전 CPA)를 우선한다.

## S6 Growth Mission Control 저장 분석 계약

S6의 목표는 발행량 집계가 아니라 `marketingCriteria`의 목표·전략을 `marketing_performance_daily` 저장 스냅샷과 연결해 다음 행동 초안을 만드는 것이다. 운영 화면 `/marketing-oops/workspace?tab=performance`의 S6 패널과 `GET /api/marketing/analytics/growth`는 외부 provider를 암묵적으로 조회하지 않는다.

- 검토 창은 7일(운영 확인)과 28일(패턴 확인)을 기본으로 하며, `metricBasis`, 기간, source row 수를 함께 표시한다.
- `observed`·`not_collected`·`not_observed`·`blocked_external`를 구분한다. 저장 행이 없거나 발행 로그만 있는 상태를 성과 `0`으로 바꾸지 않는다.
- Reach·Consumption·Relationship·Expansion·Business Contribution은 단일 병목이 아니라 병렬 트랙으로 진단한다. 표본이 부족하면 `Topic × Hook × Format × Channel` 승자·패자 판정을 만들지 않는다.
- `campaignId`·`sourceFingerprint`·`draftId`가 모두 확인된 경우에만 직접 귀속으로 표시하고, 나머지는 `estimated` 또는 `correlated`로 낮춘다.
- 주문·매출은 SSM-603의 Commerce API 자격증명과 법무 검토 전까지 `blocked_external`이다. 분석 원장에는 구매자 이름·전화번호·주소·이메일을 저장하지 않는다.
- 다음 행동은 `draft_only`이며, 변경하지 않을 것·근거·검토 창을 함께 제시한다. 자동 발행·예산 변경·전환/매출 예측은 이 분석 경로에서 실행하지 않는다.

## S7 상품별 광고 키워드 전략 실행 절차

S7의 실행 단위는 `상품 source snapshot·revision·campaignId → provider별 keyword plan → 사람 승인 ad draft → 저장 performance snapshot → 개선 experiment draft`다. 상품·발행·성과 원장이 비어 있어도 계획의 준비 상태를 만들 수 있지만, provider API 조회나 광고 집행을 자동으로 시작하지 않는다. 측정 정의는 정본의 [`MEASUREMENT-PLAN.md` §17](../../../../amu-platform-guide/MEASUREMENT-PLAN.md)을 따른다.

### 착수 입력

- 상품 `productId`, `channelProductNo`, `productRevision`, `sourceFingerprint`, `campaignId`, `landingUrl`을 확인하고, 상품 allowed claims와 금지·필수 disclosure를 함께 전달한다.
- `marketing_ads_policies.advertisingCriteria`의 objective·target audience·offer·measurement plan 버전을 상속한다. target audience와 offer가 없으면 `setup_required`로 멈춘다.
- seed keyword와 negative keyword를 사람 검토로 입력한다. Naver와 Google 후보·match type·metricBasis는 섞지 않는다.

### 데이터 수집과 개선

1. 먼저 provider별 plan을 `draft`로 저장하고, 검색량·경쟁·bid는 명시적 keyword planner snapshot이 있을 때만 기록한다. 없으면 수치를 만들지 않고 `not_collected`로 둔다.
2. 광고 실행은 승인 ID와 idempotency를 확인한 뒤에만 진행한다. Google은 `PAUSED`, Naver는 `USER_LOCKED`로 생성하고 활성화는 별도 사용자 승인으로 둔다.
3. 성과는 `marketing_performance_daily`의 `ad_keyword` 행을 기준으로 7일 운영 창과 28일 패턴 창을 수집한다. CTR·CPC·CVR·CPA는 유효 분모가 있을 때만 계산하고 0 conversion은 0으로 나누지 않는다.
4. 개선 결과는 `keep`·`test`·`negative_candidate`·`landing_review` 중 하나의 `draft_only` 제안으로 기록한다. 예산·입찰·키워드 확장·제외어 반영은 자동 실행하지 않는다.
5. provider `conversionValue`/ROAS는 Store 주문·매출이 아니다. Commerce API·법무 게이트 SSM-603이 해소되기 전에는 Revenue로 연결하지 않는다.

## 광고 → SEO 회수 루프

### 도구 절차 (필수)

1. `marketing-ops` `check_ads_credentials`로 Naver Ads/Google Ads 자격 증명이 살아있는지 먼저 확인한다. 실패하면 사용자에게 재연동을 요청하고 이 루프를 진행하지 않는다.
2. `collect_ads_performance`(channels: naver_ads, google_ads)로 최신 캠페인 성과를 수집한다 — 정기 수집은 7~14일 주기, 최초 백필은 dateFrom/dateTo로 60~90일 범위를 지정한다.
3. `get_ads_performance`(days)로 저장된 성과를 조회한다(외부 API 재호출 없음 — 같은 데이터를 반복 확인할 때 사용).
4. "판정 원칙"에 따라 **첫 생성 또는 충전이 발생한 캠페인/키워드**만 회수 대상으로 추린다. 클릭·노출만 높고 전환이 없는 키워드는 회수하지 않는다.
5. 회수 대상 키워드는 `{{AGENT_ROOT}}/refs/content-policy/naver_google_keyword_marketing.md`의 "키워드 검증 도구 활용" 절차로 검색량·경쟁도를 재확인한 뒤 기사 제목/구조에 반영한다 — 광고 전환은 확인됐지만 SEO 경쟁이 심하면 롱테일 파생형으로 조정한다.
6. 회수 대상 검색 의도는 다음 파생 기사 세트로 전환한다: 작성법 / 예시 10선 / 비교 / 실무 적용 / 템플릿 가이드 (의도당 최대 5종).
7. 파생 기사는 콘텐츠 우선순위 P0로 취급하고, 콘텐츠 원장(dedupeKey: `topic:<키워드>`)에 기록한다.
