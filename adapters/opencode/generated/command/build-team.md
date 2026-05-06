<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Execute an implementation plan using Pi subagents with iterative builder-validator feedback.

## Instructions

1. **Read the plan file**: `$ARGUMENTS`
   - If no argument is provided, look for plans in `_plans/` at the bare repo root. List available plans and ask which to execute.

2. **Read project context**: Look for `AGENTS.md`, `CONTEXT.md`, or `README.md` to understand project conventions. Check `.agents-os/src/docs/` for project-specific context if present.

3. **Decompose the plan**:
   - Identify implementation steps, dependencies, acceptance criteria, and validation requirements.
   - Keep one parent-owned checklist in the conversation. Do not create AgentOS teams/tasks; Pi does not provide that runtime.
   - Execute dependent steps sequentially. Execute independent steps in parallel only when file ownership is disjoint.

4. **Implementation pass**:
   - Use `subagent({ agent: "builder", ... })` for one implementation step at a time, or `subagent({ tasks: [...] })` for independent steps.
   - Give each builder a compact contract: scope, owned files/modules, acceptance criteria, validation commands, and stop rules.
   - Tell builders they are not alone in the codebase and must not revert unrelated edits.

   Example:

   ```typescript
   subagent({
     tasks: [
       {
         agent: "builder",
         task: `Implement step: <step>

Owned files/modules: <paths>
Acceptance criteria: <criteria>
Validation: <commands>
Constraints: preserve unrelated work; escalate unapproved product or architecture decisions.`
       }
     ],
     context: "fork"
   })
   ```

5. **Validation pass**:
   - After implementation, run `validator` with fresh context.
   - The validator is read-only. It should inspect changed files, check acceptance criteria, and run appropriate validation.
   - If validation fails, synthesize concrete fix tasks and send them back to `builder`. Limit to three validation rounds.

   ```typescript
   subagent({
     agent: "validator",
     task: `Validate the implementation against this plan:

<plan summary>

Changed files: <files>
Acceptance criteria: <criteria>
Run or recommend validation. Report PASS or FAIL with file/line-specific findings.`,
     context: "fresh"
   })
   ```

6. **Conditional reviewers**:
   - Always run `architecture-reviewer` and `code-quality-reviewer` after validation passes.
   - Run `security-reviewer` if changes touch auth, authorization, user input, API endpoints, environment config, crypto, or session management.
   - Run `performance-reviewer` if changes touch database queries, API routes, algorithmic loops, rendering logic, or caching.
   - Use `subagent({ tasks: [...] , context: "fresh" })` to run applicable reviewers in parallel.

7. **Apply fixes**:
   - Parent synthesizes reviewer findings.
   - Send concrete fix work back to `builder` only for findings worth addressing now.
   - Re-run targeted validation after fixes.

8. **Doc sync**:
   - If behavior, API contracts, schemas, architecture, or operational docs changed, invoke the `doc-sync` skill.

9. **Completion report**:
   - Summarize implementation steps, validation rounds, checks run, review findings, documentation updates, and any unresolved decisions or risks.
