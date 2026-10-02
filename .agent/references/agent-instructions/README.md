# 필수 확장 설치 확인:

- `triggerTaskOnSave` 확장

# 로컬 관리형

- 각 프로젝트에 `.vscode/settings.json`, `.vscode/tasks.json`, `agent/AGENT_GUIDE.md`, `skills/` 생성
- **AMU 워크스페이스는 이 모드를 쓰지 않는다.** 7개 타겟 전부 아래 중앙 관리형이므로 타겟 루트에 `skills/`를 만들지 않는다.
  과거 로컬 관리형 잔재였던 `amu_app/skills/`·`amu_native_app/skills/`는 2026-09-02에 삭제했다(내용이 `.claude/skills/`에 뒤처져 있었고 참조 0건).

# 중앙 관리형

- 각 타겟 폴더의 루트에 마커용 `.agent-sync-root` 파일 생성
- 프로젝트별 Agent Instructions는 중앙 Agents 레포의 `instructions/` 아래에 생성
- 타겟 루트 폴더와 마커용 `.agent-sync-root` 파일은 미리 존재해야 함
- `instructions/<project>/` 아래에서 `AGENT_GUIDE.md`, `skills/`, `rules/`를 제외한 추가 파일/폴더는 각 타겟의 `.claude/`, `.codex/` 아래 동일 경로로 동기화
- 공용 MCP는 루트 `mcp/.mcp.json`, `mcp/config.toml`에서 관리
- 프로젝트 전용 MCP는 `instructions/<project>/mcp/.mcp.json`, `instructions/<project>/mcp/config.toml`에서 관리
- MCP 운영·구현 문서는 `instructions/<project>/refs/`의 대응 정본을 먼저 수정하고 프로젝트 문서에는 그 내용을 반영
- MCP 자격증명 키 또는 환경변수 계약을 변경할 때는 JSON과 TOML 정본을 같은 작업에서 함께 갱신
- 동기화 시 루트 `mcp/`와 `instructions/<project>/mcp/`를 병합한 뒤 실제 프로젝트의 루트 `.mcp.json`, `.codex/config.toml`, `opencode.json`으로 반영
- 같은 MCP 키가 양쪽에 모두 있으면 프로젝트 설정이 우선하며, 객체는 병합되고 배열/스칼라는 프로젝트 값으로 대체
- `instructions/<project>/mcp/`는 일반 extra sync 대상에서는 제외되며 MCP 출력 파일 생성에만 사용
- `AGENT_GUIDE.md`, `skills/`, `rules/`, 기타 추가 동기화 문서 본문에서는 `{{AGENT_ROOT}}` 플레이스홀더를 사용할 수 있으며, 동기화 시 Claude 대상에는 `.claude`, Codex 대상에는 `.codex`로 치환됨
- 동기화 대상 하니스는 **Claude Code(`.claude`)·Codex(`.codex`)·OpenCode(`opencode.json`) 3종이다.** Cline은 2026-09-04에 제거 대상 CLI로 확정되어 동기화 대상에서 빠졌다 — `.cline/` 산출물을 새로 만들지 않는다.

# OpenCode MCP 정본 (2026-09-04 추가)

- **OpenCode는 `.mcp.json`이나 `.codex/config.toml`을 자동으로 읽지 않는다.** MCP는 `opencode.json`의 `mcp`에 명시 등록해야 하며, 등록이 없으면 `/mcps`가 비는 것이 정상 동작이다.
- 별도 정본을 만들지 않는다. **`mcp/.mcp.json`(공용)과 `instructions/<project>/mcp/.mcp.json`(프로젝트)이 그대로 OpenCode 정본**이며, 동기화 스크립트가 OpenCode 문법으로 변환해 각 타겟 루트의 `opencode.json`을 생성한다. 타겟의 `opencode.json`을 직접 고치면 다음 동기화에서 유실된다.
- 변환 규칙 (OpenCode stable v1 기준, `opencode --version` 1.18.x에서 확인)
  - `command` + `args` → `command: [command, ...args]` **배열 한 개로 합쳐진다**
  - `env` → **`environment`** (OpenCode local MCP의 환경변수 키는 `env`가 아니다)
  - `url` 또는 `type`이 `http`/`sse`/`remote`면 → `{ "type": "remote", "url", "headers" }`
  - `enabled: true`를 항상 명시하며, 정본에 `enabled: false`/`disabled: true`가 있으면 그대로 반영
  - `command`도 `url`도 없으면 `OPENCODE_CONVERT_FAILED`로 **해당 타겟 동기화를 중단**한다(무음 통과 없음)
- MCP 외 OpenCode 설정(`model`, `permission`, OpenCode 전용 remote MCP 등)은 오버레이 파일에 둔다
  - 공용: `mcp/opencode.json` · 프로젝트: `instructions/<project>/mcp/opencode.json`
  - 병합 순서는 `{ $schema, mcp(변환 결과) }` → 공용 오버레이 → 프로젝트 오버레이이며 **오버레이가 우선**한다. 특정 서버만 끄려면 오버레이에 `{"mcp":{"<name>":{"enabled":false}}}`를 둔다.
  - 오버레이는 OpenCode 문법 그대로 쓴다(변환하지 않는다).
- 정본 `.mcp.json`·오버레이가 모두 없으면 타겟의 `opencode.json`을 삭제한다.
- 사용자 전역 설정(`~/.config/opencode/opencode.json*`)은 동기화 대상이 아니다. 모든 프로젝트 공통 범용 MCP는 그쪽에 두고, AMU 전용 MCP만 이 경로로 관리한다.
- 등록 확인은 `opencode mcp list` 또는 세션 내 `/mcps`로 한다.
- **`opencode.json`은 `.mcp.json`과 동일한 자격증명(`AGENT_API_KEY`, WP app password)을 평문으로 담는다.** 커밋·공유 정책을 `.mcp.json`과 동일하게 취급한다.

# 훅 · settings 정본 (2026-08-04 추가)

- 하니스 훅 스크립트는 `instructions/<project>/hooks/`가 정본이며 extra sync 규칙에 따라 각 타겟의 `.claude/hooks/`, `.codex/hooks/`로 동기화됨
- 훅을 등록하는 `settings.json`은 `instructions/<project>/settings.json`이 정본이며 `.claude/settings.json`을 **통째로 덮어씀**
  - 따라서 `permissions` 등 기존 키를 정본에 모두 포함해야 하며, 타겟의 `.claude/settings.json`을 직접 수정하면 다음 동기화에서 유실됨
  - 사용자 로컬 설정인 `.claude/settings.local.json`은 정본 대상이 아니며 동기화가 건드리지 않음
- 훅 command 경로에는 `${CLAUDE_PROJECT_DIR}`와 `{{AGENT_ROOT}}`를 함께 써서 Claude/Codex 양쪽 산출물이 각자의 훅 경로를 가리키게 함
- `.py` 등 템플릿 치환 대상 확장자(`.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`)가 아닌 파일은 원본 그대로 복사되므로 스크립트 안에서는 `{{AGENT_ROOT}}`를 쓰지 말 것
- 훅은 코드 실행 경로다. 정본 변경 시 동기화 전에 표본 입력으로 동작을 검증하고 fail-open 여부를 확인할 것
