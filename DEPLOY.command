#!/bin/bash
# OASIS Service App — One-click deploy
# Double-click this file in Finder to push hosting + cloud functions to Firebase.

set -e
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  OASIS — Deploy to Firebase              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Confirm firebase CLI is installed
if ! command -v firebase >/dev/null 2>&1; then
  echo "❌ Firebase CLI is not installed."
  echo "   Install with: npm install -g firebase-tools"
  echo ""
  read -p "Press Return to close…"
  exit 1
fi

# 1) Refresh the www/ mirror from the root source of truth
echo "→ Syncing www/ mirror from root files…"
node scripts/sync-oasis-mirrors.js --force

# 2) Install cloud function deps if missing
if [ ! -d functions/node_modules ]; then
  echo "→ Installing cloud function dependencies (first run only)…"
  (cd functions && npm install)
fi

# 3) Deploy hosting + functions
echo "→ Deploying hosting + functions to oasis-service-app-69def…"
firebase deploy --only hosting,functions

echo ""
echo "✅ Deploy complete."
echo ""
echo "Share this link with your team for install:"
echo "   https://oasis-service-app-69def.web.app"
echo ""
read -p "Press Return to close…"
