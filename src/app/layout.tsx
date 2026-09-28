import type { Metadata, Viewport } from "next";
import { Playfair_Display, Poppins } from "next/font/google";
import { CartProvider } from "@/context/cart-context";
import { WishlistProvider } from "@/context/wishlist-context";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";
import { getPublicSettings } from "@/lib/settings-loader";

const themeInitScript = `(function(){try{var t=localStorage.getItem('afa-theme');if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})()`;

import { validateMidtransEnvOnStartup } from "@/lib/env-check";
import "./globals.css";

validateMidtransEnvOnStartup();

const body = Poppins({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const display = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

/** Dynamic metadata sourced from admin settings table.
 *  Cached with tag "settings" — invalidated by POST /api/admin/settings/revalidate after save. */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const title = settings.websiteTitle || "AFA STORE | Bawang Goreng Premium & Parcel Hampers";
  const description = settings.metaDescription ||
    "Pusat Bawang Goreng Premium & Parcel Hampers Berkualitas dengan checkout pembayaran cepat.";
  const keywords = settings.seoKeywords
    ? settings.seoKeywords.split(",").map((k) => k.trim()).filter(Boolean)
    : ["AFA STORE", "bawang goreng", "parcel hampers", "hampers premium"];
  const icons: Metadata["icons"] = settings.favicon
    ? {
        icon: [
          { url: settings.favicon },
          { url: "/favicon.ico", sizes: "any" },
          { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      }
    : {
        icon: [
          { url: "/favicon.ico", sizes: "any" },
          { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
          { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      };
  return {
    metadataBase: new URL("https://afastore.online"),
    applicationName: "AFA STORE",
    title,
    description,
    keywords,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "AFA STORE", statusBarStyle: "default" },
    icons,
    openGraph: {
      title: settings.websiteTitle || "AFA STORE",
      description: settings.metaDescription || "Bawang Goreng Premium & Parcel Hampers Berkualitas",
      type: "website",
      locale: "id_ID",
    },
  };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#123524",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F8F5EE] text-[#123524]">
        <Script id="afa-theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        <ThemeProvider><CartProvider><WishlistProvider>{children}</WishlistProvider></CartProvider></ThemeProvider>
      </body>
    </html>
  );
}