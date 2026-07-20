---
name: verification
description: "Evidence-based verification discipline. Blocks agents from claiming success without proof. Every claim must be backed by a command that was actually run, with output actually read. Loaded by implementation, diagnosis, TDD, and any workflow where an agent asserts something works."
user_invocable: false
---

# Verification: Evidence Over Claims

No "should work." No "probably passes." No "I believe this is correct." Only evidence.

## The Rule

Before asserting that something works, passes, or is complete:

1. **Identify the exact command** that proves your assertion. A test run, a curl, a script, a query — something concrete.
2. **Run it.** Not from memory. Not "I ran this earlier." Execute it now.
3. **Read the full output.** Not the first line. The full result, including exit code.
4. **Confirm the output supports your claim.** If the output is ambiguous, partial, or you're interpreting generously — it's not verified.

## Unverifiable Claims

Some things can't be verified by command (e.g., "the UI looks right", "the animation feels smooth"). When you encounter these:

- Say so explicitly: "This requires manual verification."
- Describe exactly how the user can check it themselves.
- Do not claim it works. Claim you implemented it and explain how to verify.

## Where This Applies

- **TDD RED step:** The test must fail. Run it. Confirm the failure message matches what you expect — not just "it failed."
- **TDD GREEN step:** The test must pass. Run it. Confirm the output shows a pass — not just "no errors."
- **Debug Phase 4:** The fix must resolve the original reproduction. Run the reproduction from Phase 1. Confirm the symptom is gone.
- **Build completion:** Each acceptance criterion needs a verification command and its result.
- **Any time you say "done":** What command proves it?

## Banned Language

These phrases are red flags that verification was skipped:

- "This should work"
- "Tests should pass now"
- "I believe this is correct"
- "This probably fixes it"
- "The change looks right"
- "Based on the code, this will..."

Replace with: "I ran [command]. Output: [result]. This confirms [specific claim]."
