#!/bin/bash
# Capybara Session Tracker Hook
set -euo pipefail

# Configuration
HOOKS_DIR="$HOME/CapyWorkspace/.claude/hooks"
SESSION_DATA_FILE="$HOOKS_DIR/session-data.json"
HOOKS_LOG_FILE="$HOOKS_DIR/hooks.log"
STDIN_DUMP_FILE="$HOOKS_DIR/stdin-dump.log"
LOCK_DIR="$HOOKS_DIR/.session-data.lock"

# --------- utils ----------
now_ts() { date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"; }

ensure_dirs() {
  mkdir -p "$HOOKS_DIR"
  touch "$HOOKS_LOG_FILE" "$STDIN_DUMP_FILE"
}

log_event() {
  local event_type="$1"
  local message="$2"
  local timestamp
  timestamp="$(now_ts)"
  # tee may fail due to permissions/path issues; ensure directory exists before writing
  echo "[$timestamp] Capybara Hook: $event_type - $message" | tee -a "$HOOKS_LOG_FILE" >/dev/null || true
}

# A small, portable lock using mkdir (works on macOS without flock)
with_lock() {
  local tries=80
  local i=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
	i=$((i+1))
	if [[ $i -ge $tries ]]; then
	  log_event "lock" "Failed to acquire lock after ${tries} tries"
	  return 1
	fi
	# 20ms
	perl -e 'select(undef,undef,undef,0.02);'
  done

  # ensure lock release
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
  "$@"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  trap - EXIT
}

init_session_data() {
  if [[ ! -f "$SESSION_DATA_FILE" ]] || [[ ! -s "$SESSION_DATA_FILE" ]]; then
	cat > "$SESSION_DATA_FILE" <<'EOF'
{
  "sessions": {},
  "lastUpdated": null
}
EOF
	log_event "init" "Created/initialized session data file"
	return
  fi
}

# Read stdin once
read_stdin() {
  local data=""
  if [[ -t 0 ]]; then
	echo ""
	return
  fi
  data="$(cat || true)"
  echo "$data"
}

# Extract fields from stdin JSON (preferred) with fallback to env
extract_field() {
  local json="$1"
  local jq_expr="$2"
  local fallback="$3"
  local val=""

  if [[ -n "${json:-}" ]]; then
	val="$(echo "$json" | jq -r "$jq_expr // empty" 2>/dev/null || true)"
  fi
  if [[ -z "${val:-}" || "${val:-}" == "null" ]]; then
	val="$fallback"
  fi
  echo "$val"
}

get_session_id_fallback() {
  echo "${CLAUDE_CODE_SESSION_ID:-${CLAUDE_CODE_SSE_PORT:-default}}"
}

# TodoWrite injection logic removed - now injecting guidance for all prompts

# Output TodoWrite injection via JSON to stdout (hook mechanism)
output_todowrite_injection() {
  local additional_context
  additional_context="Consider using the TodoWrite tool to organize complex tasks. Use TodoWrite when:
- The request involves multiple steps or components
- Implementation requires planning and coordination
- The task has dependencies or potential risks
- You need to track progress systematically

For simple questions, direct answers, or single-step tasks, you can skip TodoWrite and respond directly. Use your judgment to determine if the request would benefit from structured planning."

  # Output via hookSpecificOutput mechanism
  jq -n \
	--arg context "$additional_context" \
	'{
	  hookSpecificOutput: {
		hookEventName: "UserPromptSubmit",
		additionalContext: $context
	  }
	}'
}

# Update global todos file with todos from current session
update_global_todos() {
  local session_id="$1"
  local todos_json="$2"
  local global_todos_file="$HOOKS_DIR/global-todos.json"
  local temp_file="$(mktemp)"

  # Get session title for context
  local session_title
  session_title="$(jq -r ".sessions[\"$session_id\"].firstPrompt.content // \"Session ${session_id:0:8}\"" "$SESSION_DATA_FILE" 2>/dev/null || echo "Session ${session_id:0:8}")"

  log_event "debug" "update_global_todos: session_id=$session_id, session_title=$session_title"
  log_event "debug" "update_global_todos: todos_json length=${#todos_json}"

  # Initialize global todos file if it doesn't exist
  if [[ ! -f "$global_todos_file" ]]; then
	cat > "$global_todos_file" <<'EOF'
{
  "globalTodos": [],
  "lastUpdated": null
}
EOF
	log_event "global-todos" "Initialized global todos file"
  fi

  # Simplified update approach: directly construct the new global todos
  local current_timestamp
  current_timestamp="$(now_ts)"

  # Create new global todos for this session
  local session_global_todos
  session_global_todos="$(printf '%s' "$todos_json" | jq \
	--arg session_id "$session_id" \
	--arg session_title "$session_title" \
	--arg timestamp "$current_timestamp" '
	map({
	  id: ($session_id + "-" + ($timestamp | gsub("[^0-9]"; "")) + "-" + (tostring | length | tostring)),
	  sessionId: $session_id,
	  sessionTitle: $session_title,
	  content: .content,
	  status: .status,
	  activeForm: .activeForm,
	  timestamp: .timestamp
	})
  ' 2>/dev/null)"

  if [[ $? -ne 0 ]] || [[ -z "$session_global_todos" ]]; then
	log_event "error" "Failed to transform session todos to global format"
	return 1
  fi

  log_event "debug" "update_global_todos: transformed session todos: ${session_global_todos:0:100}..."

  # Read existing global todos and filter out this session's old todos
  local existing_todos
  existing_todos="$(jq --arg session_id "$session_id" '.globalTodos // [] | map(select(.sessionId != $session_id))' "$global_todos_file" 2>/dev/null || echo '[]')"

  if [[ -z "$existing_todos" ]]; then
	existing_todos="[]"
	log_event "warn" "Failed to read existing global todos, using empty array"
  fi

  # Combine existing todos (excluding this session) with new session todos
  jq -n \
	 --argjson existing "$existing_todos" \
	 --argjson session_todos "$session_global_todos" \
	 --arg timestamp "$current_timestamp" \
	 '{
	   globalTodos: ($existing + $session_todos),
	   lastUpdated: $timestamp
	 }' > "$temp_file"

  # Atomic update with validation
  if [[ -s "$temp_file" ]] && jq -e '.' "$temp_file" >/dev/null 2>&1; then
	mv "$temp_file" "$global_todos_file"
	local todo_count
	todo_count="$(printf '%s' "$todos_json" | jq 'length' 2>/dev/null || echo 0)"
	log_event "global-todos" "Updated global todos for session $session_id: $todo_count todos"
  else
	rm -f "$temp_file"
	log_event "error" "Failed to update global todos for session $session_id - temp file validation failed"
	# Debug: show temp file content if it exists
	if [[ -f "$temp_file" ]]; then
	  log_event "debug" "Temp file content (first 200 chars): $(head -c 200 "$temp_file" 2>/dev/null || echo 'failed to read')"
	fi
  fi
}

# Safely build argjson; if invalid, return {}.
safe_argjson() {
  local maybe_json="$1"
  if [[ -z "${maybe_json:-}" ]]; then
	echo "{}"
	return
  fi
  if echo "$maybe_json" | jq -e '.' >/dev/null 2>&1; then
	echo "$maybe_json"
  else
	echo "{}"
  fi
}

# --------- data update ----------
update_session_data() {
  local session_id="$1"
  local action="$2"
  local timestamp="$3"
  local tool_name="${4:-}"
  local tool_id="${5:-}"
  local parameters_json="${6:-{}}"
  local output_json="${7:-{}}"
  local status="${8:-completed}"

  init_session_data

  local temp_file
  temp_file="$(mktemp)"

  case "$action" in
	"ensure_session")
	  jq --arg sid "$session_id" --arg ts "$timestamp" '
		.sessions[$sid] = (.sessions[$sid] // {
		  "id": $sid,
		  "startedAt": $ts,
		  "lastActivity": $ts,
		  "todos": [],
		  "tools": [],
		  "currentTool": null,
		  "status": "active"
		}) |
		.sessions[$sid].lastActivity = $ts |
		.sessions[$sid].status = (.sessions[$sid].status // "active") |
		.lastUpdated = $ts
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	"create_session")
	  # Don't overwrite existing startedAt (avoid resetting on every UserPromptSubmit)
	  jq --arg sid "$session_id" --arg ts "$timestamp" '
		.sessions[$sid] = (.sessions[$sid] // {
		  "id": $sid,
		  "startedAt": $ts,
		  "lastActivity": $ts,
		  "todos": [],
		  "tools": [],
		  "currentTool": null,
		  "status": "active"
		}) |
		.sessions[$sid].lastActivity = $ts |
		.sessions[$sid].status = "active" |
		.lastUpdated = $ts
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	"set_first_prompt")
	  # Set firstPrompt (only if not already set)
	  jq --arg sid "$session_id" --arg ts "$timestamp" --arg prompt "$tool_name" '
		.sessions[$sid] = (.sessions[$sid] // {
		  "id": $sid,
		  "startedAt": $ts,
		  "lastActivity": $ts,
		  "todos": [],
		  "tools": [],
		  "currentTool": null,
		  "status": "active"
		}) |
		.sessions[$sid].lastActivity = $ts |
		(.sessions[$sid].firstPrompt // {}) as $current_prompt |
		if $current_prompt == {} then
		  .sessions[$sid].firstPrompt = {
			"content": $prompt,
			"timestamp": $ts
		  }
		else .
		end |
		.lastUpdated = $ts
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	"add_todos")
	  # Check if we have JSON data from environment variable (preferred) or parameter
	  local todos_json
	  if [[ -n "${TEMP_TODOS_JSON:-}" ]]; then
		todos_json="$TEMP_TODOS_JSON"
		log_event "debug" "add_todos: Using JSON from env var, length=${#todos_json}"
	  else
		todos_json="$parameters_json"
		log_event "debug" "add_todos: Using JSON from parameter, length=${#todos_json}"
	  fi

	  log_event "debug" "add_todos: session_id=$session_id"
	  log_event "debug" "add_todos: todos_json first 200 chars: ${todos_json:0:200}"
	  log_event "debug" "add_todos: todos_json last 50 chars: ${todos_json: -50}"

	  # Test JSON validity before proceeding
	  local json_test_result
	  json_test_result="$(printf '%s' "$todos_json" | jq -e 'type=="array"' 2>&1 || echo "VALIDATION_FAILED")"
	  log_event "debug" "add_todos: JSON validation result: $json_test_result"

	  if [[ "$json_test_result" == "true" ]]; then
		# JSON is valid, proceed with update
		jq --arg sid "$session_id" \
		  --arg ts "$timestamp" \
		  --argjson todos "$todos_json" '
		  .sessions[$sid] = (.sessions[$sid] // {
			"id": $sid,
			"startedAt": $ts,
			"lastActivity": $ts,
			"todos": [],
			"tools": [],
			"currentTool": null,
			"status": "active"
		  }) |
		  # Overwrite todos (TodoWrite usually provides full state)
		  .sessions[$sid].todos = ($todos // []) |
		  .sessions[$sid].lastActivity = $ts |
		  .lastUpdated = $ts
		' "$SESSION_DATA_FILE" > "$temp_file"

		local jq_rc=$?
		log_event "debug" "add_todos jq_rc=$jq_rc temp_size=$(wc -c < "$temp_file" 2>/dev/null || echo 0)"
	  else
		log_event "error" "add_todos: JSON validation failed, preserving original file"
		cp "$SESSION_DATA_FILE" "$temp_file"
	  fi

	  # Clean up environment variable
	  unset TEMP_TODOS_JSON
	  ;;

	"start_tool")
	  jq --arg sid "$session_id" \
		--arg ts "$timestamp" \
		--arg tname "$tool_name" \
		--arg tid "$tool_id" \
		--arg params "$parameters_json" '
	  .sessions[$sid] = (.sessions[$sid] // {
		  "id": $sid,
		  "startedAt": $ts,
		  "lastActivity": $ts,
		  "todos": [],
		  "tools": [],
		  "currentTool": null,
		  "status": "active"
	  }) |
	  .sessions[$sid].currentTool = {
		  "id": $tid,
		  "name": $tname,
		  "startTime": $ts,
		  "endTime": null,
		  "status": "running",
		  "parameters": (($params | fromjson?) // {})
	  } |
	  .sessions[$sid].tools += [ .sessions[$sid].currentTool ] |
	  .sessions[$sid].lastActivity = $ts |
	  .lastUpdated = $ts
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	"end_tool")
	  jq --arg sid "$session_id" \
		--arg ts "$timestamp" \
		--arg tid "$tool_id" \
		--arg st "$status" \
		--arg out "$output_json" '
		def OUT: (($out | fromjson?) // {});
		def finishTool(t):
		  t | .endTime = $ts
			| .status = $st
			| .result = OUT;

		if (.sessions[$sid] // null) == null then
		  .
		else
		  .sessions[$sid].tools =
			(
			  (.sessions[$sid].tools // [])
			  | (if length == 0 then . else
				  ( . as $arr
					| ( [range(0; length)] | reverse
						| map(select(($arr[.]?.id == $tid) or ($arr[.]?.status == "running")))
						| .[0] // null
					  ) as $idx
					| if $idx == null then $arr
					  else
						($arr[$idx] | finishTool(.)) as $finished
						| ($arr | .[$idx] = $finished)
					  end
				  )
				end)
			)
		  |
		  (if .sessions[$sid].currentTool != null then
			  .sessions[$sid].currentTool = null
		  else . end)
		  |
		  .sessions[$sid].lastActivity = $ts
		  |
		  .lastUpdated = $ts
		end
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	"update_status")
	  # Update session status: tool_name parameter stores the new status value
	  jq --arg sid "$session_id" --arg ts "$timestamp" --arg new_status "$tool_name" '
		if (.sessions[$sid] // null) == null then
		  .
		else
		  .sessions[$sid].status = $new_status |
		  .sessions[$sid].lastActivity = $ts |
		  .lastUpdated = $ts
		end
	  ' "$SESSION_DATA_FILE" > "$temp_file"
	  ;;

	*)
	  # no-op
	  cp "$SESSION_DATA_FILE" "$temp_file"
	  ;;
  esac

	# 1) temp_file must not be empty
	if [[ ! -s "$temp_file" ]]; then
	log_event "error" "temp_file empty! action=$action; refusing to overwrite session-data.json"
	rm -f "$temp_file"
	return 0
	fi

	# 2) temp_file must be valid JSON
	if ! jq -e '.' "$temp_file" >/dev/null 2>&1; then
	log_event "error" "temp_file invalid JSON! action=$action; refusing to overwrite session-data.json"
	rm -f "$temp_file"
	return 0
	fi

  mv "$temp_file" "$SESSION_DATA_FILE"
  log_event "data-updated" "Session $session_id action=$action"
}

# --------- main ----------
main() {
  ensure_dirs

  local stdin_data
  stdin_data="$(read_stdin)"

  # dump payload for debugging (truncate to avoid huge files)
  if [[ -n "${stdin_data:-}" ]]; then
	echo "----- $(now_ts) -----" >> "$STDIN_DUMP_FILE"
	echo "${stdin_data:0:8192}" >> "$STDIN_DUMP_FILE"
	echo >> "$STDIN_DUMP_FILE"
	log_event "stdin" "Received payload (first 200 chars): ${stdin_data:0:200}"
  else
	log_event "stdin" "No stdin payload"
  fi

  # Prefer stdin JSON fields
  local hook_type tool_name session_id
  hook_type="$(extract_field "$stdin_data" '.hook_event_name' "${CLAUDE_CODE_HOOK_TYPE:-${CLAUDE_HOOK_TYPE:-${HOOK_TYPE:-unknown}}}")"
  tool_name="$(extract_field "$stdin_data" '.tool_name' "${CLAUDE_TOOL_NAME:-${CLAUDE_CODE_TOOL_NAME:-${TOOL_NAME:-Unknown}}}")"
  session_id="$(extract_field "$stdin_data" '.session_id' "$(get_session_id_fallback)")"

  # Extract tool_input / tool_output-like fields if present
  local tool_input_raw tool_output_raw
  tool_input_raw="$(extract_field "$stdin_data" '.tool_input' "")"
  tool_output_raw="$(extract_field "$stdin_data" '.tool_output' "")"
  # Some payloads may use different names; try a couple common fallbacks
  if [[ -z "${tool_output_raw:-}" ]]; then
	tool_output_raw="$(extract_field "$stdin_data" '.tool_result' "")"
  fi
  if [[ -z "${tool_output_raw:-}" ]]; then
	tool_output_raw="$(extract_field "$stdin_data" '.error' "")"
  fi

  local ts
  ts="$(now_ts)"

  log_event "hook-triggered" "hook_type=$hook_type tool_name=$tool_name session_id=$session_id"

  # tool id: stable enough for linking start/end
  local tool_id
  tool_id="tool-$(echo "$ts" | tr -cd '0-9')"

  # Update data under lock to avoid concurrent overwrite
  with_lock bash -c '
	set -euo pipefail

	exec 2>>"$HOOKS_LOG_FILE"
	trap 'echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Capybara Hook: ERROR line=$LINENO cmd=$BASH_COMMAND exit=$?" >> "$HOOKS_LOG_FILE"' ERR

	# load vars from parent via env
	: "${SESSION_DATA_FILE:?}"
	: "${session_id:?}"
	: "${hook_type:?}"
	: "${tool_name:?}"
	: "${tool_id:?}"
	: "${ts:?}"
	: "${tool_input_json:?}"
	: "${tool_output_json:?}"

	# functions are not available inside bash -c; call outer script helpers via exported? (we avoid that)
  ' 2>/dev/null || true

  # so we lock by running a subfunction: call update_session_data directly within with_lock.
  # (This is a bash nuance; easiest is lock wrapper around the update calls below.)
  # with_lock _do_updates "$hook_type" "$session_id" "$tool_name" "$tool_id" "$ts" "$tool_input_raw" "$tool_output_raw" "$stdin_data"

  if ! with_lock _do_updates "$hook_type" "$session_id" "$tool_name" "$tool_id" "$ts" "$tool_input_raw" "$tool_output_raw" "$stdin_data"; then
	log_event "hook-error" "with_lock/_do_updates failed, but continuing"
  fi

  log_event "hook-completed" "Completed hook_type=$hook_type"

  exit 0
}

_do_updates() {
  local hook_type="$1"
  local session_id="$2"
  local tool_name="$3"
  local tool_id="$4"
  local ts="$5"
  local tool_input_raw="$6"
  local tool_output_raw="$7"
  local stdin_data="$8"

  # Prepare argjson for jq
  local tool_input_json tool_output_json
  tool_input_json="$(safe_argjson "$tool_input_raw")"
  tool_output_json="$(safe_argjson "$tool_output_raw")"

  # Ensure session exists for any event
  update_session_data "$session_id" "ensure_session" "$ts"

  case "$hook_type" in
	"UserPromptSubmit")
	  update_session_data "$session_id" "create_session" "$ts"
	  # UserPromptSubmit also ensures status is active (user is actively interacting)
	  update_session_data "$session_id" "update_status" "$ts" "active"

	  # Extract prompt field directly from stdin data
	  local user_prompt
	  user_prompt="$(extract_field "$stdin_data" '.prompt' "")"

	  if [[ -n "$user_prompt" ]]; then
		# Always inject TodoWrite guidance for all user prompts
		log_event "todowrite-injection" "Injecting TodoWrite guidance for session $session_id"
		output_todowrite_injection

		# Truncate overly long prompts (limit to 200 characters)
		if [[ ${#user_prompt} -le 200 ]]; then
		  log_event "extract-prompt" "Extracted first prompt (${#user_prompt} chars): ${user_prompt:0:100}..."
		  update_session_data "$session_id" "set_first_prompt" "$ts" "$user_prompt"
		else
		  local truncated_prompt="${user_prompt:0:500}"
		  log_event "extract-prompt" "Extracted and truncated first prompt (200 chars): ${truncated_prompt:0:100}..."
		  update_session_data "$session_id" "set_first_prompt" "$ts" "$truncated_prompt"
		fi

		exit 0  # Exit after outputting injection to prevent further processing
	  else
		log_event "extract-prompt" "No prompt field found in UserPromptSubmit stdin data"
	  fi
	  ;;

	"Stop")
	  # Stop sets status to completed
	  update_session_data "$session_id" "update_status" "$ts" "completed"
	  log_event "session-status" "Session $session_id ended, status set to completed"
	  ;;
	"PreToolUse")
	  update_session_data "$session_id" "start_tool" "$ts" "$tool_name" "$tool_id" "$tool_input_json"
	  # Session should be active when tool starts executing
	  update_session_data "$session_id" "update_status" "$ts" "active"
	  ;;
	"PostToolUse")
	  # status: try detect error-ish
	  local status="completed"
	  if [[ -n "${tool_output_raw:-}" ]] && echo "$tool_output_raw" | jq -e 'type=="object" and (.error? != null or .failed? == true)' >/dev/null 2>&1; then
		status="failed"
	  fi
	  update_session_data "$session_id" "end_tool" "$ts" "$tool_name" "$tool_id" "{}" "$tool_output_json" "$status"
	  ;;
	*)
	  log_event "unknown-hook" "Unhandled hook type: $hook_type"
	  ;;
  esac

  # TodoWrite: sync full todos list to session
  if [[ "$tool_name" == "TodoWrite" && -n "${stdin_data:-}" ]]; then
	log_event "debug" "TodoWrite detected, processing stdin_data"

	local todos_arr
	todos_arr="$(
	  printf '%s' "$stdin_data" | jq -c --arg ts "$ts" '
		# Try multiple paths to get todos data
		(
		  .tool_input.todos //
		  .tool_response.newTodos //
		  .todos //
		  []
		)
		| if type == "array" then
			map({
			  content: (.content // ""),
			  status: (.status // "pending"),
			  activeForm: (.activeForm // .content // ""),
			  timestamp: $ts
			})
		  else
			[]
		  end
	  ' 2>/dev/null || echo '[]'
	)"

	log_event "debug" "todos extraction result: $todos_arr"

	# Strict validation: must be array, otherwise set to empty
	if ! printf '%s' "$todos_arr" | jq -e 'type=="array"' >/dev/null 2>&1; then
	  log_event "error" "todos_arr is not array, fallback to []"
	  log_event "debug" "Invalid todos_arr content: ${todos_arr:0:200}..."
	  todos_arr='[]'
	fi

	local todos_count
	todos_count="$(printf '%s' "$todos_arr" | jq 'length' 2>/dev/null || echo 0)"
	log_event "debug" "todos_arr_len=$todos_count, calling update_session_data"

	# Ensure we're passing a valid JSON array
	if [[ "$todos_count" -gt 0 || "$todos_arr" == "[]" ]]; then
	  # Pass directly to add_todos, not via function parameters (avoid bash JSON handling issues)
	  log_event "debug" "Calling update_session_data with todos via env var"

	  # Use environment variable to pass JSON, avoiding parameter passing issues
	  TEMP_TODOS_JSON="$todos_arr" update_session_data "$session_id" "add_todos" "$ts" "TodoWrite" ""
	  log_event "debug" "update_session_data add_todos completed"

	  # Update global todos with the same data
	  update_global_todos "$session_id" "$todos_arr"
	else
	  log_event "error" "Invalid todos_arr, skipping update"
	fi
  fi
}

# Ensure helper is callable under with_lock
export -f log_event now_ts ensure_dirs init_session_data safe_argjson extract_field update_session_data _do_updates read_stdin output_todowrite_injection update_global_todos

# Run
main "$@"
