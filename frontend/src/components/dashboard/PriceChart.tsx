'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Card from '../ui/Card';

interface PriceData {
  date: string;
  price: number;
  competitor_price?: number;
}

interface PriceChartProps {
  data: PriceData[];
  title: string;
  productName?: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ data, title, productName }) => {
  const formatPrice = (value: number) => `$${value.toFixed(2)}`;
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card>
      <Card.Header>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {productName && (
          <p className="text-sm text-gray-600">{productName}</p>
        )}
      </Card.Header>
      <Card.Content>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis 
                tickFormatter={formatPrice}
                stroke="#6b7280"
                fontSize={12}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatPrice(value), 
                  name === 'price' ? 'Your Price' : 'Competitor Price'
                ]}
                labelFormatter={(label: string) => `Date: ${formatDate(label)}`}
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              />
              {data.some(item => item.competitor_price !== undefined) && (
                <Line 
                  type="monotone" 
                  dataKey="competitor_price" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card.Content>
    </Card>
  );
};

export default PriceChart;