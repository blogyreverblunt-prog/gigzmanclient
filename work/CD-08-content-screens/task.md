# CD-08 — Vertical-scoped dashboard screens; team members and office locations

## Work Item

Two content types have no dashboard screen at all — they can only be seeded from
YAML. Add them, and make every dashboard screen consistently scoped to the
client's vertical, driven by `lib/verticals/` rather than by ad-hoc conditionals.

## Affected Tenants

All six. Team members and office locations exist for both verticals; the vertical
scoping decides which screens each tenant's dashboard shows.

## Vertical

Both, and the distinction between them is the substance of this work item.

## Global or Per-Client Gated

Global to the dashboard. No public template code changes, though the rendered
team and office sections on public pages must keep working from the same rows.

## Expected User-Visible Outcome

A client dashboard shows exactly the screens relevant to that client's vertical.
Team members and office locations become editable. Nothing offers a CA firm a
Properties screen, or a real-estate agency a Compliance Calendar.

## Current State

- `lib/verticals/` (`cafirm.ts`, `realestate.ts`, `types.ts`) already holds `nav`,
  `footer`, `dashboardNav`, `sitemapPaths`, `serviceCategories`,
  `calculatorKeys` and `defaults` per vertical, resolved by
  `getVerticalConfig(vertical)`. `DashboardChrome` already reads `dashboardNav`.
- Existing managers under `components/dashboard/`: `PropertiesManager`,
  `LocalitiesManager`, `UpdatesManager`, `ComplianceManager`,
  `CalculatorManager`, `QueryWorkspace`, `ServiceToggles`, `SettingsForm`.
- **No screen exists** for `team_members` or `office_locations`. Both are seeded
  from `profile.yaml` only.
- `services.category` is a `varchar` validated at the application layer,
  deliberately not a `pgEnum`, because the valid set differs per vertical — the
  schema comment says so.
- `teamEnabled` is a `firm_settings` toggle already controlling the public team
  section.

## Required Changes

1. **Team members screen.** Name, designation, qualifications, membership number,
   bio, photo, sort order, active. Reuse the CD-05 upload path for the photo;
   do not invent a second one.
2. **Office locations screen.** Label, address line, locality, region, postal
   code, phone, primary flag, sort order. Exactly one primary per client —
   enforced in the action.
3. **Vertical scoping.** Drive screen availability from
   `getVerticalConfig(client.vertical)`:

   | Screen | Vertical |
   |---|---|
   | Settings, Services, Updates, Legal, Team, Offices, Queries | both |
   | Properties (+ images), Localities | realestate |
   | Compliance calendar, Calculators | cafirm |

   A screen for the wrong vertical must not merely be hidden from nav — **its
   Server Actions must refuse**, because an action is a reachable POST endpoint.
4. **Service categories** render as a select fed from
   `getVerticalConfig(...).serviceCategories`, validated again in the action.
5. **Vertical is locked after creation.** Content tables are vertical-specific; a
   CA firm switched to real estate has compliance events and no properties.
   Enforce in the action (CD-03 covers the platform-side form; this covers the
   data rule wherever else it is reachable).

## Acceptance Criteria

1. Team members can be created, edited, reordered, deactivated and deleted from
   the dashboard, and the public team section reflects each change.
2. Office locations likewise, and exactly one can be primary — setting a second
   demotes the first, in one transaction.
3. A real-estate tenant's dashboard shows Properties and Localities and does not
   show Compliance or Calculators; a `cafirm` tenant is the mirror image.
4. Calling a wrong-vertical Server Action directly is refused. Proven by a direct
   POST for at least two actions in each direction — not by a hidden nav item.
5. Every new action re-checks `requireUser` / `requireAdmin` and asserts ownership
   of the row's `clientId`. No action trusts a `clientId` or row id from
   `FormData`.
6. Service category options match the client's vertical, and an out-of-vertical
   category is refused by the action.
7. Changing a client's vertical after creation is refused wherever reachable.
8. `teamEnabled: false` still hides the public team section regardless of rows
   present.
9. Photo upload for a team member uses the same storage and validation path as
   CD-05 — type and size checked server-side, filename never trusted.
10. `pnpm build` green; no public route became dynamic; prerendered counts
    unchanged for all six tenants.

## Evidence Required

- **Tenant isolation:** for at least two new actions, attempt to edit a row
  belonging to another client and show the refusal. This is the highest-severity
  defect class here — an unscoped write publishes one client's business
  information on another client's public site.
- **AC 4:** the direct POSTs, in both directions, with the refusals.
- **AC 2:** the primary-office transition, showing both rows before and after.
- **Public reflection:** a team member and an office added through the dashboard,
  shown rendered on the public site.
- **AC 3:** the dashboard nav for one tenant of each vertical.
- **Build:** `pnpm build` with the prerender summary.

## Non-Goals

- Redesigning existing managers.
- Bulk import from a spreadsheet.
- A third vertical.
- Changing the public team or office section layouts.
- Editing `services.category` values themselves — the sets in `lib/verticals/`
  stay as they are.

## Constraints

- **Never invent client facts.** Team members, designations, qualifications and
  membership numbers are real people's credentials. Empty beats guessed, and a
  membership number in particular is a regulated claim.
- ICAI: nothing on a `cafirm` tenant may present a team member as an endorsement
  or testimonial.
- Reuse the existing manager patterns in `components/dashboard/` rather than
  introducing a parallel idiom next to a working one.
- `revalidatePath` for every mutation, or the public page keeps serving the old
  rows for the length of the cache window.

## Reference

`docs/client-dashboard-brief.md` §8, §9, §11.
