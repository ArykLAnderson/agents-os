---
name: watch
description: Observe one changing external or local subject until a declared predicate or stop condition. Use for CI, pull requests, deployments, jobs, queues, test environments, migrations, or other asynchronous state when the user asks to watch, monitor, wait, poll, or stay with the work until a result.
user-invocable: true
argument-hint: "[subject and terminal condition]"
---

# Watch

Own bounded observation of one subject. Watching is read-only by default. It does not authorize retries, pushes, comments, reruns, merges, deployments, cleanup, or other mutations.

## Watch contract

Before waiting, establish:

- subject and provider
- baseline identity such as commit SHA, run ID, deployment revision, job ID, or environment
- observable terminal predicate
- read-only event source or poll command
- initial interval, maximum interval, and deadline when one is needed
- wake reasons that require action by the owning workflow or user
- re-arm condition after a state-changing action
- stop conditions

If the request is only for current state, check once. If no terminal predicate can be inferred, ask one bounded question instead of starting an open-ended watch.

## Observe

Use provider events when a supported event source exists. Otherwise poll with bounded backoff. Do not use an unbounded watch command or create competing sleep loops.

Continue until the predicate is met, the deadline expires, the subject identity changes, observation becomes unauthorized, a technical blocker prevents further observation, or the user stops the watch. A pending state is not a reason to return early when continued observation remains possible within the contract.

Bind every observation to the exact subject identity. After a push, retry, redeploy, or other state-changing action by an authorized owner, invalidate the old observation and re-arm against the new identity.

Do not mutate the subject. When a wake condition calls for a mutation, return control to the owning workflow unless that exact action is separately authorized and owned there.

## Return

Report the subject identity, final observed state, predicate result, observation time, and commands or provider evidence. On timeout or blockage, report the last state and the exact condition that prevented completion.

Use `predicate_met`, `predicate_failed`, `deadline_reached`, `identity_changed`, `authority_blocked`, or `technical_blocked` as the result.
