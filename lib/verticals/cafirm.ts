import type { VerticalConfig } from "./types";

/**
 * Chartered accountancy practice.
 *
 * The regulatory notice and the reviews default both come from ICAI's Code of
 * Ethics, which prohibits a practice soliciting work or publishing testimonials
 * on its own website.
 */
export const cafirm: VerticalConfig = {
  id: "cafirm",
  label: "Chartered Accountancy",
  summary:
    "Practice website with a service catalogue, statutory calendar, indicative calculators and an enquiry pipeline.",

  schemaType: "AccountingService",

  nav: [
    { label: "Firm Profile", path: "/firm-profile" },
    { label: "Services", path: "/services" },
    { label: "Calculators", path: "/calculators" },
    { label: "Updates", path: "/updates" },
    { label: "Calendar", path: "/compliance-calendar" },
    { label: "Contact", path: "/contact" },
  ],

  footer: {
    quickLinks: [
      { label: "Home", path: "/" },
      { label: "Firm Profile", path: "/firm-profile" },
      { label: "Services", path: "/services" },
      { label: "Compliance Calendar", path: "/compliance-calendar" },
      { label: "Careers", path: "/careers" },
      { label: "Contact", path: "/contact" },
    ],
    resourceLinks: [
      { label: "Professional Updates", path: "/updates" },
      { label: "Knowledge Centre", path: "/knowledge" },
      { label: "Calculators", path: "/calculators" },
      { label: "FAQs", path: "/faq" },
    ],
    // Links to regulatory portals are expressly permitted under the ICAI guidelines.
    externalLinks: [
      { label: "Income Tax e-Filing", url: "https://www.incometax.gov.in" },
      { label: "GST Portal", url: "https://www.gst.gov.in" },
    ],
    legalSlugs: [
      { label: "Privacy Policy", slug: "privacy-policy" },
      { label: "Terms of Use", slug: "terms-of-use" },
      { label: "Disclaimer", slug: "disclaimer" },
      { label: "Calculator Disclaimer", slug: "calculator-disclaimer" },
      { label: "Cookie Notice", slug: "cookie-notice" },
    ],
    regulatoryNotice:
      "In accordance with the Chartered Accountants Act, 1949 and the guidelines issued by the Institute of Chartered Accountants of India, this website is not an advertisement and does not solicit work. There has been no advertisement, personal communication, solicitation, invitation or inducement of any kind from the firm to create a professional relationship through this website. Information published here is made available only at the visitor’s own request and for their own information.",
    registrationLabel: "ICAI FRN",
  },

  dashboardNav: [
    { label: "Overview", path: "/dashboard", icon: "LayoutDashboard", adminOnly: false },
    { label: "Queries", path: "/dashboard/queries", icon: "Inbox", adminOnly: false },
    { label: "Updates", path: "/dashboard/updates", icon: "FileText", adminOnly: false },
    { label: "Compliance", path: "/dashboard/compliance", icon: "CalendarClock", adminOnly: false },
    { label: "Calculators", path: "/dashboard/calculators", icon: "Calculator", adminOnly: true },
    { label: "Team", path: "/dashboard/team", icon: "Users", adminOnly: true },
    { label: "Offices", path: "/dashboard/offices", icon: "MapPinned", adminOnly: true },
    { label: "Settings", path: "/dashboard/settings", icon: "Settings", adminOnly: true },
  ],

  sitemapPaths: [
    { path: "", priority: 1 },
    { path: "/firm-profile", priority: 0.8 },
    { path: "/services", priority: 0.9 },
    { path: "/calculators", priority: 0.7 },
    { path: "/calculators/income-tax", priority: 0.6 },
    { path: "/calculators/tds", priority: 0.6 },
    { path: "/calculators/gst", priority: 0.6 },
    { path: "/updates", priority: 0.7 },
    { path: "/compliance-calendar", priority: 0.7 },
    { path: "/knowledge", priority: 0.6 },
    { path: "/faq", priority: 0.6 },
    { path: "/careers", priority: 0.5 },
    { path: "/contact", priority: 0.8 },
    { path: "/legal/privacy-policy", priority: 0.2 },
    { path: "/legal/terms-of-use", priority: 0.2 },
    { path: "/legal/disclaimer", priority: 0.2 },
    { path: "/legal/calculator-disclaimer", priority: 0.2 },
    { path: "/legal/cookie-notice", priority: 0.2 },
  ],

  serviceCategories: [
    { value: "taxation", label: "Taxation" },
    { value: "gst", label: "GST & Indirect Tax" },
    { value: "audit_assurance", label: "Audit & Assurance" },
    { value: "business_corporate", label: "Business & Corporate" },
  ],

  calculatorKeys: ["income-tax", "tds", "gst"],

  defaults: {
    // ICAI prohibits testimonials and ratings on a practice's own website.
    reviewsEnabled: false,
  },
};
