# 에이전트 콘텐츠 이미지 모델 라우팅 정책

## 적용 범위와 우선순위

이 정책은 에이전트가 기사·마케팅 콘텐츠·프롬프트 템플릿을 위해 **새 이미지를 생성하도록 승인된 경우**에 적용한다. 기존 자산 재사용, 채널별 이미지 생성 금지, 사용자 사전 승인, 코인 비용 고지, 참고 이미지 저작권·라이선스 규칙이 더 높은 우선순위다. 특히 Instagram 재가공의 신규 이미지 생성 금지를 이 정책으로 우회하지 않는다.

모델명은 사용자에게 선택을 떠넘기는 입력값이 아니라 목적 기반 라우팅 결과다. 에이전트는 `generate_image`에 `routingProfile`과 필요한 경우 `textPolicy`를 전달하고, `provider`·`modelName` 직접 지정은 진단·승인된 고급 override에만 사용한다.

## 라우팅 표

| 목적 | `routingProfile` | 기본 `textPolicy` | 1순위 | 폴백 | 사용 기준 |
| --- | --- | --- | --- | --- | --- |
| 보조 이미지·저비용 시각 자료 | `supporting_visual` | `overlay_later` | Z.ai `glm-image` | Google `gemini-2.5-flash-image` (Nano Banana) | 인포그래픽 배경·개념 설명·본문 보조컷처럼 비주얼 완성도가 핵심 가치가 아닌 경우 |
| 텍스트 없는 그래픽 | `graphic_no_text` | `none` | Google `gemini-2.5-flash-image` (Nano Banana) | xAI `grok-imagine-image` | 일러스트·썸네일·배경·아이콘성 그래픽 등 이미지 안에 글자가 없어야 하는 경우 |
| 고품질·템플릿 샘플·내장 텍스트 | `premium_template_sample` | 필요에 따라 `none` 또는 `embedded_required` | Google `gemini-3.1-flash-image-preview` (Nano Banana 2) | xAI `grok-imagine-image-2.0` (서버 고정 1K·low) → OpenAI `gpt-image-2.5-flare` | 이미지 템플릿 대표 샘플, 브랜드 충실도·복잡한 구도·정교한 타이포그래피가 결과 품질을 좌우하는 경우 |

OpenAI 이미지 정본 모델 ID는 `gpt-image-2.5-flare`(화면 alias `Flare`)와 `gpt-image-2.5-sunburst`(alias `Sunburst`)다. alias는 표시용일 뿐 요청·원장·로그에는 항상 정본 ID를 저장한다.

xAI 이미지 정본 ID는 경제형 기본 모델 `grok-imagine-image`와 이미지 품질 역할의 추천 모델 `grok-imagine-image-2.0`이다. 최신 2.0 모델은 기본 모델을 대체하지 않으며 `premium_template_sample`의 제한된 폴백으로만 사용한다. 이 경로는 서버가 `1K`·`low`로 고정하는 text-to-image 생성에 한정하고, 참고 이미지 입력·편집·합성 및 더 높은 해상도·품질 옵션은 허용하지 않는다. 승인된 `$0.04/image` 고정 과금은 이 생성 조건에만 적용한다.

> 2026-09-09 교체 — 종전 정본이던 `gpt-image-2`(alias `Duct Tape`)와 `gpt-image-1.5`·`gpt-image-1-mini`는 deprecated다. 라우팅 후보로 쓰지 않으며, 과거 원장에 남은 ID는 그대로 둔다. 사용자 요청의 “Duck Tape”는 `Duct Tape`의 철자가 다른 표현이었다.

## 판정 순서

1. 기존 자산으로 목적을 달성할 수 있으면 생성하지 않는다.
2. 이미지 안에 글자가 없어야 하면 `graphic_no_text + none`을 사용하고 프롬프트에도 `no text, no letters, no typography, no watermark`를 명시한다.
3. 텍스트가 필요한 인포그래픽은 먼저 이미지와 텍스트를 분리할 수 있는지 판단한다.
   - 분리 가능: `supporting_visual + overlay_later`로 배경·도형만 생성하고, 제목·수치·라벨은 HTML/SVG/Canvas 등 결정적 렌더러로 후처리한다.
   - 이미지 모델이 읽을 수 있는 텍스트를 직접 그려야 함: `textPolicy=embedded_required`를 사용한다. 서버는 이를 `premium_template_sample`로 승격한다.
4. 이미지 템플릿용 대표 샘플, 브랜드 검수용 최종안, 복잡한 제품/인물 표현처럼 품질 실패 비용이 큰 경우에만 `premium_template_sample`을 쓴다. 단순 본문 삽입 이미지에 상위 모델을 사용하지 않는다.
5. 참고 이미지가 있으면 text-to-image 전용인 `glm-image`를 건너뛰고 다음 호환 후보를 사용한다.

## QwenCloud 후보 법무 게이트

- QwenCloud `qwen-image-3.0-pro`의 공개 provider capability에는 텍스트·이미지 입력, 이미지 편집, 최대 6개 출력과 최대 2048px가 포함된다. 이는 AMU가 승인한 기능 범위를 뜻하지 않는다. 현재 D3 후보 scope는 **text input → 1K image output**만이며 참고 이미지 입력·편집·2K 이상 출력은 제외한다.
- 이 모델은 공개 문서 후보일 뿐 승인된 라우팅 모델이 아니다. 현재 승인 카탈로그와 이 라우팅 표의 선택 후보에 추가하지 않으며, `provider`·`modelName` 직접 지정으로도 우회하지 않는다.
- D5 `DISCLOSURE-007`의 계약 법인·개인정보 수령자·실제 처리 국가·보유/삭제 조건, 개인정보 국외 이전 근거·고지/동의, PAYG 계정 적격성·과금과 최종 모델 승인이 끝나고 리더 R4 및 필요한 사용자 게이트가 통과되기 전까지 QwenCloud로 이용자 이미지나 프롬프트를 보내지 않는다. Token Plan의 공개 사용 조건은 앱 백엔드 호출을 허용하지 않아 현재 제품 runtime 후보에서 제외한다. 신규 Qwen 자격증명 저장 계약은 PAYG 전용이며 새 저장값은 pending/unverified로 safe-off 유지된다. 이 작업에서는 실제 credential 저장이나 DB 조회를 하지 않았으므로 실제 credential 존재 여부와 상태는 미확인이다.

## 런타임과 폴백

- 서버는 System Model Catalog에서 `enabled=true`, `adminOnly=false`, `deprecated=false`인 모델만 선택한다.
- `supporting_visual`은 Z.ai 자격 증명·카탈로그 활성화·런타임 검증이 끝난 경우에만 `glm-image`를 실행한다. 아직 활성화되지 않았거나 1,000자 프롬프트 제한을 넘으면 Nano Banana로 폴백하며, `fallbackApplied`와 `routingReason`을 결과·로그에 남긴다.
- `glm-image`는 text-to-image 용도로만 취급한다. 참고 이미지, image-to-image, 편집·합성이 필요하면 자동 폴백하며 강제 지정하지 않는다.
- `graphic_no_text`에서 Nano Banana가 선택 불가하면 Grok Imagine으로 폴백한다. Grok Imagine의 허용 비율 등 provider 제약은 서버 계약을 따른다.
- `premium_template_sample`에서 Nano Banana 2가 선택 불가하면 참고 이미지가 없을 때 Grok Imagine Image 2.0을 `1K`·`low`로 시도하고, 사용할 수 없으면 GPT Image 2.5 Flare로 폴백한다. 참고 이미지가 있으면 Grok Imagine Image 2.0을 건너뛴다. 폴백만을 이유로 유료 재시도를 반복하지 않는다.
- 명시적 `provider`·`modelName`이 `routingProfile`의 허용 후보와 충돌하면 서버는 `IMAGE_ROUTING_POLICY_CONFLICT`로 거부한다.

## MCP 요청 예시

보조 이미지:

```json
{
  "prompt": "Simple supporting visual with empty areas reserved for later labels",
  "routingProfile": "supporting_visual",
  "textPolicy": "overlay_later",
  "size": "1K",
  "n": 1
}
```

텍스트 없는 그래픽:

```json
{
  "prompt": "Clean editorial graphic, no text, no letters, no typography, no watermark",
  "routingProfile": "graphic_no_text",
  "textPolicy": "none",
  "size": "1K",
  "n": 1
}
```

고품질 템플릿 샘플:

```json
{
  "templateKey": "registered-template-key",
  "prompt": "Production-quality representative sample for template review",
  "routingProfile": "premium_template_sample",
  "textPolicy": "none",
  "size": "1K",
  "n": 1
}
```

## 비용·증거 게이트

- `generate_image`는 코인을 차감한다. 호출 전에 목적, 라우팅 프로필, 예상 provider/model 후보, 크기, 장수, 폴백 가능성을 사용자에게 알리고 승인을 받는다.
- 서버도 `textPolicy=none`에는 no-text 지시를, `overlay_later`에는 읽을 수 있는 텍스트 금지와 후처리 여백 지시를 프롬프트에 덧붙인다. 호출자는 목적에 맞는 원문 프롬프트를 작성하고 서버 보강을 우회하지 않는다.
- 성공 후 `assetId`, 실제 provider/model, `routingProfile`, `effectiveRoutingProfile`, `textPolicy`, `textPolicyApplied`, `fallbackApplied`, `routingReason`, coins를 확인한다. 라우팅 필드가 없는 legacy explicit 요청은 원문 프롬프트를 보존하며 `textPolicyApplied=false`다.
- 저장 asset이 없거나 모든 provider가 `assets 0 / coins 0`이면 백엔드 장애로 보고 유료 재시도를 중단한다.
- 콘텐츠 본문에는 검증된 `assetId`와 의미 있는 alt 텍스트만 삽입한다.
