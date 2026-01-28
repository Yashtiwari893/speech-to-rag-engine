import { chunkText } from "./chunk";
import { embedText } from "./embeddings";
import { supabase } from "./supabaseClient";
import { ShopifyAPIClient, ShopifyProduct, ShopifyPage, ShopifyCollection } from "./shopifyClient";

export interface ShopifyChunkData {
    content_type: 'product' | 'page' | 'collection';
    content_id: string;
    title: string;
    text: string;
    metadata: any;
}

export class ShopifyDataProcessor {
    private client: ShopifyAPIClient;
    private storeId: string;
    private storeDomain: string;

    constructor(storeDomain: string, storefrontToken: string, storeId: string) {
        this.client = new ShopifyAPIClient(storeDomain, storefrontToken);
        this.storeId = storeId;
        this.storeDomain = storeDomain;
    }

    // Convert product to readable text
    private productToText(product: ShopifyProduct): string {
        let text = `Product: ${product.title}\n`;

        if (product.description) {
            // Remove HTML tags and clean up description
            const cleanDescription = product.description.replace(/<[^>]*>/g, '').trim();
            text += `Description: ${cleanDescription}\n`;
        }

        // Add pricing information
        const prices = product.variants.map(v => parseFloat(v.price.amount)).filter(p => !isNaN(p));
        if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const currencyCode = product.variants[0].price.currencyCode;
            if (minPrice === maxPrice) {
                text += `Price: ${currencyCode} ${minPrice.toFixed(2)}\n`;
            } else {
                text += `Price Range: ${currencyCode} ${minPrice.toFixed(2)} - ${currencyCode} ${maxPrice.toFixed(2)}\n`;
            }
        }

        // Add availability
        const availableVariants = product.variants.filter(v => v.availableForSale);
        const totalVariants = product.variants.length;
        text += `Availability: ${availableVariants.length}/${totalVariants} variants available\n`;

        // Add SKUs if available
        const skus = product.variants.map(v => v.sku).filter(Boolean);
        if (skus.length > 0) {
            text += `SKUs: ${skus.join(', ')}\n`;
        }

        // Add image info
        if (product.images.length > 0) {
            text += `Images: ${product.images.length} available\n`;
        }

        return text.trim();
    }

    // Convert page to readable text
    private pageToText(page: ShopifyPage): string {
        let text = `Page: ${page.title}\n`;

        if (page.body) {
            // Remove HTML tags and clean up body
            const cleanBody = page.body.replace(/<[^>]*>/g, '').trim();
            text += `Content: ${cleanBody}\n`;
        }

        return text.trim();
    }

    // Convert collection to readable text
    private collectionToText(collection: ShopifyCollection): string {
        let text = `Collection: ${collection.title}\n`;

        if (collection.description) {
            const cleanDescription = collection.description.replace(/<[^>]*>/g, '').trim();
            text += `Description: ${cleanDescription}\n`;
        }

        return text.trim();
    }

    // Process all data from Shopify store
    async processAllData(): Promise<void> {
        console.log('Starting Shopify data processing (limited for testing)...');

        // Clear existing chunks for this store
        await this.clearExistingChunks();

        // Process limited products (6)
        await this.processProducts();

        // Process limited pages (3)
        await this.processPages();

        // Process limited collections (3)
        await this.processCollections();

        console.log('Shopify data processing completed (limited for testing).');
    }

    private async clearExistingChunks(): Promise<void> {
        const { error } = await supabase
            .from('shopify_chunks')
            .delete()
            .eq('store_id', this.storeId);

        if (error) {
            throw new Error(`Failed to clear existing chunks: ${error.message}`);
        }

        console.log(`Cleared existing chunks for store ${this.storeId}`);
    }

    private async processProducts(): Promise<void> {
        console.log('Processing products (limited to 6 for testing)...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalProducts = 0;
        const maxProducts = 6; // Limit for testing

        while (hasNextPage && totalProducts < maxProducts) {
            const { products, hasNextPage: nextPage, endCursor: cursor } = await this.client.getProducts(250, endCursor);

            for (const product of products) {
                if (totalProducts >= maxProducts) break;
                await this.processProduct(product);
                totalProducts++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalProducts} products (limited for testing)`);
    }

    private async processProduct(product: ShopifyProduct): Promise<void> {
        const text = this.productToText(product);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        // Construct product URL
        let productUrl: string;
        if (product.onlineStoreUrl) {
            productUrl = product.onlineStoreUrl;
        } else {
            // Fallback: construct URL using store domain and handle
            productUrl = `https://${this.storeDomain}/products/${product.handle}`;
        }

        const metadata = {
            handle: product.handle,
            url: productUrl,
            variants_count: product.variants.length,
            images_count: product.images.length,
            available_variants: product.variants.filter(v => v.availableForSale).length
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'product',
                content_id: product.id,
                title: product.title,
                text: chunk,
                metadata
            });
        }
    }

    private async processPages(): Promise<void> {
        console.log('Processing pages (limited to 3 for testing)...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalPages = 0;
        const maxPages = 3; // Limit for testing

        while (hasNextPage && totalPages < maxPages) {
            const { pages, hasNextPage: nextPage, endCursor: cursor } = await this.client.getPages(100, endCursor);

            for (const page of pages) {
                if (totalPages >= maxPages) break;
                await this.processPage(page);
                totalPages++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalPages} pages (limited for testing)`);
    }

    private async processPage(page: ShopifyPage): Promise<void> {
        const text = this.pageToText(page);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        const metadata = {
            handle: page.handle
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'page',
                content_id: page.id,
                title: page.title,
                text: chunk,
                metadata
            });
        }
    }

    private async processCollections(): Promise<void> {
        console.log('Processing collections (limited to 3 for testing)...');

        let hasNextPage = true;
        let endCursor: string | undefined;
        let totalCollections = 0;
        const maxCollections = 3; // Limit for testing

        while (hasNextPage && totalCollections < maxCollections) {
            const { collections, hasNextPage: nextPage, endCursor: cursor } = await this.client.getCollections(100, endCursor);

            for (const collection of collections) {
                if (totalCollections >= maxCollections) break;
                await this.processCollection(collection);
                totalCollections++;
            }

            hasNextPage = nextPage;
            endCursor = cursor;
        }

        console.log(`Processed ${totalCollections} collections (limited for testing)`);
    }

    private async processCollection(collection: ShopifyCollection): Promise<void> {
        const text = this.collectionToText(collection);
        const chunks = chunkText(text, 1500).filter(c => c.trim().length > 0);

        const metadata = {
            handle: collection.handle
        };

        for (const chunk of chunks) {
            await this.storeChunk({
                content_type: 'collection',
                content_id: collection.id,
                title: collection.title,
                text: chunk,
                metadata
            });
        }
    }

    private async storeChunk(chunkData: ShopifyChunkData): Promise<void> {
        // Generate embedding for the chunk
        const embedding = await embedText(chunkData.text);

        if (!embedding) {
            throw new Error(`Failed to generate embedding for chunk: ${chunkData.title}`);
        }

        // Store in database
        const { error } = await supabase
            .from('shopify_chunks')
            .insert({
                store_id: this.storeId,
                content_type: chunkData.content_type,
                content_id: chunkData.content_id,
                title: chunkData.title,
                chunk_text: chunkData.text,
                embedding,
                metadata: chunkData.metadata
            });

        if (error) {
            // Handle unique constraint violations (skip duplicates)
            if (error.code === '23505') {
                console.log(`Skipping duplicate chunk for ${chunkData.content_type}: ${chunkData.title}`);
                return;
            }
            throw new Error(`Failed to store chunk: ${error.message}`);
        }
    }
}

// Utility function to process a store
export async function processShopifyStore(storeId: string): Promise<void> {
    // Get store details
    const { data: store, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('id', storeId)
        .single();

    if (error || !store) {
        throw new Error(`Store not found: ${storeId}`);
    }

    const processor = new ShopifyDataProcessor(
        store.store_domain,
        store.storefront_token,
        storeId
    );

    await processor.processAllData();

    // Update last synced timestamp
    await supabase
        .from('shopify_stores')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', storeId);
}

// Fix Shopify sync 401 Unauthorized error
// Write a function that:
// 1. Takes storeDomain and storefrontToken as input
// 2. Validates the token by calling Shopify Storefront GraphQL API (shop { name })
// 3. Ensures the URL is Storefront API endpoint (https://storeDomain/api/2024-01/graphql.json)
// 4. Logs the URL and token for debugging
// 5. If token is invalid or unauthorized, return detailed error message
// 6. If valid, proceed to fetch products, collections, pages safely using Storefront API
// 7. Return structured response { success: boolean, data?: any, error?: string }
// Include proper try-catch and error handling
export async function syncShopifyStore(storeDomain: string, storefrontToken: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        // 1. Takes storeDomain and storefrontToken as input
        // 2. Validates the token by calling Shopify Storefront GraphQL API (shop { name })
        // 3. Ensures the URL is Storefront API endpoint (https://storeDomain/api/2024-01/graphql.json)
        const apiUrl = `https://${storeDomain}/api/2024-01/graphql.json`;

        // 4. Logs the URL and token for debugging
        console.log(`Syncing Shopify store - URL: ${apiUrl}`);
        console.log(`Token: ${storefrontToken.substring(0, 10)}...`);

        // Create client and validate token
        const client = new ShopifyAPIClient(storeDomain, storefrontToken);

        // Test token validity with a simple query
        const storeInfo = await client.getStoreInfo();
        console.log(`Token validated for store: ${storeInfo.name}`);

        // 5. If token is invalid or unauthorized, return detailed error message
        // (handled by try-catch)

        // 6. If valid, proceed to fetch products, collections, pages safely using Storefront API
        // Fetch summary data without processing chunks
        const products = await client.getProducts(10); // Get first 10 products
        const collections = await client.getCollections(10); // Get first 10 collections
        const pages = await client.getPages(10); // Get first 10 pages

        const data = {
            products: products.products,
            collections: collections.collections,
            pages: pages.pages
        };

        // 7. Return structured response
        return {
            success: true,
            data: {
                store_name: storeInfo.name,
                products_count: products.products?.length || 0,
                collections_count: collections.collections?.length || 0,
                pages_count: pages.pages?.length || 0,
                sample_data: data
            }
        };

    } catch (error: any) {
        console.error('Shopify sync error:', error);

        // 5. If token is invalid or unauthorized, return detailed error message
        let errorMessage = 'Failed to sync Shopify store';

        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            errorMessage = 'Invalid or expired Shopify storefront token. Please check your token permissions.';
        } else if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
            errorMessage = 'Shopify token lacks required permissions. Ensure storefront access token has read access.';
        } else if (error.message?.includes('404')) {
            errorMessage = 'Shopify store not found. Please verify the store domain.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

// Fix Mistral API 429 rate limit issue during Shopify sync
// Update the syncShopifyStore function to:
// 1. Automatically retry API calls when a 429 rate limit error occurs
// 2. Implement exponential backoff between retries
// 3. Add a small delay between successive API requests to avoid hitting rate limit
// 4. Cache embeddings locally or in database to prevent duplicate calls
// 5. Log retries and errors for debugging
// 6. Ensure Shopify product/page/collection sync continues even if some API calls fail
// Generate TypeScript code that:
// - Fetches Mistral embeddings safely
// - Handles 429 errors with retries
// - Throttles requests
// - Optionally caches results
async function syncShopifyWithMistralRateLimitSafe(products: ShopifyProduct[]) {
    const results: { product: ShopifyProduct; chunks: ShopifyChunkData[]; success: boolean; error?: string }[] = [];
    const embeddingCache = new Map<string, number[]>(); // Cache for embeddings
    const requestDelay = 100; // 100ms delay between requests

    for (const product of products) {
        try {
            console.log(`Processing product: ${product.title}`);

            // Convert product to text
            const productText = productToText(product);

            // Chunk the text
            const chunks = chunkText(productText, 1500).filter(c => c.trim().length > 0);

            const processedChunks: ShopifyChunkData[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                // Check cache first
                let embedding = embeddingCache.get(chunk);
                if (!embedding) {
                    // Fetch embedding with rate limit handling
                    embedding = await embedTextWithRateLimit(chunk, embeddingCache);
                }

                // Create chunk data
                const chunkData: ShopifyChunkData = {
                    content_type: 'product',
                    content_id: product.id,
                    title: product.title,
                    text: chunk,
                    metadata: {
                        handle: product.handle,
                        variants_count: product.variants.length,
                        chunk_index: i,
                        total_chunks: chunks.length
                    }
                };

                processedChunks.push(chunkData);

                // Add delay between requests to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, requestDelay));
                }
            }

            results.push({
                product,
                chunks: processedChunks,
                success: true
            });

        } catch (error: any) {
            console.error(`Failed to process product ${product.title}:`, error);
            results.push({
                product,
                chunks: [],
                success: false,
                error: error.message || 'Unknown error'
            });
            // Continue with next product even if this one fails
        }
    }

    return results;
}

// Helper function to convert product to text (extracted from class)
function productToText(product: ShopifyProduct): string {
    let text = `Product: ${product.title}\n`;

    if (product.description) {
        // Remove HTML tags and clean up description
        const cleanDescription = product.description.replace(/<[^>]*>/g, '').trim();
        text += `Description: ${cleanDescription}\n`;
    }

    // Add pricing information
    const prices = product.variants.map(v => parseFloat(v.price.amount)).filter(p => !isNaN(p));
    if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const currencyCode = product.variants[0].price.currencyCode;
        if (minPrice === maxPrice) {
            text += `Price: ${currencyCode} ${minPrice.toFixed(2)}\n`;
        } else {
            text += `Price Range: ${currencyCode} ${minPrice.toFixed(2)} - ${currencyCode} ${maxPrice.toFixed(2)}\n`;
        }
    }

    // Add availability
    const availableVariants = product.variants.filter(v => v.availableForSale);
    const totalVariants = product.variants.length;
    text += `Availability: ${availableVariants.length}/${totalVariants} variants available\n`;

    return text;
}

// Enhanced embedText with caching and better rate limit handling
async function embedTextWithRateLimit(text: string, cache: Map<string, number[]>): Promise<number[]> {
    // Check cache first
    if (cache.has(text)) {
        return cache.get(text)!;
    }

    const maxRetries = 5;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const embedding = await embedText(text, 0); // Use existing embedText but with 0 retries since we handle here

            // Cache the result
            cache.set(text, embedding);

            return embedding;

        } catch (error: any) {
            lastError = error;

            const isRateLimit = error?.statusCode === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');

            if (isRateLimit && attempt < maxRetries - 1) {
                // Exponential backoff with jitter
                const baseWait = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
                const jitter = Math.random() * 1000; // Add up to 1s jitter
                const waitTime = baseWait + jitter;

                console.log(`Mistral rate limit hit for text chunk. Retrying in ${Math.round(waitTime/1000)}s (attempt ${attempt + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // If not rate limit or out of retries, throw
            throw error;
        }
    }

    throw lastError || new Error('Failed to generate embedding after all retries');
}