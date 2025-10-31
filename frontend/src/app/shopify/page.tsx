'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiService, ShopifyStore, ProductMapping } from '@/lib/api';

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  status: string;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    sku: string;
    inventory_quantity: number;
  }>;
  images: Array<{
    id: string;
    src: string;
    alt: string;
  }>;
}

export default function ShopifyPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<ShopifyStore | null>(null);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store connection form
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    fetchStores();
    fetchMappings();
  }, []);

  const fetchStores = async () => {
    try {
      const response = await apiService.shopify.getStores();
      const data = response.data;
      setStores(data);
      if (data.length > 0) {
        setSelectedStore(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
      setError('Failed to fetch stores');
    }
  };

  const fetchMappings = async () => {
    try {
      const response = await apiService.dashboard.getMappings();
      // Ensure we extract the mappings array from the response structure
      const mappingsData = response.data?.data?.mappings || [];
      setMappings(Array.isArray(mappingsData) ? mappingsData : []);
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
      setMappings([]); // Ensure mappings is always an array on error
    }
  };

  const fetchShopifyProducts = async (shop: string) => {
    if (!selectedStore) return;
    
    setLoading(true);
    try {
      const response = await apiService.shopify.getProducts(shop);
      setShopifyProducts(response.data);
    } catch (err) {
      console.error('Failed to fetch Shopify products:', err);
      setError('Failed to fetch Shopify products');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Note: The API uses OAuth flow, so this redirects to Shopify
      const response = await apiService.shopify.auth(storeUrl);
      const authUrl = response.data;
      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to connect store:', err);
      setError('Failed to connect store. Please check your store URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncProducts = async () => {
    if (!selectedStore) return;
    
    setLoading(true);
    try {
      // First fetch products to refresh the list
      await fetchShopifyProducts(selectedStore.shop);
      await fetchMappings();
      
      // For now, we'll sync all approved mappings
      // In a real implementation, you might want to let users select specific mappings
      const approvedMappings = mappings.filter(m => m.status === 'approved');
      if (approvedMappings.length > 0) {
        const mappingIds = approvedMappings.map(m => m.id);
        const response = await apiService.shopify.syncPrices(mappingIds);
        console.log('Sync completed:', response.data);
      }
    } catch (err) {
      console.error('Failed to sync products:', err);
      setError('Failed to sync products');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveMapping = async (mappingId: string) => {
    try {
      const response = await apiService.dashboard.approveMapping(mappingId);
      console.log('Mapping approved:', response.data);
      await fetchMappings(); // Refresh mappings
    } catch (err) {
      console.error('Failed to approve mapping:', err);
      setError('Failed to approve mapping');
    }
  };

  const handleRejectMapping = async (mappingId: string) => {
    try {
      const response = await apiService.dashboard.rejectMapping(mappingId);
      console.log('Mapping rejected:', response.data);
      await fetchMappings(); // Refresh mappings
    } catch (err) {
      console.error('Failed to reject mapping:', err);
      setError('Failed to reject mapping');
    }
  };

  const handleCreateMapping = async (shopifyProductId: string, userProductId: string) => {
    try {
      // Note: This would need a proper mapping creation endpoint
      console.log('Creating mapping:', { shopifyProductId, userProductId });
      await fetchMappings();
    } catch (err) {
      console.error('Failed to create mapping:', err);
      setError('Failed to create mapping');
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      await apiService.dashboard.deleteMapping(mappingId);
      await fetchMappings();
    } catch (err) {
      console.error('Failed to delete mapping:', err);
      setError('Failed to delete mapping');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'draft': return 'text-yellow-600';
      case 'archived': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <MainLayout title="Shopify Integration">
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Store Connection */}
          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Store Connection</h2>
              <p className="text-gray-600">Connect your Shopify store to sync products</p>
            </Card.Header>
            <Card.Content>
              {stores.length === 0 ? (
                <form onSubmit={handleConnectStore} className="space-y-4">
                  <Input
                    label="Store URL"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    required
                  />
                  <Input
                    label="Access Token (Optional)"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Will use OAuth if not provided"
                    helperText="Leave empty to use OAuth authentication"
                  />
                  {error && (
                    <div className="text-red-600 text-sm">{error}</div>
                  )}
                  <Button type="submit" loading={loading}>
                    Connect Store
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Connected Stores</h3>
                      <p className="text-sm text-gray-600">{stores.length} store(s) connected</p>
                    </div>
                    <Button
                      onClick={() => setStores([])}
                      variant="outline"
                      size="sm"
                    >
                      Add New Store
                    </Button>
                  </div>
                  <div className="grid gap-4">
                    {stores.map((store) => (
                      <div
                        key={store.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedStore?.id === store.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedStore(store)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{store.shop}</h4>
                            <p className="text-sm text-gray-600">{store.shop}.myshopify.com</p>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-medium ${
                              store.isActive ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {store.isActive ? 'Active' : 'Inactive'}
                            </div>
                            <div className="text-xs text-gray-500">
                              Connected {new Date(store.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card.Content>
          </Card>

          {/* Product Sync */}
          {selectedStore && (
            <Card>
              <Card.Header>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Product Sync</h2>
                    <p className="text-gray-600">
                      Sync products from {selectedStore.shop}
                    </p>
                  </div>
                  <Button
                    onClick={handleSyncProducts}
                    loading={loading}
                  >
                    Sync Products
                  </Button>
                </div>
              </Card.Header>
              <Card.Content>
                {shopifyProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600">
                      No products synced yet. Click "Sync Products" to get started.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Shopify Products</h3>
                      <span className="text-sm text-gray-600">
                        {shopifyProducts.length} products
                      </span>
                    </div>
                    <div className="grid gap-4">
                      {shopifyProducts.map((product) => (
                        <div
                          key={product.id}
                          className="p-4 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                {product.images[0] && (
                                  <img
                                    src={product.images[0].src}
                                    alt={product.images[0].alt || product.title}
                                    className="w-12 h-12 object-cover rounded"
                                  />
                                )}
                                <div>
                                  <h4 className="font-medium">{product.title}</h4>
                                  <p className="text-sm text-gray-600">
                                    {product.vendor} • {product.product_type}
                                  </p>
                                  <div className={`text-sm font-medium ${getStatusColor(product.status)}`}>
                                    {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600">Variants:</span> {product.variants.length}
                                </div>
                                <div>
                                  <span className="text-gray-600">Price:</span> ${product.variants[0]?.price || 'N/A'}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCreateMapping(product.id, 'user-product-id')}
                              >
                                Create Mapping
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card.Content>
            </Card>
          )}

          {/* Product Mappings */}
          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Product Mappings</h2>
              <p className="text-gray-600">
                Manage connections between your products and Shopify products
              </p>
            </Card.Header>
            <Card.Content>
              {mappings.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">
                    No product mappings yet. Create mappings to sync product data.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Active Mappings</h3>
                    <span className="text-sm text-gray-600">
                      {mappings.length} mappings
                    </span>
                  </div>
                  <div className="grid gap-4">
                    {mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">
                              {mapping.userProduct?.title || 'Unknown Product'}
                            </h4>
                            <p className="text-sm text-gray-600">
                              Mapped to: {mapping.competitorProductId}
                            </p>
                            <div className={`text-sm font-medium ${
                              mapping.status === 'approved' ? 'text-green-600' : 
                              mapping.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {mapping.status.charAt(0).toUpperCase() + mapping.status.slice(1)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteMapping(mapping.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card.Content>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}