import "server-only";

// Centralised, server-only feature flag for the guest-checkout rollout.
//
// This flag gates every new guest-checkout code path introduced in the
// FASE-2.5x guest-checkout preparation. It is intentionally server-only
// (no NEXT_PUBLIC_ prefix): the client MUST never know or expose whether
// guest checkout is active, because the client is not the authority.
//
// Semantics:
//   GUEST_CHECKOUT_ENABLED === "true"  → guest paths may execute
//   any other value / absent            → authenticated behaviour ONLY
//
// The default (absent env var) is FALSE by design, per FASE-2.5x gate:
// guest code stays dormant until the schema migration has been applied
// and independently reviewed.
export function isGuestCheckoutEnabled(): boolean {
    return process.env.GUEST_CHECKOUT_ENABLED === "true";
}
