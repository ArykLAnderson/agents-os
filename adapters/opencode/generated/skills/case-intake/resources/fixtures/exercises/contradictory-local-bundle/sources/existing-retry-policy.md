# Notification Retry Policy RFC

- **Status:** superseded on 2026-06-30
- **Last updated:** 2026-05-10

## Decision

The notification worker retries failed delivery three times before sending the message to the dead-letter queue.

## Note

This document describes the policy used before the current notification migration. It is retained for historical reference.
