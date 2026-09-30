export const GAME_CONSTANTS = {
  // 그리드 및 크기 관련 상수
  CELL_SIZE: 20, // 공간 분할 그리드 셀 크기 (px)
  DEFAULT_USER_SIZE: 60,
  DEFAULT_NPC_SIZE: 60,
  DEFAULT_SPEED: 10,
  INIT_MAX_CHARACTERS: 10, // 초기 선택 가능한 최대 캐릭터 수

  // 스프라이트 이미지 비율 설정
  SPRITE_RATIO: {
    "1:1": {
      width: 1,
      height: 1,
    },
    default: {
      width: 1,
      height: 1.25,
    },
  },

  // 능력치 설정
  ABILITIES: {
    INTIMACY: 999,
    LEVEL: 999,
    XP: 100,
    HP: 200,
    MP: 200,
    IQ: 150,
    EQ: 150,
    LUCK: 100,
  },

  // 상호작용 관련 상수
  INTERACTION: {
    COOLDOWN_MS: 1500, // 상호작용 쿨다운
    MESSAGE_OFFSET_Y: -5, // 메시지 Y 오프셋
  },

  // 겹침(침투) 상태 탈출 관련 상수
  OVERLAP_ESCAPE: {
    ENABLED: true, // 필요 시 토글
    SPEED: 1.5, // 기본 이동 10이라면 1~2 권장 (현재 기본 5면 0.8~1.5)
    MAX_TICKS: 60, // 최대 60프레임(≈1초)만 강제 탈출 허용
    PENETRATION_EPS: 0.5, // 겹침으로 인정할 최소 침투 여유
    DOT_ALLOW: 0.05, // '밖으로 나가는 방향' 판정 임계치(내적)
  },

  // 장애물 생성 관련 상수
  OBSTACLES: {
    COUNT: {
      MIN: 15, // 최소 장애물 수 (도로 제외)
      MAX: 60, // 최대 장애물 수 (도로 제외)
    },
    BORDER_SAFETY_MARGIN: 20,
    PLACEMENT_ATTEMPTS: 50, // 장애물 배치 시도 횟수 제한
    PRODUCT_SIZE: 3, // 기본 커머스 프로덕트 사이즈 설정
    // Building, Sign 최대 생성 제한
    LIMITS: {
      LOW: {
        BUILDING: 12,
        SIGN: 8,
        PARK: 4,
        MULTI: 2,
      },
      MEDIUM: {
        BUILDING: 24,
        SIGN: 16,
        PARK: 8,
        MULTI: 4,
      },
      HIGH: {
        BUILDING: 48,
        SIGN: 32,
        PARK: 16,
        MULTI: 8,
      },
    },
  },

  // 애니메이션 관련 상수
  ANIMATION: {
    // 걷기 애니메이션
    WALKING: {
      HEIGHT_OFFSET: 5, // 걷기 시 최대 높이 오프셋 (픽셀)
      STEP_FREQUENCY: 10, // 걸음 주기 (프레임 수)
    },
    // 숨쉬기 애니메이션
    BREATHING: {
      HEIGHT_OFFSET: 2, // 숨쉬기 시 최대 높이 오프셋 (픽셀)
      CYCLE_DURATION: 60, // 숨쉬기 주기 (프레임 수)
    },
  },

  // 움직임과 충돌 관련 상수
  CONTACT_THRESHOLD_MULTIPLIER: 1.25, // NPC 접촉 감지 거리 배율
  MOVEMENT_STEPS: {
    DEFAULT: 2, // 기본 이동 속도
    MIN: 20, // 최소 이동 단계 수
    RANGE: 30, // 이동 단계 범위
  },

  // 시간 간격 상수 (ms)
  INTERVALS: {
    MOVEMENT: 30, // 이동 계산 주기
    MAP_UPDATE: 50, // 맵 업데이트 주기
    NPC_MOVEMENT_CHECK: 1000, // NPC 움직임 확인 주기
    STAGE_CHANGE_DELAY: 10, // 스테이지 전환 후 충돌 그리드 업데이트 지연
    PRELOAD_DELAY: 100, // 텍스처 프리로드 지연
    CACHE_CLEANUP: 1000, // 캐시 정리 간격 (1초)
    CACHE_CLEANUP_CHECK: 15000, // 캐시 정리 체크 주기 (15초)
    SEARCH_DEBOUNCE: 500, // 주제 검색 관련 디바운스 시간
  },

  // NPC 행동 관련 상수
  NPC_BEHAVIOR: {
    DIRECTION_CHANGE_PROBABILITY: {
      MIN: 0.01,
      MAX: 0.05,
    },
    WANDER_RADIUS: {
      MIN: 50,
      MAX: 150,
    },
    TARGET_DISTANCE: {
      MIN: 80,
      MAX: 120,
    },
    SPEED: {
      MIN: 0.5,
      MAX: 2.0,
    },
    PAUSE_DURATION: {
      MIN: 30,
      MAX: 90,
    },
    MOVE_DURATION: {
      MIN: 40,
      MAX: 120,
    },
    PATROL_POINTS: {
      MIN: 3,
      MAX: 5,
    },
  },

  // 메시지 및 UI 관련 상수
  UI: {
    MESSAGE_FONT_SIZE: 13,
    BOUNDARY_LINE_WIDTH: 4,
    BACKGROUND_COLOR: 0x9f9f9f,
    USER_TEXT_COLOR: 0x00ff55,
    NPC_TEXT_COLOR: 0xffffff,
    JOYPAD_POSITION: {
      BOTTOM: "20px",
      LEFT: "20px",
    },
    MAP_SCALE: 0.2,
    MOVEMENT_THRESHOLD: 10, // 마우스 드래그 감지 임계값
    PROTAGONIST_CLICK_DISTANCE: 20, // 주인공 클릭 인식 거리
    SMALL_TALK_LIMIT: 140,
    COMMERCE_TALK_LIMIT: 500,
  },

  // NPC 랜덤 배치 관련
  NPC_PLACEMENT: {
    ATTEMPTS: 200,
    GRID_STEP_DIVISOR: 2, // npcSize를 이 값으로 나눠서 그리드 단계 설정
    STAGE_BOUNDARY_PADDING: 0.1, // 스테이지 경계에서의 패딩 (비율)
    INNER_AREA_RATIO: 0.8, // 중앙 영역 비율 (경로 포인트용)
  },

  // 스테이지 관련
  STAGE: {
    Z_INDEX: {
      BACKGROUND: -10,
      BORDER: -1,
      PASS: -5,
      OBSTACLE: 0,
      PRODUCT: 1,
      PRODUCT_LABEL: 2,
      NPC: 10,
      NPC_NAME: 11,
      UI: 50,
    },
  },

  // Isometric 관련
  ISO: {
    // 기본 투영 방식
    // - true isometric(30°)을 쓰되, 실제 리소스는 2:1 타일을 사용
    PROJECTION: "isometric-2to1" as const,

    // 타일 픽셀 크기 (뷰 레이어 기준)
    TILE_WIDTH: 128,
    TILE_HEIGHT: 64,

    // 기본 풋프린트 크기 (타일 단위)
    // - 일반 바닥 타일/도로 타일의 기본 footprint
    DEFAULT_FOOTPRINT: {
      WIDTH_TILES: 1,
      HEIGHT_TILES: 1,
    },

    // 아이소 z-sorting 계산시 참고용 계수
    // - 예: isoZ = worldY * Z_FACTOR + isoHeightPx
    Z_SORT: {
      Z_FACTOR: 1,
    },
  },

  // 카메라 관련
  CAMERA: {
    DEFAULT_ZOOM: 1,
    // 카메라 이동 보간 계수 (0~1, 1에 가까울수록 즉각 추종, 0에 가까울수록 느리게 — cam += (target-cam)*lerp)
    LERP_FACTOR: 0.15,
    // 소프트 락 박스: 화면 중앙 기준으로 어느 정도 범위까지 카메라를 움직이지 않을지 비율로 정의
    SOFT_LOCK_BOX_RATIO: {
      X: 0.35, // 화면 너비의 35% 정도
      Y: 0.3, // 화면 높이의 30% 정도
    },
    // 카메라 월드 경계 모드 기본값
    BOUNDARY_MODE: {
      GAME: "finite-hard" as const,
      COMMERCE: "finite-hard" as const,
    },
    // 카메라 전환 관련
    TRANSITION: {
      // 기본 전환 타입: 카메라 패닝 + 페이드 모두 사용
      DEFAULT_TYPE: "pan-and-fade" as const,
      // 전체 전환 시간 (ms)
      DEFAULT_DURATION: 800,
      // 페이드 시 최대로 덮는 알파값 (0~1)
      FADE_MAX_ALPHA: 0.6,
    },
  },

  // 카메라 프로닝 관련
  PERF: {
    CULLING: {
      ENABLED: true, // 카메라 기반 프루닝 on/off
      VIEWPORT_PADDING: 200, // 카메라 뷰포트 주변 패딩(px) – 화면 밖 여유 영역
      INTERVAL_FRAMES: 15, // 몇 프레임마다 한 번씩 프루닝 수행 (60fps 기준이면 약 4fps)
    },
    WORLD_DATA: {
      // 카메라 중심이 이 거리 이상 움직였을 때만 worldData 재계산 (카메라 기준)
      MIN_CAMERA_DELTA: 320, // px (대략 스테이지 한 변의 30~50% 정도로 튜닝)
      MIN_UPDATE_INTERVAL_MS: 250, // worldData 최소 업데이트 간격(ms) – 기존 250ms를 상수화
    },
  },

  // 커머스 관련
  COMMERCE: {
    MAX_PRODUCTS_PER_STAGE: 8, // 커머스 스테이지당 최대 상품 배치 수
    MAX_TOTAL_BUILD_PRODUCT: 100, // 최대 전체 비즈니스 카탈로그 수
    PRODUCT_CONTACT_BUFFER: 10, // 상품 블록과 캐릭터와의 접촉 버퍼
    INITIAL_CONTACT_BLOCK_MS: 3000, // 초기 접속 시 상품 접촉 팝업 차단 시간(ms)
    MAX_RECOMMENDED_NAMES: 8, // 추천 상품 목록 생성 시 토큰 폭주 방지용 하드캡 (목록 수 제한)
    SEARCH_MIN_SCORE: 0.4,
  },

  // 폴백 관련 상수
  FALLBACK: {
    STAGE_ID: "amu",
    STAGE_NAME: "origin-world",
    ASSET_PATHS: {
      PERSONAS: "/assets/personas",
      PRODUCTS: "/assets/products",
    },
  },
};
