import { parseSafeBody, safeApiMessage, USER_FACING_FALLBACK } from "@/lib/user-facing-error";

export async function fetchJsonSafe<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    return parseJsonResponse<T>(response);
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!response.ok) {
        // Never leak the raw body (which may be JSON, HTML, or a system error).
        // Surface only an allowlisted, human-readable field as the Error message.
        const safe = safeApiMessage(parseSafeBody(text)) ?? USER_FACING_FALLBACK;
        throw new Error(safe);
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(USER_FACING_FALLBACK);
    }
}
