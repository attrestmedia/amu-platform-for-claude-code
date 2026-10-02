# 개발 알려진 이슈 등록부 (Known Issues Register)

개발·운영 중 **확정된** 버그·한계·함정과 그 해결·우회를 한 곳에 등록한다.
원인이 실측/확정된 것만 등록하고, 원인 미상 상태는 `.agent/docs/{scope}/{YYYY}/{MM}/`의 분석 보고서에만 남긴 뒤 확정 시 이곳에 추가한다.

- 상세 분석 보고서 경로: `.agent/docs/node-app/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`
- 이 문서의 정본: `.agent/agent-instructions/instructions/project/refs/known-issues.md` (`.codex/refs/`, `.claude/refs/`는 동기화 사본)

## 등록 규칙

항목마다 아래 필드를 채운다.

| 필드 | 내용 |
| --- | --- |
| 증상 | 사용자에게 어떻게 보이는가 |
| 원인 | 근본 원인(확정) |
| 해결 | 적용한 패치/패턴 (코드 스니펫 포함 가능) |
| 적용 위치 | 파일 경로 |
| 검증 | 어떻게 확인했는가 |
| 참조 | 분석 보고서 경로 |

---

## 이슈 목록

### 1. 중첩 모달 Dialog의 내부 스크롤 차단 (react-remove-scroll)

- **증상**: 모달 Sheet 안에서 또 다른 전체화면 Sheet(예: Gen Studio 생성 화면)가 열리면, 내부 콘텐츠의 마우스 휠·터치 드래그 스크롤이 전혀 동작하지 않음. 버튼·드롭다운 등 포인터 인터랙션은 정상, 스크롤만 막힘.
- **원인**: Radix `Dialog`(모달)의 body 스크롤 잠금에 쓰이는 `react-remove-scroll`이 문서 레벨 `wheel`/`touchmove` capture 리스너(`RemoveScrollSideCar.shouldPrevent`)로, 자기 콘텐츠 밖 휠에 `preventDefault()`. 모달이 중첩되면 자식 콘텐츠(포탈로 `<body>` 렌더)가 부모의 `shards`에 없고, React가 자식 `useEffect`를 먼저 실행해 `lockStack` 맨 위에 부모 인스턴스가 남아 자식 휠을 "외부"로 판정·차단. 단일 모달은 정상, 중첩만 차단.
- **해결**: 호스트(부모) Sheet를 `modal={false}`로 전환하고 부작용을 가드한다.

  ```tsx
  <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
    <SheetContent
      side="bottom"
      disableOutsideClick
      lockBodyScroll
      onFocusOutside={(event) => event.preventDefault()}
      className="..."
    >
  ```

  | 속성 | 이유 |
  | --- | --- |
  | `modal={false}` | 부모 `react-remove-scroll` 제거 → 내부 모달이 유일한 잠금 주체가 되어 자기 콘텐츠 스크롤 정상 |
  | `disableOutsideClick` | 비모달 + overlay 없음 시 시트 밖 노출 영역 클릭으로 즉시 닫히는 것 방지 |
  | `lockBodyScroll` | Radix 모달이 하던 body 잠금을 `@amu-labs/ui` 헬퍼로 유지(카운터 기반, 중첩 안전) |
  | `onFocusOutside` preventDefault | 내부 모달이 포커스를 가져가며 부모 비모달 Sheet가 focus-outside dismiss 되는 것 방지 |

  주의: 내부(자식)를 비모달로 바꿔도 해결 안 됨 — 차단 주체가 부모 모달이므로 부모를 풀어야 함. `modal={false}` 단독은 focus-outside dismiss로 Sheet가 열리자마자 닫히므로 위 가드 필수.
- **적용 위치** (`ImageStudioEditor(detailPresentation="sheet")` 중첩 호스트 4곳):
  - `src/components/module/store/StoreManagePanel.tsx` — `genStudioSheetOpen`(콘텐츠 스튜디오), `imageStudioSheetOpen`(이미지 스튜디오)
  - `src/components/module/store/product-image/SmartstoreVariantStudioSheet.tsx`
  - `src/components/module/store/model-reference/ModelReferenceRoleGenerator.tsx`
- **검증**: Playwright + 로컬 prod 빌드. 스마트스토어 관리 → 새 상품 → 썸네일 ⋯ → "Gen Studio에서 편집" → 템플릿 선택 → 생성 화면에서 실제 `mouse.wheel(0,600)` 후 좌측 패널 `scrollTop > 0` 확인. dev 모드(Turbopack HMR 상태 리셋)는 판정 불안정 → prod 빌드로 검증.
- **참조**: `.agent/docs/node-app/2026/09/20260907_213000__smartstore-genstudio-scroll-rootcause.md`

---

## 관련 도메인별 문서

- WordPress SEO 게이트 알려진 한계: `wp-seo-gate-known-limits.md`
- (추가 발생 시 이 문서 아래에 `### N.` 항목으로 등록)
