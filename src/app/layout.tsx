import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://afa-store.vercel.app"),
  title: "AFA STORE | Bawang Goreng Premium & Parcel Hampers",
  description: "Pusat Bawang Goreng Premium & Parcel Hampers Berkualitas dengan checkout WhatsApp cepat.",
  keywords: ["AFA STORE", "bawang goreng", "parcel hampers", "hampers premium"],
  openGraph: { title: "AFA STORE", description: "Bawang Goreng Premium & Parcel Hampers Berkualitas", type: "website", locale: "id_ID" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
