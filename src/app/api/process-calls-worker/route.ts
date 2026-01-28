import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { chunkText } from "@/lib/chunk";
import { embedText } from "@/lib/embeddings";
import Groq from "groq-sdk";

export const runtime = "nodejs";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

// Speech-to-text using Groq Whisper
async function transcribeAudio(audioBuffer: ArrayBuffer, fileName: string): Promise<string> {
    try {
        // Convert ArrayBuffer to File-like object for Groq
        const audioFile = new File([audioBuffer], fileName, { type: 'audio/mpeg' });

        const transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-large-v3",
            response_format: "text",
            language: "en",
        });

        const transcript = typeof transcription === 'string' ? transcription : (transcription as any).text || "";
        return transcript;
    } catch (error) {
        console.error("Transcription error:", error);
        throw new Error("Failed to transcribe audio");
    }
}

// Classify transcript for blank, spam, and 11za relevance
async function classifyTranscript(transcript: string): Promise<{
    isBlank: boolean;
    isSpam: boolean;
    is11zaRelated: boolean;
    blankConfidence: number;
    spamConfidence: number;
    relevanceConfidence: number;
}> {
    const prompt = `Analyze this call transcript and classify it according to these criteria:

TRANSCRIPT:
${transcript}

CLASSIFICATION TASKS:
1. Is this transcript BLANK or mostly empty? (very short, no meaningful content, silence, etc.)
2. Is this transcript SPAM? (marketing calls, scams, irrelevant promotions, etc.)
3. Is this transcript related to 11za business? (customer service, orders, products, support calls, etc.)

Respond with JSON only:
{
  "isBlank": boolean,
  "isSpam": boolean,
  "is11zaRelated": boolean,
  "blankConfidence": 0-1,
  "spamConfidence": 0-1,
  "relevanceConfidence": 0-1,
  "reasoning": "brief explanation"
}`;

    try {
        const response = await groq.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("No classification response");

        const classification = JSON.parse(content);

        return {
            isBlank: classification.isBlank || false,
            isSpam: classification.isSpam || false,
            is11zaRelated: classification.is11zaRelated || false,
            blankConfidence: classification.blankConfidence || 0,
            spamConfidence: classification.spamConfidence || 0,
            relevanceConfidence: classification.relevanceConfidence || 0,
        };
    } catch (error) {
        console.error("Classification error:", error);
        // Default to conservative classification
        return {
            isBlank: transcript.trim().length < 50,
            isSpam: false,
            is11zaRelated: false,
            blankConfidence: 0.5,
            spamConfidence: 0.5,
            relevanceConfidence: 0.5,
        };
    }
}

// Process a single call recording
async function processCall(callId: string): Promise<void> {
    try {
        // Get call record
        const { data: callRecord, error: fetchError } = await supabase
            .from('call_recordings')
            .select('id, file_name, storage_path, phone_number')
            .eq('id', callId)
            .single();

        if (fetchError || !callRecord) {
            throw new Error(`Call record not found: ${callId}`);
        }

        // Update status to processing
        await supabase
            .from('call_recordings')
            .update({ status: 'transcribing' })
            .eq('id', callId);

        // Download audio from storage
        const { data: audioData, error: downloadError } = await supabase.storage
            .from('call-recordings')
            .download(callRecord.storage_path);

        if (downloadError || !audioData) {
            throw new Error("Failed to download audio file");
        }

        // Convert blob to ArrayBuffer
        const audioBuffer = await audioData.arrayBuffer();

        // Transcribe audio
        const transcript = await transcribeAudio(audioBuffer, callRecord.file_name);

        // Update status to classifying
        await supabase
            .from('call_recordings')
            .update({ status: 'classifying' })
            .eq('id', callId);

        // Classify transcript
        const classification = await classifyTranscript(transcript);

        // Save transcript
        const { error: transcriptError } = await supabase
            .from('call_transcripts')
            .insert({
                call_id: callId,
                transcript: transcript,
                transcript_length: transcript.length
            });

        if (transcriptError) {
            console.error("Transcript save error:", transcriptError);
        }

        // Save classification
        const { error: classificationError } = await supabase
            .from('call_classifications')
            .insert({
                call_id: callId,
                is_blank: classification.isBlank,
                is_spam: classification.isSpam,
                is_11za_related: classification.is11zaRelated,
                blank_confidence: classification.blankConfidence,
                spam_confidence: classification.spamConfidence,
                relevance_confidence: classification.relevanceConfidence
            });

        if (classificationError) {
            console.error("Classification save error:", classificationError);
        }

        // Determine final status
        let finalStatus = 'processed';
        if (classification.isBlank) {
            finalStatus = 'blank';
        } else if (classification.isSpam) {
            finalStatus = 'spam';
        } else if (classification.is11zaRelated) {
            finalStatus = '11za_related';
        } else {
            finalStatus = 'irrelevant';
        }

        // If approved (11za_related), chunk and embed
        if (finalStatus === '11za_related') {
            try {
                // Update status to chunking
                await supabase
                    .from('call_recordings')
                    .update({ status: 'chunking' })
                    .eq('id', callId);

                // Chunk the transcript
                const chunks = await chunkText(transcript);

                // Generate embeddings for each chunk
                const embeddings = await Promise.all(chunks.map(chunk => embedText(chunk)));

                // Insert chunks into rag_chunks
                const chunkInserts = chunks.map((chunk, index) => ({
                    content: chunk,
                    embedding: embeddings[index],
                    source_type: 'call',
                    source_id: callId,
                    phone_number: callRecord.phone_number,
                    chunk_index: index,
                    created_at: new Date().toISOString()
                }));

                const { error: chunkError } = await supabase
                    .from('rag_chunks')
                    .insert(chunkInserts);

                if (chunkError) {
                    console.error("Chunk insertion error:", chunkError);
                    throw new Error("Failed to save chunks");
                }

                // Update chunk count
                await supabase
                    .from('call_recordings')
                    .update({ chunk_count: chunks.length })
                    .eq('id', callId);

            } catch (chunkError) {
                console.error("Chunking error:", chunkError);
                finalStatus = 'failed';
            }
        }

        // Update final status
        await supabase
            .from('call_recordings')
            .update({
                status: finalStatus,
                processed_at: new Date().toISOString()
            })
            .eq('id', callId);

    } catch (error) {
        console.error(`Processing error for call ${callId}:`, error);

        // Update status to failed
        await supabase
            .from('call_recordings')
            .update({
                status: 'failed',
                error_reason: error instanceof Error ? error.message : 'Unknown error',
                processed_at: new Date().toISOString()
            })
            .eq('id', callId);
    }
}

// Get pending calls and process them
export async function GET() {
    try {
        // Get up to 5 pending calls (limit concurrent processing)
        const { data: pendingCalls, error } = await supabase
            .from('call_recordings')
            .select('id')
            .eq('status', 'uploaded')
            .order('uploaded_at', { ascending: true })
            .limit(5);

        if (error) {
            console.error("Error fetching pending calls:", error);
            return NextResponse.json({ error: "Failed to fetch pending calls" }, { status: 500 });
        }

        if (!pendingCalls || pendingCalls.length === 0) {
            return NextResponse.json({ message: "No pending calls to process" });
        }

        // Process calls concurrently (up to 5)
        const processingPromises = pendingCalls.map(call => processCall(call.id));
        await Promise.allSettled(processingPromises);

        return NextResponse.json({
            message: `Processed ${pendingCalls.length} calls`,
            processed: pendingCalls.length
        });

    } catch (error) {
        console.error("Worker error:", error);
        return NextResponse.json({ error: "Worker processing failed" }, { status: 500 });
    }
}

// Manual trigger to process specific call
export async function POST(request: Request) {
    try {
        const { callId } = await request.json();

        if (!callId) {
            return NextResponse.json({ error: "callId is required" }, { status: 400 });
        }

        // Process the specific call
        await processCall(callId);

        return NextResponse.json({ message: "Call processing triggered" });

    } catch (error) {
        console.error("Manual processing error:", error);
        return NextResponse.json({ error: "Failed to trigger processing" }, { status: 500 });
    }
}