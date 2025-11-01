'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiService, UploadBatch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type MonitoringType = 'basic' | 'competitor_urls' | 'auto_discovery';

export default function UploadPage() {
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [monitoringType, setMonitoringType] = useState<MonitoringType>('basic');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const response = await apiService.upload.getBatches();
      // Handle the response structure: { success: true, data: batches }
      const batchesData = response.data?.data || response.data || [];
      setBatches(Array.isArray(batchesData) ? batchesData : []);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
      setError('Failed to fetch upload batches');
      setBatches([]); // Ensure batches is always an array
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await apiService.upload.uploadCsvWithMonitoring(selectedFile, monitoringType);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      console.log('Upload successful:', response.data);
      
      // Reset form
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh batches
      await fetchBatches();
      
      setTimeout(() => {
        setUploadProgress(0);
      }, 2000);
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Upload failed. Please try again.');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiService.upload.downloadTemplate(monitoringType);
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename based on monitoring type
      const filename = monitoringType === 'competitor_urls' 
        ? 'product_upload_with_competitors_template.csv'
        : 'product_upload_template.csv';
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download template:', err);
      setError('Failed to download template');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'processing':
        return 'text-blue-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'processing':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'failed':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateProgress = (batch: UploadBatch) => {
    if (batch.totalRows === 0) return 0;
    return Math.round((batch.processedRows / batch.totalRows) * 100);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Bulk Upload</h1>
        <p className="text-gray-600">Upload CSV files to add products in bulk</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Upload Section */}
      <Card className="mb-8">
        <Card.Header>
          <h2 className="text-xl font-semibold">Upload CSV File</h2>
          <p className="text-gray-600">Select a CSV file containing product data</p>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {/* Monitoring Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Monitoring Type
              </label>
              <div className="space-y-3">
                <div className="flex items-start">
                  <input
                    id="basic"
                    name="monitoringType"
                    type="radio"
                    value="basic"
                    checked={monitoringType === 'basic'}
                    onChange={(e) => setMonitoringType(e.target.value as MonitoringType)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <label htmlFor="basic" className="text-sm font-medium text-gray-700">
                      Basic Upload
                    </label>
                    <p className="text-sm text-gray-500">
                      Upload products without competitor monitoring. You can set up monitoring later.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <input
                    id="competitor_urls"
                    name="monitoringType"
                    type="radio"
                    value="competitor_urls"
                    checked={monitoringType === 'competitor_urls'}
                    onChange={(e) => setMonitoringType(e.target.value as MonitoringType)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <label htmlFor="competitor_urls" className="text-sm font-medium text-gray-700">
                      With Competitor URLs
                    </label>
                    <p className="text-sm text-gray-500">
                      Include competitor URLs in your CSV for immediate price monitoring setup.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <input
                    id="auto_discovery"
                    name="monitoringType"
                    type="radio"
                    value="auto_discovery"
                    checked={monitoringType === 'auto_discovery'}
                    onChange={(e) => setMonitoringType(e.target.value as MonitoringType)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="ml-3">
                    <label htmlFor="auto_discovery" className="text-sm font-medium text-gray-700">
                      Auto Discovery
                    </label>
                    <p className="text-sm text-gray-500">
                      Automatically discover and monitor competitor products using AI.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {uploadProgress > 0 && (
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {/* Template info based on monitoring type */}
              {monitoringType === 'competitor_urls' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> For competitor URL monitoring, your CSV should include a 'competitor_urls' column with comma-separated URLs.
                  </p>
                </div>
              )}
              
              <div className="flex gap-4">
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || loading}
                  className="btn btn-primary"
                >
                  {loading ? 'Uploading...' : `Upload with ${monitoringType === 'basic' ? 'Basic' : monitoringType === 'competitor_urls' ? 'Competitor' : 'Auto Discovery'} Monitoring`}
                </Button>
                <Button
                  onClick={handleDownloadTemplate}
                  className="btn"
                >
                  Download {monitoringType === 'competitor_urls' ? 'Competitor URLs' : 'Basic'} Template
                </Button>
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Upload History */}
      <Card>
        <Card.Header>
          <h2 className="text-xl font-semibold">Upload History</h2>
          <p className="text-gray-600">Track your bulk upload operations</p>
        </Card.Header>
        <Card.Content>
          {batches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No uploads yet</p>
              <p className="text-sm text-gray-400">Upload your first CSV file to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Results
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(batches) && batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {batch.filename}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {batch.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(batch.status)}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${calculateProgress(batch)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">
                            {calculateProgress(batch)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {batch.processedRows} / {batch.totalRows} rows
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="text-green-600">
                          ✓ {batch.successfulRows} successful
                        </div>
                        {batch.failedRows > 0 && (
                          <div className="text-red-600">
                            ✗ {batch.failedRows} failed
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(batch.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}