import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings, getLocalities } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";
import { formatInr } from "@/lib/format";
import RentalYieldCalculatorV2 from "@/components/realestate/premium-v2/tools/RentalYieldCalculatorV2";
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
    title: `How Long Until Your Gurugram Property Pays for Itself? | ${settings?.firmName ?? ""}`,
    description:
      "Work out rental yield and payback years for a Gurugram property — floor by floor, counting vacancy and appreciation, not just a single rent figure.",
    alternates: { canonical: joinPath(basePathFor(tenant), "/rental-yield") },
  };
}

export default async function RentalYieldHubPage(props: Props) {
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const localities = await getLocalities(tenant.id);
  const priced = localities.filter((l) => l.rentalYieldPercent && l.avgPricePerSqft);

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Rental Yield", url: p("/rental-yield") },
          ]),
        )}
      />

      <RentalYieldCalculatorV2
        heading="How long until your property pays for itself?"
        subheading="Most yield calculators stop at a percentage. This one asks how many floors you actually let, what each earns, and how long the building takes to return what it cost."
        initialValue={20000000}
        initialAppreciation={8}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">Rental Yield</span>
          </nav>
        }
      />

      {priced.length > 0 ? (
        <GpSection tone="cream">
          <GpContainer>
            <GpEyebrow>Corridor by corridor</GpEyebrow>
            <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
              Where rent pays back fastest in Gurugram
            </h2>
            <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[color:var(--gp-body)]">
              Gurugram yields are low by national standards, so rent alone takes decades. The
              corridors that look best on rent are rarely the ones that have appreciated fastest —
              both columns are shown so the trade-off is visible.
            </p>

            <div className="mt-8 overflow-x-auto rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
              <table className="w-full min-w-[620px] text-[14px]">
                <thead>
                  <tr className="bg-[color:var(--gp-cream-200)] text-left text-[11px] uppercase tracking-[0.07em] text-[color:var(--gp-muted)]">
                    <th className="px-4 py-3 font-semibold">Corridor</th>
                    <th className="px-4 py-3 font-semibold">Avg. rate</th>
                    <th className="px-4 py-3 font-semibold">Gross yield</th>
                    <th className="px-4 py-3 font-semibold">Payback on rent</th>
                    <th className="px-4 py-3 font-semibold">With appreciation</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((l) => {
                    const gy = l.rentalYieldPercent ?? 0;
                    const yoy = l.yoyChangePercent ?? 0;
                    const rentOnly = gy > 0 ? 100 / gy : null;
                    const combined = gy + yoy > 0 ? 100 / (gy * 0.9 + yoy) : null;
                    return (
                      <tr key={l.id} className="border-t border-[color:var(--gp-border)]">
                        <td className="px-4 py-2.5">
                          <Link
                            href={p(`/rental-yield/${l.slug}`)}
                            className="font-medium text-[color:var(--gp-ink)] hover:text-[color:var(--gp-gold-600)]"
                          >
                            {l.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                          {formatInr(l.avgPricePerSqft ?? 0)}/sq.ft
                        </td>
                        <td className="px-4 py-2.5 text-[color:var(--gp-body)]">{gy.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                          {rentOnly ? `${Math.round(rentOnly)} yrs` : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[color:var(--gp-gold-600)]">
                          {combined ? `${Math.round(combined)} yrs` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-[color:var(--gp-muted)]">
              Corridor rates and yields are our own working estimates pending independent
              verification, not certified valuations.
            </p>
          </GpContainer>
        </GpSection>
      ) : null}

    </>
  );
}
