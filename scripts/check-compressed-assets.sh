#!/usr/bin/env bash
set -euo pipefail

bad_paths="$(git ls-files 'assets/*.png' 'assets/*.wav' ':!assets/audio/music-loops/*.wav')"

if [ -n "$bad_paths" ]; then
  echo "Raw assets are tracked. Use WebP/MP3 instead:" >&2
  echo "$bad_paths" >&2
  exit 1
fi
