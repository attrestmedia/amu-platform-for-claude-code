#!/usr/bin/env python3
"""한글 전사 무결성 훅 (text-encoding-integrity.md 집행기)

정본: .agent/agent-instructions/instructions/project/hooks/korean-text-integrity.py
동기화 산출물: .claude/hooks/, .codex/hooks/ — 산출물을 직접 수정하지 말 것.

규칙 근거: .claude/rules/text-encoding-integrity.md
  §1 손으로 작성한 이스케이프 금지 (\\uXXXX, HTML 엔티티)
  §3 json.dump는 ensure_ascii=False
  §4 저장 후 재조회 대조

이 훅이 하는 일 (3계층):

  1. 차단 - 도구 인자 문자열 안에 남아 있는 한글 영역 이스케이프/엔티티를 탐지해 deny
       (Write/Edit의 .md/.mdx/.txt/.rst는 면제. 규칙 문서와 보고서가 금지 표기를
        예시로 인용해야 하고, 산문에 남은 이스케이프는 화면에 그대로 보여
        조용한 손상이라는 이 규칙의 전제가 성립하지 않는다.)
  2. 차단 - json.dump( 파일 쓰기에 ensure_ascii=False가 없으면 deny
  3. 주입 - MCP 쓰기 도구 호출 직전/직후에 리터럴 전달과 재조회 대조를 컨텍스트로 주입

이 훅이 못 하는 일 (설계상 한계, 보고서 20260804 §3 참조):

  에이전트가 도구 호출 최상위 JSON에 \\uc548 형태로 적으면 harness가 훅에 넘기기 전에
  이미 실제 문자로 디코드한다. 그 경로는 훅이 원리적으로 볼 수 없다.
  1번 차단은 "인자 값 자체가 JSON 텍스트를 담은 문자열"인 경우만 잡힌다.
  최상위 경로에 대한 실질적 통제는 3번의 적시 주입과 §4 재조회 대조다.

실패 시 fail-open. 이 훅은 보안 통제가 아니라 전사 품질 게이트이므로
예기치 못한 오류로 정상 작업을 막지 않는다.
"""

import json
import re
import sys

ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")
ENTITY_HEX_RE = re.compile(r"&#x([0-9a-fA-F]{2,6});", re.IGNORECASE)
ENTITY_DEC_RE = re.compile(r"&#([0-9]{2,7});")

# 한글 음절/자모 영역. 이 범위 밖의 이스케이프(\n, ​ 등)는 건드리지 않는다.
HANGUL_RANGES = (
    (0xAC00, 0xD7A3),  # 완성형 음절
    (0x1100, 0x11FF),  # 자모
    (0x3130, 0x318F),  # 호환 자모
    (0xA960, 0xA97F),  # 확장 A
    (0xD7B0, 0xD7FF),  # 확장 B
)

MCP_WRITE_HINTS = (
    "submit_local_generation",
    "apply_channel_action",
    "enqueue_content",
    "upsert_image_prompt_template",
    "upsert_content_prompt_template",
    "write_template_group",
    "create_wordpress_draft",
    "publish_wordpress_post",
    "save_promo_creative",
    "upsert_keyword_profile",
    "update_advertising_criteria",
)

LITERAL_REMINDER = (
    "한글 전사 규칙(.claude/rules/text-encoding-integrity.md): "
    "제목·본문·태그·note를 포함한 모든 비ASCII 값을 리터럴 UTF-8로 쓴다. "
    "\\uXXXX 이스케이프와 HTML 엔티티로 옮겨 적지 않는다. "
    "긴 페이로드는 눈으로 전사하지 말고 파일이나 스크립트로 직렬화한다."
)

VERIFY_REMINDER = (
    "한글 전사 규칙 §4: 방금 저장한 한글 본문을 재조회해 원문과 대조하라. "
    "응답 echo만 훑고 넘어가지 않는다. 우선 확인 대상은 고유명사, 외래어 표기, "
    "복합 명사, 조사가 붙은 어절이다. 깨짐을 발견하면 다음 작업 전에 즉시 정정한다."
)


def in_hangul_range(code: int) -> bool:
    return any(lo <= code <= hi for lo, hi in HANGUL_RANGES)


def walk_strings(node, path="tool_input"):
    """tool_input을 재귀 순회하며 (경로, 문자열) 쌍을 낸다."""
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from walk_strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for idx, value in enumerate(node):
            yield from walk_strings(value, f"{path}[{idx}]")


def find_encoded_hangul(tool_input):
    """리터럴로 남아 있는 한글 이스케이프/엔티티를 찾는다."""
    hits = []
    for path, text in walk_strings(tool_input):
        for regex, base, label in (
            (ESCAPE_RE, 16, "유니코드 이스케이프"),
            (ENTITY_HEX_RE, 16, "HTML 16진 엔티티"),
            (ENTITY_DEC_RE, 10, "HTML 10진 엔티티"),
        ):
            for match in regex.finditer(text):
                try:
                    code = int(match.group(1), base)
                except ValueError:
                    continue
                if not in_hangul_range(code):
                    continue
                hits.append((path, match.group(0), chr(code), label))
                if len(hits) >= 8:
                    return hits
    return hits


def check_bash(command: str):
    """json.dump( 파일 쓰기에 ensure_ascii=False가 없으면 차단."""
    if "ensure_ascii=False" in command.replace(" ", ""):
        return None
    if re.search(r"\bjson\.dump\s*\(", command):
        return (
            "json.dump(...)에 ensure_ascii=False가 없다. 기본값은 한글을 전부 "
            "\\uXXXX로 바꿔 저장한다(.claude/rules/text-encoding-integrity.md §3). "
            "json.dump(obj, f, ensure_ascii=False)로 고쳐 다시 실행하라."
        )
    return None


def bash_warning(command: str):
    """json.dumps는 출력 확인용도 많아 차단하지 않고 주의만 남긴다."""
    if "ensure_ascii=False" in command.replace(" ", ""):
        return None
    if re.search(r"\bjson\.dumps\s*\(", command):
        return (
            "json.dumps(...)에 ensure_ascii=False가 없다. 결과를 파일이나 원장에 "
            "저장하는 용도라면 ensure_ascii=False를 붙여라. 화면 확인용이면 무시해도 된다."
        )
    return None


PROSE_SUFFIXES = (".md", ".mdx", ".txt", ".rst")


def is_prose_path(tool_input) -> bool:
    path = str(tool_input.get("file_path") or tool_input.get("notebook_path") or "")
    return path.lower().endswith(PROSE_SUFFIXES)


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                },
                "systemMessage": "한글 전사 무결성 훅이 도구 호출을 차단했습니다.",
            },
            ensure_ascii=False,
        )
    )
    sys.exit(0)


def inject(event: str, context: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": event,
                    "additionalContext": context,
                }
            },
            ensure_ascii=False,
        )
    )
    sys.exit(0)


def main() -> None:
    payload = json.load(sys.stdin)
    event = payload.get("hook_event_name") or "PreToolUse"
    tool_name = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}

    if event == "PostToolUse":
        if any(hint in tool_name for hint in MCP_WRITE_HINTS):
            inject("PostToolUse", VERIFY_REMINDER)
        sys.exit(0)

    if tool_name in ("Write", "Edit", "NotebookEdit") and is_prose_path(tool_input):
        # 산문 문서는 규칙 자체를 인용해야 한다. text-encoding-integrity.md 정본과
        # 보고서가 금지 표기를 예시로 담으므로 검사 대상에서 제외한다.
        # 이 면제가 안전한 이유: 마크다운에 이스케이프가 남으면 화면에 그대로 보이므로
        # 이 규칙이 막으려는 "조용히 다른 음절로 저장되는" 실패 양상이 성립하지 않는다.
        # JSON 원장 등 구조화 데이터는 계속 검사한다.
        sys.exit(0)

    if tool_name == "Bash":
        command = str(tool_input.get("command") or "")
        blocked = check_bash(command)
        if blocked:
            deny(blocked)
        warning = bash_warning(command)
        if warning:
            inject("PreToolUse", warning)
        sys.exit(0)

    hits = find_encoded_hangul(tool_input)
    if hits:
        lines = [
            f"  - {path}: {found} -> {decoded} ({label})"
            for path, found, decoded, label in hits
        ]
        deny(
            "인자에 한글을 이스케이프/엔티티로 옮겨 적은 흔적이 있다"
            "(.claude/rules/text-encoding-integrity.md §1).\n"
            + "\n".join(lines)
            + "\n\n해당 값을 리터럴 UTF-8 한글로 바꿔 다시 호출하라. "
            "이스케이프는 한 글자만 틀려도 유효한 다른 음절이 되어 오류로 드러나지 않는다. "
            "긴 페이로드는 눈으로 전사하지 말고 파일에 만든 뒤 스크립트로 직렬화하라."
        )

    if any(hint in tool_name for hint in MCP_WRITE_HINTS):
        inject("PreToolUse", LITERAL_REMINDER)

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # fail-open
        print(f"[korean-text-integrity] 훅 내부 오류로 검사를 건너뜀: {exc}", file=sys.stderr)
        sys.exit(0)
