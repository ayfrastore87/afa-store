/*
 * Pure gesture policy for the checkout map (no DOM, no React, no Google).
 *
 * WHY: one setting cannot serve both device classes.
 *   - Coarse pointer (phone/tablet): the customer must still be able to SCROLL the page/modal
 *     with one finger while two fingers pinch-zoom the map, so the map is `cooperative`.
 *   - Fine pointer (mouse/trackpad): the wheel is expected to zoom the map under the cursor,
 *     which requires `greedy`.
 *
 * `matchMedia("(pointer: coarse)")` is used instead of a viewport width: a narrow desktop
 * window still has a mouse, and a big tablet still has a touch screen. When the browser cannot
 * tell, `cooperative` is chosen — the map may then ask for two fingers, but the page is never
 * locked. A locked page is a far worse failure than a zoom hint.
 *
 * The component re-reads this whenever the media query fires (or the device rotates), so
 * resizing/orientation changes can never leave the wrong policy active.
 */

export const COARSE_POINTER_QUERY = "(pointer: coarse)";

export type MapGestureHandling = "cooperative" | "greedy";

/** `true` = touch-first device, `false` = mouse/trackpad, `null`/`undefined` = unknown. */
export function resolveGestureHandling(coarsePointer: boolean | null | undefined): MapGestureHandling {
    return coarsePointer === false ? "greedy" : "cooperative";
}

/** The `matchMedia` surface this policy needs (a real `window` satisfies it). */
export interface CoarsePointerMediaSource {
    matchMedia?: (query: string) => { matches: boolean } | null;
}

/** `true`/`false` when the device can be asked, `null` when it cannot. */
export function prefersCoarsePointer(source: CoarsePointerMediaSource | null | undefined): boolean | null {
    if (!source || typeof source.matchMedia !== "function") return null;
    const query = source.matchMedia(COARSE_POINTER_QUERY);
    if (!query || typeof query.matches !== "boolean") return null;
    return query.matches;
}

/** The gesture policy for this device: cooperative on touch, greedy on mouse. */
export function preferredGestureHandling(source: CoarsePointerMediaSource | null | undefined): MapGestureHandling {
    return resolveGestureHandling(prefersCoarsePointer(source));
}
