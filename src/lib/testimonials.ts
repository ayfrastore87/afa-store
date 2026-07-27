export type Testimonial = {
    id: string;
    name: string;
    city: string;
    whatsapp?: string | null;
    message: string;
    rating: number;
    avatar?: string | null;
    isActive: boolean;
    isVerified: boolean;
    createdAt: string;
    updatedAt?: string;
};

export async function fetchTestimonials(params?: { rating?: number; search?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.rating) query.set("rating", String(params.rating));
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    const response = await fetch(`/api/testimonials?${query.toString()}`);
    if (!response.ok) throw new Error("Gagal memuat testimoni");
    const data = await response.json();
    return (data.testimonials ?? []) as Testimonial[];
}