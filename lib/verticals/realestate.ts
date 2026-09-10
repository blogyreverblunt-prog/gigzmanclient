import type { VerticalConfig } from "./types";

/**
 * Real estate agency / broker.
 *
 * The regulatory notice and registration label are the RERA analogue of the
 * ICAI block on the CA vertical — the Real Estate (Regulation and Development)
 * Act requires property advertisements to carry a registration number, so the
 * same "always show it, or show that it's pending" discipline applies here.
 */
export const realestate: VerticalConfig = {
  id: "realestate",
  label: "Real Estate",
  summary:
    "Property listings, locality market pages and buyer calculators, with enquiries flowing into the same dashboard.",

  schemaType: "RealEstateAgent",

  // Matches the high-properties-ui-assets mockups' nav exactly: Buy/Rent/
  // Commercial/New Launches read as distinct nav items but are really
  // `/properties` filtered by purpose/type/status via query params — no new
  // routes needed, PropertyFilters already drives off the same params.
  // "About" is the public-facing label for `/firm-profile`. Market updates
  // still ship at `/updates` and are linked from the footer — they were pulled
  // out of the top nav to make room for Sectors and Builders.
  nav: [
    // Everything that is a cut of the same inventory sits behind one menu:
    // eight sibling links read as a toolbar, and Sectors/Builders had pushed
    // the bar to wrapping at 1440px. Buy/Rent/Commercial/Properties are
    // `/properties` filtered by query param — PropertyFilters already drives
    // off the same params, so no extra routes. Sectors and Builders are real
    // routes, each entry beneath them its own indexable page.
    {
      label: "Explore Properties",
      path: "/properties",
      children: [
        { label: "Buy", path: "/properties?purpose=buy", icon: "Home" },
        { label: "Rent", path: "/properties?purpose=rent", icon: "KeyRound" },
        { label: "Commercial", path: "/properties?type=commercial", icon: "Store" },
        { label: "Properties", path: "/properties?status=new_launch", icon: "Sparkles", badge: "New" },
        { label: "Sectors", path: "/sectors", icon: "Map" },
        { label: "Builders & Developers", path: "/builders", icon: "Building2" },
      ],
    },
    // The service lines get their own menu rather than a single link: they
    // are what the firm sells, and each entry is a different page (or a
    // different filtered cut of the inventory), so burying them one level
    // deeper than the property filters would be the wrong way round.
    {
      label: "Services",
      path: "/#services",
      children: [
        { label: "Residential", path: "/properties?purpose=buy", icon: "Home" },
        { label: "Commercial", path: "/properties?type=commercial", icon: "Building2" },
        { label: "Industrial", path: "/properties?type=industrial", icon: "Factory" },
        { label: "Property Management", path: "/property-management", icon: "ClipboardCheck" },
        { label: "Construction & Vastu", path: "/#construction", icon: "HardHat" },
        { label: "Home Loans", path: "/calculators/emi", icon: "Landmark" },
        { label: "A–Z Documentation", path: "/#documentation", icon: "FileText" },
      ],
    },
    { label: "Maps", path: "/maps/gurgaon" },
    { label: "About", path: "/firm-profile" },
  ],

  footer: {
    quickLinks: [
      { label: "Home", path: "/" },
      { label: "Properties", path: "/properties" },
      { label: "Localities", path: "/localities" },
      { label: "About", path: "/firm-profile" },
      { label: "Contact", path: "/contact" },
    ],
    resourceLinks: [
      { label: "Market Insights", path: "/updates" },
      { label: "Plot Maps", path: "/maps/gurgaon" },
      { label: "Calculators", path: "/calculators" },
    ],
    externalLinks: [
      { label: "HRERA (Haryana RERA)", url: "https://haryanarera.gov.in" },
      { label: "MCA", url: "https://www.mca.gov.in" },
    ],
    legalSlugs: [
      { label: "Privacy Policy", slug: "privacy-policy" },
      { label: "Terms of Use", slug: "terms-of-use" },
      { label: "Disclaimer", slug: "disclaimer" },
      { label: "Calculator Disclaimer", slug: "calculator-disclaimer" },
      { label: "Cookie Notice", slug: "cookie-notice" },
    ],
    regulatoryNotice:
      "Property information on this website is published for general reference. Under the Real Estate (Regulation and Development) Act, 2016, advertisements for a registered project must carry its RERA registration number; where a listing does not yet show one, registration is pending and the listing should be treated as provisional. Carpet area, price, possession timeline and specifications are subject to confirmation and change by the developer and the relevant authority.",
    registrationLabel: "RERA Regn.",
  },

  dashboardNav: [
    { label: "Overview", path: "/dashboard", icon: "LayoutDashboard", adminOnly: false },
    { label: "Enquiries", path: "/dashboard/queries", icon: "Inbox", adminOnly: false },
    { label: "Properties", path: "/dashboard/properties", icon: "Building2", adminOnly: false },
    { label: "Localities", path: "/dashboard/localities", icon: "MapPin", adminOnly: false },
    { label: "Insights", path: "/dashboard/updates", icon: "FileText", adminOnly: false },
    { label: "Calculators", path: "/dashboard/calculators", icon: "Calculator", adminOnly: true },
    { label: "Team", path: "/dashboard/team", icon: "Users", adminOnly: true },
    { label: "Offices", path: "/dashboard/offices", icon: "MapPinned", adminOnly: true },
    { label: "Settings", path: "/dashboard/settings", icon: "Settings", adminOnly: true },
  ],

  sitemapPaths: [
    { path: "", priority: 1 },
    { path: "/properties", priority: 0.9 },
    { path: "/localities", priority: 0.8 },
    { path: "/calculators", priority: 0.7 },
    { path: "/calculators/emi", priority: 0.6 },
    { path: "/calculators/stamp-duty", priority: 0.6 },
    { path: "/calculators/rental-yield", priority: 0.6 },
    { path: "/updates", priority: 0.6 },
    { path: "/firm-profile", priority: 0.6 },
    { path: "/contact", priority: 0.8 },
    { path: "/legal/privacy-policy", priority: 0.2 },
    { path: "/legal/terms-of-use", priority: 0.2 },
    { path: "/legal/disclaimer", priority: 0.2 },
    { path: "/legal/calculator-disclaimer", priority: 0.2 },
    { path: "/legal/cookie-notice", priority: 0.2 },
  ],

  serviceCategories: [
    { value: "buy", label: "Buy" },
    { value: "sell", label: "Sell" },
    { value: "lease", label: "Lease" },
    { value: "advisory", label: "Advisory" },
  ],

  calculatorKeys: ["emi", "stamp-duty", "rental-yield"],

  defaults: {
    // No professional-body restriction on reviews applies to a real-estate agency.
    reviewsEnabled: true,
  },
};
