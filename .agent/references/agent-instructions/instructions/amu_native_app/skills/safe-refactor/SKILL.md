---
name: safe-refactor
description: Flutter/Android 프로젝트에서 안전하게 리팩토링 수행 - 최소 단위 변경, 동작 보존, 검증 포함
allowed-tools: Read, Grep, Edit, Bash
disable-model-invocation: true
---

# 안전한 리팩토링

명시적으로 호출된 경우에만 실행

## 프로세스

1. 중복/복잡 로직의 최소 추출 지점을 확정
2. 한 번에 1단계씩만 리팩토링
3. 공개 동작(UI 흐름, WebView 동작, 빌드 결과)을 반드시 보존
4. 가능한 경우 아래 검증 실행
   - `flutter analyze`
   - `flutter test`
   - `flutter run -d <device_id>` 또는 `flutter build apk --debug`
5. 최소 패치와 롤백 방법을 함께 제공

