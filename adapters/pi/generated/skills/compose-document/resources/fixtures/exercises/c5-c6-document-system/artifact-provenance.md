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
| `rendered/c6-full-desktop-1440x1000.png` | `1d6bb84b9349cbe5ce1ecaeb57ae740f1ab4032c0edcb815332a9ecab3dc58d4` |
| `rendered/c6-full-narrow-390x844.png` | `1f80cd4fda4190be20a262a2c3291fa73005463d4f84dddca1ba39781346deb0` |

## Directional Layout Revision

The presentation-only revision replaces independent grid arrow cells with grouped flex paths for lifecycle, skill hierarchy, and safe publishing. This does not change accepted Case meaning. The revised HTML was captured at `2026-07-15T08:48:20Z`; it has SHA-256 `652b74bff1d106b23b038d08d9bd32a760836d526a5e50ff484ac79bb2ce03eb`.

| Screenshot | SHA-256 |
|---|---|
| `rendered/c6-full-desktop-1440x1000.png` | `c650eda1221423a24c56c3c8f8519277368c3067d389c470e4e99ab5ec93f5f0` |
| `rendered/c6-full-narrow-390x844.png` | `23f3d51906eb226e9cfde671093a9c7171c25b3884224b25c2722b97a7a543a1` |

`presentation-evidence.md#directional-path-closure` records the exact desktop and narrow path-step/connector results. The old full-page digests remain historical evidence for the pre-layout-closure representation.

## Reconciliation-Return Revision

The skill-hierarchy forward path now ends at `format/publish`; a separate visible return band explicitly connects a proposed meaning change from downstream work back to the initial `case-reconcile` node. This corrects presentation topology without changing accepted meaning. The revised HTML was captured at `2026-07-15T08:51:30Z`; it has SHA-256 `fd0e99274d3d7e14c36c21f4259509fab45e6b96bee5b0999cf40eb06224bccc`.

| Screenshot | SHA-256 |
|---|---|
| `rendered/c6-full-desktop-1440x1000.png` | `a57fbff69380f4b8b3e62ab5335895ddd8b66b76f29f1bb94ff72c871c077121` |
| `rendered/c6-full-narrow-390x844.png` | `6b7ed9e30b0eb6ad7e1230bfa0d246c71b8ef68636fb1602a6741a5138d35419` |

`presentation-evidence.md#reconciliation-return-closure` records the desktop and narrow return-band relationship checks. Earlier full-page digests remain historical evidence for the preceding layout representations.

The full-page captures were taken on `2026-07-15T08:44:12Z` from the same HTML digest and browser/file URL above. They visibly cover all six diagrams and their adjacent text equivalents at desktop and narrow viewports; `presentation-evidence.md#full-page-closure` records the command sequences and measured results.

## Finding Coverage

See `finding-to-evidence.md` for the accepted-ID-to-artifact mapping. Its paths are evidence locators; the semantic artifact and screenshot digests above provide the immutable content identifiers.
