#!/bin/bash
# OASIS Service App — Local Server Starter
# Double-click this file to start the server

# Get this script's directory (where the app files are)
cd "$(dirname "$0")"

# Find local IP
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

# Kill any existing server on port 8080
lsof -ti:8080 | xargs kill -9 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         OASIS SERVICE APP                ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Server is RUNNING                       ║"
echo "║                                          ║"
echo "║  Share this URL with your team:          ║"
echo "║                                          ║"
echo "║  http://$IP:8080          ║"
echo "║                                          ║"
echo "║  On Android: open Chrome, go to the      ║"
echo "║  URL above, then tap the menu (⋮) and   ║"
echo "║  'Add to Home Screen' to install.        ║"
echo "║                                          ║"
echo "║  Keep this window open while working.   ║"
echo "║  Close it to stop the server.            ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Open the app in the Mac browser too
open "http://$IP:8080"

# Start server (keeps running until window is closed)
python3 -m http.server 8080
