---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

## Model-Specific Slop Avoidance

Different coding models tend to fall into different design ruts. Actively check for these before writing or finalizing frontend code.

### Avoid common GPT/Codex design ruts

- **Box soup**: stacking rounded rectangles/cards/panels around every element. Remove unnecessary boxes; let typography, spacing, blur, and hierarchy do the work.
- **Dashboard disease**: adding stats cards, badges, chips, sidebars, filter pills, fake metrics, or extra controls the user did not ask for.
- **Over-labeled UI**: explanatory headings, helper text, status labels, and keyboard hints everywhere. Prefer quiet affordances unless clarity truly requires copy.
- **Flat admin-template composition**: centered max-width container, header, card grid, generic form rows, and predictable empty states. Build a composition specific to the product surface.
- **Token-name cosplay**: declaring many CSS variables while still producing generic spacing, colors, and components. Tokens must encode a real visual system.
- **Tailwind-default feel**: default radii, default shadows, default blue/purple accents, standard card hover lift, and undifferentiated gray text stacks.
- **Fake premium clutter**: glassmorphism everywhere, heavy glows, neon gradients, bokeh blobs, and grain overlays piled together without restraint.
- **Inert pretty surfaces**: controls that look polished but do not respond, rows that cannot be navigated, animations that do not clarify state.

### Avoid common Claude design ruts

- **Purple-gradient slop**: lavender/cyan/pink gradients on white or dark surfaces without context.
- **Over-art-directed hero syndrome**: beautiful but irrelevant decorative objects, or a memorable visual motif that overwhelms the actual task.
- **Font novelty for its own sake**: distinctive type choices that reduce legibility or clash with a utility app.
- **Maximalist mismatch**: elaborate motion and texture on a surface that should feel calm, fast, and system-like.

### Taste checks before finalizing

- Remove at least one unnecessary container, border, label, or decorative element before shipping a UI polish pass.
- Ask: “Could this screenshot belong to any random AI-generated SaaS dashboard?” If yes, change the composition or reduce the generic structures.
- Ask: “Is the signature move serving the user’s task?” If not, delete it.
- Prefer one excellent visual idea over many mediocre effects.
- For small utility UI, default to refined minimalism: fewer boxes, stronger hierarchy, better spacing, subtle material, precise motion.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
