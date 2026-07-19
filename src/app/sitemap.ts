import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const base = "https://afa-store.vercel.app";
    return ["", "/custom-parcel", "/admin"].map((path) => ({
        url: `${base}${path}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: path === "" ? 1 : 0.7,
    }));
}