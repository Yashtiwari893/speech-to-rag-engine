import { NextResponse } from "next/server";
import { createShopifyStore } from "@/lib/shopifyClient";
import { createShopifyMapping } from "@/lib/phoneMapping";
import { processShopifyStore } from "@/lib/shopifyProcessor";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phone_number, shopify_store_domain, shopify_storefront_token, website_url, auth_token, origin } = body;

        if (!phone_number || !shopify_store_domain || !shopify_storefront_token || !website_url || !auth_token || !origin) {
            return NextResponse.json({
                error: "phone_number, shopify_store_domain, shopify_storefront_token, website_url, auth_token, and origin are all required"
            }, { status: 400 });
        }

        // Validate domain format
        if (!shopify_store_domain.includes('.myshopify.com')) {
            return NextResponse.json({
                error: "Invalid Shopify store domain. Must be in format: yourstore.myshopify.com"
            }, { status: 400 });
        }

        console.log(`Setting up Shopify store for phone: ${phone_number}, domain: ${shopify_store_domain}`);

        // Create/update Shopify store record
        const store = await createShopifyStore(
            phone_number,
            shopify_store_domain,
            shopify_storefront_token,
            website_url
        );

        // Create phone mapping with 11za credentials
        await createShopifyMapping(phone_number, store.id, undefined, undefined, auth_token, origin);

        // Process and sync store data
        try {
            await processShopifyStore(store.id);
            console.log(`Successfully processed Shopify store: ${store.id}`);
        } catch (syncError) {
            console.error(`Failed to sync store data:`, syncError);
            // Don't fail the setup if sync fails - user can retry sync later
        }

        return NextResponse.json({
            success: true,
            store: {
                id: store.id,
                store_name: store.store_name,
                store_domain: store.store_domain,
                website_url: store.website_url,
                last_synced_at: store.last_synced_at
            }
        });

    } catch (error: any) {
        console.error("Shopify setup error:", error);
        return NextResponse.json({
            error: error.message || "Failed to setup Shopify store"
        }, { status: 500 });
    }
}