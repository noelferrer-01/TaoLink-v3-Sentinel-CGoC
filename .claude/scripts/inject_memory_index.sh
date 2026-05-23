#!/usr/bin/env bash
# Inject memory/memory.md into the Claude Code session as additional context.
# Triggered by the SessionStart hook in .claude/settings.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INDEX="$PROJECT_ROOT/memory/memory.md"

# If no index, exit silently — don't fail the session start.
[ -f "$INDEX" ] || exit 0

# Emit the SessionStart hook JSON output with memory.md as additionalContext.
# Use python3 for JSON escaping (built into macOS).
python3 - <<'PY' "$INDEX"
import json, sys, pathlib
path = pathlib.Path(sys.argv[1])
content = path.read_text(encoding="utf-8")
header = (
    "# Sentinel project memory index (auto-injected by SessionStart hook)\n"
    "# Source: memory/memory.md — follow links into domain files when relevant.\n\n"
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": header + content,
    }
}))
PY
