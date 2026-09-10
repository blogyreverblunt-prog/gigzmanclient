"use client";

import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Mail, MapPin, Phone } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { joinPath } from "@/lib/paths";
import { whatsappHref } from "@/lib/whatsapp";
import WhatsAppIconV2 from "./WhatsAppIconV2";
import SocialIconV2 from "./SocialIconV2";
import { NoiseTextureV2 } from "./NoiseTextureV2";
import type { getFirmSettings } from "@/lib/content";

const EYEBROW = "text-[15px] font-extrabold uppercase tracking-[0.16em] text-[color:var(--gp-gold-300)]";

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
] as const;

interface FooterLink {
  label: string;
  href: string;
}

interface FooterV2Props {
  settings: Awaited<ReturnType<typeof getFirmSettings>>;
  basePath: string;
  /**
   * Computed on the server by `(public)/layout.tsx`. This component is
   * "use client", so it cannot read the tenant row — and the flag must not
   * become an async lookup, because there is no server to await here.
   */
  homeLoanEnabled: boolean;
}

export default function FooterV2({ settings, basePath, homeLoanEnabled }: FooterV2Props) {
  // Non-null when rendered — layout.tsx already 404s before this ever mounts
  // without settings — but the prop type stays nullable to match the shared
  // getFirmSettings() return signature, so this narrows once, locally.
  if (!settings) return null;

  const p = (path: string) => joinPath(basePath, path);

  const quickLinks: FooterLink[] = [
    { label: "Home", href: p("/") },
    { label: "Properties", href: p("/properties") },
    { label: "Sectors", href: p("/sectors") },
    { label: "Builders", href: p("/builders") },
    { label: "Localities", href: p("/localities") },
    { label: "Plot Maps", href: p("/maps/gurgaon") },
    { label: "Calculators", href: p("/calculators") },
    { label: "Contact", href: p("/contact") },
  ];

  const discoverLinks: FooterLink[] = [
    { label: "Buy", href: p("/properties?purpose=buy") },
    { label: "Rent", href: p("/properties?purpose=rent") },
    { label: "Commercial", href: p("/properties?type=commercial") },
    { label: "Projects by sector", href: p("/sectors") },
    { label: "Projects by builder", href: p("/builders") },
    { label: "Localities", href: p("/localities") },
  ];

  const resourceLinks: FooterLink[] = [
    { label: "Market Updates", href: p("/updates") },
    ...(homeLoanEnabled ? [{ label: "Home Loans", href: p("/home-loan") }] : []),
    { label: "Rental Yield", href: p("/rental-yield") },
    { label: "Area Converter", href: p("/area-converter") },
    { label: "Vastu", href: p("/vastu") },
    { label: "Plot Maps", href: p("/maps/gurgaon") },
    { label: "Calculators", href: p("/calculators") },
    { label: "FAQ", href: p("/faq") },
  ];

  const legalLinks: FooterLink[] = [
    { label: "Privacy", href: p("/legal/privacy-policy") },
    { label: "Terms", href: p("/legal/terms-of-use") },
    { label: "Disclaimer", href: p("/legal/disclaimer") },
  ];

  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s/g, "")}` : null;
  const waHref = whatsappHref(settings.whatsapp, settings.country);
  const socialLinks = (settings.socialLinks ?? {}) as Record<string, string>;

  const addressParts = [settings.addressLine, settings.locality, settings.region, settings.postalCode].filter(
    Boolean,
  );

  return (
    <footer className="text-white">
      <div className="relative overflow-hidden" style={{ background: "var(--gp-gradient-dark-section)" }}>
        <NoiseTextureV2 tint="green" noiseOpacity={0.75} slope={0.22} />
        <div className="gp-container relative z-[1] py-16 sm:py-20">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1fr]">
            <div>
              {settings.logoUrl ? (
                <Link href={basePath || "/"} className="inline-block">
                  <Image
                    src={settings.logoUrl}
                    alt={settings.firmName}
                    width={294}
                    height={98}
                    className="h-[77px] w-auto object-contain"
                  />
                </Link>
              ) : null}
              <p className="mt-4 max-w-[260px] text-[17px] leading-relaxed text-white/65">
                Premium Gurugram property discovery, market intelligence and local advisory.
              </p>

              {/* Real handles pending from the client — links fall back to
                  the contact page rather than a fabricated external URL or
                  a dead `#` link. */}
              <div className="mt-5 flex items-center gap-2.5">
                {SOCIAL_PLATFORMS.map((platform) => {
                  const href = socialLinks[platform.key] || p("/contact");
                  return (
                    <a
                      key={platform.key}
                      href={href}
                      target={socialLinks[platform.key] ? "_blank" : undefined}
                      rel={socialLinks[platform.key] ? "noopener noreferrer" : undefined}
                      aria-label={platform.label}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white transition-colors hover:border-white hover:bg-white/10"
                    >
                      <SocialIconV2 platform={platform.key} className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <FooterColumn title="Quick Links" links={quickLinks} />
            <FooterColumn title="Property Discovery" links={discoverLinks} />
            <FooterColumn title="Resources" links={resourceLinks} />

            <div>
              <p className={EYEBROW}>Get in Touch</p>
              <ul className="mt-4 space-y-3 text-[17px] leading-relaxed text-white/75">
                {addressParts.length > 0 ? (
                  <li className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                    <span>{addressParts.join(", ")}</span>
                  </li>
                ) : null}

                {telHref ? (
                  <li className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                    <a
                      href={telHref}
                      onClick={() => analytics.clickCall("footer", "home")}
                      className="font-semibold hover:text-[color:var(--gp-gold-300)]"
                    >
                      {settings.phone}
                    </a>
                  </li>
                ) : null}

                {waHref ? (
                  <li className="flex items-center gap-2.5">
                    <WhatsAppIconV2 className="h-4 w-4 shrink-0" />
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => analytics.clickWhatsapp("footer", "home")}
                      className="hover:text-[color:var(--gp-gold-300)]"
                    >
                      WhatsApp
                    </a>
                  </li>
                ) : null}

                {settings.email ? (
                  <li className="flex items-center gap-2.5">
                    <Mail className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                    <a href={`mailto:${settings.email}`} className="hover:text-[color:var(--gp-gold-300)]">
                      {settings.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-6 border-t border-white/12 pt-6 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-3xl text-[15px] leading-relaxed text-white/50">
              Property information, availability and market figures on this website are indicative and
              subject to verification. Where a listing shows a RERA registration number, confirm it on
              the relevant state RERA authority&apos;s website before relying on it; where none is
              shown, registration is pending. Buyers should complete independent legal and financial
              due diligence before transacting.
            </p>

            <a
              href="https://gigzman.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-3 self-start rounded-[var(--gp-radius-sm)] bg-white px-4 py-3 transition-opacity hover:opacity-90"
            >
              <span className="block text-[10px] font-semibold uppercase leading-tight tracking-[0.09em] text-[color:var(--gp-muted)]">
                Managed &amp;
                <br />
                developed by
              </span>
              <Image
                src="/brand/gigzman-logo.png"
                alt="Gigzman"
                width={368}
                height={96}
                className="h-6 w-auto"
              />
            </a>
          </div>

          <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/12 pt-6 text-[15px] text-white/50">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </Link>
            ))}
            {/* Staff entry point. Sits with the legal links rather than in a
                content column so it reads as site plumbing, not a service —
                the dashboard is behind a sign-in and robots.txt disallows it
                either way. */}
            <Link
              href={p("/dashboard")}
              className="ml-auto inline-flex items-center gap-1.5 hover:text-white"
            >
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Admin Dashboard
            </Link>
          </nav>
        </div>
      </div>

      <div className="bg-black">
        <div className="gp-container py-5 text-[13px] text-white/60">
          <p>
            © {new Date().getFullYear()} {settings.firmName}. All rights reserved.
            <span className="mx-2 text-white/30" aria-hidden="true">|</span>
            <a
              href="https://gigzman.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[color:var(--gp-gold-300)] hover:text-[color:var(--gp-gold-600)]"
            >
              Managed &amp; Developed by Gigzman
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className={EYEBROW}>{title}</p>
      <ul className="mt-4 space-y-2.5 text-[17px] text-white/75">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-[color:var(--gp-gold-300)]">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
