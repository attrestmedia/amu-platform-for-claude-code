---
name: wp-security
description: WordPress/PHP security patterns (escape/sanitize/nonce/capability/$wpdb->prepare) for AMU WEB.
allowed-tools: Read, Grep, Edit
---

# AMU WP Security Checklist

- 기본 스코프는 `wordpress/`이며 `node-app/`는 제외
- 출력: `esc_html()` / `esc_attr()` / `esc_url()` / `wp_kses_post()` 중 상황에 맞게 선택
- 입력: `sanitize_text_field()` / `absint()` / `sanitize_email()` 등으로 정리
- 권한: `current_user_can()` + nonce(`wp_nonce_*`) 조합
- DB: `$wpdb->prepare()` 강제
- REST/AJAX: 파라미터 검증 → 권한 체크 → 사이드이펙트 순서 유지
