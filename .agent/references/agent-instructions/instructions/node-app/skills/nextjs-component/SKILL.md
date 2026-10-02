---
name: nextjs-component
description: AMU 스타일(모바일 퍼스트, Tailwind, i18n)로 Next.js/React 컴포넌트를 생성 또는 수정한다.
allowed-tools: Read, Grep, Edit
---

# AMU Next.js 컴포넌트 워크플로우

## 공통 UI 선택 순서

- 구현 전에 `{{AGENT_ROOT}}/rules/frontend-next.md`의 `UI → Module → Template → Page` 책임과 Tailwind 추상화 기준으로 소유 계층을 먼저 정한다.
- UI 구현 전 반드시 `src/components/ui`와 `src/components/module`에서 재사용 가능한 컴포넌트 우선 검색
- 빠른 탐색이 필요하면 `{{AGENT_ROOT}}/skills/nextjs-component/references/common-ui-inventory.md`를 우선 참고
- UI 구현 우선순위
  1. `src/components/ui`의 primitive/overlay/form/layout 컴포넌트
  2. `src/components/module`의 조합형/도메인형 컴포넌트
  3. `src/components/template`의 페이지군 레이아웃
  4. 기존 화면 또는 route 인접 경계의 유사 패턴
- 기존 공통 컴포넌트 조합으로 해결 가능 시 새 UI를 생성 금지
- 요청 전용 또는 특수 목적의 컴포넌트로 공통화 가치가 낮은 경우에만 새 UI를 생성
- 새 UI 생성 원칙:
  1. 범용 primitive 일 경우: `src/components/ui`
  2. 도메인 조합형일 경우: `src/components/module` 또는 해당 feature 내부
  3. 페이지군의 공통 배치 계약일 경우: `src/components/template`
  4. 단일 route 전용 조합일 경우: route 인접 경계

- **모바일 퍼스트** 레이아웃 우선 설계
- **Tailwind CSS 우선 사용**, 불가피한 경우에만 커스텀 CSS 추가
- 모든 사용자 노출 문자열에 **i18n 적용** (`<Lang>` 또는 `lang()`)
- 기존 패턴(`cn` 유틸, 컴포넌트 구조 등) 유지
- 변경 사항은 **최소 패치 형태**로 반환

## 디자인 품질 체크리스트

컴포넌트 생성/수정 완료 후 아래 항목을 점검:

- [ ] 카드·보더·섀도를 썼다면: 그 경계가 의미를 전달하는가? 같은 의미의 컨테이너를 중첩하지 않았는가?
- [ ] 섹션 컴포넌트라면: 하나의 목적만 수행하는가?
- [ ] 시스템 기본 폰트(Inter/Roboto/Arial)를 하드코딩하지 않았는가?
- [ ] 색상을 리터럴로 하드코딩하지 않고 토큰(`var(--*)`)을 썼는가?
- [ ] 모바일(375px) / 데스크톱(1440px) 양쪽에서 올바르게 렌더링되는가?
- [ ] 터치 타겟 44x44px, visible focus, 키보드 도달이 가능한가?
- [ ] 이미지 위에 텍스트·라벨을 올렸다면 대비를 확보했는가?
- [ ] 새로 늘린 요소가 사용자의 다음 행동과 연결되는가? (장식 목적의 반복 요소를 쌓지 않는다)
- [ ] 서비스 소개·랜딩 컴포넌트라면: Primary CTA가 하나로 읽히는가?
