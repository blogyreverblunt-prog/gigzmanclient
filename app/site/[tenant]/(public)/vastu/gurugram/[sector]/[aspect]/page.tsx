import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Compass, MapPin } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import { vastuSectorsEnabled } from "@/lib/vastu/enabled";
import { DIRECTIONS, ROOMS, VASTU_DISCLAIMER, findDirection, findRoom } from "@/lib/vastu";
import {
  SECTORS, PROPERTY_CONTEXTS, findSector, resolveSectorAspect, sectorAspectSlugs,
} from "@/lib/vastu/sectors";
import {
  MARKET_PROVENANCE, marketFor, sectorFaqs, sectorHeading, sectorIntro,
} from "@/lib/vastu/sector-content";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

const DIRECTION_SLUGS = DIRECTIONS.map((d) => d.slug);
const ROOM_SLUGS = ROOMS.map((r) => r.slug);
const ASPECTS = sectorAspectSlugs(DIRECTION_SLUGS, ROOM_SLUGS);

export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const t = await getTenantBySlug(tenant.slug);
    if (!t || t.vertical !== "realestate" || !vastuSectorsEnabled(t)) return [];
    return SECTORS.flatMap((s) => ASPECTS.map((aspect) => ({ sector: s.slug, aspect })));
  });
}

interface Props {
  params: Promise<{ tenant: string; sector: string; aspect: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, sector: sectorSlug, aspect: aspectSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const sector = findSector(sectorSlug);
  const aspect = resolveSectorAspect(aspectSlug, DIRECTION_SLUGS, ROOM_SLUGS);
  if (!tenant || !sector || !aspect) return {};
  const [settings, localities] = await Promise.all([
    getFirmSettings(tenant.id),
    getLocalities(tenant.id),
  ]);
  return {
    title: `${sectorHeading(sector, aspect)} — Gurugram | ${settings?.firmName ?? ""}`,
    description: sectorIntro(sector, aspect, marketFor(sector, localities)).slice(0, 300),
    alternates: {
      canonical: joinPath(basePathFor(tenant), `/vastu/gurugram/${sector.slug}/${aspectSlug}`),
    },
  };
}

export default async function VastuSectorAspectPage({ params }: Props) {
  const { tenant: tenantSlug, sector: sectorSlug, aspect: aspectSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  if (!vastuSectorsEnabled(tenant)) notFound();
  const sector = findSector(sectorSlug);
  const aspect = resolveSectorAspect(aspectSlug, DIRECTION_SLUGS, ROOM_SLUGS);
  if (!sector || !aspect) notFound();

  const localities = await getLocalities(tenant.id);
  const market = marketFor(sector, localities);
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const heading = sectorHeading(sector, aspect);
  const faqs = sectorFaqs(sector, aspect, market);

  // Only the direction and room aspects have a room table worth showing; the
  // property-type page's substance is what you can and cannot change instead.
  const highlightDirection = aspect.kind === "direction" ? findDirection(aspect.slug)! : null;
  const room = aspect.kind === "room" ? findRoom(aspect.slug)! : null;

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Vastu", url: p("/vastu") },
            { name: "Gurugram sectors", url: p("/vastu/gurugram") },
            { name: sector.name, url: p(`/vastu/gurugram/${sector.slug}`) },
            { name: heading, url: p(`/vastu/gurugram/${sector.slug}/${aspectSlug}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <GpSection tone="forest" className="py-14 sm:py-20"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-white/55">
            <Link href={p("/vastu")} className="hover:text-[color:var(--gp-gold-300)]">Vastu</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/vastu/gurugram")} className="hover:text-[color:var(--gp-gold-300)]">Gurugram</Link>
            <span className="mx-1.5">/</span>
            <Link href={p(`/vastu/gurugram/${sector.slug}`)} className="hover:text-[color:var(--gp-gold-300)]">
              {sector.name}
            </Link>
          </nav>

          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {market?.corridorName ?? "Gurugram"}
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">{heading}</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/75">
            {sectorIntro(sector, aspect, market)}
          </p>

          {market ? (
            <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-white/45">
              {MARKET_PROVENANCE}
            </p>
          ) : null}

          <Link
            href={p("/properties")}
            className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-6 text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
          >
            See what is available here
          </Link>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream">
        <GpContainer>
          {room ? (
            <>
              <GpEyebrow>Placement</GpEyebrow>
              <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
                Where the {room.name.toLowerCase()} belongs
              </h2>
              <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                  <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">Traditionally placed</p>
                  <p className="font-display mt-2 text-[15px] text-[color:var(--gp-ink)]">
                    {room.preferred.map((d) => findDirection(d)!.name).join(", ")}
                  </p>
                </div>
                <div className="rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-5">
                  <p className="gp-eyebrow text-[color:var(--gp-muted)]">Generally avoided</p>
                  <p className="font-display mt-2 text-[15px] text-[color:var(--gp-ink)]">
                    {room.avoid.length ? room.avoid.map((d) => findDirection(d)!.name).join(", ") : "Nothing specific"}
                  </p>
                </div>
              </div>
              <RelatedCardsV2
                className="mt-6"
                items={[DIRECTIONS.map((d) => (
                  ({ href: p(`/vastu/${room.slug}-in-${d.slug}-vastu`), title: `${room.name} in the ${d.name.toLowerCase()}`, subtitle: d.summary })
                ))].flat(2)}
                icon={Compass}
                columns={3}
              />
            </>
          ) : (
            <>
              <GpEyebrow>Room by room</GpEyebrow>
              <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
                {highlightDirection
                  ? `What belongs in the ${highlightDirection.name.toLowerCase()}`
                  : "Where the tradition places each room"}
              </h2>
              <div className="mt-7 overflow-x-auto rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead>
                    <tr className="bg-[color:var(--gp-cream-200)] text-left text-[11px] uppercase tracking-[0.07em] text-[color:var(--gp-muted)]">
                      <th className="px-4 py-3 font-semibold">Room</th>
                      <th className="px-4 py-3 font-semibold">Traditionally placed</th>
                      <th className="px-4 py-3 font-semibold">Generally avoided</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROOMS.map((r) => (
                      <tr key={r.slug} className="border-t border-[color:var(--gp-border)]">
                        <td className="px-4 py-2.5">
                          <Link
                            href={p(`/vastu/gurugram/${sector.slug}/${r.slug}`)}
                            className="font-medium text-[color:var(--gp-ink)] hover:text-[color:var(--gp-gold-600)]"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                          {r.preferred.map((d) => findDirection(d)!.name).join(", ")}
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--gp-muted)]">
                          {r.avoid.length ? r.avoid.map((d) => findDirection(d)!.name).join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="mt-9 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            {VASTU_DISCLAIMER}
          </p>
        </GpContainer>
      </GpSection>

      <LoanFaqV2 faqs={faqs} heading={`${heading}, answered`} />

      <GpSection tone="cream" className="pt-0">
        <GpContainer>
          <RelatedCardsV2
            title={`Other facings in ${sector.name}`}
            items={[DIRECTIONS.map((d) => (
              ({ href: p(`/vastu/gurugram/${sector.slug}/${d.slug}-facing`), title: `${d.name} facing`, subtitle: d.summary })
            ))].flat(2)}
            icon={Compass}
            columns={3}
          />

          <RelatedCardsV2
            className="mt-10"
            title={`By property type in ${sector.name}`}
            items={[PROPERTY_CONTEXTS.map((c) => (
              ({ href: p(`/vastu/gurugram/${sector.slug}/${c.slug}`), title: c.label, subtitle: `Vastu for ${c.plural} here` })
            ))].flat(2)}
            icon={Building2}
            columns={3}
          />

          <RelatedCardsV2
            className="mt-10"
            title={`Nearby on the ${market?.corridorName ?? "same corridor"}`}
            items={[SECTORS.filter((s) => s.corridorSlug === sector.corridorSlug && s.slug !== sector.slug)
              .slice(0, 14)
              .map((s) => (
                ({ href: p(`/vastu/gurugram/${s.slug}/${aspectSlug}`), title: s.name, subtitle: s.character })
              ))].flat(2)}
            icon={MapPin}
            columns={3}
          />
        </GpContainer>
      </GpSection>

    </>
  );
}
