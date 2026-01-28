import { NextResponse } from "next/server";
import { getShopifyStoreByPhone } from "@/lib/shopifyClient";
import { processShopifyStore } from "@/lib/shopifyProcessor";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phone_number } = body;

        if (!phone_number) {
            return NextResponse.json({
                error: "phone_number is required"
            }, { status: 400 });
        }

        console.log(`Syncing Shopify store for phone: ${phone_number}`);

        // Get store for phone number
        const store = await getShopifyStoreByPhone(phone_number);

        if (!store) {
            return NextResponse.json({
                error: "No Shopify store found for this phone number"
            }, { status: 404 });
        }

        // Process and sync store data
        await processShopifyStore(store.id);

        // Get updated store info
        const updatedStore = await getShopifyStoreByPhone(phone_number);

        return NextResponse.json({
            success: true,
            store: {
                id: updatedStore?.id,
                store_name: updatedStore?.store_name,
                store_domain: updatedStore?.store_domain,
                website_url: updatedStore?.website_url,
                last_synced_at: updatedStore?.last_synced_at
            }
        });

    } catch (error: any) {
        console.error("Shopify sync error:", error);
        return NextResponse.json({
            error: error.message || "Failed to sync Shopify store"
        }, { status: 500 });
    }
}