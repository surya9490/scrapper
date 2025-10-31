'use client';

import React, { useState, useEffect } from 'react';
import { apiService, QueueJob } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function QueuePage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, [filter]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await apiService.queue.getStatus();
      setJobs(response.data.jobs || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      setError('Failed to fetch queue jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      // Since there's no retry method, we'll show a message
      setError('Retry functionality not available in current API');
    } catch (err) {
      console.error('Failed to retry job:', err);
      setError('Failed to retry job');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      // Since there's no cancel method, we'll show a message
      setError('Cancel functionality not available in current API');
    } catch (err) {
      console.error('Failed to cancel job:', err);
      setError('Failed to cancel job');
    }
  };

  const handleClearCompleted = async () => {
    try {
      await apiService.queue.clearCompleted();
      await fetchJobs();
    } catch (err) {
      console.error('Failed to clear completed jobs:', err);
      setError('Failed to clear completed jobs');
    }
  };

  const handleClearFailed = async () => {
    try {
      await apiService.queue.clearFailed();
      await fetchJobs();
    } catch (err) {
      console.error('Failed to clear failed jobs:', err);
      setError('Failed to clear failed jobs');
    }
  };

  const getJobStatus = (job: QueueJob) => {
    if (job.finishedOn) {
      return job.failedReason ? 'failed' : 'completed';
    }
    if (job.processedOn) {
      return 'processing';
    }
    return 'waiting';
  };

  const getJobType = (job: QueueJob) => {
    return job.name || 'Unknown';
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (job: QueueJob) => {
    const status = getJobStatus(job);
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const filteredJobs = jobs.filter(job => {
    const status = getJobStatus(job);
    const matchesFilter = filter === 'all' || status === filter;
    const matchesSearch = searchTerm === '' || 
      job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Queue Monitoring</h1>
        <p className="text-gray-600">Monitor and manage background job processing</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <Button
            onClick={() => setFilter('all')}
            variant={filter === 'all' ? 'primary' : 'secondary'}
            size="sm"
          >
            All
          </Button>
          <Button
            onClick={() => setFilter('waiting')}
            variant={filter === 'waiting' ? 'primary' : 'secondary'}
            size="sm"
          >
            Waiting
          </Button>
          <Button
            onClick={() => setFilter('processing')}
            variant={filter === 'processing' ? 'primary' : 'secondary'}
            size="sm"
          >
            Processing
          </Button>
          <Button
            onClick={() => setFilter('completed')}
            variant={filter === 'completed' ? 'primary' : 'secondary'}
            size="sm"
          >
            Completed
          </Button>
          <Button
            onClick={() => setFilter('failed')}
            variant={filter === 'failed' ? 'primary' : 'secondary'}
            size="sm"
          >
            Failed
          </Button>
        </div>

        <Input
          type="text"
          placeholder="Search jobs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoRefresh"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="autoRefresh" className="text-sm text-gray-600">
            Auto-refresh
          </label>
        </div>

        <Button onClick={fetchJobs} variant="secondary" size="sm">
          Refresh
        </Button>

        <Button onClick={handleClearCompleted} variant="secondary" size="sm">
          Clear Completed
        </Button>

        <Button onClick={handleClearFailed} variant="secondary" size="sm">
          Clear Failed
        </Button>
      </div>

      {/* Jobs Table */}
      <Card>
        <Card.Header>
          <h2 className="text-xl font-semibold">Queue Jobs ({filteredJobs.length})</h2>
        </Card.Header>
        <Card.Content>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No jobs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Attempts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Processed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Finished
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {job.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getJobType(job)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${getStatusColor(job)}`}>
                          {getJobStatus(job)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${job.progress}%` }}
                            ></div>
                          </div>
                          <span>{job.progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {job.attemptsMade}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(job.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(job.processedOn)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(job.finishedOn)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          {getJobStatus(job) === 'failed' && (
                            <Button
                              onClick={() => handleRetryJob(job.id)}
                              variant="secondary"
                              size="sm"
                            >
                              Retry
                            </Button>
                          )}
                          {(getJobStatus(job) === 'waiting' || getJobStatus(job) === 'processing') && (
                            <Button
                              onClick={() => handleCancelJob(job.id)}
                              variant="secondary"
                              size="sm"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Job Details */}
      {filteredJobs.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredJobs.slice(0, 6).map((job) => (
            <Card key={job.id}>
              <Card.Header>
                <h3 className="text-lg font-semibold">{getJobType(job)}</h3>
                <p className="text-sm text-gray-600">ID: {job.id.substring(0, 12)}...</p>
              </Card.Header>
              <Card.Content>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`text-sm font-medium ${getStatusColor(job)}`}>
                      {getJobStatus(job)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Progress:</span>
                    <span className="text-sm">{job.progress}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Attempts:</span>
                    <span className="text-sm">{job.attemptsMade}</span>
                  </div>
                  {job.failedReason && (
                    <div className="mt-2">
                      <span className="text-sm text-gray-600">Error:</span>
                      <p className="text-sm text-red-600 mt-1">{job.failedReason}</p>
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}