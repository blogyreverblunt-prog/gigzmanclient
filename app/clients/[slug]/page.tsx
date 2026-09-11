import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { getClientForPlatform } from "@/lib/platform/clients";
import { MANAGED_SOCIAL_KEYS } from "@/lib/platform/feature-copy";
import { VERTICAL_IDS, getVerticalConfig } from "@/lib/verticals";
import { getTenantPath } from "@/lib/templates";
import { hasPlacesKey } from "@/lib/gbp/places";
import ClientForm from "@/components/platform/ClientForm";

/**
 * The same single form as `/clients/new`, in edit mode.
 *
 * This page used to be six panels — identity, business details, Google
 * autofill, search appearance, hero copy, readiness, branding and feature
 * toggles — each with its own save button, and it was the wrong shape for the
 * job. The operator's actual task is "put this client's real details in", and
 * splitting that across eight forms made the two that matter (name and logo)
 * hard to find among six that rarely change.
 *
 * The panels that are gone are not lost work: their server actions still exist
 * and are still guarded, so anything that needs the hero-copy or SEO editor back
 * can render it again without redesigning the write side.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client · Gigzman",
  robots: { index: false, follow: false },
};

export default async function ClientEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePlatformAdmin(`/clients/${slug}`);

  const found = await getClientForPlatform(slug);
  if (!found) notFound();
  const { client, settings } = found;

  const verticals = VERTICAL_IDS.map((id) => ({ id, label: getVerticalConfig(id).label }));

  // `?? ""` throughout, never a placeholder: an empty input must round-trip to
  // NULL and render nothing, and a suggested value in the box is one careless
  // save away from being published as fact about a real business.
  const stored = (settings?.socialLinks ?? {}) as Record<string, string>;
  const initial: Record<string, string> = {
    firmName: settings?.firmName ?? client.displayName,
    phone: settings?.phone ?? "",
    whatsapp: settings?.whatsapp ?? "",
    email: settings?.email ?? "",
    notificationEmail: settings?.notificationEmail ?? "",
    businessCategory: settings?.businessCategory ?? "",
    addressLine: settings?.addressLine ?? "",
    locality: settings?.locality ?? "",
    region: settings?.region ?? "",
    postalCode: settings?.postalCode ?? "",
    country: settings?.country ?? "",
    latitude: settings?.latitude ?? "",
    longitude: settings?.longitude ?? "",
    googleMapsUrl: settings?.googleMapsUrl ?? "",
    tagline: settings?.tagline ?? "",
    overview: settings?.overview ?? "",
    establishedYear: settings?.establishedYear ?? "",
    firmRegistrationNumber: settings?.firmRegistrationNumber ?? "",
  };
  for (const key of MANAGED_SOCIAL_KEYS) {
    initial[`social-${key}`] = stored[key] ?? "";
  }

  const basePath = getTenantPath(client);

  return (
    <div className="min-h-screen bg-tint px-5 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All clients
        </Link>
        <h1 className="display-md mt-3">{settings?.firmName ?? client.displayName}</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-muted">
          Everything about this client, on one screen. Changes are live within seconds of saving.
        </p>

        <div className="mt-7">
          <ClientForm
            mode="edit"
            verticals={verticals}
            clientId={client.id}
            slug={client.slug}
            vertical={client.vertical}
            sitePath={basePath || "/"}
            dashboardPath={`${basePath}/dashboard`}
            logoUrl={settings?.logoUrl ?? null}
            placesEnabled={hasPlacesKey()}
            initial={initial}
          />
        </div>
      </div>
    </div>
  );
}
