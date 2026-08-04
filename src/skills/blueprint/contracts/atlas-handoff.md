# Atlas handoff

Atlas is the durable version of the accepted current delivery plan. Blueprint may draft the plan to test routeability, but the draft is not authoritative and must name unresolved blockers.

## Publication gate

Publish only after:

- the Production Design RFC is accepted;
- a trusted human accepts the exact complete Map candidate;
- the candidate identifies its RFC/Blueprint revision and any predecessor it supersedes; and
- `.casebook/atlas-method.md` selects a publication guide and destination that can represent the plan.

At publication, load `../../feature-atlas/SKILL.md` and follow its publication-guide setup. Follow the selected guide with ordinary tools; no separate Publisher executable is required.

Publish the accepted plan faithfully and reread it. If safe publication is not possible with the selected guide and available tools, return `capability_unproven`. Do not create a helper publisher, adapter framework, manifest, transaction protocol, or parallel task plan as a fallback.

## Required meaning

The accepted Map supplies:

- exact RFC/Blueprint and acceptance bindings;
- scope, exclusions, and limitations;
- Features, Work Items, owners, and immediate consumers;
- direct prerequisites and convergence order;
- proof responsibilities, compatibility, cleanup, and invalidators; and
- authoritative source links.

Every Work Item belongs to one Feature; a Feature-local stage is optional. Atlas records delivery planning; it does not accept architecture, invent missing contracts, dispatch implementation, or grant implementation/deployment authority.

## Change

Implementation evidence may update linked facts without changing the accepted plan. A material delivery-plan change requires a newly accepted Map. A design or boundary conflict returns to Blueprint or Frame. Never edit Atlas merely to make implementation appear conformant.

The publication report names the destination, current Map Decision, records changed, and reread result, then returns the typed `HandoffReady | HandoffWithLimitations | HandoffRefusal` defined by Feature Atlas. It proves publication, not semantic acceptance or implementation authority.
