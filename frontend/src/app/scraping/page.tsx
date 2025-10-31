'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiService, UserProduct, CompetitorProduct } from '@/lib/api';
import { isValidUrl } from '@/lib/utils';

const ScrapingPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [competitorProducts, setCompetitorProducts] = useState<CompetitorProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const [productsResponse, dashboardResponse] = await Promise.all([
        apiService.scrape.getProducts(),
        apiService.dashboard.getProducts()
      ]);
      
      // For now, we'll use the scrape products as both user and competitor
      // In a real implementation, these would be separate endpoints
      const allProducts = productsResponse.data.data || [];
      setUserProducts(allProducts.slice(0, Math.ceil(allProducts.length / 2)));
      setCompetitorProducts(allProducts.slice(Math.ceil(allProducts.length / 2)));
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const handleScrapeUrl = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    if (!isValidUrl(url)) {
      setError('Please enter a valid URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiService.scrape.scrapeUrl(url);
      setSuccess(`Successfully scraped product: ${response.data.title || 'Product'}`);
      setUrl('');
      await fetchProducts(); // Refresh the product lists
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to scrape URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, type: 'user' | 'competitor') => {
    try {
      // For now, we'll use the general delete endpoint
      // In a real implementation, there would be separate endpoints for user/competitor products
      await apiService.dashboard.deleteMapping(productId);
      
      if (type === 'user') {
        setUserProducts(prev => prev.filter(p => p.id !== productId));
      } else {
        setCompetitorProducts(prev => prev.filter(p => p.id !== productId));
      }
      setSuccess('Product deleted successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete product');
    }
  };

  return (
    <MainLayout title="Product Scraping">
      <div className="space-y-6">
        {/* URL Input Section */}
        <Card>
          <Card.Header>
            <h2 className="text-xl font-semibold text-gray-900">Scrape Product URL</h2>
            <p className="text-sm text-gray-600">
              Enter a product URL to automatically extract product information
            </p>
          </Card.Header>
          <Card.Content>
            <div className="space-y-4">
              <Input
                label="Product URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScrapeUrl();
                  }
                }}
                placeholder="https://example.com/product/..."
                error={error || undefined}
                helperText="Supported sites: Amazon, eBay, Shopify stores, and more"
              />
              
              {success && (
                <div className="p-3 bg-success-50 border border-success-200 rounded-md">
                  <p className="text-sm text-success-800">{success}</p>
                </div>
              )}

              <Button
                onClick={handleScrapeUrl}
                loading={isLoading}
                disabled={!url.trim()}
                className="w-full sm:w-auto"
              >
                Scrape Product
              </Button>
            </div>
          </Card.Content>
        </Card>

        {/* Products Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Products */}
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Products ({userProducts.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchProducts}
                >
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {userProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p>No products scraped yet</p>
                    <p className="text-sm">Start by entering a product URL above</p>
                  </div>
                ) : (
                  userProducts.map((product) => (
                    <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {product.title}
                          </h4>
                          <p className="text-sm text-gray-600 mb-2">
                            ${product.price}
                          </p>
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:text-primary-800 truncate block"
                          >
                            {product.url}
                          </a>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id, 'user')}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card.Content>
          </Card>

          {/* Competitor Products */}
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Competitor Products ({competitorProducts.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchProducts}
                >
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {competitorProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p>No competitor products found</p>
                    <p className="text-sm">Competitor products will appear here</p>
                  </div>
                ) : (
                  competitorProducts.map((product) => (
                    <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {product.title}
                          </h4>
                          <p className="text-sm text-gray-600 mb-2">
                            ${product.price}
                          </p>
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:text-primary-800 truncate block"
                          >
                            {product.url}
                          </a>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id, 'competitor')}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card.Content>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <Card.Header>
            <h3 className="text-lg font-semibold text-gray-900">How it works</h3>
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">1. Enter URL</h4>
                <p className="text-sm text-gray-600">
                  Paste a product URL from any supported e-commerce site
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">2. Auto Extract</h4>
                <p className="text-sm text-gray-600">
                  Our AI automatically extracts product details and pricing
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h4 className="font-medium text-gray-900 mb-2">3. Monitor</h4>
                <p className="text-sm text-gray-600">
                  Track price changes and get alerts for your products
                </p>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </MainLayout>
  );
};

export default ScrapingPage;