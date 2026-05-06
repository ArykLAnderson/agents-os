<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Debug a problem using competing hypotheses.

$ARGUMENTS

## Instructions

1. **Understand the problem**: Read the bug description above. Gather initial context:
   - Read relevant source files, logs, error messages
   - Run `git log --oneline -10` to see recent changes
   - Check if tests exist for the affected area

2. **Generate hypotheses**: Based on the evidence, formulate 3 initial hypotheses about the root cause. Each hypothesis should be:
   - Specific and testable (not "something is wrong with auth")
   - Distinct from the others (different root causes, not variations of the same idea)
   - Plausible given the evidence

3. **Investigate in parallel**: Launch 3 subagents simultaneously (using the Agent tool with `agent_role: "Explore"`), one per hypothesis. Each agent should:
   - State its hypothesis clearly
   - Search for evidence that **supports** the hypothesis
   - Search for evidence that **disproves** the hypothesis
   - Run targeted tests or commands if helpful
   - Report: evidence for, evidence against, confidence level (high/medium/low)

4. **Evaluate results**: After all agents report back:
   - Rank hypotheses by evidence strength
   - If one hypothesis has strong evidence → present it as the likely root cause
   - If results are inconclusive → generate 1-2 new hypotheses based on what was learned and spawn additional agents to investigate
   - Continue until a hypothesis has strong evidence or all reasonable theories are exhausted

5. **Report findings**:

## Root Cause Analysis

**Most likely cause:** [hypothesis with strongest evidence]
**Confidence:** [high/medium/low]

**Evidence:**
- [Supporting evidence, with file paths and line numbers]

**Disproven hypotheses:**
- [Hypothesis] — disproven because [evidence]

**Suggested fix:**
- [Specific steps to resolve the issue]

**Prevention:**
- [How to prevent this class of bug in the future]
