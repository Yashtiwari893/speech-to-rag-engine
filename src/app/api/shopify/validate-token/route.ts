import { NextResponse } from "next/server";
import { ShopifyAPIClient } from "@/lib/shopifyClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1. Parse JSON body to get store_domain and storefront_token
    const body = await req.json();
    const { store_domain, storefront_token } = body;

    // Check if required fields are present
    if (!store_domain || !storefront_token) {
      throw new Error("store_domain and storefront_token are required");
    }

    // 2. Validate store_domain ends with ".myshopify.com"
    if (!store_domain.endsWith('.myshopify.com')) {
      throw new Error("Invalid Shopify store domain. Must end with '.myshopify.com'");
    }

    // 3. Instantiate ShopifyAPIClient with store_domain and storefront_token
    const client = new ShopifyAPIClient(store_domain, storefront_token);

    // 4. Call getStoreInfo to verify token validity
    const storeInfo = await client.getStoreInfo();

    // 5. Return success response
    return NextResponse.json({
      valid: true,
      store_name: storeInfo.name
    });

  } catch (error: any) {
    // Return error response
    return NextResponse.json({
      valid: false,
      error: error.message || "Failed to validate token"
    }, { status: 400 });
  }
}