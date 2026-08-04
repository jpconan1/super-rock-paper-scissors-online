#!/usr/bin/env bash
set -euo pipefail

if ! command -v cwebp >/dev/null 2>&1; then
  echo "Need cwebp. Install with: brew install webp" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Need ffmpeg. Install with: brew install ffmpeg" >&2
  exit 1
fi

converted=0

while IFS= read -r -d '' path; do
  case "$path" in
    assets/*.png)
      [ -f "$path" ] || continue
      out="${path%.png}.webp"
      cwebp -quiet -q 75 "$path" -o "$out"
      git add "$out"
      git rm --cached --quiet "$path" || true
      rm -f "$path"
      echo "compressed $path -> $out"
      converted=1
      ;;
    assets/audio/music-loops/*.wav)
      # Loop masters keep exact sample boundaries. Never run them through MP3.
      continue
      ;;
    assets/*.wav)
      [ -f "$path" ] || continue
      out="${path%.wav}.mp3"
      ffmpeg -hide_banner -loglevel error -y -i "$path" -codec:a libmp3lame -q:a 5 "$out"
      git add "$out"
      git rm --cached --quiet "$path" || true
      rm -f "$path"
      echo "compressed $path -> $out"
      converted=1
      ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACM -z)

if [ "$converted" -eq 1 ]; then
  echo "asset compression changed staged files; review with git status"
fi
