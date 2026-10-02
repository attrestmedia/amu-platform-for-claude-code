---
name: ux-coding
description: AMU 프로젝트의 UX 코딩 규칙 — 코어 최적화, GPU 메모리 관리, 고성능 코드 작성 가이드
allowed-tools: Read, Grep, Edit, Bash
---

# AMU UX 코딩 규칙

> 단순히 좋은 엔진을 만드는 것을 넘어, 엔진을 분해하여 성능과 효율성을 동시에 끌어올리는 **"마스터 엔지니어"** 를 추구

## 1. 코어 최적화 — 불필요한 중복 금지

- 서버/클라이언트 모두 **CPU·메모리·I/O 경로의 병목**을 줄여 지연을 낮추고 처리량 높이기
- 중복 함수/유틸 생성을 금지하고, 기존 모듈을 **최대한 재사용**
- 여러 파일에서 반복되는 로직은 **공통 모듈로 추출**
- 유틸리티는 반드시 **클라이언트(`utils`)와 서버(`server-utils`)를 구분**

### 체크리스트

- [ ] 동일/유사 로직이 이미 존재하는지 검색(`Grep`)했는가?
- [ ] 새 유틸 생성 시 client/server 경계를 올바르게 지정했는가?
- [ ] 불필요한 리렌더링을 유발하는 상태 구조가 아닌가?

## 2. GPU 메모리 정밀 관리 (PixiJS/WebGL)

- GPU VRAM의 **할당·해제·재사용** 사이클 명확히 설계
- 텍스처/스프라이트는 **화면에 보이는 범위만** 로드하고, 벗어나면 즉시 해제
- 큰 에셋은 **스프라이트시트**로 합쳐 draw call을 최소화
- `destroy()` 호출 시 `children: true, texture: true`를 기본으로 하고, `baseTexture`는 공유 여부에 따라 **true/false**를 명시적으로 선택

### PixiJS 메모리 패턴

```typescript
// ✅ 올바른 해제
sprite.destroy({ children: true, texture: true, baseTexture: false });

// ❌ 메모리 누수
sprite.removeFromParent(); // texture가 VRAM에 남음
```

### 체크리스트

- [ ] 씬 전환/스테이지 이동 시 이전 리소스를 완전히 해제하는가?
- [ ] 텍스처 캐시(`PIXI.Cache`)를 주기적으로 정리하는가?
- [ ] 애니메이션/타이커를 제거 시 `ticker.remove()` 호출했는가?

## 3. 하드웨어 한계까지 밀어붙이는 코드

- **requestAnimationFrame** 기반 루프에서 프레임 예산(16.6ms @60fps)을 준수
- 무거운 연산은 **Web Worker** 또는 **OffscreenCanvas**로 분리를 고려
- DOM 접근은 최소화하고, 배치 업데이트를 활용
- React 컴포넌트에서 PixiJS 캔버스로의 **브릿지 레이어**를 얇게 유지

### 성능 임계값 가이드

| 지표          | 목표            | 위험            |
| ------------- | --------------- | --------------- |
| FPS           | 60fps 유지      | 30fps 이하 지속 |
| JS 힙 메모리  | 50MB 이하       | 150MB 초과      |
| Draw call     | 100 이하/프레임 | 500 초과        |
| 텍스처 메모리 | 128MB 이하      | 256MB 초과      |

## 4. React + PixiJS 통합 규칙

- **useEffect 정리 함수**에서 PixiJS 리소스를 반드시 해제
- 상태 변경이 PixiJS 렌더링에 영향을 줄 때는 `useEffectEvent`로 안전하게 처리
- PixiJS 객체를 React 상태에 직접 넣지 말고 ref로 관리

```typescript
// ✅ useEffectEvent로 PixiJS 이벤트 안전 처리
const onSpriteClick = useEffectEvent((spriteId: string) => {
  setSelectedNpc(spriteId);
  playSound("click");
});

useEffect(() => {
  const sprite = spriteRef.current;
  if (!sprite) return;
  sprite.on("pointerdown", () => onSpriteClick(sprite.name));
  return () => {
    sprite.off("pointerdown");
  };
}, []);
```

## 5. 네트워크/데이터 최적화

- API 호출은 **React Query 캐싱**을 적극 활용하고, 동일 요청의 중복 호출 방지
- 코인 차감 등 **비용 발생 API**는 호출 전 사전 검증 + 에러 시 롤백 처리 포함
- 대량 데이터는 **페이지네이션** 또는 **무한 스크롤**로 분할 로드
- Redis 캐시 레이어를 활용해 반복 DB 조회를 줄이기
