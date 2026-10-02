---
paths:
  - "src/**/game/**"
  - "src/**/pixi/**"
  - "src/**/three/**"
  - "src/**/mission/**"
  - "src/**/minigame/**"
  - "src/hooks/game/**"
---

# Game Rendering / PixiJS / Three.js

- AMU Play 게임 구현·개선은 `{{AGENT_ROOT}}/skills/amu-play-game-development/SKILL.md`로 제작 목적을 분류하고 필요한 참조 모듈만 적용할 것
- 지속형 2D 아이소메트릭 월드·NPC·스테이지는 PixiJS, 공간 퍼즐·3D 아케이드·3D 전투 미션은 독립 Three.js 세션, HUD·메뉴·대화상자는 React DOM을 기본으로 할 것
- 기존 PixiJS 월드를 Three.js로 교체하거나 두 엔진의 60fps 렌더 루프를 상시 동시에 구동하지 말 것
- PixiJS 리소스(텍스처, 스프라이트, 타이커)는 생성과 해제를 반드시 쌍으로 관리할 것
- 씬 전환/스테이지 이동 시 이전 리소스를 완전히 destroy (children·texture 옵션 명시)
- React 상태에 PixiJS 객체를 직접 넣지 않고 ref로 관리
- useEffect 정리 함수에서 PixiJS 이벤트 리스너·타이커를 반드시 해제
- Three.js geometry·material·texture·render target·mixer·rAF·observer·listener도 runtime owner가 소유하고 세션 종료 시 공유 여부를 확인해 dispose할 것
- PixiJS↔Three.js 전환은 입력 잠금, ticker/render loop, 오디오, checkpoint, 오류 복귀와 서버 결과 제출 순서를 명시할 것
- 점수·완료·보상량은 클라이언트 렌더/시뮬레이션 결과를 신뢰하지 말고 서버가 세션·규칙 버전·멱등 키로 판정할 것
- 프레임 예산(16.6ms @60fps) 준수, draw call 최소화
- 자세한 패턴은 `{{AGENT_ROOT}}/skills/ux-coding/` 참고
