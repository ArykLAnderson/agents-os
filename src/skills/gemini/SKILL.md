---
name: gemini
description: Call the Google Gemini API with a prompt. Use when the user wants a second opinion from Gemini, wants to compare model outputs, or explicitly asks to query Gemini.
user-invocable: true
argument-hint: "[--model model-name] <prompt>"
allowed-tools: Bash
---

# Gemini API

Call Google Gemini models via the REST API.

## Instructions

1. **Parse arguments** from `$ARGUMENTS`:
   - If the arguments start with `--model <model-name>`, extract the model name and use the rest as the prompt.
   - Otherwise, use `gemini-2.5-flash-lite` as the default model and treat all arguments as the prompt.

2. **Retrieve the API key**:
   ```bash
   GEMINI_API_KEY=$(pass gemini/api_key)
   ```

3. **Call the Gemini API** via curl:
   ```bash
   GEMINI_API_KEY=$(pass gemini/api_key)
   MODEL="<model>"
   PROMPT='<prompt text, properly escaped for JSON>'

   RESPONSE=$(curl -s "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}" \
     -H "Content-Type: application/json" \
     -d "{\"contents\": [{\"parts\": [{\"text\": $(printf '%s' "$PROMPT" | jq -Rs .)}]}]}")

   # Extract response text
   echo "$RESPONSE" | jq -r '.candidates[0].content.parts[0].text // "ERROR: No response text found"'

   # Extract and display token usage
   echo ""
   echo "--- Token Usage ---"
   PROMPT_TOKENS=$(echo "$RESPONSE" | jq -r '.usageMetadata.promptTokenCount // 0')
   CANDIDATE_TOKENS=$(echo "$RESPONSE" | jq -r '.usageMetadata.candidatesTokenCount // 0')
   TOTAL_TOKENS=$(echo "$RESPONSE" | jq -r '.usageMetadata.totalTokenCount // 0')
   echo "Input: ${PROMPT_TOKENS} | Output: ${CANDIDATE_TOKENS} | Total: ${TOTAL_TOKENS}"

   # Cost estimate (Flash-Lite pricing: $0.10/M input, $0.40/M output)
   COST=$(echo "scale=6; ($PROMPT_TOKENS * 0.10 / 1000000) + ($CANDIDATE_TOKENS * 0.40 / 1000000)" | bc)
   echo "Estimated cost: \$${COST}"
   ```

4. **Present the response** clearly:
   - Show the Gemini response text first
   - Follow with a compact token usage and cost summary
   - If the response contains an error (no `candidates` field), show the raw error from the API

## Model Options

| Model | Tier | Notes |
|-------|------|-------|
| `gemini-2.5-flash-lite` | Free | Default. Fast, cheap. |
| `gemini-2.5-flash` | Free/Paid | Stronger reasoning. |
| `gemini-2.5-pro` | Paid | Strongest. Higher cost. |

## Error Handling

- If `pass gemini/api_key` fails, tell the user to set up the key: `pass insert gemini/api_key`
- If the API returns an error JSON (has `error` field), display the error message and status
- If curl fails, report the network error
