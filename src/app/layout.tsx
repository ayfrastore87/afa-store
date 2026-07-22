import type { Metadata } from "next";
import { Playfair_Display, Poppins } from "next/font/google";
import { CartProvider } from "@/context/cart-context";
import { WishlistProvider } from "@/context/wishlist-context";
import "./globals.css";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://afa-store.vercel.app"),
  title: "AFA STORE | Bawang Goreng Premium & Parcel Hampers",
  description:
    "Pusat Bawang Goreng Premium & Parcel Hampers Berkualitas dengan checkout WhatsApp cepat.",
  keywords: [
    "AFA STORE",
    "bawang goreng",
    "parcel hampers",
    "hampers premium",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
  },
  openGraph: {
    title: "AFA STORE",
    description: "Bawang Goreng Premium & Parcel Hampers Berkualitas",
    type: "website",
    locale: "id_ID",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#F8F5EE] text-[#123524]">
        <CartProvider><WishlistProvider>{children}</WishlistProvider></CartProvider>
      </body>
    </html>
  );
}