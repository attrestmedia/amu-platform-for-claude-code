# Repository Topology (저장소 경계)

## 목적

AMU 워크스페이스는 **여러 개의 독립된 git 저장소가 한 디렉터리 트리 아래 나란히·중첩되어** 있다.
경로가 이어져 보인다고 하나의 저장소로 착각하면 잘못된 스코프에 커밋하거나, 저장소가 아닌
디렉터리를 "손상됐다"고 오판해 되돌릴 수 없는 초기화를 시도하게 된다. 이 문서가 경계의 정본이다.

## 1. 경로별 저장소 상태 (실측)

| 경로 | git 상태 | remote | 비고 |
| --- | --- | --- | --- |
| `~/Project/` (워크스페이스 루트) | **저장소 아님 — 설계 의도** | — | `.git/`에 `info/`만 있고 `HEAD`·`refs`·`objects`가 없다. 이것은 **손상이 아니라 원래 상태**다. `git init`으로 되살리거나 "복구"를 시도하지 않는다 |
| `~/Project/.agent/` | **git 비대상** | — | 버전 관리는 별도 백업 스크립트가 담당한다 — §2 |
| `~/Project/amu_app/` | 독립 git 저장소 | `gitlab.com/attrestmedia/amu_app.git` | **인프라·WordPress 작업 전용.** 브랜치 `work` |
| `~/Project/amu_app/node-app/` | **amu_app과 별개인** 독립 git 저장소(중첩, submodule 아님) | `gitlab.com/attrestmedia/node-app.git` | **AMU 앱(Next.js) 개발 전용.** 브랜치 `work`. `amu_app`의 `git ls-files`에 `node-app/` 경로가 없다 — 두 저장소는 커밋·브랜치·히스토리가 완전히 무관하다 |
| `~/Project/amu_native_app/` | 독립 git 저장소 | — | Flutter 앱 |
| `~/Project/amu_labs/` | 독립 git 저장소 | — | 모노레포 UI 실험·MCP 서버 |
| `~/Project/web-automation-project/` | 독립 git 저장소 | — | 자동화·배포 스크립트 |
| `~/Project/cloudflare-worker/` | 독립 git 저장소 | — | Worker |
| `~/Project/chrome-extensions/` | 독립 git 저장소 | — | Chrome 확장 |
| `~/Project/backups/` | 독립 git 저장소 | `gitlab.com/attrestmedia/backups.git` | 백업 스크립트·설정 저장소 자체(§2의 백업 산출물 보관소와는 다르다) |

**`.vscode/agent-targets.json`의 7개 sync target(`project`·`node-app`·`amu_app`·`amu_native_app`·
`amu_labs`·`web-automation-project`·`cloudflare-worker`)은 agent 문서 동기화 대상 목록이지
git 저장소 목록이 아니다.** `project`가 target에 있다고 해서 워크스페이스 루트가 git 저장소가
되는 것은 아니다 — 동기화 스크립트는 파일을 복사할 뿐 `.git`을 요구하지 않는다.

## 2. `.agent/` 버전 관리 — 백업 스크립트

`.agent/`는 git이 아니라 `~/Project/run-backup-agent-to-logs.sh`가 관리한다.

```text
소스     ~/Project/.agent
아카이브  ~/Data/Docs/Documents/@logs/{YYYYMMDD_HHmmss}.tar.gz (+ .meta.json 사이드카)
보존     최신 2개만 유지, 나머지는 스크립트가 자동 삭제
제외     worktrees, __pycache__, node_modules
```

`.agent/` 아래 원장·보고서·정책 문서의 이전 상태가 필요하면 이 아카이브를 확인한다.
git 이력(`git log`, `git blame`)으로 조회하려 하지 않는다 — 애초에 커밋된 적이 없다.

## 3. 작업 규칙

- **git 명령 전에 대상 디렉터리의 저장소를 먼저 확인한다** — `git -C <dir> rev-parse --show-toplevel`.
  워크스페이스 루트(`~/Project`)에서 `git status`·`git commit`을 실행하지 않는다. 실패는 정상이다.
- **`amu_app`과 `amu_app/node-app`은 별개 저장소로 취급한다.** "두 프로젝트를 함께 커밋해 달라"는
  요청은 실제로는 **두 개의 커밋**(저장소마다 하나씩)을 뜻한다. 하나의 커밋 메시지로 두 저장소의
  변경을 아우를 수 없다 — `{{AGENT_ROOT}}/rules/cross-project.md`의 "프로젝트별 검증 분리"와 같은 이유다.
- **`.agent/*` 변경은 git으로 커밋하지 않는다.** 커밋을 요청받으면 이 사실을 알리고, 필요하면
  §2의 백업 스크립트 실행 여부를 사용자에게 확인한다. `.agent/`를 `git add`하려는 시도 자체가
  스코프 오류 신호다.
- **동시 세션 오염을 커밋에 섞지 않는다.** 여러 에이전트 세션이 같은 저장소에서 동시에 작업할 수
  있다(`daily-log-concurrent-writers`와 같은 파일 레벨뿐 아니라 git 레벨에서도 발생).
  커밋 전 `git status`/`git diff --stat`으로 **이번 세션이 만들지 않은 변경**이 섞여 있는지 확인하고,
  그런 파일은 `git add`에서 제외한다. `package.json`처럼 여러 세션이 같은 파일의 서로 다른 부분을
  건드릴 수 있는 공유 파일은 `git diff -- <file>`로 자신의 hunk만 남아 있는지 재확인한 뒤 추가한다.
- 저장소 상태가 실제로 이상해 보이면(원격 불일치, detached HEAD, 예상 밖 커밋) **추정으로 단정하지
  말고 사용자에게 확인**한다. 이 문서에 없는 새 디렉터리를 발견하면 이 문서를 갱신할 후보로 남긴다.

## 참조

- 교차 스코프 절차: `{{AGENT_ROOT}}/rules/cross-project.md`
- 파괴적 작업·운영 안전 경계: `{{AGENT_ROOT}}/rules/safety-governance.md`
- 정책 정본 동기화 체계: 워크스페이스 루트 `CLAUDE.md`의 "정본 우선" 절
