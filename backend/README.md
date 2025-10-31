# AI Product & Price Mapping Tool - Backend

A scalable backend service for scraping and monitoring product prices across e-commerce websites. Built with Node.js, Playwright, PostgreSQL, Redis, and Docker.

## 🚀 Features

- **Web Scraping**: Automated product data extraction using Playwright
- **Price Monitoring**: Scheduled price checking with configurable intervals
- **Queue Management**: BullMQ-powered job queue for handling bulk operations
- **Scalable Architecture**: Docker-based microservices with worker processes
- **Database Management**: PostgreSQL with Prisma ORM
- **Caching & Jobs**: Redis for job queues and caching
- **Health Monitoring**: Built-in health checks and monitoring endpoints

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

- Docker & Docker Compose
- Node.js 18+ (for local development)
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

### 3. Start with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Start with development tools (pgAdmin, Redis Commander)
docker-compose --profile dev up -d
```

### 4. Initialize Database

```bash
# Run database migrations
docker-compose exec backend npx prisma migrate deploy

# (Optional) Generate Prisma client
docker-compose exec backend npx prisma generate
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@db:5432/productdb` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `MAX_CONCURRENCY` | Maximum concurrent scrapers | `5` |
| `WORKER_CONCURRENCY` | Worker process concurrency | `3` |
| `PRICE_CHECK_CRON` | Price check schedule | `0 */6 * * *` (every 6 hours) |

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

## 🐳 Docker Commands

### Basic Operations
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart [service-name]

# Scale workers
docker-compose up -d --scale worker=3
```

### Development
```bash
# Start with development tools
docker-compose --profile dev up -d

# Execute commands in containers
docker-compose exec backend npm install
docker-compose exec backend npx prisma studio

# Access database
docker-compose exec db psql -U postgres -d productdb
```

### Maintenance
```bash
# Remove all containers and volumes
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# View resource usage
docker-compose top
```

## 🔍 Monitoring & Debugging

### Access Development Tools

- **pgAdmin**: http://localhost:8080 (admin@example.com / admin)
- **Redis Commander**: http://localhost:8081
- **API Health**: http://localhost:4000/health

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

For more help, check the logs or open an issue in the repository.# webscrapper
