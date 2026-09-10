import { getTenant } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import PropertyListSkeletonV2 from "@/components/realestate/premium-v2/PropertyListSkeletonV2";

export default async function PropertiesLoading() {
  const tenant = await getTenant();

  if (templateKeyFor(tenant) === "premium-v2") {
    return (
      <div className="gp-section bg-[color:var(--gp-cream-100)]">
        <div className="gp-container">
          <div className="mb-8 h-9 w-2/3 max-w-md animate-pulse rounded bg-[color:var(--gp-cream-200)]" />
          <PropertyListSkeletonV2 />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8" aria-hidden="true">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] w-full animate-pulse rounded-[12px] bg-tint-deep" />
        ))}
      </div>
    </div>
  );
}
