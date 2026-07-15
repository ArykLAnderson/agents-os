# Artifact Provenance

## Model

This is the evidence pass after semantic commit `cfb30783fdca124dcd41e67b9c073eab4d447fbf` (`fix(document-system): pin artifact semantics`). That commit finalized the semantic artifacts, trace sidecars, and review records. This file is intentionally created later so it can name that prior commit and SHA-256 digest each inspected artifact without a self-referential commit claim.

The digests below are SHA-256 of the exact working-tree files inherited unchanged from `cfb3078`. The evidence commit adds this provenance record and does not alter those inspected artifacts. Regenerated adapter copies are checked separately by `agents-os doctor`; they are not a second source of semantic provenance.

## Semantic Artifacts

| Artifact | Semantic commit | SHA-256 |
|---|---|---|
| `c2-prd.md` | `cfb3078` | `1df35b6764a63b2910b96ba487b1727d7e8eedc1039179feb9a483dba9938f66` |
| `c3-change-brief.md` | `cfb3078` | `c7d5de1277c656ad12fe4801abea4c9e8a4357e963178d7f0940c0b8b196e506` |
| `c5-implementation-report.md` | `cfb3078` | `f7646ca557f5ffcad9aa72924ab17b4df23f46e02264bc0a5bb2fbbfab033972` |
| `c6-explanation.md` | `cfb3078` | `85925a04a24f070d93fa12e2069ba84478be76b4adf02be21156b6c65f85e814` |
| `c6-explanation.html` | `cfb3078` | `963943c8ace8a5b01840efffd31cc2fde6eef7e3cf80c4b6e8a662336e39ddef` |

## Trace And Review Inputs

| Artifact | Semantic commit | SHA-256 |
|---|---|---|
| `c2-prd.trace.md` | `cfb3078` | `b2edc9414c304617c7492dfdf6753d9dee9db84692a342c975b246871c9d6136` |
| `c3-change-brief.trace.md` | `cfb3078` | `3722b50d3b63afd4e1d584e4b9730204d303799bd42cb2e5b49eea2665a9aff7` |
| `c5-implementation-report.trace.md` | `cfb3078` | `600e99ad25e8f27510cefa9480962e0a9ea855afc63ed40086c589c98dd75808` |
| `c6-explanation.trace.md` | `cfb3078` | `de7e2867fd03a6e8a2268371466f1f3d766a39088b736a15d708c4dfbb8b5047` |

The C2, C3, and C5 fidelity/genre records and the C6 staged review were created in the same semantic commit. Their scope is stated in each review file; this evidence pass does not retroactively claim that the semantic commit knew its own SHA.

## Rendered Evidence

- **File URL:** `file:///Users/mont/agents-os-document-system-k1-exercise-05/src/skills/compose-document/resources/fixtures/exercises/c5-c6-document-system/c6-explanation.html`
- **HTML inspected:** the `c6-explanation.html` digest above.
- **Browser:** `agent-browser 0.31.1` launching local Chromium.
- **Date:** `2026-07-15T08:40:41Z`.
- **Desktop command sequence:** open file URL; set viewport `1440 1000`; capture `rendered/c6-desktop-1440x1000.png`; evaluate viewport, scroll widths, overflow, figure/equivalent count, and six diagram IDs; inspect browser errors.
- **Desktop output:** `viewport:[1440,1000]`, `scroll:[1440,1440]`, `overflow:false`, `figures:6`, `equivalents:6`, all diagram IDs `true`, no browser errors.
- **Narrow command sequence:** set viewport `390 844`; capture `rendered/c6-narrow-390x844.png`; evaluate viewport, scroll widths, overflow, figure/equivalent count, and flow columns; inspect browser errors.
- **Narrow output:** `viewport:[390,844]`, `scroll:[390,390]`, `overflow:false`, `figures:6`, `equivalents:6`, `flowColumns:"324px"`, no browser errors.

| Screenshot | SHA-256 |
|---|---|
| `rendered/c6-desktop-1440x1000.png` | `fa281ca61e85c3700f872dc5820a7d2fc3c82a498a0d1fe20024af70aca688f0` |
| `rendered/c6-narrow-390x844.png` | `9695ebf5004fddf795186576e42b6a9dd0dfa32d4d99056721a48cad9dc40f5a` |

## Finding Coverage

See `finding-to-evidence.md` for the accepted-ID-to-artifact mapping. Its paths are evidence locators; the semantic artifact and screenshot digests above provide the immutable content identifiers.
