#!/usr/bin/env bash
# 템플릿 마크다운을 node-app 실제 validator/renderer로 검증하고 MCP 등록 payload를 다시 만든다.
# 사용: bash run.sh   (저장소 루트 기준 경로를 자동 계산)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../../../.." && pwd)"
WORK="$(mktemp -d)"
mkdir -p "$WORK/lab"
for f in imagePrompt promptTemplateUtils referenceStrength contentPrompt; do
  sed -E 's#from "\./([A-Za-z]+)"#from "./\1.ts"#' "$ROOT/node-app/src/utils/lab/$f.ts" > "$WORK/lab/$f.ts"
done
cp "$HERE/validate-and-build.ts" "$WORK/"
node --experimental-strip-types --no-warnings "$WORK/validate-and-build.ts" \
  "$ROOT/.agent/content/ai-prompts/content_templates/new" "$HERE/../payloads"
rm -f "$HERE/../payloads/"*.rendered-default.txt
rm -rf "$WORK"
