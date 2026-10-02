---
name: android-webview
description: Flutter Android WebView 앱의 설정, 네비게이션, 권한, 빌드 구성을 안전하게 수정
allowed-tools: Read, Grep, Edit, Bash
---

# Android WebView 워크플로우

## 핵심 확인 항목

1. `lib/`의 WebView 설정
   - JavaScript 모드
   - `NavigationDelegate`
   - 로딩/에러 처리
   - 뒤로가기(`canGoBack`)
2. `android/app/src/main/AndroidManifest.xml`
   - `INTERNET` 권한
   - 필요 최소 권한만 추가
3. `android/app/build.gradle` 및 루트 Gradle 설정
   - SDK/플러그인/호환성 영향 확인
4. 실기기/에뮬레이터 동작 검증
   - `flutter run`
   - 주요 URL 로딩 및 이동 테스트

## 원칙

- 플랫폼 정책/보안에 영향 있는 변경은 이유와 리스크를 함께 기록
- 외부 앱 호출, 파일 업로드, 결제/딥링크 시나리오는 별도 체크리스트로 검증
- 변경 결과는 최소 패치로 정리
