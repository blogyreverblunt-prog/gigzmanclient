import { whatsappHref } from "@/lib/whatsapp";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, desc, asc } from "drizzle-orm";
import { Phone, Mail, MessageCircle, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { queries, queryNotes, queryStatusHistory } from "@/lib/db/schema";
import { getBasePath, joinPath } from "@/lib/tenant";
import { getSessionUser } from "@/lib/auth";
import Badge, { statusTone } from "@/components/ui/Badge";
import QueryWorkspace from "@/components/dashboard/QueryWorkspace";
import {
  QUERY_STATUS_LABELS,
  CLIENT_TYPE_LABELS,
  NOT_CONVERTED_REASON_LABELS,
  formatDateTime,
} from "@/lib/format";

export default async function QueryDetailPage(props: PageProps<"/site/[tenant]/dashboard/queries/[id]">) {
  const { id } = await props.params;

  const basePath = await getBasePath();
  const p = (path: string) => joinPath(basePath, path);

  const user = await getSessionUser();
  if (!user) redirect(p("/dashboard/login"));

  const [query] = await db
    .select()
    .from(queries)
    .where(and(eq(queries.id, id), eq(queries.clientId, user.clientId)))
    .limit(1);

  if (!query) notFound();

  const [notes, history] = await Promise.all([
    db.select().from(queryNotes).where(eq(queryNotes.queryId, id)).orderBy(desc(queryNotes.createdAt)),
    db
      .select()
      .from(queryStatusHistory)
      .where(eq(queryStatusHistory.queryId, id))
      .orderBy(asc(queryStatusHistory.changedAt)),
  ]);

  // The ENQUIRER's number, not the firm's — same normalisation, same helper.
  const waLink = whatsappHref(query.phone);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={p("/dashboard/queries")}
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All queries
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display-md">{query.name}</h1>
            <Badge tone={statusTone(query.status)}>{QUERY_STATUS_LABELS[query.status]}</Badge>
            {query.isArchived ? <Badge tone="neutral">Archived</Badge> : null}
          </div>
          <p className="mt-1.5 font-mono text-[12px] text-ink-subtle">{query.reference}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {query.phone ? (
            <a
              href={`tel:${query.phone.replace(/\s/g, "")}`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-navy hover:border-navy"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              Call
            </a>
          ) : null}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-navy hover:border-navy"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </a>
          ) : null}
          {query.email ? (
            <a
              href={`mailto:${query.email}?subject=${encodeURIComponent(`Your enquiry ${query.reference}`)}`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-3 text-[13px] text-navy hover:border-navy"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Email
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-[10px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">Enquiry</p>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone" value={query.phone} />
              <Field label="Email" value={query.email} />
              <Field
                label="Client type"
                value={query.clientType ? CLIENT_TYPE_LABELS[query.clientType] : null}
              />
              <Field label="Requirement" value={query.serviceLabel} />
              <Field
                label="Preferred contact"
                value={query.preferredContact ? query.preferredContact : null}
              />
              <Field label="Source" value={query.leadSource} />
              {query.calculatorId ? (
                <Field label="From calculator" value={query.calculatorId} />
              ) : null}
              <Field label="Landing page" value={query.landingPage} />
            </dl>

            {query.message ? (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-[12px] uppercase tracking-[0.08em] text-ink-subtle">Message</p>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                  {query.message}
                </p>
              </div>
            ) : null}

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[11px] leading-relaxed text-ink-subtle">
                Received {formatDateTime(query.createdAt)} ·{" "}
                {query.marketingConsent
                  ? "Consented to receive updates"
                  : "Did not consent to updates"}
              </p>
              {query.notConvertedReason ? (
                <p className="mt-1.5 text-[12px] text-status-danger">
                  Not converted: {NOT_CONVERTED_REASON_LABELS[query.notConvertedReason]}
                </p>
              ) : null}
            </div>
          </section>

          <QueryWorkspace
            queryId={query.id}
            currentStatus={query.status}
            followUpDate={query.followUpDate}
            assignedTo={query.assignedTo}
            priority={query.priority}
            isArchived={query.isArchived}
            notes={notes.map((n) => ({
              id: n.id,
              body: n.body,
              authorName: n.authorName,
              createdAt: formatDateTime(n.createdAt),
            }))}
          />
        </div>

        <aside>
          <section className="rounded-[10px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">Status history</p>
            <ol className="mt-4 space-y-4">
              {history.map((entry) => (
                <li key={entry.id} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-accent" />
                  <p className="text-[13px] font-medium text-ink">
                    {QUERY_STATUS_LABELS[entry.toStatus]}
                  </p>
                  {entry.fromStatus ? (
                    <p className="mt-0.5 text-[11px] text-ink-subtle">
                      from {QUERY_STATUS_LABELS[entry.fromStatus]}
                    </p>
                  ) : null}
                  {entry.reason ? (
                    <p className="mt-1 text-[12px] text-ink-muted">{entry.reason}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    {formatDateTime(entry.changedAt)}
                    {entry.changedBy ? ` · ${entry.changedBy}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink">{value || "—"}</dd>
    </div>
  );
}
