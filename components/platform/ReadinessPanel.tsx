import { AlertTriangle, Check, X } from "lucide-react";
import type { ReadinessGroup } from "@/lib/platform/readiness";

/**
 * The pre-delivery checklist, on screen.
 *
 * A Server Component with no form and no action: every item is fixed somewhere
 * else on this page, so the only useful thing it can do is name what is missing
 * and say which panel fixes it. Making the rows clickable would be a nicety;
 * making them accurate is the requirement.
 *
 * This is what stands in place of an SEO form. Nobody can write metadata for
 * thousands of generated pages, but anyone can work through a list of empty
 * fields.
 */
export default function ReadinessPanel({ groups }: { groups: ReadinessGroup[] }) {
  const all = groups.flatMap((group) => group.items);
  const missing = all.filter((item) => item.status === "missing").length;
  const warn = all.filter((item) => item.status === "warn").length;

  return (
    <section className="rounded-[10px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">Before handing this site over</p>
        <p className="text-[12px] text-ink-muted">
          {missing === 0 && warn === 0
            ? "Nothing outstanding"
            : `${missing} missing · ${warn} worth checking`}
        </p>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        Everything here is a field elsewhere on this page. It does not judge whether the writing is
        any good — only whether something is there.
      </p>

      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 text-[11.5px] uppercase tracking-wide text-ink-muted">
              {group.title}
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-[13px]">
                  <Icon status={item.status} />
                  <span className="min-w-0">
                    <span className={item.status === "missing" ? "text-ink" : "text-ink"}>
                      {item.label}
                    </span>
                    {item.detail ? (
                      <span className="block text-[12px] leading-relaxed text-ink-muted">
                        {item.detail}
                      </span>
                    ) : null}
                    {item.fix && item.status !== "ok" ? (
                      <span className="block text-[11.5px] text-ink-muted">
                        Fix in &ldquo;{item.fix}&rdquo;
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-muted">
        This does not cover placeholder text in the client&rsquo;s own content. Run{" "}
        <code className="font-mono">pnpm check:content &lt;slug&gt;</code> for that — it shares its
        thin-content rules with this panel.
      </p>
    </section>
  );
}

function Icon({ status }: { status: ReadinessGroup["items"][number]["status"] }) {
  if (status === "ok") {
    return (
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" aria-label="Done" />
    );
  }
  if (status === "warn") {
    return (
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-label="Check" />
    );
  }
  return <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-danger" aria-label="Missing" />;
}
