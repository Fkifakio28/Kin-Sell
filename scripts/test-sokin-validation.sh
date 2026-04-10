#!/bin/bash
T="$1"
BASE="https://api.kin-sell.com"
H="Authorization: Bearer $T"

echo "===== TESTS SO-KIN VALIDATION ====="
echo ""

# Public endpoints
echo "--- PUBLIC ---"
echo -n "Feed public: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/posts?limit=2"
echo ""
echo -n "Trends: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/"
echo ""
echo -n "Profiles: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/profiles"
echo ""
echo -n "Global analytics: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/analytics/global"
echo ""
echo -n "Smart feed: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/smart/feed"
echo ""
echo -n "Hashtags: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/smart/hashtags"
echo ""
echo -n "Topics: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/smart/topics"
echo ""
echo -n "Formats: "; curl -s -o /dev/null -w "%{http_code}" "$BASE/sokin/trends/smart/formats"
echo ""

# Auth-only endpoints (user FREE)
echo ""
echo "--- AUTH (FREE user) ---"
echo -n "Access endpoint: "; curl -s -H "$H" "$BASE/sokin/trends/access" | head -c 200
echo ""
echo -n "Insights post: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/insights/post/cmnrrhnyz0007mpstl1iefgot"
echo ""
echo -n "Insights my: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/insights/my"
echo ""
echo -n "Smart ideas: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/smart/ideas"
echo ""
echo -n "Smart suggestions: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/smart/suggestions"
echo ""
echo -n "Tracking stats: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/tracking/stats"
echo ""
echo -n "Scoring top: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/scoring/top?type=boost"
echo ""

# Premium-gated (should be 403 for FREE)
echo ""
echo "--- PREMIUM GATING (expect 403) ---"
echo -n "Analytics post: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/analytics/post/cmnrrhnyz0007mpstl1iefgot"
echo ""
echo -n "Analytics my: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/analytics/my"
echo ""
echo -n "Scoring post: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/scoring/post/cmnrrhnyz0007mpstl1iefgot"
echo ""
echo -n "Scoring recalculate: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/scoring/recalculate/cmnrrhnyz0007mpstl1iefgot"
echo ""
echo -n "Smart boost: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/trends/smart/boost"
echo ""

# Admin-gated (should be 403 for FREE)
echo ""
echo "--- ADMIN GATING (expect 403) ---"
echo -n "Scoring batch: "; curl -s -o /dev/null -w "%{http_code}" -H "$H" "$BASE/sokin/scoring/batch"
echo ""

# Upsell body test
echo ""
echo "--- UPSELL BODY ---"
echo "Analytics blocked body:"
curl -s -H "$H" "$BASE/sokin/trends/analytics/post/cmnrrhnyz0007mpstl1iefgot" | head -c 300
echo ""

echo ""
echo "===== DONE ====="
