import { getPrismaClient } from './utils/prisma.js';

const prisma = getPrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database for scraped products...\n');
    
    // Get all competitor products (scraped products)
    const products = await prisma.competitorProduct.findMany({
      include: {
        user: {
          select: {
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📊 Total scraped products: ${products.length}\n`);
    
    if (products.length > 0) {
      console.log('📋 Recent scraped products:');
      products.slice(0, 10).forEach((product, index) => {
        console.log(`${index + 1}. ${product.title || 'No title'}`);
        console.log(`   URL: ${product.url}`);
        console.log(`   Price: ${product.price || 'No price'}`);
        console.log(`   User: ${product.user?.email || 'Unknown'}`);
        console.log(`   Created: ${product.createdAt}`);
        console.log('');
      });
    }
    
    // Check for recent scraping activities (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentProducts = await prisma.competitorProduct.findMany({
      where: {
        createdAt: {
          gte: yesterday
        }
      }
    });
    
    console.log(`🕒 Products scraped in last 24 hours: ${recentProducts.length}`);
    
    // Check scraping jobs
    console.log('\n🔧 Checking scraping jobs...');
    
    // Note: We can't directly query BullMQ jobs from Prisma, but we can check if there are any related records
    console.log('✅ Database connection successful');
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();