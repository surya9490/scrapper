import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import AIService from '../services/aiService.js';
import competitorDiscoveryService from '../services/competitorDiscoveryService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `upload-${uniqueSuffix}.csv`);
  }
});

const upload = multer({
  storage: storage,
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
  
  // For competitor monitoring, add competitor_urls as optional
  if (monitoringType === 'competitor_urls') {
    optionalHeaders.push('competitor_urls');
  }
  
  const missingRequired = requiredHeaders.filter(header => 
    !headers.some(h => h.toLowerCase().trim() === header.toLowerCase())
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
    let headers = [];
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headerList) => {
        headers = headerList;
        try {
          validateHeaders(headers, monitoringType);
        } catch (error) {
          reject(error);
          return;
        }
      })
      .on('data', (data) => {
        rowCount++;
        
        // Validate row count limit
        if (rowCount > 500) {
          reject(new Error('CSV file contains more than 500 rows. Maximum allowed is 500.'));
          return;
        }
        
        // Validate required fields
        if (!data.title || !data.sku) {
          reject(new Error(`Row ${rowCount}: Missing required fields (title, sku)`));
          return;
        }
        
        // Clean and normalize data
        const cleanedData = {
          title: data.title.trim(),
          sku: data.sku.trim(),
          brand: data.brand ? data.brand.trim() : null,
          category: data.category ? data.category.trim() : null,
          description: data.description ? data.description.trim() : null,
          price: data.price ? parseFloat(data.price) || null : null,
          url: data.url ? data.url.trim() : null
        };
        
        // Add competitor URLs if provided
        if (monitoringType === 'competitor_urls' && data.competitor_urls) {
          const urls = data.competitor_urls.split(',').map(url => url.trim()).filter(url => url);
          cleanedData.competitor_urls = urls;
        }
        
        results.push(cleanedData);
      })
      .on('end', () => {
        if (results.length === 0) {
          reject(new Error('CSV file is empty or contains no valid data'));
          return;
        }
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Helper function to handle known competitor URLs
const handleKnownCompetitorUrls = async (userProducts, csvData, batchId) => {
  const aiService = new AIService();
  
  for (let i = 0; i < userProducts.length; i++) {
    const userProduct = userProducts[i];
    const csvRow = csvData[i];
    
    if (csvRow.competitor_urls && csvRow.competitor_urls.length > 0) {
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
                price: competitorInfo.price,
                url: url,
                imageUrl: competitorInfo.imageUrl,
                description: competitorInfo.description,
                brand: competitorInfo.brand,
                category: competitorInfo.category,
                userProductId: userProduct.id,
                source: 'MANUAL_URL',
                confidence: 0.9, // High confidence for manually provided URLs
                status: 'ACTIVE'
              }
            });
          }
        } catch (error) {
          console.error(`Error processing competitor URL ${url}:`, error.message);
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
          await prisma.competitorProduct.create({
            data: {
              title: competitor.title,
              price: competitor.price,
              url: competitor.url,
              imageUrl: competitor.imageUrl,
              description: competitor.description,
              brand: competitor.brand,
              category: competitor.category,
              userProductId: userProduct.id,
              source: 'AUTO_DISCOVERY',
              confidence: competitor.confidence,
              status: 'ACTIVE'
            }
          });
        }
        
        console.log(`Found ${competitors.length} competitors for ${userProduct.title}`);
      } catch (error) {
        console.error(`Error in auto-discovery for product ${userProduct.title}:`, error.message);
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
          filename: req.file.originalname,
          totalRows: csvData.length,
          status: 'processing',
          uploadType: monitoringType === 'basic' ? 'manual' : monitoringType
        }
      });

      // Create user products from CSV data
      const userProducts = await Promise.all(
        csvData.map(async (product) => {
          return prisma.userProduct.create({
            data: {
              title: product.title,
              sku: product.sku,
              brand: product.brand,
              category: product.category,
              description: product.description,
              price: product.price,
              url: product.url,
              uploadBatchId: uploadBatch.id,
              status: 'PENDING'
            }
          });
        })
      );

      // Handle competitor monitoring based on type
      if (monitoringType === 'competitor_urls') {
        await handleKnownCompetitorUrls(userProducts, csvData, uploadBatch.id);
      } else if (monitoringType === 'auto_discovery') {
        await handleAutoDiscovery(userProducts, uploadBatch.id);
      }

      // Update batch status
      await prisma.uploadBatch.update({
        where: { id: uploadBatch.id },
        data: {
          status: 'completed',
          processedRows: userProducts.length,
          successRows: userProducts.length
        }
      });

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        data: {
          batchId: uploadBatch.id,
          totalProducts: userProducts.length,
          products: userProducts,
          monitoringType: monitoringType,
          competitorMonitoringEnabled: monitoringType !== 'basic'
        },
        message: `Successfully uploaded ${userProducts.length} products${monitoringType !== 'basic' ? ' with competitor monitoring' : ''}`
      });

    } catch (parseError) {
      // Clean up uploaded file on error
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      throw parseError;
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/upload/batches - Get all upload batches
router.get('/batches', async (req, res) => {
  try {
    const batches = await prisma.uploadBatch.findMany({
      orderBy: {
        uploadedAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: batches
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upload batches'
    });
  }
});

// GET /api/upload/batches/:id - Get specific batch details
router.get('/batches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: parseInt(id) },
      include: {
        userProducts: true
      }
    });

    if (!batch) {
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
    console.error('Error fetching batch:', error);
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