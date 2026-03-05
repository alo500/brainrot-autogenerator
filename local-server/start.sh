#!/usr/bin/env bash
# Start the Wan2.1 server and expose it via Cloudflare Tunnel
# Run this on your PC, then paste the tunnel URL into WAN_SERVER_URL in .env.local

set -e

# Activate venv if it exists
if [ -d "venv" ]; then
  source venv/bin/activate
fi

# Export the tunnel URL for the server to use in video URLs
export SERVER_BASE_URL="${CF_TUNNEL_URL:-http://localhost:8000}"

echo "Starting Wan2.1 FastAPI server..."
uvicorn main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

# Start Cloudflare tunnel (install with: brew install cloudflare/cloudflare/cloudflared)
echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:8000 &
TUNNEL_PID=$!

echo ""
echo "Server running. Copy the cloudflared HTTPS URL and paste it"
echo "into WAN_SERVER_URL in your .env.local on Vercel."
echo ""

# Wait for both processes
wait $SERVER_PID $TUNNEL_PID
