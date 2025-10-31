# AI-Powered Product & Price Mapping Tool - API Documentation

## Overview
This API provides comprehensive functionality for D2C brands to automatically discover, map, and monitor competitor products and pricing.

## Base URL
```
http://localhost:4000/api
```

## Authentication
Most endpoints require Shopify OAuth authentication. Include the shop domain and access token in headers where required.

---

## 1. Upload Endpoints

### Upload CSV
Upload product SKUs for mapping (max 500 SKUs)

**POST** `/upload/csv`

**Headers:**
```
Content-Type: multipart/form-data
```

**Body:**
- `file`: CSV file with columns: `title`, `sku`, `brand`, `category`, `price`, `description`

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "uuid",
    "totalProducts": 150,
    "validProducts": 148,
    "errors": [
      {
        "row": 5,
        "error": "Missing required field: title"
      }
    ]
  }
}
```

### Get Upload Batches
**GET** `/upload/batches`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

### Download CSV Template
**GET** `/upload/template`

Returns a CSV template file for uploads.

---

## 2. Dashboard Endpoints

### Get Overview Statistics
**GET** `/dashboard/overview`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 500,
    "mappedProducts": 320,
    "pendingMappings": 45,
    "monitoredProducts": 280,
    "recentPriceChanges": 12
  }
}
```

### List User Products
**GET** `/dashboard/products`

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `status`: Filter by mapping status (`MAPPED`, `UNMAPPED`, `PENDING`)
- `search`: Search by title or SKU

### Get Product Mappings
**GET** `/dashboard/mappings/:userProductId`

Returns all competitor mappings for a user product.

### Find New Matches
**POST** `/dashboard/products/:userProductId/find-matches`

Triggers AI-powered search for new competitor matches.

**Body:**
```json
{
  "domains": ["competitor1.com", "competitor2.com"],
  "maxResults": 10
}
```

### Approve/Reject Mappings
**POST** `/dashboard/mappings/:mappingId/approve`
**POST** `/dashboard/mappings/:mappingId/reject`

**Body:**
```json
{
  "reason": "Good match based on attributes"
}
```

### Delete Mapping
**DELETE** `/dashboard/mappings/:mappingId`

---

## 3. Price Monitoring Endpoints

### Get Monitoring Status
**GET** `/price-monitoring/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalMonitored": 280,
    "activeJobs": 15,
    "lastUpdate": "2024-10-30T10:30:00Z",
    "queueStatus": {
      "waiting": 5,
      "active": 2,
      "completed": 1250,
      "failed": 3
    }
  }
}
```

### Schedule Price Monitoring
**POST** `/price-monitoring/schedule`

**Body:**
```json
{
  "mappingIds": [1, 2, 3],
  "schedule": "daily"
}
```

**Schedule Options:** `hourly`, `daily`, `weekly`, `monthly`

### Stop Price Monitoring
**POST** `/price-monitoring/stop`

**Body:**
```json
{
  "mappingIds": [1, 2, 3]
}
```

### Manual Price Check
**POST** `/price-monitoring/monitor-now`

**Body:**
```json
{
  "competitorProductIds": [10, 11, 12]
}
```

### Get Price Trends
**GET** `/price-monitoring/trends/:competitorProductId`

**Query Parameters:**
- `days`: Number of days to analyze (default: 30)

### Get Price Alerts
**GET** `/price-monitoring/alerts`

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `days`: Days to look back (default: 7)

### Get Price History
**GET** `/price-monitoring/history`

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page
- `competitorProductId`: Filter by product
- `days`: Days to look back
- `sortBy`: Sort field
- `sortOrder`: `asc` or `desc`

---

## 4. Shopify Integration Endpoints

### Initiate OAuth
**GET** `/shopify/auth`

**Query Parameters:**
- `shop`: Shopify shop domain (e.g., `mystore.myshopify.com`)

Redirects to Shopify OAuth consent screen.

### OAuth Callback
**GET** `/shopify/callback`

Handles Shopify OAuth callback and stores access token.

### Get Store Status
**GET** `/shopify/status/:shop`

Returns connection status and store information.

### Fetch Shopify Products
**GET** `/shopify/products/:shop`

**Query Parameters:**
- `limit`: Number of products to fetch
- `page_info`: Pagination cursor

### Sync Competitor Prices
**POST** `/shopify/sync-prices`

**Body:**
```json
{
  "shop": "mystore.myshopify.com",
  "mappingIds": [1, 2, 3],
  "strategy": "MATCH_LOWEST",
  "margin": 0.1
}
```

**Pricing Strategies:**
- `MATCH_LOWEST`: Match the lowest competitor price
- `UNDERCUT_BY_PERCENT`: Undercut by specified percentage
- `UNDERCUT_BY_AMOUNT`: Undercut by fixed amount
- `PREMIUM_PRICING`: Price above competitors

### Update Single Product Price
**POST** `/shopify/update-price`

**Body:**
```json
{
  "shop": "mystore.myshopify.com",
  "productId": "gid://shopify/Product/123",
  "variantId": "gid://shopify/ProductVariant/456",
  "price": "29.99"
}
```

### Get Sync History
**GET** `/shopify/sync-history`

**Query Parameters:**
- `shop`: Shop domain
- `page`: Page number
- `limit`: Items per page

### Disconnect Store
**POST** `/shopify/disconnect`

**Body:**
```json
{
  "shop": "mystore.myshopify.com"
}
```

---

## 5. Scraping Endpoints (Existing)

### Scrape Product
**POST** `/scrape`

**Body:**
```json
{
  "url": "https://competitor.com/product/123"
}
```

### Get Scraped Products
**GET** `/scrape`

### Get Product by ID
**GET** `/scrape/:id`

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message",
  "details": {
    "code": "ERROR_CODE",
    "field": "fieldName"
  }
}
```

**Common HTTP Status Codes:**
- `400`: Bad Request - Invalid input data
- `401`: Unauthorized - Missing or invalid authentication
- `404`: Not Found - Resource doesn't exist
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server-side error

---

## Rate Limits

- Upload endpoints: 10 requests per minute
- Scraping endpoints: 60 requests per minute
- Dashboard endpoints: 100 requests per minute
- Shopify endpoints: 40 requests per minute (Shopify API limits)

---

## Webhooks

### Shopify Webhooks
**POST** `/shopify/webhook`

Handles Shopify webhooks for:
- Product updates
- Order creation
- App uninstallation

---

## Testing

### Health Check
**GET** `/health`

Returns server status and available features.

### Example cURL Commands

```bash
# Upload CSV
curl -X POST http://localhost:4000/api/upload/csv \
  -F "file=@products.csv"

# Get overview
curl -X GET http://localhost:4000/api/dashboard/overview

# Schedule price monitoring
curl -X POST http://localhost:4000/api/price-monitoring/schedule \
  -H "Content-Type: application/json" \
  -d '{"mappingIds": [1,2,3], "schedule": "daily"}'

# Initiate Shopify OAuth
curl -X GET "http://localhost:4000/api/shopify/auth?shop=mystore.myshopify.com"
```

---

## Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/productdb

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-...

# Shopify App
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=read_products,write_products,read_orders

# Server
PORT=4000
NODE_ENV=development
```

---

## Data Models

### UserProduct
- User's product from CSV upload
- Fields: title, sku, brand, category, price, description

### CompetitorProduct
- Scraped competitor product
- Fields: title, url, price, image, domain, attributes

### ProductMapping
- Links UserProduct to CompetitorProduct
- Fields: confidence score, status, monitoring settings

### PriceHistory
- Historical price data
- Fields: price, previous price, change amount/percentage

### ShopifyStore
- Connected Shopify store information
- Fields: shop domain, access token, installation date