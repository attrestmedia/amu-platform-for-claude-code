---
name: debug-triage
description: Flutter + Android WebView 버그를 재현/격리/검증 중심으로 트리아지하고 최소 수정안을 제시
allowed-tools: Read, Grep, Edit, Bash
---

# 디버그 트리아지

1. 관찰된 증상을 재진술
2. 원인 계층 식별
   - Flutter UI 상태
   - WebView 설정/네비게이션
   - Android Manifest/Gradle/권한
   - 디바이스/환경 이슈
3. 진입점(entry point) 파일을 검색해 확정
4. 1~2개 가설을 세우고 반증 방법 제시
5. 최소 수정안을 적용하고 검증 단계 정리
6. 결과는 최소 패치 중심으로 보고

