import { redirect } from "next/navigation";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { AccountDashboard } from "@/components/account/account-dashboard";

export default async function AccountPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/account");
    return <AccountDashboard initialUser={publicUser(user)} />;
}