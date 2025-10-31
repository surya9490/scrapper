import OpenAI from 'openai/index.mjs';

class AIService {
  constructor() {
    // Only initialize OpenAI if API key is provided
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      console.warn('OpenAI API key not provided. AI features will be disabled.');
      this.openai = null;
    }
  }

  // Extract product attributes from title and description
  async extractAttributes(title, description = '') {
    if (!this.openai) {
      console.warn('OpenAI not initialized. Returning mock attributes.');
      return {
        brand: 'Unknown',
        category: 'General',
        attributes: {},
        confidence: 0.1
      };
    }

    try {
      const prompt = `
        Extract product attributes from the following product information:
        
        Title: ${title}
        Description: ${description}
        
        Please extract and return a JSON object with the following attributes (set to null if not found):
        - material: The primary material (e.g., "Cotton", "Polyester", "Stainless Steel")
        - size: Size information (e.g., "Large", "XL", "12 inches", "500ml")
        - color: Primary color (e.g., "Blue", "Red", "Black")
        - brand: Brand name if mentioned
        - category: Product category (e.g., "Clothing", "Electronics", "Home & Garden")
        - threadCount: Thread count for textiles (number only)
        - design: Design pattern or style (e.g., "Striped", "Floral", "Minimalist")
        - weight: Product weight if mentioned
        - dimensions: Product dimensions if mentioned
        - features: Array of key features or selling points
        
        Return only valid JSON, no additional text.
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a product data extraction expert. Extract attributes accurately and return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const extractedData = JSON.parse(response.choices[0].message.content);
      
      // Clean and validate extracted data
      return {
        material: extractedData.material || null,
        size: extractedData.size || null,
        color: extractedData.color || null,
        brand: extractedData.brand || null,
        category: extractedData.category || null,
        threadCount: extractedData.threadCount ? parseInt(extractedData.threadCount) : null,
        design: extractedData.design || null,
        weight: extractedData.weight || null,
        dimensions: extractedData.dimensions || null,
        features: Array.isArray(extractedData.features) ? extractedData.features : []
      };

    } catch (error) {
      console.error('Error extracting attributes:', error);
      return {
        material: null,
        size: null,
        color: null,
        brand: null,
        category: null,
        threadCount: null,
        design: null,
        weight: null,
        dimensions: null,
        features: []
      };
    }
  }

  // Generate product embeddings for similarity matching
  async generateEmbedding(text) {
    if (!this.openai) {
      console.warn('OpenAI not initialized. Returning mock embedding.');
      // Return a mock embedding vector of 1536 dimensions (OpenAI's embedding size)
      return new Array(1536).fill(0).map(() => Math.random() * 0.1);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  // Calculate text similarity between two products
  async calculateProductSimilarity(product1, product2) {
    if (!this.openai) {
      console.warn('OpenAI not initialized. Returning mock similarity score.');
      return Math.random() * 0.3; // Low random similarity
    }

    try {
      // Combine title and key attributes for comparison
      const text1 = `${product1.title} ${product1.brand || ''} ${product1.category || ''} ${product1.material || ''} ${product1.size || ''}`.trim();
      const text2 = `${product2.title} ${product2.brand || ''} ${product2.category || ''} ${product2.material || ''} ${product2.size || ''}`.trim();

      const [embedding1, embedding2] = await Promise.all([
        this.generateEmbedding(text1),
        this.generateEmbedding(text2)
      ]);

      if (!embedding1 || !embedding2) {
        return 0;
      }

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(embedding1, embedding2);
      return similarity;

    } catch (error) {
      console.error('Error calculating similarity:', error);
      return 0;
    }
  }

  // Helper function to calculate cosine similarity
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Analyze competitor product and suggest matches
  async analyzeCompetitorProduct(competitorProduct, userProducts) {
    if (!this.openai) {
      console.warn('OpenAI not initialized. Returning mock analysis.');
      return {
        suggestedMatches: [],
        confidence: 0.1,
        reasoning: 'AI analysis unavailable - OpenAI API key not configured'
      };
    }

    try {
      const matches = [];

      for (const userProduct of userProducts) {
        const similarity = await this.calculateProductSimilarity(
          competitorProduct,
          userProduct
        );

        if (similarity > 0.7) { // Threshold for potential matches
          matches.push({
            userProduct,
            similarity,
            confidence: this.calculateConfidence(similarity, competitorProduct, userProduct)
          });
        }
      }

      // Sort by similarity score
      matches.sort((a, b) => b.similarity - a.similarity);
      
      return matches.slice(0, 5); // Return top 5 matches

    } catch (error) {
      console.error('Error analyzing competitor product:', error);
      return [];
    }
  }

  // Calculate confidence score based on multiple factors
  calculateConfidence(similarity, competitorProduct, userProduct) {
    let confidence = similarity * 100;

    // Boost confidence for exact brand matches
    if (competitorProduct.brand && userProduct.brand && 
        competitorProduct.brand.toLowerCase() === userProduct.brand.toLowerCase()) {
      confidence += 10;
    }

    // Boost confidence for category matches
    if (competitorProduct.category && userProduct.category && 
        competitorProduct.category.toLowerCase() === userProduct.category.toLowerCase()) {
      confidence += 5;
    }

    // Boost confidence for material matches
    if (competitorProduct.material && userProduct.material && 
        competitorProduct.material.toLowerCase() === userProduct.material.toLowerCase()) {
      confidence += 5;
    }

    return Math.min(confidence, 100); // Cap at 100%
  }

  // Generate product search keywords for scraping
  async generateSearchKeywords(product) {
    if (!this.openai) {
      console.warn('OpenAI not initialized. Returning basic keywords.');
      // Generate basic keywords from product title
      const title = product.title || '';
      const words = title.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      return words.slice(0, 5); // Return first 5 meaningful words
    }

    try {
      const prompt = `
        Generate search keywords for finding this product on competitor websites:
        
        Title: ${product.title}
        Brand: ${product.brand || 'N/A'}
        Category: ${product.category || 'N/A'}
        Material: ${product.material || 'N/A'}
        Size: ${product.size || 'N/A'}
        
        Generate 5-10 search keyword variations that would help find similar products.
        Return as a JSON array of strings.
        Focus on the most important identifying features.
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Generate effective search keywords for product matching. Return only valid JSON array."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      });

      const keywords = JSON.parse(response.choices[0].message.content);
      return Array.isArray(keywords) ? keywords : [];

    } catch (error) {
      console.error('Error generating keywords:', error);
      return [product.title]; // Fallback to just the title
    }
  }
}

export default AIService;