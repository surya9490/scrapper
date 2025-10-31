'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import StatsCard from '@/components/dashboard/StatsCard';
import PriceChart from '@/components/dashboard/PriceChart';
import Card from '@/components/ui/Card';
import { apiService, DashboardStats, PriceHistory, ProductMapping } from '@/lib/api';

interface DashboardData {
  stats: DashboardStats;
  recentMappings: ProductMapping[];
  priceAlerts: PriceHistory[];
}

const Dashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [overviewResponse, historyResponse] = await Promise.all([
          apiService.dashboard.getOverview(),
          apiService.priceMonitoring.getHistory({ limit: 30 })
        ]);
        setDashboardData(overviewResponse.data);
        setPriceHistory(historyResponse.data.history || []);
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <MainLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout title="Dashboard">
        <div className="text-center py-12">
          <div className="text-danger-600 text-lg">{error}</div>
        </div>
      </MainLayout>
    );
  }

  const chartData = priceHistory.map(item => ({
    date: item.recordedAt,
    price: item.price,
    competitor_price: item.price // Using same price for now since we don't have competitor comparison
  }));

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="User Products"
            value={dashboardData?.stats?.totalUserProducts || 0}
            change={{ value: 12, type: 'increase' }}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            }
            color="primary"
          />
          
          <StatsCard
            title="Competitor Products"
            value={dashboardData?.stats?.totalCompetitorProducts || 0}
            change={{ value: 8, type: 'increase' }}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            color="success"
          />
          
          <StatsCard
            title="Approved Mappings"
            value={dashboardData?.stats?.approvedMappings || 0}
            change={{ value: 3, type: 'increase' }}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            color="success"
          />
          
          <StatsCard
            title="Pending Mappings"
            value={dashboardData?.stats?.pendingMappings || 0}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            color="warning"
          />
        </div>

        {/* Price Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PriceChart
            data={chartData}
            title="Price Trends"
            productName="Recent Price History"
          />
          
          {/* Recent Activity */}
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-gray-900">Recent Mappings</h3>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                {dashboardData?.recentMappings?.map((mapping, index) => (
                  <div key={mapping.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        mapping.status === 'approved' ? 'bg-success-500' :
                        mapping.status === 'rejected' ? 'bg-danger-500' :
                        'bg-warning-500'
                      }`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        {mapping.userProduct.title} → {mapping.competitorProduct.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {mapping.status} • {new Date(mapping.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-gray-500">
                    No recent mappings
                  </div>
                )}
              </div>
            </Card.Content>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <Card.Header>
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary-50 rounded-lg">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Add Product</h4>
                    <p className="text-sm text-gray-500">Start monitoring a new product</p>
                  </div>
                </div>
              </button>
              
              <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-success-50 rounded-lg">
                    <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Bulk Upload</h4>
                    <p className="text-sm text-gray-500">Upload multiple products via CSV</p>
                  </div>
                </div>
              </button>
              
              <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-warning-50 rounded-lg">
                    <svg className="w-5 h-5 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Sync Shopify</h4>
                    <p className="text-sm text-gray-500">Update Shopify product prices</p>
                  </div>
                </div>
              </button>
            </div>
          </Card.Content>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
