import { supabase } from "@/lib/supabaseClient";

export async function retrieveRelevantChunks(
    queryEmbedding: number[],
    fileId?: string,
    limit = 5,
    sourceTypes: string[] = ['pdf', 'call']
) {
    const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_count: limit,
        target_file: fileId ?? null,
        source_types: sourceTypes,
    });

    if (error) {
        console.error("VECTOR SEARCH ERROR:", error);
        throw error;
    }

    return data as { id: string; chunk: string; similarity: number; source_type: string; source_id: string }[];
}

/**
 * Retrieve relevant chunks from multiple files (for phone number mappings)
 */
export async function retrieveRelevantChunksFromFiles(
    queryEmbedding: number[],
    fileIds: string[],
    limit = 5
) {
    if (fileIds.length === 0) {
        return [];
    }

    if (fileIds.length === 1) {
        return retrieveRelevantChunks(queryEmbedding, fileIds[0], limit, ['pdf']);
    }

    // For multiple files, we need to search across all of them
    // We'll get results from each file and then merge them
    const allChunks: { id: string; chunk: string; similarity: number; file_id: string }[] = [];

    for (const fileId of fileIds) {
        const chunks = await retrieveRelevantChunks(queryEmbedding, fileId, limit, ['pdf']);
        allChunks.push(...chunks.map(c => ({ ...c, file_id: fileId })));
    }

    // Sort by similarity and return top N
    return allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Retrieve relevant chunks from files and calls for a phone number
 */
export async function retrieveRelevantChunksForPhone(
    queryEmbedding: number[],
    fileIds: string[],
    callIds: string[],
    limit = 5
) {
    const allChunks: { id: string; chunk: string; similarity: number; source_type: string; source_id: string }[] = [];

    // Get chunks from PDFs
    if (fileIds.length > 0) {
        for (const fileId of fileIds) {
            const chunks = await retrieveRelevantChunks(queryEmbedding, fileId, limit, ['pdf']);
            allChunks.push(...chunks);
        }
    }

    // Get chunks from approved calls
    if (callIds.length > 0) {
        // For calls, we search without target_file filter since calls are source-specific
        const callChunks = await retrieveRelevantChunks(queryEmbedding, undefined, limit * callIds.length, ['call']);
        // Filter to only include chunks from the specified call IDs
        const filteredCallChunks = callChunks.filter(chunk => callIds.includes(chunk.source_id));
        allChunks.push(...filteredCallChunks);
    }

    // Sort by similarity and return top N
    return allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Retrieve relevant Shopify chunks for a store
 */
export async function retrieveRelevantShopifyChunks(
    queryEmbedding: number[],
    storeId: string,
    limit = 5
) {
    const { data, error } = await supabase.rpc("match_shopify_chunks", {
        query_embedding: queryEmbedding,
        store_id_param: storeId,
        match_count: limit,
    });

    if (error) {
        console.error("SHOPIFY VECTOR SEARCH ERROR:", error);
        throw error;
    }

    return data?.map((row: any) => ({
        id: row.id,
        chunk: row.chunk_text,
        similarity: row.similarity,
        store_id: row.store_id,
        content_type: row.content_type,
        title: row.title,
        metadata: row.metadata
    })) || [];
}
