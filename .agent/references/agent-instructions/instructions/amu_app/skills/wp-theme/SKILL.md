---
name: wp-theme
description: Update AMU24 WordPress theme (PHP templates, SCSS, JS) with AMU WEB rules (mobile-first, light-only, SCSS-source-only, lucide, minimal patch).
allowed-tools: Read, Grep, Edit
---

# AMU WP Theme Workflow

- 기본 스코프는 `wordpress/`이며 `node-app/`는 제외
- 우선 “진입점”부터 잡기: 템플릿(header/footer/front-page/single) → inc/actions → assets(css/js)
- 변경 영향(레이아웃/성능/SEO/접근성)을 3~6줄로 먼저 요약
- PHP 출력은 escape 우선, 입력은 sanitize 우선
- UI는 모바일 퍼스트. amu24는 현재 **light-only**이므로 dark 지원을 전제하지 않는다
- **스타일은 `assets/css/scss/`의 SCSS에만 추가한다.** `assets/css/*.css`는 빌드 산출물이며 직접 수정 금지 —
  빌드 명령과 검증 절차는 `{{AGENT_ROOT}}/rules/wp-theme-ui.md`의 "스타일 소스 정본" 절을 따른다
- 반복되는 Tailwind 조합은 utilities/components로 흡수(필요할 때만)
- 전체 파일 재출력 금지, 항상 최소 patch로만 제공
