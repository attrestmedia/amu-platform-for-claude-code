---
name: run-checks
description: Flutter 변경 후 analyze/test/run/build 검증을 순서대로 수행하고 결과를 보고
allowed-tools: Read, Bash
disable-model-invocation: true
---

# 변경 후 체크 실행

**요청 시** 아래 순서로 실행하고 실패 지점을 먼저 보고:

1. `flutter pub get`
2. `flutter analyze`
3. `flutter test`
4. `flutter run -d <device_id>` (가능한 경우)
5. `flutter build apk --debug` (Android 빌드 영향이 있을 때)

보고 규칙:

- 성공/실패를 단계별로 구분
- 실패 시 원인 후보와 최소 수정 포인트 제시
- 로그는 핵심 오류만 발췌
