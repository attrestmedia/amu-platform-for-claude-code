---
name: ai-model-catalog-sync
description: AI 모델·가격 변동 반영. ai-model-tracker 실행 결과를 node-app 모델 정책(modelRole/pricingRoles/agentRateLimit), 이미지 과금 정책, system model catalog DB와 동기화한다. provider 모델 추가·삭제·단가 변경, System Control의 DB only/deprecated 정리 요청에 사용.
allowed-tools: Read, Grep, Edit, Bash, mcp
---

# AI Model Catalog Sync

이 스킬은 AI provider 모델 변동 확인 작업을 `ai-model-tracker`, `node-app` 정책 파일, system model catalog DB까지 일관되게 반영하기 위한 절차를 정의함.

> **실행 진입은 원장이다.** 모델 추가·갱신·가격 변동 반영을 요청받으면 이 스킬로 한 세션이 처음부터 끝까지 진행하지 말고 `.agent/todo-ledgers/tasks/todo-model-update.json`의 `TASK-MODEL-CATALOG-REGULAR-SYNC`로 진입해 그 원장의 `entryDispatch`(run 단위 INTAKE → BUILD(MS-PARALLEL) → SYNC)를 따른다. 이 스킬은 각 단계가 참조하는 세부 절차이며, 수집 방법 등 두 문서가 어긋나면 원장이 우선한다.

## 1) 입력 확인

- 참고 보고서가 있으면 먼저 읽는다.
- 관리자 System Control 화면 캡처가 있으면 `정책 기본`, `DB 기본`, `DB only`, `deprecated` 상태를 확인한다.
- 대상 환경이 local인지 production인지 확인하고, DB 변경은 해당 환경의 agent key/MCP 설정을 사용한다.

## 2) tracker 실행

- `ai-model-tracker/data/changes`와 `ai-model-tracker/data/snapshots` 폴더에 생성된 문서가 없을 경우 아래의 명령어를 실행하여 changes와 snapshots에 관련 문서를 생성한다.

```bash
cd /home/attrest-samsung-linux/Project/web-automation-project/ai-model-tracker
./venv/bin/python main.py --dry-run
```

- `--dry-run`은 저장하지 않고 `--no-ai-pricing`·`--no-notify`를 함께 적용한다. 유료 Gemini 가격
  추출과 외부 알림 발송이 일어나지 않는다. 저장은 필요 없지만 유료 호출도 피하고 싶을 때는
  `--no-ai-pricing`을 단독으로 쓸 수 있다.
- 저장/알림이 필요한 운영 갱신은 `./venv/bin/python main.py`를 사용한다. 동시 실행은
  `data/.run.lock`이 막는다 — 이미 실행 중이면 exit code 2로 즉시 중단한다.
- 스냅샷은 `data/snapshots/runs/`에 run 단위로 immutable 저장되고 `data/snapshots/{날짜}.json`은
  최신 run을 가리키는 포인터다. **같은 날 재실행해도 이전 관측은 남는다.**
- 실행 결과의 신규/삭제/가격 변동을 `config/current_models.yaml`의 현재 정책과 비교한다.
- **`collection_incomplete` 변동이 있으면 그 provider의 삭제·가격 제거 판정을 신뢰하지 않는다.**
  수집 실패·provider 누락은 모델 삭제로 판정되지 않고 이 변동으로만 보고된다. 원인을 먼저 확인한다.

## 3) 코드 정책 동기화

아래 파일을 한 세트로 맞춘다.

- `web-automation-project/ai-model-tracker/config/current_models.yaml`
- `amu_app/node-app/src/consts/ai/modelRole.ts`
- `amu_app/node-app/src/consts/payment/pricingRoles.ts`
- `amu_app/node-app/src/libs/server-utils/auth/agentRateLimit.ts`
- `amu_app/node-app/src/libs/server-utils/api/systemModelControl.ts`
- `amu_labs/apps/mcp/gen-studio/src/index.ts`
- 필요 시 provider helper, prompt model lock, Gen-Studio preset UI/MCP

- **decision inventory(`config/decision_models.yaml`, provider `typesafe`/JEV)는 이 동기화 대상이 아니다.** `current_models.yaml`·`model_catalog_policy.json`·node-app 모델 정책에 옮기지 않는다(INV-4, JEV-102). manifest 검증기가 decision 모델을 거부한다.

정책 기준:

- 최신 + 이전 frontier + 최신 mini/lite/nano 중심으로 유지
- **speech(audio) 모델은 단위를 함께 관리한다.** TTS는 문자, STT는 오디오 시간이며
  `1,000자 ≈ 1분` 같은 환산을 내부 원가 계산에 쓰지 않는다. 단위 없는 가격은 승인하지 않는다
  (`core/pricing_units.py`, ADR-EL-001 D5).
- **voice catalog health**: voice별 단가·권리 상태·notice period·지원 모델은 모델 카탈로그가 아니라
  voice catalog에서 해석한다. `lastVerifiedAt`이 없는 voice는 공개 자산 생성 후보로 올리지 않는다.
- **가격 stale 판정**: 관측 `valid_from`이 현재 승인 revision보다 오래됐거나 `certainty`가
  `estimated`/`unknown`이면 stale로 본다. stale 가격으로 기본 모델을 승격하지 않는다.
- Google 이미지 `gemini-2.5-flash-image`는 유지
- OpenAI 이미지 `dall-e-2`는 제거 상태 유지
- 토큰 기반 이미지 모델은 fixed minimum + token excess hybrid 과금 유지

## 4) DB catalog 동기화

### 4-0) 표준 실행 순서

```text
정기 수집  →  사람 검토  →  승인 manifest 갱신  →  local plan/apply
          →  smoke  →  production plan/apply  →  parity 확인  →  일정 기록
```

- 승인 manifest는 `config/model_catalog_policy.json` 하나이며 local과 production에
  **같은 hash**로 적용한다. 적용 전 검증한다.

  ```bash
  cd /home/attrest-samsung-linux/Project/web-automation-project/ai-model-tracker
  ./venv/bin/python -c "import json; from core.manifest_export import validate_manifest; \
    print(validate_manifest(json.load(open('config/model_catalog_policy.json'))))"
  ```

- `audio` modality와 speech role이 들어간 manifest는 `schemaVersion: 2` 이상을 요구한다.
  **consumer를 먼저 배포하고 producer manifest를 발행한다.** 순서를 뒤집으면 구버전 소비부가
  audio 항목을 삭제 대상으로 계산한다.
- manifest hash는 원본 문서 전체로 계산한다. 소비부가 아직 읽지 않는 필드가 바뀌어도 hash가 바뀐다.
  tracker(`core/manifest_export.manifest_hash`)와 gen-studio(`modelCatalogSync.canonicalize`)의
  계산 정의가 같아야 하며, 어긋나면 동기화를 중단한다.
- **수집 목록과 승인 정책은 다르다.** tracker가 관측했다는 사실만으로 manifest에 넣지 않는다.

### 4-1) MCP/API 절차

> 아래 direct upsert/delete는 **예외 복구 경로**다. 정상 갱신은 4-0의 manifest 경로를 따른다.
> 운영 DB를 manifest 없이 직접 바꾸면 local/production parity를 잃는다.

1. 우선 조회한다.

- MCP: `list_system_models`
- API: `GET /api/ai/agent/system-models` with `x-agent-key`

2. 신규/유지 모델은 upsert한다.

- MCP: `upsert_system_model`
- API: `POST /api/ai/agent/system-models`

3. 제거 모델은 soft delete한다.

- MCP: `delete_system_model`
- API: `DELETE /api/ai/agent/system-models`

4. hard delete는 명시 요청/승인이 있을 때만 사용한다.

## 5) 실호출 및 비용 정합성 검증

- 신규 활성 모델마다 플랫폼과 동일한 API·파라미터 형태로 최소 1회 실호출한다.
- HTTP 상태, provider request id, 실제 반환 model, finish reason, 입력/출력/캐시/추론 토큰을 기록한다.
- 공식 API 단가로 호출별 예상 원가를 계산하고 내부 토큰-per-coin 또는 고정 과금 설정과 비교한다. 최소 코인·올림 차이는 별도 항목으로 분리한다.
- `insufficient_quota`와 모델·파라미터 호환성 오류를 분리 진단한다. OpenAI GPT-5.6 Chat Completions에는 비기본 `temperature`를 전송하지 않는다.
- API 예산·키·조직 변경 뒤에는 실호출 게이트를 다시 수행하며, 성공 전에는 기본·추천 모델 승격 및 배포를 완료 처리하지 않는다.

## 6) 관리자 화면 확인

- System Control의 그룹 헤더에서 `정책 기본`과 `DB 기본`을 비교한다.
- 불일치가 있으면 `정책 기본 적용`으로 DB 기본 모델을 맞춘다.
- `DB only`와 `deprecated`는 코드 정책에서 빠진 DB 문서이므로 삭제/비활성화 대상에 포함한다.

## 7) 검증 및 보고

```bash
cd /home/attrest-samsung-linux/Project/amu_app/node-app
pnpm run typecheck

cd /home/attrest-samsung-linux/Project/amu_labs
pnpm --filter @amu_labs/mcp-genstudio typecheck

cd /home/attrest-samsung-linux/Project/web-automation-project/ai-model-tracker
./venv/bin/python -c "import yaml; yaml.safe_load(open('config/current_models.yaml'))"
./venv/bin/python -m unittest discover -s tests
```

- **tracker 테스트 runner는 `unittest`다.** venv에 `pytest`가 설치되어 있지 않으므로
  `python -m pytest tests`는 실행되지 않는다. 별도로 설치하지 않는다.
- 환경 문제로 실행하지 못한 검증은 통과로 간주하지 않고 보고서에 사유와 함께 그대로 기록한다.
- 최종 보고서에는 tracker 결과, 코드 변경, DB 동기화 결과, 관리자 화면 정리 결과, 검증 결과를 포함한다.

## 8) 장애 대응

| 상황 | 판정 | 담당 |
| --- | --- | --- |
| `collection_incomplete` 발생 | 삭제·가격 제거 판정 보류. 원인 확인 후 재수집 | 실행 에이전트 |
| 같은 provider 연속 3회 수집 실패 | 사용자에게 보고하고 자동 재시도를 멈춘다 | Main |
| 가격이 갑자기 크게 변동 | 자동 apply 금지. 공식 문서 재확인 후 사람 승인 | Main + 사용자 |
| provider 지원 종료 예고 | manifest soft-deprecate 후보로만 올린다. 즉시 삭제하지 않는다 | Main + 사용자 |
| manifest hash가 local/production에서 다름 | 동기화 중단. 어느 쪽이 승인본인지 확인 | Main + 사용자 |

**어떤 경우에도 수집 결과만으로 운영 DB를 자동 apply하지 않는다.**
