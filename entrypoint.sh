#!/bin/sh
# Container entrypoint: inject the deploy-provided Heartly key into the served
# page, then start the API. Render dashboard env vars only exist at RUNTIME, so
# this is how the key reaches the browser without living in the image layers.
# Public-by-design (any visitor can read it in devtools): keep it throwaway.
set -eu

INDEX=/app/frontend/dist/index.html
# Restore the pristine page first so restarts/key rotations stay idempotent
# no matter what characters the key contains.
if [ -f "$INDEX" ]; then
  [ -f "$INDEX.pristine" ] || cp "$INDEX" "$INDEX.pristine"
  cp "$INDEX.pristine" "$INDEX"
  if [ -n "${HEARTLY_GROQ_KEY:-}" ]; then
    esc=$(printf '%s' "$HEARTLY_GROQ_KEY" | sed 's/\\/\\\\/g; s/"/\\"/g')
    sed -i "s|</head>|<script>window.__HEARTLY_KEY=\"${esc}\"</script></head>|" "$INDEX"
  fi
fi

exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
