import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Compass, Ruler } from "lucide-react";
import { getTenantBySlug, basePathFor, joinPath } from "@/lib/tenant";
import { getFirmSettings } from "@/lib/content";
import { templateKeyFor } from "@/lib/templates";
import { paramsForEachTenant } from "@/lib/static-params";
import {
  DIRECTIONS, ROOMS, VASTU_CONTEXTS, VASTU_DISCLAIMER,
  findDirection, findRoom, type Direction, type RoomDef,
} from "@/lib/vastu";
import { PLOT_SIZES, PROPERTY_CONTEXTS, type PropertyContext } from "@/lib/vastu/sectors";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, jsonLdProps } from "@/lib/schema-org";
import LoanFaqV2 from "@/components/realestate/premium-v2/home-loan/LoanFaqV2";
import { GpContainer, GpEyebrow, GpSection } from "@/components/realestate/premium-v2/gp-primitives";
import LineArtBackdropV2 from "@/components/realestate/premium-v2/LineArtBackdropV2";
import RelatedCardsV2 from "@/components/realestate/premium-v2/RelatedCardsV2";

/** Unknown params 404 instead of rendering on demand — see lib/static-params.ts. */
export const dynamicParams = false;

/**
 * The non-sector vastu matrix. Each family answers a genuinely different
 * question rather than restating one page:
 *   facing x context     which way the property faces
 *   room                 where a room belongs in general
 *   room x direction     that room in a specific direction — the cell where
 *                        the tradition's guidance actually differs
 *   plot size x facing   how a layout fits a given footprint
 *   type x facing        a flat cannot be re-planned the way a plot can
 */
export async function generateStaticParams() {
  return paramsForEachTenant(async (tenant) => {
    const t = await getTenantBySlug(tenant.slug);
    if (!t || t.vertical !== "realestate") return [];
    return [
      ...DIRECTIONS.flatMap((d) => VASTU_CONTEXTS.map((c) => ({ topic: `${d.slug}-facing-${c.slug}` }))),
      ...ROOMS.map((r) => ({ topic: `${r.slug}-vastu` })),
      ...ROOMS.flatMap((r) => DIRECTIONS.map((d) => ({ topic: `${r.slug}-in-${d.slug}-vastu` }))),
      ...PLOT_SIZES.flatMap((size) => DIRECTIONS.map((d) => ({ topic: `${size}-plot-${d.slug}-facing-vastu` }))),
      ...PROPERTY_CONTEXTS.flatMap((c) => DIRECTIONS.map((d) => ({ topic: `${c.slug}-${d.slug}-facing-vastu` }))),
    ];
  });
}

type Resolved =
  | { kind: "facing"; direction: Direction; context: (typeof VASTU_CONTEXTS)[number] }
  | { kind: "room"; room: RoomDef }
  | { kind: "roomDir"; room: RoomDef; direction: Direction }
  | { kind: "plot"; size: string; direction: Direction }
  | { kind: "type"; context: PropertyContext; direction: Direction };

function resolve(topic: string): Resolved | null {
  // Ordered most specific first — "kitchen-in-south-east-vastu" would
  // otherwise be swallowed by the plain "<room>-vastu" pattern.
  const plot = topic.match(/^(\d+x\d+)-plot-(.+)-facing-vastu$/);
  if (plot) {
    const direction = findDirection(plot[2]);
    if (direction && (PLOT_SIZES as readonly string[]).includes(plot[1])) {
      return { kind: "plot", size: plot[1], direction };
    }
  }
  const typed = topic.match(/^(.+?)-(.+)-facing-vastu$/);
  if (typed) {
    const context = PROPERTY_CONTEXTS.find((c) => c.slug === typed[1]);
    const direction = findDirection(typed[2]);
    if (context && direction) return { kind: "type", context, direction };
  }
  const roomDir = topic.match(/^(.+?)-in-(.+)-vastu$/);
  if (roomDir) {
    const room = findRoom(roomDir[1]);
    const direction = findDirection(roomDir[2]);
    if (room && direction) return { kind: "roomDir", room, direction };
  }
  const facing = topic.match(/^(.+)-facing-(house|flat|plot)$/);
  if (facing) {
    const direction = findDirection(facing[1]);
    const context = VASTU_CONTEXTS.find((c) => c.slug === facing[2]);
    if (direction && context) return { kind: "facing", direction, context };
  }
  const room = topic.match(/^(.+)-vastu$/);
  if (room) {
    const r = findRoom(room[1]);
    if (r) return { kind: "room", room: r };
  }
  return null;
}

type Verdict = "ideal" | "suitable" | "avoid" | "neutral";
function verdictFor(room: RoomDef, direction: Direction): Verdict {
  if (room.preferred[0] === direction.slug) return "ideal";
  if (room.preferred.includes(direction.slug)) return "suitable";
  if (room.avoid.includes(direction.slug)) return "avoid";
  return "neutral";
}

const VERDICT_COPY: Record<Verdict, string> = {
  ideal: "This is the placement the tradition treats as ideal for this room.",
  suitable: "The tradition accepts this placement, though it is not the first choice.",
  avoid: "The tradition generally advises against this placement.",
  neutral: "The tradition neither favours nor discourages this placement — it is treated as workable.",
};

function headingFor(r: Resolved): string {
  switch (r.kind) {
    case "facing": return `${r.direction.name} Facing ${r.context.label} Vastu`;
    case "room": return `${r.room.name} Vastu`;
    case "roomDir": return `${r.room.name} in the ${r.direction.name}`;
    case "plot": return `${r.size} Plot, ${r.direction.name} Facing — Vastu Layout`;
    case "type": return `${r.direction.name} Facing ${r.context.label} Vastu`;
  }
}

function introFor(r: Resolved): string {
  switch (r.kind) {
    case "facing":
      return `${r.direction.summary} Below is the room-by-room layout the tradition suggests ${r.context.intro} facing this way.`;
    case "room":
      return `${r.room.guidance} Where a home is already built, the tradition's usual answer is adjustment rather than reconstruction.`;
    case "roomDir":
      return `${VERDICT_COPY[verdictFor(r.room, r.direction)]} ${r.direction.summary}`;
    case "plot":
      return `A ${r.size} foot plot facing ${r.direction.name.toLowerCase()} has a fixed footprint, so the question is which rooms go where within it. ${r.direction.summary}`;
    case "type":
      return `${r.direction.summary} What you can actually change differs a great deal by property type — a ${r.context.label.toLowerCase()} is the case covered here.`;
  }
}

function faqsFor(r: Resolved) {
  const dirName = (d: Direction) => d.name.toLowerCase();
  switch (r.kind) {
    case "roomDir": {
      const verdict = verdictFor(r.room, r.direction);
      return [
        {
          question: `Is the ${r.room.name.toLowerCase()} in the ${dirName(r.direction)} good as per Vastu?`,
          answer: `${VERDICT_COPY[verdict]} The directions traditionally preferred for this room are ${r.room.preferred.map((d) => dirName(findDirection(d)!)).join(", ")}.`,
        },
        {
          question: `What does Vastu suggest if my ${r.room.name.toLowerCase()} is already in the ${dirName(r.direction)}?`,
          answer: verdict === "avoid"
            ? `The tradition's usual remedies here are about light, colour and how the space is used rather than moving walls. In an apartment, where the layout is fixed, that is generally all that is available.`
            : `Nothing needs changing — this placement is not one the tradition raises concerns about.`,
        },
        {
          question: `Where does Vastu traditionally place the ${r.room.name.toLowerCase()}?`,
          answer: r.room.guidance,
        },
      ];
    }
    case "plot":
      return [
        {
          question: `How should a ${r.size} plot facing ${dirName(r.direction)} be laid out as per Vastu?`,
          answer: `On a footprint this size the entrance is traditionally kept towards ${ROOMS[0].preferred.map((d) => dirName(findDirection(d)!)).join(", ")}, the kitchen towards the south-east, and the master bedroom towards the south-west. On a narrow plot not all three will fall exactly where the tradition prefers, and the usual approach is to prioritise the entrance.`,
        },
        {
          question: `Is a ${dirName(r.direction)} facing plot good for construction?`,
          answer: `${r.direction.summary} Because a plot is not yet built on, it is the one case where the internal layout can genuinely be planned around the facing rather than worked around afterwards.`,
        },
        {
          question: `How much built-up area does a ${r.size} plot give?`,
          answer: `A ${r.size} foot plot is ${(Number(r.size.split("x")[0]) * Number(r.size.split("x")[1])).toLocaleString("en-IN")} square feet of land. Permissible built-up area depends on the ground coverage and FAR allowed for that sector, which is worth confirming before you plan the layout.`,
        },
      ];
    case "type":
      return [
        {
          question: `Is a ${dirName(r.direction)} facing ${r.context.label.toLowerCase()} good as per Vastu?`,
          answer: `${r.direction.summary} In practice the facing matters less than what sits where inside.`,
        },
        {
          question: `Can vastu be corrected in a ${r.context.label.toLowerCase()}?`,
          answer: ["flat", "office", "shop"].includes(r.context.slug)
            ? `Only partially. The layout of a ${r.context.label.toLowerCase()} is fixed at handover, so the tradition's remedies are limited to how rooms are used, lit and furnished. That is worth knowing before you pay a premium for a particular facing.`
            : `More than in a flat. A ${r.context.label.toLowerCase()} usually allows some internal change, and if you are buying before construction the layout can be planned around the facing.`,
        },
        {
          question: `Which direction is best for buying a ${r.context.label.toLowerCase()} in Gurugram?`,
          answer: `The tradition favours north, north-east and east facings. In Gurugram the practical consideration usually matters more — how much afternoon sun the main rooms take, which drives how hot the property runs in summer.`,
        },
      ];
    case "facing":
      return [
        {
          question: `Is a ${dirName(r.direction)} facing ${r.context.label.toLowerCase()} good as per Vastu?`,
          answer: `${r.direction.summary} In practice the facing matters less than what sits where inside — a well-arranged home facing any direction is generally considered better than a poorly arranged one facing an auspicious direction.`,
        },
        {
          question: `How do I know which way my ${r.context.label.toLowerCase()} faces?`,
          answer: `Stand at the main door looking outwards, with a compass. The direction you are facing is the facing direction of the property. A phone compass is accurate enough.`,
        },
        {
          question: `What are the disadvantages of a ${dirName(r.direction)} facing property?`,
          answer: `The tradition treats some facings more cautiously than others, but none is considered unusable. The practical considerations are the ones you can verify yourself: direct sun on the main rooms, how hot the property runs in a Gurugram summer, and how the layout uses the light it has.`,
        },
      ];
    case "room":
      return [
        {
          question: `Which direction is best for the ${r.room.name.toLowerCase()} as per Vastu?`,
          answer: `${r.room.guidance} The directions traditionally preferred are ${r.room.preferred.map((d) => dirName(findDirection(d)!)).join(", ")}.`,
        },
        {
          question: `Which directions does Vastu advise against for the ${r.room.name.toLowerCase()}?`,
          answer: r.room.avoid.length
            ? `The tradition generally advises against ${r.room.avoid.map((d) => dirName(findDirection(d)!)).join(" and ")}.`
            : `The tradition does not single out a direction to avoid for this one.`,
        },
        {
          question: `What if my ${r.room.name.toLowerCase()} is already in the wrong direction?`,
          answer: `Structural change is rarely the answer. The usual suggestions are about how the space is lit, coloured and used — and in an apartment, where the layout is fixed, that is generally all that is available.`,
        },
      ];
  }
}

interface Props {
  params: Promise<{ tenant: string; topic: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, topic } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const r = resolve(topic);
  if (!tenant || !r) return {};
  const settings = await getFirmSettings(tenant.id);
  return {
    title: `${headingFor(r)} — Gurugram Guide | ${settings?.firmName ?? ""}`,
    description: introFor(r).slice(0, 300),
    alternates: { canonical: joinPath(basePathFor(tenant), `/vastu/${topic}`) },
  };
}

export default async function VastuTopicPage({ params }: Props) {
  const { tenant: tenantSlug, topic } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant || templateKeyFor(tenant) !== "premium-v2") notFound();
  const settings = await getFirmSettings(tenant.id);
  const resolved = resolve(topic);
  if (!resolved) notFound();

  const basePath = basePathFor(tenant);
  const p = (path: string) => joinPath(basePath, path);
  const heading = headingFor(resolved);
  const faqs = faqsFor(resolved);

  // Which room table to show, and which direction to highlight in it.
  const highlightDirection =
    "direction" in resolved ? resolved.direction : undefined;

  return (
    <>
      <script
        {...jsonLdProps(
          buildBreadcrumbJsonLd([
            { name: "Home", url: p("/") },
            { name: "Vastu", url: p("/vastu") },
            { name: heading, url: p(`/vastu/${topic}`) },
          ]),
        )}
      />
      {buildFaqJsonLd(faqs) ? <script {...jsonLdProps(buildFaqJsonLd(faqs))} /> : null}

      <GpSection tone="forest" className="py-14 sm:py-20"
        background={<LineArtBackdropV2 variant="building-right" opacity={0.6} desktopOnly />}
      >
        <GpContainer>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-white/55">
            <Link href={p("/")} className="hover:text-[color:var(--gp-gold-300)]">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href={p("/vastu")} className="hover:text-[color:var(--gp-gold-300)]">Vastu</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/85">{heading}</span>
          </nav>

          <GpEyebrow className="text-[color:var(--gp-gold-300)]">
            {highlightDirection
              ? `${highlightDirection.element}${highlightDirection.traditional ? ` · ${highlightDirection.traditional}` : ""}`
              : "Room placement"}
          </GpEyebrow>
          <h1 className="gp-hero-title font-display mt-3 max-w-3xl text-white">{heading}</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/75">{introFor(resolved)}</p>

          <Link
            href={p("/vastu")}
            className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--gp-radius-sm)] bg-[color:var(--gp-gold-600)] px-6 text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--gp-forest-950)] transition-colors hover:bg-[color:var(--gp-gold-300)]"
          >
            Score your own home
          </Link>
        </GpContainer>
      </GpSection>

      <GpSection tone="cream">
        <GpContainer>
          <GpEyebrow>Room by room</GpEyebrow>
          <h2 className="gp-section-title font-display mt-2 text-[color:var(--gp-ink)]">
            {highlightDirection
              ? `What the tradition puts in the ${highlightDirection.name.toLowerCase()}`
              : "Where the tradition places each room"}
          </h2>
          <div className="mt-8 overflow-x-auto rounded-[var(--gp-radius-md)] border border-[color:var(--gp-border)] bg-white">
            <table className="w-full min-w-[680px] text-[14px]">
              <thead>
                <tr className="bg-[color:var(--gp-cream-200)] text-left text-[11px] uppercase tracking-[0.07em] text-[color:var(--gp-muted)]">
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Traditionally placed</th>
                  <th className="px-4 py-3 font-semibold">Generally avoided</th>
                  {highlightDirection ? (
                    <th className="px-4 py-3 font-semibold">In the {highlightDirection.name.toLowerCase()}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {ROOMS.map((room) => {
                  const v = highlightDirection ? verdictFor(room, highlightDirection) : null;
                  return (
                    <tr key={room.slug} className="border-t border-[color:var(--gp-border)]">
                      <td className="px-4 py-2.5">
                        <Link
                          href={p(`/vastu/${room.slug}-vastu`)}
                          className="font-medium text-[color:var(--gp-ink)] hover:text-[color:var(--gp-gold-600)]"
                        >
                          {room.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--gp-body)]">
                        {room.preferred.map((d) => findDirection(d)!.name).join(", ")}
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--gp-muted)]">
                        {room.avoid.length ? room.avoid.map((d) => findDirection(d)!.name).join(", ") : "—"}
                      </td>
                      {highlightDirection ? (
                        <td className="px-4 py-2.5">
                          <Link
                            href={p(`/vastu/${room.slug}-in-${highlightDirection.slug}-vastu`)}
                            className={
                              v === "ideal" || v === "suitable"
                                ? "font-medium text-[color:var(--gp-gold-600)] hover:underline"
                                : v === "avoid"
                                  ? "text-[color:var(--gp-muted)] hover:underline"
                                  : "text-[color:var(--gp-body)] hover:underline"
                            }
                          >
                            {v === "ideal" ? "Ideal" : v === "suitable" ? "Suitable" : v === "avoid" ? "Avoided" : "Workable"}
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GpContainer>
      </GpSection>

      <LoanFaqV2 faqs={faqs} heading={`${heading}, answered`} />

      <GpSection tone="cream" className="pt-0">
        <GpContainer>
          <RelatedCardsV2
            title={`Explore other directions`}
            items={[DIRECTIONS.map((d) => (
              ({ href: p(
                  resolved.kind === "roomDir"
                    ? `/vastu/${resolved.room.slug}-in-${d.slug}-vastu`
                    : resolved.kind === "plot"
                      ? `/vastu/${resolved.size}-plot-${d.slug}-facing-vastu`
                      : resolved.kind === "type"
                        ? `/vastu/${resolved.context.slug}-${d.slug}-facing-vastu`
                        : `/vastu/${d.slug}-facing-house`,
                ), title: d.name, subtitle: d.summary })
            ))].flat(2)}
            icon={Compass}
            columns={3}
          />

          <RelatedCardsV2
            className="mt-10"
            title={`By property type`}
            items={[PROPERTY_CONTEXTS.map((c) =>
              DIRECTIONS.slice(0, 4).map((d) => (
                ({ href: p(`/vastu/${c.slug}-${d.slug}-facing-vastu`), title: `${d.name} facing ${c.label.toLowerCase()}`, subtitle: `${c.label} guidance for a ${d.name.toLowerCase()} facing` })
              )),
            )].flat(2)}
            icon={Building2}
            columns={3}
          />

          <RelatedCardsV2
            className="mt-10"
            title={`By plot size`}
            items={[PLOT_SIZES.map((size) => (
              ({ href: p(`/vastu/${size}-plot-${(highlightDirection ?? DIRECTIONS[0]).slug}-facing-vastu`), title: `${size} plot`, subtitle: `Layout guidance for a ${size} ft plot` })
            ))].flat(2)}
            icon={Ruler}
            columns={4}
          />

          <p className="mt-9 max-w-3xl text-[12px] leading-relaxed text-[color:var(--gp-muted)]">
            {VASTU_DISCLAIMER}
          </p>
        </GpContainer>
      </GpSection>

    </>
  );
}
