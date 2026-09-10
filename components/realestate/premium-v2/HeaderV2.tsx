"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  Calculator,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Factory,
  FileText,
  HardHat,
  Home,
  KeyRound,
  Landmark,
  Map,
  Menu,
  Phone,
  Ruler,
  Sparkles,
  Store,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./gp-primitives";
import { openLeadPopup } from "./leadPopup";
import { joinPath } from "@/lib/paths";
import BrandMark from "@/components/site/BrandMark";

const NAV_LINK =
  // 12.75px is the 15px this bar used, less 15% — the ask was a quieter nav,
  // and at eight entries the extra room also keeps it on one line.
  "rounded-[var(--gp-radius-sm)] px-2.5 py-2 text-[12.75px] font-semibold uppercase tracking-[0.04em] transition-colors";
const NAV_ACTIVE = "text-[color:var(--gp-gold-300)]";
const NAV_IDLE = "text-white/80 hover:text-white";


interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string;
  children?: NavItem[];
}

/**
 * Icons appear inside the dropdown only. In the bar itself they would turn a
 * row of words into a toolbar and compete with the one gold CTA.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  Home,
  Factory,
  ClipboardCheck,
  HardHat,
  FileText,
  KeyRound,
  Store,
  Sparkles,
  Map,
  Building2,
  Landmark,
  TrendingUp,
  Ruler,
  Compass,
  Calculator,
};

interface ToolLink {
  label: string;
  path: string;
  icon?: string;
}

interface HeaderV2Props {
  firmName: string;
  /** Per-tenant, from firm_settings.logo_url — this template now serves more
   *  than one real-estate client, so the mark can't be a module constant.
   *  Nullable: a client created from the platform dashboard has no logo until
   *  one is uploaded, and this is the only header that renders the mark alone
   *  with no accompanying firm name. */
  logoUrl: string | null;
  phone?: string | null;
  basePath: string;
  navItems: NavItem[];
  /** Calculator and financing hubs, grouped so the main bar stays at seven
   *  items. Passed in rather than hardcoded here: which of them a tenant
   *  publishes (and where EMI lives) is resolved server-side in
   *  lib/premium-v2/tools.ts. */
  toolLinks: ToolLink[];
}

/** One row of a dropdown: icon, label, optional flag. */
function MenuRow({ item }: { item: NavItem }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : undefined;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-white/80 transition-colors hover:bg-white/[0.06] hover:text-[color:var(--gp-gold-300)]"
    >
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="shrink-0 rounded-full bg-[color:var(--gp-gold-600)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--gp-forest-950)]">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/** A bar entry that opens a menu — same hover/focus behaviour as Tools. */
function NavGroup({ item, isActive }: { item: NavItem; isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const active = (item.children ?? []).some((c) => isActive(c.href));
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={cn(NAV_LINK, "inline-flex items-center gap-1", active ? NAV_ACTIVE : NAV_IDLE)}
      >
        {item.label}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 w-64 pt-2">
          <div className="overflow-hidden rounded-[var(--gp-radius-md)] border border-white/12 bg-[color:var(--gp-forest-950)] py-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
            {(item.children ?? []).map((child) => (
              <MenuRow key={child.href} item={child} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Used on every page of this template — not just the hero — so it can't
 * assume a dark hero sits directly beneath it. Transparent-over-hero at the
 * top of the page, solid forest once scrolled, on every route.
 */
export default function HeaderV2({
  firmName,
  logoUrl,
  phone,
  basePath,
  navItems,
  toolLinks,
}: HeaderV2Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Same open/close + Escape pattern as SiteHeader.tsx's mobile menu, moved
  // into a slide-down panel and with focus returned to the trigger on close.
  useEffect(() => {
    if (!mobileOpen) return;
    mobileNavRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setToolsOpen(false);
  }, [pathname]);

  // Several nav items (Buy/Rent/Commercial/New Launches) all point at
  // `/properties` with a different query param — matching on path alone
  // highlighted every one of them at once. A query is only considered a
  // match when its params are actually present in the current URL.
  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    const pathMatches =
      path === basePath || path === `${basePath}/` ? pathname === path : pathname?.startsWith(path);
    if (!pathMatches) return false;
    if (!query) return true;
    const hrefParams = new URLSearchParams(query);
    for (const [key, value] of hrefParams) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  };

  // Transparent-over-hero only applies on the homepage, which has a dark
  // full-bleed image directly beneath the header. Every other page starts
  // with a light (or non-hero) background, so the header must be solid from
  // the first frame there or its white/gold text is unreadable and it
  // visually collides with the page's own breadcrumb/heading underneath it.
  const toolsActive = toolLinks.some((t) => pathname?.startsWith(joinPath(basePath, t.path)));

  const isHome = pathname === basePath || pathname === `${basePath}/`;
  const solid = scrolled || mobileOpen || !isHome;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
        solid
          ? "bg-[color:var(--gp-forest-950)]/95 backdrop-blur"
          : "bg-transparent",
      )}
    >
      <div className="gp-container flex items-center justify-between gap-3 py-4 lg:py-5">
        <Link href={basePath || "/"} className="flex min-w-0 shrink-0 items-center gap-2.5">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={firmName}
              width={220}
              height={73}
              priority
              className="h-14 w-auto object-contain sm:h-16"
            />
          ) : (
            // No logo configured yet — the vertical's built-in mark plus the
            // firm's own name. An unguarded <Image src=""> renders a broken-
            // image icon in the header of every page on the site, which is what
            // a dashboard-created client got before its first logo upload.
            // The name is real data the operator entered; nothing is invented.
            <>
              <BrandMark
                className="h-10 w-auto shrink-0 sm:h-11"
                alt={firmName}
                vertical="realestate"
                onDark
              />
              {/* Capped rather than flex-shrunk: the Link is `shrink-0` so the
                  nav keeps its width, and a long firm name would otherwise
                  push the bar instead of ellipsing. */}
              <span className="font-display max-w-[46vw] truncate text-[19px] leading-tight text-white sm:max-w-70 sm:text-[22px]">
                {firmName}
              </span>
            </>
          )}
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {navItems.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} isActive={isActive} />
            ) : (
            <Link
              key={item.href}
              href={item.href}
              className={cn(NAV_LINK, isActive(item.href) ? NAV_ACTIVE : NAV_IDLE)}
            >
              {item.label}
            </Link>
            ),
          )}

          {/* Tools sit behind a dropdown rather than as top-level items —
              the bar is already at seven links and adding the calculator
              and home-loan hubs inline overflowed it at 1440px. Opens on
              hover for pointer users and on focus for keyboard users. */}
          <div
            className="relative"
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              type="button"
              aria-expanded={toolsOpen}
              aria-haspopup="true"
              onClick={() => setToolsOpen((v) => !v)}
              className={cn(
                NAV_LINK,
                "inline-flex items-center gap-1",
                toolsActive ? NAV_ACTIVE : NAV_IDLE,
              )}
            >
              Calculators
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", toolsOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>

            {toolsOpen ? (
              <div className="absolute left-0 top-full z-50 w-60 pt-2">
                <div className="overflow-hidden rounded-[var(--gp-radius-md)] border border-white/12 bg-[color:var(--gp-forest-950)] py-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
                  {toolLinks.map((tool) => (
                    <MenuRow
                      key={tool.path}
                      item={{
                        label: tool.label,
                        href: joinPath(basePath, tool.path),
                        icon: tool.icon,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="hidden items-center gap-1.5 text-[15px] font-semibold text-white/85 hover:text-white 2xl:inline-flex"
            >
              <Phone className="h-3.5 w-3.5 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
              {phone}
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => openLeadPopup()}
            className="hidden min-h-[42px] items-center rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-5 text-[12.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)] sm:inline-flex"
          >
            Book Consultation
          </button>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--gp-radius-sm)] text-white lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          ref={mobileNavRef}
          className="border-t border-white/10 bg-[color:var(--gp-forest-950)] lg:hidden"
        >
          <nav className="gp-container flex flex-col py-2">
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label}>
                  <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                    {item.label}
                  </p>
                  {item.children.map((child) => {
                    const Icon = child.icon ? NAV_ICONS[child.icon] : undefined;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex min-h-[46px] items-center gap-3 rounded-[var(--gp-radius-sm)] px-2 py-2.5 text-[14.5px]",
                          isActive(child.href)
                            ? "font-semibold text-[color:var(--gp-gold-300)]"
                            : "text-white/85",
                        )}
                      >
                        {Icon ? (
                          <Icon
                            className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {child.badge ? (
                          <span className="shrink-0 rounded-full bg-[color:var(--gp-gold-600)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--gp-forest-950)]">
                            {child.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "min-h-[48px] rounded-[var(--gp-radius-sm)] px-2 py-3 text-[15px]",
                    isActive(item.href) ? "font-semibold text-[color:var(--gp-gold-300)]" : "text-white/85",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
            <p className="mt-3 border-t border-white/10 px-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
              Calculators
            </p>
            {toolLinks.map((tool) => {
              const Icon = tool.icon ? NAV_ICONS[tool.icon] : undefined;
              return (
              <Link
                key={tool.path}
                href={joinPath(basePath, tool.path)}
                className="flex min-h-[44px] items-center gap-3 rounded-[var(--gp-radius-sm)] px-2 py-2.5 text-[14px] text-white/75"
              >
                {Icon ? (
                  <Icon className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-300)]" aria-hidden="true" />
                ) : null}
                {tool.label}
              </Link>
              );
            })}

            <button
              type="button"
              onClick={() => openLeadPopup()}
              className="my-3 inline-flex min-h-[48px] items-center justify-center rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-5 text-[13px] font-semibold uppercase tracking-[0.05em] text-[color:var(--gp-forest-950)]"
            >
              Book Consultation
            </button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
