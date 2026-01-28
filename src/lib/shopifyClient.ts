import { supabase } from "./supabaseClient";

export interface ShopifyStore {
    id: string;
    phone_number: string;
    store_domain: string;
    storefront_token: string;
    website_url: string;
    store_name?: string;
    last_synced_at?: string;
    created_at: string;
    updated_at: string;
}

export interface ShopifyProduct {
    id: string;
    title: string;
    description: string;
    handle: string;
    onlineStoreUrl?: string;
    variants: Array<{
        id: string;
        price: {
            amount: string;
            currencyCode: string;
        };
        compareAtPrice?: {
            amount: string;
            currencyCode: string;
        };
        availableForSale: boolean;
        sku?: string;
    }>;
    images: Array<{
        url: string;
        altText?: string;
    }>;
}

export interface ShopifyPage {
    id: string;
    title: string;
    handle: string;
    body: string;
}

export interface ShopifyCollection {
    id: string;
    title: string;
    description?: string;
    handle: string;
}

export class ShopifyAPIClient {
    private storeDomain: string;
    private storefrontToken: string;

    constructor(storeDomain: string, storefrontToken: string) {
        this.storeDomain = storeDomain;
        this.storefrontToken = storefrontToken;
    }

    private async makeRequest(query: string, variables?: any): Promise<any> {
        const url = `https://${this.storeDomain}/api/2024-01/graphql.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': this.storefrontToken,
            },
            body: JSON.stringify({
                query,
                variables: variables || {}
            })
        });

        if (!response.ok) {
            let errorMessage = `Shopify API error: ${response.status} ${response.statusText}`;

            // Provide specific guidance for common errors
            if (response.status === 401) {
                errorMessage = 'Invalid or expired Shopify storefront access token. Please check your token and try again.';
            } else if (response.status === 403) {
                errorMessage = 'Access forbidden. Your storefront token may not have the required permissions.';
            } else if (response.status === 404) {
                errorMessage = 'Shopify store not found. Please check your store domain.';
            } else if (response.status === 429) {
                errorMessage = 'Rate limit exceeded. Please try again later.';
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        return data.data;
    }

    async getStoreInfo(): Promise<{ name: string }> {
        const query = `
            query GetStoreInfo {
                shop {
                    name
                }
            }
        `;

        const data = await this.makeRequest(query);
        return {
            name: data.shop.name
        };
    }

    async getProducts(first: number = 250, after?: string): Promise<{
        products: ShopifyProduct[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetProducts($first: Int!, $after: String) {
                products(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            description
                            handle
                            onlineStoreUrl
                            variants(first: 100) {
                                edges {
                                    node {
                                        id
                                        price {
                                            amount
                                            currencyCode
                                        }
                                        compareAtPrice {
                                            amount
                                            currencyCode
                                        }
                                        availableForSale
                                        sku
                                    }
                                }
                            }
                            images(first: 10) {
                                edges {
                                    node {
                                        url
                                        altText
                                    }
                                }
                            }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const products = data.products.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            description: edge.node.description,
            handle: edge.node.handle,
            onlineStoreUrl: edge.node.onlineStoreUrl,
            variants: edge.node.variants.edges.map((vEdge: any) => vEdge.node),
            images: edge.node.images.edges.map((iEdge: any) => iEdge.node)
        }));

        return {
            products,
            hasNextPage: data.products.pageInfo.hasNextPage,
            endCursor: data.products.pageInfo.endCursor
        };
    }

    async getPages(first: number = 100, after?: string): Promise<{
        pages: ShopifyPage[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetPages($first: Int!, $after: String) {
                pages(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            handle
                            body
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const pages = data.pages.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            handle: edge.node.handle,
            body: edge.node.body
        }));

        return {
            pages,
            hasNextPage: data.pages.pageInfo.hasNextPage,
            endCursor: data.pages.pageInfo.endCursor
        };
    }

    async getCollections(first: number = 100, after?: string): Promise<{
        collections: ShopifyCollection[],
        hasNextPage: boolean,
        endCursor?: string
    }> {
        const query = `
            query GetCollections($first: Int!, $after: String) {
                collections(first: $first, after: $after) {
                    edges {
                        node {
                            id
                            title
                            description
                            handle
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const data = await this.makeRequest(query, { first, after });

        const collections = data.collections.edges.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            description: edge.node.description,
            handle: edge.node.handle
        }));

        return {
            collections,
            hasNextPage: data.collections.pageInfo.hasNextPage,
            endCursor: data.collections.pageInfo.endCursor
        };
    }
}

// Database operations
export async function createShopifyStore(
    phoneNumber: string,
    storeDomain: string,
    storefrontToken: string,
    websiteUrl: string
): Promise<ShopifyStore> {
    // First validate the credentials
    const client = new ShopifyAPIClient(storeDomain, storefrontToken);
    const storeInfo = await client.getStoreInfo();

    const { data, error } = await supabase
        .from('shopify_stores')
        .upsert({
            phone_number: phoneNumber,
            store_domain: storeDomain,
            storefront_token: storefrontToken,
            website_url: websiteUrl,
            store_name: storeInfo.name
        }, {
            onConflict: 'phone_number'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create Shopify store: ${error.message}`);
    }

    return data;
}

export async function getShopifyStoreByPhone(phoneNumber: string): Promise<ShopifyStore | null> {
    const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();

    if (error) {
        if (error.code === 'PGRST116') { // No rows returned
            return null;
        }
        throw new Error(`Failed to get Shopify store: ${error.message}`);
    }

    return data;
}

export async function getAllShopifyStores(): Promise<ShopifyStore[]> {
    const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to get Shopify stores: ${error.message}`);
    }

    return data || [];
}

export async function updateLastSynced(storeId: string): Promise<void> {
    const { error } = await supabase
        .from('shopify_stores')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', storeId);

    if (error) {
        throw new Error(`Failed to update last synced: ${error.message}`);
    }
}