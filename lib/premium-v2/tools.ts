import { homeLoanEnabled } from "@/lib/home-loan/enabled";
import type { FeatureHost } from "@/lib/features";
import { joinPath } from "@/lib/paths";

/**
 * The calculators this template actually publishes.
 *
 * There used to be two generations of these: the database-driven
 * `/calculators/{key}` set (EMI, stamp duty, rental yield) rendered in the
 * original panel UI, and the newer purpose-built tool pages. They duplicated
 * each other and sent the same intent to two different designs, so the old
 * set is retired — this list is the single source of truth for the Tools
 * menu, the /calculators index and the home page's tools section.
 *
 * Stamp duty is deliberately absent: it had no rebuilt equivalent, and the
 * rates it applied were never professionally verified for the period.
 */
export interface ToolLink {
  key: string;
  label: string;
  /** Lucide icon name, rendered in the header menu and the calculators index. */
  icon: string;
  /** One line saying what the tool answers — used as the card's subheading. */
  blurb: string;
  path: string;
}

export function toolLinksFor(host: FeatureHost | null | undefined): ToolLink[] {
  return [
    {
      key: "emi",
      icon: "Landmark",
      label: "Home Loan EMI",
      blurb: "Monthly instalment, total interest and the full cost of the loan.",
      // Tenants with a lender relationship get the fuller financing hub;
      // everyone else gets the same calculator on its own page.
      path: homeLoanEnabled(host) ? "/home-loan" : "/calculators/emi",
    },
    {
      key: "rental-yield",
      icon: "TrendingUp",
      label: "Rental Yield & Payback",
      blurb: "Gross and net yield on a let-out property, and years to payback.",
      path: "/rental-yield",
    },
    {
      key: "area-converter",
      icon: "Ruler",
      label: "Area Converter",
      blurb: "Gaj, marla, kanal and bigha to square feet, at Haryana values.",
      path: "/area-converter",
    },
    {
      key: "vastu",
      icon: "Compass",
      label: "Vastu Calculator",
      blurb: "Score a home room by room against traditional directional guidance.",
      path: "/vastu",
    },
  ];
}

/** The same list with each `path` already joined onto the tenant's base path. */
export function toolHrefsFor(host: FeatureHost | null | undefined, basePath: string) {
  return toolLinksFor(host).map((tool) => ({
    ...tool,
    href: joinPath(basePath, tool.path),
  }));
}
