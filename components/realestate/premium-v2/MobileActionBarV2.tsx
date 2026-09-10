"use client";

import { whatsappHref } from "@/lib/whatsapp";
import { MapPin, Phone } from "lucide-react";
import { analytics } from "@/lib/analytics";
import WhatsAppIconV2 from "./WhatsAppIconV2";

/**
 * Mobile-only sticky bar: call, WhatsApp, directions. Below `sm` only —
 * WhatsAppFloatV2 takes over from `sm` up.
 */
export default function MobileActionBarV2({
  phone,
  whatsapp,
  country,
  firmName,
  googleMapsUrl,
}: {
  phone?: string | null;
  whatsapp?: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  firmName: string;
  googleMapsUrl?: string | null;
}) {
  const telHref = phone ? `tel:${phone.replace(/\s/g, "")}` : null;

  const waHref = whatsappHref(
    whatsapp,
    country,
    `Hello ${firmName}, I would like to discuss a requirement.`,
  );

  if (!telHref && !waHref && !googleMapsUrl) return null;

  const ITEM =
    "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[color:var(--gp-forest-950)] pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="flex items-stretch">
        {telHref ? (
          <a
            href={telHref}
            onClick={() => analytics.clickCall("mobile_bar", "site")}
            className={`${ITEM} text-white`}
          >
            <Phone className="h-5 w-5 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
            Call
          </a>
        ) : null}

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => analytics.clickWhatsapp("mobile_bar", "site")}
            className={`${ITEM} bg-[#25D366] text-white`}
          >
            <WhatsAppIconV2 className="h-5 w-5" />
            WhatsApp Now
          </a>
        ) : null}

        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ITEM} text-white`}
          >
            <MapPin className="h-5 w-5 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
            Directions
          </a>
        ) : null}
      </div>
    </div>
  );
}
