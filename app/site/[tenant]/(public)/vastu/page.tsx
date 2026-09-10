import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { DIRECTIONS, ROOMS, VASTU_CONTEXTS } from "@/lib/vastu";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import VastuCalculatorV2 from "@/components/realestate/premium-v2/tools/VastuCalculatorV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Free Vastu Calculator — Check Your Home's Directions | ${settings?.firmName ?? ""}`,
    description:
      "Free vastu calculator, no sign-up. Enter the direction of each room and get an instant directional score, with what the tradition suggests for anything placed differently.",
    alternates: { canonical: joinPath(basePathFor(tenant), "/vastu") },
  };
}

export default async function VastuHubPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Vastu", url: p("/vastu") },
          ]),
        )}
      />

      <VastuCalculatorV2
        heading="Vastu Calculator"
        subheading="Enter the direction of each room and get an instant score. Free, no sign-up, and no floor plan upload needed."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Vastu</span>
          </nav>
        }
      />

      <GpSection tone="cream">
        <GpContainer>
          <GpEyebrow>By facing direction</GpEyebrow>
          <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
            Vastu by which way the property faces
          </h2>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[color:var(--gp-body)]">
            The facing direction is the first thing most buyers ask about. Each guide below covers
            the room-by-room layout the tradition suggests for that facing.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DIRECTIONS.map((d) => (
              <div key={d.slug} className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">{d.element}</p>
                <h3 className="font-display mt-1.5 text-[15px] text-[color:var(--gp-ink)]">
                  {d.name} facing
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--gp-body)]">{d.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {VASTU_CONTEXTS.map((c) => (
                    <Link
                      key={c.slug}
                      href={p(`/vastu/${d.slug}-facing-${c.slug}`)}
                      className="rounded-full border border-[color:var(--gp-border)] px-2.5 py-1 text-[11.5px] text-[color:var(--gp-body)] transition-colors hover:border-[color:var(--gp-gold-600)]"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <RelatedCardsV2
            className="mt-14"
            title={`Vastu by room`}
            items={[ROOMS.map((r) => (
              ({ href: p(`/vastu/${r.slug}-vastu`), title: r.name, subtitle: r.guidance })
            ))].flat(2)}
            icon={DoorOpen}
            columns={3}
          />

          {vastuSectorsEnabled(tenant) ? (
          <div className="mt-14 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-6 sm:p-8">
            <GpEyebrow className="text-[color:var(--gp-gold-600)]">By Gurugram sector</GpEyebrow>
            <h2 className="font-display mt-2 text-[16px] text-[color:var(--gp-ink)]">
              What you can actually act on, sector by sector
            </h2>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[color:var(--gp-body)]">
              Vastu does not change by sector — what is built there does, and that decides how much
              of the guidance you can use. Each sector page pairs it with the corridor prices and
              yields we track.
            </p>
            <Link
              href={p("/vastu/gurugram")}
              className="mt-5 inline-flex min-h-[46px] items-center rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-forest-950)] px-5 text-[13px] font-semibold uppercase tracking-[0.04em] text-white transition-colors hover:bg-[color:var(--gp-gold-600)] hover:text-[color:var(--gp-forest-950)]"
            >
              Browse every sector
            </Link>
          </div>
          ) : null}
        </GpContainer>
      </GpSection>

    </>
  );
}
