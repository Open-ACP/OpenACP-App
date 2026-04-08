#!/usr/bin/env bash
# Switch app identity + updater endpoint for channel builds.
# Usage: ./scripts/set-channel.sh nightly
#        ./scripts/set-channel.sh stable   (no-op, default state)
#
# Environment variables (optional):
#   UPDATER_ENDPOINT — override the update check URL
#   UPDATER_PUBKEY   — override the signing public key

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

  // Override updater endpoint for non-stable channels
  const customEndpoint = process.env.UPDATER_ENDPOINT;
  const customPubkey = process.env.UPDATER_PUBKEY;

  if (conf.plugins && conf.plugins.updater) {
    if (customEndpoint) {
      conf.plugins.updater.endpoints = [customEndpoint];
      console.log('  Updater endpoint: ' + customEndpoint);
    } else {
      // Default: use fork's GitHub releases for this channel
      // Fork owner can set UPDATER_ENDPOINT in CI secrets
      delete conf.plugins.updater;
      console.log('  Updater: disabled (no UPDATER_ENDPOINT set)');
    }
    if (customPubkey) {
      conf.plugins.updater.pubkey = customPubkey;
    }
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
"

# ── Patch Cargo.toml — update package name for unique binary ──
sed -i.bak "s/^name = \"openacp-desktop\"/name = \"openacp-desktop-$CHANNEL\"/" "$ROOT/src-tauri/Cargo.toml"
rm -f "$ROOT/src-tauri/Cargo.toml.bak"
echo "  Cargo.toml → openacp-desktop-$CHANNEL"

echo "Done. Build will produce: OpenACP $(echo "$CHANNEL" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
