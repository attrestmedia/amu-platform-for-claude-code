---
paths:
  - "src/consts/**/*.ts"
  - "src/utils/**/*.ts"
  - "src/libs/**/*.ts"
  - "src/app/api/**/*.ts"
---

# 가변 상수는 저장된 데이터로 둔다 (Runtime-Configurable Constants)

## 원칙

**불변성이 성립하지 않는 값을 코드에 상수로 박지 않는다.**
운영 중에 조정될 수 있는 값은 **DB에 저장하고 어드민 화면에서 UI로 갱신**할 수 있어야 한다.

코드의 상수는 **폴백 기본값**이지 운영값이 아니다.

> **예외 — AI 모델·가격은 승인 manifest가 소유한다 (§5).** 생성 모델 목록·기본/선택 모델·reasoning·요청 플래그·판매가·원가는
> 가변 축에 해당하더라도 DB + 어드민 UI로 옮기지 않는다. 버전 관리되는 manifest와 그 codegen 산출 상수가 운영값이며,
> 런타임 DB에는 **끄기 전용 비상 차단**만 둔다. 판정 전에 §5 대상인지 먼저 확인한다.

## 1. 판정 — 이 값을 하드코딩해도 되는가

착수 전에 아래로 판정한다. **가변 축에 하나라도 해당하면 저장된 데이터로 옮긴다.**

### 가변 (→ DB + 어드민 UI)

- 값을 바꿔도 **로직·타입·계약이 그대로**다. 숫자/문자 하나만 달라진다
- "상황에 따라 올리거나 내릴 수 있다"는 말이 자연스럽다
- **품질 · 비용 · 지연시간의 트레이드오프**를 담는다
- 외부 프로바이더의 정책·모델 세대 변화에 따라 다시 조정된다
- 운영자가 장애·부하·예산 상황에서 즉시 바꾸고 싶어할 수 있다

```ts
// 가변의 전형 — 프로바이더 정책이 바뀌면 재조정 대상이고, high로 올릴 여지가 있다
export const ZAI_REASONING_EFFORT = "low" as const;   // ← 하드코딩 금지 대상
// 단 모델별 reasoning 값은 §5 대상이다 — 손으로 쓴 상수도 DB도 아니고 manifest `reasoning` 필드로 옮긴다
```

이런 값이 코드에 박혀 있으면 조정할 때마다 **코드 수정 → 리뷰 → 빌드 → 배포**가 필요하다.
운영 판단을 배포 주기에 묶는 것이 이 규칙이 막으려는 상태다.

### 불변 (→ 하드코딩 유지)

- **외부 규격·프로토콜이 정한 값** — HTTP 상태코드, 1초 = 1000ms, MIME 타입
- **로직의 정의 그 자체** — 배열 인덱스, 정규식, 파싱 구분자
- 바꾸면 **타입·스키마·마이그레이션이 함께 바뀌는 값** — enum 멤버, DB 필드명, 스키마 버전, setting key 이름
- 값을 늘어놓은 것이 아니라 **분류 체계**인 것 — `SERVICE_KEYS`, `AI_PROVIDER_TYPES`

값이 두 성격을 겸하면 **분리한다.** 분류 체계는 코드에, 조정 가능한 수치는 DB에 둔다.
`SERVICE_DEFINITIONS`(코드 정의) + `defaultEnabled`(코드 기본값) + 실제 ON/OFF(DB)가 그 예다.

### 낮추면 위험한 값

최소 키 길이·해시 라운드·rate limit 하한처럼 **낮추는 방향이 곧 취약점**인 값은,
DB로 옮기더라도 **코드에 하한을 두고 clamp**한다. 어드민에서 하한 아래로 내려갈 수 있으면 안 된다.

## 2. 환경변수와의 경계

셋을 혼동하지 않는다.

| 성격 | 저장처 | 예 |
| --- | --- | --- |
| 시크릿 · 엔드포인트 · 배포 환경차 | **환경변수** | API 키, DB URL, origin |
| 빌드 시점에 구워지는 값 | **환경변수** (`monorepo-env.md` 참조) | `next.config.mjs`가 읽는 값 |
| 운영 중 사람이 조정하는 정책 · 튜닝 값 | **DB + 어드민 UI** | 노출 ON/OFF, 임계값 |
| AI 생성 모델 · 가격 · 모델별 reasoning | **승인 manifest + codegen** (§5) | 모델 목록, default/fallback, reasoning, 판매가·원가 |

운영자가 **재배포 없이** 바꿔야 하는 값이면 환경변수가 아니라 DB다.
환경변수 변경도 컨테이너 재시작을 요구하므로 운영 조정 수단이 아니다.

## 3. 필수 구조 (4계층)

기존 `service availability` 구현이 참조 구현이다. **새 저장소나 새 패턴을 만들지 않는다.**

```text
① consts/<domain>/<name>.ts
   SETTING_KEY · 코드 기본값(DEFAULT_*) · 타입 · normalize<Name>()

② libs/database/system/systemSettingRepo.ts        (이미 존재 — 재사용)
   getSystemSetting<T>(key) / setSystemSetting({ key, value, description, updatedBy })

③ libs/server-utils/<domain>/<name>.ts
   서버 권위 조회 + 저장. 조회 실패 시 코드 기본값으로 폴백하고 error 로그를 남긴다

④ app/api/admin/<name>/route.ts  +  components/module/admin/**/<Name>Panel.tsx
   requireAdmin · 입력 검증 · 변경 사유 필수 · createSystemControlAudit로 before/after 스냅샷
```

참조 구현:

```text
consts/system/serviceAvailability.ts
libs/database/system/systemSettingRepo.ts
libs/server-utils/system/serviceAvailability.ts
app/api/admin/service-availability/route.ts
components/module/admin/system/ServiceAvailabilityPanel.tsx
components/module/service/ServiceAvailabilityProvider.tsx     ← 클라이언트 소비가 필요할 때
models/system/SystemControlAuditSchema.ts
```

### 계층별 계약

- **코드 기본값은 반드시 남긴다.** DB가 비어 있거나 조회에 실패해도 서비스가 동작해야 한다
- **normalize를 통과하지 않은 저장값을 그대로 쓰지 않는다.** DB 값은 신뢰할 수 없는 입력으로 취급한다
- **읽기는 서버에서 한다.** 클라이언트가 setting을 직접 조회하지 않고 서버가 주입하거나 전용 공개 endpoint를 둔다
- **쓰기는 어드민 API 하나로 모은다.** 여러 경로에서 같은 key를 쓰지 않는다
- **변경 사유(`reason`)를 필수로 받고 감사 로그를 남긴다.** 누가·언제·무엇을·왜 바꿨는지 남지 않는 설정 변경은 만들지 않는다

### 폴백 방향

- 기본은 **fail-safe** — 조회 실패 시 코드 기본값으로 계속 동작한다
- 단 **경제 · 규제 · 권한** 축의 값은 `server-economy-security.md` · `compliance-guardrails.md`에 따라
  **fail-closed**다. 조회 실패 시 허용이 아니라 차단으로 떨어진다

### 조회 비용

요청당 1회 수준이면 매번 조회해도 된다. 루프·스트리밍 청크마다 조회하는 hot path라면
**요청 스코프에서 한 번 읽어 전달**한다. 전역 캐시를 새로 만들기 전에 실제 호출 빈도를 먼저 측정한다.

## 4. setting key 규칙

형식은 `<domain>.<name>.v<N>` — 예: `platform.service-availability.v1`.
소문자·숫자·하이픈만 쓰고 `.`으로 구분하며 마지막 조각은 반드시 `v<N>`이다.

**이 규칙은 문서가 아니라 코드가 강제한다.**

```text
consts/system/systemSettingKeys.ts
  SYSTEM_SETTING_KEY_PATTERN          형식 정규식
  assertWritableSystemSettingKey()    쓰기 시점 강제

libs/database/system/systemSettingRepo.ts
  setSystemSetting()이 위 assert를 먼저 통과한다
```

- key 문자열은 **`consts/system/systemSettingKeys.ts` 또는 도메인 consts에만 정의**하고 리터럴을 여러 곳에 적지 않는다
- 저장 구조를 바꿔야 하면 **key 버전을 올린다.** 기존 key의 값 모양을 조용히 바꾸지 않는다

### 규칙 이전 key를 만나면

**key는 운영 DB 문서의 식별자다.** 문자열을 바꾸면 기존 문서가 고아가 되고,
그 값을 읽던 코드는 오류 없이 조용히 기본값으로 떨어진다. 그래서 **개명하지 않는다.**

1. 상수 이름과 주석으로만 legacy임을 표시한다 (예: `LEGACY_*_KEY`)
2. 허용 목록을 두어 **읽기는 허용하고 쓰기는 거부**한다. 기존 값은 계속 읽히면서
   그 형식의 새 문서가 생기는 것은 막힌다
3. 정리는 개명이 아니라 **읽기 경로 제거**다. 그 값이 실제로 읽히는 경로가 남아 있는지 먼저 확인한다
4. 그럼에도 key 문자열을 옮겨야 한다면 **데이터 마이그레이션을 동반한 별도 작업**이다.
   운영 DB 쓰기이므로 사용자 승인과 dry-run·롤백이 필요하다. 코드만 바꾸는 개명은 금지한다

읽기 경로를 걷어내도 되는지는 **문서 존재 여부가 아니라 도달 가능성**으로 판정한다.
값이 병합·fallback에 쓰인다면, 그 fallback에 실제로 도달하는 대상이 남아 있는지 확인한다.

> 2026-09-01 사례: `gen_studio_model_controls`는 쓰기 경로가 하루만 존재했고,
> 그 시점 모델 27개 중 24개가 이후 모델 맵에서 사라져 병합 대상이 아니었다.
> 남은 8개는 카탈로그 문서가 있어 fallback에 도달하지 않았고, 운영·로컬 모두 확인 후 읽기 경로를 제거했다.
> 이때도 운영 DB 문서는 삭제하지 않았다 — 읽는 코드가 없으면 무해하다.

## 5. 예외 — 승인 manifest가 소유하는 AI 모델·가격 (2026-09-30 신설)

근거: `.agent/todo-ledgers/in-progress/todo-ai-model-ssot.json`(AI 모델·가격 SSOT — 단일 manifest 기반 모델 관리 체계 전환),
로드맵 보고서 `.agent/docs/project/2026/09/20260930_085814__ai-model-ssot-roadmap.md`, 계약 사이클 SSOT-100.

AI 모델·가격 값은 §1의 가변 축에 해당한다. 그런데도 DB + 어드민 UI로 두지 않는 이유는 그 값이 **과금·공개 범위·권한 경계를 직접 바꾸기** 때문이다.
어드민 화면의 쓰기 한 번으로 가격·default·capability가 바뀌면 리뷰·계약 테스트·parity 검증을 우회한다(`server-economy-security.md`).
그래서 이 값은 **"저장된 데이터"를 DB가 아니라 버전 관리되는 승인 manifest로 둔다.** 배포 주기에 묶이는 것은 의도된 게이트다.

### 대상 — manifest 소유 (DB + 어드민 UI로 옮기지 않는다)

- 생성 모델(text·image·video·audio)의 식별자·upstream ID·status·modality별 launchState/selectable/routable·capability·limits·요청 플래그·reasoning
- 판매가·provider 원가·벤더 정가·유효기간과 revision(manifest·판매가·원가 3종)
- 기능별 모델 선택 `roles`(default·fallback·allowlist·`routing`·`internalTools`)
- `voices[]`, 미디어 실행 경로 `executionRoutes[]`, 승인 예산 상한 `budgets`

manifest 파일과 codegen 산출물 경로·필드 명세는 SSOT 원장 `sharedContracts.manifestSchema`가 정본이다. 이 룰에 복제하지 않는다.

### manifest 값의 계층 (§3 4계층을 대체한다)

```text
① manifest (YAML + JSON Schema)          정본. 사람이 리뷰된 커밋으로만 바꾼다
② codegen 산출 TS (generated, git 포함)   운영값. 사람이 편집하지 않는다. --check 로 드리프트 차단
③ 손으로 쓴 코드                          provider 어댑터 · 과금 산식 · 안전 불변식 · resolver 만
④ 런타임 DB                              끄기 전용 비상 차단 · 원자 예산 ledger · job 가격 snapshot · 관측
```

- **생성 상수는 폴백 기본값이 아니라 운영값이다.** 이 절의 대상에는 "코드 기본값 + DB 운영값" 병합을 만들지 않는다.
- 모델·가격을 **손으로 쓴 TS 상수로 새로 추가하지 않는다.** manifest 도입 전(SSOT-101 완료 전)에는 기존 정의 파일에만 추가하고, 도입 후에는 manifest에만 추가한다.

### 런타임 DB에 허용되는 것 — 끄기 전용 비상 차단

§3 4계층 구조(`systemSettingRepo` 재사용·서버 권위 조회·어드민 API 하나·사유 필수·감사 로그)는 그대로 따르되, 의미는 아래로 제한한다.

- **끄기만 한다.** manifest에서 비활성·candidate·비선택인 것을 켜거나, 가격·default·capability·허용 caller를 바꾸거나, 예산 상한을 올리는 DB 쓰기를 만들지 않는다.
- **만료 시각과 사유가 필수다.** 만료되면 자동으로 manifest 상태로 복귀한다.
- **폴백은 fail-closed다.** 차단 설정을 읽지 못하면 코드 기본값으로 허용하지 않고 `SYSTEM_CONTROL_UNAVAILABLE`/503으로 차단한다(§3 "폴백 방향"의 경제 축 규칙).
- 전파 지연 상한은 60초다(캐시 TTL).
- 에러 코드·저장소·setting key는 SSOT 원장 `sharedContracts.catalogRuntimeApi`·`emergencyDisable`이 정본이다.

### 이 절이 바꾸지 않는 것

- **다른 소유 경계의 런타임 제어** — JEV `jevRuntimeControls`·`modelPin`(JEV 원장 소유, INV-4)과 speech 예산 guard(TGI 소유)는 이 절의 대상이 아니다. 단 ElevenLabs 미디어 라우팅의 런타임 제어(`mediaRoutingRuntimeControls`)는 이 절을 따라 끄기 전용이다 — 켜기·owner 추가·예산 상향은 manifest 커밋으로만 한다.
- **모델·가격이 아닌 AI 튜닝 값**(timeout·재시도·rate limit 등)은 기존 §1~§4를 그대로 따른다.

### 전환 기간

기존 `SystemModelCatalog`·`SystemPricingCatalog` DB 병합과 어드민 쓰기 경로는 SSOT-106(런타임 절단) 전까지 남아 있다.

- 그 경로를 **확장하지 않는다** — 새 필드·새 쓰기 API·새 병합 대상을 추가하지 않는다.
- 컬렉션은 drop 하지 않고 SSOT-112에서 쓰기 동결·아카이브한다(§4 "규칙 이전 key를 만나면"과 같은 이유).
- 모델·가격 읽기 GET/MCP는 컬렉션이 비면 bootstrap upsert를 하므로, 운영 DB 실측에 쓰지 않는다(SSOT-102 전용 read-only 경로).
