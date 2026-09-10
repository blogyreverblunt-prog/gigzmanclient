import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Playfair_Display, Montserrat, Cormorant_Garamond, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Serif display face for the base (CA) vertical. Source Serif reads as
// institutional rather than editorial, which suits a professional practice
// better than a high-contrast display serif.
const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

// Real-estate vertical's type system. Loaded here alongside the base fonts so
// every request pays the same font cost regardless of which vertical it
// resolves to; the per-vertical CSS block in globals.css only remaps which
// variable --font-display/--font-sans point at.
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

// Premium V2 template's editorial display face (Geeta Properties).
const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Premium V2's body/interface face — headings stay in the Cormorant serif
// above; this only replaces Inter for paragraphs, nav, buttons and labels.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Professional Services",
  description: "Chartered accountancy, taxation and compliance support.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f2c52",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The tenant theme attributes live on a wrapper inside the tenant layout,
  // not here: resolving the tenant in the ROOT layout would read request
  // headers and force every route in the app into dynamic rendering.

  const fontVariables = `${inter.variable} ${sourceSerif.variable} ${playfairDisplay.variable} ${montserrat.variable} ${cormorantGaramond.variable} ${poppins.variable}`;

  return (
    <html lang="en" className={`${fontVariables} h-full`}>
      {/* Browser extensions rewrite <body> before React hydrates — ColorZilla
          adds `cz-shortcut-listen`, password managers and translators add
          their own — and React reports the difference as a hydration
          mismatch. Nothing the page serves can prevent it: extensions run on
          the user's own authority, above the document's. Suppression here is
          one level deep, covering only <body>'s own attributes, so a genuine
          mismatch anywhere inside the app still surfaces. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
