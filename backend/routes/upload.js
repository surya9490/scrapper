import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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

// Validate CSV headers
const validateHeaders = (headers) => {
  const requiredHeaders = ['title', 'sku'];
  const optionalHeaders = ['brand', 'category', 'description', 'price', 'url'];
  
  const missingRequired = requiredHeaders.filter(header => 
    !headers.some(h => h.toLowerCase().trim() === header.toLowerCase())
  );
  
  if (missingRequired.length > 0) {
    throw new Error(`Missing required headers: ${missingRequired.join(', ')}`);
  }
  
  return true;
};

// Parse and validate CSV data
const parseCSVData = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    let headers = [];
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headerList) => {
        headers = headerList;
        try {
          validateHeaders(headers);
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
    
    try {
      // Parse and validate CSV data
      const csvData = await parseCSVData(filePath);
      
      // Create upload batch record
      const uploadBatch = await prisma.uploadBatch.create({
        data: {
          filename: req.file.originalname,
          totalProducts: csvData.length,
          status: 'PROCESSING'
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

      // Update batch status
      await prisma.uploadBatch.update({
        where: { id: uploadBatch.id },
        data: {
          status: 'COMPLETED',
          processedProducts: userProducts.length
        }
      });

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        data: {
          batchId: uploadBatch.id,
          totalProducts: userProducts.length,
          products: userProducts
        },
        message: `Successfully uploaded ${userProducts.length} products`
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
  const templateData = [
    'title,sku,brand,category,description,price,url',
    'Sample Product Title,SKU123,Sample Brand,Electronics,Product description here,99.99,https://example.com/product',
    'Another Product,SKU456,Another Brand,Clothing,Another description,49.99,https://example.com/product2'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="product_upload_template.csv"');
  res.send(templateData);
});

export default router;