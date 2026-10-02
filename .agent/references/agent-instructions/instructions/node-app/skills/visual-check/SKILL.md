---
name: visual-check
description: Playwright로 현재 페이지를 캡처하고 프론트엔드 디자인 하드 룰 기반으로 시각적 품질을 검증한다.
allowed-tools: Read, Bash, Grep
---

# 시각적 검증 워크플로우 (Next.js)

## 실행 조건

- 프론트엔드 UI 컴포넌트/페이지 변경 작업 완료 후
- 미니앱 신규 생성 시
- 랜딩/히어로 섹션 수정 시

## 사전 요구사항

시각 검증은 **`visual-check` MCP 서버**를 통해 수행

- MCP 클라이언트에 `visual-check` 서버가 등록되어 있을 것
- 최초 1회는 MCP 서버 패키지 기준으로 Playwright Chromium 런타임이 준비되어 있을 것
- dev 서버가 실행 중일 것 (`pnpm dev` 등)

## 로그인·인증이 필요한 화면

- 보호된 URL을 캡처하기 전 워크스페이스 루트의 `.env.account`를 확인한다. 현재 실제 경로는 `/home/attrest-samsung-linux/Project/.env.account`이며, 계정 값은 출력·로그·캡처·URL에 남기지 않는다.
- 로컬 캡처는 목적에 따라 `LOCAL_NO_COIN_ID`/`LOCAL_NO_COIN_PASS` 또는 `LOCAL_CHARGED_COIN_TEST_ID`/`LOCAL_CHARGED_COIN_TEST_PW`를 사용한다. 운영 계정 변수는 사용자의 별도 승인 없이는 사용하지 않는다.
- 실제 로그인 UI 또는 승인된 인증 fixture로 세션을 만든 뒤 캡처한다. `capture_visual` 호출 payload에 비밀번호·토큰을 넣거나 인증 검사를 우회하지 않는다.
- `.env.account`는 shell `source`로 읽지 않는다. shell 특수문자가 포함될 수 있는 비밀번호는 dotenv-aware loader 또는 허용한 키만 안전하게 파싱해 실행 환경에 주입한다.
- 관리자 전용 화면은 계정의 administrator 역할을 별도로 확인한다. no-coin/charged 계정이라는 이름만으로 관리자 권한을 가정하지 않으며, 관리자 계정 또는 fixture가 없으면 캡처를 통과로 판정하지 않는다.
- 인증이 되지 않아 로그인 화면이나 `/`로 redirect되면 대상 화면 검증이 아니라 `미확정`으로 기록한다. 보호된 URL의 401/redirect 응답은 API·라우트가 존재하지 않는다는 뜻이 아니다.
- 캡처가 끝나면 브라우저 context와 저장된 인증 상태를 폐기하고 로그아웃한다.

## 실행 단계

### 1단계: MCP 준비 상태 확인

먼저 `visual_doctor`로 런타임과 preset 상태를 확인한다.

```json
{
  "tool": "visual_doctor",
  "target": "amu-web-node-app"
}
```

### 2단계: dev 서버 상태 확인

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

- 200이 아니면 중단하고 dev 서버 실행을 안내

### 3단계: MCP로 스크린샷 캡처

```json
{
  "tool": "capture_visual",
  "target": "amu-web-node-app",
  "audit": true,
  "includeDark": false
}
```

특정 미니앱/페이지를 검증할 때:

```json
{
  "tool": "capture_visual",
  "url": "http://localhost:3000/mini/some-app",
  "audit": true,
  "includeDark": false
}
```

- MCP 응답 텍스트에는 저장 경로와 audit JSON이 포함됨
- 기본적으로 hero 이미지 2장이 MCP `image` content로 함께 반환됨
- 추가 PNG는 `captureDir` 아래 저장됨

### 4단계: `audit` 자동 검증 결과 확인

`capture_visual(..., audit=true)`는 아래 항목을 자동 검사

- 첫 뷰포트 내 헤딩/카드/CTA/이미지 개수
- 터치 타겟 미달 요소 (44x44px 미만)
- 경고 메시지 자동 생성

> **개수 자체를 실패 기준으로 쓰지 않는다.** audit의 카드·CTA 개수는 화면을 이해하기 위한 관측값이며,
> 작업 화면처럼 밀도가 높은 것이 정상인 화면에서는 개수가 많은 것이 결함이 아니다.

### 5단계: 시각 분석 및 체크리스트 대조

MCP가 반환한 이미지와 저장된 PNG를 기준으로 아래 체크리스트를 시각적으로 확인:

**모든 화면 공통**

- [ ] **모바일 레이아웃**: 375px에서 가로 overflow 없이 렌더링되는가?
- [ ] **반응형**: 375 / 768 / 1024 / 1440px에서 레이아웃이 깨지지 않는가?
- [ ] **터치 타겟**: 인터랙티브 요소가 최소 44x44px인가?
- [ ] **키보드**: Tab 순서가 자연스럽고 focus ring이 보이는가?
- [ ] **색상 모드**: light에서 정상인가? (node-app은 현재 light 단일 테마 — `_tokens.scss` 상단 주석 참고)
- [ ] **reduced-motion**: 이동·burst 효과가 제거되고 상태 변화는 유지되는가?
- [ ] **오버레이 레이어**: 모달 안의 Select·Dropdown이 열리고 **항목 선택까지** 되는가? (`frontend-next.md` z-index 계약)
- [ ] **sticky 하단 바**: 스크롤한 뒤에도 하단 바가 제자리에 있는가? (열자마자 화면으로 판정하지 않는다)
- [ ] **브랜드 테스트**: 내비게이션을 가려도 AMU 브랜드로 식별 가능한가?
- [ ] **화면 초점**: "이 화면의 주인공이 무엇인가"에 한 가지로 답할 수 있는가?
- [ ] **섹션 단일 목적**: 각 섹션이 하나의 역할만 수행하는가?
- [ ] **AI 슬롭 없음**: 예측 가능한 나열형 레이아웃, 목적 없는 보라·분홍 그라데이션, 근거 없는 통계 배지가 없는가?

**서비스 소개·랜딩·미니앱 랜딩에만**

- [ ] **전환 흐름**: 정체성 → 맥락 → 설명 → 신뢰 → 전환 순서가 성립하는가?
- [ ] **CTA 집중**: Primary CTA가 하나로 읽히는가?

> 작업 화면(Gen Studio 에디터 · Marketing Oops 대시보드 · Store 관리)과 대화 화면(Tutors)에는
> 위 랜딩 항목을 적용하지 않는다. 이들 화면의 카드 · 칩 · 상태 타일 · 밀집 레이아웃은
> **정상 구성 요소이며 실패 사유가 아니다.**

### 6단계: 문제 발견 시

- 각 문제에 대해 수정 패치를 제안 (최소 diff 형식)
- `capture_visual`을 다시 호출하여 재검증

## 참고

- MCP 서버 이름: `visual-check`
- 주요 도구:
  - `visual_doctor`
  - `capture_visual`
- 이 스킬은 프론트엔드 디자인 하드 룰(`{{AGENT_ROOT}}/rules/frontend-next.md`)을 기반으로 검증
- 미니앱 검증 시 `AGENT_GUIDE.md`의 미니앱 규칙도 함께 적용
