import { redirect } from "next/navigation";
import { publicUser } from "@/lib/auth";
import { getCurrentUser } from "@/lib/server-auth";
import { AccountDashboard } from "@/components/account/account-dashboard";

export default async function AccountPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/account");
    return <AccountDashboard initialUser={publicUser(user)} />;
}