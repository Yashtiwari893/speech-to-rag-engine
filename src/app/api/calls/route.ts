import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

type CallRow = {
    id: string;
    file_name: string;
    status: string;
    phone_number: string | null;
    uploaded_at: string;
    processed_at: string | null;
    error_reason: string | null;
    call_transcripts?: { transcript: string; transcript_length: number }[];
    call_classifications?: {
        is_blank: boolean;
        is_spam: boolean;
        is_11za_related: boolean;
        blank_confidence: number;
        spam_confidence: number;
        relevance_confidence: number;
    }[];
    rag_chunks?: { count: number }[];
};

export async function GET() {
    try {
        // First check if the call_recordings table exists
        const { error: tableCheckError } = await supabase
            .from("call_recordings")
            .select("id")
            .limit(1);

        if (tableCheckError && tableCheckError.message.includes('relation "public.call_recordings" does not exist')) {
            return NextResponse.json({
                calls: [],
                message: "Database migration required. Please run the migration SQL to create call recording tables.",
                migrationRequired: true
            });
        }

        const { data, error } = await supabase
            .from("call_recordings")
            .select(`
                id,
                file_name,
                status,
                phone_number,
                uploaded_at,
                processed_at,
                error_reason,
                call_transcripts(transcript, transcript_length),
                call_classifications(is_blank, is_spam, is_11za_related, blank_confidence, spam_confidence, relevance_confidence),
                rag_chunks(count)
            `)
            .order("uploaded_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const calls = (data as CallRow[] | null)?.map((call) => ({
            id: call.id,
            file_name: call.file_name,
            status: call.status,
            phone_number: call.phone_number,
            uploaded_at: call.uploaded_at,
            processed_at: call.processed_at,
            error_reason: call.error_reason,
            transcript: call.call_transcripts?.[0]?.transcript || null,
            transcript_length: call.call_transcripts?.[0]?.transcript_length || 0,
            classification: call.call_classifications?.[0] || null,
            chunk_count: call.rag_chunks?.[0]?.count ?? 0,
        })) ?? [];

        return NextResponse.json({ calls });
    } catch (err) {
        console.error("API Error:", err);
        return NextResponse.json({
            error: "Internal server error",
            calls: []
        }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("call_recordings").delete().eq("id", id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}