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

export function whatsappUrl(message?: string) {
    const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
    if (!number) return null;
    return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}