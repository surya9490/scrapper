'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiService, UserProduct, CompetitorProduct } from '@/lib/api';

export default function ProductsPage() {
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [competitorProducts, setCompetitorProducts] = useState<CompetitorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const [userResponse, competitorResponse] = await Promise.all([
        apiService.dashboard.getProducts(),
        apiService.scrape.getProducts()
      ]);
      
      setUserProducts(userResponse.data?.data || []);
      setCompetitorProducts(competitorResponse.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, type: 'user' | 'competitor') => {
    try {
      if (type === 'user') {
        await apiService.dashboard.deleteMapping(productId);
        setUserProducts(prev => prev.filter(p => p.id !== productId));
      } else {
        // For competitor products, we might need a different endpoint
        await apiService.dashboard.deleteMapping(productId);
        setCompetitorProducts(prev => prev.filter(p => p.id !== productId));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete product');
    }
  };


  const filteredUserProducts = Array.isArray(userProducts) ? userProducts.filter(product =>
    product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  ) : [];

  const filteredCompetitorProducts = Array.isArray(competitorProducts) ? competitorProducts.filter(product =>
    product.title.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <MainLayout title="Products">
      <div className="space-y-6">
        {/* Search and Actions */}
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Product Management</h2>
                <p className="text-sm text-gray-600">
                  Manage your products and competitor products
                </p>
              </div>
              <Button onClick={fetchProducts} loading={loading}>
                Refresh
              </Button>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <Input
                  label="Search Products"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title or SKU..."
                />
              </div>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </Card.Content>
        </Card>

        {/* Products Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Products */}
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Products ({filteredUserProducts.length})
                </h3>
                <span className="text-sm text-gray-500">
                  Total: {userProducts.length}
                </span>
              </div>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {filteredUserProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p>No products found</p>
                    <p className="text-sm">
                      {searchTerm ? 'Try adjusting your search' : 'Upload products to get started'}
                    </p>
                  </div>
                ) : (
                  filteredUserProducts.map((product) => (
                    <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {product.title}
                          </h4>
                          {product.sku && (
                            <p className="text-sm text-gray-600 mb-1">
                              SKU: {product.sku}
                            </p>
                          )}
                          {product.price && (
                              <p className="text-sm text-green-600 mb-1">
                                ${product.price}
                              </p>
                            )}
                          {product.brand && (
                            <p className="text-xs text-gray-500">
                              Brand: {product.brand}
                            </p>
                          )}
                          {product.category && (
                            <p className="text-xs text-gray-500">
                              Category: {product.category}
                            </p>
                          )}
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
                  Competitor Products ({filteredCompetitorProducts.length})
                </h3>
                <span className="text-sm text-gray-500">
                  Total: {competitorProducts.length}
                </span>
              </div>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {filteredCompetitorProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p>No competitor products found</p>
                    <p className="text-sm">
                      {searchTerm ? 'Try adjusting your search' : 'Start scraping to discover competitor products'}
                    </p>
                  </div>
                ) : (
                  filteredCompetitorProducts.map((product) => (
                    <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">
                            {product.title}
                          </h4>
                          <p className="text-sm text-green-600 mb-1">
                            ${product.price}
                          </p>
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:text-primary-800 truncate block mb-1"
                          >
                            {product.url}
                          </a>
                          {product.brand && (
                            <p className="text-xs text-gray-500">
                              Brand: {product.brand}
                            </p>
                          )}
                          {product.category && (
                            <p className="text-xs text-gray-500">
                              Category: {product.category}
                            </p>
                          )}
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
      </div>
    </MainLayout>
  );
}