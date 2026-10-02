# Gen Studio MCP 운영·구현 계약

> 정본 범위: `amu_labs/apps/mcp/gen-studio`의 도구 목록, node-app Agent API 연결, target 분리, 비용·쓰기·참고 이미지 보안 계약.
> 에이전트 호출 정책의 단일 진입점은 워크스페이스 루트의 `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`이며, 이 문서는 MCP 구현·운영자가 함께 지켜야 하는 하위 정본이다.

## 1. 아키텍처 경계

```text
Agent/Codex
  → genstudio MCP
  → node-app /api/ai/agent/* 또는 /api/ai/generate/agent-image|agent-content
  → 공용 server service/repository
  → DB·이미지 provider·검색 provider
```

- MCP 또는 에이전트가 MongoDB/Mongoose로 원장을 직접 수정하지 않는다.
- 관리자 UI와 Agent route는 동일한 server mutation service를 사용한다.
- 인증은 `x-agent-key`와 공통 `AGENT_API_KEY`를 사용하며 키를 문서·로그·diff에 출력하지 않는다.
- 신규 도구는 인증, scope, rate-limit, 입력 검증, 구조화 로그를 갖춘 node-app Agent route를 통해 제공한다.
- node-app route 입력/출력 계약을 변경하면 MCP schema, README, 본 정본과 실제 stdio 계약 테스트를 같은 작업에서 갱신한다.

## 2. 현재 도구 카탈로그

| 구분 | 도구 | 핵심 역할 |
| --- | --- | --- |
| 프롬프트 | `list_prompts`, `get_prompt_template` | 이미지/콘텐츠 템플릿 원장과 본문·참고 이미지 정책 조회 |
| 프롬프트 | `upsert_image_prompt_template`, `upsert_content_prompt_template` | 프롬프트 신규 등록과 명시 승인 유지보수 |
| 프롬프트 | `delete_image_prompt_template`, `delete_content_prompt_template` | 잘못 등록한 직후·테스트 데이터 정리용 삭제 |
| 이미지 | `generate_image`, `list_images`, `list_recent_generations` | AI 이미지 생성, 템플릿별 저장 asset 검증, 최근 생성 활동 조회 |
| 콘텐츠 | `generate_content`, `get_content_asset` | 공개·활성 콘텐츠 템플릿 기반 유상 텍스트 asset 1개 생성, 생성된 asset 본문 전문 조회 |
| CardNews | `create_card_news_deck`, `get_card_news_deck`, `list_card_news_decks` | semantic CardContent를 versioned template으로 해석한 CardDeck 생성·단건 조회·목록 조회 |
| 생성 증거 | `get_generation_evidence_bundle` | exact asset ID(이미지·콘텐츠)의 자산·잡·과금 원장을 상관 검증한 read-only 감사 bundle |
| 이미지 검색 | `search_images` | Pexels·Pixabay·Unsplash 참고 이미지 검색과 출처·라이선스 반환 |
| 템플릿 그룹 | `list_template_groups`, `write_template_group` | 그룹 원장의 실제 멤버십·추천 조회와 생성·편집 |
| 모델 | `list_models` | Gen Studio에서 선택 가능한 이미지/텍스트 모델 조회 |
| 비디오 | `generate_video_job`, `get_video_job`, `list_video_assets` | 비동기 비디오 job 등록·상태·내부 저장 asset 조회 |
| 오디오 | `estimate_audio_job`, `generate_audio_job`, `get_audio_job`, `list_audio_assets` | template 기반 audio(TTS) 견적·비동기 job 등록·상태·내부 저장 asset 조회 |
| 시스템 모델 | `list_system_models`, `upsert_system_model`, `delete_system_model` | system model catalog 조회·upsert·soft delete |
| 모델 동기화 | `plan_model_catalog_sync`, `apply_model_catalog_sync`, `verify_model_catalog_parity` | 정책 manifest 기반 local/production 계획·적용·정합 검증 |

도구 수는 현재 33개다. 도구를 추가·삭제하면 실제 `registerTool()` 목록을 기준으로 이 표와 `amu-custom-mcp` 인벤토리를 함께 갱신한다.

## 3. target 및 환경 계약

| env | 의미 | 기본값 |
| --- | --- | --- |
| `AGENT_BASE_URL` | `target=configured`가 사용하는 기본 node-app | `https://app.allmyuniverse.com` |
| `GEN_STUDIO_LOCAL_BASE_URL` | 그룹·검색 도구의 `target=local` | `http://localhost:3000` |
| `GEN_STUDIO_PRODUCTION_BASE_URL` | 그룹·검색 도구의 `target=production` | `https://app.allmyuniverse.com` |
| `AGENT_CONTENT_MAX_REQUESTS_PER_MINUTE` | 콘텐츠 생성 분당 한도 | `10` |
| `AGENT_CARD_NEWS_MAX_REQUESTS_PER_MINUTE` | CardNews Agent route 분당 한도 | `20` |

- 운영 원장을 다루는 호출은 `configured`에 의존하지 말고 `target=production`을 명시한다.
- 로컬 검증은 `target=local`을 명시한다.
- 생성 증거 조회는 `target=local|production`만 허용하고 기본값을 두지 않는다.
- 콘텐츠 생성은 `target=local|production`만 허용하고 기본값을 두지 않는다.
- CardNews 덱 생성·조회도 `target=local|production`을 반드시 명시한다. production 생성은 MCP confirmation이 추가로 필요하다.
- `configured` URL이 production URL과 같으면 production 쓰기로 판정한다.
- 새 MCP schema는 실행 중인 세션에 자동 반영되지 않는다. node-app 배포 → MCP build/restart → Codex/Claude 세션 재시작 순서를 따른다.

## 4. 참고 이미지 생성 계약

### 콘텐츠 샘플 생성 계약

- `generate_content`는 공개·활성 콘텐츠 템플릿만 허용하고 Agent API key의 UID를 소유자·과금 주체로 사용한다.
- 템플릿별 1개 asset만 생성하며 기본 `visibility=public`이다. 개인 생성이 필요한 경우에만 `private`를 명시한다.
- provider·model·최대 출력 토큰·예상 비용을 호출 전에 고지하고 사용자 승인을 받는다.
- rate-limit 저장소 장애는 `RATE_LIMIT_UNAVAILABLE`로 fail-closed한다.
- 생성·과금 성공 뒤 asset 저장이 확인되지 않으면 `ASSET_PERSIST_FAILED`로 반환하고 자동 재시도하지 않는다.
- 운영 샘플은 반환된 `assetId`, `templateKey`, `visibility`, provider/model, coins를 기록하고 원문 전체를 로그에 복제하지 않는다.
- **`generate_content` 응답에는 preview만 실린다.** 생성 라우트가 `text.slice(0, 180)`으로 자르고 MCP가 240자 상한으로 통과시키므로 실질 상한은 180자다.
  생성한 원고를 그대로 활용하려면 `get_content_asset({ assetIds, target })`으로 본문 전문을 조회한다.
  세션 인증 라우트 `lab/studio-contents/[assetId]`는 `withAuth`가 사용자 토큰을 요구해 agent key로 진입할 수 없으므로 대체 경로로 쓰지 않는다.
- `get_content_asset`은 read-only이며 `genstudio:content:read` scope와 `GET /api/ai/agent/studio-contents`를 사용한다.
  **본인 소유(`asset.uid == AGENT_UID`) 자산과 공개 자산만 읽는다.** 타인의 private 본문은 `missing[].reason=forbidden`으로 분리되고 본문이 내려오지 않는다.
  요청당 asset 1~5개이며 `state != active`인 자산은 `not_found`로 처리한다.
- `generate_video_job`은 `target=local|production`, provider, modelName, prompt를 명시하고 예상 비용과 외부 provider 호출을 사용자에게 고지한 뒤 호출한다. 서버가 capability·launch state·잔액·멱등 키를 다시 검증한다.
- 비디오 job은 provider 임시 URL을 MCP에 직접 노출하지 않는다. worker가 R2에 저장하고 컨테이너/MIME/크기/hash를 검증한 뒤 내부 asset을 반환하며 private asset은 signed URL을 사용한다.
- `get_video_job`은 queued/running/success/partial/failed/expired/cancelled 상태를 읽고, `list_video_assets`는 agent UID 소유 asset만 반환한다. polling 재시도 전 job 상태와 asset을 확인하고 같은 clientRequestId를 재사용한다.
- `estimate_audio_job`·`generate_audio_job`은 `target=local|production`, `voiceId`, `text`, `sourceRevision`, `templateKey`를 명시한다. 서버가 승인 voice·template·locale·speed·단가를 재검증하고 MCP는 voice 목록·가격을 자체 보관하지 않는다. estimate·generate는 같은 `app=gen_studio_audio` fail-closed 가드를 탄다 — 단가가 확정되지 않은 모델·voice는 `PRICING_NOT_FOUND`(503)다.
- `generate_audio_job`은 provider 호출·코인 차감이 발생하므로 예상 비용·대상 환경을 사용자에게 고지하고 승인 후 호출한다. `clientRequestId` 생략 시 MCP가 `mcp-audio-{uuid}`를 생성한다. 같은 `clientRequestId`에 다른 요청 hash면 `IDEMPOTENCY_CONFLICT`(409)이고 재사용이면 200+`reused`다.
- audio job은 provider 임시 URL·R2 원본 경로·서명 비밀을 노출하지 않고 서버가 발급한 asset transport만 반환한다. `get_audio_job`·`list_audio_assets`는 agent UID 소유 asset만 반환하고, 조회되지 않은 id는 `missing[]`로 돌려 타인 자산 존재 여부를 노출하지 않는다.
- `get_generation_evidence_bundle`은 이미지 자산(`asset_…`)과 콘텐츠 자산(`content_asset_…`)을 **모두 지원한다.**
  서버가 assetId 접두사로 종류를 판별해 컬렉션과 과금 operationId prefix(`image:` / `content:`)를 전환하고 응답에 `assetKind`를 싣는다.
  **한 요청에 두 종류를 섞을 수 없다** — 섞이면 MCP가 호출 전에 차단하고 서버는 `invalid_asset_ids`로 거부한다.
  콘텐츠 bundle에는 **본문(`content.text`)이 포함되지 않는다.** 원고가 필요하면 `get_content_asset`을 쓴다.
  콘텐츠 전용 경고 코드는 `ASSET_TEXT_EMPTY`(저장된 본문이 비어 있음)와 `JOB_NOT_SUCCEEDED`(잡이 failed/partial — 과금은 됐는데 산출물이 온전하지 않음)다.
- **`/api/ai/generate/agent-content`는 Job queue를 쓰지 않고 동기로 응답한다.** Gen Studio UI 경로만 큐를 쓴다.
  따라서 긴 생성은 HTTP 요청이 그대로 열려 있고, MCP 클라이언트 상한은 node-app의 텍스트 upstream 상한
  (출력 예산 비례, 최대 300초)보다 커야 한다. 현재 값은 `AGENT_CONTENT_TIMEOUT_MS = 330_000`이다.
- **응답을 받지 못한 실패(`CLIENT_TIMEOUT`·`NON_JSON_RESPONSE`)는 과금 여부가 미확정이다.**
  서버가 생성을 끝내고 과금했을 수 있으므로 재시도 전에 `list_recent_generations`로 asset 생성 여부를 먼저 확인한다.
- 비-JSON 응답은 `diagnostics`(`httpStatus`·`statusText`·`contentType`·`bodySnippet`·`elapsedMs`·`timeoutMs`)를 함께 반환한다.
  게이트웨이 오류 페이지와 앱 레벨 오류를 이 값으로 구분하며, 진단값 없이 errorCode만 보고 원인을 추정하지 않는다.

### 조회와 생성 순서

1. `get_prompt_template({ templateKey, promptType: "image" })`로 템플릿과 `inputPolicy.referenceImage`를 확인한다.
2. 정책이 `required=true`이면 `minCount` 이상, `maxCount` 이하의 참고 이미지를 확보한다.
3. 기사·콘텐츠용 공개 이미지가 필요하면 `search_images`로 검색한다.
4. 결과의 원문 페이지, attribution, license URL과 실제 사용 목적을 검토한다.
5. 비용·provider·model·크기·장수를 사용자에게 알린 뒤 `generate_image`를 호출한다.
6. 반환 asset을 확인하고 필요하면 `list_images`로 저장 결과를 재검증한다.

### `generate_image` 목적 기반 모델 라우팅

- `routingProfile=supporting_visual`: 비주얼 중요도가 낮은 보조 이미지·후처리 가능한 인포그래픽. Z.ai `glm-image` → Nano Banana 순서다.
- `routingProfile=graphic_no_text`, `textPolicy=none`: 텍스트 없는 그래픽. Nano Banana → Grok Imagine 순서다.
- `routingProfile=premium_template_sample`: 이미지 템플릿 대표 샘플, 고품질 결과, 이미지 안에 읽을 수 있는 텍스트가 필요한 경우. Nano Banana 2 → GPT Image 2.5 Flare 순서다.
- `textPolicy=embedded_required`는 상위 라우트로 승격한다. 텍스트를 후처리할 수 있으면 `overlay_later`를 사용해 GLM Image로 배경·도형만 생성한다.
- `glm-image`는 text-to-image 전용이다. 참고 이미지가 있거나 모델이 비활성·adminOnly·deprecated이면 서버가 다음 후보로 폴백하고 결과에 `fallbackApplied`와 `routingReason`을 반환한다.
- `provider`·`modelName` 직접 지정은 고급 override이며 `routingProfile` 후보와 충돌하면 거부된다.
- 세부 판정과 증거 필드는 워크스페이스 루트의 `{{AGENT_ROOT}}/refs/content-policy/image_model_routing.md`를 따른다.

### `generate_image` 해상도 계약

- MCP의 `generate_image.size`는 웹용 생성 정책에 따라 최대 1K급으로 제한한다.
- Google은 `512`와 `1K`, OpenAI·xAI는 `1024x1024`, `1024x1536`, `1536x1024`, `auto`를 허용한다.
- Google `2K`와 `4K`는 MCP schema에서 거부한다. 이 제한은 MCP 진입점에만 적용하며 node-app의 다른 UI/API 해상도 정책은 변경하지 않는다.

### `generate_image` 참고 이미지 입력

```ts
referenceImages?: Array<{
  url?: string;
  data?: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}>;
referenceStrength?: "light" | "medium" | "preserve";
```

- URL 또는 raw/data-URI base64 중 하나를 전달한다.
- PNG/JPEG/WebP만 허용하며 항목별 최대 10MB다.
- 공개 HTTP(S) URL만 사용한다. localhost, 사설망, loopback, link-local, CGNAT와 해당 주소로 향하는 redirect는 거부한다.
- 검색 결과 URL을 참고 이미지로 사용할 수 있다는 사실이 게시·상업적 사용 권한을 자동 보장하지 않는다.
- 템플릿 정책이 참고 이미지를 필수로 요구하면 임의 custom prompt로 우회하지 않는다.

## 5. 이미지 검색 계약

`search_images`는 `q`, `providers`, `count`, `random`, `orientation`, `target`을 지원하고 다음 정보를 반환한다.

- 원본/thumbnail URL
- 너비·높이와 대체 설명
- provider·저작자·저작자 URL
- 원문 페이지·attribution·license URL

에이전트는 다음을 지킨다.

- 기사의 장식 이미지보다 주장·사실을 뒷받침하는 시각 자료가 필요하면 원출처 또는 공신력 있는 자료를 우선한다.
- 검색 provider 결과를 사용하기 전에 원문과 라이선스를 확인하고 필요한 attribution을 산출물에 유지한다.
- 검색 실패를 이유로 생성 이미지를 실제 사진·보도 사진처럼 오인시키지 않는다.
- provider 일부 실패는 `errors` 배열로 반환될 수 있으므로 성공 결과와 실패 provider를 함께 확인한다.

## 6. 템플릿 그룹 원장 계약

### 조회 우선

모든 그룹 쓰기 전에 동일 target으로 `list_template_groups`를 호출한다. `templateKeys`가 실제 멤버십이고 `recommendedTemplateKeys`가 추천 부분집합이다.

### 쓰기 action

- `create`
- `update`
- `add_templates`
- `remove_templates`
- `set_recommended`

### 안전 규칙

- `reason`은 모든 쓰기에 필수다.
- 기존 그룹에 키를 연결할 때 전체 배열 덮어쓰기보다 `add_templates`를 우선한다.
- 추천 변경 전 기존 추천 배열을 읽고 보존·교체 의도를 구분한다.
- 추천 key는 그룹 멤버십의 부분집합이어야 한다.
- 서비스가 연결된 그룹의 metadata는 잠금 상태일 수 있으므로 임의 변경하지 않는다.
- `remove_templates` 후 cover와 추천 배열이 정합한지 재조회한다.
- production 쓰기는 사용자 명시 승인과 아래 확인 문구가 모두 필요하다.

```text
APPLY_TEMPLATE_GROUP:<groupKey>:production
```

- production 쓰기 후 같은 target을 다시 조회해 멤버십·추천 상태를 검증한다.

## 7. Agent route와 scope

| 기능 | route | scope |
| --- | --- | --- |
| 프롬프트 조회/쓰기 | `/api/ai/agent/gen-studio-prompts` | 기존 Gen Studio prompt scope |
| 그룹 조회 | `GET /api/ai/agent/gen-studio-template-groups` | `genstudio:template-groups:read` |
| 그룹 쓰기 | `POST /api/ai/agent/gen-studio-template-groups` | `genstudio:template-groups:write` |
| 이미지 검색 | `GET /api/ai/agent/image-search` | `genstudio:images:search` |
| 이미지 생성 | `POST /api/ai/generate/agent-image` | 기존 Gen Studio image generation scope |
| 콘텐츠 생성 | `POST /api/ai/generate/agent-content` | `genstudio:content:generate` |
| 비디오 job 생성 | `POST /api/ai/agent/gen-studio-video-jobs` | `genstudio:video:generate` |
| 비디오 job 조회 | `GET /api/ai/agent/gen-studio-video-jobs[/:jobId]` | `genstudio:video:read` |
| 비디오 asset 조회 | `GET /api/ai/agent/gen-studio-video-assets` | `genstudio:video:read` |
| 오디오 견적 | `POST /api/ai/agent/gen-studio-audio-estimate` | `genstudio:audio:read` |
| 오디오 job 생성 | `POST /api/ai/agent/gen-studio-audio-jobs` | `genstudio:audio:generate` |
| 오디오 job 조회 | `GET /api/ai/agent/gen-studio-audio-jobs[/:jobId]` | `genstudio:audio:read` |
| 오디오 asset 조회 | `GET /api/ai/agent/gen-studio-audio-assets` | `genstudio:audio:read` |
| 이미지·생성 활동 조회 | `GET /api/ai/agent/studio-images` | `genstudio:image:read` |
| 생성 증거 조회 | `POST /api/ai/agent/generation-evidence` | `genstudio:evidence:read` |
| CardNews 덱 생성 | `POST /api/ai/agent/card-news/decks` | `genstudio:card-news:write` |
| CardNews 덱 목록/단건 조회 | `GET /api/ai/agent/card-news/decks[/:deckId]` | `genstudio:card-news:read` |

제한 scope를 사용하는 agent key는 신규 scope가 허용됐는지 배포 전에 확인한다.

### 7.3 CardNews 덱 계약

- MCP 입력은 `source`, `semanticContent`만 받으며 `semanticContent`에는 카드 역할·카피·altText·evidence만 둔다. `x/y`, `fontSize`, `fontFamily`, 임의 layout 값과 raw external asset URL은 거부한다.
- resolver가 활성 built-in 또는 DB template snapshot을 선택하고, slot·카드 역할·증거·허용 폰트·정규화 좌표를 검증한 뒤 CardDeck을 만든다. MCP/AI는 픽셀 geometry를 직접 생성하지 않는다.
- evidence는 `assetId` 또는 `/api/proxy/image?url=`만 허용한다. assetId는 Agent UID 소유 자산 또는 public active 자산이어야 한다.
- 생성 결과에는 `generatedBy=agent`, source, template id/version, generatedAt, 원본 semantic content를 `agentMetadata`로 보존한다. 목록은 요약만, 단건 조회는 전체 CardDeck과 semantic metadata를 반환한다.
- production 생성은 `CREATE_CARD_NEWS_DECK:production` confirmation 없이는 MCP가 node-app에 요청하지 않는다. 실제 운영 생성은 별도 승인 범위다.

### 7.1 생성 증거 조회 계약

- 입력은 `assetIds` 1~10개만 허용한다. 임의 collection, filter, projection, aggregation 입력을 제공하지 않는다.
- Agent key의 UID가 소유한 user-scope 자산만 조회한다. 누락과 비소유 자산은 모두 `ASSET_NOT_FOUND`로 동일 처리한다.
- 기존 단일 운영 계약인 `AGENT_API_KEY + AGENT_UID` legacy key는 별도 JSON 중복 선언 없이 허용한다.
- `AGENT_API_KEYS_JSON` 다중 키 모드를 도입할 때는 legacy pair와 같은 키를 중복 등록하지 않고
  `genstudio:evidence:read`를 가진 scoped key로 전환한다. scope 없는 JSON wildcard key는 거부한다.
- rate-limit 저장소 장애 시 `RATE_LIMIT_UNAVAILABLE` 503으로 fail-closed한다.
- 자산은 `assetId/jobId/provider/modelName/createdAt/state`와 저장 규격·bytes·sha256만 반환한다.
- job은 상태·시각·prompt hash·요청 규격·과금 요약만 반환한다.
- ledger는 `operationId=image:{jobId}:generate`로 상관 조회하고 ID·coins·entryType·state·createdAt만 반환한다.
- UID, 이메일, 지갑, storage URL/bucket/key, 원문 prompt, reference 원본, ledger meta와 원본 token usage는 반환하지 않는다.
- MCP는 응답에 요청한 `target`을 포함하고 운영 증거에는 반드시 `target=production`을 명시한다.
- 이 도구는 읽기 전용이며 P2 착수 승인이나 `generate_image` 비용 승인을 대신하지 않는다.

### 7.2 최근 생성 활동 조회 계약

- `list_recent_generations`는 기존 `list_images`의 templateKey 기본 조회 계약을 변경하지 않고 `mode=recent`로 같은 Agent route를 호출한다.
- 기본 `scope=mine`은 agent key UID 소유 자산만 조회한다. `scope=universe`는 `universeId`가 필수이며 서버가 `visibility=public`을 강제한다.
- 기간은 최근 1~90일, limit은 1~50으로 제한한다. 기본 유니버스는 `amu`다.
- `contentCandidateHint`는 동일 templateKey 3건 이상 누적 여부를 알리는 참고 신호일 뿐이며, 콘텐츠 큐 등록·발행 결정을 자동 승인하지 않는다.
- 타 사용자 자산은 이용 동의 근거가 확정되기 전까지 콘텐츠화 큐에 등록하지 않는다. 현재 큐 대상은 `scope=mine` 결과로 한정한다.

## 8. 오류 처리

| errorCode/오류 | 처리 |
| --- | --- |
| `TEMPLATE_NOT_FOUND` | 카탈로그를 재조회하고 신규 템플릿이면 `strictNew=true` 등록 절차 진행 |
| `REFERENCE_IMAGE_REQUIRED` | 정책의 `minCount` 이상 참고 이미지 확보 후 재시도 |
| `REFERENCE_IMAGE_MAX_COUNT_EXCEEDED` | `maxCount` 이하로 줄인 뒤 재시도 |
| `CONFLICT` | 기존 원장을 재조회하고 덮어쓰지 말고 관리자/명시 승인 유지보수로 이관 |
| `NOT_FOUND` | target과 group key를 재확인하고 필요할 때만 create |
| `RATE_LIMITED` | backoff 후 제한된 횟수만 재시도 |
| `PRICING_NOT_FOUND` | 단가가 확정되지 않은 모델·voice는 fail-closed(503). 가격 정책 반영 전 견적·생성을 반복하지 않는다 |
| `COIN_INSUFFICIENT` | 402. 잔액 부족. estimate·generate 모두 생성 전에 차단된다 |
| `IDEMPOTENCY_CONFLICT` | 409. 같은 `clientRequestId`에 다른 요청 hash. 새 `clientRequestId`로 의도를 다시 확정한다 |
| `EMPTY_IMAGE_RESPONSE` | 유료 반복 재시도 금지, upstream/백엔드 상태 보고 |
| `MODEL_NOT_SELECTABLE` / `VIDEO_PIPELINE_NOT_READY` | provider sandbox·launch state 승격 전 fail-closed. 사용자가 승인하지 않은 유료 재시도 금지 |
| `VIDEO_MODERATION_REJECTED` / `VIDEO_FILE_TOO_LARGE` / `VIDEO_MIME_OR_CONTAINER_INVALID` | asset을 노출하지 않고 job 실패·환불 경로 확인 |
| `ASSET_PERSIST_FAILED` | 과금 여부와 저장 파이프라인 상태를 보고하고 자동 재시도 금지 |
| `NON_JSON_RESPONSE` | `diagnostics.httpStatus`·`bodySnippet`으로 게이트웨이 오류와 앱 오류를 구분. 과금 미확정이므로 `list_recent_generations` 확인 후 판단 |
| `CLIENT_TIMEOUT` | MCP 상한(330초) 초과. 서버는 계속 생성·과금했을 수 있으므로 재시도 전 asset 생성 여부 확인 |
| `REQUEST_FAILED` | 응답 전 네트워크 실패. base URL·DNS·연결 상태를 확인하고 과금 여부는 미확정으로 취급 |
| `RATE_LIMIT_UNAVAILABLE` | 민감 evidence 조회를 재시도하지 말고 rate-limit 저장소 복구 후 다시 호출 |
| HTTP 404 | node-app route 배포 여부 확인; MCP만 재시작해 해결하려 하지 않음 |

## 9. 구현·배포 검증

1. node-app `pnpm typecheck`와 변경 route 대상 ESLint
2. Gen Studio MCP `pnpm typecheck && pnpm build`
3. stdio `tools/list`에서 신규 도구와 schema 확인
4. 최근 생성 활동 도구는 mock Agent API로 `mode=recent`·기간·scope·기본 `universeId=amu` 전달과 콘텐츠 후보 신호를 검증
5. 생성 증거 도구는 mock Agent API로 exact asset ID·target·JSON 응답 계약을 검증
6. 콘텐츠 생성은 mock Agent API로 필수 target·templateKey·variables, 모델·공개 asset 응답 계약을 검증
7. CardNews 도구는 mock Agent API로 semantic write → read → list 왕복, 한글 UTF-8 보존, target·confirmation·HTTP 경로를 검증
8. 이미지 검색은 provider 1곳·1건으로 smoke
9. 참고 이미지 전달은 mock Agent API로 계약 검증하고 실제 유료 생성 호출은 별도 승인
10. 그룹은 local read → write → read로 검증
11. production은 배포 후 read가 200인지 확인한 뒤 승인된 write → read
12. 로그와 보고서에 target, action, group key, 검증 결과를 기록하되 agent key와 이미지 base64는 기록하지 않음
