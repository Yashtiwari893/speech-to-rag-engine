import { NextResponse } from "next/server";
import { getAllShopifyStores } from "@/lib/shopifyClient";

export const runtime = "nodejs";

export async function GET() {
    try {
        const stores = await getAllShopifyStores();

        const formattedStores = stores.map(store => ({
            id: store.id,
            phone_number: store.phone_number,
            store_name: store.store_name,
            store_domain: store.store_domain,
            website_url: store.website_url,
            last_synced_at: store.last_synced_at,
            created_at: store.created_at
        }));

        return NextResponse.json({
            stores: formattedStores
        });

    } catch (error: any) {
        console.error("Shopify stores list error:", error);
        return NextResponse.json({
            error: error.message || "Failed to fetch Shopify stores"
        }, { status: 500 });
    }
}