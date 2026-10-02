# 게임플레이 시스템 계약

## 목차

- [전투](#전투)
- [적과 AI](#적과-ai)
- [인카운터와 레벨](#인카운터와-레벨)
- [인벤토리와 진행](#인벤토리와-진행)
- [VFX와 오디오](#vfx와-오디오)
- [에셋](#에셋)

## 전투

- 모든 행동에 startup, active, recovery, cancel/interrupt, cost, cooldown, contact shape와 결과를 정의한다.
- hit, block, parry, dodge, interrupt는 거리·방향·phase·상태가 유효한 authoritative contact event에서 해결한다.
- `(actionId, targetId)`별 접촉을 한 번만 적용하고 animation/VFX/audio/UI는 해결된 이벤트를 소비한다.
- telegraph, 위험 구간, 접촉, 회복을 실제 카메라 거리에서 구분한다.
- early/late timing, 범위 밖, 반대 방향, 다중 target, pause/frame step, 반복 입력 fixture를 둔다.

턴제·보드 게임은 같은 원칙을 `turn intent -> legal move validation -> resolved event -> presentation`으로 적용한다.

## 적과 AI

적 시스템을 네 층으로 분리한다.

1. **Definition**: stable ID, archetype, stat, move ID, AI hint, reward policy reference, asset provenance
2. **Runtime**: instance ID, transform, health/posture, target, state, timer, cooldown
3. **Decision**: perception 입력에서 합법 intent 한 개를 선택
4. **View adapter**: sprite/rig, animation, VFX, audio, LOD를 구동

`idle`, `investigate`, `pursue`, `reposition`, `windup`, `attack`, `recover`, `stagger`, `defeated` 중 필요한 작은 상태 집합을 사용한다. 각 전이에 조건, 최소 유지 시간, 종료 조건을 둔다. 렌더 pose가 공격 성공이나 path 완료를 결정하지 않게 한다.

3D rig는 ground-contact root, 일관된 forward/up axis, semantic joints와 sockets, 단순 solid/navigation/hurt/attack/trigger collider를 제공한다. LOD가 바뀌어도 gameplay collider, root, socket과 action state는 유지한다. production model이 없으면 footprint·pivot·timing을 보존하는 명시적 placeholder를 사용한다.

## 인카운터와 레벨

- 목표, 공간, 적 역할, spawn timing, hazard, 사용 가능 자원, exit, 실패 복구와 보상을 함께 정의한다.
- 한 번에 새로운 압박 요인을 하나씩 추가하고 committed attacker 수를 제한한다.
- 카메라 밖 피해, 읽을 수 없는 연속 공격, 보상 중복 reset, unrelated zone까지 추격하는 상태를 막는다.
- critical route, recovery area, checkpoint, retry spawn과 objective anchor에 stable ID를 부여한다.
- 장식 geometry에서 zone·collision·navigation을 추론하지 않는다.
- 단일 평면은 보드·평면 아케이드처럼 설계가 요구할 때만 강제한다. 3D 공간 퍼즐은 이동 surface와 높이 전이를 별도 검증한다.

## 인벤토리와 진행

- item definition, ownership/instance, stack, equipment compatibility, 효과, presentation과 migration version을 분리한다.
- pickup, equip, swap, consume, sell은 source 소유와 destination 합법성을 검증한 뒤 전체 next state를 한 번에 commit한다.
- destination 확정 전에 source item을 제거하지 않는다.
- drag 외에 keyboard/touch 대안을 제공하고 tooltip은 중복 stat이 아니라 definition을 참조한다.
- full inventory, duplicate pickup, swap, save/load, migration, reset과 반복 dispatch에서 item identity 총량을 검증한다.
- 거래·보상은 클라이언트 inventory mutation이 아니라 서버 원장·에스크로·멱등 계약을 따른다.

## VFX와 오디오

- 입력 수락, windup, danger, contact, block/miss, damage, pickup, objective, death를 구분한다.
- 각 VFX에 trigger, owner, duration, gameplay meaning, spawn cap, cleanup, quality tier와 reduced-motion 대안을 둔다.
- transient object를 pool하고 geometry/material을 재사용하며 per-frame allocation과 무제한 particle을 금지한다.
- 오디오는 사용자 gesture로 unlock하고 voice 수, 우선순위, mute/volume, background 복귀와 완료 node 해제를 관리한다.
- 의미 있는 오디오에는 자막, 아이콘, 진동 등 시각·촉각 대안을 제공한다.

## 에셋

목적에 따라 표현을 고른다.

| 목적 | 기본 표현 |
| --- | --- |
| Pixi 월드 캐릭터·NPC·건물·타일 | 방향/상태 메타를 가진 sprite sheet와 R2 URL |
| 3D hero·복잡한 animation | 라이선스와 scale을 확인한 rigged GLB/GLTF |
| 단순 prop·pickup·variant | 재사용 geometry/material을 가진 절차적 Three.js 또는 경량 model |
| portrait·icon·HUD·concept | 투명 2D media와 DOM 대체 텍스트 |

- import 경로에서 coordinate, scale, pivot, material, clip, collider와 socket을 정규화한다.
- imported, procedural, generated 2D, reference-only를 구분하고 source/license/generation input을 기록한다.
- 생성형 에셋은 Gen Studio의 템플릿 선택·생성·사용자 결과 선택 과정을 거치고 R2에 저장한다.
- catalog card에서는 정적 preview를 우선하고 live WebGL은 선택된 inspector나 전용 review route에서만 초기화한다.
- asset viewer가 아니라 실제 카메라·조명·충돌·모바일 viewport·성능에서 검증한다.
