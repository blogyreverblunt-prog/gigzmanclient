import { whatsappHref } from "@/lib/whatsapp";
import Link from "next/link";
import {
  BedDouble,
  Bath,
  Ruler,
  Building2,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Hammer,
  KeyRound,
  Sparkles,
  Tag,
  BadgeCheck,
  CircleSlash,
  type LucideIcon,
} from "lucide-react";
import PremiumV2PropertyGallery from "./PremiumV2PropertyGallery";
import PremiumV2EnquiryForm from "./PremiumV2EnquiryForm";
import PremiumV2CallLink from "./PremiumV2CallLink";
import PremiumV2WhatsappLink from "./PremiumV2WhatsappLink";
import PropertyCardV2 from "./PropertyCardV2";
import { GpContainer } from "./gp-primitives";
import { amenityIcon, statIcon } from "./amenity-icons";
import { joinPath, type Tenant } from "@/lib/tenant";
import type { properties, propertyImages, firmSettings } from "@/lib/db/schema";
import {
  formatIndianPrice,
  formatNumber,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_PURPOSE_LABELS,
} from "@/lib/format";

type Property = typeof properties.$inferSelect;
type PropertyImage = typeof propertyImages.$inferSelect;
type FirmSettings = typeof firmSettings.$inferSelect;

interface SimilarEntry {
  property: Property;
  imagePath?: string | null;
  imageAlt?: string;
}

/* ------------------------------------------------------------------ helpers */

/**
 * Listings sourced from the HRERA register carry their filing in `specs`
 * (a flat Record<string,string> — see scripts/rera-to-properties.mjs). Reading
 * through this keeps track of which keys a dedicated section already rendered,
 * so the catch-all table at the bottom shows only what is left and nothing the
 * authority published is silently dropped.
 */
function specReader(specs: Record<string, string>) {
  const used = new Set<string>();
  const get = (key: string) => {
    const v = specs[key];
    if (v != null && v !== "") {
      used.add(key);
      return v;
    }
    return undefined;
  };
  return {
    get,
    /** First numeric token, so "2,118" and "72%" both read cleanly. */
    num(key: string) {
      const v = get(key);
      if (!v) return undefined;
      const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : undefined;
    },
    prefixed(prefix: string) {
      return Object.entries(specs)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => {
          used.add(k);
          return [k.slice(prefix.length), v] as const;
        });
    },
    rest() {
      return Object.entries(specs).filter(([k]) => !used.has(k));
    },
  };
}

/**
 * A filing reads as a set of discrete records, so each block is a bordered
 * panel with its own header and a note of which part of Form REP-I it came
 * from. Panel, type and radii all come from the template's own scale.
 */
function Sec({ title, prov, children }: { title: string; prov?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[color:var(--gp-border)] px-5 py-4 sm:px-6">
        <h2 className="font-display text-[17px] font-semibold text-[color:var(--gp-ink)]">{title}</h2>
        {prov ? (
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--gp-muted)]">
            {prov}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** Key/value rows on hairlines, matching the template's specification list. */
function Rows({ rows }: { rows: [string, string | undefined][] }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="max-w-2xl divide-y divide-[color:var(--gp-border)]">
      {shown.map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3 text-[13.5px]">
          <dt className="text-[color:var(--gp-muted)]">{k}</dt>
          <dd className="min-w-0 break-words text-left font-medium text-[color:var(--gp-ink)] sm:text-right">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatCards({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  if (!items.length) return null;
  return (
    <dl className="flex flex-wrap overflow-hidden rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
      {items.map((f) => (
        <div
          key={f.label}
          className="min-w-0 flex-1 basis-[150px] border-b border-r border-[color:var(--gp-border)] px-4 py-3.5 last:border-r-0"
        >
          <dt className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--gp-muted)]">
            {(() => {
              const Icon = statIcon(f.label);
              return <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--gp-gold-600)]" aria-hidden="true" />;
            })()}
            <span className="truncate">{f.label}</span>
          </dt>
          <dd
            className="mt-1.5 break-words text-[17px] font-semibold leading-snug"
            style={{ color: f.tone ?? "var(--gp-ink)" }}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--gp-border)] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em]";

/** A badge earns its icon from what it actually says, not from its position. */
const STATUS_ICON: Record<string, LucideIcon> = {
  new_launch: Sparkles,
  under_construction: Hammer,
  ready_to_move: KeyRound,
};

function badgeIcon(label: string): LucideIcon {
  if (/lapsed|cancel/i.test(label)) return CircleSlash;
  if (/past|overdue|delay/i.test(label)) return AlertTriangle;
  if (/unsold|units/i.test(label)) return Tag;
  if (/rera|registered/i.test(label)) return BadgeCheck;
  if (/ongoing/i.test(label)) return Hammer;
  if (/new project/i.test(label)) return Sparkles;
  return Tag;
}

/* --------------------------------------------------------------------- page */

export default function PremiumV2PropertyDetailPage({
  tenant,
  property,
  images,
  settings,
  similarProperties,
  basePath,
}: {
  tenant: Tenant;
  property: Property;
  images: PropertyImage[];
  settings: FirmSettings;
  similarProperties: SimilarEntry[];
  basePath: string;
}) {
  const p = (path: string) => joinPath(basePath, path);

  const priceDisplay =
    property.priceLabel || (property.price ? formatIndianPrice(property.price) : "Price on request");
  const hasPrice = Boolean(property.price);
  const locationLine = [property.locality, property.sector ? `Sector ${property.sector}` : null]
    .filter(Boolean)
    .join(", ");

  const telHref = settings.phone ? `tel:${settings.phone.replace(/\s/g, "")}` : null;
  const waLink = whatsappHref(
    settings.whatsapp,
    settings.country,
    `Hi, I'm interested in ${property.title} (${p(`/properties/${property.slug}`)})`,
  );

  const specs = (property.specs && typeof property.specs === "object" ? property.specs : {}) as Record<
    string,
    string
  >;
  const amenities = Array.isArray(property.amenities) ? property.amenities : [];
  const s = specReader(specs);

  /* ---- the filing, read once ---- */
  const reg = s.get("RERA registration");
  const validTo = s.get("RERA valid up to");
  const allRegs = s.get("All registrations");
  const regCount = s.get("Registrations on file");
  const licence = s.get("Town planning licence");
  const licensee = s.get("Licensee");
  const promoterIsLicensee = s.get("Promoter is licensee");
  const cin = s.get("Promoter CIN");
  const stage = s.get("Project stage");
  const landArea = s.get("Land area");
  const farP = s.get("Permissible FAR");
  const farProp = s.get("Proposed FAR");

  const unitsTotal = s.num("Total units");
  const unitsBooked = s.num("Units booked");
  const unitsUnsold = s.num("Units unsold");
  const soldPct = s.num("Sold through");
  const plotRange = s.get("Plot size range");
  const unitTypes = s.get("Unit types filed");

  const completion = s.get("Declared completion");
  const infraPct = s.num("Infrastructure complete");
  const deliveryStatus = s.get("Delivery status");
  const layoutDate = s.get("Layout plan approved");
  const buildingDate = s.get("Building plan approved");

  const approvals = s.get("Statutory approvals");
  const extSummary = s.get("External service approvals");
  const extRows = s.prefixed("External — ");
  const parking = s.get("Parking bays");
  const projectCost = s.get("Project cost");
  const litigation = s.get("Litigation declared");
  const sourceLabel = s.get("Source");
  const sourceUrl = s.get("Source record");
  const mapUrl = s.get("Map");
  const restSpecs = s.rest();

  /** True for register-sourced listings; hand-written ones keep the unit-shaped layout. */
  const isFiling = Boolean(reg || landArea || approvals);
  const overdue = deliveryStatus?.toLowerCase().includes("past") ?? false;

  const DANGER = "var(--color-status-danger)";
  const WARN = "var(--color-status-warn)";

  const headlineStats: { label: string; value: string; tone?: string }[] = isFiling
    ? [
        ...(landArea ? [{ label: "Land area", value: landArea }] : []),
        ...(unitsTotal ? [{ label: "Units filed", value: formatNumber(unitsTotal) }] : []),
        ...(unitsUnsold != null ? [{ label: "Unsold", value: formatNumber(unitsUnsold) }] : []),
        ...(plotRange ? [{ label: "Plot sizes", value: plotRange }] : []),
        ...(completion
          ? [{ label: "Declared completion", value: completion, tone: overdue ? DANGER : undefined }]
          : []),
        ...(infraPct != null ? [{ label: "Built", value: `${infraPct}%` }] : []),
        ...(projectCost ? [{ label: "Project cost", value: projectCost }] : []),
      ]
    : [];

  const configItems = [
    property.beds ? { icon: BedDouble, value: `${property.beds} BHK`, label: "Bedrooms" } : null,
    property.baths ? { icon: Bath, value: String(property.baths), label: "Bathrooms" } : null,
    property.area
      ? {
          icon: Ruler,
          value: `${formatNumber(property.area)} ${property.areaUnit ?? "sqft"}`,
          label: property.areaUnit === "acres" ? "Project area" : "Area",
        }
      : null,
    {
      icon: Building2,
      value: PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType,
      label: "Type",
    },
  ].filter(Boolean) as { icon: typeof BedDouble; value: string; label: string }[];

  const verification: [string, string | undefined, string | undefined][] = [
    [
      "RERA status",
      property.isActive ? "Active" : "Lapsed",
      property.isActive ? "var(--gp-success)" : DANGER,
    ],
    ["Valid to", validTo, undefined],
    ["Statutory approvals", approvals, undefined],
    ["External connections", extSummary, undefined],
    ["Declared completion", completion, undefined],
    [
      "Delivery",
      deliveryStatus ? (overdue ? "Overdue" : "Within timeline") : undefined,
      overdue ? DANGER : "var(--gp-success)",
    ],
    ["Litigation declared", litigation ?? "Not stated", undefined],
  ];

  return (
    <div className="bg-[color:var(--gp-cream-100)]">
      {/* The registration, up front — it is what makes this listing checkable
          rather than merely advertised. */}
      {isFiling ? (
        <div className="border-b border-[color:var(--gp-border)] bg-[color:var(--gp-cream-200)]">
          <GpContainer>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 py-2.5 text-[11.5px] text-[color:var(--gp-body)]">
              <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.08em] text-[color:var(--gp-success)]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                HRERA verified
              </span>
              {reg ? (
                <span className="min-w-0 break-words">
                  Reg <b className="text-[color:var(--gp-ink)]">{reg}</b>
                </span>
              ) : null}
              {validTo ? (
                <span>
                  Valid to <b className="text-[color:var(--gp-ink)]">{validTo}</b>
                </span>
              ) : null}
              {licence ? (
                <span className="min-w-0 break-words">
                  TCP licence <b className="text-[color:var(--gp-ink)]">{licence}</b>
                </span>
              ) : null}
            </div>
          </GpContainer>
        </div>
      ) : null}

      <GpContainer className="pt-6 sm:pt-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-[12px] text-[color:var(--gp-muted)]">
          <Link href={p("/")} className="inline-block py-1 hover:text-[color:var(--gp-gold-600)]">
            Home
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={p("/properties")} className="inline-block py-1 hover:text-[color:var(--gp-gold-600)]">
            Properties
          </Link>
          {property.locality ? (
            <>
              <span className="mx-1.5">/</span>
              <Link
                href={p(`/properties?locality=${encodeURIComponent(property.locality)}`)}
                className="inline-block py-1 hover:text-[color:var(--gp-gold-600)]"
              >
                {property.locality}
              </Link>
            </>
          ) : null}
          <span className="mx-1.5">/</span>
          <span className="text-[color:var(--gp-ink)]">{property.title}</span>
        </nav>

        <PremiumV2PropertyGallery
          images={images.map((img) => ({ path: img.path, alt: img.alt }))}
          propertyType={property.propertyType}
          title={property.title}
          propertyId={property.id}
          videoUrl={property.videoUrl}
          // Evergreen's farmhouse feed ships no usable photography; see the
          // note at the top of its properties.yaml.
          illustrativeImages={tenant.slug === "evergreen-real-estate"}
        />
      </GpContainer>

      <GpContainer className="gp-section !pt-8 sm:!pt-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="min-w-0 space-y-6">
            {/* ---------------------------------------------------- headline */}
            <div className="min-w-0 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white px-5 py-6 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const StatusIcon = STATUS_ICON[property.status] ?? Tag;
                  return (
                    <span
                      className={`${PILL} border-transparent bg-[color:var(--gp-gold-600)] text-[color:var(--gp-forest-950)]`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {PROPERTY_STATUS_LABELS[property.status] ?? property.status}
                    </span>
                  );
                })()}
                <span className={`${PILL} text-[color:var(--gp-body)]`}>
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  {PROPERTY_PURPOSE_LABELS[property.purpose] ?? property.purpose}
                </span>
                {property.badge
                  ? (() => {
                      const BadgeIcon = badgeIcon(property.badge!);
                      return (
                        <span
                          className={PILL}
                          style={
                            overdue || /lapsed/i.test(property.badge!)
                              ? { color: DANGER, borderColor: DANGER }
                              : { color: "var(--gp-body)" }
                          }
                        >
                          <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {property.badge}
                        </span>
                      );
                    })()
                  : null}
                {stage
                  ? (() => {
                      const StageIcon = badgeIcon(stage);
                      return (
                        <span className={`${PILL} text-[color:var(--gp-body)]`}>
                          <StageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {stage}
                        </span>
                      );
                    })()
                  : null}
              </div>

              <h1 className="gp-section-title font-display mt-4 text-[color:var(--gp-ink)]">
                {property.title}
              </h1>

              {/* Two independent facts, not one sentence — a hard separator
                  strands itself at the end of a line once these wrap. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] text-[color:var(--gp-body)]">
                {property.developer ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2
                      className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-600)]"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-[color:var(--gp-ink)]">{property.developer}</span>
                  </span>
                ) : null}
                {locationLine ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-600)]" aria-hidden="true" />
                    {locationLine}
                  </span>
                ) : null}
              </div>

              {/* A listing leads with price. Where the register carries none we
                  say so rather than inventing a band. */}
              <p className="mt-5 font-sans text-[32px] font-semibold leading-tight text-[color:var(--gp-gold-600)]">
                {priceDisplay}
                {hasPrice && property.purpose === "rent" ? (
                  <span className="ml-1.5 text-[14px] font-normal text-[color:var(--gp-muted)]">
                    / month
                  </span>
                ) : null}
              </p>
              <p className="mt-1 max-w-2xl text-[12.5px] text-[color:var(--gp-muted)]">
                {hasPrice && property.pricePerSqft
                  ? `${formatIndianPrice(property.pricePerSqft)} per sqft`
                  : isFiling
                    ? "HRERA filings carry no unit pricing — we confirm the current band with the developer."
                    : "Share your requirement and we will confirm the current band."}
              </p>

              {telHref || waLink ? (
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {telHref ? <PremiumV2CallLink telHref={telHref} phone={settings.phone!} /> : null}
                  {waLink ? (
                    <PremiumV2WhatsappLink whatsappHref={waLink} propertyId={property.id} />
                  ) : null}
                </div>
              ) : null}

              {/* Same honesty rule as PropertyCard: a listing without a
                  registration number visibly says so rather than omitting it. */}
              <div className="mt-5 flex items-start gap-2 border-t border-[color:var(--gp-border)] pt-5">
                {property.reraNumber ? (
                  <>
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-success)]"
                      aria-hidden="true"
                    />
                    <p className="min-w-0 break-words text-[13px] leading-relaxed text-[color:var(--gp-body)]">
                      <span className="font-semibold text-[color:var(--gp-ink)]">RERA registered</span> —{" "}
                      {property.reraNumber}
                      {validTo ? `, valid to ${validTo}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <ShieldAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gp-gold-600)]"
                      aria-hidden="true"
                    />
                    <p className="text-[13px] leading-relaxed text-[color:var(--gp-body)]">
                      <span className="font-semibold text-[color:var(--gp-ink)]">Registration pending</span> —
                      this project&rsquo;s RERA number has not been published yet. Treat this listing as
                      provisional.
                      {property.developer ? ` Developer: ${property.developer}` : ""}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* --------------------------------------------- headline stats */}
            {isFiling ? <StatCards items={headlineStats} /> : null}

            {/* Unit-shaped strip stays for the hand-written listings. */}
            {!isFiling ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {configItems.map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white p-4 text-center"
                  >
                    <item.icon
                      className="mx-auto h-[18px] w-[18px] text-[color:var(--gp-gold-600)]"
                      aria-hidden="true"
                    />
                    <p className="mt-2 break-words text-[14.5px] font-semibold text-[color:var(--gp-ink)]">
                      {item.value}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.04em] text-[color:var(--gp-muted)]">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ------------------------------------------------ availability */}
            {unitsTotal && unitsBooked != null && unitsUnsold != null ? (
              <Sec title="Availability" prov="REP-I Part C">
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-[color:var(--gp-cream-200)]"
                  role="img"
                  aria-label={`${unitsBooked} of ${unitsTotal} units booked`}
                >
                  <span
                    className="block h-full bg-[color:var(--gp-gold-600)]"
                    style={{ width: `${Math.min(100, (unitsBooked / unitsTotal) * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-[color:var(--gp-body)]">
                  <span>
                    Booked <b className="text-[color:var(--gp-ink)]">{formatNumber(unitsBooked)}</b>
                  </span>
                  <span>
                    Unsold <b className="text-[color:var(--gp-ink)]">{formatNumber(unitsUnsold)}</b>
                  </span>
                  {soldPct != null ? (
                    <span>
                      Sold through <b className="text-[color:var(--gp-ink)]">{soldPct}%</b>
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[color:var(--gp-body)]">
                  The promoter declared {formatNumber(unitsUnsold)} unsold units in its last filing.
                  Availability moves between quarterly filings — ask us to confirm current stock before
                  you commit.
                </p>
              </Sec>
            ) : null}

            {/* --------------------------------------------- configurations */}
            {unitTypes || plotRange ? (
              <Sec title="Configurations" prov="REP-I Part C">
                {plotRange ? (
                  <p className="text-[14px] text-[color:var(--gp-body)]">
                    Plot sizes filed: <b className="text-[color:var(--gp-ink)]">{plotRange}</b>
                  </p>
                ) : null}
                {unitTypes ? (
                  <ul className="mt-2 max-w-2xl divide-y divide-[color:var(--gp-border)]">
                    {[...new Set(unitTypes.split(" · "))].map((t) => (
                      <li key={t} className="break-words py-2.5 text-[13.5px] text-[color:var(--gp-body)]">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Sec>
            ) : null}

            {/* -------------------------------------------------- delivery */}
            {completion || infraPct != null ? (
              <Sec title="Delivery status" prov="REP-I Part C">
                <StatCards
                  items={[
                    ...(infraPct != null ? [{ label: "Infrastructure", value: `${infraPct}%` }] : []),
                    ...(completion ? [{ label: "Declared completion", value: completion }] : []),
                    ...(deliveryStatus
                      ? [
                          {
                            label: "Status",
                            value: overdue ? "Overdue" : "On schedule",
                            tone: overdue ? DANGER : "var(--gp-success)",
                          },
                        ]
                      : []),
                    ...(layoutDate ? [{ label: "Layout approved", value: layoutDate }] : []),
                    ...(buildingDate && buildingDate !== "NA"
                      ? [{ label: "Building plan", value: buildingDate }]
                      : []),
                  ]}
                />
                {overdue ? (
                  <p className="mt-4 flex max-w-2xl items-start gap-2 text-[14px] leading-relaxed text-[color:var(--gp-body)]">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: DANGER }}
                      aria-hidden="true"
                    />
                    <span>
                      The completion date the promoter filed has already passed
                      {infraPct != null ? `, with infrastructure reported ${infraPct}% complete` : ""}.
                      Treat the handover date as unmet until a fresh quarterly progress report says
                      otherwise.
                    </span>
                  </p>
                ) : null}
              </Sec>
            ) : null}

            {/* ------------------------------------------------- approvals */}
            {approvals || extRows.length ? (
              <Sec title="Approvals &amp; compliance" prov="REP-I Part E">
                {approvals ? (
                  <p className="text-[14px] text-[color:var(--gp-body)]">
                    Statutory approvals: <b className="text-[color:var(--gp-ink)]">{approvals}</b>
                  </p>
                ) : null}

                {extRows.length ? (
                  <dl className="mt-3 max-w-2xl divide-y divide-[color:var(--gp-border)]">
                    {extRows.map(([name, val]) => {
                      const ok = /approved/i.test(val);
                      return (
                        <div
                          key={name}
                          className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3 text-[13.5px]"
                        >
                          <dt className="text-[color:var(--gp-muted)]">{name}</dt>
                          <dd
                            className="min-w-0 break-words text-left font-medium sm:text-right"
                            style={{ color: ok ? "var(--gp-success)" : WARN }}
                          >
                            {val}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}

                {extSummary ? (
                  <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[color:var(--gp-body)]">
                    Agency sign-off for external connections stands at{" "}
                    <b className="text-[color:var(--gp-ink)]">{extSummary}</b>. Internal approvals and
                    external connections are separate gates — worth raising both before you book.
                  </p>
                ) : null}
              </Sec>
            ) : null}

            {/* ------------------------------------------------- amenities */}
            {amenities.length > 0 ? (
              <Sec title="Amenities" prov={isFiling ? "REP-I Part C" : undefined}>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {amenities.map((item) => {
                    const Icon = amenityIcon(item);
                    return (
                      <li
                        key={item}
                        className="flex min-w-0 items-center gap-2.5 border-b border-dotted border-[color:var(--gp-border)] py-3 text-[13.5px] text-[color:var(--gp-body)] last:border-0"
                      >
                        <Icon
                          className="h-4 w-4 shrink-0 text-[color:var(--gp-gold-600)]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 break-words">{item}</span>
                      </li>
                    );
                  })}
                </ul>
                {isFiling ? (
                  <p className="mt-4 max-w-2xl text-[12.5px] text-[color:var(--gp-muted)]">
                    These are the facilities the promoter costed into its service plan estimates — not a
                    marketing list.{parking ? ` Parking bays filed: ${parking}.` : ""}
                  </p>
                ) : null}
              </Sec>
            ) : null}

            {/* -------------------------------------------- licence & legal */}
            {isFiling ? (
              <Sec title="Licence &amp; legal" prov="REP-I Part B">
                <Rows
                  rows={[
                    ["RERA registration", reg],
                    ["All registrations", allRegs],
                    ["Registrations on file", regCount],
                    ["Valid up to", validTo],
                    ["Town planning licence", licence],
                    ["Licensee on record", licensee],
                    ["Promoter is licensee", promoterIsLicensee],
                    ["Promoter CIN", cin],
                    ["Permissible FAR", farP],
                    ["Proposed FAR", farProp],
                    ["Litigation declared", litigation],
                  ]}
                />
                {promoterIsLicensee === "No" && licensee ? (
                  <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[color:var(--gp-body)]">
                    The land licence is held by {licensee}, not by the promoter. That is normal for a
                    collaboration project, but it means the agreement chain runs through two entities —
                    check both before signing.
                  </p>
                ) : null}
              </Sec>
            ) : null}

            {/* ----------------------------------------------- description */}
            {property.description ? (
              <Sec title={isFiling ? "About this project" : "About this property"}>
                <p className="max-w-2xl text-[15px] leading-relaxed text-[color:var(--gp-body)]">
                  {property.description}
                </p>
              </Sec>
            ) : null}

            {/* ------------------------- anything in the filing not shown above */}
            {restSpecs.length > 0 ? (
              <Sec title={isFiling ? "Rest of the filing" : "Specifications"} prov={isFiling ? "REP-I" : undefined}>
                <Rows rows={restSpecs.map(([k, v]) => [k, v] as [string, string])} />
              </Sec>
            ) : null}

            {/* -------------------------------------------------- location */}
            {mapUrl ? (
              <Sec title="Location" prov="REP-I Part A">
                {locationLine ? (
                  <p className="text-[14px] text-[color:var(--gp-body)]">{locationLine}</p>
                ) : null}
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[color:var(--gp-border)] px-5 py-2.5 text-[13px] font-semibold text-[color:var(--gp-gold-600)] hover:border-[color:var(--gp-gold-600)]"
                >
                  Open in Google Maps
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Sec>
            ) : null}

            <p className="px-1 text-[11.5px] leading-relaxed text-[color:var(--gp-muted)]">
              {isFiling
                ? `Every figure on this page is as declared by the promoter to ${sourceLabel ?? "HRERA Gurugram"} and is not independently verified by us. Registration status and availability can change between filings.`
                : "Carpet area, price and possession timeline are indicative and subject to confirmation and change by the developer and the relevant authority."}
              {sourceUrl ? (
                <>
                  {" "}
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[color:var(--gp-gold-600)] underline"
                  >
                    View the source filing
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>

          {/* ------------------------------------------------------- rail */}
          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <div className="space-y-4">
              <div
                className="rounded-[var(--gp-radius-lg)] p-6 sm:p-7"
                style={{ background: "var(--gp-gradient-glass)" }}
              >
                <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">Interested?</p>
                <h3 className="gp-overlay-title font-display mt-2 text-[color:var(--gp-ink)]">
                  {unitsUnsold != null
                    ? `${formatNumber(unitsUnsold)} units unsold at last filing`
                    : "Enquire about this property"}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--gp-body)]">
                  Share your details and {settings.firmName ?? "the team"} will confirm what is actually
                  available, the current price band and site-visit slots.
                </p>
                <div className="mt-6 border-t border-[color:var(--gp-border)] pt-6">
                  <PremiumV2EnquiryForm
                    basePath={basePath}
                    propertySlug={property.slug}
                    propertyId={property.id}
                    context={[property.title, locationLine].filter(Boolean).join(", ")}
                  />
                </div>
              </div>

              {isFiling ? (
                <div className="rounded-[var(--gp-radius-lg)] border border-[color:var(--gp-border)] bg-white p-6">
                  <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">Verification summary</p>
                  <dl className="mt-3 divide-y divide-[color:var(--gp-border)] text-[13px]">
                    {verification
                      .filter(([, v]) => v)
                      .map(([k, v, tone]) => (
                        <div key={k} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                          <dt className="text-[color:var(--gp-body)]">{k}</dt>
                          <dd
                            className="min-w-0 break-words text-left font-semibold sm:text-right"
                            style={{ color: tone ?? "var(--gp-ink)" }}
                          >
                            {v}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-[color:var(--gp-muted)]">
                    Taken from the promoter&rsquo;s own HRERA filing. We publish it unedited, including
                    what it says against the project.
                  </p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </GpContainer>

      {similarProperties.length > 0 ? (
        <div className="gp-section !pt-0">
          <GpContainer>
            <p className="gp-eyebrow text-[color:var(--gp-gold-600)]">You May Also Like</p>
            <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
              Similar Properties
            </h2>
            <div className="gp-mobile-carousel mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {similarProperties.map(({ property: item, imagePath, imageAlt }) => (
                <PropertyCardV2
                  key={item.id}
                  property={item}
                  href={p(`/properties/${item.slug}`)}
                  imagePath={imagePath}
                  imageAlt={imageAlt}
                />
              ))}
            </div>
          </GpContainer>
        </div>
      ) : null}
    </div>
  );
}
