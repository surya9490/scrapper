
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
import ScrapingService from '../services/scrapingService.js';
import MatchingService from '../services/matchingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const aiService = new AIService();

// Save competitor product and mapping, return saved records
const saveCompetitorProductAndMapping = async ({ userId, userProductId, scrapedProduct, matchScoreObj, domain }) => {
  const resolvedUrl = scrapedProduct?.sourceUrl || scrapedProduct?.url;
  const competitorDomain = (domain || (resolvedUrl ? new URL(resolvedUrl).hostname : '')).replace(/^www\./, '');
  const title = scrapedProduct?.title || (competitorDomain ? `Product from ${competitorDomain}` : 'Unknown Product');
  try {
    const competitorProduct = await prisma.competitorProduct.create({
      data: {
        userId,
        title,
        url: resolvedUrl,
        price: scrapedProduct?.price ?? null,
        image: scrapedProduct?.image ?? null,
        brand: scrapedProduct?.brand ?? null,
        category: scrapedProduct?.category ?? null,
        threadCount: scrapedProduct?.threadCount ?? null,
        material: scrapedProduct?.material ?? null,
        size: scrapedProduct?.size ?? null,
        design: scrapedProduct?.design ?? null,
        color: scrapedProduct?.color ?? null,
        competitorDomain,
        competitorName: null,
        lastScrapedAt: new Date()
      }
    });

    const mapping = await prisma.productMapping.create({
      data: {
        userId,
        userProductId,
        competitorProductId: competitorProduct.id,
        matchingScore: matchScoreObj?.totalScore ?? 0,
        matchingAlgorithm: 'composite_similarity',
        matchingDetails: JSON.stringify(matchScoreObj || {}),
        status: 'pending'
      }
    });

    return { competitorProduct, mapping };
  } catch (err) {
    console.error('Error saving competitor product/mapping:', err?.message || err);
    throw err;
  }
};

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
  const requiredHeaders = ['title'];
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
        if (!data.title) {
          cleanupAndReject(new Error(`Row ${rowCount}: Missing required field (title)`));
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

// Helper: known competitor URLs with scraping + matching
const handleKnownCompetitorUrls = async (userProducts, csvData, batchId) => {
  const scrapingService = new ScrapingService();
  const matchingService = new MatchingService();
  const enriched = [];

  for (let i = 0; i < userProducts.length; i++) {
    const userProduct = userProducts[i];
    const csvRow = csvData[i];

    if (csvRow && csvRow.competitor_urls && csvRow.competitor_urls.length > 0) {
      console.log(`Processing ${csvRow.competitor_urls.length} competitor URLs for product: ${userProduct.title}`);

      // Generate keywords; fallback to title
      let keywords = [];
      try {
        keywords = await aiService.generateSearchKeywords(userProduct);
      } catch (e) {
        keywords = [userProduct.title];
      }

      for (const providedUrl of csvRow.competitor_urls) {
        try {
          const domain = new URL(providedUrl).hostname.replace(/^www\./, '');

          // Search site using keywords, include provided URL as candidate
          const searchLinks = await scrapingService.searchCompetitorSite(domain, keywords, userProduct.title);
          const candidateUrls = [providedUrl, ...searchLinks.map(r => r.url)]
            .filter(Boolean)
            .slice(0, 6);

          // Scrape candidates immediately
          const scraped = await scrapingService.batchScrapeProducts(candidateUrls, { useBatching: false, concurrency: 2 });
          const scrapedResults = Array.isArray(scraped?.results) ? scraped.results : [];
          if (scrapedResults.length === 0) {
            console.warn(`No scraped results for ${providedUrl}`);
            continue;
          }

          // Match best competitor product
          const matches = await matchingService.findProductMatches(userProduct.id, scrapedResults, { threshold: 0.4 });
          const bestMatch = matches.sort((a, b) => (b.matchScore.totalScore - a.matchScore.totalScore))[0];

          const chosen = bestMatch?.competitorProduct || scrapedResults[0];
          const matchScoreObj = bestMatch?.matchScore || { totalScore: 0 };

          // Save competitor product + mapping
          const { competitorProduct, mapping } = await saveCompetitorProductAndMapping({
            userId: userProduct.userId,
            userProductId: userProduct.id,
            scrapedProduct: chosen,
            matchScoreObj,
            domain
          });

          // Collect enriched summary for response
          enriched.push({
            userProductId: userProduct.id,
            userProductTitle: userProduct.title,
            competitorUrlProvided: providedUrl,
            keywords,
            selectedCompetitorProduct: {
              id: competitorProduct.id,
              title: competitorProduct.title,
              url: competitorProduct.url,
              price: competitorProduct.price,
              image: competitorProduct.image,
              competitorDomain: competitorProduct.competitorDomain
            },
            match: {
              mappingId: mapping.id,
              score: matchScoreObj.totalScore || 0,
              details: matchScoreObj
            }
          });
        } catch (error) {
          console.error(`Error processing competitor URL ${providedUrl}:`, error?.message || error);
        }
      }
    }
  }

  return enriched;
};

// Helper: auto-discovery with scraping + matching
const handleAutoDiscovery = async (userProducts, batchId) => {
  console.log(`Starting auto-discovery for ${userProducts.length} products`);
  const scrapingService = new ScrapingService();
  const matchingService = new MatchingService();
  const enriched = [];

  const batchSize = 5;
  for (let i = 0; i < userProducts.length; i += batchSize) {
    const batch = userProducts.slice(i, i + batchSize);

    await Promise.all(batch.map(async (userProduct) => {
      try {
        console.log(`Auto-discovering competitors for: ${userProduct.title}`);

        // Generate keywords; fallback to title
        let keywords = [];
        try {
          keywords = await aiService.generateSearchKeywords(userProduct);
        } catch (e) {
          keywords = [userProduct.title];
        }

        const competitors = await competitorDiscoveryService.discoverCompetitors(userProduct, {
          maxResults: 10,
          minConfidence: 0.3
        });

        for (const comp of competitors.slice(0, 5)) {
          try {
            const domain = (comp.domain || new URL(comp.url).hostname).replace(/^www\./, '');
            const searchLinks = await scrapingService.searchCompetitorSite(domain, keywords, userProduct.title);
            const candidateUrls = [comp.url, ...searchLinks.map(r => r.url)]
              .filter(Boolean)
              .slice(0, 6);

            const scraped = await scrapingService.batchScrapeProducts(candidateUrls, { useBatching: false, concurrency: 2 });
            const scrapedResults = Array.isArray(scraped?.results) ? scraped.results : [];
            if (scrapedResults.length === 0) continue;

            const matches = await matchingService.findProductMatches(userProduct.id, scrapedResults, { threshold: 0.4 });
            const bestMatch = matches.sort((a, b) => (b.matchScore.totalScore - a.matchScore.totalScore))[0];
            const chosen = bestMatch?.competitorProduct || scrapedResults[0];
            const matchScoreObj = bestMatch?.matchScore || { totalScore: 0 };

            const { competitorProduct, mapping } = await saveCompetitorProductAndMapping({
              userId: userProduct.userId,
              userProductId: userProduct.id,
              scrapedProduct: chosen,
              matchScoreObj,
              domain
            });

            enriched.push({
              userProductId: userProduct.id,
              userProductTitle: userProduct.title,
              discoveredFrom: comp.source || comp.searchEngine || 'search',
              competitorCandidateUrl: comp.url,
              keywords,
              selectedCompetitorProduct: {
                id: competitorProduct.id,
                title: competitorProduct.title,
                url: competitorProduct.url,
                price: competitorProduct.price,
                image: competitorProduct.image,
                competitorDomain: competitorProduct.competitorDomain
              },
              match: {
                mappingId: mapping.id,
                score: matchScoreObj.totalScore || 0,
                details: matchScoreObj
              }
            });
          } catch (err) {
            console.error('Auto-discovery candidate processing error:', err?.message || err);
          }
        }

        console.log(`Processed ${Math.min(5, competitors.length)} competitors for ${userProduct.title}`);
      } catch (error) {
        console.error(`Error in auto-discovery for product ${userProduct.title}:`, error?.message || error);
      }
    }));

    if (i + batchSize < userProducts.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return enriched;
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

      // Handle competitor monitoring based on type; collect enriched results
      let enrichedResults = [];
      if (monitoringType === 'competitor_urls') {
        enrichedResults = await handleKnownCompetitorUrls(userProducts, csvData, uploadBatch.id);
      } else if (monitoringType === 'auto_discovery') {
        enrichedResults = await handleAutoDiscovery(userProducts, uploadBatch.id);
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
          enrichedResults,
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
