---
paths:
  - "lib/**/*.dart"
  - "android/app/src/main/AndroidManifest.xml"
  - "android/app/build.gradle"
---

# Android WebView / Manifest

- WebView 변경 시 `NavigationDelegate`, 로딩/에러 처리, 뒤로가기 동작을 함께 점검
- Android 권한은 최소 권한 원칙 적용 (`INTERNET` 등 필요 항목만)
- 외부 링크/딥링크/결제/파일 업로드는 동작 경로를 명확히 기록
- 보안·정책 영향이 있는 설정 변경은 이유/리스크/검증 방법을 함께 제시
