#!/usr/bin/env bash
set -euo pipefail

# Smoke test for VibeCoding v2
# Requires: server running on localhost:8420

BASE_URL="${BASE_URL:-http://localhost:8420}"
TOKEN="${TOKEN:-change-me-to-a-secret-token}"
AUTH="Authorization: Bearer $TOKEN"

PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== VibeCoding v2 Smoke Test ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Health check
echo -n "Health check... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "GET /health" "200" "$STATUS"

# 2. Auth rejection — request without token should be 401
echo -n "Auth rejection... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/repos")
check "GET /api/repos (no auth)" "401" "$STATUS"

# 3. List repos
echo -n "List repos... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$BASE_URL/api/repos")
check "GET /api/repos" "200" "$STATUS"

# 4. Create repo
echo -n "Create repo... "
REPO=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"path":"/tmp/smoke-test","name":"smoke-test"}' \
  "$BASE_URL/api/repos")
REPO_STATUS=$(echo "$REPO" | tail -1)
REPO_BODY=$(echo "$REPO" | sed '$d')
REPO_ID=$(echo "$REPO_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
check "POST /api/repos" "201" "$REPO_STATUS"

if [ -z "$REPO_ID" ]; then
  echo "  SKIP  remaining tests — could not create repo"
  exit 1
fi

# 5. Create task
echo -n "Create task... "
TASK=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"prompt":"Hello world smoke test","thinkingEnabled":false}' \
  "$BASE_URL/api/repos/$REPO_ID/tasks")
TASK_STATUS=$(echo "$TASK" | tail -1)
TASK_BODY=$(echo "$TASK" | sed '$d')
TASK_ID=$(echo "$TASK_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
check "POST /api/repos/:repoId/tasks" "201" "$TASK_STATUS"

# 6. List tasks
echo -n "List tasks... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$BASE_URL/api/repos/$REPO_ID/tasks")
check "GET /api/repos/:repoId/tasks" "200" "$STATUS"

# 7. Get task detail
echo -n "Get task detail... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$BASE_URL/api/tasks/$TASK_ID")
check "GET /api/tasks/:id" "200" "$STATUS"

# 8. Cancel task
echo -n "Cancel task... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH" "$BASE_URL/api/tasks/$TASK_ID/cancel")
check "POST /api/tasks/:id/cancel" "200" "$STATUS"

# 9. Delete task (should work after cancel puts it in CANCELLED state)
echo -n "Delete task... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$BASE_URL/api/tasks/$TASK_ID")
check "DELETE /api/tasks/:id" "204" "$STATUS"

# 10. Delete repo
echo -n "Delete repo... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$BASE_URL/api/repos/$REPO_ID")
check "DELETE /api/repos/:id" "204" "$STATUS"

# 11. Frontend serving (only if built)
echo -n "Frontend serving... "
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$FRONTEND" = "200" ]; then
  check "GET / (frontend)" "200" "$FRONTEND"
else
  echo "  SKIP  frontend not built"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
