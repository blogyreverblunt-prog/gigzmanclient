import { notFound, redirect } from "next/navigation";
import CalculatorShell from "@/components/site/CalculatorShell";
import IncomeTaxCalculator from "@/components/site/calculators/IncomeTaxCalculator";
import TdsCalculator from "@/components/site/calculators/TdsCalculator";
import GstCalculator from "@/components/site/calculators/GstCalculator";
import EmiCalculator from "@/components/site/calculators/EmiCalculator";
import StampDutyCalculator from "@/components/site/calculators/StampDutyCalculator";
import RentalYieldCalculator from "@/components/site/calculators/RentalYieldCalculator";
import PremiumV2EmiCalculatorPage from "@/components/realestate/premium-v2/PremiumV2EmiCalculatorPage";
import { homeLoanEnabled } from "@/lib/home-loan/enabled";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { templateKeyFor } from "@/lib/templates";
import { getFirmSettings, getCalculator } from "@/lib/content";
import type { AgeCategory } from "@/lib/calculators/income-tax";
import type { AmountType } from "@/lib/calculators/gst";
import type { OwnerCategory } from "@/lib/calculators/stamp-duty";

export async function generateMetadata(props: PageProps<"/site/[tenant]/calculators/[key]">) {
  const { key } = await props.params;
  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) return {};
  const [settings, calculator] = await Promise.all([
    getFirmSettings(tenant.id),
    getCalculator(tenant.id, key),
  ]);
  if (!calculator) return {};
  return {
    title: `${calculator.title} — ${settings?.firmName ?? ""}`,
    description: calculator.description ?? undefined,
  };
}

const AGE_CATEGORIES: AgeCategory[] = ["general", "senior", "superSenior"];
const OWNER_CATEGORIES: OwnerCategory[] = ["male", "female", "joint"];

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function CalculatorPage(props: PageProps<"/site/[tenant]/calculators/[key]">) {
  const { key } = await props.params;
  const searchParams = await props.searchParams;

  const { tenant: tenantSlug } = await props.params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const calculator = await getCalculator(tenant.id, key);

  if (!calculator || calculator.status === "archived") notFound();

  if (templateKeyFor(tenant) === "premium-v2") {
    // Only EMI still has a page under /calculators here. Rental yield moved
    // to its own purpose-built page and keeps its inbound links via this
    // redirect; stamp duty was retired with the first-generation panel UI.
    if (calculator.key === "rental-yield") redirect(p("/rental-yield"));
    if (calculator.key !== "emi") notFound();
    // Tenants that publish the financing hub already carry this calculator
    // there; keeping a second copy here would be two URLs for one page.
    if (homeLoanEnabled(tenant)) redirect(p("/home-loan"));
    return <PremiumV2EmiCalculatorPage tenant={tenant} />;
  }

  const shared = {
    calculatorKey: calculator.key,
    version: calculator.version,
    taxYear: calculator.taxYear,
  };

  // Values handed over from the picker. They live in the URL only — nothing here
  // is persisted or sent anywhere.
  const age = str(searchParams.age);
  const rate = str(searchParams.rate);
  const amountType = str(searchParams.type);
  const owner = str(searchParams.owner);

  return (
    <CalculatorShell
      calculator={calculator}
      contactHref={p("/contact")}
      breadcrumbHref={p("/calculators")}
    >
      {calculator.key === "income-tax" ? (
        <IncomeTaxCalculator
          {...shared}
          initial={{
            salary: str(searchParams.salary),
            deductions: str(searchParams.deductions),
            age: AGE_CATEGORIES.includes(age as AgeCategory) ? (age as AgeCategory) : undefined,
          }}
        />
      ) : null}

      {calculator.key === "tds" ? (
        <TdsCalculator
          {...shared}
          initial={{
            section: str(searchParams.section),
            payment: str(searchParams.payment),
            panAvailable: str(searchParams.pan) === undefined ? undefined : searchParams.pan !== "0",
          }}
        />
      ) : null}

      {calculator.key === "gst" ? (
        <GstCalculator
          {...shared}
          initial={{
            amount: str(searchParams.amount),
            rate: rate !== undefined && !Number.isNaN(Number(rate)) ? Number(rate) : undefined,
            amountType:
              amountType === "inclusive" || amountType === "exclusive"
                ? (amountType as AmountType)
                : undefined,
          }}
        />
      ) : null}

      {calculator.key === "emi" ? (
        <EmiCalculator
          {...shared}
          initial={{
            principal: str(searchParams.principal),
            rate: rate !== undefined && !Number.isNaN(Number(rate)) ? Number(rate) : undefined,
            tenureYears:
              str(searchParams.tenure) !== undefined && !Number.isNaN(Number(searchParams.tenure))
                ? Number(searchParams.tenure)
                : undefined,
          }}
        />
      ) : null}

      {calculator.key === "stamp-duty" ? (
        <StampDutyCalculator
          {...shared}
          initial={{
            propertyValue: str(searchParams.value),
            ownerCategory: OWNER_CATEGORIES.includes(owner as OwnerCategory)
              ? (owner as OwnerCategory)
              : undefined,
          }}
        />
      ) : null}

      {calculator.key === "rental-yield" ? (
        <RentalYieldCalculator
          {...shared}
          initial={{
            propertyValue: str(searchParams.value),
            monthlyRent: str(searchParams.rent),
          }}
        />
      ) : null}
    </CalculatorShell>
  );
}
