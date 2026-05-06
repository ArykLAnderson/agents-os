---
name: youtube-transcript
description: Fetch and analyze YouTube video transcripts. Use when the user shares a YouTube URL or video ID, asks about a YouTube video's content, or wants to extract ideas from a video.
user-invocable: true
argument-hint: "[youtube-url-or-video-id]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/*)
---

# YouTube Transcript

Fetch transcripts from YouTube videos for analysis, summarization, or reference.

## Usage

When the user shares a YouTube URL or video ID, fetch the transcript:

```bash
${CLAUDE_SKILL_DIR}/scripts/fetch-transcript.sh "<url-or-video-id>" [language-codes...]
```

**Supported URL formats:**
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/embed/VIDEO_ID`
- `https://youtube.com/shorts/VIDEO_ID`
- Bare video ID: `dQw4w9WgXcQ`

**Language codes** (optional, defaults to `en`):
- `en` — English
- `ja` — Japanese
- `en ja` — Try English first, fall back to Japanese
- Any ISO language code supported by YouTube

## After Fetching

Once you have the transcript:

1. **Summarize** the key points if the user asks for a summary
2. **Extract actionable ideas** if the user is looking for techniques, practices, or concepts to apply
3. **Quote specific sections** when referencing particular points
4. **Note the video context** — who is speaking, what the topic is, if discernible from the content

## Prerequisites

Requires `youtube_transcript_api` CLI. Install with:
```bash
pipx install youtube-transcript-api
```

## Limitations

- Only works with videos that have subtitles/captions (manual or auto-generated)
- Auto-generated captions may have transcription errors
- Some videos have captions disabled by the creator
