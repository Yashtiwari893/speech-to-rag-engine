import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

type BulkUploadRequest = {
    files: {
        name: string;
        size: number;
        type: string;
        data: string; // base64
    }[];
    phone_number: string;
};

type BulkUploadResponse = {
    success: boolean;
    uploaded: {
        id: string;
        file_name: string;
        status: string;
    }[];
    failed: {
        file_name: string;
        error: string;
    }[];
};

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const phoneNumber = formData.get("phone_number") as string;

        if (!phoneNumber) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        // Check if call_recordings table exists
        const { error: tableCheckError } = await supabase
            .from("call_recordings")
            .select("id")
            .limit(1);

        if (tableCheckError && tableCheckError.message.includes('relation "public.call_recordings" does not exist')) {
            return NextResponse.json({
                error: "Database migration required. Please run the migration SQL to create call recording tables."
            }, { status: 400 });
        }

        const files = formData.getAll("files") as File[];
        const results: BulkUploadResponse = {
            success: true,
            uploaded: [],
            failed: []
        };

        // Process files in batches of 20
        const batchSize = 20;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);

            // Process batch concurrently
            const batchPromises = batch.map(async (file) => {
                try {
                    // Validate file type
                    if (!file.type.startsWith('audio/')) {
                        return {
                            success: false,
                            file_name: file.name,
                            error: "Invalid file type. Only audio files are allowed."
                        };
                    }

                    // Validate file size (max 100MB per file)
                    if (file.size > 100 * 1024 * 1024) {
                        return {
                            success: false,
                            file_name: file.name,
                            error: "File too large. Maximum size is 100MB."
                        };
                    }

                    // Generate unique filename
                    const fileExt = file.name.split('.').pop() || 'mp3';
                    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

                    // Upload to Supabase Storage
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('call-recordings')
                        .upload(uniqueName, file, {
                            contentType: file.type,
                            upsert: false
                        });

                    if (uploadError) {
                        console.error("Storage upload error:", uploadError);
                        return {
                            success: false,
                            file_name: file.name,
                            error: "Failed to upload file to storage"
                        };
                    }

                    // Create database record
                    const { data: callRecord, error: dbError } = await supabase
                        .from('call_recordings')
                        .insert({
                            file_name: file.name,
                            storage_path: uploadData.path,
                            phone_number: phoneNumber,
                            status: 'uploaded',
                            uploaded_at: new Date().toISOString()
                        })
                        .select('id, file_name, status')
                        .single();

                    if (dbError) {
                        console.error("Database insert error:", dbError);
                        // Try to clean up storage file
                        await supabase.storage
                            .from('call-recordings')
                            .remove([uploadData.path]);

                        return {
                            success: false,
                            file_name: file.name,
                            error: "Failed to create database record"
                        };
                    }

                    return {
                        success: true,
                        id: callRecord.id,
                        file_name: callRecord.file_name,
                        status: callRecord.status
                    };

                } catch (error) {
                    console.error("File processing error:", error);
                    return {
                        success: false,
                        file_name: file.name,
                        error: error instanceof Error ? error.message : "Unknown error"
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Collect results
            batchResults.forEach(result => {
                if (result.success) {
                    results.uploaded.push({
                        id: result.id,
                        file_name: result.file_name,
                        status: result.status
                    });
                } else {
                    results.failed.push({
                        file_name: result.file_name,
                        error: result.error!
                    });
                }
            });
        }

        // If any files failed, mark overall success as false
        if (results.failed.length > 0) {
            results.success = false;
        }

        return NextResponse.json(results);

    } catch (error) {
        console.error("Bulk upload error:", error);
        return NextResponse.json({
            error: "Internal server error during bulk upload"
        }, { status: 500 });
    }
}