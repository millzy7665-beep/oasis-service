#!/bin/bash
# OASIS Service App — Local Server Starter
# Double-click this file to start the server

# Get this script's directory (where the app files are)
cd "$(dirname "$0")"

# Find local IP
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
URL="http://$IP:8080"

# Kill any existing server on port 8080
lsof -ti:8080 | xargs kill -9 2>/dev/null

# Remove old QR codes
rm -f oasis-service-qr.png

# Generate fresh QR code using Python
python3 -c "import qrcode; img = qrcode.make('$URL'); img.save('oasis-service-qr.png')"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         OASIS SERVICE APP                ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Server is RUNNING                       ║"
echo "║                                          ║"
echo "║  Share this URL with your team:          ║"
echo "║                                          ║"
echo "║  $URL          ║"
echo "║                                          ║"
echo "║  1. Connect to the SAME Wi-Fi            ║"
echo "║  2. Scan the QR code that just opened    ║"
echo "║                                          ║"
echo "║  Keep this window open while working.   ║"
echo "║  Close it to stop the server.            ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Open the QR code and the app
open "oasis-service-qr.png"
open "$URL"

# Start server
python3 -m http.server 8080
