import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { chunkText } from "@/lib/chunk";
import { embedText } from "@/lib/embeddings";
import Groq from "groq-sdk";

export const runtime = "nodejs";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

type CallRow = {
    id: string;
    file_name: string;
    status: string;
    phone_number: string | null;
    uploaded_at: string;
};

// Speech-to-text using Groq Whisper
async function transcribeAudio(audioBuffer: ArrayBuffer, fileName: string): Promise<string> {
    try {
        // Convert ArrayBuffer to File-like object for Groq
        const audioFile = new File([audioBuffer], fileName, { type: 'audio/mpeg' });

        const transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-large-v3",
            response_format: "text",
            language: "en", // Can be made configurable
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

export async function POST(req: Request) {
    let callId: string | null = null;

    try {
        // First check if the call_recordings table exists
        const { error: tableCheckError } = await supabase
            .from("call_recordings")
            .select("id")
            .limit(1);

        if (tableCheckError && tableCheckError.message.includes('relation "public.call_recordings" does not exist')) {
            return NextResponse.json({
                error: "Database migration required. Please run the migration SQL to create call recording tables."
            }, { status: 400 });
        }

        const form = await req.formData();
        const file = form.get("file") as File | null;
        const phoneNumber = form.get("phone_number") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No audio file uploaded" }, { status: 400 });
        }

        if (!phoneNumber) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({
                error: "Unsupported file type. Please upload MP3, WAV, or OGG files."
            }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const fileName = file.name;
        const fileSize = file.size;

        // 1) Create call recording record
        const { data: callRow, error: callError } = await supabase
            .from("call_recordings")
            .insert({
                file_name: fileName,
                file_size: fileSize,
                mime_type: file.type,
                phone_number: phoneNumber,
                status: 'uploaded',
            })
            .select()
            .single();

        if (callError) {
            if (callError.message.includes('relation "public.call_recordings" does not exist')) {
                return NextResponse.json({
                    error: "Database migration required. Please run the migration SQL to create call recording tables."
                }, { status: 500 });
            }
            throw callError;
        }

        callId = callRow.id as string;

        // 2) Transcribe audio
        console.log(`Transcribing call: ${fileName}`);
        const transcript = await transcribeAudio(buffer, fileName);

        // Update status to transcribing
        await supabase
            .from("call_recordings")
            .update({ status: 'transcribing' })
            .eq("id", callId);

        // 3) Save transcript
        const { error: transcriptError } = await supabase
            .from("call_transcripts")
            .insert({
                call_id: callId,
                transcript: transcript,
                transcript_length: transcript.length,
            });

        if (transcriptError) {
            throw transcriptError;
        }

        // 4) Classify transcript
        console.log(`Classifying transcript for call: ${fileName}`);
        const classification = await classifyTranscript(transcript);

        // 5) Save classification
        const { error: classificationError } = await supabase
            .from("call_classifications")
            .insert({
                call_id: callId,
                is_blank: classification.isBlank,
                is_spam: classification.isSpam,
                is_11za_related: classification.is11zaRelated,
                blank_confidence: classification.blankConfidence,
                spam_confidence: classification.spamConfidence,
                relevance_confidence: classification.relevanceConfidence,
            });

        if (classificationError) {
            throw classificationError;
        }

        // 6) Determine final status
        let finalStatus: string;
        if (classification.isBlank) {
            finalStatus = 'blank';
        } else if (classification.isSpam) {
            finalStatus = 'spam';
        } else if (classification.is11zaRelated) {
            finalStatus = '11za_related';
        } else {
            finalStatus = 'approved'; // Not related but not spam/blank
        }

        // 7) If approved (11za_related), process for RAG
        if (finalStatus === '11za_related') {
            console.log(`Processing approved call for RAG: ${fileName}`);

            // Chunk transcript
            const chunks = chunkText(transcript, 1500).filter((c) => c.trim().length > 0);

            if (chunks.length === 0) {
                throw new Error("No text chunks produced from transcript");
            }

            // Generate embeddings
            const rows: {
                source_type: string;
                source_id: string;
                chunk: string;
                embedding: number[];
            }[] = [];

            // Process in batches to avoid rate limits
            const BATCH_SIZE = 10; // Smaller batch for calls
            const BATCH_DELAY_MS = 1000; // 1 second delay

            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batch = chunks.slice(i, i + BATCH_SIZE);

                const embeddings = await Promise.all(
                    batch.map((chunk) => embedText(chunk))
                );

                for (let j = 0; j < batch.length; j++) {
                    const embedding = embeddings[j];
                    if (!embedding || !Array.isArray(embedding)) {
                        throw new Error(`Failed to generate embedding for chunk ${i + j + 1}`);
                    }

                    rows.push({
                        source_type: 'call',
                        source_id: callId,
                        chunk: batch[j],
                        embedding,
                    });
                }

                // Delay between batches
                if (i + BATCH_SIZE < chunks.length) {
                    await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }

            // Insert chunks
            const { error: insertError } = await supabase
                .from("rag_chunks")
                .insert(rows);

            if (insertError) {
                throw insertError;
            }

            // Create phone-call mapping
            const { error: mappingError } = await supabase
                .from("phone_call_mapping")
                .insert({
                    phone_number: phoneNumber,
                    call_id: callId,
                });

            if (mappingError) {
                throw mappingError;
            }
        }

        // 8) Update final status and processed_at
        await supabase
            .from("call_recordings")
            .update({
                status: finalStatus,
                processed_at: new Date().toISOString(),
            })
            .eq("id", callId);

        return NextResponse.json({
            message: "Call processed successfully",
            call_id: callId,
            status: finalStatus,
            transcript_length: transcript.length,
            chunks_created: finalStatus === '11za_related' ? Math.ceil(transcript.length / 1500) : 0,
            phone_number: phoneNumber,
        });
    } catch (err: unknown) {
        console.error("PROCESS_CALL_ERROR:", err);

        // Update status to failed if we have a callId
        if (callId) {
            await supabase
                .from("call_recordings")
                .update({ status: 'failed' })
                .eq("id", callId);
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}