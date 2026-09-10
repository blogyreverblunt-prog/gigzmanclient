# Client Dashboard — Agent Prompts

Paste-ready prompts for the `agent-manager` → `gigzman-architect` →
`gigzman-coder` → `gigzman-verifier` pipeline.

The design rationale, landmines and field inventory live in
[`docs/client-dashboard-brief.md`](./client-dashboard-brief.md). The prompts below
do **not** repeat it — each task file points the agents at the relevant section.

---

## How this works

`agent-manager` refuses to start a work item without a complete
`work/<TASK>/task.md` naming the affected tenants, the vertical, the expected
user-visible outcome, and whether the change is global or per-client gated. Those
files are written — one per increment, under `work/CD-0N-*/`.

Each increment runs the full pipeline and produces, in its own work directory:

```
task.md              ← written already
manager-analysis.md  ← agent-manager, stage 1
architecture-plan.md ← gigzman-architect, stage 2 (needs ## Manager Approval → APPROVED)
coder-report.md      ← gigzman-coder, stage 4
verifier-report.md   ← gigzman-verifier, stage 5 → VERIFY_PASS
```

**One work item at a time.** The manager is defined to orchestrate exactly one.

---

## Run order

| # | Task | Depends on | Why the order |
|---|---|---|---|
| 0 | `CD-00-build-pool-cap` | — | ✅ **done** — added mid-flight; `pnpm build` could not complete |
| 1 | `CD-01-tenant-registry` | — | ✅ **done** — nothing can create a client until template assignment leaves code |
| 2 | `CD-02-feature-flags` | CD-01 | ✅ **done** — wide sync-call-site refactor, before UI depends on it |
| 3 | `CD-03a-dashboard-list-edit` | CD-01, CD-02 | List + edit existing clients, toggles, the revalidation tag |
| 4 | `CD-03b-create-wizard` | CD-03a | The wizard — what makes onboarding developer-free |
| 5 | `CD-09-yaml-db-truth` | CD-03b | The moment dashboard edits exist, `seed --force` can destroy them |
| 6 | `CD-04-gbp-autofill` | CD-03b | ┐ |
| 7 | `CD-05-brand-assets` | CD-03b | ├ independent of each other |
| 8 | `CD-06-seo-readiness` | CD-03b | ┘ |
| 9 | `CD-07-hero-copy` | CD-03b | |
| 10 | `CD-08-content-screens` | CD-03b | Last — largest surface, least risk |

**CD-03 was split** after review: as specced it was ~3× the size of anything
verified here, and both CD-01 and CD-02 needed rework cycles at roughly a third
of that. See `work/CD-03-platform-dashboard/task.md.SUPERSEDED`.

CD-04, CD-05 and CD-06 touch different modules and may run concurrently once
CD-03 has landed. Everything else is sequential.

---

## The kickoff prompt

Paste this to `agent-manager`, substituting the task id:

```
Orchestrate work item CD-01-tenant-registry for gigzman-client-sites.

Work directory: D:\PROJECTS\gigzmanclient\work\CD-01-tenant-registry\
Task definition: D:\PROJECTS\gigzmanclient\work\CD-01-tenant-registry\task.md
Repo root:      D:\PROJECTS\gigzmanclient\
Workflow rules: D:\PROJECTS\gigzmanclient\AGENTS.md
Design brief:   D:\PROJECTS\gigzmanclient\docs\client-dashboard-brief.md

Run the full pipeline: manager analysis → architect → your approval gate →
coder → /code-review high → verifier. Do not begin implementation before the
architecture plan reads APPROVED. Do not start any other CD-0N work item.

Baseline before you touch anything: `pnpm build` is green, six tenants exist
(high-properties, evergreen-real-estate, nayra-realtors, urban-flat-real-estate,
expert-realtors on realestate; arora-k-associates on cafirm). There is no test
suite — `pnpm build` is the typecheck. `pnpm dry-run` is stale and fails for
unrelated reasons; do not report it as a regression.

Escalate to me rather than deciding alone on anything listed in §11 of the
design brief.
```

For the remaining items, change the three paths and the task id. Nothing else
in the prompt varies.

---

## Briefing rules to restate when the manager delegates

The manager's own definition already covers these; they are listed here so you
can check its briefs are doing the job. A brief that omits them costs turns.

- **Absolute Windows paths.** The role docs assume a different working directory.
- **The exact file list** the increment touches, so the agent does no discovery.
- **The regression bar** — which tenants render 200 today, current
  `pnpm check:content` output.
- **The artifact filename** — `coder-report.md`, `verifier-report.md`, exactly.
- **No test suite exists.** No agent may report "tests pass".
- **Turn economy** — batch independent reads, read a file once, `pnpm build` at
  most twice.
- **Model tiering** — judgement gates on Opus, mechanical work on Sonnet.

---

## Between increments

After each `VERIFY_PASS`, before starting the next:

1. Confirm `current-status.md` was updated and names the tenants touched.
2. Spot-check one claim from the verifier report yourself. The manager's own
   rule is "never trust status without checking important claims against code",
   and it applies to the manager too.
3. Check whether any affected tenant still carries `placeholder` content —
   a passing verification does not make a site deliverable.

**Maximum one rework cycle per increment.** A second failed cycle means the
requirement or the architecture is wrong, not the code. That is a decision for
you, not another loop.
