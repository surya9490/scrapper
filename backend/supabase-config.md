# Supabase Migration Guide

## Overview
This guide helps you migrate from local PostgreSQL to Supabase for the AI Product & Price Mapping Tool.

## Prerequisites
1. Create a Supabase account at https://supabase.com
2. Create a new project in Supabase
3. Get your project URL and anon key from the project settings

## Environment Variables Setup

Update your `.env` file with the following Supabase configuration:

```env
# Supabase Configuration
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="[YOUR-ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SERVICE-ROLE-KEY]"

# Redis Configuration (keep local)
REDIS_URL="redis://localhost:6379"

# Other existing variables...
PORT=4000
NODE_ENV=development
MAX_CONCURRENCY=5
WORKER_CONCURRENCY=3
PRICE_CHECK_CRON="0 */6 * * *"
```

## Migration Steps

### 1. Install Supabase CLI (Optional)
```bash
npm install -g @supabase/cli
```

### 2. Update Prisma Schema
The current schema is already compatible with Supabase PostgreSQL. No changes needed.

### 3. Run Database Migration
```bash
# Generate Prisma client
npm run db:generate

# Deploy migrations to Supabase
npm run db:deploy
```

### 4. Verify Connection
Test the connection by running:
```bash
npm start
```

## Supabase Features to Consider

### Row Level Security (RLS)
Consider enabling RLS for multi-tenant support:
```sql
-- Enable RLS on sensitive tables
ALTER TABLE user_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies based on your authentication needs
CREATE POLICY "Users can view their own products" ON user_products
  FOR SELECT USING (auth.uid()::text = created_by);
```

### Real-time Subscriptions
Enable real-time updates for price monitoring:
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// Subscribe to price changes
const subscription = supabase
  .channel('price-updates')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'price_histories' },
    (payload) => {
      console.log('New price update:', payload)
    }
  )
  .subscribe()
```

### Edge Functions
Consider moving some background tasks to Supabase Edge Functions for better scalability.

## Benefits of Supabase Migration

1. **Managed Database**: No need to manage PostgreSQL infrastructure
2. **Built-in Authentication**: Easy user management and authentication
3. **Real-time Updates**: Built-in real-time subscriptions
4. **Automatic Backups**: Daily backups included
5. **Scalability**: Automatic scaling based on usage
6. **Dashboard**: Built-in database dashboard and query editor

## Local Development with Supabase

You can still develop locally while using Supabase:

1. **Option 1**: Use Supabase cloud database for development
2. **Option 2**: Use Supabase local development setup:
   ```bash
   supabase init
   supabase start
   ```

## Migration Checklist

- [ ] Create Supabase project
- [ ] Update environment variables
- [ ] Test database connection
- [ ] Run Prisma migrations
- [ ] Verify all API endpoints work
- [ ] Update deployment configuration
- [ ] Set up monitoring and alerts
- [ ] Configure backups (if needed beyond default)

## Troubleshooting

### Connection Issues
- Verify DATABASE_URL format
- Check if IP is whitelisted in Supabase (if using IP restrictions)
- Ensure SSL is enabled in connection string

### Migration Errors
- Check Prisma schema compatibility
- Verify all required extensions are enabled in Supabase
- Review migration logs for specific errors

### Performance Issues
- Monitor connection pool usage
- Consider connection pooling with PgBouncer
- Review query performance in Supabase dashboard