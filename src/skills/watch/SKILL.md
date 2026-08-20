---
name: watch
description: Watch CI, pull requests, deployments, jobs, or other changing state when asked to monitor, wait, or poll until a result.
user-invocable: false
argument-hint: "[subject and terminal condition]"
---

# Watch

Own bounded observation of one subject. Watching is read-only by default. It does not authorize retries, pushes, comments, reruns, merges, deployments, cleanup, or other mutations.

## Watch contract

Before waiting, establish:

- subject and provider
- baseline identity such as commit SHA, run ID, deployment revision, job ID, or environment
- success and failure predicates
- read-only event source or poll command
- initial interval, maximum interval, and deadline
- wake reasons that require action by the owning workflow or user
- re-arm condition after a state-changing action

Use single-check mode when the request asks only for current state. Obtain one bounded decision when a result or deadline cannot be inferred.

## Observe

Use one provider event stream when available. Otherwise use one bounded-backoff polling loop.

Continue until a result predicate is met, the deadline expires, identity changes, observation is blocked, or the user stops the watch.

Bind every observation to the exact subject identity. After a push, retry, redeploy, or other state-changing action by an authorized owner, invalidate the old observation and re-arm against the new identity.

## Return

Report the subject identity, final observed state, predicate result, observation time, and commands or provider evidence. On timeout or blockage, report the last state and the exact condition that prevented completion.

Use `predicate_met`, `predicate_failed`, `deadline_reached`, `identity_changed`, `authority_blocked`, or `technical_blocked` as the result.
