"use client";

import { whatsappHref } from "@/lib/whatsapp";
import Image from "next/image";
import { Phone } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { GpContainer, GpSection, GpEyebrow } from "./gp-primitives";
import WhatsAppIconV2 from "./WhatsAppIconV2";

interface Advisor {
  slug: string;
  name: string;
  corridor: string;
  specialisation: string;
  portrait: string;
}

const ADVISORS: Advisor[] = [
  {
    slug: "arjun-mehta",
    name: "Arjun Mehta",
    corridor: "Golf Course Road",
    specialisation: "Luxury high-rises and branded residences",
    portrait: "/verticals/realestate/templates/premium-v2/people/advisor-arjun-mehta.png",
  },
  {
    slug: "isha-kapoor",
    name: "Isha Kapoor",
    corridor: "Dwarka Expressway",
    specialisation: "New launches and pre-RERA opportunities",
    portrait: "/verticals/realestate/templates/premium-v2/people/advisor-isha-kapoor.png",
  },
  {
    slug: "neha-rao",
    name: "Neha Rao",
    corridor: "Sohna Road",
    specialisation: "Independent villas and low-rise living",
    portrait: "/verticals/realestate/templates/premium-v2/people/advisor-neha-rao.png",
  },
  {
    slug: "rahul-sen",
    name: "Rahul Sen",
    corridor: "Commercial Corridors",
    specialisation: "Commercial assets and rental-yield portfolios",
    portrait: "/verticals/realestate/templates/premium-v2/people/advisor-rahul-sen.png",
  },
];

export default function AdvisorsV2({
  phone,
  whatsapp,
  country,
}: {
  phone?: string | null;
  whatsapp?: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
}) {
  return (
    <GpSection id="advisors" tone="cream" className="overflow-hidden">
      <GpContainer>
        <GpEyebrow>Meet Your Advisors</GpEyebrow>
        <h2 className="gp-section-title font-display mt-3 text-[color:var(--gp-ink)]">
          Local Expertise, By Corridor
        </h2>
        <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-[color:var(--gp-muted)]">
          Every corridor in Gurugram moves differently. Our advisors specialise deeply rather than
          broadly, so the person you speak to already knows the street.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {ADVISORS.map((advisor) => (
            <article
              key={advisor.slug}
              className="group relative flex flex-col justify-end overflow-hidden rounded-[var(--gp-radius-lg)]"
              style={{
                background:
                  "radial-gradient(120% 100% at 50% 0%, var(--gp-forest-700) 0%, var(--gp-forest-950) 78%)",
              }}
            >
              {/* Portrait cutout sits directly on the gradient — no white/box background behind it, per client rule. */}
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={advisor.portrait}
                  alt={`${advisor.name}, real estate advisor for ${advisor.corridor}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  className="object-cover object-top"
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "var(--gp-gradient-card)" }}
                />
              </div>

              <div className="relative px-5 pb-6 pt-2">
                <p className="gp-eyebrow text-[color:var(--gp-gold-300)]">{advisor.corridor}</p>
                <h3 className="font-display mt-1.5 text-[18px] text-white">{advisor.name}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                  {advisor.specialisation}
                </p>

                <div className="mt-4 flex items-center gap-3">
                  {phone ? (
                    <a
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      onClick={() => analytics.clickCall("advisor_panel", "home")}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[var(--gp-radius-sm)] border border-white/30 px-3.5 text-[12.5px] font-medium text-white transition-colors hover:border-[color:var(--gp-gold-300)] hover:text-[color:var(--gp-gold-300)]"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      Call
                    </a>
                  ) : null}
                  {whatsappHref(whatsapp, country) ? (
                    <a
                      href={whatsappHref(whatsapp, country)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => analytics.clickWhatsapp("advisor_panel", "home")}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-3.5 text-[12.5px] font-semibold text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
                    >
                      <WhatsAppIconV2 className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </GpContainer>
    </GpSection>
  );
}
