const requiredEnv = ["MIDTRANS_SERVER_KEY", "MIDTRANS_MERCHANT_ID", "MIDTRANS_IS_PRODUCTION"] as const;

export function validateMidtransEnvOnStartup() {
    for (const key of requiredEnv) {
        if (!process.env[key]?.trim()) {
            console.error(`${key} missing`);
        }
    }
}
