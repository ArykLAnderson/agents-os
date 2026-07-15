# Author Review Queue

### ARI-001: Capacity evidence conflicts with the accepted retry limit

- **State:** needs-author
- **Materiality:** blocking
- **Trigger:** later evidence
- **Question:** Should the current migration policy change from three to four retries now that validation supports four and rejects five?
- **Why it matters:** The pinned RFC currently tells reviewers that three retries is current policy; continuing with that claim would conceal a material operational decision.
- **Recommendation:** Adopt four retries for the migration and preserve the three-retry decision as superseded.
- **Proposed changes:** OBS-003 new; DEC-002 new; DEC-001 superseded; GAP-001 resolved
- **Affected entries:** DEC-001, ALT-001, GAP-001
- **Affected artifacts:** notification-rfc/artifact.md / AU-001
- **Evidence:** SRC-004 / full result
- **Safe default:** halt RFC reader-facing use and retain SNAP-001 as historical support until the author decides.
- **Disposition:** immediate interrupt
