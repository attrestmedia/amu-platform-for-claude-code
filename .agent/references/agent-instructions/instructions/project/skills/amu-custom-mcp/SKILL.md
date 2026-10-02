---
name: amu-custom-mcp
description: AMU 플랫폼이 자체 운영하는 5종 커스텀 MCP(genstudio·amu-magazine·google-marketing·marketing-ops·visual-check)를 에이전트가 안전하게 호출하기 위한 통합 가이드. MCP 도구를 사용하기 전 항상 본 스킬을 먼저 참고할 것.
trigger: 에이전트가 위 5종 MCP의 도구를 사용해야 할 때 (Gen Studio 이미지·콘텐츠 생성, 참고 이미지·검색·템플릿 그룹·프롬프트·모델·생성 증거 관리, 매거진 검색, GSC/Ads 조회, 마케팅 queue 운영, 시각 검증 등)
---

# AMU 커스텀 MCP 사용 가이드 (Agent Skill)

이 스킬은 AMU 플랫폼이 운영하는 커스텀 MCP 서버 5종의 도구 카탈로그·인증 규칙·운영 주의사항을 한 곳에 모은 통합 참조 문서입니다.
**MCP 도구를 호출하기 전 항상 이 문서를 먼저 확인하고**, 도구별 세부 규칙(rate-limit, 인증, 페이로드 형식)을 따르세요.

---

## 0. 호출 전 공통 체크리스트

1. **연결 확인** — `.mcp.json`(Claude) / `.codex/config.toml`(Codex) / `opencode.json`의 `mcp`(OpenCode)에 호출 대상 MCP가 등록되어 있는가?
2. **인증 키** — `AGENT_API_KEY`(node-app 측 + MCP 측 동일값), `AGENT_BASE_URL`이 설정되어 있는가?
3. **권한** — 도구가 비용·DB 쓰기·외부 API 호출을 동반하는가? → 사전 검증 필수
4. **rate-limit** — 분당 한도(예: `AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE`)가 노드측에 설정되어 있는가?
5. **선행 가이드** — 도구별 도메인 가이드가 있는가?
6. **에러 회복** — 호출 실패 시 errorCode 분류 → 재시도/스킵/사용자 보고 중 어느 경로인가?
7. **target 확인** — local/production을 지원하는 도구는 `configured`에 의존하지 말고 의도한 target을 명시했는가?
7-1. **한글 인자** — 비ASCII 텍스트를 리터럴 UTF-8로 전달했는가? 손으로 쓴 `\uXXXX`·HTML 엔티티는 **모든 MCP·모든 필드에서 금지**이며, 긴 페이로드는 옮겨 적지 말고 파일·스크립트로 직렬화한다. 호출 후에는 응답을 검수해 원문과 대조한다 — 상세: `{{AGENT_ROOT}}/rules/text-encoding-integrity.md`
8. **schema 확인** — MCP 기능 추가·변경 뒤 node-app 배포, MCP build/restart, 에이전트 세션 재시작이 끝났는가?
9. **위임 경계** — 지금 이 호출을 하는 주체가 서브에이전트인가? 그렇다면 아래 §5 "서브에이전트 위임 경계"에서 허용된 도구인가?

---

## 1. MCP 인벤토리 (총 5종)

| MCP | 패키지 경로 | 핵심 용도 | 도구 수 | 비용 발생 |
|---|---|---|---|---|
| `genstudio` | `amu_labs/apps/mcp/gen-studio` | 프롬프트·템플릿 그룹·모델·생성 활동·증거 원장, 튜터 페르소나·CardNews 덱 조회/생성, 참고 이미지 검색·전달, AI 이미지·콘텐츠·비디오·오디오 job 생성·조회 | 33 | ✅ (이미지·콘텐츠·비디오·오디오·CardNews 생성) |
| `amu-magazine` | `amu_labs/apps/mcp/amu-magazine` | AMU 매거진(WordPress) 글 검색/열람 + 신규 기사 변환/draft 등록(local/production/both)/Article Experience·Editorial Cover 판정·meta 등록/SEO 재검증/발행 + 콘텐츠 정리(상태·카테고리·301/410) | 16 | ⚠️ (WordPress 쓰기) |
| `google-marketing` | `amu_labs/apps/mcp/google-marketing` | Google Search Console + Google Ads Keyword Planner 브리지 | 3 | ❌ (할당량) |
| `marketing-ops` | `amu_labs/apps/mcp/marketing-ops` | node-app 마케팅 queue/job 제어, 채널 발행, 로컬 에이전트 생성·전략 적합도·키워드 프로필 원장·매거진 프로모션 흐름, 운영 WordPress SEO·색인 조회 | 33 | ⚠️ (JOB 상세 서버 AI 검사만 코인 차감) |
| `visual-check` | `amu_labs/apps/mcp/visual-check` | Playwright 기반 다중 뷰포트 시각 검증 | 4 | ❌ |

---

## 2. 도구 카탈로그

### Gen-Studio CardNews

- `create_card_news_deck`, `get_card_news_deck`, `list_card_news_decks`는 `target=local|production`을 명시하고 `/api/ai/agent/card-news/decks` Agent route만 사용한다.
- 생성 입력은 source와 semantic CardContent이며, geometry·폰트·raw external asset URL을 AI/MCP가 직접 만들지 않는다. node-app의 versioned Template Resolver가 CardDeck을 생성한다.
- 생성 route scope는 `genstudio:card-news:write`, 조회 route scope는 `genstudio:card-news:read`다. production 생성은 MCP confirmation `CREATE_CARD_NEWS_DECK:production`이 추가로 필요하다.
- 생성 결과는 Agent UID owner 범위로 저장하고 source·template id/version·generatedAt·semantic content를 `agentMetadata`에 보존한다.

### 2.1 `genstudio`

| 도구 | 방향 | 비용 | 사용 시점 |
|---|---|---|---|
| `list_models` | R | 0 | 사용 가능한 image/text/video/audio 모델 카탈로그와 video·audio routable 상태 확인 |
| `generate_video_job` | C | ✅ 코인 차감 가능 | 명시적 target/provider/model로 비동기 비디오 job 등록; provider sandbox 승격 전 fail-closed |
| `get_video_job` | R | 0 | 비디오 job 상태와 내부 저장 asset 조회 |
| `list_video_assets` | R | 0 | assetId/jobId로 소유 비디오 asset 조회 |
| `estimate_audio_job` | R | 0 | template 기반 audio(TTS) 견적(무과금 서버 가격 snapshot) 조회 |
| `generate_audio_job` | W | ✅ 코인 차감 가능 | 명시적 target·voice·template로 비동기 audio job 등록; 요금 미확정 모델은 fail-closed |
| `get_audio_job` | R | 0 | audio job 상태와 내부 저장 asset 조회 |
| `list_audio_assets` | R | 0 | assetId/jobId로 소유 audio asset 조회 |
| `list_system_models` | R | 0 | node-app system model catalog 조회 |
| `upsert_system_model` | W | 0 (DB) | 검토된 system model 문서 upsert |
| `delete_system_model` | W | 0 (DB) | 기본 soft delete로 system model 정리 |
| `plan_model_catalog_sync` | R | 0 | model policy와 local/production 차이 계획 생성 |
| `apply_model_catalog_sync` | W | 0 (DB) | 검토한 planId/hash로 한 환경의 catalog 동기화 |
| `verify_model_catalog_parity` | R | 0 | local/production catalog 정합 검증 |
| `list_prompts` | R | 0 | 등록된 image/content 템플릿 목록·메타 조회 |
| `get_prompt_template` | R | 0 | template 본문·기본 파라미터·참고 이미지 정책 조회 |
| `list_template_groups` | R | 0 | local/production 그룹의 실제 멤버십·추천 조회 |
| `write_template_group` | W | 0 (DB) | 그룹 생성·metadata·멤버십·추천 편집 |
| `search_images` | R/X | 0 (외부 quota) | 기사·이미지 생성용 Pexels/Pixabay/Unsplash 검색 |
| `list_images` | R | 0 | 특정 templateKey 또는 `__gen_studio_custom_prompt__`로 생성된 자산 목록 |
| `list_recent_generations` | R | 0 | 최근 1~90일의 소유 생성 자산 또는 유니버스 public 생성 활동 조회 |
| `get_generation_evidence_bundle` | R | 0 | exact asset ID(이미지·콘텐츠)의 자산·생성 잡·과금 원장 상관 증거 bundle 조회 |
| `list_tutor_personas` | R | 0 | 튜터 페르소나 메타와 프로필 이미지의 생성 자산 연결(assetId) 조회 |
| `generate_image` | C | ✅ 코인 차감 | AI 이미지 생성, URL/base64 참고 이미지와 반영 강도 지원 |
| `generate_content` | C | ✅ 코인 차감 | 공개·활성 콘텐츠 템플릿으로 저장 가능한 텍스트 asset 1개 생성 |
| `get_content_asset` | R | 0 | 생성된 콘텐츠 asset의 본문 전문 조회 (본인 소유 또는 공개 자산, 1~5건) |
| `upsert_image_prompt_template` | W | 0 (DB) | 이미지 프롬프트 템플릿 신규/갱신 |
| `upsert_content_prompt_template` | W | 0 (DB) | 콘텐츠 프롬프트 템플릿 신규/갱신 |
| `delete_image_prompt_template` | W | 0 | 이미지 템플릿 삭제 (운영 데이터 사용 자제) |
| `delete_content_prompt_template` | W | 0 | 콘텐츠 템플릿 삭제 (운영 데이터 사용 자제) |

핵심 규칙:

- 템플릿 **신규 등록**은 **항상 `strictNew=true`로 시도**해 데이터 덮어쓰기 방지
- 기존 데이터 업데이트는 **원칙적으로 금지**한다. 아래 예외 하나에만 허용한다.
  - **예외 — 중복·유사 템플릿 개선(갱신):** `{{AGENT_ROOT}}/refs/content-policy/image_template_creation.md` 또는
    `content_prompt_template_creation.md`의 **착수 게이트 4단계**를 거친 갱신은 허용한다.
    선점 검사에서 중복(4축 중 3축 이상 일치) 또는 흡수 대상 유사로 판정된 경우, 새 key를 만드는 대신
    기존 key를 유지한 채 `strictNew=false` + `version = 기존 version + 1`로 가산 병합한다.
    절차·판정 근거 없이 `strictNew=false`를 쓰는 것은 여전히 금지다.
  - 이 예외에서도 `key` 변경과 기존 변수·옵션 라벨의 삭제·개명은 금지이며,
    갱신 후 `get_prompt_template` 재조회로 병합 결과와 한글 표기를 검수한다.
  - **부분 패치 지원(2026-08-20 수정)**: `upsert_image_prompt_template`/`upsert_content_prompt_template`은
    이제 진짜 부분 갱신이다. **호출에서 생략한 필드는 기존 값을 그대로 유지**하며(node-app
    `gen-studio-prompts` route가 `$set`/`$setOnInsert`를 분리해 신규 생성 시에만 기본값을 적용),
    가산 병합 호출에서 바뀌는 필드만 보내면 된다(`title`/`templateText`는 항상 필수).
    2026-08-20 이전에는 route가 `categories`/`tags`/`usageTip`/`defaultParams`/`inputPolicy`/
    `sceneTemplate`/`enabled`/`version`을 생략 시 기본값(`["general"]`/`[]`/`""`/`{}`/`true`/`1` 등)으로
    **항상 덮어썼다** — `natural-documentary-portrait` 템플릿 갱신 중 `inputPolicy.referenceImage`와
    `defaultParams.negative`(기존 11개 항목)가 유실된 사고로 실측 확인 후 수정했다. 그래도 습관적으로
    변경 의도가 있는 필드는 명시 전달하고, 갱신 후 `get_prompt_template` 재조회로 실제 반영값을
    대조하는 절차는 유지한다(서버 버전 드리프트·구 MCP 클라이언트 대비).
- `generate_image`의 `templateKey`가 미등록일 경우 — **임의로 `__gen_studio_custom_prompt__` 사용 전에** `upsert_image_prompt_template`으로 우선 등록 (메타에 `templateKey`가 있고 적합한 본문이 있을 때만)
- `generate_content`는 `target=local|production`을 반드시 명시하고 공개·활성 콘텐츠 템플릿만 사용한다. 기본 `visibility=public`이며 asset 소유자는 Agent API key에 연결된 `AGENT_UID`다.
- `generate_video_job`은 `target=local|production`, provider, modelName, prompt를 명시하고 예상 비용과 외부 provider 호출을 사용자에게 고지한 뒤 호출한다. 서버가 capability·launch state·잔액·멱등 키를 다시 검증한다.
- 비디오 job은 provider 임시 URL을 MCP에 직접 노출하지 않는다. worker가 R2에 저장하고 컨테이너/MIME/크기/hash를 검증한 뒤 내부 asset을 반환하며 private asset은 signed URL을 사용한다.
- `get_video_job`은 queued/running/success/partial/failed/expired/cancelled 상태를 읽고, `list_video_assets`는 agent UID 소유 asset만 반환한다. polling 재시도 전 job 상태와 asset을 확인하고 같은 clientRequestId를 재사용한다.
- `estimate_audio_job`·`generate_audio_job`은 `target=local|production`, voiceId, text, sourceRevision, templateKey를 명시한다. 서버가 승인 voice·template·locale·speed와 단가를 재검증하며 MCP는 voice 목록·가격을 자체 보관하지 않는다. estimate와 generate는 같은 fail-closed 가드를 탄다(단가 미설정 시 `PRICING_NOT_FOUND`). 생성은 provider 호출·코인 차감이 있으므로 사용자 고지·승인 후 호출한다.
- audio job은 provider 임시 URL·R2 원본 경로를 노출하지 않고 서버가 발급한 asset transport만 반환한다. `get_audio_job`·`list_audio_assets`는 agent UID 소유 asset만 반환하고 조회되지 않은 id는 `missing[]`로 돌려 타인 자산 존재 여부를 노출하지 않는다.
- 콘텐츠 샘플은 템플릿별 1개씩 생성하고, 비용·provider·model·최대 출력 토큰을 사전 고지한다. 성공 응답에 저장 asset이 없거나 `ASSET_PERSIST_FAILED`가 반환되면 과금 여부를 보고하고 자동 재시도하지 않는다.
- **`generate_content` 응답은 preview(실질 180자)만 싣는다.** 생성한 원고를 인용·활용하려면 `get_content_asset({ assetIds, target })`으로 본문 전문을 조회한다. Gen Studio UI가 모달에서 쓰는 `lab/studio-contents/[assetId]`는 세션 인증 전용이라 agent key로 진입할 수 없다.
- `get_content_asset`은 **본인 소유(`AGENT_UID`) 자산과 공개 자산만** 읽는다. 타인의 private 본문은 `missing[].reason=forbidden`으로 분리되고 본문이 내려오지 않으며, `state != active`는 `not_found`다. 요청당 1~5건.
- `get_generation_evidence_bundle`은 이미지 자산(`asset_…`)과 콘텐츠 자산(`content_asset_…`)을 모두 지원하며 응답의 `assetKind`로 구분한다. **한 요청에 두 종류를 섞을 수 없다.** 콘텐츠 bundle에는 본문이 없으므로 원고가 필요하면 `get_content_asset`을 함께 쓴다. 콘텐츠 전용 경고는 `ASSET_TEXT_EMPTY`, `JOB_NOT_SUCCEEDED`다.
- `generate_content`의 agent route는 **동기**다(UI 경로만 Job queue). 응답을 받지 못한 실패(`CLIENT_TIMEOUT`·`NON_JSON_RESPONSE`)는 서버가 생성을 끝내고 과금했을 수 있으므로 **과금 미확정**으로 취급하고, 재시도 전 `list_recent_generations`로 asset 생성 여부를 먼저 확인한다. 실패 응답의 `diagnostics`(httpStatus·bodySnippet·elapsedMs)를 보고에 그대로 남긴다.
- 마크다운 → 페이로드 매핑은 **반드시 `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md`** 절차를 따를 것
- 이미지/콘텐츠 템플릿 등록 전 입력 필드 문법(`{field::...}`, `{field*::...}`)과 조건 블록 문법(`{#if field == "value"}...{/if}`)을 함께 검증할 것
- 선택형 옵션에 확장 토큰(`라벨; 설명; 프롬프트`)을 쓴 경우, 등록 후 `get_prompt_template`로 본문을 재조회해 분절 구조와 옵션 개수가 의도대로 저장됐는지 확인할 것. 조건 블록과 `generate_image` 인자에는 옵션 원문 대신 **라벨**을 사용
- 조건 블록은 독립 if만 허용. `else`, `elseif`, 중첩 조건, `and/or` 조건이 포함된 템플릿은 등록 금지
- 조건 블록에서 참조하는 `field`는 같은 템플릿 안에 입력 변수로 정의되어 있어야 함
- key 변경(rename)은 **절대 금지** — admin UI에서만 처리
- system model catalog 작업은 `ai-model-catalog-sync` 정책의 plan → apply → verify 순서를 우선하고 production apply 확인 문구를 생략하지 않음
- Gen Studio 구현·운영 계약은 `/home/attrest-samsung-linux/Project/amu_labs/{{AGENT_ROOT}}/refs/genstudio-mcp.md`를 함께 참조
- `get_prompt_template`에서 `inputPolicy.referenceImage`를 먼저 확인하고, 필수이면 `minCount` 이상·`maxCount` 이하의 참고 이미지를 준비
- 기사나 콘텐츠에 참고 이미지가 필요하면 `search_images`를 사용하되 원문 페이지·attribution·license URL을 검토하고 필요한 출처 표기를 유지
- `generate_image.referenceImages`는 공개 URL 또는 PNG/JPEG/WebP base64만 사용하며, 항목별 10MB 제한과 사설망 URL 차단을 우회하지 않음
- 그룹 쓰기는 동일 target의 `list_template_groups` 선행 조회 → `write_template_group` → 재조회 순서로 실행
- 기존 그룹 연결에는 `add_templates`를 우선하고 `set_recommended` 전에 기존 추천 배열을 확인. production 쓰기는 사용자 명시 승인과 `APPLY_TEMPLATE_GROUP:<groupKey>:production` 확인 문구 필수
- 운영 생성 증거는 `get_generation_evidence_bundle({ assetIds, target: "production" })`으로만 조회하고 임의 DB query나 `configured` target으로 대체하지 않음
- 최근 생성 활동은 기본 `scope=mine`으로 조회한다. `scope=universe`는 public 자산 조회일 뿐 콘텐츠 활용 동의를 뜻하지 않으므로 타 사용자 자산을 콘텐츠 큐에 자동 등록하지 않음
- `list_tutor_personas`는 튜터 캐릭터를 증거로 다루는 유일한 경로다. `list_recent_generations`는 이미지 자산만 반환하므로 튜터의 실재·공개 여부를 판정할 수 없다
  > 튜터와 자산의 연결은 assetId가 아니라 `profiles`의 이미지 **URL**이며, private 자산 URL에만 경로에 assetId가 있고 public 자산 URL에는 없다. **URL 문자열에서 assetId를 파싱하지 말 것** — 서버가 저장된 `storage.url` 역조회로만 해석한다
  > 응답의 `unresolvedImageUrls`는 자산 연결이 확인되지 않은 이미지다. **확인된 자산으로 취급하지 않으며 콘텐츠 증거로 쓰지 않는다**
  > `target`은 필수이며 이어서 호출할 `get_generation_evidence_bundle`과 **같은 값**을 쓴다. 환경이 어긋나면 조회는 성공하는데 상관 검증이 빈다
  > 응답에 소유자 uid는 포함되지 않는다(`isOwnedByAgentKey` boolean만). 개인 튜터 컬렉션(`tutors_{userKey}`)은 조회 범위 밖이다
- 생성 증거 도구는 한 번에 asset ID 1~10개만 전달하며 UID·URL·R2 경로·원문 prompt·ledger meta가 응답에 포함됐다고 가정하지 않음
- **`integrity.warnings`는 차단·비차단 두 갈래로 판정한다** (2026-08-13 확정). 판정 기준은 **증거 사슬(자산 ↔ 잡 ↔ 원장 ↔ 프롬프트)이 성립하는가** 하나다
  > **차단 11종** — 하나라도 있으면 verified 증거로 쓰지 않는다:
  > `ASSET_NOT_FOUND` · `ASSET_JOB_ID_MISSING` · `ASSET_SHA256_MISSING` · `ASSET_TEXT_EMPTY` ·
  > `JOB_NOT_FOUND` · `JOB_NOT_SUCCEEDED` · `JOB_PROMPT_HASH_MISSING` · `PROMPT_HASH_MISMATCH` ·
  > `LEDGER_NOT_FOUND` · `APPLIED_CHARGE_NOT_FOUND` · `MULTIPLE_APPLIED_CHARGES`
  > **비차단 2종** — 증거 사슬과 무관한 표시용 storage 메타 누락이라 승격을 막지 않는다:
  > `ASSET_DIMENSIONS_MISSING` · `ASSET_BYTES_MISSING`
  > 비차단 경고가 남아 있으면 **감추지 말고 보고에 코드를 그대로 적는다.** 무결성은 `ASSET_SHA256_MISSING`이 따로 지키므로 bytes·치수 누락으로 사슬이 흔들리지 않는다
  > **경고 0건을 승격 요건으로 삼지 않는다** — 정상 자산이 표시용 메타 누락 하나로 영구 차단되는 사고가 있었다(`asset_32b1437e102c4145885c748019ca9fc5`, `width/height=0`)
- **`PROMPT_HASH_MISMATCH`는 자산 1개씩 조회해 판정한다** (2026-08-13 실측). 서버의 이 경고는 자산↔잡 대조가 아니라 **번들 안 job들의 promptHash가 전부 같은지**를 보는 교차 비교다(`generationEvidenceService.ts:217-224` — `jobs.length > 1`이고 해시가 하나로 수렴하지 않으면 발생)
  > 따라서 **서로 다른 프롬프트로 만든 자산을 2개 이상 한 번에 넣으면 정상 자산에서도 반드시 발생**한다. 같은 templateKey 누적 묶음을 증거로 쓰는 작업(`TASK-CREATION-LOG` 등)이 구조적으로 전부 차단된다
  > 판정 절차: 묶음 전체 조회로 개요를 본 뒤, **proofLevel 승격 판정은 assetIds 1개씩 재조회한 결과로 한다.** 단건 조회에서 `PROMPT_HASH_MISMATCH`가 나오면 그때는 실제 사슬 문제다
  > 실측: 4건 동시 조회 시 `PROMPT_HASH_MISMATCH` 발생 → 같은 자산 4건을 1개씩 조회하면 전부 `promptHashesEqual=true`, 차단 경고 0건(`editorial-isometric-flat-illustration`, 2026-08-13)
  > 이 경고를 비차단으로 재분류하지 않는다. 단건 조회에서의 의미는 그대로 유효하다
- 생성 증거 읽기 승인은 P2 착수·이미지 생성·유료 재시도 승인이 아니며 `generate_image` 비용 고지 절차를 그대로 유지
- 단일 운영 key는 기존 node-app의 `AGENT_API_KEY + AGENT_UID`를 재사용하며 같은 key를
  `AGENT_API_KEYS_JSON`에 중복 선언하지 않음. 다중 key로 전환할 때만 legacy pair를 대체하고
  `genstudio:evidence:read` scope를 명시
- `generate_image` 실전 제약:
  - 콘텐츠 이미지 모델 선택은 `{{AGENT_ROOT}}/refs/content-policy/image_model_routing.md`를 따른다. MCP 기본 라우트는 `supporting_visual`이며 Z.ai `glm-image`를 우선하고, 활성화되지 않았거나 참고 이미지가 있거나 1,000자 프롬프트 제한을 넘으면 `gemini-2.5-flash-image`로 폴백한다.
  - 텍스트 없는 그래픽은 `routingProfile=graphic_no_text`, `textPolicy=none`으로 Nano Banana → Grok Imagine 순서를 사용한다.
  - 템플릿 대표 샘플·고품질·이미지 내 텍스트는 `routingProfile=premium_template_sample`로 Nano Banana 2 → GPT Image 2.5 Flare 순서를 사용한다. 일반 본문 보조 이미지에는 상위 라우트를 쓰지 않는다.
  - agent 경유 호출에서 `gemini-3-pro-image-preview`는 라우팅 후보가 아니다.
  - `aspectRatio` enum에 `2:3`은 없음 — 세로 프로필 이미지는 `3:4` 사용
  - `generate_image.size`는 MCP에서 최대 1K급만 허용 — Google은 `512`/`1K`, OpenAI·xAI는 `1024x1024`/`1024x1536`/`1536x1024`/`auto`; Google `2K`/`4K`는 schema에서 거부
  - google 크레딧 소진/openai 타임아웃 시 xai `grok-imagine-image`로 폴백 가능 (단 `1:1`/`9:16`/`16:9`만 지원)
  - 전 프로바이더 + `__gen_studio_custom_prompt__`까지 전부 `assets 0 / coins 0`이면 크레딧 문제가 아니라 **백엔드 장애**다 — 유료 재시도를 반복하지 말고 MCP 재시작 후 사용자 보고
- 한글 인자(제목/태그/키워드/본문 등)는 **리터럴로 입력**한다 — `\uXXXX` 이스케이프 전달 시 DB에 깨진 문자열이 저장된 사례 2건(`오버 더 숄더` → `오버 더 숬더` 등). 등록 응답을 검수해 깨졌으면 `strictNew=false`로 즉시 정정하고, 같은 호출의 다른 필드도 함께 확인. 전역 규칙: `{{AGENT_ROOT}}/rules/text-encoding-integrity.md`

### 2.2 `amu-magazine`

| 도구 | 방향 | 사용 시점 |
|---|---|---|
| `search_posts` | R | 키워드/카테고리/태그로 매거진 글 검색 |
| `read_post` | R | slug/ID로 단건 본문 + 메타 + 이미지 조회 |
| `browse_posts` | R | 카테고리·태그·기간 등 조건 페이지네이션 |
| `read_posts` | R | 여러 slug 한 번에 일괄 조회 |
| `convert_article_document` | R/C | 신규 기사 markdown을 기존 `format_converter`로 HTML 변환하고 metadata 추출 |
| `analyze_article_seo` | R | 자체 SEO 게이트 점수와 required check 검사 |
| `analyze_editorial_cover` | R | Editorial Cover 문법·tension·설명형 요소·cover/Hero asset 분리·리뉴얼 판정 기록 검사 |
| `create_wordpress_draft` | W | WordPress REST API로 draft 생성/slug 기준 갱신. `target: local|production|both` 지원. 기본 `dryRun=true`, `skipSeoAnalysis=true`(SEO 분석 기본 생략, 필요 시 `false`로 활성화) |
| `register_article_experience` | W | 기존 post에 기사 metadata의 Article Experience v1 선언을 `amu_article_experience` meta로 등록·검증. 기본 `dryRun=true`, 실제 저장은 confirm 필요 |
| `update_post_status` | W | 포스트를 `draft|pending|private|future|trash`로 변경. `publish`는 SEO 게이트 도구만 사용. 기본 `dryRun=true` |
| `set_post_categories` | W | 포스트 카테고리 교체. **`categoryIds`는 하위 카테고리 ID 정확히 1개**(최상위·복수 지정 거부). 기본 `dryRun=true` |
| `manage_category` | W | 카테고리 생성·수정·삭제. 최상위(`parent=0`) 생성·승격은 `allowTopLevel=true` 필요. 삭제는 포스트 수 0인 경우만 허용. 기본 `dryRun=true` |
| `manage_content_redirect` | W | 내부 경로의 301/410 규칙 생성·갱신·삭제. WordPress `amu-content-redirects` mu-plugin 필요. 기본 `dryRun=true` |
| `verify_wordpress_draft` | R | 저장된 WordPress draft를 다시 읽어 자체 SEO 게이트 재검증 |
| `publish_wordpress_post` | W | SEO 통과 draft만 publish 전환. production은 별도 env flag 필요 |

핵심 규칙:

- `analyze_article_seo`/`verify_wordpress_draft` 사용 전 **`{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md`의 알려진 한계**를 확인하고, `verify_wordpress_draft`에는 항상 `focusKeyword`/`seoDescription`을 명시 전달할 것 (생략 시 빈 키워드로 30점대 오탐)
- 신규 기사 초안의 **내부 링크 클러스터(허브 1 + 같은 카테고리 심화 2 + 다른 카테고리 전환 1)** 구성 시 반드시 `search_posts`로 실제 존재 글을 확인 후 `/slug` 형태로 적용
- 리라이팅 시 기존 slug **절대 변경 금지** — `read_post`로 원문 확인 후 본문/이미지만 갱신
- 매거진에 등록된 이미지 URL은 신규 글에서 재사용 가능
- 신규 기사 등록 자동화는 `convert_article_document` → `analyze_article_seo` → `create_wordpress_draft` → `verify_wordpress_draft` → `publish_wordpress_post` 순서로만 진행
- `create_wordpress_draft`와 `publish_wordpress_post`는 기본 `dryRun=true`로 먼저 실행해 payload와 SEO 결과를 확인
- `create_wordpress_draft`는 metadata에 Article Experience 필드가 있으면 기본적으로 `amu_article_experience` 선언도 등록한다. dry-run에서는 post ID·slug를 아직 결합하지 않은 template을 반환하고, 실제 draft 생성 후 WordPress의 post ID·slug를 결합해 `context=edit` 검증까지 완료한다.
- 편집용 `interactionSlots`의 `candidateModule`·자유 서술형 `intent`는 배포 contract가 아니다. canonical `articleExperience.slots`가 없는 E1 slot은 `moduleType: "static"`으로 투영하고, E2/E3 native module은 `allowedProps`·service/context/template key를 포함한 canonical 선언만 허용한다. 1~3 slot·primary 1개·enum intent 규칙을 MCP가 WordPress 쓰기 전에 선검증하며 위반 시 fail-closed한다.
- 기존 글의 메타만 보정할 때는 `register_article_experience`를 사용한다. `filePath` 또는 직접 `metadata`를 전달하고, 실제 저장에는 `confirm: "register-article-experience"`, 기존 선언 교체에는 `replaceExisting: true`가 필요하다. local·production은 post ID가 다를 수 있으므로 순차 별도 실행한다.
- `realityLens`는 편집 세계관 메타이며 WordPress Article Experience declaration의 허용 필드가 아니다. 이를 `amu_article_experience`에 복사하지 않는다.
- `update_post_status`·`set_post_categories`·`manage_category`·`manage_content_redirect`는 모두 기본 `dryRun=true`이며, 실제 실행에는 도구별 `confirm`과 현재 상태 검증값이 필요하다. production은 `AMU_PUBLISHER_ALLOW_PRODUCTION_CLEANUP=true`가 추가로 필요하다.
- `update_post_status`의 `trash`는 복구 가능한 WordPress 휴지통 이동이다. 영구 삭제 도구는 제공하지 않는다.
- **포스트 카테고리 계약 (2026-09-12 신설): 한 포스트는 카테고리 1개이며, 그 1개는 최상위가 아닌 하위 카테고리여야 한다.**
  - `set_post_categories`는 `categoryIds` 길이가 1이 아니거나 최상위(`parent=0`) 카테고리면 **dry-run에서도** 거부한다. 상위+하위를 함께 넣지 않는다 — 상위는 하위의 `parent`로 이미 표현된다.
  - `create_wordpress_draft`의 `metadata.category`는 하위 카테고리 slug 1개다. **생략하면 기존 카테고리를 유지**하고(리뉴얼 교체 등록), 지정했는데 해석되지 않으면 경고가 아니라 오류로 중단한다(미해결 시 WordPress 기본 최상위 카테고리로 떨어지기 때문).
  - 유효한 하위 카테고리 slug 목록의 정본은 `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`의 "카테고리 구조와 카테고리 slug"다.
- `manage_category` 삭제는 `count=0`을 확인한 뒤에만 허용한다. 포스트를 먼저 `set_post_categories`로 다른 **하위** 카테고리에 배정해야 한다.
- `manage_category`로 최상위 카테고리를 새로 만들지 않는다. 포스트는 하위 카테고리에만 배정하므로 최상위가 늘어나면 배정 대상 없는 분류가 생긴다. 불가피하면 `allowTopLevel=true`를 명시하고 사용자 승인을 먼저 받는다.
- `manage_content_redirect`는 상대 경로만 허용하고 `/wp-json`, `/wp-admin`, `/wp-login.php` 경로를 차단한다. 301 destination은 같은 사이트 내부 경로만 사용한다.
- `create_wordpress_draft`의 `target=both`는 local과 production draft를 한 번에 생성/갱신
  > 운영 인스턴스에 대한 실제 쓰기를 포함하므로 `dryRun=false` 호출은 사용자 명시 동의가 있을 때만 실행
- **`filePath`는 반드시 `AMU_PUBLISHER_ALLOWED_ARTICLE_ROOTS`로 등록된 루트(현 운영값: `/home/attrest-samsung-linux/Project/.agent/content/articles`) 아래의 절대경로만 사용** 
  > 동일 파일의 mirror/mount 경로(예: `/home/attrest-samsung-linux/Project/.agent/content/articles/...`)를 넘기면 `허용되지 않은 기사 파일 경로입니다` 에러로 즉시 거부됨. 호출 전 `ls`로 허용 루트 존재 여부를 검증할 것.
- **`verify_wordpress_draft`는 병렬 호출 절대 금지** local·production 두 곳을 모두 검증해야 할 때는 단일 메시지에서 동시 호출하지 말고, ① local 호출 완료 → ② 결과 확인 → ③ production 호출 순으로 **순차 진행**
  > 병렬 호출은 MCP 측 직렬 처리 대기 + production REST 응답 지연이 누적되어 장시간 hang으로 이어질 수 있음. 응답이 지나치게 지연되거나 정상 범위를 벗어나면 해당 작업 강제 종료 후 다음 지침을 기다릴 것.
- production 대상 호출(`target=production` 또는 `target=both`의 production 단계)은 항상 별도 단계로 분리해 사용자가 결과를 확인할 수 있도록 함. 
  > 한 번의 메시지에서 local 갱신·production 갱신·local 재검증·production 재검증을 모두 한꺼번에 묶지 말 것.
- 등록 전 자체 SEO 분석은 기본 생략(`skipSeoAnalysis=true`)된다. SEO 리포트가 필요하면 `skipSeoAnalysis: false`를 명시해 호출. 등록 후 SEO 검증은 종전대로 `verify_wordpress_draft`를 사용.
- 사람이 직접 처리해야 하는 경우(에이전트 latency 우회 등)에는 동일 operation을 공유하는 CLI `pnpm --filter @amu_labs/mcp-amu-magazine wp:draft`를 사용함. 옵션·환경변수·안전장치는 [부록] 참고.
- production 발행은 `AMU_PUBLISHER_ALLOW_PRODUCTION_PUBLISH=true`, `dryRun=false`, `confirmSlug` 일치, SEO 게이트 통과가 모두 필요
- 운영(`target=production`) 호출은 node-app `wp-proxy` 경유이며 **WP 자격증명 env가 필요 없다**(`AGENT_API_KEY`, `AGENT_BASE_URL`만 필요). `AMU_WP_PRODUCTION_*`는 폐기된 값이므로 그 부재를 차단 사유로 보고하지 않는다 — 3장 "WordPress 자격증명 주의" 참조.
- 자체 SEO 게이트는 Yoast UI 녹색불 복제가 아니라 운영 자동화용 품질 기준으로 Yoast meta는 WordPress REST meta 등록 상태에 따라 저장이 제한될 수 있음.

### 2.3 `google-marketing`

| 도구 | 방향 | 사용 시점 |
|---|---|---|
| `search_console_sites` | R | 현재 OAuth 계정이 접근 가능한 GSC 속성 목록 |
| `search_console_query` | R | Search Analytics 데이터(쿼리/페이지/디바이스 dimensions) |
| `google_ads_keyword_ideas` | R | Keyword Planner 시드(키워드/URL) → 아이디어 + 검색량 |

핵심 규칙:

- `google_ads_keyword_ideas` 호출 전 `GOOGLE_ADS_DEFAULT_LANGUAGE_ID`(예: 한국어 `1012`)/`GOOGLE_ADS_DEFAULT_GEO_IDS`(예: 대한민국 `2410`) 확인
- 결과는 **롱테일 우선**으로 필터링 — 조건부(브랜드/상업/정보성) 키워드는 §8의 새 기사 초안 정책에 따라 사유와 예산 영향을 함께 명시
- API quota는 일별 제한이 있으므로 동일 seed 재호출은 캐시·기록 후 재사용

### 2.4 `marketing-ops`

| 도구 | 방향 | 사용 시점 |
|---|---|---|
| `list_jobs` | R | queue/job 상태 조회 + 채널별 `recommendedUploadSchedules`(추천일·허용 시간·정책 버전·추천 토큰) 제공·캐시 |
| `update_upload_policy` | W | `list_keyword_profiles`로 확인한 버전을 조건으로 채널별 일/주 cap·간격·허용 시간 부분 갱신. **cap의 단일 출처**(ADR #19) |
| `update_marketing_criteria` | W | 마케팅 적합도 기준(goal·targetPersona·funnel·primaryConversion·coreMessage·requiredTopics·excludedTopics·channelGuidance) 부분 갱신. `list_keyword_profiles`의 `settings.marketingCriteria.version` 선조회 필수 |
| `update_keyword_settings` | W | 기본 앵커 설정(defaultAnchorKeyword·defaultLookbackDays·defaultTimeUnit·defaultDevice) 부분 갱신 |
| `upsert_keyword_cluster` | W | 키워드 클러스터 등록·부분 갱신. 사용 중지는 `enabled=false`(삭제 도구 없음 — 프로필이 참조 중일 수 있음) |
| `update_advertising_criteria` | W | `get_content_fit_strategies`로 확인한 버전을 조건으로 광고 기준 부분 갱신. 문구 원문은 원장에만 저장 |
| `upsert_keyword_profile` | W | 키워드 프로필 등록·부분 갱신. `list_keyword_profiles` 선조회 필수, 클러스터 실재 검증과 앵커 변경 확인이 서버에서 강제됨 |
| `enqueue_content` | W | WordPress slug/url 또는 **일반 웹 URL/직접 sourceSnapshot**을 마케팅 queue에 등록(채널 지정 가능) |
| `get_job` | R | 기본 compact 완료 상태. `view=proofread`는 검수 진단, `view=full`은 운영 디버깅 |
| `poll_worker` | W (1회) | node-app 서버 bridge worker 1회 수동 실행 |
| `prepare_local_generation` | W | queue job 1건을 로컬 에이전트 생성 모드로 claim |
| `get_content_fit_strategies` | R | `prepare_local_generation`의 fit 전략 번들 로드 실패 시 fallback 조회 |
| `submit_local_generation` | W | 로컬 생성 결과(drafts/validation)를 파이프라인에 제출 |
| `apply_channel_action` | W | 채널 승인/완료/이미지 첨부 + `publishHour` 예약. **에이전트는 `attach_image`·`remove_image`만 사용**하고 예약·완료·발행 액션은 호출 금지(아래 핵심 규칙) |
| `get_social_profiles` | R/API | 저장 자격증명으로 Threads/Instagram/LinkedIn 현재 프로필 조회. Naver Blog 미지원 상태도 명시적으로 반환 |
| `list_promo_creatives` | R | AMU Magazine 프로모션 소재·슬롯·검수 상태 조회 |
| `save_promo_creative` | W | 기존 카피/이미지 URL을 draft로 저장. 템플릿 생성은 수행하지 않음 |
| `submit_promo_creative_review` | W | 프로모션 소재를 사람 검수 대기로 전환. 활성화 권한 없음 |
| `get_ga_configuration` | R/API | GA4 맞춤 정의·주요 이벤트·스트림 설정과 최근 이벤트를 읽기 전용으로 조회. 비밀 자원 제외 |
| `get_wp_seo_insights` | R | 운영 WordPress의 색인·분류·콘텐츠 재고 조회 + 글별 Yoast 점수/신호등(읽기 전용). 명명 질의 8종. **로컬 사본 수치를 마케팅·SEO 판정 근거로 쓰지 않는다** |

핵심 규칙:

- 권한은 통합 어드민의 마케팅 자격증명에서 `agent` provider로 관리 — env allowlist가 아님
- uploadPolicy 변경은 `list_keyword_profiles` 선조회 → 현재 `settings.marketingCriteria.uploadPolicy.version`을 `update_upload_policy.expectedVersion`으로 전달 → 응답 재확인 순서로 수행한다. 버전 충돌 시 임의 재시도하지 않고 다시 조회해 최신 정책과 변경 의도를 대조한다.
- 키워드 프로필은 `list_keyword_profiles` 선조회 → `upsert_keyword_profile` → 재조회 순서로 다룬다. 클러스터는 최초 조회 시 seed가 부트스트랩되지만 **프로필은 자동 생성되지 않으므로 빈 목록은 장애가 아니라 미등록 상태**다. 등록 단위는 게시물이 아니라 클러스터 또는 캠페인이며, `clusterKey`는 조회한 `clusters`에 실재하는 활성 키만 사용한다.
- `upsert_keyword_profile`은 전달하지 않은 필드의 기존 값을 유지하지만 배열 필드(`seedKeywords`/`negativeKeywords`)는 통째로 교체된다. 후보를 추가할 때는 조회한 목록에 더해 전체를 보낸다. 기존 프로필의 `anchorKeyword` 변경은 `anchorIndex` 비교가 단절되므로 `confirmAnchorChange=true` 없이는 409로 차단된다 — 점수가 낮다는 이유로 앵커를 바꾸지 않는다.
- 광고 기준 변경은 `get_content_fit_strategies` 선조회 → 현재 `advertising.criteria.version`을 `update_advertising_criteria.expectedVersion`으로 전달 → 응답 재확인 순서로 수행한다. 목록 항목은 배열/줄바꿈으로만 나누고 문장 안 쉼표를 보존한다.
- 일 cap을 2 이상으로 올릴 때는 `preferredHours`에서 `minGapHours` 이상 떨어진 슬롯이 cap만큼 있는지 함께 확인한다(슬롯이 부족하면 같은 시각에 몰린다).
- **`uploadPolicy`는 채널별 발행 cap의 단일 출처다**(ADR #19). 소셜 콘텐츠 생성 사이클마다 `list_keyword_profiles`로 조회하고, 조회한 `version`을 보고에 남긴다. 정책 문서나 이전 세션의 수치를 cap 판정에 사용하지 않으며, 조회 실패 시 fail-closed로 중단한다.
- **`marketingCriteria`는 콘텐츠 생성 시 에이전트에게 주입되는 실행 기준이다.** `prepare_local_generation`이 이 값을 전달하므로, 정책 문서(`.agent/amu-platform-guide/`)만 고치고 원장을 두면 **산출물은 계속 구 전략으로 생성된다.** 전략을 바꾸면 `update_marketing_criteria`로 원장도 같은 작업 단위에서 갱신한다. 문안 정본은 `.agent/amu-platform-guide/BRAND-MESSAGING.md` §3.2.
- `marketingCriteria`·`uploadPolicy`·`advertising.criteria`는 **version이 서로 다른 독립 낙관적 잠금**이다. `expectedVersion`은 각 도구가 지시한 필드에서 읽는다(`settings.marketingCriteria.version` / `settings.marketingCriteria.uploadPolicy.version` / `advertising.criteria.version`). 409 충돌 시 임의 재시도하지 않고 재조회 후 변경 의도를 다시 대조한다.
- `requiredTopics`·`excludedTopics`는 **항목당 80자·최대 30개**이며 전달 시 목록 전체가 교체된다. `channelGuidance`는 전달한 채널만 병합된다.
- 키워드 전략은 **유니버스 단위**다. `universeId`를 생략하면 env 기본값이 쓰이므로, 여러 유니버스를 다루는 작업에서는 항상 명시한다.
- `poll_worker`는 호출 1회당 worker 1회만 실행. **자동 반복 polling/cron 금지**
- 로컬 에이전트 생성 흐름: `enqueue_content` → `prepare_local_generation`(source + fit 전략 번들) → 로컬 모델 생성/적합도 평가 → `submit_local_generation` → `get_job(view="completion")`
- **기본은 로컬 에이전트 직접 생성**: 콘텐츠 채널 draft는 현재 MCP 클라이언트(로컬 에이전트 모델)가 직접 작성한다. `enqueue_content` 호출 시 `generationMode: "local_agent"`를 **항상 명시**한다(생략 시 서버 기본 분기 → server_worker provider 모델로 생성). `modelName`/`modelProvider`는 server_worker 전용이므로 로컬 생성 시 전달하지 않는다.
- `prepare_local_generation` 응답의 `source.outline`, `source.sourceQuotes`, `source.keyTerms`, `source.allowedClaims`를 1차 근거로 사용한다. `source.excerptText`만으로 채널 본문을 작성하지 않는다.
- `submit_local_generation`의 각 validation에는 `sourceCoverage.usedSections`, `sourceCoverage.usedTerms`, `sourceCoverage.unsupportedClaims`를 반드시 포함한다. 원문 근거가 없는 핵심 주장은 `unsupportedClaims`에 기록하고 `valid=false`로 제출한다.
- `submit_local_generation`의 validation에는 `channelFit`과 별도로 `marketingFit`, `adFit`, 각 `strategyVersion`을 포함한다. 점수 경계는 85+ `fit`, 70~84 `needs_work`, 0~69 `not_fit`이다.
- `prepare_local_generation.contentFitStrategies`를 우선 사용하고 `fitStrategiesError`가 있을 때만 `get_content_fit_strategies`를 1회 호출한다.
- Naver Blog는 주제가 블로그 목표와 등록 마케팅 전략에 부적합하면 본문을 생성하지 않는다. 대신 `excluded: true`, `exclusionReason`, validation을 제출해 exclusion marker와 `skipped` step을 남긴다.
- **server_worker/`poll_worker`로 콘텐츠 본문 생성 금지**: `poll_worker`(서버 bridge worker)는 provider API(GPT/Gemini 등)를 호출해 본문을 생성하므로 한국어 품질·브랜딩·톤 통제가 약하다. 콘텐츠 생성 목적으로는 호출하지 않는다(서버 워커는 비용·품질 리스크의 fallback 경로).
- **완료 게이트에 생성 주체 확인**: `get_job(view="completion")`의 `metrics.localAgent`(`status=submitted`, `modelName`=현재 에이전트 모델)로 로컬 생성 여부를 판정한다. 흔적이 없으면 서버 워커 결과로 보고 재생성한다. `request.generationConfig.modelName`은 enqueue 시점 server_worker 설정값이라 로컬 제출 후에도 그대로 남으므로 판정 기준이 아니다.
- 채널은 현재 `threads`, `instagram`, `linkedin`, `naver_blog` 지원
- **예약·발행 실행 금지(2026-08-05 확정, Charter §10.1)**: 에이전트 작업은 검수 대기(`waiting_review`)에서 끝난다. `apply_channel_action`에 `publishAt`·`publishHour`를 전달하는 예약 호출과 `complete`·`publish_member` 등 발행·완료 액션을 **호출하지 않는다.** `list_jobs`의 `recommendedUploadSchedules`로 추천일과 `allowedHours`를 조회해 **채널·날짜·시를 보고에 제안**하고, 확정은 사용자가 검수 UI에서 한다. 예약 여부 판정은 채널 step의 `meta.scheduledPublishAt`으로만 하며 `recommendedUploadSchedules`는 이미 예약된 채널에도 계속 반환된다. 상세 정책은 `{{AGENT_ROOT}}/refs/content-policy/upload_cadence_and_quota.md`의 "배정 결과 처리".
  > 금지 근거: 채널마다 처리 분기가 달라 예약 의도 호출이 즉시 발행으로 기록된 사고가 두 건 있었다(`linkedin` 2026-08-01, `naver_blog` 2026-08-05). 두 건 모두 MCP 응답 상단은 예약 성공으로 표시했으나 channel log의 `scheduledPublishAt`이 빈 값이었다.
- `enqueue_content` 입력 분기 (2026-05-15 패치 이후):
  > WP 허용 도메인 slug/URL → `wpCacheService`로 post detail 가져와 기존 `wp_post` job 생성
  > 그 외 `http/https` URL → `scrapeReadableContent()`로 본문/이미지 수집 후 `sourceRef.sourceSnapshot` 기반 job 생성 (네이버 블로그 호스트는 `sourceKind: "naver_blog"`)
  > `sourceSnapshots` 파라미터 → `url`, `title`, `contentText` 등을 직접 넘기면 스크랩 없이 동일 큐 프로세스에 등록. **리라이팅 원문 등 이미 가공된 본문을 source로 쓰고 싶을 때 사용**
- 일반 웹 URL은 slug가 아닌 URL 기준으로 dedupe되므로, 서로 다른 사이트의 같은 path slug 충돌은 발생하지 않음
- 스크랩 차단/빈 본문이 의심되면 `sourceSnapshots`로 직접 원문을 전달해 fallback
- **`submit_local_generation` 재제출은 전체 채널 교체 방식** — 한 채널만 수정해도 요청된 전체 채널 draft 또는 exclusion marker를 모두 포함한다(미포함 채널은 누락됨).
- `get_job`은 기본 compact 응답을 사용한다. `view="proofread"`는 finding 진단에만, `view="full"`은 운영 디버깅을 명시적으로 수행할 때만 사용한다.
- 채널 credential(특히 Threads 60일 토큰)은 만료가 발행 실패의 잠재 원인 — 발행 오류 시 credential 만료 여부를 먼저 확인
- 소셜 프로필 문구 검토 전 `get_social_profiles`로 운영 중 프로필을 조회한다. 반환되지 않는 필드와 Naver Blog 프로필은 임의 추정하지 않고 캡처/운영자 확인을 병행한다.
- 매거진 프로모션은 `list_promo_creatives` → `save_promo_creative` → `submit_promo_creative_review`까지만 MCP가 수행한다. 최종 활성화는 Marketing Oops에서 사람 승인으로 수행한다.
- 프로모션 맞춤 측정기준 등록과 `MARKETING_GA_PROMO_REPORT_ENABLED=true` 적용 후 `collect_ga_snapshots` → `get_marketing_performance(view="promo_performance")`로 슬롯/소재별 노출·클릭을 조회한다. CTR만으로 승자를 확정하지 않는다.
- GA4 설정을 분석하기 전 `get_ga_configuration`으로 속성별 맞춤 정의·주요 이벤트·스트림/이벤트 규칙과 실제 최근 이벤트 수집 상태를 조회한다. Measurement Protocol secret·접근 권한 목록은 도구 범위에서 제외한다.
- **`get_wp_seo_insights` — 색인·분류 상태 조회 (2026-08-11 신설)**
  > 역할 분담: **Search Console = 검색엔진이 본 결과**(노출·순위·쿼리) / **이 도구 = 사이트가 무엇을 내보내는가**(효과 robots·분류·재고). 서로 대체하지 않는다.
  > 질의 8종: `seo_robots_overview` · `page_inventory` · `yoast_global_settings` · `taxonomy_inventory` · `content_freshness` · `slug_exists` · `hub_surface_robots` · `post_seo_score`
  > **`post_seo_score`** — 글 1건의 Yoast SEO·가독성 분석 점수와 신호등(`green`/`orange`/`red`)을 반환한다. `slug` 또는 `postId`로 지정한다. 점수는 에디터에서 분석이 실행된 글에만 저장되므로 `null`이면 초록이 아니라 **미계산**이다(`scoresComputed=false`). 임계값은 Yoast `WPSEO_Rank`(71/41) 기준이며, 원점수(`seoScore`·`readabilityScore`)를 함께 반환하므로 판정은 원점수로 하고 신호등은 표시용으로 쓴다. 이 점수는 발행 게이트(`analyze_article_seo`) 점수와 **다른 지표**이며 대체하지 않는다.
  > **판정 근거는 `effectiveRobots`다.** 같이 반환되는 `yoastCached`는 Yoast의 캐시값이며 `indexableStale=true`면 **캐시가 낡은 상태이므로 근거로 쓰지 않는다.**
  > 판정이 갈리면 최종 확인은 해당 URL의 렌더링된 `<meta name="robots">`다.
  > **로컬 WordPress 사본의 수치를 마케팅·SEO 판정 근거로 쓰지 않는다** — `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` §4.5.4.
  > 조회 실패 시 추정으로 대체하지 않고 `blocked`로 보고한다(fail-closed).
  > 경로: `marketing-ops` → node-app `wp-proxy`(자격증명 주입) → WordPress mu-plugin. MCP는 WordPress 자격증명을 갖지 않는다.
  > 401이 나면 ① 에이전트 키의 `wp:seo:read` 스코프 ② 운영 자격증명 계정의 `edit_others_posts` 권한 순으로 확인한다.

### 2.5 `visual-check`

| 도구 | 방향 | 사용 시점 |
|---|---|---|
| `visual_doctor` | R | Playwright/Chromium/정적 빌드/필수 명령 점검 |
| `list_targets` | R | 등록된 프론트엔드 preset 목록 |
| `list_stories` | R | Storybook `index.json` 기반 스토리 목록 |
| `capture_visual` | C | 다중 뷰포트 캡처 + audit 수행 |

지원 preset: `amu-labs-storybook-ui`, `amu-web-node-app`, `amu-web-wordpress`

핵심 규칙:

- UI 작업 완료 후 `capture_visual`로 시각 회귀 점검 권장(반응형·터치 타겟·브랜드 테스트). 판정 기준은 각 스코프의 `visual-check` 스킬을 따른다
- Storybook은 정적 `storybook-static` + `index.json` 빌드 결과가 있을 때 가장 안정적
- AMU Labs Storybook은 `pnpm build-storybook:ui`로 생성한 `packages/ui/storybook-static`을 사용

---

## 3. 인증·환경변수 정리

| MCP | 필수 env | 선택 env (node-app 측) |
|---|---|---|
| `genstudio` | `AGENT_API_KEY`, `AGENT_BASE_URL` | `GEN_STUDIO_LOCAL_BASE_URL`, `GEN_STUDIO_PRODUCTION_BASE_URL`, `AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE`, `AGENT_CONTENT_MAX_REQUESTS_PER_MINUTE`, `AGENT_CONTENT_READ_MAX_REQUESTS_PER_MINUTE`, `AGENT_CONTENT_READ_MAX_ASSETS_PER_REQUEST` |
| `amu-magazine` | `AGENT_API_KEY`, `AGENT_BASE_URL` | `AMU_PUBLISHER_CONVERTER_DIR`, `AMU_PUBLISHER_CONVERTER_WORK_DIR`, `AMU_PUBLISHER_PYTHON_BIN`, `AMU_PUBLISHER_ALLOWED_ARTICLE_ROOTS`, `AMU_PUBLISHER_MIN_SEO_SCORE`, `AMU_PUBLISHER_ALLOWED_HOSTS`, `AMU_WP_LOCAL_URL`, `AMU_WP_LOCAL_USERNAME`, `AMU_WP_LOCAL_APP_PASSWORD`(local 전용), `AMU_PUBLISHER_ALLOW_PRODUCTION_PUBLISH` |
| `google-marketing` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` | `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_DEFAULT_LANGUAGE_ID`, `GOOGLE_ADS_DEFAULT_GEO_IDS` |
| `marketing-ops` | `AGENT_API_KEY`, `AGENT_BASE_URL` | `MARKETING_OPS_DEFAULT_UNIVERSE_ID` |
| `visual-check` | `MCP_VISUAL_WORKSPACE_ROOT`, `MCP_VISUAL_OUTPUT_ROOT` | `PLAYWRIGHT_BROWSERS_PATH` |

`AGENT_API_KEY` 관련 주의:

- Anthropic/OpenAI/Gemini API 키와는 **별개의 내부 공유 시크릿키**
- node-app과 MCP 양쪽에 동일 값으로 설정 → 요청 시 `x-agent-key` 헤더로 전달
- 로컬 텍스트/PR/커밋 메시지로 노출 금지

WordPress 자격증명 주의:

- **운영(production)은 env 자격증명을 쓰지 않는다.** `AMU_WP_PRODUCTION_URL/USERNAME/APP_PASSWORD`는 2026-07-21 프록시 전환으로 **폐기**됐다. `.mcp.json`이나 `.codex/config.toml`에 넣어도 읽히지 않으며, 없다고 해서 등록·발행이 막히지 않는다.
- 운영 쓰기 경로: `amu-magazine` → node-app `POST /api/ai/agent/wp-proxy`(자격증명 주입) → WordPress. MCP는 운영 WordPress 자격증명을 갖지 않는다. 필요한 env는 `AGENT_API_KEY`, `AGENT_BASE_URL`뿐이다.
- 운영 401이 나면 ① 에이전트 키의 `wp:posts:write`(또는 `wp:posts:*`) 스코프 ② 통합 어드민 DB의 WordPress 자격증명 활성 여부 순으로 확인한다. env 추가로는 해결되지 않는다.
- `AMU_WP_LOCAL_*`는 **local 인스턴스 직접 호출 전용**으로 남아 있다. `AMU_WP_LOCAL_USERNAME`은 WordPress 로그인 사용자 ID이고, `AMU_WP_LOCAL_APP_PASSWORD`는 일반 로그인 비밀번호가 아니라 WordPress Admin의 `Users > Profile > Application Passwords`에서 별도로 발급받는 값이다.
- Application Password는 `.env`/secret manager에만 저장하고, HTTPS 밖으로 내보내지 않는다.

---

## 4. 공통 에러 코드 → 처리 매트릭스

| errorCode | HTTP | 의미 | 권장 처리 |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | `AGENT_API_KEY` 누락/오류 | env/`.mcp.json` 확인 후 재시작 |
| `INVALID_INPUT` | 400 | 필드 누락/형식 위반 | 페이로드 재검증, 필수값 확인 |
| `CONFLICT` | 409 | `strictNew=true`인데 key 존재 | 같은 개념이면 착수 게이트 4단계 갱신, 다른 개념이면 skip 후 관리자 UI/명시 승인 절차로 이관. **key 변형 우회 등록 금지** |
| `NOT_FOUND` | 404 | 그룹/원장 문서 없음 | target/key 재확인 후 의도한 신규 그룹만 create |
| `RATE_LIMITED` | 429 | 분당 한도 초과 | 호출 간격 늘리거나 한도 env 상향 |
| `TEMPLATE_NOT_FOUND` | 400 | `templateKey` 미등록(genstudio) | `upsert_image_prompt_template` 선등록 후 재시도 |
| `REFERENCE_IMAGE_REQUIRED` | 400 | 템플릿 필수 참고 이미지 부족 | `get_prompt_template` 정책 확인 후 minCount 이상 전달 |
| `REFERENCE_IMAGE_MAX_COUNT_EXCEEDED` | 400 | 참고 이미지 최대 개수 초과 | 정책 maxCount 이하로 줄여 재시도 |
| `DAILY_LIMIT_EXCEEDED` | 429 | 일일 이미지 생성 한도 초과 | 다음 날 또는 한도 상향 |
| `EMPTY_IMAGE_RESPONSE` | 502 | provider/파이프라인이 자산을 반환하지 않음 | 유료 반복 재시도 금지, 백엔드 상태 보고 |
| `MODEL_NOT_SELECTABLE` / `VIDEO_PIPELINE_NOT_READY` | 403/400 | video provider가 sandbox 승격 전 internal이거나 launch state가 비활성 | 외부 유료 재시도 금지, provider 승인 게이트 확인 |
| `VIDEO_MODERATION_REJECTED` / `VIDEO_FILE_TOO_LARGE` / `VIDEO_MIME_OR_CONTAINER_INVALID` | 4xx/502 | 비디오 결과 moderation·파일·컨테이너 검증 실패 | asset을 사용하지 말고 job 실패·환불·reconciliation 상태 확인 |
| `ASSET_PERSIST_FAILED` | 502 | 콘텐츠 생성·과금 뒤 저장 asset이 없음 | 자동 재시도 금지, 사용 코인과 저장 파이프라인 상태 보고 |
| `NON_JSON_RESPONSE` | 502/504 | 게이트웨이 오류 페이지 등 JSON이 아닌 응답 | `diagnostics.httpStatus`·`bodySnippet`으로 게이트웨이/앱 오류 구분. **과금 미확정** — `list_recent_generations`로 asset 확인 후 판단 |
| `CLIENT_TIMEOUT` | — | MCP 클라이언트 상한(330초) 초과 | 서버는 계속 생성·과금했을 수 있음. 재시도 전 asset 생성 여부 확인 |
| `REQUEST_FAILED` | — | 응답 수신 전 네트워크 실패 | base URL·연결 상태 확인. 과금 여부는 미확정으로 취급 |
| `RATE_LIMIT_UNAVAILABLE` | 503 | 민감 evidence endpoint의 limiter 저장소 장애 | fail-closed 상태로 보고하고 저장소 복구 후 재호출 |
| `INTERNAL_ERROR` | 500 | DB/서버 오류 | 로그 확인 후 재시도, 반복 시 운영 보고 |

비용 도구(`generate_image`, `generate_content`, `generate_video_job`, `generate_audio_job`, JOB 상세 서버 AI 적합도 검사 등)는 **결과를 받기 전 사용자에게 사전 고지**하고 실패 시 재시도 정책을 명시하세요. 로컬 모델 산출물을 저장하는 `submit_local_generation` 자체는 서버 AI 적합도 검사 호출이 아니다.
- `generate_video_job`은 `target=local|production`, provider/model, duration/resolution을 명시하고, 승인된 sandbox가 아니면 호출하지 않는다. `get_video_job` polling과 `list_video_assets` 확인을 분리하며 provider 임시 URL을 직접 사용하지 않는다.
- `generate_audio_job`은 `target=local|production`, voiceId, text, sourceRevision, templateKey를 명시하고 예상 비용과 외부 provider 호출을 사용자에게 고지한 뒤 호출한다. 서버가 승인 voice·template·단가·잔액·멱등 키를 다시 검증한다. `get_audio_job` polling과 `list_audio_assets` 확인을 분리하며 provider 임시 URL을 직접 사용하지 않는다.

---

## 5. 운영 안전 원칙

- **DB 직접 query/read/write 금지** — 운영 증거 조회도 `mongo` CLI/`mongoose`나 범용 DB MCP가 아니라 목적 한정 Agent API/MCP 도구를 거칠 것.
- **delete 도구 자제** — 운영 데이터에 `delete_*_prompt_template` 즉시 호출 금지. 잘못 등록한 직후나 테스트 데이터 정리에만 사용.
- **production 그룹 쓰기 확인** — 운영 그룹은 선행 조회·사용자 명시 승인·정확한 confirmation·사후 재조회 없이 변경 금지.
- **검색 이미지 권리 확인** — `search_images` 결과는 사용권 보증이 아니므로 원문·라이선스·attribution을 확인하고 게시물에 필요한 표기를 유지.
- **비용 도구 사전 고지** — `generate_image`, `generate_content`, JOB 상세 서버 AI 적합도 검사 등 비용 발생 도구는 사용자에게 사전 고지 + 결과 검증 단계 필수.
- **세션 비용 예산 가드** — 한 세션에서 비용 발생 도구를 5회 이상 호출했거나 누적 비용이 눈에 띄게 커지면, 다음 호출 전 사용자에게 누적 사용량을 고지하고 재확인을 받는다.
- **키 변경(rename) 미지원** — slug 변경은 admin UI에서만. 다중 진입점 race condition 위험.
- **agent-key 보호** — `AGENT_API_KEY`는 텍스트 파일/PR/커밋 메시지 노출 금지. `.env` 또는 secret manager로만.
- **자동 폴링 금지** — `marketing-ops.poll_worker` 등 worker는 호출 1회당 1회만. 별도 cron 자동화 금지.

### 5.1 서브에이전트 위임 경계

Main 에이전트가 조사·구현을 서브에이전트에 위임할 때, **MCP 호출 권한은 함께 위임되지 않는다.**
판정 기준은 도구 이름이 아니라 각 카탈로그 표의 **`방향` 열**이다 — 도구가 늘어도 규칙이 낡지 않는다.

| 방향 | 위임 | 근거 |
|---|---|---|
| **R** (조회) | ✅ 서브에이전트 호출 가능 | 외부 상태를 바꾸지 않는다 |
| **W** (쓰기) | ❌ **Main 전용** | 운영 DB·queue·WordPress·원장 상태를 바꾼다 |
| **C** (비용) | ❌ **Main 전용** | 코인이 차감된다. 예산 고지·재시도 판정 주체가 하나여야 한다 |

- **예외 — `visual-check.capture_visual`**: `C` 표기지만 비용이 없고 격리된 `MCP_VISUAL_OUTPUT_ROOT`에만 쓰므로 위임 가능하다. 시각 회귀 점검은 검증 서브에이전트에 맡겨도 된다.
- **조회는 위임, 판정은 Main**: 서브에이전트가 `list_keyword_profiles`로 `uploadPolicy`를 조회하는 것은 허용한다. 그러나 **cap 통과 여부 판정은 Main이 한다.** fail-closed 규칙은 판정 주체가 둘이 되는 순간 깨진다. 규제·법무·SEO·production publish 게이트도 동일하다.
- **원고 작성은 위임, 제출은 Main**: 채널 draft 본문을 파일로 작성하는 일은 위임할 수 있다. `submit_local_generation`·`enqueue_content`·`apply_channel_action` 호출은 Main이 한다. 전사 단계를 늘리지 않기 위해 원고는 **프롬프트에 복사하지 말고 파일 경로로 주고받는다** — `{{AGENT_ROOT}}/rules/text-encoding-integrity.md`
- 서브에이전트는 금지된 호출에 대해 **payload 초안·dry-run 결과·확인해야 할 선행 조회 결과까지만** 준비해 Main에 반환한다.
- 위임 프롬프트에 **허용 도구 목록을 명시**한다. "MCP를 써도 된다"처럼 열어두지 않는다.
- 전체 위임 절차·티어 판정·독립 검증: `{{AGENT_ROOT}}/rules/agent-orchestration.md`

---

## 부록. 참고 문서 인덱스

- 본 스킬: `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`
- Gen-Studio 등록 절차 상세: `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md`
- Gen-Studio MCP 운영·구현 정본: `/home/attrest-samsung-linux/Project/amu_labs/{{AGENT_ROOT}}/refs/genstudio-mcp.md`
- Gen-Studio MCP README: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/gen-studio/README.md`
- amu-magazine README: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/amu-magazine/README.md`
- amu-magazine CLI(`wp:draft`) 사용 가이드: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/amu-magazine/README.md` (`wp:draft` 섹션)
- amu-magazine CLI 도입 보고서: `/home/attrest-samsung-linux/Project/.agent/docs/2026/05/20260513_123338__amu-magazine-wordpress-draft-cli.md`
- amu-magazine `target=both` / 기본 SEO 생략 보고서: `/home/attrest-samsung-linux/Project/.agent/docs/2026/05/20260513_124113__amu-magazine-draft-both-skip-seo-default.md`
- google-marketing README: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/google-marketing/README.md`
- marketing-ops README: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/marketing-ops/README.md`
- visual-check README: `/home/attrest-samsung-linux/Project/amu_labs/apps/mcp/visual-check/README.md`
- 신규 기사 초안 워크플로우: `{{AGENT_ROOT}}/refs/content-policy/magazine_knowledge_article.md`
