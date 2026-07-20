import { AuthForm } from "@/components/account/auth-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const params = await searchParams;
    return <AuthForm mode="reset" token={params.token} />;
}