# Workflow Patterns

These examples use task-defined ownership and call-level model selection. They intentionally avoid installed role files.

## Author → parallel review → author reconciliation

Use this when one owner must preserve semantic responsibility across advisory review.

```js
const draft = await agent("Author the candidate from the supplied accepted boundary.", {
  label: "Candidate owner",
  model: "planning",
  tools: ["read", "bash"],
});
const findings = await parallel("review", {
  architecture: () => agent(prompt(
    "Review responsibility and compatibility only. Return advisory findings; do not rewrite the candidate.\n\nCandidate:\n{draft}",
    { draft },
  ), { label: "Architecture review", model: "review", tools: ["read", "bash"] }),
  validation: () => agent(prompt(
    "Check the candidate against the exact accepted criteria. Return PASS or bounded defects; do not repair it.\n\nCandidate:\n{draft}",
    { draft },
  ), { label: "Independent validation", model: "review", tools: ["read", "bash"] }),
});
return await agent(prompt(
  "As candidate owner, reconcile valid findings and return the complete final candidate. Preserve disagreement requiring human judgment.\n\nDraft:{draft}\nFindings:{findings}",
  { draft, findings },
), { label: "Candidate owner reconciliation", model: "planning", tools: ["read", "bash"] });
```

The first and last calls are separate sessions but share one explicit ownership contract. Reviewers never become writers.

## Parallel research → stronger synthesis

```js
const evidence = await parallel("research", {
  source: () => agent("Collect primary-source evidence for the bounded question.", {
    label: "External evidence",
    model: "research",
    tools: ["web_search", "fetch_content", "get_search_content"],
  }),
  terrain: () => agent("Inspect local terrain relevant to the bounded question.", {
    label: "Local terrain",
    model: "research",
    tools: ["read", "bash"],
  }),
});
return await agent(prompt(
  "Synthesize the evidence, resolve contradictions where supported, and surface remaining judgment.\n\n{evidence}",
  { evidence },
), { label: "Evidence synthesis", model: "aggregation", tools: ["read"] });
```

## Persistent engineering slice

Use one writer per worktree and validate after deterministic gates pass.

```js
return await withWorktree("slice", async ({ path, branch }) => {
  const implementation = await agent("Implement the bounded task contract with tests. Run focused checks and report evidence.", {
    label: "Slice owner",
    model: "execution",
    tools: ["read", "write", "edit", "bash"],
  });
  const tests = await shell("npm test", { env: { CI: "1" } });
  if (tests.exitCode !== 0) return { path, branch, implementation, tests };
  const validation = await agent(prompt(
    "Independently validate the implemented contract through its public interface. Do not edit files. Writer report: {implementation}",
    { implementation },
  ), { label: "Focused validation", model: "review", tools: ["read", "bash"] });
  return { path, branch, implementation, tests, validation };
});
```

A validation failure returns to a writer in the same owned worktree; the validator does not fix its candidate.

## Proportional multi-area review

1. Run one bounded correctness/conformance review first.
2. Inspect its concrete findings and the changed seams.
3. Add architecture, security, or performance review only where triggered.
4. Run triggered specialist reviews in parallel when independent.
5. Return findings to the owner for disposition.
6. Independently validate the reconciled result.

Avoid a fixed council for every change. Review count follows consequence and uncertainty, not available role names.

## Output schemas

Use schemas for machine-consumed boundaries, such as:

```js
const verdictSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: {
    verdict: { enum: ["pass", "fail"] },
    findings: { type: "array", items: { type: "string" } },
  },
};
```

Do not force final reader-facing prose through a schema.
