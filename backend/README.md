# AI Product & Price Mapping Tool - Backend

A robust, production-ready backend service for AI-powered product matching and price monitoring with comprehensive error handling and configuration validation. Built with Node.js, Playwright, PostgreSQL, and Redis.

## 🚀 Features

- **AI-Powered Product Matching**: Uses HuggingFace Router (MiniMaxAI/MiniMax-M2) or OpenAI for intelligent attribute extraction and matching
- **Web Scraping**: Automated product data extraction using Playwright with browser management
- **Price Monitoring**: Scheduled price checking with Redis-based job queues
- **Shopify Integration**: Connect with Shopify stores for product synchronization
- **Queue Management**: BullMQ-powered job queue for handling bulk operations
- **Comprehensive Error Handling**: Robust error handling with retry logic and detailed logging
- **Configuration Validation**: Automatic environment variable validation with helpful error messages
- **Security Features**: Rate limiting, CORS protection, and security headers
- **Graceful Shutdown**: Proper cleanup of browser instances, database connections, and Redis
- **Health Monitoring**: Built-in health checks and system monitoring endpoints

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Express API   │    │  Worker Process │    │   Cron Jobs     │
│   (Backend)     │    │   (Scraper)     │    │ (Price Check)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────┐    ┌─────────────────┐
         │   PostgreSQL    │    │     Redis       │
         │   (Database)    │    │  (Job Queue)    │
         └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or a managed Postgres service)
- Redis 6+ (or a managed Redis service)
- Git

## 🛠️ Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd scrapper-backend
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables as needed
nano .env
```

#### Required Environment Variables

The server will automatically validate your configuration on startup. The following variables are **required**:

```env
# AI Provider (Required)
# Provide at least one of the following keys:
# - OPENAI_API_KEY (for OpenAI)
# - HUGGINGFACE_API_KEY (for HuggingFace Router)

# Security (Required)
JWT_SECRET=your-jwt-secret-key-here

# CORS Configuration (Required)
CORS_ORIGIN=http://localhost:3000
```

#### Database & Redis Configuration

```env
# PostgreSQL Database
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# Redis Cache/Queue
REDIS_URL=redis://localhost:6379
```

#### Configuration Validation

The server performs automatic environment validation on startup:
- ✅ **Success**: All required variables are present and valid
- ⚠️ **Warnings**: Optional variables using default values
- ❌ **Errors**: Missing required variables (server will not start)

Example validation output:
```
✅ Environment configuration validated successfully
⚠️ LOG_LEVEL not set, using default: info
❌ Either OPENAI_API_KEY or HUGGINGFACE_API_KEY is required but not provided
```

### 3. Start Locally

Ensure PostgreSQL and Redis are running locally (or use managed services). Then install dependencies and start the API:

```bash
# Install dependencies
npm install

# Start API server (Node.js watch mode)
npm run dev

# Start worker (optional, for queues)
npm run worker:dev
```

### 4. Initialize Database

```bash
# Run database migrations
npx prisma migrate deploy

# (Optional) Generate Prisma client
npx prisma generate
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/productdb` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `MAX_CONCURRENCY` | Maximum concurrent scrapers | `5` |
| `WORKER_CONCURRENCY` | Worker process concurrency | `3` |
| `PRICE_CHECK_CRON` | Price check schedule | `0 */6 * * *` (every 6 hours) |

#### AI Provider Options

- OpenAI:
  - Set `OPENAI_API_KEY`
  - Optional: `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- HuggingFace Router:
  - Set `HUGGINGFACE_API_KEY`
  - Optional: `HUGGINGFACE_CHAT_MODEL` (default `MiniMaxAI/MiniMax-M2`), `HUGGINGFACE_EMBEDDING_MODEL` (default `jinaai/jina-embeddings-v3-base-en`)
  - Notes: The service uses an OpenAI-compatible API surface to call the router.

### Cron Schedule Examples

- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 */2 * * *` - Every 2 hours
- `*/30 * * * *` - Every 30 minutes

## 📡 API Endpoints

### Health Check
```bash
GET /health
```

### Scraping Endpoints
```bash
# Scrape a single URL
POST /api/scrape
Content-Type: application/json
{
  "url": "https://example.com/product"
}

# Get all scraped products
GET /api/scrape

# Get specific product
GET /api/scrape/:id
```

### Queue Management
```bash
# Add URLs to queue
POST /api/queue
Content-Type: application/json
{
  "urls": ["https://example1.com", "https://example2.com"]
}

# Get queue status
GET /api/queue/status

# Get job details
GET /api/queue/job/:jobId

# Clear completed jobs
DELETE /api/queue/completed

# Clear failed jobs
DELETE /api/queue/failed
```

## 🧪 Testing the API

### Scrape a Product
```bash
curl -X POST http://localhost:4000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product"}'
```

### Queue Multiple URLs
```bash
curl -X POST http://localhost:4000/api/queue \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example1.com", "https://example2.com"]}'
```

### Check Queue Status
```bash
curl http://localhost:4000/api/queue/status
```

### Test AI Attribute Extraction
```bash
curl -X POST http://localhost:4000/api/dashboard/test \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Premium 100% Cotton 400 Thread Count Queen Bedding Set",
    "description": "Luxurious 400 TC Egyptian cotton sheets with breathable weave, queen size, fitted sheet and pillowcases included."
  }'
```

## 🧰 Local Development Commands

```bash
# Start API server (watch mode)
npm run dev

# Start worker (watch mode)
npm run worker:dev

# Prisma tools
npx prisma migrate dev
npx prisma migrate deploy
npx prisma generate
npx prisma studio

# Check health
curl http://localhost:4000/health
```

## 🔍 Monitoring & Debugging

### Access Development Tools

- **pgAdmin**: http://localhost:8080 (admin@example.com / admin)
- **Redis Commander**: http://localhost:8081
- **API Health**: http://localhost:4000/health

### Health Endpoint Details
The `/health` endpoint reports real-time service status:
- `status`: `OK` when both DB and Redis are connected, `DEGRADED` otherwise
- `checks.database`: `connected` or `error`
- `checks.redis`: `connected` or `error`
- `uptimeSeconds`: server process uptime
- `features`: flags indicating enabled subsystems (scraping, upload, dashboard, etc.)

Example response:
```json
{
  "status": "OK",
  "timestamp": "2024-11-02T12:00:00.000Z",
  "environment": "development",
  "uptimeSeconds": 1234,
  "checks": { "database": "connected", "redis": "connected" },
  "features": { "scraping": true, "upload": true, "dashboard": true }
}
```

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f worker
```

### Database Access
```bash
# Connect to PostgreSQL
docker-compose exec db psql -U postgres -d productdb

# Run Prisma Studio
docker-compose exec backend npx prisma studio
```

## 🚀 Production Deployment

### 1. Environment Setup
```bash
# Set production environment
NODE_ENV=production

# Use strong passwords
POSTGRES_PASSWORD=your-strong-password
PGADMIN_PASSWORD=your-admin-password

# Add security keys
JWT_SECRET=your-jwt-secret
API_KEY=your-api-key
```

### 2. Security Considerations
- Use environment-specific `.env` files
- Enable SSL/TLS for database connections
- Implement rate limiting
- Add authentication middleware
- Use secrets management (Docker Secrets, Kubernetes Secrets)

### 3. Scaling
```bash
# Scale workers based on load
docker-compose up -d --scale worker=5

# Use Docker Swarm or Kubernetes for orchestration
```

## 🛠️ Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Set up database
npx prisma migrate dev
npx prisma generate

# Start development server
npm run dev

# Start worker process
node scraper/worker.js
```

### Project Structure
```
├── prisma/
│   └── schema.prisma          # Database schema
├── routes/
│   ├── scrape.js             # Scraping endpoints
│   └── queue.js              # Queue management
├── scraper/
│   ├── cluster.js            # Playwright cluster
│   └── worker.js             # Background worker
├── jobs/
│   └── priceChecker.js       # Cron jobs
├── server.js                 # Express server
├── package.json              # Dependencies
├── Dockerfile                # Container config
└── docker-compose.yml        # Service orchestration
```

## 🔄 Next Steps

1. **AI Integration**: Implement product matching algorithms
2. **Frontend**: Build Remix-based dashboard
3. **Analytics**: Add price trend analysis
4. **Notifications**: Email/SMS alerts for price changes
5. **API Authentication**: Implement JWT-based auth
6. **Rate Limiting**: Add request throttling
7. **Monitoring**: Integrate with monitoring tools (Prometheus, Grafana)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues

**Port already in use**
```bash
# Find and kill process using port
lsof -ti:4000 | xargs kill -9
```

**Database connection issues**
```bash
# Reset database
docker-compose down -v
docker-compose up -d db
docker-compose exec backend npx prisma migrate deploy
```

**Worker not processing jobs**
```bash
# Check Redis connection
docker-compose exec redis redis-cli ping

# Restart worker
docker-compose restart worker
```

**Memory issues**
```bash
# Increase Docker memory limits
# Edit docker-compose.yml worker service resources
```

## ⚙️ Dev Mode Notes

### Auto-Authentication in Development
When `NODE_ENV=development`, authenticated API routes under `/api` enable a development auto-auth middleware. If no `Authorization` header is present, the server will automatically attach an active admin user (or the first active user) to `req.user`. This is intended solely for local development convenience.

- Applies to routes mounted under `/api`
- Disabled automatically in production
- To disable locally, remove the dev auto-auth middleware usage in `server.js` or set `NODE_ENV=production`

### Internal Rate-Limit Bypass
Rate limiters honor an internal API bypass key for trusted automation:
- Set `RATE_LIMIT_BYPASS_KEY` in environment
- Send header `x-internal-api-key: <RATE_LIMIT_BYPASS_KEY>`
- Requests with a valid key skip rate limiting; use sparingly and never expose this header in client code

### Centralized Error Handling
Errors are handled by a centralized middleware that produces consistent JSON responses and structured logs. 404s return a `{ success: false, error: 'Not Found' }` payload, while unhandled errors include a generic message and a correlation-friendly log entry.

### Worker and Combined Start
- `npm run start:all` runs both the API server and worker server with coordinated lifecycles
- `npm run start:worker` runs only the worker server


For more help, check the logs or open an issue in the repository.# webscrapper
