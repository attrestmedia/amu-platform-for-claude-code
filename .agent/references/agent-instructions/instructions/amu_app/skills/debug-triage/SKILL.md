---
name: debug-triage
description: Triage AMU WEB (WordPress) bugs from logs/errors - reproduce, isolate, minimal fix, verify.
allowed-tools: Read, Grep, Edit
---

# Debug triage

- 증상을 1~3문장으로 재정리 (재현 조건/기기/브라우저/웹뷰 포함)
- 레이어 식별: 테마 템플릿(PHP) / CSS/JS / WP 훅&플러그인 / 서버(Nginx/Apache) / DB / 캐시
- 관련 진입점(템플릿/훅/enqueue/쿼리)을 검색으로 좁힘
- 가설 1~2개만 세우고, 각각 “반증 방법”을 함께 제시
- 최소 수정으로 해결하고, 검증 절차(어디를 어떻게 확인할지) 제시
- 결과는 항상 최소 patch(diff)로만 출력
