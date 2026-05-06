#!/usr/bin/env bash
# Fetch YouTube transcript given a URL or video ID
# Usage: fetch-transcript.sh <youtube-url-or-video-id> [language-codes...]
# Examples:
#   fetch-transcript.sh https://www.youtube.com/watch?v=dQw4w9WgXcQ
#   fetch-transcript.sh dQw4w9WgXcQ en ja
#   fetch-transcript.sh "https://youtu.be/dQw4w9WgXcQ" en

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: fetch-transcript.sh <youtube-url-or-video-id> [language-codes...]" >&2
  exit 1
fi

INPUT="$1"
shift

# Extract video ID from various YouTube URL formats
extract_video_id() {
  local input="$1"
  # Already a bare video ID (11 chars, alphanumeric + - _)
  if [[ "$input" =~ ^[a-zA-Z0-9_-]{11}$ ]]; then
    echo "$input"
    return
  fi
  # youtube.com/watch?v=ID
  if [[ "$input" =~ [\?\&]v=([a-zA-Z0-9_-]{11}) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # youtu.be/ID
  if [[ "$input" =~ youtu\.be/([a-zA-Z0-9_-]{11}) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # youtube.com/embed/ID
  if [[ "$input" =~ youtube\.com/embed/([a-zA-Z0-9_-]{11}) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # youtube.com/v/ID
  if [[ "$input" =~ youtube\.com/v/([a-zA-Z0-9_-]{11}) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # youtube.com/shorts/ID
  if [[ "$input" =~ youtube\.com/shorts/([a-zA-Z0-9_-]{11}) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  echo "Error: Could not extract video ID from: $input" >&2
  exit 1
}

VIDEO_ID=$(extract_video_id "$INPUT")

# Build language args (default: en)
LANG_ARGS=()
if [ $# -gt 0 ]; then
  LANG_ARGS=("--languages" "$@")
else
  LANG_ARGS=("--languages" "en")
fi

# Check if youtube_transcript_api is available
if ! command -v youtube_transcript_api &> /dev/null; then
  echo "Error: youtube_transcript_api not found. Install with: pipx install youtube-transcript-api" >&2
  exit 1
fi

# Fetch transcript as plain text
youtube_transcript_api "$VIDEO_ID" "${LANG_ARGS[@]}" --format text
