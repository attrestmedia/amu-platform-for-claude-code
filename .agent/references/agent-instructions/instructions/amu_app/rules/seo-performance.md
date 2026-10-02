---
paths:
  - "wordpress/wp-content/themes/amu24/**/*.{php,css,scss,js}"
  - "wordpress/wp-content/themes/amu24/**/header*.php"
  - "wordpress/wp-content/themes/amu24/**/functions*.php"
---

# SEO / Performance Rules (AMU WEB)

- 메타/OG/구조화 데이터는 기존 구현을 우선 존중하고 “누락/중복”만 최소 수정
- 이미지/리소스는 불필요한 로딩 최소화(조건부 enqueue, 지연 로딩 고려)
- 접근성: 버튼/링크의 역할과 포커스/라벨 기본 준수
- 성능: 불필요한 DOM 증가/중복 렌더링/과한 애니메이션 지양
- 캐싱/압축/번들링 변경은 영향 범위를 먼저 요약하고, 롤백 포함
