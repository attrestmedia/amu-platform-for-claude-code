---
name: legal-policy-review
description: 개인정보처리방침·이용약관·환불 및 반품 정책을 실제 서비스 구현과 대조해 검토하고 갱신한다. 정책 문서 수정, 수집 항목·처리위탁·보유기간·환불/반품 조건 변경, 새 외부 프로바이더 도입, 법령 개정 반영, 정기 컴플라이언스 점검에 사용.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Legal Policy Review (법적 고지 문서 검토·갱신)

`allmyuniverse.com`과 `app.allmyuniverse.com`이 공통으로 사용하는 개인정보처리방침·이용약관·
환불 및 반품 정책을
**실제 구현 사실에 근거해** 검토하고 갱신하는 절차를 정의한다.

정본·인벤토리: `.agent/legal/` — 도구: `web-automation-project/wp_mng/legal_policy/`

## 0) 착수 전 필수 확인

1. `.agent/legal/README.md` — 전체 체계와 정본 우선 원칙
2. `.agent/legal/open-issues.md` — 미해결 갭 (중복 보고 방지)
3. `.claude/rules/compliance-guardrails.md` — 환전/사행성·가상자산·미성년/음성 규제 게이트
4. `.claude/rules/text-encoding-integrity.md` — 한글 리터럴 전달 및 저장 후 재조회 검증

**정본은 `.agent/legal/policies/*.md`이고 WordPress 페이지는 산출물이다.**
WP 관리자 화면에서 정책 페이지를 직접 고치지 않는다.

환불·반품 정책은 가격·환불 약속에 해당하는 L3 영역이다. 이용약관, 결제 화면,
`.agent/amu-platform-guide/COIN-POLICY-MANUAL.md`, 실제 환불 원장의 조건을 함께 대조하고
사람 승인 없이 이용자 권리를 축소하거나 새로운 환불·보상 약속을 추가하지 않는다.

## 1) 드리프트 감지

```bash
python3 web-automation-project/wp_mng/legal_policy/detect_policy_drift.py
```

종료 코드 `1`이면 드리프트가 있다. 유형별 대응:

| kind | 의미 | 대응 |
| --- | --- | --- |
| `processor_undeclared` | 코드에 새 외부 처리자 자격증명 | `service-facts.json`에 추가 후 정책 처리위탁 조항 갱신 |
| `processor_undisclosed` | 데이터를 전달하는데 정책에 미고지 | 수탁자명·업무·항목·이전 국가를 정책에 명시 |
| `processor_generic` | 분류명으로만 포괄 기재 | 수탁자명을 구체화 |
| `oauth_scope_changed` | 소셜 연동 권한 범위 변경 | 이용자 대상이면 수집 항목에 반영 |
| `personal_field_undeclared` | 스키마에 수집 항목 추가됨 | 수집 항목·목적·보유기간 확정 후 반영 |
| `retention_undefined` | 보유기간 미확정 | TTL 확정 + 파기 로직과 함께 반영 |
| `unimplemented_right` | 정책이 약속한 권리 미구현 | **정책 문구를 고치지 말고 구현을 만든다** (아래 3장) |
| `policy_stale` | 시행일 이후 감시 대상 코드 변경 | 변경이 처리 범위에 영향을 주는지 검토 |

## 2) 사실 확인 — 추정 금지

정책 문구를 쓰기 전에 **해당 주장을 뒷받침하는 코드를 먼저 찾는다.**
`service-facts.json`의 모든 항목은 `evidence`(파일:줄)를 가져야 한다.

주요 근거 위치:

| 사실 | 근거 |
| --- | --- |
| 외부 처리자 | `amu_app/node-app/src/consts/secure/platformCredentials.ts` |
| 소셜 연동 권한 | `amu_app/node-app/src/libs/marketing/auth/oauthProviderRegistry.ts` |
| 수집 항목 | `amu_app/node-app/src/models/user/UserSchema.ts` |
| 미디어 저장 | `amu_app/node-app/.claude/rules/media-storage.md` (R2 단일 저장소) |
| 코인·환급 | `amu_app/node-app/.claude/rules/server-economy-security.md`, `.agent/amu-platform-guide/COIN-POLICY-MANUAL.md` |

근거를 찾지 못한 주장은 정책에 쓰지 않는다. 불확실하면 "추정"으로 표기하고
법률 자문 확인을 전제 조건으로 남긴다.

## 3) 구현과 정책이 어긋날 때의 방향

**정책을 구현에 맞춰 낮추는 방식은 기본값이 아니다.**
정책이 이용자 권리를 보장한다고 고지했는데 구현이 없다면, 원칙적으로 **구현을 만든다.**
정책 문구를 삭제해 갭을 해소하는 것은 이용자 권리 축소이므로 사용자 승인이 필요하다.

## 4) 정책 개정

1. `service-facts.json` 갱신 (evidence 필수)
2. `.agent/legal/policies/*.md` 본문 수정 — 본문은 게시용 HTML 원문이다
3. frontmatter의 `version`, `effectiveDate` 갱신
4. 플러그인 운영 배포와 공개 렌더 재조회 검증 후 `CHANGELOG.md`에
   버전·시행일·`material` 여부·변경 사유·근거 기록

정본 변경 후 `sync_plugin_modules.py`로
`amu_app/wordpress/wp-content/plugins/attrestmedia-terms-conditions/modules/`를 갱신한다.
플러그인 모듈을 직접 편집하지 않는다.

**material change 판정** — 아래 중 하나면 `material: true`이며 시행일 최소 30일 전 사전 고지가 필요하다(추정).

- 수집 항목 추가
- 제3자 제공·처리위탁 추가
- 보유기간 연장
- 이용자에게 불리한 약관 변경 (환급 조건 축소, 책임 제한 확대 등)

## 5) 반영

```bash
cd web-automation-project/wp_mng/legal_policy

python3 sync_plugin_modules.py
python3 sync_plugin_modules.py --apply
# 통상 배포 절차로 attrestmedia-terms-conditions 플러그인을 운영에 배포한 뒤
python3 policy_sync.py diff --policy privacy-policy --target production
```

표준 경로는 **정본 → 로컬 플러그인 HTML 생성 → 플러그인 운영 배포 → 공개 렌더 확인**이다.

- `sync_plugin_modules.py`는 기본 검사이며 `--apply`에서만 로컬 플러그인 모듈을 갱신한다.
- 관리형 WordPress 페이지는 shortcode를 유지한다. 기존 페이지의 정책 HTML을 WP 관리자 화면이나
  `policy_sync.py push --apply`로 직접 수정하지 않는다.
- 플러그인 배포 후 production `diff`로 공개 렌더 본문과 정본 해시를 검증한다.
- `pull`은 최초 정본 시딩 또는 사고 복구용 읽기 경로에만 사용한다.
- `ensure`는 정책 페이지가 전혀 없을 때 shortcode wrapper를 생성하는 예외다. 기본 dry-run 후
  `--apply --confirm-slug` 순으로 실행하며, 이 production 쓰기에만 사용자 승인과
  `AMU_LEGAL_ALLOW_PRODUCTION_PUBLISH=true`가 필요하다.
- `push`는 현행 shortcode 관리형 세 정책에 사용하지 않는다. 레거시 정적 페이지 지원이 필요한
  경우에만 별도 검토한다.

## 6) 보고

- 보고서: `.agent/docs/project/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`
- 로그: `.agent/logs/project/{YYYY}/{MM}/{YYYYMMDD}.json` — 구조는 같은 폴더 최신 파일을 따른다
- 규제 판단이 포함되면 "규제 게이트 통과 여부"를 명시하고 미확정 항목은 `blocked` 사유로 기록한다
  (`.claude/rules/compliance-guardrails.md` §4)

## 하지 않는 것

- 법률 자문을 대체하는 확정적 법률 판단
- 근거 없는 조항 창작 — 타사 정책 문구를 그대로 옮겨 붙이지 않는다
- 사용자 승인 없는 production 반영
- WP 관리자 화면이나 운영 API에서 관리형 정책 페이지 본문 직접 수정
- 현행 shortcode 관리형 정책에 `policy_sync.py push --apply` 실행
- 플러그인 HTML 모듈 직접 수정 — 반드시 정본에서 생성
- 이용자 권리를 축소하는 방향의 문구 수정 (사용자 승인 필요)
