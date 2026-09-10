#!/usr/bin/env bash
# AC 6 / AC 7 cycles on urban-flat-real-estate (never high-properties — live client).
# Each step: stop dev server, rm -rf .next (defeats the 300s unstable_cache window
# deterministically rather than racing it), run the SQL, restart, then observe.
cd /d/PROJECTS/gigzmanclient
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"
export PGPASSWORD='kanu@2003'
PSQL="psql -h localhost -U postgres -d gigzman_client_sites -q"
U="http://localhost:3000/realestate/temp-premium-v2/urban-flat-real-estate"

stop_dev() {
  for pid in $(netstat -ano 2>/dev/null | grep -E '  TCP    0\.0\.0\.0:3000' | awk '{print $NF}' | sort -u); do
    taskkill //PID "$pid" //T //F >/dev/null 2>&1
  done
}

start_dev() {
  rm -rf .next
  ( pnpm dev > /tmp/dev-cycle.log 2>&1 & )
  until grep -qE "Ready in|Error" /tmp/dev-cycle.log 2>/dev/null; do :; done
}

cycle() {   # cycle "<label>" "<sql>"
  stop_dev
  $PSQL -c "$2"
  start_dev
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 "$U")
  smc=$(curl -s --max-time 300 http://localhost:3000/sitemaps/core.xml | grep -c urban-flat-real-estate)
  row=$($PSQL -t -c "select template_key, is_active from clients where slug='urban-flat-real-estate';" | tr -s ' ')
  printf '%-46s home=%s  core.xml-hits=%s  row=[%s]\n' "$2" "$code" "$smc" "$(echo $row)"
}

echo "### AC6/AC7 cycles — urban-flat-real-estate"
cycle "AC6a null template" "update clients set template_key = null where slug = 'urban-flat-real-estate';"
cycle "AC6b unknown template" "update clients set template_key = 'premium-v3' where slug = 'urban-flat-real-estate';"
cycle "AC6c restore" "update clients set template_key = 'premium-v2' where slug = 'urban-flat-real-estate';"
cycle "AC7a deactivate" "update clients set is_active = false where slug = 'urban-flat-real-estate';"
cycle "AC7b reactivate" "update clients set is_active = true where slug = 'urban-flat-real-estate';"
echo "### done"
