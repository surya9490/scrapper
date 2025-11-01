'use client'

import { useAuth } from '@/lib/auth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { 
  Package, 
  TrendingUp, 
  Users, 
  DollarSign,
  Activity,
  ShoppingCart,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

export default function DashboardPage() {
  const { user } = useAuth()

  const stats = [
    {
      name: 'Total Products',
      value: '0',
      icon: Package,
      change: '+0%',
      changeType: 'positive',
    },
    {
      name: 'Price Alerts',
      value: '0',
      icon: AlertCircle,
      change: '+0%',
      changeType: 'positive',
    },
    {
      name: 'Active Monitors',
      value: '0',
      icon: Activity,
      change: '+0%',
      changeType: 'positive',
    },
    {
      name: 'Shopify Stores',
      value: '0',
      icon: ShoppingCart,
      change: '+0%',
      changeType: 'positive',
    },
  ]

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="px-4 py-6 sm:px-0">
            <div className="border-b border-gray-200 pb-5">
              <h1 className="text-3xl font-bold leading-6 text-gray-900">
                Welcome back, {user?.username}!
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-gray-500">
                Here's what's happening with your price monitoring and scraping activities.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 sm:px-0">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.name}
                    className="relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden"
                  >
                    <dt>
                      <div className="absolute bg-indigo-500 rounded-md p-3">
                        <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                      </div>
                      <p className="ml-16 text-sm font-medium text-gray-500 truncate">
                        {item.name}
                      </p>
                    </dt>
                    <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
                      <p className="text-2xl font-semibold text-gray-900">
                        {item.value}
                      </p>
                      <p
                        className={`ml-2 flex items-baseline text-sm font-semibold ${
                          item.changeType === 'positive'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {item.change}
                      </p>
                    </dd>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-4 sm:px-0 mt-8">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Quick Actions
                </h3>
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="bg-gray-50 rounded-lg p-6 text-center hover:bg-gray-100 cursor-pointer transition-colors">
                    <Package className="mx-auto h-12 w-12 text-indigo-600" />
                    <h4 className="mt-2 text-lg font-medium text-gray-900">
                      Add Products
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Start monitoring new products
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6 text-center hover:bg-gray-100 cursor-pointer transition-colors">
                    <TrendingUp className="mx-auto h-12 w-12 text-indigo-600" />
                    <h4 className="mt-2 text-lg font-medium text-gray-900">
                      Price Monitoring
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Set up price alerts
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6 text-center hover:bg-gray-100 cursor-pointer transition-colors">
                    <ShoppingCart className="mx-auto h-12 w-12 text-indigo-600" />
                    <h4 className="mt-2 text-lg font-medium text-gray-900">
                      Shopify Integration
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Connect your store
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="px-4 sm:px-0 mt-8">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Recent Activity
                </h3>
                <div className="mt-5">
                  <div className="text-center py-12">
                    <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                    <h4 className="mt-2 text-lg font-medium text-gray-900">
                      No recent activity
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      Start using the platform to see your activity here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}