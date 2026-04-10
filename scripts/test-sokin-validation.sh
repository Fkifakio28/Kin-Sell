#!/bin/bash
T="$1"
BASE="https://api.kin-sell.com"
H="Authorization: Bearer $T"

MY_POST=$(curl -s -H "$H" "$BASE/sokin/posts/mine?status=ACTIVE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
ANY_POST=$(curl -s "$BASE/sokin/posts?limit=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "MY_POST=$MY_POST"
echo "ANY_POST=$ANY_POST"
echo ""

echo "===== TESTS SO-KIN VALIDATION ====="
echo ""

echo "--- PUBLIC (expect 200) ---"
for EP in \
  "Feed:$BASE/sokin/posts?limit=2" \
  "Post detail:$BASE/sokin/posts/$ANY_POST" \
  "Comments:$BASE/sokin/posts/$ANY_POST/comments" \
  "Trends:$BASE/sokin/trends/" \
  "Profiles:$BASE/sokin/trends/profiles" \
  "Global analytics:$BASE/sokin/trends/analytics/global" \
  "Smart feed:$BASE/sokin/trends/smart/feed" \
  "Hashtags:$BASE/sokin/trends/smart/hashtags" \
  "Topics:$BASE/sokin/trends/smart/topics" \
  "Formats:$BASE/sokin/trends/smart/formats"
do
  NAME="${EP%%:*}"
  URL="${EP#*:}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "$NAME: $CODE"
done

echo ""
echo "--- AUTH ENDPOINTS ---"
echo -n "Access: "; curl -s -H "$H" "$BASE/sokin/trends/access" | head -c 250
echo ""
for EP in \
  "My posts:$BASE/sokin/posts/mine" \
  "My counts:$BASE/sokin/posts/counts" \
  "Tracking stats:$BASE/sokin/tracking/stats" \
  "Post insight:$BASE/sokin/trends/post-insight/$MY_POST" \
  "Insights my:$BASE/sokin/trends/insights/my" \
  "Smart ideas:$BASE/sokin/trends/smart/ideas" \
  "Smart suggestions:$BASE/sokin/trends/smart/suggestions" \
  "Scoring top:$BASE/sokin/scoring/top?type=boost"
do
  NAME="${EP%%:*}"
  URL="${EP#*:}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$URL")
  echo "$NAME: $CODE"
done

echo ""
echo "--- PREMIUM ANALYTICS ---"
for EP in \
  "Analytics post:$BASE/sokin/trends/analytics/post/$MY_POST" \
  "Analytics my:$BASE/sokin/trends/analytics/my" \
  "Scoring post:$BASE/sokin/scoring/post/$MY_POST" \
  "Insights post:$BASE/sokin/trends/insights/post/$MY_POST"
do
  NAME="${EP%%:*}"
  URL="${EP#*:}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$URL")
  echo "$NAME: $CODE"
done

echo ""
echo "--- PREMIUM ADS ---"
for EP in \
  "Smart boost:$BASE/sokin/trends/smart/boost" \
  "Advisor tips:$BASE/sokin/advisor/tips"
do
  NAME="${EP%%:*}"
  URL="${EP#*:}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$URL")
  echo "$NAME: $CODE"
done

echo ""
echo "--- ADMIN ---"
for EP in \
  "Scoring batch:$BASE/sokin/scoring/batch" \
  "Advisor opportunities:$BASE/sokin/advisor/opportunities" \
  "Advisor batch:$BASE/sokin/advisor/batch"
do
  NAME="${EP%%:*}"
  URL="${EP#*:}"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$URL")
  echo "$NAME: $CODE"
done

echo ""
echo "--- TRACKING ---"
if [ -n "$MY_POST" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$H" -H "Content-Type: application/json" \
    -d "[{\"event\":\"VIEW\",\"postId\":\"$MY_POST\",\"authorId\":\"test\"}]" "$BASE/sokin/track")
  echo "Track view: $CODE"
fi

echo ""
echo "--- CONTENT SAMPLES ---"
if [ -n "$MY_POST" ]; then
  echo "Score:"
  curl -s -H "$H" "$BASE/sokin/scoring/post/$MY_POST" | head -c 400
  echo ""
  echo "Insight:"
  curl -s -H "$H" "$BASE/sokin/trends/post-insight/$MY_POST" | head -c 400
  echo ""
fi

echo ""
echo "===== DONE ====="
