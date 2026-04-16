Saved from live deployment: Fri Apr 10 22:00:11 EST 2026
Source: https://millzy7665-beep.github.io/oasis-service/

Mirror workflow:
- Canonical web source now lives in the repo root at /Users/chrismills/pool-service-app.
- Regenerate this preserved copy and the repo-root www mirror from the repo root with: npm run sync:mirrors
- Safety guard: sync now refuses to overwrite a target file that has diverged unless you run the underlying script with --force.
- If a mirror has important newer changes, merge them into the repo root first, then rerun sync.
- For Android/Capacitor only, build the repo-root www bundle with: npm run build:web
