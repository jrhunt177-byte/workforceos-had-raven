# Continuity adaptation

Derived from ECC's longform guide, Context and Memory Management and Verification
Loops sections, at the commit recorded in upstream-manifest.json.

1. Read the existing checkpoint/work order. Verify its source and environment.
2. Save verified approaches, failed attempts, unfinished work, and next action at a
   logical milestone. Preserve the original budget, attempt ledger, and owner.
3. Record full source version, branch, unsaved changes, checks, limitations, and the
   recovery path. Distinguish observations from provider reports.
4. Use an existing approved durable record store. A temporary file or session note
   alone is not durable. Do not store operational data in source control.
5. Resume by checking current source and reconciling intervening changes. Never
   replace newer work with an older saved state.

Generic transcript extraction, learned-instinct injection, global memory folders,
automatic deletion/retention, and model-based summaries are not enabled by this
adaptation. Host-specific persistence must be reviewed and tested before activation.
