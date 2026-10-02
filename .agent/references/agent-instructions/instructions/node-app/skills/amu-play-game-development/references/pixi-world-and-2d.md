# PixiJS 월드와 2D 게임

## 목차

- [StageDoc 정본](#stagedoc-정본)
- [월드 런타임](#월드-런타임)
- [카메라와 입력](#카메라와-입력)
- [2D 미션과 전략 게임](#2d-미션과-전략-게임)
- [스테이지 제작 도구](#스테이지-제작-도구)
- [검증](#검증)

## StageDoc 정본

- `src/types/game/stage-doc.ts`, `StageSchema`, `stageCoordinateContract.ts`를 먼저 읽는다.
- 좌표 계약 v2, `isometric-2to1`, logical grid, footprint, anchor, depth key와 R2 release reference를 보존한다.
- 배경 장식에서 collision, navigation, interaction zone을 추론하지 않는다. stable tile/object ID로 연결한다.
- ISO 마이그레이션 상태를 최신 코드와 로드맵 원장에서 확인하고 legacy 데이터를 조기 활성화하지 않는다.
- 월드의 높이는 시각적 `isoHeightPx`일 수 있지만 논리 점유와 이동은 grid 계약에서 판정한다.

## 월드 런타임

- `GameStage`, `useGameInit`, `useGameLoop`, stage/npc/input/collision hook의 현재 소유권을 유지한다.
- 콘텐츠 정의, stage runtime data, Pixi container/sprite, React UI state를 분리한다.
- 캐릭터·NPC·오브젝트의 depth sort는 공통 depth key를 사용하고 JSX 렌더마다 재계산하지 않는다.
- 화면 밖 sprite는 cull하되 충돌·NPC 의도·서버 상태까지 임의 삭제하지 않는다.
- texture, sprite sheet, ticker callback과 pointer event의 생성·해제를 쌍으로 관리한다.
- 장기 월드는 scene/stage 전환 때 공유 texture와 scene 전용 texture의 소유권을 구분한다.

## 카메라와 입력

- 한 authoritative camera target과 finite stage constraint를 사용한다.
- 캐릭터, 즉시 위협, NPC 상호작용, 포털·목표를 의도한 거리에서 함께 읽을 수 있게 한다.
- 키보드, joypad, pointer picking이 같은 action intent로 수렴하게 하고 물리 키별로 게임 동작을 복제하지 않는다.
- dialog, NPC action, Three.js 세션, pause가 열리면 input lock owner를 명시하고 중첩 해제를 안전하게 처리한다.
- drag/pan과 character movement gesture가 충돌하지 않도록 pointer capture와 touch action 영역을 분리한다.

## 2D 미션과 전략 게임

다음은 PixiJS를 우선한다.

- 보드 좌표와 턴이 핵심인 오목·체스·바둑형 규칙
- 2D 경로·타일 배치·매칭·리듬·회피 게임
- 3D 시점 변화 없이 한 화면에서 규칙을 읽는 퍼즐

게임 규칙은 pure reducer/state machine으로 두고 PixiJS는 board snapshot과 resolved event를 그린다. 턴, 합법 수, 승패, seed, timer와 보상 판정을 sprite click handler에 넣지 않는다. 서버 대전이 필요하더라도 S0 해제 전 소켓 구현을 시작하지 않는다.

## 스테이지 제작 도구

- 기존 `src/app/admin/stagemap`과 `StageMapEditor`를 우선 확장하고 별도 맵 정본을 만들지 않는다.
- 운영 `StageDoc -> editor draft -> validation -> reviewed write -> release manifest` 흐름을 유지한다.
- draft는 schema/version, stable source ID, 좌표 범위, entity count, R2 참조를 검증한다.
- drag 중에는 화면 상태를 갱신하되 undo history는 drag 종료 시 한 건만 기록한다.
- reset, import, overwrite, publish는 명시적 확인과 권한 검사를 거치고 unauthorized client에 운영 데이터를 먼저 보내지 않는다.
- 에디터 preview가 전투·보상·게임 save를 실행하지 않도록 director mode를 분리한다.

## 검증

- 현재 `package.json`의 ISO math, coordinate, render, movement, viewport, editor, stage release 테스트를 작업 범위에 맞게 실행한다.
- spawn, 이동 경계, depth overlap, pointer picking, 카메라 constraint, 포털/상호작용, scene 전환과 teardown fixture를 추가한다.
- 375/768/1024/1440px에서 키보드와 touch를 확인하고 장시간 이동 뒤 canvas, ticker, texture와 listener 수가 증가하지 않는지 확인한다.
- `StageDoc` 쓰기 또는 release 흐름을 바꾸면 브라우저 gate와 rollback target을 함께 검증한다.
