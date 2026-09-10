#!/usr/bin/env bash
# CD-01 evidence sweep. Usage: sweep.sh <before|after> <outdir>
PHASE="$1"; OUT="$2"; BASE="http://localhost:3000"
mkdir -p "$OUT/sitemaps-$PHASE"

{
echo "### status sweep ($PHASE)"
for slug in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  P="/realestate/temp-premium-v2/$slug"
  for u in "" /properties /services /contact; do
    printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 180 "$BASE$P$u")" "$P$u"
  done
done
P="/cafirm/arora-k-associates"
for u in "" /properties /services /contact; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 180 "$BASE$P$u")" "$P$u"
done

echo "### data-template / data-vertical / gp-container ($PHASE)"
for slug in high-properties evergreen-real-estate expert-realtors nayra-realtors urban-flat-real-estate; do
  body=$(curl -s --max-time 180 "$BASE/realestate/temp-premium-v2/$slug")
  printf '%s data-template=%s data-vertical=%s gp-container=%s\n' "$slug" \
    "$(printf '%s' "$body" | grep -o 'data-template="[^"]*"' | head -1)" \
    "$(printf '%s' "$body" | grep -o 'data-vertical="[^"]*"' | head -1)" \
    "$(printf '%s' "$body" | grep -c 'gp-container')"
done
body=$(curl -s --max-time 180 "$BASE/cafirm/arora-k-associates")
printf '%s data-template=[%s] data-vertical=%s gp-container=%s\n' "arora-k-associates" \
  "$(printf '%s' "$body" | grep -o 'data-template="[^"]*"' | head -1)" \
  "$(printf '%s' "$body" | grep -o 'data-vertical="[^"]*"' | head -1)" \
  "$(printf '%s' "$body" | grep -c 'gp-container')"

echo "### negative cases ($PHASE)"
for u in /realestate/temp-luxury-showcase/high-properties /site/high-properties /cafirm/high-properties; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 180 "$BASE$u")" "$u"
done
} > "$OUT/pages-$PHASE.txt" 2>&1

for f in core properties register localities updates services; do
  curl -s --max-time 300 "$BASE/sitemaps/$f.xml" > "$OUT/sitemaps-$PHASE/$f.xml"
done
echo "sweep $PHASE complete"
wc -c "$OUT/sitemaps-$PHASE"/*.xml
