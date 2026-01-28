"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/ui/file-upload";

type CallItem = {
    id: string;
    file_name: string;
    status: string;
    phone_number: string | null;
    uploaded_at: string;
    processed_at: string | null;
    error_reason?: string | null;
    transcript: string | null;
    transcript_length: number;
    classification: {
        is_blank: boolean;
        is_spam: boolean;
        is_11za_related: boolean;
        blank_confidence: number;
        spam_confidence: number;
        relevance_confidence: number;
    } | null;
    chunk_count: number;
};

type PhoneNumberGroup = {
    phone_number: string;
    intent: string | null;
    system_prompt: string | null;
    calls: CallItem[];
    auth_token: string;
    origin: string;
};

export default function CallsPage() {
    const [phoneGroups, setPhoneGroups] = useState<PhoneNumberGroup[]>([]);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [bulkUploading, setBulkUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{
        total: number;
        completed: number;
        current: string;
        failed: number;
    } | null>(null);

    // Selected phone number in the left panel
    const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);

    // Edit form state
    const [editPhoneNumber, setEditPhoneNumber] = useState("");
    const [editIntent, setEditIntent] = useState("");
    const [editAuthToken, setEditAuthToken] = useState("");
    const [editOrigin, setEditOrigin] = useState("");
    const [editSystemPrompt, setEditSystemPrompt] = useState("");
    const [isNewPhone, setIsNewPhone] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    // Filter state
    const [filter, setFilter] = useState<string>("all");
    const [showTranscript, setShowTranscript] = useState<string | null>(null);

    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

    const loadPhoneGroups = useCallback(async () => {
        const res = await fetch("/api/phone-groups");
        const data = await res.json();
        if (data.success) {
            // For each phone group, load calls
            const groupsWithCalls = await Promise.all(
                (data.groups || []).map(async (group: PhoneNumberGroup) => {
                    try {
                        const callsRes = await fetch(`/api/calls?phone_number=${group.phone_number}`);
                        const callsData = await callsRes.json();
                        return {
                            ...group,
                            calls: callsData.calls || []
                        };
                    } catch (error) {
                        console.error(`Error loading calls for ${group.phone_number}:`, error);
                        return {
                            ...group,
                            calls: []
                        };
                    }
                })
            );
            setPhoneGroups(groupsWithCalls);
        }
    }, []);

    // Start polling when there are calls being processed
    useEffect(() => {
        const hasProcessingCalls = phoneGroups.some(group =>
            group.calls.some(call =>
                ['uploaded', 'transcribing', 'classifying', 'chunking'].includes(call.status)
            )
        );

        if (hasProcessingCalls && !pollingInterval) {
            // Poll every 5 seconds
            const interval = setInterval(() => {
                loadPhoneGroups();
            }, 5000);
            setPollingInterval(interval);
        } else if (!hasProcessingCalls && pollingInterval) {
            // Stop polling when no calls are processing
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }

        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [phoneGroups, pollingInterval, loadPhoneGroups]);

    useEffect(() => {
        void loadPhoneGroups();
    }, [loadPhoneGroups]);

    // When a phone number is selected, populate the edit form
    useEffect(() => {
        if (selectedPhoneNumber) {
            const group = phoneGroups.find(g => g.phone_number === selectedPhoneNumber);
            if (group) {
                setEditPhoneNumber(group.phone_number);
                setEditIntent(group.intent || "");
                setEditAuthToken(group.auth_token || "");
                setEditOrigin(group.origin || "");
                setEditSystemPrompt(group.system_prompt || "");
                setIsNewPhone(false);
            }
        }
    }, [selectedPhoneNumber, phoneGroups]);

    function handleFileSelect(file: File) {
        setSelectedFile(file);
    }

    function handleNewPhone() {
        setSelectedPhoneNumber(null);
        setEditPhoneNumber("");
        setEditIntent("");
        setEditAuthToken("");
        setEditOrigin("");
        setEditSystemPrompt("");
        setSelectedFile(null);
        setIsNewPhone(true);
    }

    async function handleBulkUpload() {
        if (!selectedFiles.length) {
            alert("Please select audio files first");
            return;
        }

        if (!editPhoneNumber.trim()) {
            alert("Please provide a phone number");
            return;
        }

        setBulkUploading(true);
        setUploadProgress({
            total: selectedFiles.length,
            completed: 0,
            current: "",
            failed: 0
        });

        try {
            const form = new FormData();
            form.append("phone_number", editPhoneNumber.trim());

            selectedFiles.forEach(file => {
                form.append("files", file);
            });

            const res = await fetch("/api/bulk-upload-calls", { method: "POST", body: form });
            const payload = await res.json();

            if (!res.ok) {
                console.error("Bulk upload failed:", payload?.error);
                alert(payload?.error ?? "Failed to upload files");
                return;
            }

            const successCount = payload.uploaded?.length || 0;
            const failCount = payload.failed?.length || 0;

            if (failCount > 0) {
                alert(`Upload completed: ${successCount} successful, ${failCount} failed`);
                console.log("Failed files:", payload.failed);
            } else {
                alert(`Success! ${successCount} files uploaded and queued for processing`);
            }

            // Reset file selection
            setSelectedFiles([]);

            // Refresh the calls list
            await loadPhoneGroups();

            // Select the phone number that was just uploaded to
            setSelectedPhoneNumber(editPhoneNumber.trim());
            setIsNewPhone(false);

        } finally {
            setBulkUploading(false);
            setUploadProgress(null);
        }
    }

    async function handleUpload() {
        if (!selectedFile) {
            alert("Please select an audio file first");
            return;
        }

        if (!editPhoneNumber.trim()) {
            alert("Please provide a phone number");
            return;
        }

        setUploading(true);

        try {
            const form = new FormData();
            form.append("phone_number", editPhoneNumber.trim());
            form.append("files", selectedFile);

            const res = await fetch("/api/bulk-upload-calls", { method: "POST", body: form });
            const payload = await res.json();

            if (!res.ok) {
                console.error("Upload failed:", payload?.error);
                alert(payload?.error ?? "Failed to upload file");
                return;
            }

            const successCount = payload.uploaded?.length || 0;
            const failCount = payload.failed?.length || 0;

            if (failCount > 0) {
                alert(`Upload failed: ${payload.failed[0]?.error || "Unknown error"}`);
            } else {
                alert("Success! File uploaded and queued for processing");
            }

            // Reset file selection
            setSelectedFile(null);

            // Refresh the calls list
            await loadPhoneGroups();

            // Select the phone number that was just uploaded to
            setSelectedPhoneNumber(editPhoneNumber.trim());
            setIsNewPhone(false);

        } finally {
            setUploading(false);
        }
    }

    async function retryCall(callId: string) {
        if (!confirm("Retry processing this call recording?")) return;

        try {
            const res = await fetch("/api/process-calls-worker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callId })
            });

            if (res.ok) {
                alert("Call processing retry triggered");
                await loadPhoneGroups();
            } else {
                alert("Failed to trigger retry");
            }
        } catch (error) {
            console.error("Retry error:", error);
            alert("Failed to trigger retry");
        }
    }

    async function deleteCall(callId: string) {
        if (!confirm("Delete this call recording and all associated data?")) return;

        try {
            const res = await fetch(`/api/calls?id=${callId}`, { method: "DELETE" });
            if (res.ok) {
                alert("Call deleted successfully!");
                await loadPhoneGroups();
            } else {
                const error = await res.json();
                alert(`Failed to delete call: ${error.error}`);
            }
        } catch (err) {
            alert("Failed to delete call");
        }
    }

    async function savePhoneSettings() {
        if (!editPhoneNumber.trim()) {
            alert("Phone number is required");
            return;
        }

        setSavingSettings(true);
        try {
            const res = await fetch("/api/update-phone-settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: editPhoneNumber.trim(),
                    intent: editIntent.trim() || null,
                    system_prompt: editSystemPrompt.trim() || null,
                    auth_token: editAuthToken.trim() || null,
                    origin: editOrigin.trim() || null,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to save settings");
            }

            alert("Settings saved successfully!");
            await loadPhoneGroups();
        } catch (err) {
            console.error("Error saving settings:", err);
            alert(err instanceof Error ? err.message : "Failed to save settings");
        } finally {
            setSavingSettings(false);
        }
    }

    const selectedGroup = phoneGroups.find(g => g.phone_number === selectedPhoneNumber);

    const filteredCalls = selectedGroup?.calls.filter(call => {
        if (filter === "all") return true;
        if (filter === "approved") return call.status === "11za_related";
        if (filter === "spam") return call.status === "spam";
        if (filter === "blank") return call.status === "blank";
        return call.status === filter;
    }) || [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case "uploaded": return "bg-gray-100 text-gray-800";
            case "transcribing": return "bg-blue-100 text-blue-800";
            case "spam": return "bg-red-100 text-red-800";
            case "blank": return "bg-yellow-100 text-yellow-800";
            case "11za_related": return "bg-green-100 text-green-800";
            case "approved": return "bg-green-100 text-green-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    return (
        <main className="flex h-screen">
            {/* LEFT PANEL - Phone Numbers List */}
            <div className="w-80 border-r bg-gray-50 overflow-y-auto">
                <div className="p-4 border-b bg-white sticky top-0 z-10">
                    <h1 className="text-xl font-bold mb-2">Phone Numbers</h1>
                    <button
                        onClick={handleNewPhone}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                        + New Phone Number
                    </button>
                </div>

                <div className="p-2">
                    {phoneGroups.map((group) => (
                        <div
                            key={group.phone_number}
                            onClick={() => setSelectedPhoneNumber(group.phone_number)}
                            className={`p-3 mb-2 rounded-lg cursor-pointer border transition-colors ${selectedPhoneNumber === group.phone_number
                                ? "bg-blue-100 border-blue-400"
                                : "bg-white border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <div className="font-mono font-semibold text-sm">{group.phone_number}</div>
                            {group.intent && (
                                <div className="text-xs text-gray-600 mt-1 line-clamp-1">
                                    {group.intent}
                                </div>
                            )}
                            <div className="flex gap-2 mt-2">
                                <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                                    {group.calls.length} calls
                                </span>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                    {group.calls.filter(c => c.status === "11za_related").length} approved
                                </span>
                            </div>
                        </div>
                    ))}

                    {phoneGroups.length === 0 && (
                        <div className="text-center py-12 text-gray-500 text-sm">
                            <p>No phone numbers yet.</p>
                            <p>Click "+ New Phone Number" to start.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL - Tabs */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 max-w-4xl mx-auto">
                    {(selectedPhoneNumber || isNewPhone) ? (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold">
                                    🎧 {isNewPhone ? "New Phone Number" : selectedPhoneNumber}
                                </h2>
                                {selectedPhoneNumber && (
                                    <button
                                        onClick={() => {
                                            if (!confirm("Delete this phone number and all associated calls?")) return;
                                            // Note: This would need to be implemented
                                            alert("Delete functionality not yet implemented for calls");
                                        }}
                                        className="px-4 py-2 text-sm text-red-600 border border-red-600 rounded-md hover:bg-red-50"
                                    >
                                        Delete Phone Number
                                    </button>
                                )}
                            </div>

                            <Tabs defaultValue="configuration" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="configuration">Configuration</TabsTrigger>
                                    <TabsTrigger value="calls">Call Recordings</TabsTrigger>
                                </TabsList>

                                {/* CONFIGURATION TAB */}
                                <TabsContent value="configuration" className="space-y-6 mt-6">
                                    {/* Phone Number */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            WhatsApp Business Number <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={editPhoneNumber}
                                            onChange={(e) => setEditPhoneNumber(e.target.value)}
                                            placeholder="15558346206"
                                            disabled={!isNewPhone}
                                            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isNewPhone ? "bg-gray-100 cursor-not-allowed" : ""
                                                }`}
                                        />
                                    </div>

                                    {/* Intent */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2">
                                            Intent/Purpose
                                        </label>
                                        <input
                                            type="text"
                                            value={editIntent}
                                            onChange={(e) => setEditIntent(e.target.value)}
                                            placeholder="E.g., Customer service chatbot"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">
                                            Describe the chatbot's purpose for handling calls.
                                        </p>
                                    </div>

                                    {/* System Prompt - Editable */}
                                    {editSystemPrompt && (
                                        <div>
                                            <label className="block text-sm font-medium mb-2">
                                                System Prompt (Editable)
                                            </label>
                                            <textarea
                                                value={editSystemPrompt}
                                                onChange={(e) => setEditSystemPrompt(e.target.value)}
                                                rows={8}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                placeholder="System prompt for the chatbot..."
                                            />
                                            <p className="mt-1 text-xs text-gray-500">
                                                Edit the system prompt to customize how the chatbot responds.
                                            </p>
                                        </div>
                                    )}

                                    {/* 11za Credentials */}
                                    <div className="border-t pt-6">
                                        <h3 className="text-lg font-semibold mb-4">11za Credentials</h3>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2">
                                                    Auth Token <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editAuthToken}
                                                    onChange={(e) => setEditAuthToken(e.target.value)}
                                                    placeholder="Your 11za authentication token"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium mb-2">
                                                    Origin <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editOrigin}
                                                    onChange={(e) => setEditOrigin(e.target.value)}
                                                    placeholder="https://example.com/"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            {/* Save Settings Button */}
                                            <button
                                                onClick={savePhoneSettings}
                                                disabled={savingSettings || isNewPhone}
                                                className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                                            >
                                                {savingSettings ? "Saving..." : "Save Configuration"}
                                            </button>
                                            {isNewPhone && (
                                                <p className="text-xs text-gray-500 text-center">
                                                    Configure settings first to create the phone number
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* CALLS TAB */}
                                <TabsContent value="calls" className="space-y-6 mt-6">

                                    {/* Bulk Upload Section */}
                                    <div className="border rounded-lg p-6 bg-white">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-semibold">Bulk Upload Call Recordings</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-700">Max 50 files</span>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <FileUpload
                                                onFilesSelect={setSelectedFiles}
                                                accept="audio/*"
                                                maxSize={100}
                                                selectedFiles={selectedFiles}
                                                multiple={true}
                                                maxFiles={50}
                                            />

                                            {bulkUploading && uploadProgress && (
                                                <div className="border rounded-lg p-4 bg-blue-50">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium">Uploading files...</span>
                                                        <span className="text-sm text-gray-600">
                                                            {uploadProgress.completed}/{uploadProgress.total}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                                        <div
                                                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                            style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                                                        ></div>
                                                    </div>
                                                    {uploadProgress.current && (
                                                        <p className="text-xs text-gray-600 mt-2 truncate">
                                                            Current: {uploadProgress.current}
                                                        </p>
                                                    )}
                                                    {uploadProgress.failed > 0 && (
                                                        <p className="text-xs text-red-600 mt-1">
                                                            Failed: {uploadProgress.failed}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <button
                                                onClick={handleBulkUpload}
                                                disabled={bulkUploading || !selectedFiles.length || !editPhoneNumber.trim()}
                                                className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                                            >
                                                {bulkUploading ? "Uploading..." : `Upload ${selectedFiles.length} Call Recording${selectedFiles.length !== 1 ? 's' : ''}`}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Single Upload Section */}
                                    <div className="border rounded-lg p-6 bg-gray-50">
                                        <h3 className="text-lg font-semibold mb-4">Single File Upload (Alternative)</h3>

                                        <div className="space-y-4">
                                            <FileUpload
                                                onFileSelect={setSelectedFile}
                                                accept="audio/*"
                                                maxSize={100}
                                                selectedFile={selectedFile}
                                            />

                                            <button
                                                onClick={handleUpload}
                                                disabled={uploading || !selectedFile || !editPhoneNumber.trim()}
                                                className="w-full px-4 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                                            >
                                                {uploading ? "Processing..." : "Upload & Process Single Call"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    {selectedGroup && selectedGroup.calls.length > 0 && (
                                        <div className="flex gap-2">
                                            {["all", "approved", "spam", "blank", "11za_related", "uploaded", "transcribing"].map(status => (
                                                <button
                                                    key={status}
                                                    onClick={() => setFilter(status)}
                                                    className={`px-3 py-1 text-sm rounded-full border ${filter === status
                                                        ? "bg-blue-100 border-blue-400 text-blue-800"
                                                        : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                >
                                                    {status === "all" ? "All" :
                                                     status === "approved" ? "Approved" :
                                                     status === "11za_related" ? "11za Related" :
                                                     status.charAt(0).toUpperCase() + status.slice(1)}
                                                    {status !== "all" && (
                                                        <span className="ml-1">
                                                            ({selectedGroup.calls.filter(c => c.status === status).length})
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Calls List */}
                                    {selectedGroup && filteredCalls.length > 0 && (
                                        <div>
                                            <h3 className="text-lg font-semibold mb-4">
                                                Call Recordings ({filteredCalls.length})
                                            </h3>

                                            <div className="space-y-2">
                                                {filteredCalls.map((call) => (
                                                    <div
                                                        key={call.id}
                                                        className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                                                    >
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="font-medium text-sm">{call.file_name}</span>
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(call.status)}`}>
                                                                        {call.status.replace("_", " ")}
                                                                    </span>
                                                                    {['uploaded', 'transcribing', 'classifying', 'chunking'].includes(call.status) && (
                                                                        <div className="flex items-center gap-1">
                                                                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                                                            <span className="text-xs text-blue-600">Processing</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-500">
                                                                    {new Date(call.uploaded_at).toLocaleString()}
                                                                    {call.processed_at && ` • Processed: ${new Date(call.processed_at).toLocaleString()}`}
                                                                </p>
                                                                {call.transcript_length > 0 && (
                                                                    <p className="text-xs text-gray-500 mt-1">
                                                                        {call.transcript_length} characters • {call.chunk_count} chunks
                                                                    </p>
                                                                )}
                                                                {call.status === 'failed' && call.error_reason && (
                                                                    <p className="text-xs text-red-600 mt-1">
                                                                        Error: {call.error_reason}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                {call.status === 'failed' && (
                                                                    <button
                                                                        onClick={() => retryCall(call.id)}
                                                                        className="px-3 py-1.5 text-sm text-orange-600 border border-orange-300 rounded hover:bg-orange-50"
                                                                    >
                                                                        Retry
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => deleteCall(call.id)}
                                                                    className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Classification Details */}
                                                        {call.classification && (
                                                            <div className="mb-3 p-3 bg-gray-50 rounded text-xs">
                                                                <div className="grid grid-cols-3 gap-4">
                                                                    <div>
                                                                        <span className="font-medium">Blank:</span> {call.classification.is_blank ? "Yes" : "No"}
                                                                        ({(call.classification.blank_confidence * 100).toFixed(1)}%)
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium">Spam:</span> {call.classification.is_spam ? "Yes" : "No"}
                                                                        ({(call.classification.spam_confidence * 100).toFixed(1)}%)
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium">11za Related:</span> {call.classification.is_11za_related ? "Yes" : "No"}
                                                                        ({(call.classification.relevance_confidence * 100).toFixed(1)}%)
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Transcript Preview */}
                                                        {call.transcript && (
                                                            <div className="border-t pt-3">
                                                                <button
                                                                    onClick={() => setShowTranscript(showTranscript === call.id ? null : call.id)}
                                                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                                                >
                                                                    {showTranscript === call.id ? "Hide" : "Show"} Transcript
                                                                </button>
                                                                {showTranscript === call.id && (
                                                                    <div className="mt-2 p-3 bg-gray-50 rounded text-sm max-h-48 overflow-y-auto">
                                                                        <pre className="whitespace-pre-wrap text-gray-800">{call.transcript}</pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedGroup && filteredCalls.length === 0 && selectedGroup.calls.length > 0 && (
                                        <div className="text-center py-12 text-gray-500">
                                            <p>No calls found with the selected filter.</p>
                                            <p className="text-sm mt-2">Try changing the filter.</p>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-96 text-gray-500">
                            <div className="text-center">
                                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                <p className="text-lg">Select a phone number from the left</p>
                                <p className="text-sm mt-2">to view call recordings</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}