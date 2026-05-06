# Council Templates

Reference file for the `/deliberate` skill. Each council is a preset combination of perspectives for a common decision type.

## Architecture Council

**When:** Design decisions, code structure, patterns, module boundaries, refactoring
**Keywords:** architecture, design, structure, pattern, refactor, module, boundary, "how should we build"
**Perspectives:**
- Pragmatist — simplest viable approach
- Systems Thinker — integration and coherence
- Adversary — failure modes and hidden costs

## Product Council

**When:** Feature scoping, user-facing changes, product direction, what to build vs. not build
**Keywords:** feature, scope, user, UX, product, customer, "should we build", priority
**Perspectives:**
- User Advocate — end-user needs and experience
- Pragmatist — what's buildable in the timeframe
- Adversary — risks and unintended consequences

## API/Interface Council

**When:** API design, public interfaces, contracts, schemas, protocols, SDK design
**Keywords:** API, interface, contract, schema, protocol, endpoint, SDK, "how should consumers use"
**Perspectives:**
- User Advocate — developer/consumer experience
- Systems Thinker — evolution, integration, backward compatibility
- Adversary — misuse, breaking changes, security surface

## Technology Council

**When:** Comparing specific tools, libraries, frameworks, or services
**Keywords:** "X vs Y", compare, evaluate, choose, select, library, framework, tool, "which should we use"
**Perspectives:**
- N advocates (ad-hoc roles, one per option being compared, max 3)
- Each argues FOR their assigned option and AGAINST the alternatives
- Not drawn from perspective agents — always ad-hoc with domain context in spawn prompt

## Risk Council

**When:** Security, compliance, migration, breaking changes, high-stakes decisions
**Keywords:** security, risk, compliance, migration, breaking change, data, privacy, regulation
**Perspectives:**
- Adversary — failure scenarios and worst-case analysis
- Systems Thinker — systemic risk and cascading effects
- Domain Expert (project-scoped if available, else ad-hoc with project context)

## Sustainability Council

**When:** Tech debt decisions, maintenance burden, legacy code, long-term viability
**Keywords:** tech debt, maintenance, legacy, rewrite, sustain, onboard, "should we rewrite"
**Perspectives:**
- Pragmatist — incremental improvement over big rewrites
- Systems Thinker — systemic health and coherence
- Maintainer (if available, else ad-hoc: "who's on call for this at 3am?")

---

## Selection Rules

1. **Match keywords** in the topic against council templates
2. **Check available agents** — glob `perspective-*.md` from both `~/.agents-os/src/agents/` and `.agents-os/src/agents/`
3. **Substitute** project-scoped stateful perspectives when they exist and fit better than a generic one
4. **Fall back** to ad-hoc roles in spawn prompts when no matching agent exists
5. **Announce** the selected council briefly — user can override before debate begins
6. **Default** to Architecture Council when no template clearly matches
