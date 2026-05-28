#!/bin/bash
cd /opt/mt-happy/packages/happy-server
export $(cat .env | xargs)
exec /usr/local/bin/node /opt/mt-happy/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs /opt/mt-happy/packages/happy-server/sources/standalone.ts serve
