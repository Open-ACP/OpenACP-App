#!/usr/bin/env bash
# Switch app identity for channel builds.
# Usage: ./scripts/set-channel.sh nightly
#        ./scripts/set-channel.sh stable   (no-op, default state)

set -euo pipefail

CHANNEL="${1:-stable}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$CHANNEL" == "stable" ]]; then
  echo "Channel: stable (default, no changes needed)"
  exit 0
fi

echo "Switching to channel: $CHANNEL"

# ── Patch tauri.conf.json ──
node -e "
  const fs = require('fs');
  const conf = JSON.parse(fs.readFileSync('$ROOT/src-tauri/tauri.conf.json', 'utf8'));

  conf.productName = 'OpenACP ' + '$CHANNEL'.charAt(0).toUpperCase() + '$CHANNEL'.slice(1);
  conf.identifier = 'com.openacp.desktop.$CHANNEL';

  // Disable auto-updater for non-stable channels
  if (conf.plugins && conf.plugins.updater) {
    delete conf.plugins.updater;
  }
  // No updater artifacts needed
  if (conf.bundle) {
    delete conf.bundle.createUpdaterArtifacts;
  }

  // Use channel icons if they exist (fall back to default)
  const channelIconDir = '$ROOT/src-tauri/icons/$CHANNEL';
  const hasChannelIcons = fs.existsSync(channelIconDir + '/icon.icns');
  if (hasChannelIcons) {
    conf.bundle.icon = [
      'icons/$CHANNEL/32x32.png',
      'icons/$CHANNEL/128x128.png',
      'icons/$CHANNEL/128x128@2x.png',
      'icons/$CHANNEL/icon.icns',
      'icons/$CHANNEL/icon.ico'
    ];
  }

  fs.writeFileSync('$ROOT/src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
  console.log('  tauri.conf.json → ' + conf.productName + ' (' + conf.identifier + ')');
  console.log('  Icons: ' + (hasChannelIcons ? '$CHANNEL' : 'default (no $CHANNEL icons found)'));
  console.log('  Updater: disabled');
"

# ── Patch Cargo.toml — update package name for unique binary ──
sed -i.bak "s/^name = \"openacp-desktop\"/name = \"openacp-desktop-$CHANNEL\"/" "$ROOT/src-tauri/Cargo.toml"
rm -f "$ROOT/src-tauri/Cargo.toml.bak"
echo "  Cargo.toml → openacp-desktop-$CHANNEL"

echo "Done. Build will produce: OpenACP ${CHANNEL^}"
