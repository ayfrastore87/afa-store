/**
 * QRIS Provider Configuration
 *
 * Controls which QRIS payment provider to use:
 * - MANUAL: Uses static merchant QRIS image, requires admin confirmation
 * - MIDTRANS: Uses Midtrans QRIS API with automatic webhook verification
 *
 * Environment variable: QRIS_PROVIDER (server-side only)
 */

const QRIS_PROVIDER_ENV = process.env.QRIS_PROVIDER?.trim().toUpperCase();

export const QrisProvider = {
    MANUAL: 'MANUAL',
    MIDTRANS: 'MIDTRANS',
} as const;

export type QrisProviderType = (typeof QrisProvider)[keyof typeof QrisProvider];

/**
 * Returns the active QRIS provider from environment variable.
 * Defaults to 'MANUAL' for safety during Midtrans production setup.
 */
export function getQrisProvider(): QrisProviderType {
    if (QRIS_PROVIDER_ENV === QrisProvider.MIDTRANS) {
        return QrisProvider.MIDTRANS;
    }
    // Default to MANUAL for safety during Midtrans production verification
    return QrisProvider.MANUAL;
}

/**
 * Checks if the current QRIS provider is MANUAL
 */
export function isManualQris(): boolean {
    return getQrisProvider() === QrisProvider.MANUAL;
}

/**
 * Checks if the current QRIS provider is MIDTRANS
 */
export function isMidtransQris(): boolean {
    return getQrisProvider() === QrisProvider.MIDTRANS;
}

// Re-export commonly used payment types
export const PAYMENT_METHODS = ["QRIS", "TRANSFER_BANK", "COD", "MIDTRANS", "TRIPAY", "XENDIT"] as const;