import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { ArrowLeftRight } from "lucide-react";
import { AREA_UNITS, convertArea, formatArea, pairSlug } from "@/lib/calculators/area-units";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import AreaConverterV2 from "@/components/realestate/premium-v2/tools/AreaConverterV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `Land Area Converter for Haryana — Gaj, Marla, Kanal, Bigha | ${settings?.firmName ?? ""}`,
    description:
      "Convert between gaj, marla, kanal, bigha, biswa, killa and square feet using Haryana values. Instant conversion plus what each unit means for buying property in Gurugram.",
    alternates: { canonical: joinPath(basePathFor(tenant), "/area-converter") },
  };
}

export default async function AreaConverterHubPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const sqft = AREA_UNITS.find((u) => u.slug === "square-feet")!;

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Area Converter", url: p("/area-converter") },
          ]),
        )}
      />

      <AreaConverterV2
        heading="Land Area Converter for Haryana"
        subheading="Gurugram plots are quoted in gaj, marla and kanal, and apartments in square feet. Convert between them using Haryana values — not the national ones, which differ."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Area Converter</span>
          </nav>
        }
      />

      <GpSection tone="cream">
        <GpContainer>
          <GpEyebrow>Units used in Haryana</GpEyebrow>
          <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
            What each unit is worth
          </h2>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[color:var(--gp-body)]">
            The ladder is internally consistent: nine square karam make a marla, twenty marla make a
            kanal, twenty biswa make a bigha, and four bigha or eight kanal make an acre.
          </p>

          <div className="mt-8 overflow-x-auto rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="bg-[color:var(--gp-cream-200)] text-left text-[11px] uppercase tracking-[0.07em] text-[color:var(--gp-muted)]">
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Square feet</th>
                  <th className="px-4 py-3 font-semibold">Square yards (gaj)</th>
                  <th className="px-4 py-3 font-semibold">Convert</th>
                </tr>
              </thead>
              <tbody>
                {AREA_UNITS.filter((u) => u.slug !== "square-feet").map((u) => (
                  <tr key={u.slug} className="border-t border-[color:var(--gp-border)]">
                    <td className="px-4 py-2.5 font-medium text-[color:var(--gp-ink)]">
                      {u.name}
                      {u.stateSpecific ? (
                        <span className="ml-2 rounded-full bg-[color:var(--gp-cream-200)] px-2 py-0.5 text-[10.5px] text-[color:var(--gp-muted)]">
                          Haryana
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--gp-body)]">{formatArea(u.sqft)}</td>
                    <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                      {formatArea(u.sqft / 9)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={p(`/area-converter/${pairSlug(u, sqft)}`)}
                        className="text-[13px] font-semibold text-[color:var(--gp-gold-600)] hover:underline"
                      >
                        to sq ft →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <RelatedCardsV2
            className="mt-12"
            title="Most used conversions"
            items={AREA_UNITS.flatMap((from) =>
              AREA_UNITS.filter((to) => to.slug !== from.slug).map((to) => ({ from, to })),
            )
              .filter(({ from, to }) =>
                ["square-yard", "marla", "kanal", "bigha", "killa"].includes(from.slug) &&
                ["square-feet", "square-yard", "square-metre"].includes(to.slug),
              )
              .map(({ from, to }) => ({
                href: p(`/area-converter/${pairSlug(from, to)}`),
                title: `${from.name} to ${to.name}`,
                subtitle: `1 ${from.name.toLowerCase()} = ${formatArea(convertArea(1, from, to))} ${to.name.toLowerCase()}`,
              }))}
            icon={ArrowLeftRight}
          />
        </GpContainer>
      </GpSection>

    </>
  );
}
