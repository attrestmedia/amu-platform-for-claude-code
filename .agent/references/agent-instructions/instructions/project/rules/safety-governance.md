# Safety & Governance Rules

## 저장소 경계

- git 명령(커밋·브랜치·push)을 실행하기 전에 대상 디렉터리가 어느 저장소에 속하는지 먼저 확인한다.
  워크스페이스 루트(`~/Project`)는 저장소가 아니고, `amu_app`과 `amu_app/node-app`은 서로 다른
  저장소이며, `.agent/`는 git 비대상이다 — 정본: `{{AGENT_ROOT}}/rules/repository-topology.md`
- 저장소가 아닌 디렉터리의 `.git/`이 비어 보인다고 `git init`이나 복구를 시도하지 않는다.
  워크스페이스 루트가 그런 상태다(설계 의도).

## 파괴적 작업

- 금지: `rm -rf`, `docker system prune`, DB drop/reset, 무차별 삭제
- 설정 변경은 최소 diff로 하고 롤백 방법(원복 명령/이전 값)을 함께 남긴다
- DB 쓰기·원격 동기화가 발생하는 스크립트는 가능하면 `--dry-run`을 먼저 실행한다

## 파일 권한 임시 상향

- 파일·디렉터리 권한 상향은 **원복까지 한 작업 단위 안에서 끝낸다.** 다음 작업·다음 세션으로 미루지 않으며, 검증 실패로 롤백하는 경우에도 원복은 수행한다.
- 상향 전 원래 값을 먼저 기록하고, 원복 후 같은 값인지 재확인해 보고서 검증 표에 남긴다.
- 범위는 **대상 디렉터리 하나로 한정**한다. 재귀(`-R`) 상향, 프로젝트 루트 상향, `777`은 금지한다.
- 현재 허용된 유일한 사례는 **AMU Magazine WordPress 테마 개선 작업에서 파일 분리가 정당화될 때**이며, 절차는 `amu_app/{{AGENT_ROOT}}/rules/split-implementation.md`의 "테마 마운트 쓰기 권한 임시 상향"을 단일 기준으로 따른다.
- 권한이 없다는 이유로 분리 대상 코드를 기존 파일에 인라인으로 누적하는 우회는 금지한다.

## 보안 원칙

- 인증/권한은 서버에서 강제 적용 (클라이언트 전용 검증 금지)
- 환경변수/시크릿은 절대 코드에 하드코딩 금지
- 포트/관리자 경로/비밀키 노출은 최소 공개 원칙 유지
- 외부 API 호출/비용 발생 작업은 사전 체크 + 로깅 필수
- 비용 발생·코인 변동·보상 지급 API는 node-app `rules/server-economy-security.md`의 계약(fail-closed·preflight·멱등·이원 원장·에스크로)을 따를 것

## 운영 안전 규칙

- 재시작/적용/배포 명령은 **"제안" 형태로만** 제공 (무단 실행 전제 금지)
- 변경 전 "현재 상태(서비스/포트/도메인/볼륨/프록시/SSL)"를 먼저 확인
- 변경 후 실행 명령, 검증 결과, 롤백 경로를 반드시 남김
- Automation(`web-automation-project`) 검증: 스크립트별 `--dry-run`, 입력 JSON 검증
- Cloudflare(`cloudflare-worker`) 검증: `wrangler deploy --dry-run` → 배포 → 헬스체크 → 실패 시 롤백 (`cloudflare-worker/{{AGENT_ROOT}}/rules/worker-deploy.md`)

## 배포/실시간 검증 게이트

- **배포 검증 절차**: 배포 제안에는 ① 배포 전 dry-run/빌드 검증 ② 배포 직후 헬스체크(대상 URL/기대 응답) ③ 실패 시 롤백 명령을 항상 세트로 포함한다.
- **production publish 게이트**: WP production publish는 env flag(`AMU_PUBLISHER_ALLOW_PRODUCTION_PUBLISH=true`) + `confirmSlug` 일치 + SEO 게이트 통과를 모두 요구한다.
- **발행 승인 경계는 직전 상태로 가른다 (2026-09-04 신설)**. 위 게이트 3조건은 양쪽에 동일하게 적용된다.

  | 대상 | 직전 status | 승인 |
  | --- | --- | --- |
  | 신규 기사 발행 | 비공개 | **사용자 승인 필요.** 발행하지 않아도 손실이 없다 |
  | 리뉴얼 발행 | **publish(라이브)** | **에이전트 자동 실행.** 리뉴얼이 내린 URL의 원상 복구이며, 미발행이 곧 라이브 오프라인 장애다 |

  - 자동 실행이라도 `dryRun: true` 선행 → `requiredChecks` 전항 확인 → `dryRun: false` 순서를 지킨다.
  - 게이트 미통과로 발행되지 않으면 draft로 방치하지 말고 **즉시 사용자에게 고지**한다. 근거: 2026-08-27 `hybrid-app-webview-microphone-permission` 방치 장애(`{{AGENT_ROOT}}/refs/wp-seo-gate-known-limits.md` §9).
  - 이 예외는 **같은 URL 리뉴얼에만** 적용된다. 신규 발행·삭제·redirect·카테고리 일괄 변경에는 적용하지 않는다(아래 off-topic 정리 예외는 별도 근거로 부여된 것이다).
- **리뉴얼 큐 off-topic 정리 경계**는 아래 "리뉴얼 큐 off-topic 정리" 절이 정한다. `reason_code = off_topic_asset_protection` 큐 항목의 `301 등록 → trash` 정리는 사용자 상시 승인이며 건별 승인을 다시 받지 않는다.
- **실시간(S0→S1) 게이트**: HTTP 계약 안정화(S0) 완료 전 실시간/소켓(`amu-realtime`) 작업(S1) 착수 금지 — 근거: `.agent/docs/project/2026/07/20260706_170235__socket-communication-readiness-review.md`

## 리뉴얼 큐 off-topic 정리 — `off_topic_asset_protection` (2026-09-04 신설 · 2026-09-05 정본 이관)

**절차·롤백·기록 항목의 정본은 이 절이다.** 종전 정본이던 `article_renewal.md` §0-2는 이 절로 이관했고, `article_renewal.md` 자체는 2026-09-05 폐기했다(나머지 리뉴얼 절차는 `{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` "WP → WP 같은 URL 리뉴얼 절차"로 통합) — 상시 승인 경계를 정하는 규칙과 그 승인이 허용하는 실행 절차가 서로 다른 문서에 갈라져 있으면 한쪽만 개정되는 드리프트가 생긴다.

`.agent/content/articles/queue/magazine/links.csv`의 `reason_code`가 **`off_topic_asset_protection`**(권고 행동이 `… 301`로 끝나는 항목)인 큐 항목은 **리뉴얼 대상이 아니다.** 현 전략축 밖 주제라 전면 재작성해도 전략 적합도가 회복되지 않는다. 이 판정을 만나면 집필·리서치·품질 게이트를 전부 건너뛰고 아래 정리 절차를 실행한 뒤 **다음 큐 항목으로 넘어간다.**

**사용자 상시 승인이며 건별 승인을 다시 받지 않는다** — 승인은 2026-09-04에 이 규칙으로 부여됐다. 적용 범위는 그 `reason_code` 하나뿐이다. `duplicate`·`expired` 등 다른 사유의 `merge_301`·`remove_410`·`archive_noindex`는 종전대로 건별 승인 대상이다.

### 착수 조건 — 셋을 모두 만족할 때만 자동 실행한다

1. 큐 행의 `reason_code`가 `off_topic_asset_protection`이다. **다른 사유로 점수가 낮은 항목에는 적용하지 않는다.**
2. `read_post`로 현재 status가 `publish`임을 확인했다.
3. 301 destination을 같은 사이트 내부 경로로 확정했다.

### 실행 순서 — redirect를 먼저 등록하고 그다음 휴지통으로 옮긴다

순서를 바꾸면 그 사이 URL이 404가 된다.

```text
1  read_post(slug)                    현재 status · category · postId 확인
2  destination 확정                   ① 의미가 같은 대표 글 URL  ② 없으면 같은 카테고리 아카이브 경로
3  manage_content_redirect(dryRun)    301  /<slug>/ → destination
4  manage_content_redirect(confirm)   local → production 순차
5  update_post_status(dryRun, trash)
6  update_post_status(confirm, trash) local → production 순차
7  라이브 URL 재조회                   301 응답과 도착 경로 확인
```

### 제약

- `trash`는 **복구 가능한 WordPress 휴지통 이동**이다. 영구 삭제는 하지 않으며 MCP에도 해당 도구가 없다. redirect를 먼저 등록하지 않은 `trash` 단독 실행은 금지한다 — 내부 유입 링크가 404가 된다.
- production 단계에는 `AMU_PUBLISHER_ALLOW_PRODUCTION_CLEANUP=true`가 필요하다. 플래그가 없으면 local까지만 처리하고 production은 `blocked`로 **즉시 고지**한다. 반쯤 정리된 상태로 방치하지 않는다.
- destination을 확정하지 못하면 삭제하지 않는다. `blocked`로 두고 다음 항목으로 진행한다.
- **정리를 마친 항목은 큐에서 제거한다.** 리뉴얼 처리 행과 같은 방식이며, 제거하지 않으면 다음 사이클이 같은 항목을 다시 집는다.
- 착수 조건 2가 이미 깨진 항목(현재 status가 `publish`가 아님)은 앞선 사이클에서 정리된 것으로 보고 **오류로 처리하지 않고 조용히 건너뛴다.**
- **내부 유입 링크는 redirect가 흡수하지만 거기서 끝내지 않는다.** 착수 전 `internal_link_graph.py`로 값을 재산출하고(`{{AGENT_ROOT}}/refs/content-policy/content_production_workflow.md` "WP → WP 같은 URL 리뉴얼 절차"의 `internal_inbound_links` 컬럼 — 큐의 값은 스냅샷이라 낡는다), `internal_inbound_links > 0`이면 유입 링크 수와 도착 경로를 보고에 남긴 뒤 링크 원문을 실제 대체 기사로 교체한다.
- 2026-09-04 실측 대상은 16건이며 전부 `Success & Psychology` 카테고리다. 큐가 갱신되면 건수는 달라진다 — **건수를 조건으로 쓰지 않고 `reason_code`로 판정한다.**

### 기록과 롤백

- 처리 결과는 `slug` · `postId` · `destination` · redirect 규칙 id · `internal_inbound_links` · 적용 대상(local/production)을 한 줄로 ledger와 보고에 남긴다.
- 롤백은 `update_post_status`로 `publish` 복구 + `manage_content_redirect` 규칙 삭제다.

> **원장 게이트와의 관계.** `.agent/todo-amu-magazine-intelligence-renewal.json`의 `G-MIR-03`은 301·삭제에 건별 사용자 승인을 요구한다. 이 절은 그 게이트의 **범위 한정 예외**이며 `reason_code = off_topic_asset_protection`에만 적용된다.
