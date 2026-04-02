#!/bin/bash
set -e

APP_NAME="VoiceWorker"
HEALTH_URL="http://localhost:3001/health"

echo "🚀 Starting deployment..."


# prevent concurrent deploy
LOCK_FILE="/tmp/deploy.lock"
exec 200>$LOCK_FILE
flock -n 200 || { echo "Another deployment is running"; exit 1; }

# save current commit (rollback)
PREV_COMMIT=$(git rev-parse HEAD)

echo "📥 Pull latest code..."
git fetch origin main
git reset --hard origin/main

echo "📦 Install dependencies..."
npm ci
npm run prisma:generate

echo "🛠 Build..."
npm run build

echo "🧬 Run migrations..."
npm run prisma:deploy


echo "📋 Getting instance IDs..."
IDS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm_id")

# if app not running yet → first deploy
if [ -z "$IDS" ]; then
  echo "⚡ First deploy → starting app"
  pm2 start ./infrastructure/ecosystem.config.js
  pm2 save
  exit 0
fi

# reload instance by instance
for id in $IDS; do
  echo "🔄 Reloading instance $id..."

  pm2 reload $APP_NAME --only $id

  echo "⏳ Waiting..."
  sleep 5

  echo "🩺 Health check..."
  if ! curl -f --max-time 3 $HEALTH_URL > /dev/null 2>&1; then
    echo "❌ Instance $id failed!"

    echo "↩️ Rolling back..."
    git reset --hard $PREV_COMMIT

    npm ci
    npm run build

    pm2 reload $APP_NAME

    echo "🛑 Deployment FAILED (rolled back)"
    exit 1
  fi

  echo "✅ Instance $id OK"
done

echo "🎉 Deployment SUCCESS"