# Current Status

Pipeline: `agent-manager` → `gigzman-architect` → manager approval →
`gigzman-coder` → `gigzman-verifier`. Work items and their task definitions live
under `work/CD-0N-*/`. Run order and kickoff prompts:
`docs/client-dashboard-prompts.md`. Design rationale:
`docs/client-dashboard-brief.md`.

---

## CD-00-build-pool-cap — COMPLETE (VERIFY_PASS)

**Tenants touched:** none. Build infrastructure only; no tenant content, route or
rendered output changed.

**What shipped:** `lib/db/index.ts` — the Postgres pool now uses `max: 3` during
Next's static-export phase (`process.env.NEXT_PHASE === "phase-production-build"`),
leaving the production runtime at 10 and development at 3. One file, 18 lines.

**Why:** `pnpm build` could not complete. 15 export workers × pool max 10 = up to
150 connections against 97 usable on `localhost` (`max_connections` 100 less 3
superuser-reserved). The export died with `FATAL 53300: sorry, too many clients
already`. The stated baseline of "`pnpm build` is green" was not true on this
machine.

**Evidence:** build exit 0, 9,659/9,659 static pages in 2.1 min, peak 61
connections. Verifier independently traced `NEXT_PHASE` through Next's own source
(`build/index.js` sets it before spawning workers; `lib/worker.js` spreads
`process.env` into each) and confirmed it is never set on the dev or start paths.
Artifacts: `work/CD-00-build-pool-cap/{coder-report,verifier-report}.md`,
`build-output.log`, `pg-activity-samples.log`.

**Known limitation — carried forward, not fixed.** The verifier's own back-to-back
build failed with Postgres `53200 out of memory` (not `53300`). Its sampler showed
the pool behaving correctly at peak 58 connections, so this is unrelated to the
fix: it is machine-level memory pressure — native Windows Postgres,
`shared_buffers=128MB`, 4.24 GB of 15.41 GB free during a second consecutive
15-worker build. **Consequence:** consecutive full builds are unreliable on this
machine. Run them with the machine otherwise idle, and treat `53200` as an
environment condition to retry, distinct from `53300`, which would be a CD-00
regression.

---

## CD-01-tenant-registry — COMPLETE (VERIFY_PASS)

**Tenants touched: all six.** Global tenant-resolution infrastructure. Every
tenant's resolution path changed; no tenant's output did — that asymmetry was the
acceptance bar.

**What shipped:** `clients.template_key varchar(60)` nullable (migration
`0006_cultured_mikhail_rasputin`, backfilled by `vertical`), replacing
`CLIENT_SLUG_TEMPLATE_MAP`. A synchronous validating accessor `templateKeyFor(row)`
took over 37 call sites in 34 files. `getTenantBySlug` gained an `isActive` 404
guard. `activeTenants()`'s projection widened to carry `vertical`/`templateKey`.
Two false comments rewritten. Seed path and docs corrected.

**Evidence (verifier re-derived it independently, did not accept the artifacts):**
build green first attempt, `9659/9659` in 103s; per-tenant prerendered counts
identical before and after by **both** derivation methods —

```
arora-k-associates 42 · evergreen-real-estate 546 · expert-realtors 547
high-properties 5005 · nayra-realtors 1071 · urban-flat-real-estate 1071
```

The silent-failure mode was ruled out **on disk**, not from a green build:
`builders/*` 134 and `sectors/*` 176 pages exist. `proxy.ts` byte-identical
(`fdfccc96085a1509…`). AC 6 and AC 7 re-run across five stop / `rm -rf .next` /
SQL / restart cycles on `urban-flat-real-estate`; `high-properties` never mutated.

**One intentional behaviour change**, under Amendment 1 — and it fixed a live
defect rather than a hypothetical one. `templateKeyFor`, `isTemplateUrlSlug` and
`getTemplateKeyForUrlSlug` all used `key in obj` or a bare index on a plain
object, so `Object.prototype` members passed as valid. Before the fix,
`/realestate/constructor/high-properties` returned **200 and rendered a live
client's site with the correct palette**; `getTemplateKeyForUrlSlug` returned
`Object`'s constructor *function* from an accessor typed `TemplateKey | undefined`.
All three now use `Object.hasOwn`; those URLs 307 to `/`. No legitimate URL changed.

**Scope ruled in beyond the task's items 1–6:** `clients/*/profile.yaml`,
`scripts/seed-client.ts`, `AGENTS.md`, `README.md` — without them, deleting the
map would have turned `pnpm seed:client`, the only supported tenant-creation
path, into one that silently produces 404ing tenants.

**Known limitations carried to CD-03, not fixed here:**

1. `getTenant()` does not enforce `isActive`. A deactivated tenant's staff
   holding a live `gz_session` can still reach Server Actions — writes are not
   stopped even though nothing renders.
2. No cache tag on `lookupClientBySlug`: deactivation lags ~10 minutes (the 300s
   data cache compounding with the layout's `revalidate = 300`). CD-03's Active
   switch needs one.
3. `/cafirm/<realestate-slug>` returns 200, not 404 — `getTenantBySlug` never
   inspects the URL's vertical segment. Pre-existing duplicate-URL class;
   canonicals self-correct.

---

## CD-02-feature-flags — COMPLETE (VERIFY_PASS)

**Tenants touched:** the five `realestate` tenants. `arora-k-associates` keeps
`features = '{}'`. The refactor itself is global — six shared files, one of them
the layout every tenant renders through.

**What shipped:** `clients.features` jsonb `NOT NULL DEFAULT '{}'` (migration
`0007`, backfilled to reproduce the five old `Set<string>` allowlists exactly).
New `lib/features.ts` owns `ClientFeatures`, `FEATURE_DEFAULTS` and the single
synchronous validating accessor `featureEnabled(host, key)`. The five named
helpers keep their names, files and **synchronous** signatures — only the
parameter changed from a slug to the tenant row. `StaticParamTenant` widened a
second time. `FooterV2` (a Client Component) now takes a boolean prop.

**Why the type shape matters:** `FeatureHost.features` is **required, not
optional**. Optional, an un-widened `StaticParamTenant` satisfies it structurally
and the two home-loan `generateStaticParams` gates compile into silence,
prerendering zero pages while the build reports success. Because the helper
*names* did not change, the argument type is the only thing that makes
`pnpm build` a checklist. **Do not relax it.**

**Evidence:** the deliberate mid-sequence build produced exactly **22 errors at
exactly the 22 predicted sites**, all `TS2345`, including both home-loan gates —
direct proof the trap was closed rather than compiled away. The verifier
re-derived everything independently: per-tenant counts identical
(`42/546/547/5005/1071/1071`), `home-loan=524` on exactly the three DSA tenants,
`vastu-gurugram=3699` on `high-properties` only, all six sitemap families
set-matching, and `featureEnabled` fail-safe against 10 junk shapes including a
genuine prototype-inherited key — which would return `homeLoan=true` under a bare
index read, so the `Object.hasOwn` guard is load-bearing.

**Two rework cycles**, both about accuracy rather than mechanism: the first fixed
a seed-validation hole (a `realestate` profile with no `template:` seeded
successfully then 404'd every page) and narrowed an `isActive` comment that
claimed coverage the code lacks; the second deleted two false claims this
increment had introduced into `lib/premium-v2/home-sections.ts`.

**Manager edit, recorded for honesty:** after VERIFY_PASS I deleted four comment
lines from `lib/vastu/enabled.ts` myself. My §11 correction (below) landed *after*
the coder wrote a paragraph quoting §11's old wording, leaving the comment
citing text the document no longer contains. The verifier recorded it
non-blocking and pre-specified the exact deletion; doing it was cheaper than a
third cycle. Verified by reading — the line above already carried the correct
non-ordinal wording.

**Governing-document correction.** `docs/client-dashboard-brief.md` §11 and the
CD-03 hard-cap paragraph said "a 4th tenant" for `vastuSectors`, written when
three tenants carried the matrix. **Exactly one does.** As worded it implied the
2nd and 3rd were unrestricted. Both now read as "any tenant beyond those that
already have it": the Server Action refuses at four, a human decides at two and
three, because the 32-minute figure was measured on a smaller site.

---

## Content status — NOT deliverable

**A `VERIFY_PASS` is not a delivery.** Neither CD-00 nor CD-01 touched content;
these predate both and block hand-over.

`pnpm check:content high-properties` — **a live client on its own domain**:

```
PENDING (3)      firm.firm_registration_number
                 analytics.search_console_verification
                 notification_email
PLACEHOLDER (3)  content/legal.yaml     (whole file)
                 content/localities.yaml (whole file)
                 content/updates.yaml    (whole file)
```

Three whole files of example content are live. `notification_email` empty means
enquiries have nowhere to be sent. `arora-k-associates`: 11 placeholder, 9
pending.

Fix before any hand-over, and re-run `pnpm check:content <slug>` per tenant.

## Standing findings (not defects introduced here)

- **`lib/domains.ts:51` carries the third instance of the prototype-chain defect
  Amendment 1 closed.** `HOST_TENANT_MAP[clean]` is a bare index on a plain
  object and `clean` is only lowercased, so `Host: constructor` returns the
  `Object` **function** from `tenantSlugForHost()`, typed `string | null`. Worse,
  `??` catches only null/undefined — so that request also **skips** the
  `PRIMARY_HOST_TENANT` fallback every other unmapped host receives. Verified
  directly. Host-mode only, fails closed downstream, and correctly outside CD-01
  (where `lib/domains.ts` was comment-only). **CD-03 should close it** —
  Amendment 1's reasoning applies verbatim, and CD-03 already owns
  `clients.customDomain`.
- **`sitemapClients()` has no `ORDER BY`.** Tenant ordering follows physical heap
  order, so any write to `clients` reshuffles sitemap output. URL *sets* are
  byte-identical; ordering is not stable. This actively weakened CD-01's own
  evidence — a `.orderBy(clients.slug)` would make sitemap diffs meaningful.
- **`/cafirm/<realestate-slug>` and `.../properties` return 200, not 404.** The
  gate fires and renders the not-found body, but `properties/loading.tsx` opens a
  Suspense boundary that flushes the shell with 200 first — a soft 404, an
  indexing liability. Pre-existing.

- `pnpm dry-run` is stale — references removed templates. Fails for unrelated
  reasons; not a regression.
- `properties/loading.tsx` calls `getTenant()` (i.e. `headers()`) inside a
  `(public)` route. Pre-existing; deliberately out of scope for CD-01.
- `clients.custom_domain` is NULL for all six rows including `high-properties`.
  **Not** a live SEO defect — `lib/sitemap.ts prefixFor()` short-circuits on host
  mode before reading it, and `lib/og.ts originFor()` documents the same choice
  deliberately. The comment in `lib/domains.ts` claiming the two are "kept in
  step" is wrong and is being corrected by CD-01.
- The entire project section of `AGENTS.md`, and an 11-line change in
  `app/layout.tsx`, are **uncommitted** in the working tree.
