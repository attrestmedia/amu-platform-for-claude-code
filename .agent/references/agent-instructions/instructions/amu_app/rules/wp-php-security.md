---
paths:
  - "wordpress/wp-content/**/*.{php}"
---

# WordPress / PHP Security Rules

- 출력 이스케이프 필수: `esc_html()` / `esc_attr()` / `esc_url()` / `wp_kses_post()` 중 상황에 맞게 선택
- 입력 정리 필수: `sanitize_text_field()` / `absint()` / `sanitize_email()` 등
- 상태 변경(AJAX/폼/REST)은 nonce + capability 조합으로 보호
- DB 접근 시 `$wpdb->prepare()` 강제
- 처리 순서: 입력검증 → 권한체크 → 사이드이펙트(저장/삭제/외부호출)
- 외부 API 호출/비용 발생 작업은 사전 체크 + 실패 로그/에러 핸들링 우선
