#!/bin/bash

# Test script to verify scraping functionality
echo "🧪 Testing scraping functionality..."

# Login and get JWT token
echo "📝 Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@scrapper.dev", "password": "admin123"}')

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get authentication token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Successfully authenticated"

# Test scraping a simple product URL
echo "🔍 Testing scraping with a simple product URL..."
SCRAPE_RESPONSE=$(curl -s -X POST http://localhost:4000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url": "https://example.com/product/test-item"}')

echo "📊 Scrape Response:"
echo $SCRAPE_RESPONSE | jq '.' 2>/dev/null || echo $SCRAPE_RESPONSE

# Check queue status
echo ""
echo "📋 Checking queue status..."
QUEUE_STATUS=$(curl -s -X GET http://localhost:4000/api/queue/status \
  -H "Authorization: Bearer $TOKEN")

echo "Queue Status:"
echo $QUEUE_STATUS | jq '.' 2>/dev/null || echo $QUEUE_STATUS

echo ""
echo "✅ Test completed!"