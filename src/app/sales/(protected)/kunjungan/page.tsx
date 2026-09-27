import { Suspense } from "react";
import { SalesVisitFlow } from "@/components/sales/SalesVisitFlow";

export const dynamic = "force-dynamic";

export default function SalesVisitPage() {
    return (
        <Suspense fallback={null}>
            <SalesVisitFlow />
        </Suspense>
    );
}