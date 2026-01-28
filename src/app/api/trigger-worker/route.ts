import { NextResponse } from "next/server";

// This endpoint can be called by a cron job or scheduled task
// Example cron: */5 * * * * curl -X GET http://localhost:3000/api/trigger-worker
export async function GET() {
    try {
        // Trigger the background worker
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/process-calls-worker`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Worker returned ${response.status}`);
        }

        const result = await response.json();

        return NextResponse.json({
            success: true,
            message: "Worker triggered successfully",
            result
        });

    } catch (error) {
        console.error("Worker trigger error:", error);
        return NextResponse.json({
            success: false,
            error: "Failed to trigger worker"
        }, { status: 500 });
    }
}