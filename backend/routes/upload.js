
// Upload routes: CSV ingestion and competitor monitoring
// Responsibilities:
// - Accept CSV uploads to create UserProduct records
// - Optionally attach competitor URLs or run auto-discovery
// - Track upload batch counts (processed/success/error) and timestamps
// - Provide batch listing/detail and a CSV template for clients
import express from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../utils/prisma.js';
import AIService from '../services/aiService.js';
import competitorDiscoveryService from '../services/competitorDiscoveryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `upload-${uniqueSuffix}.csv`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Validate CSV headers based on monitoring type
const validateHeaders = (headers, monitoringType = 'basic') => {
  const requiredHeaders = ['title', 'sku'];
  const optionalHeaders = ['brand', 'category', 'description', 'price', 'url'];

  if (monitoringType === 'competitor_urls') {
    optionalHeaders.push('competitor_urls');
  }

  const missingRequired = requiredHeaders.filter(
    header => !headers.some(h => h.toLowerCase().trim() === header.toLowerCase())
  );

  if (missingRequired.length > 0) {
    throw new Error(`Missing required headers: ${missingRequired.join(', ')}`);
  }

  return true;
};

// Parse and validate CSV data
const parseCSVData = (filePath, monitoringType = 'basic') => {
  return new Promise((resolve, reject) => {
    const results = [];
    let headersChecked = false;
    let rowCount = 0;
    const readStream = fs.createReadStream(filePath);

    const parser = csvParser();

    const cleanupAndReject = (err) => {
      try {
        // destroy stream to stop further processing
        readStream.destroy(err);
      } catch (e) { /* ignore */ }
      reject(err);
    };

    readStream
      .pipe(parser)
      .on('headers', (headerList) => {
        // csv-parser emits 'headers'
        try {
          validateHeaders(headerList, monitoringType);
          headersChecked = true;
        } catch (error) {
          cleanupAndReject(error);
        }
      })
      .on('data', (data) => {
        rowCount++;

        // Validate row count limit
        if (rowCount > 500) {
          cleanupAndReject(new Error('CSV file contains more than 500 rows. Maximum allowed is 500.'));
          return;
        }

        // Validate required fields
        if (!data.title || !data.sku) {
          cleanupAndReject(new Error(`Row ${rowCount}: Missing required fields (title, sku)`));
          return;
        }

        // Clean and normalize data
        const cleanedData = {
          title: (data.title || '').trim(),
          sku: (data.sku || '').trim(),
          brand: data.brand ? data.brand.trim() : null,
          category: data.category ? data.category.trim() : null,
          description: data.description ? data.description.trim() : null,
          price: data.price ? (parseFloat(data.price) || null) : null,
          url: data.url ? data.url.trim() : null
        };

        // Add competitor URLs if provided
        if (monitoringType === 'competitor_urls' && data.competitor_urls) {
          const urls = data.competitor_urls
            .split(',')
            .map(url => url.trim())
            .filter(url => url);
          cleanedData.competitor_urls = urls;
        }

        results.push(cleanedData);
      })
      .on('end', () => {
        if (!headersChecked) {
          reject(new Error('CSV headers could not be validated or file has no headers'));
          return;
        }
        if (results.length === 0) {
          reject(new Error('CSV file is empty or contains no valid data'));
          return;
        }
        resolve(results);
      })
      .on('error', (error) => {
        cleanupAndReject(error);
      });
  });
};

// Helper function to handle known competitor URLs
const handleKnownCompetitorUrls = async (userProducts, csvData, batchId) => {
  // aiService may be unused here but kept for parity with your original code
  const aiService = new AIService();

  for (let i = 0; i < userProducts.length; i++) {
    const userProduct = userProducts[i];
    const csvRow = csvData[i];

    if (csvRow && csvRow.competitor_urls && csvRow.competitor_urls.length > 0) {
      console.log(`Processing ${csvRow.competitor_urls.length} competitor URLs for product: ${userProduct.title}`);

      // Create competitor products for each URL
      for (const url of csvRow.competitor_urls) {
        try {
          // Extract product info from competitor URL
          const competitorInfo = await competitorDiscoveryService.extractProductInfo(url);

          if (competitorInfo) {
            await prisma.competitorProduct.create({
              data: {
                title: competitorInfo.title || `Product from ${new URL(url).hostname}`,
                price: competitorInfo.price ?? null,
                url: url,
                imageUrl: competitorInfo.imageUrl ?? null,
                description: competitorInfo.description ?? null,
                brand: competitorInfo.brand ?? null,
                category: competitorInfo.category ?? null,
                userProductId: userProduct.id,
                source: 'MANUAL_URL',
                confidence: 0.9, // High confidence for manually provided URLs
                status: 'ACTIVE'
              }
            });
          }
        } catch (error) {
          console.error(`Error processing competitor URL ${url}:`, error?.message || error);
          // Continue with next URL even if one fails
        }
      }
    }
  }
};

// Helper function to handle auto-discovery
const handleAutoDiscovery = async (userProducts, batchId) => {
  console.log(`Starting auto-discovery for ${userProducts.length} products`);

  // Process in batches to avoid overwhelming the system
  const batchSize = 5;
  for (let i = 0; i < userProducts.length; i += batchSize) {
    const batch = userProducts.slice(i, i + batchSize);

    await Promise.all(batch.map(async (userProduct) => {
      try {
        console.log(`Auto-discovering competitors for: ${userProduct.title}`);

        const competitors = await competitorDiscoveryService.discoverCompetitors(userProduct, {
          maxResults: 10,
          minConfidence: 0.3
        });

        // Create competitor product records
        for (const competitor of competitors) {
          try {
            await prisma.competitorProduct.create({
              data: {
                title: competitor.title,
                price: competitor.price ?? null,
                url: competitor.url,
                imageUrl: competitor.imageUrl ?? null,
                description: competitor.description ?? null,
                brand: competitor.brand ?? null,
                category: competitor.category ?? null,
                userProductId: userProduct.id,
                source: 'AUTO_DISCOVERY',
                confidence: competitor.confidence ?? 0,
                status: 'ACTIVE'
              }
            });
          } catch (err) {
            console.error('Error creating competitorProduct record:', err?.message || err);
          }
        }

        console.log(`Found ${competitors.length} competitors for ${userProduct.title}`);
      } catch (error) {
        console.error(`Error in auto-discovery for product ${userProduct.title}:`, error?.message || error);
        // Continue with next product even if one fails
      }
    }));

    // Add delay between batches to be respectful to search engines
    if (i + batchSize < userProducts.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

// POST /api/upload - Upload CSV file
router.post('/', upload.single('csvFile'), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    const filePath = req.file.path;
    const monitoringType = req.body.monitoringType || 'basic'; // 'basic', 'competitor_urls', 'auto_discovery'

    try {
      // Parse and validate CSV data
      const csvData = await parseCSVData(filePath, monitoringType);

      // Create upload batch record
      const uploadBatch = await prisma.uploadBatch.create({
        data: {
          userId,
          filename: req.file.originalname,
          totalRows: csvData.length,
          status: 'processing',
          uploadType: monitoringType === 'basic' ? 'manual' : monitoringType
        }
      });

      // Create user products from CSV data
      const userProducts = [];
      let successCount = 0;
      let errorCount = 0;
      for (const product of csvData) {
        try {
          const created = await prisma.userProduct.create({
            data: {
              userId,
              title: product.title,
              sku: product.sku,
              brand: product.brand,
              category: product.category,
              description: product.description,
              // Fields 'price', 'url', and 'status' are not part of UserProduct schema
            }
          });
          userProducts.push(created);
          successCount++;
        } catch (err) {
          console.error('Error creating userProduct:', err?.message || err);
          errorCount++;
        }
      }

      // Handle competitor monitoring based on type
      if (monitoringType === 'competitor_urls') {
        await handleKnownCompetitorUrls(userProducts, csvData, uploadBatch.id);
      } else if (monitoringType === 'auto_discovery') {
        await handleAutoDiscovery(userProducts, uploadBatch.id);
      }

      // Update batch status with counts
      try {
        await prisma.uploadBatch.update({
          where: { id: uploadBatch.id },
          data: {
            status: 'completed',
            processedRows: successCount + errorCount,
            successRows: successCount,
            errorRows: errorCount,
            completedAt: new Date()
          }
        });
      } catch (err) {
        console.error('Error updating uploadBatch status:', err?.message || err);
      }

      // Clean up uploaded file
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Error deleting uploaded file:', err?.message || err);
      }

      res.json({
        success: true,
        data: {
          batchId: uploadBatch.id,
          totalProducts: userProducts.length,
          products: userProducts,
          monitoringType,
          competitorMonitoringEnabled: monitoringType !== 'basic',
          counts: {
            processed: successCount + errorCount,
            success: successCount,
            errors: errorCount,
          }
        },
        message: `Processed ${successCount + errorCount} rows: ${successCount} successes, ${errorCount} errors${monitoringType !== 'basic' ? ' with competitor monitoring' : ''}`
      });

    } catch (parseError) {
      // Clean up uploaded file on error
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) { /* ignore */ }

      console.error('CSV parse error:', parseError?.message || parseError);
      return res.status(400).json({
        success: false,
        error: parseError.message || 'Failed to parse CSV'
      });
    }

  } catch (error) {
    console.error('Upload error:', error?.message || error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// GET /api/upload/batches - Get all upload batches
router.get('/batches', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const batches = await prisma.uploadBatch.findMany({
      where: { userId },
      orderBy: {
        uploadedAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: batches
    });
  } catch (error) {
    console.error('Error fetching batches:', error?.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload batches'
    });
  }
});

// GET /api/upload/batches/:id - Get specific batch details
router.get('/batches/:id', async (req, res) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(idParam, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid batch id' });
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const batch = await prisma.uploadBatch.findUnique({
      where: { id }
    });

    if (!batch || batch.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Upload batch not found'
      });
    }

    res.json({
      success: true,
      data: batch
    });
  } catch (error) {
    console.error('Error fetching batch:', error?.message || error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch details'
    });
  }
});

// GET /api/upload/template - Download CSV template
router.get('/template', (req, res) => {
  const monitoringType = req.query.type || 'basic';

  let templateData;
  if (monitoringType === 'competitor_urls') {
    templateData = [
      'title,sku,brand,category,description,price,url,competitor_urls',
      'Sample Product Title,SKU123,Sample Brand,Electronics,Product description here,99.99,https://example.com/product,"https://competitor1.com/product,https://competitor2.com/product"',
      'Another Product,SKU456,Another Brand,Clothing,Another description,49.99,https://example.com/product2,"https://competitor3.com/product"'
    ].join('\n');
  } else {
    templateData = [
      'title,sku,brand,category,description,price,url',
      'Sample Product Title,SKU123,Sample Brand,Electronics,Product description here,99.99,https://example.com/product',
      'Another Product,SKU456,Another Brand,Clothing,Another description,49.99,https://example.com/product2'
    ].join('\n');
  }

  const filename = monitoringType === 'competitor_urls'
    ? 'product_upload_with_competitors_template.csv'
    : 'product_upload_template.csv';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(templateData);
});

export default router;
