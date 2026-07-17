# Structure

Arrange responsibilities, capabilities, authority, dependencies, and information so change remains coherent.

Ask:

- Where should each responsibility live?
- What must adjacent parts understand?
- Where does related knowledge change together?
- How do authority, information, and control flow?
- Which seams isolate complexity and enable verification?
- How can this structure fail, evolve, or be removed?

For software, prefer deep modules: simple interfaces that hide substantial decisions. Evaluate seams by locality, leverage, caller burden, testability, deletion cost, and whether speculative variation leaks into callers. Keep policy with the knowledge required to enforce it. Avoid applying software metaphors to organizational or product structures when they do not fit.

Structure completes when ownership and interfaces are coherent enough to explain expected change, authority, failure, and verification.
