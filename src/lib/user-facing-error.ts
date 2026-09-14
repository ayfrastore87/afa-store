/**
 * Shared user-facing error utilities.
 *
 * Purpose: convert unknown thrown values (API responses, network failures,
 * Supabase/Prisma/system errors) into concise, standard Bahasa Indonesia
 * messages that are safe to render. Any other detail (raw JSON, stack traces,
 * HTTP codes, database/SQL/Prisma/Supabase internals, file paths, env) must
 * stay out of the visible UI.
 *
 * This module is dependency-free and safe to import from both server and client.
 */

export const USER_FACING_FALLBACK = "Terjadi kendala. Silakan coba lagi.";
export const NETWORK_ERROR_MESSAGE = "Koneksi bermasalah. Silakan coba lagi.";

/** JSON keys that may carry a human-readable message from our own API. */
export const ALLOWED_MESSAGE_KEYS = ["message", "error"] as const;

/** A legitimate business message is short; anything longer is diagnostics. */
const MAX_USER_MESSAGE_LENGTH = 200;

/** Signals of raw/system content that must never reach the user. */
const TECHNICAL_MARKERS =
    /prisma|postgres|postgrest|supabase|sql\b|database|foreign key|constraint|violat|stack trace|\n\s*at\s|\s+at\s+\S+\.(?:tsx?|m?js|vue):\d+|https?:\/\/|fetch failed|failed to fetch|networkerror|typeerror|referenceerror|syntaxerror|rangeerror|aggregateerror|error [A-Z0-9_]+|request failed|unexpected token|api returned html|invalid login credentials|email not confirmed|already registered|password should be|rate limit/i;

/** A JSON-encoded object/array. */
const RAW_JSON_SHAPE = /^[\s\S]*(\{|\[)[\s\S]*(\}|\])[\s\S]*$/;

/** HTML document/body detection. */
const HTML_SHAPE = /<\s*(?:!doctype|html|head|body|div|span)[\s>]/i;

function looksTechnical(value: string): boolean {
    return TECHNICAL_MARKERS.test(value) || RAW_JSON_SHAPE.test(value) || HTML_SHAPE.test(value);
}

/** Conservative check: is this string safe to show verbatim to a user? */
export function isSafeUserMessage(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.length > MAX_USER_MESSAGE_LENGTH) return false;
    if (looksTechnical(trimmed)) return false;
    return true;
}

/** Extract an allowlisted `message`/`error` text field from a parsed payload. */
export function safeApiMessage(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const record = payload as Record<string, unknown>;
    for (const key of ALLOWED_MESSAGE_KEYS) {
        if (isSafeUserMessage(record[key])) return record[key] as string;
    }
    return null;
}

export interface ApiErrorBody {
    message?: string;
    redirectTo?: string;
}

/**
 * Safely parse an API response text into an allowlisted `message` and an optional
 * safe internal `redirectTo`. Never throws; malformed input yields an empty object.
 */
export function parseSafeBody(text: string): ApiErrorBody {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== "object" || parsed === null) return {};
        const record = parsed as Record<string, unknown>;
        return {
            message: typeof record.message === "string" ? record.message : undefined,
            redirectTo: typeof record.redirectTo === "string" ? record.redirectTo : undefined,
        };
    } catch {
        return {};
    }
}

/** Read a Response body once and return its safe { message, redirectTo } shape. */
export async function readApiErrorBody(response: Response): Promise<ApiErrorBody> {
    try {
        return parseSafeBody(await response.text());
    } catch {
        return {};
    }
}

/**
 * Convert an unknown thrown value into a user-safe message.
 * - Abort/timeout -> network message.
 * - A clean, short Error.message -> as-is.
 * - Anything else -> the provided fallback.
 */
export function getUserFacingMessage(error: unknown, fallback: string = USER_FACING_FALLBACK): string {
    if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
        return NETWORK_ERROR_MESSAGE;
    }
    if (error instanceof Error && isSafeUserMessage(error.message)) return error.message;
    return fallback;
}

/**
 * Server-side diagnostics only: log the raw error so operators can debug without
 * the text ever reaching a client response. Keep this out of any response body.
 */
export function logServerError(context: string, error: unknown): void {
    if (error instanceof Error) {
        console.error(`[${context}] ${error.name}: ${error.message}`);
    } else {
        console.error(`[${context}]`, error);
    }
}
