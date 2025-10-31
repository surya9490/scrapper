'use client';

import { useState, useEffect } from 'react';
import { apiService, PriceHistory, ProductMapping } from '@/lib/api';

interface PriceAlert {
  id: string;
  competitorProductId: string;
  currentPrice: number;
  previousPrice: number;
  changePercentage: number;
  severity: 'low' | 'medium' | 'high';
  recordedAt: string;
  competitorProduct?: {
    title: string;
    url: string;
  };
}

interface MonitoringStats {
  totalMonitoredProducts: number;
  activeAlerts: number;
  priceChanges24h: number;
  averagePriceChange: number;
}

export default function PriceMonitoringPage() {
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const [monitoringStatus, setMonitoringStatus] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch price monitoring data
      const [historyResponse, alertsResponse, mappingsResponse, statusResponse, statsResponse] = await Promise.all([
        apiService.priceMonitoring.getHistory({ limit: 50 }),
        apiService.priceMonitoring.getAlerts({ limit: 20 }),
        apiService.dashboard.getMappings({ status: 'approved' }),
        apiService.priceMonitoring.getStatus(),
        apiService.priceMonitoring.getStatistics()
      ]);

      setPriceHistory(historyResponse.data?.history || []);
      setPriceAlerts(alertsResponse.data?.alerts || []);
      setMappings(mappingsResponse.data?.data?.mappings || []);
      setMonitoringStatus(statusResponse.data);
      setStats(statsResponse.data?.stats || null);
    } catch (error) {
      console.error('Error fetching price monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleMonitoring = async (schedule: string = 'daily') => {
    if (selectedMappings.length === 0) {
      alert('Please select at least one product mapping to monitor');
      return;
    }

    try {
      await apiService.priceMonitoring.schedule(selectedMappings, schedule);
      alert(`Price monitoring scheduled (${schedule}) for ${selectedMappings.length} products`);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error scheduling monitoring:', error);
      alert('Failed to schedule price monitoring');
    }
  };

  const handleMonitorNow = async () => {
    if (selectedMappings.length === 0) {
      alert('Please select at least one product mapping to monitor');
      return;
    }

    try {
      await apiService.priceMonitoring.monitorNow(selectedMappings);
      alert(`Price monitoring started for ${selectedMappings.length} products`);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error starting monitoring:', error);
      alert('Failed to start price monitoring');
    }
  };

  const handleStopMonitoring = async () => {
    if (selectedMappings.length === 0) {
      alert('Please select at least one product mapping to stop monitoring');
      return;
    }

    try {
      await apiService.priceMonitoring.stop(selectedMappings);
      alert(`Price monitoring stopped for ${selectedMappings.length} products`);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      alert('Failed to stop price monitoring');
    }
  };

  const toggleMappingSelection = (mappingId: string) => {
    setSelectedMappings(prev => 
      prev.includes(mappingId) 
        ? prev.filter(id => id !== mappingId)
        : [...prev, mappingId]
    );
  };

  const selectAllMappings = () => {
    setSelectedMappings(mappings.map(m => m.id));
  };

  const clearSelection = () => {
    setSelectedMappings([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Price Monitoring</h1>
        <p className="text-gray-600">Monitor competitor prices and get alerts on price changes</p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Monitored Products</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalMonitoredProducts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Alerts</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.activeAlerts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Price Changes (24h)</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.priceChanges24h}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg Price Change</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.averagePriceChange.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Monitoring Controls</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-4 mb-4">
            <button
              onClick={() => handleScheduleMonitoring('daily')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={selectedMappings.length === 0}
            >
              Schedule Daily Monitoring
            </button>
            <button
              onClick={() => handleScheduleMonitoring('hourly')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              disabled={selectedMappings.length === 0}
            >
              Schedule Hourly Monitoring
            </button>
            <button
              onClick={handleMonitorNow}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              disabled={selectedMappings.length === 0}
            >
              Monitor Now
            </button>
            <button
              onClick={handleStopMonitoring}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={selectedMappings.length === 0}
            >
              Stop Monitoring
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllMappings}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Clear Selection
            </button>
            <span className="text-sm text-gray-600 self-center">
              {selectedMappings.length} of {mappings.length} selected
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Product Mappings */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Product Mappings</h2>
          </div>
          <div className="p-6">
            {mappings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No approved product mappings found</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {mappings.map((mapping) => (
                  <div key={mapping.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedMappings.includes(mapping.id)}
                      onChange={() => toggleMappingSelection(mapping.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {mapping.userProduct.title}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        vs {mapping.competitorProduct.title}
                      </p>
                      <p className="text-xs text-gray-400">
                        Confidence: {(mapping.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        ${mapping.competitorProduct.price}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Price Alerts */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Price Alerts</h2>
          </div>
          <div className="p-6">
            {priceAlerts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No recent price alerts</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {priceAlerts.map((alert) => (
                  <div key={alert.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        alert.severity === 'high' ? 'bg-red-100 text-red-800' :
                        alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(alert.recordedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {alert.competitorProduct?.title || 'Unknown Product'}
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        ${alert.previousPrice} → ${alert.currentPrice}
                      </span>
                      <span className={`font-medium ${
                        alert.changePercentage > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {alert.changePercentage > 0 ? '+' : ''}{alert.changePercentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Price History */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Price History</h2>
        </div>
        <div className="p-6">
          {priceHistory.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No price history available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recorded At
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {priceHistory.slice(0, 10).map((history) => (
                    <tr key={history.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {history.competitorProduct?.title || 'Unknown Product'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${history.price}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(history.recordedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}