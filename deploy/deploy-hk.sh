#!/bin/bash
# Deploy mt-happy to HK server (mt.hk.swannzh.icu)
# All-in-one: server + webapp in single container, nginx for SSL
#
# First time setup:
#   1. git clone -b mt-happy <repo-url> mt-happy && cd mt-happy
#   2. mkdir -p certs
#   3. Generate SSL cert:
#      sudo certbot certonly --standalone -d mt.hk.swannzh.icu
#      cp /etc/letsencrypt/live/mt.hk.swannzh.icu/fullchain.pem certs/
#      cp /etc/letsencrypt/live/mt.hk.swannzh.icu/privkey.pem certs/
#   4. Create .env:
#      echo "HANDY_MASTER_SECRET=$(openssl rand -hex 32)" > .env
#   5. bash deploy/deploy-hk.sh
#
# Subsequent deploys:
#   git pull && bash deploy/deploy-hk.sh

set -e

echo "=== mt-happy HK deployment (all-in-one) ==="
echo "Domain: mt.hk.swannzh.icu"
echo ""

# Check certs exist
if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
    echo "ERROR: SSL certs not found in ./certs/"
    echo ""
    echo "Generate with:"
    echo "  sudo certbot certonly --standalone -d mt.hk.swannzh.icu"
    echo "  cp /etc/letsencrypt/live/mt.hk.swannzh.icu/fullchain.pem certs/"
    echo "  cp /etc/letsencrypt/live/mt.hk.swannzh.icu/privkey.pem certs/"
    exit 1
fi

# Check .env exists
if [ ! -f .env ]; then
    echo "WARNING: .env not found, creating with random secret..."
    echo "HANDY_MASTER_SECRET=$(openssl rand -hex 32)" > .env
    echo "Created .env with random HANDY_MASTER_SECRET"
    echo ""
fi

# Build and start
echo "Building and starting containers..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "=== Deployment complete ==="
echo ""
echo "  All services: https://mt.hk.swannzh.icu"
echo "    - Webapp:   https://mt.hk.swannzh.icu/"
echo "    - API:      https://mt.hk.swannzh.icu/v1/"
echo "    - WS:       wss://mt.hk.swannzh.icu/socket.io/"
echo "    - Health:   https://mt.hk.swannzh.icu/health"
echo ""
echo "Check status: docker compose ps"
echo "View logs:    docker compose logs -f"
echo "Rebuild:      docker compose up -d --build"
