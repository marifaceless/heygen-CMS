#!/bin/zsh
set -euo pipefail

# Run from the project directory, regardless of where the script is invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f package.json ]; then
  echo "Error: package.json not found in $SCRIPT_DIR"
  exit 1
fi

# Install dependencies if needed, then start the dev server.
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting the app + render server..."
npm run dev:all
