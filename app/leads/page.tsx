import Link from "next/link";
import { ArrowLeft, Inbox, Search } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { listLeadsForPlatform, leadCountsForPlatform } from "@/lib/platform/leads";
import Badge, { statusTone } from "@/components/ui/Badge";
import { QUERY_STATUS_LABELS, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads — Gigzman",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

/**
 * Every client's enquiries in one list.
 *
 * The tenant dashboards already have a lead screen, but each one is scoped to a
 * single client and sits behind that client's own login — so answering "what
 * came in today, across everyone" meant opening six dashboards or querying the
 * database by hand. This is the operator's view of the same rows.
 *
 * Deliberately read-only. Working a lead — changing its status, adding a note —
 * belongs in the client's own dashboard where the audit trail records who did
 * it; `query_status_history.changedBy` has no meaningful value to write from a
 * shared operator account.
 */
export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin("/leads");
  const params = await searchParams;

  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const clientSlug = one("client");
  const status = one("status");
  const search = one("q");
  const days = one("days") ? Number(one("days")) : null;
  const archived = params.archived === "1";
  const page = Math.max(1, Number(one("page") ?? "1") || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listLeadsForPlatform({
      clientSlug,
      status,
      search,
      days: Number.isFinite(days) ? days : null,
      archived,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    leadCountsForPlatform(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Keeps every active filter while changing one of them. */
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const base: Record<string, string | null> = {
      client: clientSlug,
      status,
      q: search,
      days: days ? String(days) : null,
      archived: archived ? "1" : null,
      ...patch,
    };
    for (const [k, v] of Object.entries(base)) if (v) next.set(k, v);
    const qs = next.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  };

  const filtered = Boolean(clientSlug || status || search || days || archived);

  return (
    <div className="min-h-screen bg-tint px-5 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All clients
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Gigzman</p>
            <h1 className="display-md mt-2">Leads</h1>
            <p className="mt-2 text-[13px] text-ink-muted">
              Every client&rsquo;s enquiries, newest first.
            </p>
          </div>
          <Link
            href={href({ archived: archived ? null : "1", page: null })}
            className="text-[13px] font-medium text-navy hover:underline"
          >
            {archived ? "View active" : "View archived"}
          </Link>
        </div>

        {/* Four figures an operator checks before anything else. */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={counts.total} />
          <Stat label="Unactioned" value={counts.unactioned} tone={counts.unactioned > 0} />
          <Stat label="Last 24 hours" value={counts.last24h} />
          <Stat label="Last 7 days" value={counts.last7d} />
        </div>

        {/*
          Every client, including those on zero. A client that is connected but
          silent and a client whose form is quietly broken look identical from
          here — but both are invisible if the row is simply omitted.
        */}
        <div className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-surface p-3">
          <div className="flex min-w-max flex-wrap gap-2">
            <Link
              href={href({ client: null, page: null })}
              className={chip(!clientSlug)}
            >
              All clients
            </Link>
            {counts.byClient.map((c) => (
              <Link key={c.slug} href={href({ client: c.slug, page: null })} className={chip(clientSlug === c.slug)}>
                {c.name}
                <span className={`ml-1.5 font-mono ${c.count === 0 ? "text-status-warn" : "opacity-70"}`}>
                  {c.count}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
          {/* Carried through the GET so searching does not silently drop the other filters. */}
          {clientSlug ? <input type="hidden" name="client" value={clientSlug} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[12px] text-ink-muted">
              Search name, phone, email or reference
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search ?? ""}
              autoComplete="off"
              className="w-full min-h-[40px] rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-ink focus:border-navy focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[8px] border border-line-strong px-3.5 text-[13px] font-medium text-ink-muted hover:border-navy hover:text-navy"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Search
          </button>
          {filtered ? (
            <Link href="/leads" className="inline-flex min-h-[40px] items-center px-2 text-[12.5px] text-ink-muted hover:text-navy">
              Clear all
            </Link>
          ) : null}
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={href({ status: null, page: null })} className={chip(!status)}>
            Any status
          </Link>
          {Object.entries(QUERY_STATUS_LABELS).map(([key, label]) => (
            <Link key={key} href={href({ status: key, page: null })} className={chip(status === key)}>
              {label}
              <span className="ml-1.5 font-mono opacity-70">{counts.byStatus[key] ?? 0}</span>
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-[10px] border border-line bg-surface px-6 py-16 text-center">
            <Inbox className="h-6 w-6 text-ink-muted" aria-hidden="true" />
            <p className="text-[14px] font-medium text-ink">No leads match</p>
            <p className="max-w-sm text-[12.5px] text-ink-muted">
              {filtered
                ? "Clear the filters to see everything."
                : "Nothing has come in yet. A client site that was connected but is showing zero may not be wired up correctly."}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full min-w-[60rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <Th>Received</Th>
                  <Th>Client</Th>
                  <Th>Lead</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th>Enquiry</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line text-[13px] last:border-0">
                    <Td>
                      <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                        {row.reference}
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/clients/${row.clientSlug}`} className="font-medium text-navy hover:underline">
                        {row.clientName}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-medium">{row.name}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-muted">
                        {row.phone ? (
                          <a href={`tel:+91${row.phone}`} className="hover:text-navy">
                            {row.phone}
                          </a>
                        ) : null}
                        {row.phone && row.email ? " · " : null}
                        {row.email ? (
                          <a href={`mailto:${row.email}`} className="hover:text-navy">
                            {row.email}
                          </a>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>
                        {QUERY_STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </Td>
                    <Td>
                      {/*
                        `external_id` is set only by the ingest endpoint, so it
                        is the one reliable way to tell a lead from a delivered,
                        separately-hosted site from one submitted on this
                        deployment.
                      */}
                      <span className="text-[12px]">
                        {row.externalId ? "API" : "Website"}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                        {row.serviceLabel ?? row.formName ?? row.leadSource ?? "—"}
                      </span>
                    </Td>
                    <Td>
                      {row.message ? (
                        <details className="max-w-[24rem]">
                          <summary className="cursor-pointer list-none text-[12.5px] text-ink-muted hover:text-navy">
                            {row.message.length > 70 ? `${row.message.slice(0, 70)}…` : row.message}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                            {row.message}
                          </p>
                          {row.landingPage ? (
                            <p className="mt-2 font-mono text-[11px] text-ink-muted">
                              from {row.landingPage}
                            </p>
                          ) : null}
                        </details>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-ink-muted">
            {total === 0
              ? "No results"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </p>
          {pages > 1 ? (
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={href({ page: String(page - 1) })} className={chip(false)}>
                  Previous
                </Link>
              ) : null}
              <span className="text-[12px] text-ink-muted">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={href({ page: String(page + 1) })} className={chip(false)}>
                  Next
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="mt-6 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
          Read-only. Change a lead&rsquo;s status or add a note from that client&rsquo;s own
          dashboard, where the change is recorded against the person who made it.
        </p>
      </div>
    </div>
  );
}

function chip(active: boolean): string {
  return `inline-flex min-h-[34px] items-center rounded-full border px-3 py-1.5 text-[12px] ${
    active
      ? "border-navy bg-navy text-white"
      : "border-line-strong bg-surface text-ink-muted hover:border-navy"
  }`;
}

function Stat({ label, value, tone = false }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface px-4 py-3">
      <p className="text-[11.5px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={`mt-1 text-[22px] font-semibold tabular-nums ${
          tone ? "text-status-warn" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
