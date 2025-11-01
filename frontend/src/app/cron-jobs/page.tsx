'use client';

import React from 'react';
import MainLayout from '../../components/layout/MainLayout';
import CronJobDashboard from '../../components/dashboard/CronJobDashboard';

const CronJobsPage: React.FC = () => {
  return (
    <MainLayout>
      <CronJobDashboard />
    </MainLayout>
  );
};

export default CronJobsPage;