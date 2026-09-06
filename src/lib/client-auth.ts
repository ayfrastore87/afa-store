export async function hasAuthenticatedUser() {
    try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return false;
        const data = await response.json() as { user?: unknown };
        return Boolean(data.user);
    } catch {
        return false;
    }
}

export function loginPath(next: string) {
    return `/login?next=${encodeURIComponent(next)}`;
}

export function whatsappUrl() {
    const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
    return number ? `https://wa.me/${number}` : null;
}