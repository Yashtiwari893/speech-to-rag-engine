"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Store, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

type ShopifyStore = {
    id: string;
    phone_number: string;
    store_name: string | null;
    store_domain: string;
    website_url: string;
    last_synced_at: string | null;
    created_at: string;
};

export default function ShopifyPage() {
    const [stores, setStores] = useState<ShopifyStore[]>([]);
    const [loading, setLoading] = useState(true);
    const [settingUp, setSettingUp] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Setup form state
    const [phoneNumber, setPhoneNumber] = useState("");
    const [storeDomain, setStoreDomain] = useState("");
    const [storefrontToken, setStorefrontToken] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [authToken, setAuthToken] = useState("");
    const [origin, setOrigin] = useState("");
    const [validatingToken, setValidatingToken] = useState(false);
    const [tokenValid, setTokenValid] = useState<boolean | null>(null);
    const [storeName, setStoreName] = useState<string | null>(null);

    const loadStores = useCallback(async () => {
        try {
            const res = await fetch("/api/shopify/stores");
            const data = await res.json();
            setStores(data.stores || []);
        } catch (error) {
            console.error("Failed to load stores:", error);
            setMessage({ type: 'error', text: 'Failed to load Shopify stores' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStores();
    }, [loadStores]);

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingUp(true);
        setMessage(null);

        try {
            const res = await fetch("/api/shopify/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: phoneNumber,
                    shopify_store_domain: storeDomain,
                    shopify_storefront_token: storefrontToken,
                    website_url: websiteUrl,
                    auth_token: authToken,
                    origin: origin,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: 'Shopify store setup successfully!' });
                // Clear form
                setPhoneNumber("");
                setStoreDomain("");
                setStorefrontToken("");
                setWebsiteUrl("");
                setAuthToken("");
                setOrigin("");
                // Reload stores
                loadStores();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to setup store' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error occurred' });
        } finally {
            setSettingUp(false);
        }
    };

    const handleValidateToken = async () => {
        if (!storeDomain || !storefrontToken) {
            setMessage({ type: 'error', text: 'Please enter both store domain and storefront token' });
            return;
        }

        setValidatingToken(true);
        setTokenValid(null);
        setStoreName(null);
        setMessage(null);

        try {
            const res = await fetch("/api/shopify/validate-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    store_domain: storeDomain,
                    storefront_token: storefrontToken,
                }),
            });

            const data = await res.json();

            if (res.ok && data.valid) {
                setTokenValid(true);
                setStoreName(data.store_name);
                setMessage({ type: 'success', text: `Token validated successfully! Store: ${data.store_name}` });
            } else {
                setTokenValid(false);
                setMessage({ type: 'error', text: data.error || 'Token validation failed' });
            }
        } catch (error) {
            setTokenValid(false);
            setMessage({ type: 'error', text: 'Network error occurred during validation' });
        } finally {
            setValidatingToken(false);
        }
    };

    const handleSync = async (phoneNumber: string) => {
        setSyncing(phoneNumber);
        setMessage(null);

        try {
            const res = await fetch("/api/shopify/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone_number: phoneNumber }),
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: 'Store synced successfully!' });
                loadStores();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to sync store' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error occurred' });
        } finally {
            setSyncing(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Shopify Store Integration</h1>
                <p className="text-gray-600">
                    Connect your Shopify stores to enable AI-powered customer support via WhatsApp
                </p>
            </div>

            {message && (
                <div className={`mb-6 p-4 rounded-lg border ${
                    message.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-green-200 bg-green-50 text-green-800'
                }`}>
                    <div className="flex items-center gap-2">
                        {message.type === 'error' ? (
                            <AlertCircle className="h-4 w-4" />
                        ) : (
                            <CheckCircle className="h-4 w-4" />
                        )}
                        <span>{message.text}</span>
                    </div>
                </div>
            )}

            <Tabs defaultValue="setup" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="setup">Setup Store</TabsTrigger>
                    <TabsTrigger value="manage">Manage Stores</TabsTrigger>
                </TabsList>

                <TabsContent value="setup">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Store className="h-5 w-5" />
                                Connect Shopify Store
                            </CardTitle>
                            <CardDescription>
                                Enter your Shopify store details and WhatsApp API credentials to connect it with your WhatsApp chatbot.
                                <strong className="text-orange-600"> Test your storefront token before connecting.</strong>
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSetup} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            WhatsApp Business Number *
                                        </label>
                                        <Input
                                            type="tel"
                                            placeholder="+1234567890"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            The phone number connected to your WhatsApp Business API
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            Shopify Store Domain *
                                        </label>
                                        <Input
                                            type="text"
                                            placeholder="yourstore.myshopify.com"
                                            value={storeDomain}
                                            onChange={(e) => setStoreDomain(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Your Shopify store domain (must end with .myshopify.com)
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            Storefront Access Token *
                                        </label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="password"
                                                placeholder="Enter your storefront token"
                                                value={storefrontToken}
                                                onChange={(e) => {
                                                    setStorefrontToken(e.target.value);
                                                    setTokenValid(null); // Reset validation when token changes
                                                    setStoreName(null);
                                                }}
                                                required
                                                className="flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleValidateToken}
                                                disabled={validatingToken || !storeDomain || !storefrontToken}
                                                className="whitespace-nowrap"
                                            >
                                                {validatingToken ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : tokenValid === true ? (
                                                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                                ) : tokenValid === false ? (
                                                    <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
                                                ) : null}
                                                {validatingToken ? 'Testing...' : tokenValid === true ? 'Valid' : tokenValid === false ? 'Invalid' : 'Test Token'}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Create this in Shopify Admin → Settings → Apps → Storefront API
                                            {storeName && <span className="text-green-600 font-medium"> • Connected to: {storeName}</span>}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            Website URL *
                                        </label>
                                        <Input
                                            type="url"
                                            placeholder="https://yourstore.com"
                                            value={websiteUrl}
                                            onChange={(e) => setWebsiteUrl(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Your store's main website URL
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            11za Auth Token *
                                        </label>
                                        <Input
                                            type="password"
                                            placeholder="Enter your 11za auth token"
                                            value={authToken}
                                            onChange={(e) => setAuthToken(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            WhatsApp API authentication token from 11za
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">
                                            11za Origin Website *
                                        </label>
                                        <Input
                                            type="url"
                                            placeholder="https://yourwebsite.com"
                                            value={origin}
                                            onChange={(e) => setOrigin(e.target.value)}
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            The origin website URL registered with 11za
                                        </p>
                                    </div>
                                </div>

                                <Button type="submit" disabled={settingUp || tokenValid !== true} className="w-full md:w-auto">
                                    {settingUp ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Setting up...
                                        </>
                                    ) : (
                                        <>
                                            <Store className="h-4 w-4 mr-2" />
                                            Connect Store
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="manage">
                    <div className="space-y-4">
                        {stores.length === 0 ? (
                            <Card>
                                <CardContent className="py-8 text-center">
                                    <Store className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                    <p className="text-gray-500">No Shopify stores connected yet</p>
                                    <p className="text-sm text-gray-400 mt-1">
                                        Setup your first store in the Setup tab
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            stores.map((store) => (
                                <Card key={store.id}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="flex items-center gap-2">
                                                    <Store className="h-5 w-5" />
                                                    {store.store_name || 'Unnamed Store'}
                                                </CardTitle>
                                                <CardDescription>
                                                    {store.store_domain} • {store.phone_number}
                                                </CardDescription>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleSync(store.phone_number)}
                                                disabled={syncing === store.phone_number}
                                            >
                                                {syncing === store.phone_number ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : (
                                                    <RefreshCw className="h-4 w-4 mr-2" />
                                                )}
                                                Sync
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="font-medium">Domain:</span>
                                                <p className="text-gray-600">{store.store_domain}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium">Website:</span>
                                                <p className="text-gray-600">
                                                    <a
                                                        href={store.website_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {store.website_url}
                                                    </a>
                                                </p>
                                            </div>
                                            <div>
                                                <span className="font-medium">Last Synced:</span>
                                                <p className="text-gray-600">
                                                    {store.last_synced_at
                                                        ? new Date(store.last_synced_at).toLocaleString()
                                                        : 'Never'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}