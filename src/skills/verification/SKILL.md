---
name: verification
description: Evidence discipline for claims about source, implementation, behavior, authority, and completion. Loaded by implementation, diagnosis, TDD, validation, and any workflow that asserts a result.
user_invocable: false
---

# Verification

Match each material claim to current evidence. Use [references/claim-status.md](references/claim-status.md) to distinguish direct observation, inference, implementation state, behavioral verification, accepted authority, blockage, and invalidated evidence.

## Verify behavior

Before saying behavior works, passes, or is complete:

1. Identify the smallest command or direct observation that tests the claim.
2. Run it against the named candidate now.
3. Read the full result and exit status.
4. Confirm that the result proves the stated behavior rather than an adjacent fact.
5. Report the candidate identity, command or observation, result, and evidence limit.

A source read can support an `observed` claim about source. It cannot support a `verified` claim about runtime behavior. A worker report can support an `implemented` claim when the candidate contains the change. It does not prove that the behavior works.

## Match proof to the claim

- TDD red: run the test and confirm that it fails for the expected missing behavior.
- TDD green: run the test and confirm the expected behavior passes.
- Diagnosis: rerun the original reproduction and confirm that the symptom is gone.
- Build completion: exercise each acceptance criterion through its declared interface.
- Visual or experiential behavior: inspect the rendered result through the relevant browser, device, or application surface.
- Authority: cite the decision owner and accepted revision or provider state. A command is not a substitute for human authority.
- Documentation-only work: use focused source review, link validation, generation checks, or a consumer walkthrough. Do not create a text-presence test.

## Evidence limits

When the available proof is partial, stale, prohibited, or unavailable, label the claim `inferred`, `blocked`, or `invalidated`. State the exact gap. Do not convert missing proof into optimistic language.

Avoid phrases such as "should work," "probably passes," "looks right," or "I believe this is correct." Report what was observed and what that evidence establishes.
