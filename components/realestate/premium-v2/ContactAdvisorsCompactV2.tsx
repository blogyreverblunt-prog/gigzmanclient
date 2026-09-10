"use client";

import { whatsappHref } from "@/lib/whatsapp";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { GpContainer, GpEyebrow, GpSection } from "./gp-primitives";
import WhatsAppIconV2 from "./WhatsAppIconV2";

interface Advisor {
  slug: string;
  name: string;
  corridor: string;
  specialisation: string;
  portrait: string;
}

/**
 * Same four advisors as the homepage's AdvisorsV2 — no new names invented.
 * Three are shown here (the commercial specialist is dropped) since this is
 * a secondary, denser panel below the main enquiry form, not the homepage's
 * full roster; "Meet all advisors" links back to the homepage section for
 * the complete set of four.
 */
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
];

export default function ContactAdvisorsCompactV2({
  phone,
  whatsapp,
  country,
  advisorsHref,
}: {
  phone?: string | null;
  whatsapp?: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  advisorsHref: string;
}) {
  return (
    <GpSection tone="cream">
      <GpContainer>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <GpEyebrow>Prefer a Specialist?</GpEyebrow>
            <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
              Contact a Local Advisor
            </h2>
          </div>
          <Link
            href={advisorsHref}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[color:var(--gp-gold-600)] hover:text-[color:var(--gp-forest-900)]"
          >
            Meet all advisors
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ADVISORS.map((advisor) => (
            <article
              key={advisor.slug}
              className="group relative flex flex-col justify-end overflow-hidden rounded-[var(--gp-radius-md)]"
              style={{
                background:
                  "radial-gradient(120% 100% at 50% 0%, var(--gp-forest-700) 0%, var(--gp-forest-950) 78%)",
              }}
            >
              {/* Same transparent-cutout-on-gradient treatment as AdvisorsV2 —
                  no white/box background — just a shorter portrait crop to
                  keep this panel denser than the homepage version. */}
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={advisor.portrait}
                  alt={`${advisor.name}, real estate advisor for ${advisor.corridor}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover object-top"
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "var(--gp-gradient-card)" }}
                />
              </div>

              <div className="relative px-4 pb-4 pt-2">
                <p className="gp-eyebrow text-[color:var(--gp-gold-300)]">{advisor.corridor}</p>
                <h3 className="font-display mt-1 text-[15px] text-white">{advisor.name}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-white/65">
                  {advisor.specialisation}
                </p>

                <div className="mt-3 flex items-center gap-2.5">
                  {phone ? (
                    <a
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      onClick={() => analytics.clickCall("advisor_panel", "contact")}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-[var(--gp-radius-sm)] border border-white/30 px-3 text-[12px] font-medium text-white transition-colors hover:border-[color:var(--gp-gold-300)] hover:text-[color:var(--gp-gold-300)]"
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
                      onClick={() => analytics.clickWhatsapp("advisor_panel", "contact")}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-3 text-[12px] font-semibold text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
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
