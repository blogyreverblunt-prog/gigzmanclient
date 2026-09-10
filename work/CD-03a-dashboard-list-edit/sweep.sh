#!/bin/sh
# CD-03a regression sweep: six tenants, every base path, status codes only.
# Usage: sweep.sh <suffix>   ->  status-<suffix>.txt, sitemap-<family>-<suffix>.txt
# PORT env var selects the server (a stale, unrelated node process holds :3000 and :3001 is taken by an unrelated service
# on this machine and could not be stopped, so evidence runs on :3001).
set -e
D="$(dirname "$0")"
SUF="$1"
RE_PATHS="/ /properties /localities /contact /faq /calculators /updates /sectors /builders /vastu /area-converter /rental-yield /maps/gurgaon /home-loan /property-management"
CA_PATHS="/ /services /contact /faq /calculators /updates /firm-profile"
{
for base in /realestate/temp-premium-v2/high-properties \
            /realestate/temp-premium-v2/evergreen-real-estate \
            /realestate/temp-premium-v2/expert-realtors \
            /realestate/temp-premium-v2/nayra-realtors \
            /realestate/temp-premium-v2/urban-flat-real-estate; do
  for p in $RE_PATHS; do
    printf '%s%s %s\n' "$base" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT:-3456}$base$p")"
  done
done
for p in $CA_PATHS; do
  printf '/cafirm/arora-k-associates%s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT:-3456}/cafirm/arora-k-associates$p")"
done
} | sort > "$D/status-$SUF.txt"

for f in core properties register localities updates services maps home-loan area-converter vastu vastu-sectors; do
  curl -s "http://localhost:${PORT:-3456}/sitemaps/$f.xml" | grep -o '<loc>[^<]*</loc>' | sort > "$D/sitemap-$f-$SUF.txt"
done
echo "done: $SUF"
