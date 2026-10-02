# AMU Native App - Agent Guide

## 기본 원칙

- 모든 답변/설명은 한국어로 작성
- 작업 전 간단한 계획(2~6줄)을 먼저 제시하고 진행하고, 코드 변경은 항상 최소 patch(diff) 기준으로 수행
- 요청 범위를 벗어난 리팩토링/구조 변경은 금지
- 불확실한 내용은 추정으로 명시하고, 확인 파일/명령을 함께 제시
- 코드 변경은 **항상 최소 patch(diff)** 문서로만 제시하고, 반드시 해당 **코드가 작동하는 원리/적용 이유/개념**을 상세히 작성 (전체 파일 재출력 금지)
- 단순 질의응답이 아닌, 분석/설계/패치 제안/운영 판단이 포함된 작업 요청은 반드시 **수정/개선 사항에 대한 패치 내용을 보고서 형식의 파일**로 저장
  > **별도의 요청이 있을 때까지 파일에 실제 수정/적용은 절대 금지**하고, **수정/패치 내용을 확인/검토할 수 있도록** 제공하여 요청이 있을 경우에만 파일 수정/적용을 실행
  > 설명/가이드 또는 보고서는 **파일 수정에 대한 예외 규칙**으로, 반드시 `.agent/docs/amu_native_app/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`의 형식으로 한글이 깨지지 않도록 저장하고, `todo-content.json`의 작업 요청 `TASK`가 있을 경우 해당 `TASK`의 `status` 업데이트
  > 수정/패치가 필요한 경우 반드시 **스켈레톤 코드가 아닌 전체 코드가 있는 실제 적용이 가능한 diff 코드** 형태의 패치 가이드로 제공
  > 로그는 `.agent/logs/amu_native_app/{YYYY}/{MM}/{YYYYMMDD}.json`에 남기고, **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 레포 구조(요약)

- `lib/`: Flutter 앱 코드 (WebView UI/상태/라우팅)
- `android/`: Android 네이티브 설정(Manifest, Gradle, 빌드 설정)
- `ios/`: iOS 네이티브 설정
- `test/`: Flutter 테스트 코드
- `docs/`: 개발/운영 가이드 문서

## Flutter/UI 규칙

- 모바일 퍼스트 UI를 우선 설계
- 기존 위젯 트리/테마 패턴을 우선 재사용
- 불필요한 상태 추가를 지양하고 `setState` 범위를 최소화
- 성능 이슈가 예상되면 `const` 생성자, 빌드 범위 축소, 리빌드 최소화를 우선 검토
- 사용자 노출 문자열은 하드코딩 남발을 피하고 추후 다국어 확장을 고려
- UI 설계·구현·리뷰에는 `ui-ux-pro-max`의 `flutter` 스택과 필요한 `ux`·`web` 도메인을 사용하되, 기존 `ThemeData`·위젯·내비게이션·로컬라이제이션을 추천보다 우선한다.
- 신규 화면은 디자인 시스템 추천을 영속화하지 않고 `유지·개선·금지·검증` 10개 이하 계약으로 압축한다. 새 폰트·아이콘 패키지·UI 패키지·색상 체계 도입과 `--persist`·`--force`는 사용자 명시 승인 없이는 금지한다.
- 완료 전 `references/pro-rules.md` 체크리스트를 적용해 44pt/48dp 터치 타깃, safe area, Dynamic Type/텍스트 배율, 스크린리더, reduced-motion, light/dark, 소형·대형 폰/태블릿의 세로·가로를 확인한다.

## WebView/Android 규칙

- WebView 변경 시 `NavigationDelegate`, 뒤로가기(`canGoBack`), 로딩 상태를 함께 검토
- 외부 링크/딥링크 정책(브라우저 오픈 vs 앱 내 처리)을 명시
- Android 권한은 최소 권한 원칙 적용 (`INTERNET` 등 필요한 것만 추가)
- `AndroidManifest.xml`/`build.gradle` 수정 시 영향 범위(디버그/릴리스)를 함께 점검

## 품질/검증 규칙

- 변경 후 가능하면 아래 순서로 확인
  1. `flutter pub get`
  2. `flutter analyze`
  3. `flutter test`
  4. `flutter run -d <device_id>`
- Android 빌드 변경이 있으면 `flutter build apk --debug`로 최소 1회 검증

## 자세한 규칙/스킬

- 규칙 문서: `{{AGENT_ROOT}}/rules/`
- 스킬 문서: `{{AGENT_ROOT}}/skills/`

### 사용 가능한 스킬 목록 (`{{AGENT_ROOT}}/skills/`)

| 스킬                  | 경로                                     | 용도                                    |
| --------------------- | ---------------------------------------- | --------------------------------------- |
| `patch-only`          | `{{AGENT_ROOT}}/skills/patch-only/`      | 최소 diff 출력 원칙                     |
| `safe-refactor`   | `{{AGENT_ROOT}}/skills/safe-refactor/`   | 동작 보존 중심 안전 리팩토링            |
| `debug-triage`        | `{{AGENT_ROOT}}/skills/debug-triage/`    | 증상 재현, 원인 격리, 최소 수정         |
| `flutter-widget`  | `{{AGENT_ROOT}}/skills/flutter-widget/`  | Flutter 위젯/화면 생성 및 수정          |
| `android-webview` | `{{AGENT_ROOT}}/skills/android-webview/` | Android WebView 및 Manifest/Gradle 설정 |
| `run-checks`          | `{{AGENT_ROOT}}/skills/run-checks/`      | analyze/test/run/build 검증 절차        |
| `ui-ux-pro-max`       | `{{AGENT_ROOT}}/skills/ui-ux-pro-max/`   | Flutter UI 리서치·접근성·반응형 QA      |
