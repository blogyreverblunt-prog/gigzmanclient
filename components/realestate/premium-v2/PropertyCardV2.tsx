import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import type { properties } from "@/lib/db/schema";
import { formatIndianPrice, formatNumber, PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/format";
import PropertyEnquireButton from "./PropertyEnquireButton";

type Property = typeof properties.$inferSelect;
type CardSize = "default" | "large" | "tall";

/**
 * Listing card: photograph on top, everything else in a body beneath it.
 *
 * Text used to sit over the photograph behind a scrim, which cost the card
 * both ways — the copy fought whatever was in the picture, and the picture
 * was half-covered by copy. Splitting them means the photo is seen whole and
 * the title, location, configuration and price are read on a flat ground,
 * with room for the two actions a listing card actually needs.
 *
 * The size variants now scale the *image*, not the whole card, so the body
 * stays a constant height and cards line up across a row whatever their
 * image ratio.
 */
/**
 * `large` and `tall` sit in HotPropertiesGridV2's asymmetric grid, where the
 * card is stretched to a row span rather than sized by its own content. Now
 * that the card has a body under the photograph, that extra height has to go
 * somewhere: the image absorbs it (`lg:flex-1`) so the body stays the same
 * compact block as every other card, instead of the buttons drifting to the
 * bottom of a very tall card with a gap above them.
 */
/**
 * Below `lg` every size uses the SAME aspect ratio, and that is load-bearing.
 * The mobile carousel is a flex row, so its cards stretch to the tallest one;
 * the `lg:flex-1` that lets the image soak up that extra height does not apply
 * at this breakpoint. With mixed ratios the tall card (4/5, ~400px at the
 * carousel's 82% width) set the height and the 16/10 card (~200px) rendered
 * 200px of blank white below its buttons.
 */
const IMAGE_SIZE_CLASSES: Record<CardSize, string> = {
  default: "aspect-[4/3]",
  large: "aspect-[4/3] lg:aspect-auto lg:min-h-[260px] lg:flex-1",
  tall: "aspect-[4/3] lg:aspect-auto lg:min-h-[260px] lg:flex-1",
};

const IMAGE_SIZES: Record<CardSize, string> = {
  default: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw",
  large: "(max-width: 1024px) 100vw, 50vw",
  tall: "(max-width: 1024px) 100vw, 25vw",
};

/** Gold reads as "the standout pick"; white reads as a routine status tag. */
function pillTone(badge: string | null) {
  if (badge && badge.toLowerCase().includes("flagship")) {
    return "bg-[color:var(--gp-gold-600)] text-[color:var(--gp-forest-950)]";
  }
  return "bg-white/92 text-[color:var(--gp-ink)]";
}

function configLine(property: Property): string {
  const area = property.area ? `${formatNumber(property.area)} ${property.areaUnit ?? "sqft"}` : null;
  const typeLabel = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  const bhk = property.beds ? `${property.beds} BHK` : null;
  return [bhk, typeLabel, area].filter(Boolean).join(" · ");
}

export default function PropertyCardV2({
  property,
  href,
  imagePath,
  imageAlt,
  size = "default",
}: {
  property: Property;
  href: string;
  imagePath?: string | null;
  imageAlt?: string;
  size?: CardSize;
}) {
  const pillLabel = property.badge ?? PROPERTY_STATUS_LABELS[property.status];
  const priceDisplay = property.priceLabel ?? (property.price ? formatIndianPrice(property.price) : null);
  const locationLine = [property.locality, property.sector ? `Sector ${property.sector}` : null]
    .filter(Boolean)
    .join(", ");
  const rera = Boolean(property.reraNumber);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white transition-shadow hover:shadow-[var(--shadow-card)]">
      <Link href={href} className="relative flex overflow-hidden lg:flex-1" tabIndex={-1} aria-hidden="true">
        <div className={`relative w-full ${IMAGE_SIZE_CLASSES[size]}`}>
          {imagePath ? (
            <Image
              src={imagePath}
              alt={imageAlt ?? property.title}
              fill
              sizes={IMAGE_SIZES[size]}
              className="object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 bg-[color:var(--gp-forest-800)]" />
          )}

          <span
            className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] ${pillTone(property.badge)}`}
          >
            {pillLabel}
          </span>

          {/*
            Both branches render. A listing without a RERA number must say so
            visibly — Indian law requires the registration on any advertisement
            for a registered project, and a card that simply omits the badge
            reads as though the listing has one. This branch was `: null` until
            it was caught by a health check, which silently affected 456 active
            listings across the platform, all 442 of Evergreen's among them.

            Same geometry as the verified badge on purpose: a pending state
            that is smaller or dimmer than the positive one is the same
            omission wearing a different coat.
          */}
          {rera ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[color:var(--gp-forest-950)]/85 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--gp-gold-300)] backdrop-blur-sm">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              RERA
            </span>
          ) : (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[color:var(--gp-forest-950)]/85 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--color-status-warn-soft)] backdrop-blur-sm">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              Registration pending
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col p-5">
        <h3 className="font-display text-[17px] leading-snug text-[color:var(--gp-ink)]">
          <Link href={href} className="transition-colors hover:text-[color:var(--gp-gold-600)]">
            {property.title}
          </Link>
        </h3>

        {locationLine ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[color:var(--gp-body)]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[color:var(--gp-gold-600)]" aria-hidden="true" />
            {locationLine}
          </p>
        ) : null}

        <p className="mt-1.5 text-[12.5px] text-[color:var(--gp-muted)]">{configLine(property)}</p>

        <div className="mt-4 border-t border-[color:var(--gp-border)] pt-3.5">
          {priceDisplay ? (
            <p className="font-sans text-[19px] font-semibold text-[color:var(--gp-ink)]">
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-[color:var(--gp-muted)]">
                From
              </span>
              {priceDisplay}
            </p>
          ) : (
            <p className="text-[14px] font-medium text-[color:var(--gp-muted)]">Price on request</p>
          )}
        </div>

        <div className="mt-4 flex items-end gap-2.5">
          <Link
            href={href}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-forest-900)] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[color:var(--gp-forest-800)]"
          >
            View details
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <PropertyEnquireButton
            propertyId={property.id}
            propertyType={property.propertyType}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center whitespace-nowrap rounded-[var(--gp-radius-sm)] border border-[color:var(--gp-border)] px-3 text-[12.5px] font-semibold text-[color:var(--gp-ink)] transition-colors hover:border-[color:var(--gp-forest-900)]"
          />
        </div>
      </div>
    </article>
  );
}
