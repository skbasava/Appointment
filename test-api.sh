#!/bin/bash
# Real API Testing Script for Appoint
# Usage: ./test-api.sh [BASE_URL]

BASE_URL="${1:-http://localhost:8788}"
TELEGRAM_USER_ID="123456789"
FIREBASE_TOKEN="test-firebase-token"

echo "=========================================="
echo "Testing Appoint API at: $BASE_URL"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${YELLOW}ℹ${NC}: $1"; }

# Test 1: Health Check
echo ""
echo "--- Test 1: Health Check ---"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Health check returned 200"
    info "Response: $BODY"
else
    fail "Health check returned $HTTP_CODE"
fi

# Test 2: Get Available Slots (without auth - should fail)
echo ""
echo "--- Test 2: Available Slots (no auth) ---"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/providers/test/available-slots?date=2026-03-25&service_id=test")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "401" ]; then
    pass "Correctly rejected unauthenticated request"
else
    fail "Expected 401, got $HTTP_CODE"
fi

# Test 3: Get Available Slots (with auth)
echo ""
echo "--- Test 3: Available Slots (with Telegram auth) ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "X-Telegram-User-Id: $TELEGRAM_USER_ID" "$BASE_URL/api/providers/test/available-slots?date=2026-03-25&service_id=test")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
    pass "Request processed (HTTP $HTTP_CODE)"
    info "Response: $BODY"
else
    fail "Unexpected response: $HTTP_CODE"
fi

# Test 4: Create Appointment (with auth)
echo ""
echo "--- Test 4: Create Appointment ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/appointments" \
    -H "Content-Type: application/json" \
    -H "X-Telegram-User-Id: $TELEGRAM_USER_ID" \
    -H "X-Telegram-Username: TestUser" \
    -d '{
        "provider_id": "test-provider",
        "service_id": "test-service",
        "customer_name": "Test User",
        "start_time": 1742956800
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "409" ]; then
    pass "Create appointment endpoint responded (HTTP $HTTP_CODE)"
    info "Response: $BODY"
else
    info "Response: $HTTP_CODE - $BODY"
fi

# Test 5: List Customer Appointments
echo ""
echo "--- Test 5: List Customer Appointments ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "X-Telegram-User-Id: $TELEGRAM_USER_ID" "$BASE_URL/api/appointments")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Listed appointments successfully"
    info "Response: $BODY"
else
    fail "Unexpected response: $HTTP_CODE"
fi

# Test 6: Register Provider (Firebase auth)
echo ""
echo "--- Test 6: Register Provider ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/providers/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $FIREBASE_TOKEN" \
    -d '{
        "type": "doctor",
        "name": "Dr. Test",
        "email": "test@example.com",
        "timezone": "UTC"
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
info "Provider registration returned: $HTTP_CODE"
info "Response: $BODY"

# Test 7: Telegram Webhook
echo ""
echo "--- Test 7: Telegram Webhook (/start command) ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/telegram/webhook" \
    -H "Content-Type: application/json" \
    -d '{
        "update_id": 1,
        "message": {
            "message_id": 1,
            "from": {"id": 12345, "first_name": "Test"},
            "chat": {"id": 12345, "type": "private"},
            "text": "/start"
        }
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Telegram webhook accepted /start command"
else
    fail "Unexpected response: $HTTP_CODE"
fi

# Test 8: Telegram Webhook (/help command)
echo ""
echo "--- Test 8: Telegram Webhook (/help command) ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/telegram/webhook" \
    -H "Content-Type: application/json" \
    -d '{
        "update_id": 2,
        "message": {
            "message_id": 2,
            "from": {"id": 12345, "first_name": "Test"},
            "chat": {"id": 12345, "type": "private"},
            "text": "/help"
        }
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    pass "Telegram webhook accepted /help command"
else
    fail "Unexpected response: $HTTP_CODE"
fi

# Test 9: Calendar Status
echo ""
echo "--- Test 9: Calendar Status ---"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $FIREBASE_TOKEN" "$BASE_URL/api/providers/test/calendar/status")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
info "Calendar status returned: $HTTP_CODE"

# Test 10: Invalid Endpoint
echo ""
echo "--- Test 10: 404 Handling ---"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/nonexistent")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "404" ]; then
    pass "404 handled correctly"
else
    info "Got $HTTP_CODE for invalid endpoint"
fi

echo ""
echo "=========================================="
echo "Testing Complete!"
echo "=========================================="
echo ""
echo "To test with real Firebase token:"
echo "  1. Login to your app using Firebase Auth"
echo "  2. Get the ID token from browser console"
echo "  3. Run: FIREBASE_TOKEN='your-token' ./test-api.sh"
echo ""
echo "To test deployed version:"
echo "  ./test-api.sh https://your-worker.workers.dev"
