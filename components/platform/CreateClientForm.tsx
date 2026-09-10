"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, KeyRound } from "lucide-react";
import {
  FIELD,
  FeedbackBanner,
  Panel,
  Row,
  SaveButton,
  type Feedback,
} from "@/components/platform/form-primitives";
import { createClient, type CreateClientResult } from "@/lib/actions/platform-actions";

interface TemplateOption {
  key: string;
  label: string;
}

interface VerticalOption {
  id: string;
  label: string;
}

/**
 * Creates a client and then, on success, replaces itself with the handover
 * panel rather than redirecting.
 *
 * The redirect was the obvious design and is wrong here: the generated admin
 * password exists exactly once, in the action's return value, and carrying it
 * through a redirect means putting a live credential in a query string — and so
 * in browser history, the referer header and every access log on the way. Held
 * in component state it survives until the operator navigates away, which is
 * what "shown once" should mean.
 */
export default function CreateClientForm({
  verticals,
  templates,
}: {
  verticals: VerticalOption[];
  templates: TemplateOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [created, setCreated] = useState<CreateClientResult["created"] | null>(null);
  const [vertical, setVertical] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [copied, setCopied] = useState(false);

  if (created) {
    return <Handover created={created} copied={copied} setCopied={setCopied} />;
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createClient(formData);
          setFeedback(result);
          if (result.ok && result.created) setCreated(result.created);
        })
      }
      className="space-y-4"
    >
      <FeedbackBanner feedback={feedback} />

      <Panel
        title="Identity"
        note="The client ID is permanent — it is the URL. Everything else can be changed afterwards."
      >
        <Row>
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-[12px] text-ink-muted">
              Business name
            </label>
            <input
              id="displayName"
              name="displayName"
              required
              className={FIELD}
              onChange={(event) => {
                // Suggest a slug until the operator types one themselves; after
                // that, leave it alone. Silently rewriting a slug someone has
                // deliberately set is worse than an awkward suggestion.
                if (slugEdited) return;
                setSlug(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 120),
                );
              }}
            />
          </div>
          <div>
            <label htmlFor="slug" className="mb-1.5 block text-[12px] text-ink-muted">
              Client ID
            </label>
            <input
              id="slug"
              name="slug"
              required
              value={slug}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              Lowercase letters, numbers and hyphens. This becomes part of the site&rsquo;s web
              address and <strong>cannot be changed later</strong>.
            </p>
          </div>
        </Row>

        <Row>
          <div>
            <label htmlFor="vertical" className="mb-1.5 block text-[12px] text-ink-muted">
              Industry
            </label>
            <select
              id="vertical"
              name="vertical"
              required
              value={vertical}
              onChange={(event) => setVertical(event.target.value)}
              className={FIELD}
            >
              <option value="">Choose…</option>
              {verticals.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
              Decides which screens and pages the client gets, and cannot be changed later —
              the content tables differ by industry.
            </p>
          </div>

          {/* Only real estate carries a template today; a CA firm has none, and
              null is the correct value rather than a missing one. */}
          {vertical === "realestate" ? (
            <div>
              <label htmlFor="templateKey" className="mb-1.5 block text-[12px] text-ink-muted">
                Template
              </label>
              <select id="templateKey" name="templateKey" required defaultValue="" className={FIELD}>
                <option value="">Choose…</option>
                {templates.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Required. A real-estate client without one has no working site.
              </p>
            </div>
          ) : null}
        </Row>
      </Panel>

      <Panel
        title="What happens on create"
        note="Business details, branding and content are filled in afterwards from the client's edit screen."
      >
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-muted">
          <li>The client is created and its site goes live immediately — no deploy needed.</li>
          <li>A settings record is created with the business name and nothing else.</li>
          <li>This industry&rsquo;s calculators are set up.</li>
          <li>
            A dashboard sign-in is created for the client. <strong>The password is shown once</strong>{" "}
            on the next screen and cannot be retrieved afterwards.
          </li>
        </ul>
      </Panel>

      <SaveButton pending={pending} label={pending ? "Creating" : "Create client"} />
    </form>
  );
}

function Handover({
  created,
  copied,
  setCopied,
}: {
  created: NonNullable<CreateClientResult["created"]>;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  const credentials = `${created.adminEmail}\n${created.password}`;

  return (
    <div className="space-y-4">
      <Panel title={`Created ${created.slug}`} note="The site is live now.">
        <p className="text-[13px] text-ink">
          <a
            href={created.sitePath}
            className="inline-flex items-center gap-1.5 font-medium text-navy hover:underline"
          >
            Open the site
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <span className="px-2 text-ink-muted">·</span>
          <Link href={`/clients/${created.slug}`} className="font-medium text-navy hover:underline">
            Fill in the business details
          </Link>
        </p>
      </Panel>

      <section className="rounded-[10px] border border-status-danger bg-status-danger-soft p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-status-danger">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Dashboard sign-in — shown once
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-status-danger">
          This password is not stored anywhere in readable form and cannot be shown again. Copy it
          now. If it is lost, a new one has to be set directly in the database.
        </p>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-muted">Email</dt>
            <dd className="font-mono text-ink">{created.adminEmail}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-muted">Password</dt>
            <dd className="font-mono text-ink">{created.password}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(credentials).then(
              () => setCopied(true),
              // Clipboard access can be refused outright (permissions policy, or
              // a non-secure origin). The credentials are on screen either way,
              // so a failed copy must not look like a failed create.
              () => setCopied(false),
            );
          }}
          className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-[8px] border border-status-danger px-3.5 text-[13px] font-medium text-status-danger hover:bg-surface"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Copied" : "Copy email and password"}
        </button>
      </section>

      <p className="text-[12px] text-ink-muted">
        <Link href="/" className="text-navy hover:underline">
          Back to all clients
        </Link>
      </p>
    </div>
  );
}
