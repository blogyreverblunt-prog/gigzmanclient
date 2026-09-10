# Gigzman Client Sites

Multi-tenant Next.js platform serving several real-estate client websites from
one codebase. Each client is a "tenant" with its own content, brand and, where
it has one, its own domain.

## Running it on a fresh machine

```bash
pnpm install
pnpm setup                     # writes .env.local with a generated AUTH_SECRET
createdb gigzman_client_sites  # or point DATABASE_URL at an existing one
pnpm db:migrate
pnpm seed:client high-properties
pnpm dev
```

`pnpm setup` fills in everything a development machine needs. Credentials are
not committed: a signing key in git history is a signing key for everyone who
ever clones the repo, so the local one is generated per machine and production
values live on the deployment. The variables are:

| Variable | What |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Dashboard session signing key — `openssl rand -base64 32` |
| `TENANT_MODE` | `path` for the shared deployment, `host` for a client's own domain |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD_HASH` | Gate on the template-library pages |

With `TENANT_MODE=path`, a tenant is served at
`/{vertical}/{template}/{client-slug}` — e.g.
`/realestate/temp-premium-v2/high-properties`.

## Tenants

| Slug | Template | Notes |
|---|---|---|
| `high-properties` | premium-v2 | Live client, own domain |
| `evergreen-real-estate` | premium-v2 | Farm houses, Sohna belt |
| `expert-realtors` | premium-v2 | |
| `nayra-realtors`, `urban-flat-real-estate` | premium-v2 | |
| `arora-k-associates` | CA vertical | |

Add one by dropping a folder under `clients/`, setting `template: premium-v2`
in its `profile.yaml` (real-estate tenants only — `pnpm seed:client` writes it
to `clients.template_key`), and running `pnpm seed:client <slug>`.

Or create one from the gated dashboard at `/` — **New client** writes the same
rows directly and needs no YAML, no code edit and no deploy. A client created
that way has no `clients/<slug>/` folder until `pnpm export:client` makes one.

## Content scripts

| Command | What |
|---|---|
| `pnpm seed:client <slug> [--force]` | Load a client's YAML into the database. `--force` refuses if the database is newer than the file — pass `--overwrite-dashboard-edits` to override |
| `pnpm export:client <slug>` | Regenerate `clients/<slug>/` from the database. Run it after dashboard edits so the checked-in file matches the live site |
| `pnpm check:content <slug>` | Placeholder / pending checklist before delivery. Also lists clients that exist only in the database and are therefore not covered |
| `pnpm tsx --env-file=.env.local scripts/prune-client-content.ts <slug>` | Delete rows whose slug has left the YAML — `seed --force` overwrites but never deletes |
| `node scripts/import-farmhouses.mjs` | Rebuild Evergreen's listings from `source-data/` |

## source-data/

Inputs the content was built from, vendored so the import scripts run on any
checkout rather than depending on one laptop's Downloads folder.

| Folder | What |
|---|---|
| `99acres-farmhouse-gurgaon/` | 442 scraped farm-house listings (JSON + CSV + facets) |
| `gurgaon-farmhouses-realistic-hd/` | 30 generated farmhouse photographs used on Evergreen's listings |
| `highproperties-hostinger/` | The client's previous static site — source of the services and documentation copy |
| `high-properties-property-management-page/` | Design pack for `/property-management` |
| `high-properties-property-management-section/` | Design pack for the home-page section |

**Deliberately not included:** the 99acres scrape's own `videos/` (6.0 GB) and
`images/` (135 MB). Neither is used — video tours are embedded from the
listings' YouTube URLs, and the scraped photographs were unusable (half under
400px wide, no larger variant published by the CDN). If they are ever needed
again they have to come from the original scrape, not from here.

## Content status

Several tenants carry seed content rather than deliverable content, marked
`_status: placeholder` in their YAML and listed by `pnpm check:content`. Two
things in particular need replacing before any of it is promoted:

- **Evergreen's listings** are other dealers' listings as published on
  99acres, and their photographs are generated images, not photographs of the
  properties described. The detail page carries an illustrative-image notice.
- **Testimonials** on the property-management page use design-pack people and
  invented quotes, not consented customer testimonials.
