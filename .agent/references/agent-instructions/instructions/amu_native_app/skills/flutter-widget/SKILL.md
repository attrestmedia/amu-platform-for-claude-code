---
name: flutter-widget
description: AMU Native App 스타일로 Flutter 위젯/화면을 생성 또는 수정
allowed-tools: Read, Grep, Edit
---

# Flutter 위젯 워크플로우

- 화면 구조를 모바일 기준으로 먼저 설계
- 기존 `ThemeData`, 위젯 구조, 상태 관리 패턴을 우선 재사용
- 불필요한 상태 추가/중복 위젯 생성을 지양
- 빌드 성능을 위해 가능한 `const` 생성자와 작은 빌드 단위를 유지
- 사용자에게 노출되는 문자열은 한곳에서 관리 가능하도록 작성
- 변경은 최소 패치로 반환
