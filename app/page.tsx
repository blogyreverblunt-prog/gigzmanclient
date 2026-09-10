import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { listClientsForPlatform } from "@/lib/platform/clients";
import { getVerticalConfig } from "@/lib/verticals";
import { getTemplateConfig, getTenantPath, templateKeyFor } from "@/lib/templates";
import { logoutPlatformAdmin } from "./login/actions";
import ClientLookupForm from "./ClientLookupForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gigzman",
  robots: { index: false, follow: false },
};

/**
 * The single gated entry point to this deployment: the client list, and the
 * slug box as the fast path into a site whose ID the operator already knows.
 *
 * This file used to say it "deliberately shows no client listing", so that
 * nobody browsing here could discover a client they did not already know the
 * slug for. That is reversed on purpose, and the reason it was reversed is
 * that the reasoning was never sound: `/` is gated by `requirePlatformAdmin`,
 * so anyone who can see this page has already authenticated, and anyone who
 * has not sees `/login`. Slug obscurity was protecting nothing from anybody,
 * while costing the operator the ability to answer "which clients do we have".
 * Access is controlled by the platform login. It is not controlled by what
 * this page declines to render.
 */
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePlatformAdmin("/");
  const { q } = await searchParams;

  // A plain GET form filtered on the server: six rows do not justify client
  // state, and a `?q=` in the URL is shareable and survives a refresh.
  const query = (q ?? "").trim().toLowerCase();
  const all = await listClientsForPlatform();
  const rows = query
    ? all.filter((row) =>
        [row.slug, row.displayName, row.firmName ?? "", row.customDomain ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : all;

  return (
    <div className="min-h-screen bg-tint px-5 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Gigzman</p>
            <h1 className="display-md mt-2">Clients</h1>
            <p className="mt-2 text-[13px] text-ink-muted">{session.email}</p>
          </div>
          <form action={logoutPlatformAdmin}>
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-line-strong px-3 text-[12.5px] font-medium text-ink-muted hover:border-navy hover:text-navy"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>

        <form method="get" className="mt-7 flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[12px] text-ink-muted">
              Search clients
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
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
          {query ? (
            <Link
              href="/"
              className="inline-flex min-h-[40px] items-center px-2 text-[12.5px] text-ink-muted hover:text-navy"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <div className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-ink-muted">
                <Th>Client</Th>
                <Th>Vertical</Th>
                <Th>Template</Th>
                <Th>Active</Th>
                <Th>Custom domain</Th>
                <Th>Last updated</Th>
                <Th>Open</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vertical = getVerticalConfig(row.vertical);
                const templateKey = templateKeyFor(row);
                const basePath = getTenantPath(row);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-line last:border-0 text-[13px] ${
                      row.isActive ? "text-ink" : "text-ink-muted opacity-60"
                    }`}
                  >
                    <Td>
                      <Link
                        href={`/clients/${row.slug}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {row.displayName}
                      </Link>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-ink-muted">
                        {row.slug}
                      </span>
                    </Td>
                    <Td>{vertical.label}</Td>
                    <Td>
                      {row.vertical !== "realestate" ? (
                        <span className="text-ink-muted">—</span>
                      ) : templateKey ? (
                        getTemplateConfig(templateKey).label
                      ) : (
                        // Not cosmetic: `getTenantBySlug` returns null for a
                        // realestate row whose template_key is null or
                        // unrecognised, so this client's whole site 404s.
                        <span className="text-status-danger">No valid template</span>
                      )}
                    </Td>
                    <Td>{row.isActive ? "Active" : "Off"}</Td>
                    <Td>{row.customDomain ?? <span className="text-ink-muted">—</span>}</Td>
                    <Td>
                      {row.settingsUpdatedAt ? (
                        // `clients` has no `updatedAt` column, so this is the
                        // settings row's — and a client with no settings row at
                        // all has nothing to show, which is itself worth seeing.
                        row.settingsUpdatedAt.toISOString().slice(0, 10)
                      ) : (
                        <span className="text-status-danger">No settings row</span>
                      )}
                    </Td>
                    <Td>
                      <a href={basePath} className="text-navy hover:underline">
                        Site
                      </a>
                      <span className="px-1.5 text-ink-muted">·</span>
                      <a href={`${basePath}/dashboard`} className="text-navy hover:underline">
                        Dashboard
                      </a>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[13px] text-ink-muted">
                    No client matches &ldquo;{q}&rdquo;.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-[12px] text-ink-muted">
          {rows.length} of {all.length} clients. Inactive clients are shown muted; there is no
          delete control, because `onDelete: cascade` is on every content table.
        </p>

        <div className="mt-8 max-w-sm rounded-[12px] border border-line bg-surface p-6">
          <p className="text-[14px] font-semibold text-ink">Open a client site by ID</p>
          <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-muted">
            The fast path when you already know the slug.
          </p>
          <ClientLookupForm />
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
