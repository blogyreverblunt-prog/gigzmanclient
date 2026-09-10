"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  CalendarClock,
  Calculator,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Building2,
  MapPin,
  MapPinned,
  Users,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/lib/actions/auth-actions";
import { joinPath } from "@/lib/paths";
import type { DashboardNavItem } from "@/lib/verticals";

/** Resolves the icon name string stored in each vertical's dashboardNav config. */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Inbox,
  FileText,
  CalendarClock,
  Calculator,
  Settings,
  Building2,
  MapPin,
  MapPinned,
  Users,
};

interface DashboardChromeProps {
  firmName: string;
  basePath: string;
  siteHref: string;
  navItems: DashboardNavItem[];
  user: { name: string | null; email: string; role: "admin" | "editor" };
  children: React.ReactNode;
}

export default function DashboardChrome({
  firmName,
  basePath,
  siteHref,
  navItems,
  user,
  children,
}: DashboardChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = navItems.filter((item) => !item.adminOnly || user.role === "admin");

  const isActive = (path: string) => {
    const href = joinPath(basePath, path);
    return path === "/dashboard" ? pathname === href : pathname?.startsWith(href);
  };

  const nav = (
    <nav className="space-y-1">
      {items.map((item) => {
        const href = joinPath(basePath, item.path);
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex min-h-[42px] items-center gap-3 rounded-[8px] px-3 text-[14px] transition-colors ${
              active ? "bg-white/12 font-medium text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-4">
      <Link
        href={siteHref}
        className="flex min-h-[40px] items-center gap-3 rounded-[8px] px-3 text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white"
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        View website
      </Link>
      <form action={logout}>
        <input type="hidden" name="redirectTo" value={joinPath(basePath, "/dashboard/login")} />
        <button
          type="submit"
          className="flex min-h-[40px] w-full items-center gap-3 rounded-[8px] px-3 text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-tint">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between bg-navy p-4 lg:flex">
        <div>
          <div className="px-3 py-3">
            <p className="text-[14px] font-semibold leading-tight text-white">{firmName}</p>
            <p className="mt-0.5 text-[11px] text-white/45">Website management</p>
          </div>
          <div className="mt-4">{nav}</div>
        </div>
        <div>
          <div className="px-3 pb-3">
            <p className="truncate text-[12px] text-white/70">{user.name ?? user.email}</p>
            <p className="mt-0.5 text-[11px] capitalize text-white/40">{user.role}</p>
          </div>
          {footer}
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col justify-between bg-navy p-4">
            <div>
              <div className="flex items-start justify-between px-3 py-3">
                <div>
                  <p className="text-[14px] font-semibold leading-tight text-white">{firmName}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">Website management</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="-mr-1 flex h-8 w-8 items-center justify-center rounded-[6px] text-white/60 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">{nav}</div>
            </div>
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-[8px] text-navy hover:bg-tint"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-[14px] font-semibold text-ink">{firmName}</p>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
