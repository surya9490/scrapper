import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { getSession } from 'next-auth/react';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token from NextAuth session
api.interceptors.request.use(
  async (config) => {
    const session = await getSession();
    if (session?.accessToken) {
      config.headers.Authorization = `Bearer ${session.accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to sign-in page on auth errors
      window.location.href = '/auth/signin';
    }
    return Promise.reject(error);
  }
);

// Types
export interface Product {
  id: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  description?: string;
  brand?: string;
  category?: string;
  sku?: string;
  lastScrapedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProduct {
  id: string;
  title: string;
  sku: string;
  brand?: string;
  category?: string;
  description?: string;
  price?: number;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorProduct {
  id: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  description?: string;
  brand?: string;
  category?: string;
  lastScrapedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMapping {
  id: string;
  userProductId: string;
  competitorProductId: string;
  status: 'pending' | 'approved' | 'rejected';
  confidence: number;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  userProduct: UserProduct;
  competitorProduct: CompetitorProduct;
}

export interface PriceHistory {
  id: string;
  competitorProductId: string;
  price: number;
  recordedAt: string;
  competitorProduct?: CompetitorProduct;
}

export interface DashboardStats {
  totalUserProducts: number;
  totalCompetitorProducts: number;
  approvedMappings: number;
  pendingMappings: number;
  totalPricePoints: number;
  totalUploads: number;
}

export interface QueueJob {
  id: string;
  name: string;
  data: any;
  opts: any;
  progress: number;
  delay: number;
  timestamp: number;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: any;
  finishedOn?: number;
  processedOn?: number;
}

export interface UploadBatch {
  id: string;
  filename: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyStore {
  id: string;
  shop: string;
  accessToken: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CronJobStatus {
  name: string;
  schedule: string;
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
  status: 'running' | 'stopped' | 'error';
}

export interface CronJobHealth {
  success: boolean;
  status: string;
  cronJobService: {
    initialized: boolean;
    totalJobs: number;
  };
  priceComparisonService: {
    available: boolean;
  };
}

export interface CronJobDashboard {
  totalProducts: number;
  activeMappings: number;
  recentPriceChanges: number;
  significantChanges: number;
}

export interface PriceAlert {
  id: string;
  competitorProductId: string;
  userProductId: string;
  oldPrice: number;
  newPrice: number;
  changePercentage: number;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
  competitorProduct?: CompetitorProduct;
  userProduct?: UserProduct;
}

export interface PriceComparison {
  id: string;
  userProductId: string;
  competitorProductId: string;
  userPrice?: number;
  competitorPrice: number;
  priceDifference: number;
  percentageDifference: number;
  comparedAt: string;
  userProduct?: UserProduct;
  competitorProduct?: CompetitorProduct;
}

// API Services
export const apiService = {
  // Health check
  health: () => api.get('/health'),

  // Scraping endpoints
  scrape: {
    scrapeUrl: (url: string) => api.post('/scrape', { url }),
    getProducts: () => api.get('/scrape'),
    getProduct: (id: string) => api.get(`/scrape/${id}`),
  },

  // Dashboard APIs
  dashboard: {
    getOverview: () => api.get<{
      stats: DashboardStats;
      recentMappings: ProductMapping[];
      priceAlerts: PriceHistory[];
    }>('/dashboard/overview'),
    
    getProducts: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      brand?: string;
    }) => api.get('/dashboard/products', { params }),
    
    getMappings: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }) => api.get('/dashboard/mappings', { params }),
    
    findMatches: (userProductId: string) => 
      api.post('/dashboard/find-matches', { userProductId }),
    
    approveMapping: (id: string) => 
      api.post(`/dashboard/mappings/${id}/approve`),
    
    rejectMapping: (id: string, reason?: string) => 
      api.post(`/dashboard/mappings/${id}/reject`, { reason }),
    
    deleteMapping: (id: string) => 
      api.delete(`/dashboard/mappings/${id}`),
    
    getPriceHistory: (competitorProductId: string) => 
      api.get(`/dashboard/price-history/${competitorProductId}`),
  },

  // Price Monitoring APIs
  priceMonitoring: {
    getStatus: () => api.get('/price-monitoring/status'),
    
    schedule: (mappingIds: string[], schedule: string = 'daily') => 
      api.post('/price-monitoring/schedule', { mappingIds, schedule }),
    
    stop: (mappingIds: string[]) => 
      api.post('/price-monitoring/stop', { mappingIds }),
    
    monitorNow: (mappingIds: string[]) => 
      api.post('/price-monitoring/monitor-now', { mappingIds }),
    
    getTrends: (competitorProductId: string, days: number = 30) => 
      api.get(`/price-monitoring/trends/${competitorProductId}`, { 
        params: { days } 
      }),
    
    getAlerts: (params?: {
      page?: number;
      limit?: number;
      severity?: string;
      startDate?: string;
      endDate?: string;
    }) => api.get('/price-monitoring/alerts', { params }),
    
    getHistory: (params?: {
      page?: number;
      limit?: number;
      competitorProductId?: string;
      startDate?: string;
      endDate?: string;
    }) => api.get('/price-monitoring/history', { params }),
    
    cleanup: (days: number = 90) => 
      api.post('/price-monitoring/cleanup', { days }),
    
    getStatistics: () => api.get('/price-monitoring/statistics'),
  },

  // Queue endpoints
  queue: {
    addUrls: (urls: string[]) => api.post('/queue', { urls }),
    getStatus: () => api.get('/queue/status'),
    getJob: (jobId: string) => api.get(`/queue/job/${jobId}`),
    clearCompleted: () => api.delete('/queue/completed'),
    clearFailed: () => api.delete('/queue/failed'),
  },

  // Upload endpoints
  upload: {
    uploadCsv: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/upload/csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    
    uploadCsvWithMonitoring: (file: File, monitoringType: string = 'basic') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('monitoringType', monitoringType);
      return api.post('/upload/csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    
    getBatches: (params?: {
      page?: number;
      limit?: number;
      status?: string;
    }) => api.get('/upload/batches', { params }),
    
    getBatch: (id: string) => api.get(`/upload/batches/${id}`),
    
    downloadTemplate: (type: string = 'basic') => api.get('/upload/template', {
      params: { type },
      responseType: 'blob',
    }),
  },

  // Shopify APIs
  cronJobs: {
    // Initialize cron job service
    initialize: () => api.post('/cron-jobs/initialize'),

    // Get health status
    getHealth: () => api.get('/cron-jobs/health'),

    // Get job status
    getStatus: () => api.get('/cron-jobs/status'),

    // Create new job
    createJob: (jobData: {
      name: string;
      schedule: string;
      type: string;
      data?: any;
    }) => api.post('/cron-jobs/create', jobData),

    // Stop specific job
    stopJob: (jobName: string) => api.post(`/cron-jobs/stop/${jobName}`),

    // Stop all jobs
    stopAllJobs: () => api.post('/cron-jobs/stop-all'),

    // Trigger jobs manually
    triggerPriceMonitoring: () => api.post('/cron-jobs/trigger/price-monitoring'),
    triggerPriceComparison: () => api.post('/cron-jobs/trigger/price-comparison'),

    // Dashboard data
    getDashboard: () => api.get('/cron-jobs/dashboard'),

    // Price alerts
    getAlerts: (params?: {
      page?: number;
      limit?: number;
      severity?: string;
      startDate?: string;
      endDate?: string;
    }) => api.get('/cron-jobs/alerts', { params }),

    // Price comparison endpoints
    getPriceComparisons: (params?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    }) => api.get('/cron-jobs/price-comparisons', { params }),

    getSignificantChanges: (params?: {
      page?: number;
      limit?: number;
      threshold?: number;
    }) => api.get('/cron-jobs/significant-changes', { params }),

    getRecentChanges: (params?: {
      page?: number;
      limit?: number;
      hours?: number;
    }) => api.get('/cron-jobs/recent-changes', { params }),
  },

  shopify: {
    auth: (shop: string) => api.get('/shopify/auth', { params: { shop } }),

    callback: (params: { code: string; shop: string; state: string }) => 
      api.get('/shopify/callback', { params }),

    getStatus: (shop: string) => api.get(`/shopify/status/${shop}`),

    getProducts: (shop: string, params?: {
      page?: number;
      limit?: number;
    }) => api.get(`/shopify/products/${shop}`, { params }),

    syncPrices: (mappingIds: string[]) => 
      api.post('/shopify/sync-prices', { mappingIds }),

    updatePrice: (productId: string, variantId: string, price: number) => 
      api.post('/shopify/update-price', { productId, variantId, price }),

    getSyncHistory: (params?: {
      page?: number;
      limit?: number;
      shop?: string;
      startDate?: string;
      endDate?: string;
    }) => api.get('/shopify/sync-history', { params }),

    disconnect: (shop: string) => 
      api.post('/shopify/disconnect', { shop }),

    getStores: () => api.get('/shopify/stores'),

    scheduleSync: (shop: string, schedule: string, mappingIds: string[]) => 
      api.post('/shopify/schedule-sync', { shop, schedule, mappingIds }),
  },
};

export default api;