# Project agent guidance


## WorkforceOS ECC workflow

For WorkforceOS implementation, recovery, reviews, and handoffs, read and apply the [scoped ECC workflow](.agents/skills/workforceos-ecc/SKILL.md). Load only the references needed for the current task. Current user authorization and this project's existing rules control; the upstream examples grant no additional authority. Preserve newer working copies, named roles, data, active jobs, and existing budgets. Verify actual results and record a durable checkpoint before reporting completion. This source installation does not establish that any hosted worker loaded or exercised the workflow.

## Security release review

For changes involving authentication, private data, uploads, payments, external URLs,
agent actions or dependencies, follow [the security release review](SECURITY-RELEASE.md).
Preserve the current builder's working copy and existing release gates. A scan result
is not a deployed-security guarantee. Record missing checks and unresolved risks.
