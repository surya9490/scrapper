'use client';

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Play, 
  Square, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Activity,
  TrendingUp,
  Database,
  Settings
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { apiService } from '../../lib/api';
import type { CronJobHealth, CronJobDashboard as CronJobDashboardType, CronJobStatus, PriceAlert } from '../../lib/api';
import toast from 'react-hot-toast';

const CronJobDashboard: React.FC = () => {
  const [health, setHealth] = useState<CronJobHealth | null>(null);
  const [dashboard, setDashboard] = useState<CronJobDashboardType | null>(null);
  const [jobs, setJobs] = useState<CronJobStatus[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [healthRes, dashboardRes, alertsRes, statusRes] = await Promise.all([
        apiService.cronJobs.getHealth(),
        apiService.cronJobs.getDashboard(),
        apiService.cronJobs.getAlerts({ limit: 5 }),
        apiService.cronJobs.getStatus()
      ]);

      setHealth(healthRes.data);
      setDashboard(dashboardRes.data);
      setAlerts(alertsRes.data.alerts || []);
      setJobStatus(statusRes.data);
    } catch (error) {
      console.error('Error fetching cron job data:', error);
      setError('Failed to fetch dashboard data');
      toast.error('Failed to load cron job data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleInitialize = async () => {
    try {
      setRefreshing(true);
      await apiService.cronJobs.initialize();
      toast.success('Cron job service initialized successfully');
      await fetchData();
    } catch (error) {
      console.error('Error initializing cron jobs:', error);
      toast.error('Failed to initialize cron job service');
      setRefreshing(false);
    }
  };

  const handleTriggerPriceMonitoring = async () => {
    try {
      setRefreshing(true);
      const response = await apiService.cronJobs.triggerPriceMonitoring();
      toast.success(`Price monitoring triggered: ${response.data.message}`);
      await fetchData();
    } catch (error) {
      console.error('Error triggering price monitoring:', error);
      toast.error('Failed to trigger price monitoring');
      setRefreshing(false);
    }
  };

  const handleTriggerPriceComparison = async () => {
    try {
      setRefreshing(true);
      await apiService.cronJobs.triggerPriceComparison();
      toast.success('Price comparison triggered successfully');
      await fetchData();
    } catch (error) {
      console.error('Error triggering price comparison:', error);
      toast.error('Failed to trigger price comparison');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStopAllJobs = async () => {
    try {
      setRefreshing(true);
      await apiService.cronJobs.stopAllJobs();
      toast.success('All jobs stopped successfully');
      await fetchData();
    } catch (error) {
      console.error('Error stopping all jobs:', error);
      toast.error('Failed to stop all jobs');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStopJob = async (jobName: string) => {
    try {
      setRefreshing(true);
      await apiService.cronJobs.stopJob(jobName);
      toast.success(`Job ${jobName} stopped successfully`);
      await fetchData();
    } catch (error) {
      console.error('Error stopping job:', error);
      toast.error(`Failed to stop job ${jobName}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  useEffect(() => {
    fetchData();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Loading cron job dashboard...</span>
      </div>
    );
  }

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5" />;
      case 'warning': return <AlertTriangle className="h-5 w-5" />;
      case 'error': return <XCircle className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cron Job Dashboard</h1>
          <p className="text-gray-600">Monitor and manage automated price monitoring jobs</p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleInitialize}
            disabled={refreshing}
            variant="primary"
            size="sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Initialize
          </Button>
        </div>
      </div>

      {/* Health Status */}
      <Card>
        <Card.Header>
          <div className="flex items-center">
            <Activity className="h-5 w-5 text-gray-600 mr-2" />
            <h2 className="text-lg font-semibold">System Health</h2>
          </div>
        </Card.Header>
        <Card.Content>
          {health ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${getHealthStatusColor(health.status)}`}>
                  {getHealthStatusIcon(health.status)}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Overall Status</p>
                  <p className="text-lg font-semibold capitalize">{health.status}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="p-2 rounded-lg text-blue-600 bg-blue-50">
                  <Database className="h-5 w-5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Active Jobs</p>
                  <p className="text-lg font-semibold">{health.cronJobService.totalJobs}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${health.priceComparisonService.available ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                  {health.priceComparisonService.available ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Price Service</p>
                  <p className="text-lg font-semibold">{health.priceComparisonService.available ? 'Available' : 'Unavailable'}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Health data unavailable</p>
          )}
        </Card.Content>
      </Card>

      {/* Active Jobs Status */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-semibold">Active Jobs</h2>
            </div>
            <div className="flex items-center space-x-2">
              {jobStatus && jobStatus.totalJobs > 0 && (
                <Button
                  onClick={handleStopAllJobs}
                  disabled={refreshing}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop All
                </Button>
              )}
              {jobStatus && (
                <span className="text-sm text-gray-500">
                  {jobStatus.totalJobs} total jobs
                </span>
              )}
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          {jobStatus && jobStatus.jobs ? (
            <div className="space-y-3">
              {jobStatus.jobs.map((job: any) => (
                <div key={job.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-lg mr-3 ${
                      job.isRunning 
                        ? 'text-green-600 bg-green-50' 
                        : 'text-gray-600 bg-gray-100'
                    }`}>
                      {job.isRunning ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{job.name}</p>
                      <p className="text-sm text-gray-500">{job.description || job.type}</p>
                      <p className="text-xs text-gray-400">Schedule: {job.schedule}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      job.isRunning 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {job.isRunning ? 'Running' : 'Idle'}
                    </span>
                    <Button
                      onClick={() => handleStopJob(job.name)}
                      disabled={!job.isRunning || refreshing}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {jobStatus.jobs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No active jobs found</p>
                  <p className="text-sm">Click Initialize to set up default jobs</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Loading job status...</p>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <Card.Content className="p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg text-blue-600 bg-blue-50">
                <Database className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-2xl font-semibold text-gray-900">{dashboard?.totalProducts || 0}</p>
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg text-green-600 bg-green-50">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Mappings</p>
                <p className="text-2xl font-semibold text-gray-900">{dashboard?.activeMappings || 0}</p>
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg text-yellow-600 bg-yellow-50">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Recent Changes</p>
                <p className="text-2xl font-semibold text-gray-900">{dashboard?.recentPriceChanges || 0}</p>
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg text-red-600 bg-red-50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Significant Changes</p>
                <p className="text-2xl font-semibold text-gray-900">{dashboard?.significantChanges || 0}</p>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Manual Triggers */}
      <Card>
        <Card.Header>
          <div className="flex items-center">
            <Play className="h-5 w-5 text-gray-600 mr-2" />
            <h2 className="text-lg font-semibold">Manual Triggers</h2>
          </div>
        </Card.Header>
        <Card.Content>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Price Monitoring</h3>
              <p className="text-sm text-gray-600 mb-4">
                Manually trigger price monitoring for all active product mappings
              </p>
              <Button
                onClick={handleTriggerPriceMonitoring}
                disabled={refreshing}
                variant="primary"
                size="sm"
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                Trigger Price Monitoring
              </Button>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Price Comparison</h3>
              <p className="text-sm text-gray-600 mb-4">
                Manually trigger price comparison analysis and generate alerts
              </p>
              <Button
                onClick={handleTriggerPriceComparison}
                disabled={refreshing}
                variant="primary"
                size="sm"
                className="w-full"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Trigger Price Comparison
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-semibold">Recent Price Alerts</h2>
            </div>
            <Button variant="outline" size="sm">
              View All
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-lg ${
                      alert.severity === 'high' ? 'text-red-600 bg-red-50' :
                      alert.severity === 'medium' ? 'text-yellow-600 bg-yellow-50' :
                      'text-blue-600 bg-blue-50'
                    }`}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        Price change detected
                      </p>
                      <p className="text-xs text-gray-600">
                        ${alert.oldPrice} → ${alert.newPrice} ({alert.changePercentage > 0 ? '+' : ''}{alert.changePercentage.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {new Date(alert.createdAt).toLocaleDateString()}
                    </p>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      alert.severity === 'high' ? 'bg-red-100 text-red-800' :
                      alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No recent price alerts</p>
              <p className="text-sm text-gray-400">Price alerts will appear here when detected</p>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
};

export default CronJobDashboard;