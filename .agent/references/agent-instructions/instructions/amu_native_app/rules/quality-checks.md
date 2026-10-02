---
paths:
  - "lib/**/*.dart"
  - "android/**/*.gradle"
  - "test/**/*.dart"
---

# Quality Checks

- 변경 후 가능하면 `flutter analyze`와 `flutter test`를 실행
- Android 관련 변경이 있으면 `flutter build apk --debug` 또는 `flutter run`으로 검증
- 실패 로그는 핵심 오류 중심으로 요약하고 원인 후보를 제시
- 수정안은 최소 단위로 분리해 적용
