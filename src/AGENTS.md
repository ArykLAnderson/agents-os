# Global Agent Instructions

## UUID generation

When a UUID is needed, run `/usr/bin/uuidgen` instead of writing an inline Python, Node.js, or other ad hoc UUID generator. Use the generated value as-is unless the receiving format explicitly requires lowercase; when it does, run `/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'`.
