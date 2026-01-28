import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
    return (
        <main className="min-h-screen flex items-center justify-center">
            <div className="space-y-6 text-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">AI Chatbot Dashboard</h1>
                    <p className="text-gray-600">Manage your chatbot configurations and integrations</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl">
                    <Link href="/files">
                        <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center space-y-2">
                            <span className="text-lg">📄</span>
                            <span>Files</span>
                            <span className="text-xs text-gray-500">Upload PDFs & Images</span>
                        </Button>
                    </Link>

                    <Link href="/calls">
                        <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center space-y-2">
                            <span className="text-lg">🎧</span>
                            <span>Calls</span>
                            <span className="text-xs text-gray-500">Upload Call Recordings</span>
                        </Button>
                    </Link>

                    <Link href="/shopify">
                        <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center space-y-2">
                            <span className="text-lg">🛍️</span>
                            <span>Shopify</span>
                            <span className="text-xs text-gray-500">Connect Stores</span>
                        </Button>
                    </Link>

                    <Link href="/chat">
                        <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center space-y-2">
                            <span className="text-lg">💬</span>
                            <span>Chat</span>
                            <span className="text-xs text-gray-500">Test Conversations</span>
                        </Button>
                    </Link>
                </div>

                <div className="text-sm text-gray-500">
                    <p>Choose a section above to get started</p>
                </div>
            </div>
        </main>
    );
}
