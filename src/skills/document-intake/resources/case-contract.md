# Case Contract

A Case is reusable subject context. It may support several document sessions and must not contain document-specific drafts, review mechanics, target representations, or publication records.

## Required Content

- Sources retain identity, a best-effort stable locator, and a short exact contextual quote when available. A missing locator is non-blocking when a useful quote or source note remains.
- Context entries classify their current authority as exactly `accepted`, `provisional`, `contested`, or `superseded`. Provenance records how an entry entered the Case and is separate from classification.
- Accepted context is settled enough for the current purpose. Provisional context needs confirmation before consequential use. Contested context preserves material disagreement. Superseded context remains available to explain the later accepted replacement.
- Explicit author decisions and corrections may be accepted. Tentative ideas and assistant suggestions remain provisional until confirmed or independently supported.
- Reader-facing citations prefer the strongest original source accessible to the intended audience. Local filesystem paths and private workspace locators are internal provenance only: never emit them as reader-facing references unless the intended audience can actually resolve them through a shared environment. When no audience-accessible source exists, paraphrase with an honest source limitation, use an approved accessible substitute, or omit the formal citation rather than presenting a useless local path. Do not expose private chat links or verbatim private material without authorization.

Store Cases under `<case-workspace>/cases/<case-id>/`. Store session artifacts separately under `<case-workspace>/documents/<document-id>/`.
