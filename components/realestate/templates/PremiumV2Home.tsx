import { basePathFor, joinPath, type Tenant } from "@/lib/tenant";
import {
  getFirmSettings,
  getTeam,
  getProperties,
  getPropertyImagesFor,
  getLocalities,
} from "@/lib/content";
import HeroV2 from "../premium-v2/HeroV2";
import ImageStripV2 from "../premium-v2/ImageStripV2";
import ServicesMosaicV2 from "../premium-v2/ServicesMosaicV2";
import DocumentationV2 from "../premium-v2/DocumentationV2";
import ConstructionVastuV2 from "../premium-v2/ConstructionVastuV2";
import NewLaunchesV2 from "../premium-v2/NewLaunchesV2";
import CorridorPanoramaV2 from "../premium-v2/CorridorPanoramaV2";
import HotPropertiesGridV2 from "../premium-v2/HotPropertiesGridV2";
import ShortlistCtaV2 from "../premium-v2/ShortlistCtaV2";
import DeveloperRibbonV2 from "../premium-v2/DeveloperRibbonV2";
import AdvisorsV2 from "../premium-v2/AdvisorsV2";
import MarketIntelligenceV2 from "../premium-v2/MarketIntelligenceV2";
import CalculatorsV2 from "../premium-v2/CalculatorsV2";
import RecentDealsV2 from "../premium-v2/RecentDealsV2";
import VideoTestimonialsV2 from "../premium-v2/VideoTestimonialsV2";
import FaqV2 from "../premium-v2/FaqV2";
import MapEmbedV2 from "../premium-v2/MapEmbedV2";
import MapSelectedPropertyV2 from "../premium-v2/MapSelectedPropertyV2";
import MapsCarouselV2 from "../premium-v2/maps/MapsCarouselV2";
import PropertyManagementV2 from "../premium-v2/PropertyManagementV2";
import {
  propertyMapSectionEnabled,
  propertyManagementSectionEnabled,
} from "@/lib/premium-v2/home-sections";
import { toolHrefsFor } from "@/lib/premium-v2/tools";
import { heroCopyFor } from "@/lib/premium-v2/positioning";
import { serviceLinesFor } from "@/lib/premium-v2/services";

const HERO_IMAGE = "/verticals/realestate/templates/premium-v2/images/hero-curated-inventory-v2.png";

/**
 * Flagship/mid/tall picks for the HOT-properties asymmetric grid (section 6)
 * are matched by the `badge` values seeded in
 * clients/geeta-properties/content/properties.yaml — "Flagship" and "Yield
 * Asset" each identify exactly one listing there. The two mid slots are
 * fixed slugs rather than a generic filter, since the asymmetric grid needs
 * exactly two, not "however many happen to match a rule".
 */
export default async function PremiumV2Home({ tenant }: { tenant: Tenant }) {
  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);

  const [settings, team, allProperties, localities] = await Promise.all([
    getFirmSettings(tenant.id),
    getTeam(tenant.id),
    getProperties(tenant.id, {}),
    getLocalities(tenant.id),
  ]);

  if (!settings) return null;

  // One batched query instead of one per property — see getPropertyImagesFor.
  const imagesByProperty = await getPropertyImagesFor(allProperties.map((p) => p.id));
  const imageMap = Object.fromEntries(
    allProperties.map((property) => {
      const images = imagesByProperty[property.id] ?? [];
      const primary = images.find((img) => img.isPrimary) ?? images[0] ?? null;
      return [
        property.id,
        primary ? { path: primary.path, alt: primary.alt ?? undefined } : undefined,
      ] as const;
    }),
  );

  const newlyLaunched = allProperties.filter((prop) => prop.status === "new_launch").slice(0, 4);

  const flagship =
    allProperties.find((prop) => prop.badge === "Flagship") ??
    allProperties.find((prop) => prop.isFeatured) ??
    allProperties[0];
  const tallProperty =
    allProperties.find((prop) => prop.badge === "Yield Asset") ??
    allProperties.find((prop) => prop.propertyType === "commercial") ??
    allProperties[1];
  const midCandidates = allProperties.filter(
    (prop) => prop.id !== flagship?.id && prop.id !== tallProperty?.id,
  );
  const midProperties: [typeof allProperties[number], typeof allProperties[number]] = [
    midCandidates[0] ?? allProperties[2],
    midCandidates[1] ?? allProperties[3],
  ];

  // Trust-row figures counted from this client's own inventory rather than
  // asserted, so they cannot drift from what the listings actually show. A
  // `claim` stat keeps whatever value the positioning file states — those are
  // the client's assertions (years in business, families placed), which no
  // query can verify.
  const heroCopy = heroCopyFor(tenant, settings.firmName);
  const medianOf = (values: number[]) => {
    const sorted = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const medianPlot = medianOf(allProperties.map((row) => Number(row.area)));
  const medianPrice = medianOf(allProperties.map((row) => Number(row.price)));

  const heroStats = heroCopy.stats.map((stat) => {
    const value =
      stat.kind === "claim"
        ? (stat.value ?? "—")
        : stat.kind === "listings"
          ? allProperties.length.toLocaleString("en-IN")
          : stat.kind === "corridors"
            ? // The corridors the site actually publishes a page for, not every
              // distinct locality string in the inventory — a scraped feed
              // carries dozens of those and the number stops meaning anything.
              String(localities.length)
            : stat.kind === "medianPlot"
              ? medianPlot
                ? `${(medianPlot / 43560).toFixed(2).replace(/\.00$/, "")} acre`
                : "—"
              : medianPrice
                ? `₹${(medianPrice / 1e7).toFixed(1)} Cr`
                : "—";
    return { label: stat.label, value, icon: stat.icon };
  });

  const advisorName = team[0]?.name ?? settings.firmName;
  const fullAddress = [settings.addressLine, settings.locality, settings.region, settings.postalCode]
    .filter(Boolean)
    .join(", ");
  // Exact pin from the client's listing; see MapEmbedV2 on why the address
  // string alone is not enough.
  const mapCoordinates =
    settings.latitude && settings.longitude ? `${settings.latitude},${settings.longitude}` : null;

  // The asymmetric HOT-properties grid needs exactly four listings and takes
  // them as required props, so it cannot render for a client with fewer.
  //
  // This used to `return null` from the whole component, which skipped the
  // ENTIRE home page rather than the one grid — the comment said "skip it"
  // and meant the section. It was unreachable while every tenant was seeded
  // from YAML with a full inventory. CD-03b made it reachable and normal: a
  // client created from the dashboard starts with no properties at all, so
  // its brand-new site rendered a blank page with a footer and nothing else.
  const hotProperties =
    flagship && tallProperty && midProperties[0] && midProperties[1]
      ? { flagship, tallProperty, midProperties }
      : null;

  return (
    <>
      <HeroV2
        basePath={basePath}
        heroImageSrc={HERO_IMAGE}
        firmName={settings.firmName}
        copy={heroCopy}
        stats={heroStats}
      />
      <ImageStripV2 basePath={basePath} />
      <ServicesMosaicV2 p={p} services={serviceLinesFor(tenant.slug)} />
      <DocumentationV2 p={p} phone={settings.phone} />
      <NewLaunchesV2 properties={newlyLaunched} imageMap={imageMap} p={p} />
      <CorridorPanoramaV2 localities={localities} basePath={basePath} />
      {hotProperties ? (
        <HotPropertiesGridV2
          flagship={hotProperties.flagship}
          midProperties={hotProperties.midProperties}
          tallProperty={hotProperties.tallProperty}
          imageMap={imageMap}
          p={p}
        />
      ) : null}
      <ShortlistCtaV2 whatsapp={settings.whatsapp} country={settings.country} firmName={settings.firmName} />
      <DeveloperRibbonV2 p={p} />
      <AdvisorsV2 phone={settings.phone} whatsapp={settings.whatsapp} country={settings.country} />
      <MarketIntelligenceV2 localities={localities} basePath={basePath} />
      {propertyMapSectionEnabled(tenant) ? (
        <MapSelectedPropertyV2
          properties={allProperties.slice(0, 8)}
          imageMap={imageMap}
          basePath={basePath}
          googleMapsUrl={settings.googleMapsUrl}
        />
      ) : null}
      <MapsCarouselV2 basePath={basePath} />
      <CalculatorsV2
        contactHref={p("/contact")}
        advisorName={advisorName}
        tools={toolHrefsFor(tenant, basePath)}
      />
      <ConstructionVastuV2 p={p} />
      <RecentDealsV2 p={p} />
      <VideoTestimonialsV2 />
      {/* Between the owner stories and the FAQ: it reads as the answer to what
          the stories just showed, and it is a pitch rather than a reference
          section, so it belongs ahead of the FAQ rather than after it. */}
      {propertyManagementSectionEnabled(tenant) ? (
        <PropertyManagementV2
          firmName={settings.firmName}
          contactHref={p("/contact")}
          servicesHref={p("/property-management")}
        />
      ) : null}
      <FaqV2
        asideContent={
          fullAddress ? <MapEmbedV2
              address={fullAddress}
              coordinates={mapCoordinates}
              className="aspect-[4/3] w-full"
            /> : undefined
        }
      />
    </>
  );
}
