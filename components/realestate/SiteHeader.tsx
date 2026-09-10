"use client";

import { whatsappHref } from "@/lib/whatsapp";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Phone, MessageCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import BrandMark from "@/components/site/BrandMark";

interface NavItem {
  label: string;
  href: string;
}

interface SiteHeaderProps {
  firmName: string;
  logoUrl: string | null;
  basePath: string;
  phone: string | null;
  whatsapp: string | null;
  /** From firm_settings.country; decides the dialling code. */
  country?: string | null;
  navItems: NavItem[];
  contactHref: string;
}

/**
 * Distinct from the CA vertical's SiteHeader by design, not by accident —
 * "each client gets its own UX structure, built from shared primitives"
 * applies to header/footer too, not just page content. This one matches the
 * approved high-properties-ui-assets mockups: single-row nav, phone/WhatsApp
 * as plain text links, a solid gold CTA rather the CA header's navy one.
 */
export default function SiteHeader({
  firmName,
  logoUrl,
  basePath,
  phone,
  whatsapp,
  country,
  navItems,
  contactHref,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    const path = href.split("?")[0];
    return path === basePath || path === `${basePath}/` ? pathname === path : pathname?.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-tint/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-6 lg:px-8">
        {/* min-w-0, not shrink-0: a long firm name ("Geeta Properties
            Research") must wrap/shrink at phone widths rather than force the
            whole header row wider than the viewport. */}
        <Link href={basePath || "/"} className="flex min-w-0 items-center gap-2">
          <BrandMark className="h-9 w-9 shrink-0" src={logoUrl} alt={firmName} vertical="realestate" />
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[15px] font-semibold uppercase tracking-[0.04em] text-navy sm:text-[19px]">
              {firmName}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[6px] px-3 py-2 text-[13.5px] transition-colors ${
                isActive(item.href) ? "font-semibold text-navy" : "text-ink-muted hover:text-navy"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="hidden items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-navy lg:inline-flex"
            >
              <Phone className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {phone}
            </a>
          ) : null}

          {whatsappHref(whatsapp, country) ? (
            <a
              href={whatsappHref(whatsapp, country)!}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-navy lg:inline-flex"
            >
              <MessageCircle className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              WhatsApp
            </a>
          ) : null}

          {/*
            Wrapped rather than passed via Button's own className: Button's
            base class already sets `inline-flex` unconditionally, which
            beats a `hidden` override in the cascade regardless of viewport
            (both are unconditional utilities; Tailwind's fixed internal
            ordering — not attribute order — decides the winner). A wrapper
            with no competing display utility of its own sidesteps it.
          */}
          <div className="hidden sm:block">
            <Button href={contactHref} variant="accent" size="sm">
              Book Consultation
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-11 w-11 items-center justify-center rounded-[8px] text-navy hover:bg-surface xl:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-tint xl:hidden">
          <nav className="mx-auto flex w-full max-w-7xl flex-col px-5 py-2 sm:px-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`min-h-[46px] rounded-[6px] px-3 py-3 text-[15px] ${
                  isActive(item.href) ? "bg-surface font-semibold text-navy" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Button href={contactHref} variant="accent" className="my-3 w-full">
              Book Consultation
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
