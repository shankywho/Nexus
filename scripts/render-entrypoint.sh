#!/bin/sh
# Start FalkorDB on localhost only, wait until it answers, then run the API on $PORT.
set -e

redis-server --bind 127.0.0.1 --port 6379 --protected-mode yes \
    --save "" --appendonly no \
    --loadmodule "${FALKORDB_BIN_PATH}/falkordb.so" ${FALKORDB_ARGS} &

i=0
until redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { echo "FalkorDB did not start" >&2; exit 1; }
    sleep 0.5
done

exec uvicorn nexus_api.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
