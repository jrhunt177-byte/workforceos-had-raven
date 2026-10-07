# Security release review

Authorized by John Hunt on 2026-10-06 for the existing website and application portfolio.
This extends the current ECC workflow and preserves existing owners, active work, access, data and budgets.

## Every security-sensitive release
1. Record current source commit, deployed version, active work and rollback checkpoint. Reconcile the current builder's working copy before merging.
2. Map changed inputs, sensitive data, authentication, per-record authorization, outbound requests, uploads, webhooks, agent actions and paid operations. Mark nonapplicable boundaries explicitly.
3. Run the offline tracked-file baseline: `python3 scripts/security-baseline.py`. It checks selected credential signatures and sensitive filenames in tracked files; it is not a comprehensive secret scan.
4. Run the project's existing dependency audit against its unchanged lockfile where available. Record findings and network/tool failures honestly; never auto-upgrade or use force fixes.
5. Reproduce material findings using local fixtures, mock providers and an isolated environment without production credentials or customer records. Keep evidence separate from speculation.
6. Make the smallest fix and add a regression case for the demonstrated failure; rerun existing affected-feature tests and required builds.
7. Review the diff, check preserved functionality and record actual reviewer identity. Developer self-review is not independent acceptance.
8. Record deployed source, executed tests, outstanding findings, owner and rollback method. Source checks do not prove deployed protection.

## Security requirements
- Enforce authentication and ownership on the server for private reads and writes; keep intentionally public intake public.
- Bound request bytes while streaming, file types, media duration, subprocess time, concurrent work and billable usage. Document whether limits survive multiple workers and restarts.
- Restrict outbound targets and redirects; protect internal/private network destinations. Treat downloaded content and model output as untrusted data.
- Keep credentials server-side and out of exports/logs. Do not rotate them without authorization.
- Verify webhook signatures, timestamps and duplicate handling. Never infer payment or worker completion from browser input.
- Return private data without shared caching and keep logs free of credentials and customer content.
- Preserve backup, recovery, paper-only trading and existing manual approval boundaries.

## Mantis / agent-assisted review
Google Mantis is an optional inspection tool, not an always-on firewall or security certification.
Use selected review stages only after inspecting the pinned upstream version and permissions.
Never run an autonomous exploit/patch harness in a production-connected workspace.
No blanket installer, paid model loop, new service, credential exposure or production attack traffic is authorized by this document.

## Coverage and enforcement
The proposed GitHub workflow checks only tracked credential filenames and selected secret signatures.
It does not test authorization, dependencies, commit history, business logic, platform configuration or deployed behavior.
A passing check is not a complete security review. Required-check branch protection must be verified and configured through authorized repository administration separately.
Do not claim the workflow is running or enforced until an actual run and repository settings establish that.
Report unavailable checks as NOT RUN and unresolved material risks as OPEN.
