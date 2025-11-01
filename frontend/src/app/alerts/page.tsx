'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { apiService } from '@/lib/api';
import { AlertTriangle, Filter, Search, Trash2, CheckCircle, Clock, Eye, EyeOff } from 'lucide-react';

interface PriceAlert {
  id: string;
  competitorProductId: string;
  currentPrice: number;
  previousPrice: number;
  changePercentage: number;
  severity: 'low' | 'medium' | 'high';
  recordedAt: string;
  isRead?: boolean;
  competitorProduct?: {
    title: string;
    url: string;
  };
}

interface AlertFilters {
  severity: string;
  startDate: string;
  endDate: string;
  search: string;
  isRead: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [filters, setFilters] = useState<AlertFilters>({
    severity: '',
    startDate: '',
    endDate: '',
    search: '',
    isRead: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });

  useEffect(() => {
    fetchAlerts();
  }, [filters, pagination.page]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: pagination.page,
        limit: pagination.limit
      };

      if (filters.severity) params.severity = filters.severity;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      // Try both API endpoints for alerts
      let response;
      try {
        response = await apiService.priceMonitoring.getAlerts(params);
      } catch (error) {
        // Fallback to cron jobs alerts endpoint
        response = await apiService.cronJobs.getAlerts(params);
      }

      let alertsData = Array.isArray(response.data) ? response.data : response.data?.alerts || [];
      
      // Apply client-side filtering for search and read status
      if (filters.search) {
        alertsData = alertsData.filter((alert: PriceAlert) =>
          alert.competitorProduct?.title?.toLowerCase().includes(filters.search.toLowerCase())
        );
      }

      if (filters.isRead) {
        const isReadFilter = filters.isRead === 'read';
        alertsData = alertsData.filter((alert: PriceAlert) => 
          Boolean(alert.isRead) === isReadFilter
        );
      }

      setAlerts(alertsData);
      setPagination(prev => ({
        ...prev,
        total: response.data?.total || alertsData.length
      }));
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof AlertFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      severity: '',
      startDate: '',
      endDate: '',
      search: '',
      isRead: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const toggleSelectAlert = (alertId: string) => {
    setSelectedAlerts(prev =>
      prev.includes(alertId)
        ? prev.filter(id => id !== alertId)
        : [...prev, alertId]
    );
  };

  const selectAllAlerts = () => {
    if (selectedAlerts.length === alerts.length) {
      setSelectedAlerts([]);
    } else {
      setSelectedAlerts(alerts.map(alert => alert.id));
    }
  };

  const markAsRead = async (alertIds: string[]) => {
    // This would need to be implemented in the backend
    console.log('Mark as read:', alertIds);
    // For now, just update local state
    setAlerts(prev => prev.map(alert => 
      alertIds.includes(alert.id) ? { ...alert, isRead: true } : alert
    ));
    setSelectedAlerts([]);
  };

  const markAsUnread = async (alertIds: string[]) => {
    // This would need to be implemented in the backend
    console.log('Mark as unread:', alertIds);
    // For now, just update local state
    setAlerts(prev => prev.map(alert => 
      alertIds.includes(alert.id) ? { ...alert, isRead: false } : alert
    ));
    setSelectedAlerts([]);
  };

  const deleteAlerts = async (alertIds: string[]) => {
    if (!confirm(`Are you sure you want to delete ${alertIds.length} alert(s)?`)) {
      return;
    }
    
    // This would need to be implemented in the backend
    console.log('Delete alerts:', alertIds);
    // For now, just update local state
    setAlerts(prev => prev.filter(alert => !alertIds.includes(alert.id)));
    setSelectedAlerts([]);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <Clock className="h-4 w-4" />;
      case 'low': return <CheckCircle className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const formatPriceChange = (current: number, previous: number, percentage: number) => {
    const isIncrease = current > previous;
    const sign = isIncrease ? '+' : '';
    return {
      text: `$${previous.toFixed(2)} → $${current.toFixed(2)} (${sign}${percentage.toFixed(1)}%)`,
      color: isIncrease ? 'text-red-600' : 'text-green-600'
    };
  };

  return (
    <MainLayout title="Price Alerts">
      <div className="space-y-6">
        {/* Header with Actions */}
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Price Alerts</h1>
                <p className="text-sm text-gray-600">
                  Monitor and manage price change notifications
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAlerts}
                  loading={loading}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </Card.Header>

          {/* Filters */}
          {showFilters && (
            <Card.Content className="border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={filters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                      placeholder="Search products..."
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Severity
                  </label>
                  <select
                    value={filters.severity}
                    onChange={(e) => handleFilterChange('severity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Severities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={filters.isRead}
                    onChange={(e) => handleFilterChange('isRead', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Alerts</option>
                    <option value="unread">Unread</option>
                    <option value="read">Read</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </Card.Content>
          )}
        </Card>

        {/* Bulk Actions */}
        {selectedAlerts.length > 0 && (
          <Card>
            <Card.Content>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {selectedAlerts.length} alert(s) selected
                </span>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAsRead(selectedAlerts)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Mark as Read
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAsUnread(selectedAlerts)}
                  >
                    <EyeOff className="h-4 w-4 mr-2" />
                    Mark as Unread
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteAlerts(selectedAlerts)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card.Content>
          </Card>
        )}

        {/* Alerts List */}
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Price Alerts ({alerts.length})
              </h2>
              {alerts.length > 0 && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedAlerts.length === alerts.length}
                    onChange={selectAllAlerts}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </div>
              )}
            </div>
          </Card.Header>

          <Card.Content>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading alerts...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No price alerts found</p>
                <p className="text-sm text-gray-400 mt-1">
                  Alerts will appear here when price changes are detected
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const priceChange = formatPriceChange(
                    alert.currentPrice,
                    alert.previousPrice,
                    alert.changePercentage
                  );

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 border rounded-lg transition-colors ${
                        alert.isRead ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300'
                      } ${selectedAlerts.includes(alert.id) ? 'ring-2 ring-blue-500' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedAlerts.includes(alert.id)}
                          onChange={() => toggleSelectAlert(alert.id)}
                          className="mt-1"
                        />

                        <div className={`p-2 rounded-lg border ${getSeverityColor(alert.severity)}`}>
                          {getSeverityIcon(alert.severity)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 truncate">
                                {alert.competitorProduct?.title || 'Unknown Product'}
                              </h3>
                              <p className={`text-sm font-medium ${priceChange.color}`}>
                                {priceChange.text}
                              </p>
                              <div className="flex items-center mt-1 space-x-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                                  {alert.severity.toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(alert.recordedAt).toLocaleString()}
                                </span>
                                {!alert.isRead && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 ml-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => alert.isRead ? markAsUnread([alert.id]) : markAsRead([alert.id])}
                              >
                                {alert.isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteAlerts([alert.id])}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {alert.competitorProduct?.url && (
                            <div className="mt-2">
                              <a
                                href={alert.competitorProduct.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 truncate block"
                              >
                                View Product →
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card.Content>

          {/* Pagination */}
          {alerts.length > 0 && pagination.total > pagination.limit && (
            <Card.Content className="border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} alerts
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card.Content>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}