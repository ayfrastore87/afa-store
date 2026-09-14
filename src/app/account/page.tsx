import { redirect } from "next/navigation";
import { publicUser } from "@/lib/auth";
import { getCurrentCustomer, getCurrentUser } from "@/lib/server-auth";
import { AccountDashboard } from "@/components/account/account-dashboard";

export default async function AccountPage() {
    const user = await getCurrentUser();
    // Unauthenticated → customer login.
    if (!user) redirect("/login?next=/account");
    // Admin is never a customer account; send to the admin portal.
    if (user.role === "admin") redirect("/admin");
    // Only an active "customer" role may render the customer dashboard.
    // Partner / inactive rows fall through to the login boundary.
    const customer = await getCurrentCustomer();
    if (!customer) redirect("/login?next=/account");
    return <AccountDashboard initialUser={publicUser(customer)} />;
}