# Platform Credentials (자격증명 정의·패널 규칙)

## 적용 범위

`platformCredentials` 자격증명을 **추가·수정**하거나 `/admin/credentials` 계열 **자격증명 패널 UI**를 만들고 고치는 작업.
OAuth 앱 자격증명 패널(`OAuthAppCredentialsPanel`) 등 같은 성격의 패널에도 적용한다.

---

## 1. 저장 상태 표기 (필수)

**저장된 값이 있는 필드의 placeholder는 항상 `●●●●●●●●`로 표시한다.**

```text
저장됨   ●●●●●●●●        입력하면 새 버전이 된다
미저장   "필수 값 입력"    아직 아무 값도 없다
```

- 판정 기준은 **저장 여부 하나뿐**이다. 검증 상태(`latestVerificationStatus`)나 활성 여부(`activeVersion`)를 조건에 섞지 않는다.
- `configuredFields`는 **최신 버전** 기준이므로, 저장만 하고 검증·활성화하지 않은 값도 저장됨으로 본다.
- 구현은 `src/utils/admin/platformCredentialDisplay.ts`의 `resolveCredentialFieldPlaceholder()`를 쓴다. **패널마다 조건을 다시 쓰지 않는다.**
- 마스크는 값 길이를 반영하지 않는 고정 문자열이다. 길이를 반영하면 그 자체가 정보 노출이다.
- 저장된 값의 평문을 화면·응답으로 되돌려 보내지 않는다. 마스크는 "값이 있다"는 신호일 뿐이다.

**왜 검증 상태를 섞으면 안 되나.** 검증·활성 상태는 배지와 `active vN · latest vN · CODE` 줄이 이미 전달한다.
placeholder까지 그 정보를 나르면 한 화면에서 세 곳이 같은 말을 다르게 하고, 정작 사용자가 알고 싶은
"지금 이 칸에 값이 들어 있는가"에는 아무도 답하지 않는다.

> 실제 사고(2026-08-07): 검증된 값에만 마스크를 씌우는 조건이었다. 신규 자격증명을 저장하면
> 검증 전 상태라 placeholder가 `새 버전 값 입력`으로 남았고, **미저장과 화면상 구분되지 않았다.**
> 자격증명 패널을 추가할 때마다 반복된 문제다.

---

## 2. 카테고리·정의 추가 시 함께 고칠 곳

카테고리 목록은 **단일 배열 하나**를 세 곳이 참조한다. 문자열로 복제하지 않는다.

```text
정본   types/secure/platformCredentials.ts   PLATFORM_CREDENTIAL_CATEGORIES
참조   PlatformCredentialCategory 유니온      (같은 파일에서 파생)
참조   PlatformCredentialSchema.ts            Mongoose enum
참조   PlatformCredentialsShell.tsx           CATEGORY_LABELS (라벨은 화면 문구라 별도 유지)
```

새 자격증명을 추가할 때 확인할 것:

| 대상 | 누락 시 증상 |
| --- | --- |
| `PLATFORM_CREDENTIAL_DEFINITIONS` 항목 | 화면에 카드가 없다 |
| `CATEGORY_LABELS` (신규 category일 때) | **섹션이 통째로 렌더되지 않는다** — `Object.keys()`로 그룹을 만들기 때문 |
| `PLATFORM_CREDENTIAL_CATEGORIES` (신규 category일 때) | **저장 시 Mongoose `ValidationError` → 500 "서비스 처리 중 오류가 발생했습니다"** |
| `platformCredentialVerifier` case | `switch`가 비망라가 되어 **typecheck 실패** (default가 없다) |

세 번째와 네 번째는 화면에서 원인이 드러나지 않는다. 섹션은 정상 렌더되고 입력도 받아지므로
프런트 문제로 보이지만 실패 지점은 DB 저장이다.

---

## 3. 검증(verify) case 작성 규칙

- **자격증명 문제와 IP 문제를 다른 코드로 구분한다.** 뭉뚱그리면 IP 미등록일 때 멀쩡한 키를 재발급하게 된다.
  예: `UPBIT_IP_NOT_ALLOWED` vs `UPBIT_INVALID_KEY`, `TOSS_IP_NOT_ALLOWED` vs `TOSS_INVALID_CLIENT`
- 검증은 **조회 전용 엔드포인트**를 쓴다. 주문·결제·삭제 등 부수효과가 있는 경로를 검증에 쓰지 않는다.
- **토큰을 발급하는 검증은 토큰 캐시와 결합점을 만든다.** "유효 토큰 1개" 전제를 가진 provider는
  검증이 기존 토큰을 무효화하므로, 토큰 매니저가 있으면 발급분을 캐시에 기록해야 한다.
  결합점을 만들 때는 코드 주석과 대응 TASK 양쪽에 남긴다.
- 활성화(`activate`)는 **최신 버전의 검증이 valid일 때만** 가능하다 — 서버
  `libs/database/secure/platformCredentials.ts`의 `activatePlatformCredential`과 패널 `canActivate`가 함께 강제한다.
  검증을 호출하지 않는 verifier(예: 과금 미확인 보류 코드)는 곧 활성화 불가를 뜻한다(2026-09-26 JEV-101 실측).

### 3.1 모델 조회와 자격증명 검증의 분리 — QwenCloud (2026-09-27)

- `GET /models`는 **제공자가 공식 지원할 때만** 키 검증에 쓴다. OpenAI 호환 프로토콜이라는 이유만으로 모델 목록 API를 가정하지 않는다. QwenCloud의 호환 endpoint는 `GET /models`를 제공하지 않는다([공식 연동 문서](https://docs.qwencloud.com/developer-guides/clients-and-developer-tools/deepseek-harness)). 공개 모델 문서 수집은 tracker의 책임이며 특정 계정의 키 유효성·모델 접근권한을 증명하지 않는다.
- 공식 비과금·조회 전용 검증 endpoint가 확인되지 않은 자격증명은 암호화해 `pending`으로 저장하되 검증 상태를 `unverified`로 유지한다. `invalid`는 명시적 인증 실패 근거가 있을 때만 쓴다. verify API는 검증 불가 사유를 별도 코드로 반환하고 DB 상태를 `invalid`로 바꾸지 않는다. 관리자 화면은 이 상태와 활성화 불가 이유를 표시한다.
- QwenCloud PAYG와 Token Plan은 별도 키·호스트 계약이다([공식 API key 문서](https://docs.qwencloud.com/api-reference/preparation/api-key)). 현재 AMU credential은 PAYG만 허용하고 서버가 PAYG base URL을 고정한다. Token Plan 공개 조건은 앱 백엔드 사용을 허용하지 않으므로 자격증명 선택지에서 제외한다. 다시 추가하려면 적용 가능한 공급자 서면 예외와 별도 승인이 선행되어야 한다. Token Plan 전용 `sk-sp-` 키는 저장 전에 거부한다. 다른 prefix는 입력 오류 힌트로만 쓰며 키 유효성 증명이나 자동 유형 확정으로 쓰지 않고, 사용자 URL도 받지 않는다.
- 검증을 위해 빈 chat POST·최소 토큰 추론 같은 **과금 가능 요청을 자동 실행하지 않는다**. `unverified` 키를 `valid`로 간주하거나 기존 활성화 조건을 완화하지 않는다. 현재 resolver는 활성 버전만 반환하므로 “첫 이용자 요청으로 검증”은 성립하지 않는다. 필요한 경우 사용자에게 비용·횟수·모델·호스트·롤백을 승인받은 **관리자 전용 pending-key smoke**를 별도 설계한다. 서버 선불 preflight, 감사, 비밀 비노출, 성공 후 해당 버전만 `valid` 기록, 관리자의 명시적 활성화가 모두 충족되기 전 일반 runtime은 차단한다.
- 401·403·429·네트워크·5xx를 일률적으로 `invalid`로 저장하지 않는다. provider 오류 코드에서 키 자체의 인증 실패, 키 유형/호스트 불일치, 모델 접근권한, 잔액·요금제, 사용량 제한, 일시 장애를 구분한다. 근거가 불충분하면 `unverified`를 유지한다. 이용자 데이터가 외부에 전달되는 첫 요청을 검증 수단으로 쓰지 않는다.

---

## 4. 검증 (계약 테스트)

자격증명 정의·패널을 손대면 아래를 함께 통과시킨다.

```bash
node --experimental-strip-types --loader ./scripts/loader/node-worker-loader.mjs --test test/platformCredentialDisplay.test.ts      # 표기 규칙
node --experimental-strip-types --loader ./scripts/loader/node-worker-loader.mjs --test test/tradingCredentialDefinitions.test.ts   # 정의·라벨·스키마 enum·검증기 case 정합
```

두 테스트는 §1·§2의 실패 모드를 그대로 고정한다. 새 실패 모드를 발견하면 문서만 고치지 말고 테스트를 추가한다.

---

## 참조

- 표기 유틸: `src/utils/admin/platformCredentialDisplay.ts`
- 정의: `src/consts/secure/platformCredentials.ts`
- 스키마: `src/models/secure/PlatformCredentialSchema.ts`
- 검증기: `src/libs/server-utils/secure/platformCredentialVerifier.ts`
- 자격증명 저장소 재사용 판단: `.agent/docs/project/2026/08/20260807_094830__private-trade-lab-implementation-roadmap.md` §2.2
