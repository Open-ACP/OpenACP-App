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
  const path = require('path');
  const root = path.resolve(process.cwd());
  const channel = '$CHANNEL';
  const confPath = path.join(root, 'src-tauri', 'tauri.conf.json');
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

  conf.productName = 'OpenACP ' + channel.charAt(0).toUpperCase() + channel.slice(1);
  conf.identifier = 'com.openacp.desktop.' + channel;

  // Override updater endpoint for non-stable channels
  const customEndpoint = process.env.UPDATER_ENDPOINT;
  const customPubkey = process.env.UPDATER_PUBKEY;

  if (conf.plugins && conf.plugins.updater) {
    if (customEndpoint) {
      conf.plugins.updater.endpoints = [customEndpoint];
      console.log('  Updater endpoint: ' + customEndpoint);
    } else {
      delete conf.plugins.updater;
      console.log('  Updater: disabled (no UPDATER_ENDPOINT set)');
    }
    if (customPubkey && conf.plugins.updater) {
      conf.plugins.updater.pubkey = customPubkey;
    }
  }

  // Use channel icons if they exist (fall back to default)
  const iconDir = path.join(root, 'src-tauri', 'icons', channel);
  const hasChannelIcons = fs.existsSync(path.join(iconDir, 'icon.icns'));
  if (hasChannelIcons) {
    conf.bundle.icon = [
      'icons/' + channel + '/32x32.png',
      'icons/' + channel + '/128x128.png',
      'icons/' + channel + '/128x128@2x.png',
      'icons/' + channel + '/icon.icns',
      'icons/' + channel + '/icon.ico'
    ];
  }

  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
  console.log('  tauri.conf.json → ' + conf.productName + ' (' + conf.identifier + ')');
  console.log('  Icons: ' + (hasChannelIcons ? channel : 'default (no ' + channel + ' icons found)'));
"

# ── Patch Cargo.toml — update package name for unique binary ──
node -e "
  const fs = require('fs');
  const path = require('path');
  const cargoPath = path.join(process.cwd(), 'src-tauri', 'Cargo.toml');
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^name = \"openacp-desktop\"/m, 'name = \"openacp-desktop-$CHANNEL\"');
  fs.writeFileSync(cargoPath, cargo);
  console.log('  Cargo.toml → openacp-desktop-$CHANNEL');
"

echo "Done. Build will produce: OpenACP $(echo "$CHANNEL" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
