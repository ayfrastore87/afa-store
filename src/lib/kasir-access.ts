/**
 * Kasir (POS) access policy.
 *
 * Pure, dependency-free module shared by the edge proxy, the server guards
 * (`getCurrentCashier` / `requireCashier`) and the `/kasir/login` page so every
 * layer applies exactly the same rule set:
 *
 *  - `/kasir/login` is PUBLIC. It is never covered by the protected guard.
 *    An active cashier/admin visiting it is sent ONCE to `/kasir`.
 *  - Every other `/kasir*` path is PROTECTED. Anyone who is not an active
 *    cashier/admin (anonymous, customer, partner, inactive) is sent ONCE to
 *    `/kasir/login`.
 *
 * Because the login path renders for every non-cashier identity and the
 * protected paths render for every cashier identity, no redirect target can
 * ever bounce a request straight back to its source.
 */

export const KASIR_HOME_PATH = "/kasir";
export const KASIR_LOGIN_PATH = "/kasir/login";

/** Application roles that may operate the POS. `getCurrentAdmin` stays admin-only. */
export const KASIR_ROLES: readonly string[] = ["admin", "cashier"];

export type KasirIdentity = { role?: string | null; isActive?: boolean | null } | null | undefined;

export type KasirRouteDecision =
    | { type: "render" }
    | { type: "redirect"; to: typeof KASIR_HOME_PATH | typeof KASIR_LOGIN_PATH };

function stripTrailingSlash(pathname: string) {
    return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isKasirPath(pathname: string) {
    const path = stripTrailingSlash(pathname);
    return path === KASIR_HOME_PATH || path.startsWith(`${KASIR_HOME_PATH}/`);
}

export function isKasirLoginPath(pathname: string) {
    return stripTrailingSlash(pathname) === KASIR_LOGIN_PATH;
}

/** `/kasir/login` is explicitly carved out of the protected set. */
export function isProtectedKasirPath(pathname: string) {
    return isKasirPath(pathname) && !isKasirLoginPath(pathname);
}

/** Active admin or active cashier only. Customer / partner / inactive rows are denied. */
export function isActiveKasirIdentity(identity: KasirIdentity): boolean {
    if (!identity) return false;
    if (identity.isActive === false) return false;
    return typeof identity.role === "string" && KASIR_ROLES.includes(identity.role);
}

export function resolveKasirRoute(pathname: string, identity: KasirIdentity): KasirRouteDecision {
    const allowed = isActiveKasirIdentity(identity);

    if (isKasirLoginPath(pathname)) {
        return allowed ? { type: "redirect", to: KASIR_HOME_PATH } : { type: "render" };
    }

    if (isProtectedKasirPath(pathname)) {
        return allowed ? { type: "render" } : { type: "redirect", to: KASIR_LOGIN_PATH };
    }

    return { type: "render" };
}