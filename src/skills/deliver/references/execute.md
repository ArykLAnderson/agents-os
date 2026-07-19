# Execute Through Runtime And Hands

The Marshal delegates bounded implementation to Hands and uses Workflow Runtime or available tools for execution mechanics. Deliver does not recreate scheduling, claims, retries, cancellation, journals, budgets, or resource state in Casebook files.

A Hand:

1. verifies its source/worktree and authorization boundary;
2. reads the accepted Contract and immediate consumer before changing code;
3. implements only the bounded responsibility;
4. runs seam-local checks and reads their actual output;
5. records exact changed-source and evidence locators;
6. reports limitations, unexpected facts, temporary effects, and cleanup state;
7. stops on authority, semantic, or materiality uncertainty.

Do not claim success from code existence, self-attestation, mocked crossed seams, source-only tests when generated/runtime evidence is required, or a command that was not run and read.

A failed Hand result remains source-system/Runtime evidence. The Marshal may assign a bounded local repair only when accepted behavior, Blueprint, Route, Leg, dependency, consumer, evidence, and cleanup assumptions remain unchanged.