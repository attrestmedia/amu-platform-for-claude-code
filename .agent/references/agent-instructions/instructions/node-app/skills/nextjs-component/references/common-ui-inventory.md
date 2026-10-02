# Common UI Inventory

## 목적

- 프론트엔드 UI 작업 전에 공통 컴포넌트 재사용 가능성 판단 및 새 UI 생성 전 기존 자산 적용 가능 여부 체크를 위한 공통 UI 목록 문서

## 선택 기준

- `src/components/ui`: 범용 primitive, form, overlay, feedback, layout helper
- `src/components/module`: 도메인 조합형, 화면 단위 보조 UI, 재사용 가능한 업무/서비스 모듈

## src/components/ui

### Action / Form

- `button`
- `input`
- `textarea`
- `checkbox`
- `radio-group`
- `switch`
- `slider`
- `select`
- `combobox`
- `input-otp`
- `toggle`
- `toggle-group`
- `upload/file-upload`
- `upload/image-dropzone`

### Overlay / Navigation

- `dialog`
- `dialog/bottom-sheet-dialog`
- `drawer`
- `sheet`
- `dropdown`
- `popover`
- `tooltip`
- `accordion`
- `collapsible`
- `tabs`
- `pagination`
- `scroll-area`
- `command`

### Display / Feedback

- `badge`
- `label`
- `table`
- `progress`
- `progress/circle-progress`
- `skeleton`
- `toast/floating-toast`
- `sonner`
- `error`
- `preloader`
- `preloader/ImagePreloader`
- `statbar`

### Media / Utility

- `image/image-box`
- `image/adaptive-hero-image-stage`
- `avatar-thumbnail`
- `sprite-sheet-preview`
- `icon`
- `portal`

## src/components/module

### Auth

- `auth/LoginDialog`
- `auth/LoginModule`
- `auth/EmailLoginForm`
- `auth/EmailConsentModal`
- `auth/Login`
- `auth/Logout`

### Layout / Shell

- `layout/PageSheetHeader`
- `layout/ListSection`
- `layout/TopBar`
- `layout/WorkspaceShell` — 관리형·생성형 워크스페이스 셸(헤더·사이드바·본문). 정본 규칙: DESIGN-GUIDELINES §11.6
- `layout/WorkspaceSidebarToggle`
- `layout/WorkspaceSidebar`
- `layout/WorkspaceSidebarNav`
- `layout/TopBarProfileControl`
- `layout/SiteFooter`
- `layout/UserInfoEdit`
- `layout/ServiceManagementAddon`

### i18n / Provider

- `i18n/Lang`
- `i18n/LanguageProvider`
- `provider/NextAuthProvider`
- `provider/ReactQueryProvider`
- `provider/AppEmailConsentProvider`

### Commerce / Payments

- `commerce/CoinBalance`
- `commerce/CoinChargeWidget`
- `commerce/ProductList`
- `payments/CoinSummary`
- `payments/TossPaymentDialog`

### Selector / Common

- `selector/SearchableSelectBox` (검색 필터형 셀렉트박스, `tone="dark"` / `allowCustomValue` 옵션)
- `selector/CategoryDropdown`
- `selector/HorizontalOptionScroller`
- `common/GeneratedImageActionOverlay`
- `common/StatusFilter`
- `carousel/Carousel`

### Domain-Specific Reusable Modules

- `image/FixedAspectImageCropDialog`
- `persona/StructuredPersonaFieldset`
- `persona/SystemPersonaPresetPicker`
- `persona/TutorProfileImageSection`
- `persona/TutorPublicReferencePicker`
- `mini-apps/MiniAppDefaultLogo`
- `pixi/PixiFullscreenViewer`

## 새 UI를 만들어도 되는 조건

- 공통 목록에 없음
- 기존 컴포넌트 조합으로 해결 불가
- 요청 전용 또는 특수 목적 UI
- 재사용 범위와 위치(`ui` / `module` / feature local`)가 명확한 경우
