import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CheckCircle2, ShieldCheck, Signpost, Users } from "lucide-react";
import AdvisorsV2 from "./AdvisorsV2";
import DeveloperRibbonV2 from "./DeveloperRibbonV2";
import BookConsultationButton from "./BookConsultationButton";
import { GpContainer, GpEyebrow, GpSection } from "./gp-primitives";
import { basePathFor, joinPath, type Tenant } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { buildBreadcrumbJsonLd, jsonLdProps } from "@/lib/schema-org";

const IMAGES = "/verticals/realestate/templates/premium-v2/images";
// Not used as a hero anywhere else in Premium V2 (hero-luxury-advisory.png is
// already the closing-CTA image via ConsultationCtaV2, and
// hero-curated-inventory.png is already the homepage/mosaic hero) — this
// variant gets its first use here.
const HERO_IMAGE = `${IMAGES}/hero-curated-inventory-v2.png`;
// Unused elsewhere in Premium V2 — a Gurugram skyline shot for the "Our
// Story" band, distinct from the corridor images already spent on the
// homepage image strip / video testimonials / services mosaic.
const STORY_IMAGE = `${IMAGES}/corridor-new-gurugram.png`;
const DUE_DILIGENCE_IMAGE = `${IMAGES}/due-diligence.webp`;

const TRUST_STATS = [
  { icon: Award, value: "12+", label: "Years in Gurugram" },
  { icon: Users, value: "1,000+", label: "Families Helped" },
  { icon: Signpost, value: "25+", label: "Communities" },
  { icon: ShieldCheck, value: "500+", label: "Curated Listings" },
];

const PRINCIPLES = [
  {
    label: "Local First",
    detail: "Corridor-level knowledge and current on-ground context, not a generic listings feed.",
  },
  {
    label: "Verified",
    detail: "Inventory source and project status checked before anything is shown to you.",
  },
  {
    label: "Unbiased",
    detail: "Options compared before recommendation, with limitations stated clearly.",
  },
  {
    label: "Assisted",
    detail: "One advisor from discovery through site visit and closure — no hand-offs.",
  },
];

const DILIGENCE_CHECKLIST = [
  "RERA and project-status checks",
  "Comparable pricing context",
  "Locality and connectivity review",
  "Document and source verification",
  "Assisted negotiation and site visits",
];

export default async function PremiumV2AboutPage({ tenant }: { tenant: Tenant }) {
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const settings = await getFirmSettings(tenant.id);
  if (!settings) notFound();

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "About", url: p("/firm-profile") },
          ]),
        )}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* Unlike HeroV2 (homepage only), this page's header is always solid
          (isHome is false here), so there's no transparent-header bleed to
          restore — `<main>`'s own top padding already clears the header
          exactly. No negative margin needed. */}
      <section className="relative overflow-hidden bg-navy">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_center]"
        />
        <div className="absolute inset-0" style={{ background: "var(--gp-gradient-hero)" }} />

        <div className="gp-container relative pb-16 pt-12 lg:pb-24 lg:pt-16">
          <div className="max-w-2xl">
            <span className="mb-5 block h-[2px] w-11 bg-[color:var(--gp-gold-600)]" />
            <GpEyebrow className="text-[color:var(--gp-gold-300)]">
              About {settings.firmName}
            </GpEyebrow>
            <h1 className="gp-hero-title font-display mt-4 text-white">
              Local knowledge. Clearer property decisions.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/75 sm:text-base">
              {settings.overview ??
                "Verified inventory, corridor-level intelligence and dedicated advisors, brought together so every decision in Gurugram real estate is made with clarity."}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#advisors"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-7 text-[14px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
              >
                Meet Our Advisors
              </a>
              <a
                href="#principles"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-[var(--gp-radius-sm)] border border-white/35 px-7 text-[14px] font-semibold uppercase tracking-[0.04em] text-white transition-colors hover:border-white"
              >
                Our Approach
              </a>
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/15 pt-8 sm:grid-cols-4">
              {TRUST_STATS.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-start gap-3">
                    <Icon
                      className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--gp-gold-300)]"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="font-sans text-[28px] font-semibold leading-none text-[color:var(--gp-gold-300)]">
                        {stat.value}
                      </dt>
                      <dd className="mt-1 text-[11.5px] leading-snug text-white/65">{stat.label}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Our Story ────────────────────────────────────────────────── */}
      <GpSection tone="cream">
        <GpContainer>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--gp-radius-lg)]">
              <Image
                src={STORY_IMAGE}
                alt="Gurugram skyline"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div>
              <GpEyebrow>Our Story</GpEyebrow>
              <h2 className="gp-section-title font-display mt-3 text-[color:var(--gp-ink)]">
                Built around Gurugram, not a generic database.
              </h2>
              <p className="mt-5 text-[15px] font-medium leading-relaxed text-[color:var(--gp-ink)]">
                We started with one belief: context matters as much as inventory.
              </p>
              <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-[color:var(--gp-body)]">
                {settings.overview ??
                  `${settings.firmName} helps buyers, tenants and investors navigate active listings across the Gurugram corridor — with every listing reviewed before it goes live.`}
              </p>
              <a
                href="#principles"
                className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[color:var(--gp-gold-600)] hover:text-[color:var(--gp-forest-900)]"
              >
                Read Our Advisory Principles →
              </a>
            </div>
          </div>
        </GpContainer>
      </GpSection>

      {/* ── How We Work ──────────────────────────────────────────────── */}
      <div id="principles" className="scroll-mt-24">
        <GpSection tone="cream">
          <GpContainer>
            <GpEyebrow>How We Work</GpEyebrow>
            <h2 className="gp-section-title font-display mt-3 max-w-2xl text-[color:var(--gp-ink)]">
              Four principles behind every recommendation
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((principle) => (
                <div key={principle.label} className="border-t border-[color:var(--gp-border)] pt-5">
                  <p className="font-display text-[15px] text-[color:var(--gp-ink)]">
                    {principle.label}
                  </p>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[color:var(--gp-muted)]">
                    {principle.detail}
                  </p>
                </div>
              ))}
            </div>
          </GpContainer>
        </GpSection>
      </div>

      {/* ── People Before Portals ───────────────────────────────────── */}
      <div id="advisors" className="scroll-mt-24">
        <AdvisorsV2 phone={settings.phone} whatsapp={settings.whatsapp} country={settings.country} />
      </div>

      {/* ── The Work Behind The Shortlist ───────────────────────────── */}
      <GpSection tone="forest">
        <GpContainer>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <GpEyebrow className="text-[color:var(--gp-gold-300)]">
                The Work Behind The Shortlist
              </GpEyebrow>
              <h2 className="gp-section-title font-display mt-3 text-white">
                Due diligence is part of the experience
              </h2>
              <ul className="mt-6 space-y-3.5">
                {DILIGENCE_CHECKLIST.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[color:var(--gp-gold-300)]"
                      aria-hidden="true"
                    />
                    <span className="text-[14.5px] leading-relaxed text-white/80">{item}</span>
                  </li>
                ))}
              </ul>
              <BookConsultationButton className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-6 text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]">
                See Our Process
              </BookConsultationButton>
            </div>

            <div className="space-y-5">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--gp-radius-lg)]">
                <Image
                  src={DUE_DILIGENCE_IMAGE}
                  alt="Due diligence review"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              {/* Compact developer strip — same real, client-confirmed logos
                  as DeveloperRibbonV2's homepage section, placed alongside
                  the due-diligence image rather than duplicated as new
                  markup. */}
              <div className="overflow-hidden rounded-[var(--gp-radius-lg)] bg-white/95 p-4">
                <DeveloperRibbonMiniV2 p={p} />
              </div>
            </div>
          </div>
        </GpContainer>
      </GpSection>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
    </>
  );
}

/**
 * A compact, logo-only reuse of DeveloperRibbonV2's real developer list for
 * this page's "Developer Ecosystem" mini-strip — DeveloperRibbonV2 itself
 * renders a full section (eyebrow, heading, dividers) that doesn't fit next
 * to the due-diligence image, so only the logo array is reused, not the
 * component markup.
 */
function DeveloperRibbonMiniV2({ p }: { p: (path: string) => string }) {
  const DEVELOPERS = [
    { src: "dlf.svg", name: "DLF" },
    { src: "emaar.svg", name: "Emaar" },
    { src: "m3m.webp", name: "M3M", invert: true },
    { src: "conscient.png", name: "Conscient" },
    { src: "ats.svg", name: "ATS" },
    { src: "godrej.svg", name: "Godrej" },
    { src: "hero-homes.jpg", name: "Hero Homes" },
  ];
  const BASE = "/verticals/realestate/templates/premium-v2/developer-logos-v2";

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      {DEVELOPERS.map((developer) => (
        <Link
          key={developer.name}
          href={p(`/properties?developer=${encodeURIComponent(developer.name)}`)}
          className="flex h-9 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
        >
          <Image
            src={`${BASE}/${developer.src}`}
            alt={developer.name}
            width={100}
            height={36}
            className={`max-h-9 w-auto object-contain ${developer.invert ? "invert" : ""}`}
          />
        </Link>
      ))}
    </div>
  );
}
