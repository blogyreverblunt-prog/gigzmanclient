import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, DoorOpen, MapPin } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";
import { DIRECTIONS, ROOMS, VASTU_DISCLAIMER, findDirection } from "@/lib/vastu";
import { SECTORS, PROPERTY_CONTEXTS, findSector } from "@/lib/vastu/sectors";
import {
  MARKET_PROVENANCE, marketFor, sectorFaqs, sectorHeading, sectorIntro,
} from "@/lib/vastu/sector-content";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

/** Unknown params 404 instead of rendering on demand — see lib/static-params.ts. */
export const dynamicParams = false;

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const t = await getTenantBySlug(tenant.slug);
    if (!t || t.vertical !== "realestate" || !vastuSectorsEnabled(t)) return [];
    return SECTORS.map((s) => ({ sector: s.slug }));
  });
}

interface Props {
  params: Promise<{ tenant: string; sector: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, sector: sectorSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const sector = findSector(sectorSlug);
  if (!tenant || !sector) return {};
  const [settings, localities] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocalities(tenant.id),
  ]);
  return {
    title: `${sectorHeading(sector, null)} — Facing, Layout and Prices | ${settings?.firmName ?? ""}`,
    description: sectorIntro(sector, null, marketFor(sector, localities)).slice(0, 300),
    alternates: { canonical: joinPath(basePathFor(tenant), `/vastu/gurugram/${sector.slug}`) },
  };
}

export default async function VastuSectorPage({ params }: Props) {
  const { tenant: tenantSlug, sector: sectorSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  if (!vastuSectorsEnabled(tenant)) notFound();
  const sector = findSector(sectorSlug);
  if (!sector) notFound();

  const localities = await getLocalities(tenant.id);
  const market = marketFor(sector, localities);
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const heading = sectorHeading(sector, null);
  const faqs = sectorFaqs(sector, null, market);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Vastu", url: p("/vastu") },
            { name: "Gurugram sectors", url: p("/vastu/gurugram") },
            { name: sector.name, url: p(`/vastu/gurugram/${sector.slug}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <GpSection tone="forest" className="py-14 sm:py-20"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/vastu")} className="hover:text-[color:var(--gp-gold-300)]">Vastu</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/vastu/gurugram")} className="hover:text-[color:var(--gp-gold-300)]">Gurugram</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">{sector.name}</span>
          </nav>

          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {market?.corridorName ?? "Gurugram"}
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">{heading}</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/75">
            {sectorIntro(sector, null, market)}
          </p>

          {market ? (
            <dl className="mt-9 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              {[
                {
                  label: "Average price",
                  value: market.pricePerSqft
                    ? `₹${market.pricePerSqft.toLocaleString("en-IN")}/sq ft`
                    : "—",
                },
                {
                  label: "Year on year",
                  value: market.yoyPercent != null ? `${market.yoyPercent > 0 ? "+" : ""}${market.yoyPercent.toFixed(1)}%` : "—",
                },
                {
                  label: "Gross rental yield",
                  value: market.rentalYieldPercent != null ? `${market.rentalYieldPercent.toFixed(1)}%` : "—",
                },
              ].map((row) => (
                <div key={row.label}>
                  <dt className="text-[11.5px] uppercase tracking-[0.08em] text-white/50">{row.label}</dt>
                  <dd className="font-sans mt-1 text-[20px] font-semibold text-[color:var(--gp-gold-300)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {market ? (
            <p className="mt-5 max-w-2xl text-[12px] leading-relaxed text-white/45">
              {MARKET_PROVENANCE}
            </p>
          ) : null}

          <Link
            href={p("/vastu")}
            className="mt-9 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-6 text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
          >
            Score your own home
          </Link>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream">
        <GpContainer>
          <GpEyebrow>By facing</GpEyebrow>
          <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
            Facing directions in {sector.name}
          </h2>
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIRECTIONS.map((d) => (
              <Link
                key={d.slug}
                href={p(`/vastu/gurugram/${sector.slug}/${d.slug}-facing`)}
                className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-4 transition-colors hover:border-[color:var(--gp-gold-600)]"
              >
                <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">{d.element}</p>
                <h3 className="font-display mt-1 text-[15px] text-[color:var(--gp-ink)]">
                  {d.name} facing
                </h3>
              </Link>
            ))}
          </div>

          <RelatedCardsV2
            className="mt-12"
            title={`By property type`}
            items={[PROPERTY_CONTEXTS.map((c) => (
              ({ href: p(`/vastu/gurugram/${sector.slug}/${c.slug}`), title: c.label, subtitle: `Vastu for ${c.plural} in ${sector.name}` })
            ))].flat(2)}
            icon={Building2}
            columns={3}
          />

          <RelatedCardsV2
            className="mt-12"
            title={`By room`}
            items={[ROOMS.map((r) => (
              ({ href: p(`/vastu/gurugram/${sector.slug}/${r.slug}`), title: r.name, subtitle: r.guidance })
            ))].flat(2)}
            icon={DoorOpen}
            columns={3}
          />

          <div className="mt-12 overflow-x-auto rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="bg-[color:var(--gp-cream-200)] text-left text-[11px] uppercase tracking-[0.07em] text-[color:var(--gp-muted)]">
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Traditionally placed</th>
                  <th className="px-4 py-3 font-semibold">Generally avoided</th>
                </tr>
              </thead>
              <tbody>
                {ROOMS.map((room) => (
                  <tr key={room.slug} className="border-t border-[color:var(--gp-border)]">
                    <td className="px-4 py-2.5 font-medium text-[color:var(--gp-ink)]">{room.name}</td>
                    <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                      {room.preferred.map((d) => findDirection(d)!.name).join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--gp-muted)]">
                      {room.avoid.length ? room.avoid.map((d) => findDirection(d)!.name).join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-9 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            {VASTU_DISCLAIMER}
          </p>
        </GpContainer>
      </GpSection>

      <LoanFaqV2 faqs={faqs} heading={`Vastu in ${sector.name}, answered`} />

      <GpSection tone="cream" className="pt-0">
        <GpContainer>
          <RelatedCardsV2
            title={`Nearby on the ${market?.corridorName ?? "same corridor"}`}
            items={[SECTORS.filter((s) => s.corridorSlug === sector.corridorSlug && s.slug !== sector.slug)
              .slice(0, 18)
              .map((s) => (
                ({ href: p(`/vastu/gurugram/${s.slug}`), title: s.name, subtitle: s.character })
              ))].flat(2)}
            icon={MapPin}
            columns={3}
          />
        </GpContainer>
      </GpSection>

    </>
  );
}
