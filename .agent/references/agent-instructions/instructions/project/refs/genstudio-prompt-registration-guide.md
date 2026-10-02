# Gen Studio 프롬프트 템플릿 자동 등록 가이드 (Agent용)

이 문서는 에이전트가 `genstudio` MCP 도구로 **이미지/콘텐츠 프롬프트 템플릿을 안전하게 등록·갱신·삭제**할 수 있도록 작성된 운영 가이드입니다.
마크다운 템플릿 파일을 입력으로 받아 `image_prompts` / `content_prompts` 컬렉션에 저장할 때 이 가이드를 그대로 따르세요.

> 패치 적용 보고서: `.agent/docs/project/2026/05/20260510_084954__gen-studio-image-content-prompt-auto-registration.md`
> 샘플 템플릿:
>
> - 이미지: `/home/attrest-samsung-linux/Project/.agent/content/ai-prompts/image_templates/completed/*`
> - 콘텐츠: `/home/attrest-samsung-linux/Project/.agent/content/ai-prompts/content_templates/completed/*`

---

## 1. 프롬프트 원장 쓰기 도구

| 도구                             | 컬렉션            | 메서드 | 비고                    |
| -------------------------------- | ----------------- | ------ | ----------------------- |
| `upsert_image_prompt_template`   | `image_prompts`   | upsert | 이미지 템플릿 신규/갱신 |
| `upsert_content_prompt_template` | `content_prompts` | upsert | 콘텐츠 템플릿 신규/갱신 |
| `delete_image_prompt_template`   | `image_prompts`   | delete | key 한 개 삭제          |
| `delete_content_prompt_template` | `content_prompts` | delete | key 한 개 삭제          |

내부적으로 모두 `POST/DELETE /api/ai/agent/gen-studio-prompts` 라우트로 라우팅되며 `body.type=image|content` 디스크리미네이터로 분기됩니다. 인증은 `x-agent-key`(공통 `AGENT_API_KEY`).

---

## 2. 호출 전 체크리스트

1. `genstudio` MCP가 활성화되어 있는가? (워크스페이스 루트 `.mcp.json`(Claude) / `.codex/config.toml`(Codex) / `opencode.json`(OpenCode)에 `genstudio` 항목 존재)
2. `AGENT_API_KEY`가 두 측에서 동일하게 설정되어 있는가? (node-app + MCP)
3. node-app에 `AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE`(기본 fallback=20, 권장 6~10) 설정 검토
4. 등록 대상 마크다운 파일의 첫 H1 / slug / 본문 구조가 §3 규칙에 부합하는가?
5. **개념 중복·유사 선점 검사(§4.1)를 통과했는가?** key 문자열 중복 검사만으로는 같은 개념의 재등록을 막지 못한다.
   중복·유사 판정이면 신규 등록이 아니라 §4.2 개선(갱신) 경로로 진행한다.

---

## 3. 마크다운 → 페이로드 매핑 규칙

### 3.1 이미지 템플릿 (예: `cutout-subject-environment-integration.md`)

````
# 누끼 인물/제품을 사실적 환경에 합성     → title

cutout-subject-environment-integration   → key (kebab-case)

## 장면:                                  → sceneTemplate
{본문}

## 대표카테고리:                          → categories (쉼표 분리)

## 키워드:                                → tags (쉼표 분리, 한·영 혼합)

## 활용팁:                                → usageTip (140자 이내)

## 기본설정:                              → defaultParams (JSON 블록 파싱)

```json
{ "provider": "google", "model": "...", "aspectRatio": "...", "size": "...", "negative": "..." }
````

## 템플릿: → templateText (헤더 제외 본문 전체 trim)

```

추가 규칙:
- `defaultParams`의 알려진 키(`provider/aspectRatio/size/negative`) 외 `model` 등 확장 키는 그대로 보존
- **이미지 템플릿의 `defaultParams.size`는 최대 `1K`로 제한한다. Google은 `1K`를 사용하며 `2K`·`4K`를 기본값으로 등록하지 않는다.** 고해상도는 사용자의 개별 생성 선택으로만 허용한다.
- 첨부 이미지가 없으면 목적이 성립하지 않는 변환·합성 템플릿은 `inputPolicy.referenceImage`를 별도 전달한다: `required=true`, `minCount>=1`, 용도별 `maxCount`, `enforceInCustomMode=true`.
- `defaultParams.referenceImage`에 정책을 섞지 말고 MCP의 최상위 `inputPolicy.referenceImage` 필드로 매핑한다.
- `## 템플릿:` 본문에 레거시 "금지 표현" 섹션이 잔존하면 라우트가 거절(`legacy_negative_requires_manual_migration`) → `defaultParams.negative`로 옮긴 뒤 본문에서 제거
- `usageTip`은 `Array.from(s).length` 기준 140자 초과 시 등록 거절

### 3.2 콘텐츠 템플릿 (예: `multichannel-social-content-v1.md`)

```
# 멀티채널 소셜 콘텐츠 생성 → title

multichannel-social-content-v1 → key

## 용도: → (스키마 매핑 안 함, 작성 목적 확인용)

{본문}

## 대표카테고리: → categories (쉼표 분리)

## 키워드: → tags (쉼표 분리, 한·영 혼합)

## 활용팁: → (스키마 매핑 안 함, 작성 품질 확인용)

## 기본설정: → defaultParams (bullet 파싱)

- `platform`: general
- `language`: ko
- `length`: threads: 2-4문장
- `outputFormat`: markdown/mermaid

## 템플릿: → templateText (헤더 제외 본문 전체 trim)

...
```

추가 규칙:
- `defaultParams` 키는 MCP 스키마와 동일한 `platform`, `language`, `length`, `outputFormat`을 사용
- `outputFormat`은 `markdown/mermaid` 또는 `json`
- `markdown/mermaid`는 Markdown 문서를 뜻하며 Mermaid 다이어그램이 필요한 경우 fenced code block의 `mermaid` 문법을 포함
- `mermaid`만을 별도 출력 포맷으로 등록하지 않음

### 3.3 공통 변수 문법

| 종류 | 문법 | 빈 값 |
|---|---|---|
| 선택 자유 입력 | `{key::placeholder}` | 허용 |
| 필수 자유 입력 | `{key*::placeholder}` | 불허 |
| 선택 Select | `{key::a|b}` | 허용 |
| 필수 Select | `{key*::a|b}` | 불허 |

- `*`는 변수명 끝에 한 번만 사용
- Select는 실제 옵션 2개 이상 사용
- `__amu_none__`, `__amu_custom__`을 옵션에 직접 사용하지 않음
- 같은 key를 반복하면 종류, 필수 여부, placeholder/옵션 목록이 완전히 같아야 함
- 외부 서비스의 기본값/잠금은 템플릿 문법이 아니라 애플리케이션 props로 주입

---

## 4. 호출 시퀀스 (자동 import)

```text
for f in template_files:
  parsed = parseMarkdown(f, mode=image|content)        # §3
  if !validKey(parsed.key): record_failure(f, "invalid_slug"); continue

  exists = list_prompts({ promptType: parsed.type, q: parsed.key })
  if exists.match(parsed.key): record_skipped(f, "already_registered"); continue

  similar = conceptScan(parsed)                        # §4.1 — key가 아니라 개념 기준
  if similar.verdict != "new":                         # duplicate | similar_absorb
    improveExisting(similar.targetKey, parsed)         # §4.2
    continue

  payload = toPayload(parsed)                          # §5 형태
  result  = upsert_(image|content)_prompt_template({ ...payload, strictNew: true })
  if result.errorCode == "CONFLICT": record_skipped(f, "duplicate_key"); continue
  if result.errorCode == "INVALID_INPUT": record_failure(f, result.error); continue

  verify = get_prompt_template({ templateKey: parsed.key, promptType: parsed.type })
  assert verify.item.title == parsed.title
  move(f, completed_dir/)
````

운영 원칙:

- **신규 등록은 항상 `strictNew=true`**로 호출해 데이터 덮어쓰기 방지
- `strictNew=false`는 §4.2 개선 절차를 거친 **의도된 갱신에만** 사용
- `CONFLICT` 발생 시 key를 변형해 우회 등록하지 않는다. 같은 개념이면 §4.2로, 다른 개념이면 skip 후 관리자 UI 또는 명시 승인된 유지보수 작업으로 이관
- **rename 미지원** — slug를 바꾸고 싶다면 admin UI에서 처리(다중 진입점 race 방지)
- 실패는 한 줄 메모(파일명 + errorCode + error)로 모아 보고서에 첨부

### 4.1 개념 중복·유사 선점 검사 (`conceptScan`)

key 문자열이 달라도 같은 개념의 템플릿이 이미 있으면 신규 등록하지 않는다.

```text
candidates = []
for term in [핵심 개념어(한글), 핵심 개념어(영어)]:
  candidates += list_prompts({ promptType, q: term, limit: 100 })
for cat in parsed.categories:
  candidates += list_prompts({ promptType, category: cat, limit: 100 })
for c in top(candidates, 3~5):
  get_prompt_template({ templateKey: c.key, promptType })   # 본문 대조
```

정체성 4축으로 판정한다. 축 정의와 분리 허용 기준은 각 규칙 문서를 정본으로 따른다.

| promptType | 4축 | 정본 |
| --- | --- | --- |
| image | 산출물 유형 / 입력 의존 / 스타일 시스템 / 용도·배치 | `{{AGENT_ROOT}}/refs/content-policy/image_template_creation.md` |
| content | 산출물 유형 / 역할·사고 프레임 / 채널 / 출력 구조·포맷 | `{{AGENT_ROOT}}/refs/content-policy/content_prompt_template_creation.md` |

- 3축 이상 일치 → `duplicate` — 신규 금지, §4.2 갱신
- 2축 일치 → `similar_absorb` — 기존 템플릿 흡수가 1순위, 분리 허용 기준 충족 시에만 `new`
- 1축 이하 → `new`
- 조회 실패 시 추정 판정 금지. 등록을 중단하고 `blocked`로 보고한다(fail-closed).

### 4.2 기존 템플릿 개선 (`improveExisting`)

```text
current = get_prompt_template({ templateKey: targetKey, promptType })
merged  = addOnly(current, parsed)      # 가산 병합 — 삭제·개명 없음
result  = upsert_(image|content)_prompt_template({
            ...merged, key: targetKey, version: current.version + 1, strictNew: false })
verify  = get_prompt_template({ templateKey: targetKey, promptType })
updateDoc(completed_dir/targetKey.md, merged)          # new/ 에 중복 문서 남기지 않음
appendLedger({ type: "<image|content>-template", status: "updated",
               slug: targetKey, dedupeKey: "topic:" + targetKey })
```

가산 병합 규칙:

- `key` 변경 금지
- 기존 변수명·옵션 라벨 삭제·개명 금지 — 저장된 생성 이력·딥링크·조건 블록 참조가 깨진다. 불가피하면 사용자 승인 후 진행
- 기존 고정 설정을 덮어쓰지 말고 달라지는 지시는 조건 블록으로 추가
- `categories`·`tags`는 합집합, 상한 초과분은 대표성이 낮은 값부터 제거
- `usageTip`은 140자 상한 유지
- 갱신 후 `get_prompt_template` 재조회로 한글 표기까지 검수(`{{AGENT_ROOT}}/rules/text-encoding-integrity.md`)

---

## 5. 페이로드 예시

### 5.1 이미지 (cutout-subject-environment-integration)

```json
{
  "key": "cutout-subject-environment-integration",
  "title": "누끼 인물/제품을 사실적 환경에 합성",
  "categories": ["배경 합성", "인물 컷", "제품 환경 합성", "룩북"],
  "tags": ["누끼 합성", "배경 합성", "scene integration", "..."],
  "usageTip": "원본 누끼 컷의 *조명 방향*을 먼저 확인하고 ...",
  "sceneTemplate": "{장면::원본 누끼 컷({피사체::인물 전신|...}) 1장, ...}",
  "templateText": "조명:\n원본 피사체의 광원 방향(좌/우/상/정면)을 *반드시 보존*하고, ...",
  "defaultParams": {
    "provider": "google",
    "model": "gemini-3-pro-image-preview",
    "aspectRatio": "3:2",
    "size": "1K",
    "negative": "원본 피사체의 형태/의상/얼굴 변형, ..."
  },
  "inputPolicy": {
    "referenceImage": {
      "required": true,
      "minCount": 1,
      "maxCount": 4,
      "enforceInCustomMode": true
    }
  },
  "accessLevel": "public",
  "enabled": true,
  "version": 1,
  "strictNew": true
}
```

### 5.2 콘텐츠 (multichannel-social-content-v1)

```json
{
  "key": "multichannel-social-content-v1",
  "title": "멀티채널 소셜 콘텐츠 생성",
  "categories": ["소셜미디어 콘텐츠", "멀티채널 마케팅", "카피라이팅", "콘텐츠 리퍼포징"],
  "tags": ["멀티채널 콘텐츠", "naver blog", "linkedin", "threads", "instagram", "..."],
  "templateText": "역할:\n- 다채널 콘텐츠 제작을 전문으로 하는 ...\n... (## 템플릿: 섹션 본문 전체)",
  "defaultParams": {
    "platform": "general",
    "language": "ko",
    "length": "naver: 1500-2500자 / linkedin: 500-900자 / ...",
    "outputFormat": "markdown/mermaid"
  },
  "accessLevel": "public",
  "enabled": true,
  "version": 1,
  "strictNew": true
}
```

---

## 6. 에러 코드 ↔ 처리 매트릭스

| errorCode                                                     | HTTP | 의미                          | 권장 처리                                                            |
| ------------------------------------------------------------- | ---- | ----------------------------- | -------------------------------------------------------------------- |
| `UNAUTHORIZED`                                                | 401  | `AGENT_API_KEY` 누락/오류     | env/`.mcp.json` 확인 후 재시작                                       |
| `INVALID_INPUT`                                               | 400  | 필드 누락/형식 위반           | 페이로드 재검증, 특히 key/title/templateText 필수값                  |
| `INVALID_INPUT` + `invalid_template_variables`                | 400  | 변수 문법 오류                | `issues[].field/key/code` 기준으로 수정 후 재시도                    |
| `INVALID_INPUT` + `legacy_negative_requires_manual_migration` | 400  | 본문에 "금지 표현" 잔존       | `negative`로 옮긴 뒤 본문에서 섹션 제거 후 재시도                    |
| `INVALID_INPUT` + `usage_tip_too_long`                        | 400  | 활용팁 140자 초과             | 잘라낸 후 재시도 또는 등록 보류                                      |
| `CONFLICT`                                                    | 409  | `strictNew=true`인데 key 존재 | 같은 개념이면 §4.2 갱신, 다른 개념이면 skip. **key 변형 우회 등록 금지** |
| `CONFLICT`                                                    | 409  | 반복 발생                     | skip 후 관리자 UI/명시 승인 유지보수 절차로 이관                     |
| `RATE_LIMITED`                                                | 429  | 분당 한도 초과                | 호출 간격 늘리거나 `AGENT_GEN_STUDIO_WRITE_REQUESTS_PER_MINUTE` 상향 |
| `INTERNAL_ERROR`                                              | 500  | DB/서버 오류                  | 로그 확인 후 재시도, 반복되면 운영 보고                              |

---

## 7. 절대 하지 말 것

- §4.1 개념 선점 검사 없이 새 key를 등록 — 같은 개념의 템플릿이 선형으로 누적된다
- 같은 개념을 `-v2`, `-2`, `-new`, `-final` 같은 접미사를 붙인 새 key로 재등록 (버전은 `version` 필드로 관리)
- 중복 판정을 피하려고 제목·카테고리·키워드만 바꿔 등록
- 기존 템플릿의 변수·옵션을 삭제하거나 이름을 바꿔 갱신
- `mongo` CLI나 `mongoose` 직접 호출로 컬렉션을 수정 — 캐시 무효화 누락으로 서비스 불일치 발생
- 본 가이드 §3 매핑 규칙을 거치지 않은 임의 페이로드 전송 — `defaultParams` 키 손실/오변환 위험
- agent-key를 로컬 텍스트 파일/PR/커밋 메시지로 노출
- `delete_*_prompt_template`을 운영 데이터에 즉시 호출(테스트 데이터 정리 또는 잘못 등록한 직후만 사용)

---

## 8. 검증 체크리스트 (등록 후)

- [ ] §4.1 개념 선점 검사를 수행했고 4축 판정 결과와 조회한 후보 목록을 근거로 남겼는가
- [ ] 유사(2축) 판정에서 신규로 등록한 경우 분리 허용 기준 충족 항목을 기록했는가
- [ ] 갱신인 경우 `key` 유지 · 기존 변수/옵션 무삭제 · `version` +1 · `strictNew=false` 조합인가
- [ ] 갱신인 경우 `completed/`의 기존 문서를 갱신했고 `new/`에 같은 개념 문서가 남지 않았는가
- [ ] `list_prompts({ promptType, q: <key> })`에 새 항목이 즉시 보이는가
- [ ] `get_prompt_template({ templateKey })`로 본문/`defaultParams`가 의도와 일치하는가
- [ ] (이미지) 어드민 UI 프롬프트 매니저에서 `provider/aspectRatio/size/negative`가 정확히 표시되는가
- [ ] (이미지) 기본 `size`가 최대 `1K`이고 `2K`·`4K`로 저장되지 않았는가
- [ ] (이미지) 첨부 이미지 기반 변환·합성 템플릿에 `inputPolicy.referenceImage.required=true`, `minCount>=1`, `enforceInCustomMode=true`가 적용됐는가
- [ ] (콘텐츠) ContentPromptStructuredFields의 `platform/language/length/outputFormat`이 정상 매칭되는가
- [ ] 필수 Select에 실제 옵션만 표시되고 필수 Input이 비어 있을 때 생성이 차단되는가
- [ ] 등록한 `templateKey`로 `generate_image` 호출 시 `TEMPLATE_NOT_FOUND` 없이 동작하는가(이미지 템플릿 한정)

---

## 9. 서비스 템플릿 그룹 연결

프롬프트 등록과 그룹 연결은 별도 원장 작업이다. 템플릿이 카탈로그에 존재한다는 사실만으로 Smartstore 등 서비스 그룹의 멤버·추천으로 자동 등록되지 않는다.

1. `list_template_groups({ target, serviceKey, promptType })`로 실제 `templateKeys`와 `recommendedTemplateKeys`를 조회한다.
2. 기존 그룹이면 `write_template_group({ action: "add_templates", ... })`로 필요한 key만 추가한다.
3. 신규 그룹이면 prompt type·title·visibility·serviceKeys를 명시해 `create`한다.
4. 기존 추천을 확인한 뒤 의도한 전체 추천 배열로 `set_recommended`한다.
5. 같은 target을 다시 조회해 멤버십과 추천 부분집합을 검증한다.

production 쓰기는 사용자 명시 승인과 `APPLY_TEMPLATE_GROUP:<groupKey>:production` 확인 문구 없이는 수행하지 않는다. 그룹·참고 이미지·검색·target의 전체 운영 계약은 `/home/attrest-samsung-linux/Project/amu_labs/{{AGENT_ROOT}}/refs/genstudio-mcp.md`를 따른다.
