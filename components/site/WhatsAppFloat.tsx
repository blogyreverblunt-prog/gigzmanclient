"use client";

import { whatsappHref } from "@/lib/whatsapp";
import { MessageCircle } from "lucide-react";
import { analytics } from "@/lib/analytics";

interface WhatsAppFloatProps {
  number: string;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  firmName: string;
}

/**
 * Present on the large majority of Indian CA practice sites — clients expect to
 * reach the firm this way, so its absence reads as an incomplete site locally.
 */
export default function WhatsAppFloat({ number, country, firmName }: WhatsAppFloatProps) {
  const href = whatsappHref(number, country, `Hello ${firmName}, I would like to discuss a requirement.`);
  if (!href) return null;


  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => analytics.clickWhatsapp("float", "site")}
      aria-label="Message the firm on WhatsApp"
      className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_4px_16px_rgba(15,39,68,0.24)] transition-transform hover:scale-105 md:bottom-6 md:right-6"
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}
