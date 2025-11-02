import OpenAI from 'openai';

class AIService {
  constructor() {
    // Prefer HuggingFace Router when HUGGINGFACE_API_KEY is provided
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (hfKey) {
      // Use OpenAI-compatible client pointed to HuggingFace Inference Router
      this.openai = new OpenAI({
        apiKey: hfKey,
        baseURL: 'https://router.huggingface.co/v1'
      });
      this.provider = 'huggingface';
      // Default chat and embedding models for HF Router
      this.chatModel = process.env.HUGGINGFACE_CHAT_MODEL || 'MiniMaxAI/MiniMax-M2';
      // Use a common HF embedding model alias via Router
      this.embeddingModel = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'jinaai/jina-embeddings-v3-base-en';
      console.info('[AIService] Initialized', {
        provider: this.provider,
        chatModel: this.chatModel,
        embeddingModel: this.embeddingModel
      });
    } else if (openaiKey) {
      // Fallback to OpenAI if available
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.provider = 'openai';
      this.chatModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
      console.info('[AIService] Initialized', {
        provider: this.provider,
        chatModel: this.chatModel,
        embeddingModel: this.embeddingModel
      });
    } else {
      console.warn('No AI API key provided (HUGGINGFACE_API_KEY or OPENAI_API_KEY). AI features will be limited.');
      this.openai = null;
      this.provider = null;
      this.chatModel = null;
      this.embeddingModel = null;
    }
  }

  // Extract product attributes from title and description
  async extractAttributes(title, description = '') {
    if (!this.openai) {
      console.warn('AI client not initialized. Using heuristic extraction.');
      return this.#heuristicExtract(title, description);
    }

    try {
      const prompt = `Extract product attributes from the following information.\n\nTitle: ${title}\nDescription: ${description}\n\nReturn only a single JSON object with keys: material, size, color, brand, category, threadCount, design, weight, dimensions, features.\n- Use null when unknown.\n- 'threadCount' should be a number if present, otherwise null.\n- 'features' should be an array of short strings.`;

      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: 'system',
            content: 'You are a precise product data extraction engine. Respond ONLY with valid JSON. No extra text.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '500'),
        // Some providers may ignore response_format; we still try to enforce JSON via prompt.
        response_format: { type: 'json_object' }
      });

      let content = response.choices?.[0]?.message?.content || '{}';
      // Attempt robust JSON extraction if providers add text
      let extractedData;
      try {
        extractedData = JSON.parse(content);
      } catch (e) {
        const match = content.match(/\{[\s\S]*\}/);
        extractedData = match ? JSON.parse(match[0]) : {};
      }

      const result = {
        material: extractedData.material || null,
        size: extractedData.size || null,
        color: extractedData.color || null,
        brand: extractedData.brand || null,
        category: extractedData.category || null,
        threadCount: extractedData.threadCount != null && !isNaN(Number(extractedData.threadCount))
          ? parseInt(extractedData.threadCount)
          : null,
        design: extractedData.design || null,
        weight: extractedData.weight || null,
        dimensions: extractedData.dimensions || null,
        features: Array.isArray(extractedData.features) ? extractedData.features : []
      };
      const allNull = Object.entries(result).every(([k, v]) => v == null || (Array.isArray(v) && v.length === 0));
      return allNull ? this.#heuristicExtract(title, description) : result;

    } catch (error) {
      console.error('Error extracting attributes:', error);
      // Fallback to heuristic extraction when AI fails
      return this.#heuristicExtract(title, description);
    }
  }

  // Basic heuristic extractor used as fallback
  #heuristicExtract(title, description = '') {
    const text = `${title} ${description}`.toLowerCase();
    const getMatch = (regex, transform = v => v) => {
      const m = text.match(regex);
      return m ? transform(m[1]) : null;
    };

    const material = getMatch(/(\d+%\s+\w+|cotton|linen|polyester|silk|bamboo|microfiber)/i, v => v);
    const size = getMatch(/size:\s*(\w+)/i, v => v) || getMatch(/\b(twin|full|queen|king|california king)\b/i, v => v);
    const color = getMatch(/color:\s*([a-zA-Z\s-]+)/i, v => v.trim());
    const brand = getMatch(/brand:\s*([a-zA-Z0-9\s-]+)/i, v => v.trim());
    const threadCount = getMatch(/(\d{2,4})\s*thread\s*count/i, v => parseInt(v));

    // Simple category guess
    const category = /sheet|bedding|duvet|pillow/i.test(text) ? 'Bedding' : null;
    const features = [];
    if (/fitted sheet/i.test(text)) features.push('Fitted sheet');
    if (/flat sheet/i.test(text)) features.push('Flat sheet');
    if (/pillowcase/i.test(text)) features.push('Pillowcases');

    return {
      material: material,
      size: size,
      color: color,
      brand: brand,
      category: category,
      threadCount: typeof threadCount === 'number' ? threadCount : null,
      design: null,
      weight: null,
      dimensions: null,
      features
    };
  }

  // Generate product embeddings for similarity matching
  async generateEmbedding(text) {
    if (!this.openai) {
      console.warn('AI client not initialized. Returning mock embedding.');
      return new Array(1536).fill(0).map(() => Math.random() * 0.1);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text
      });
      return response.data?.[0]?.embedding || null;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  // Calculate text similarity between two products
  async calculateProductSimilarity(product1, product2) {
    if (!this.openai) {
      console.warn('AI client not initialized. Returning mock similarity score.');
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
      return [];
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
      console.warn('AI client not initialized. Returning basic keywords.');
      const title = product.title || '';
      const words = title.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      return words.slice(0, 5);
    }

    try {
      const prompt = `Generate 5-10 keyword variations to find this product on competitor sites.\n\nTitle: ${product.title}\nBrand: ${product.brand || 'N/A'}\nCategory: ${product.category || 'N/A'}\nMaterial: ${product.material || 'N/A'}\nSize: ${product.size || 'N/A'}\n\nReturn ONLY a JSON array of strings.`;

      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: 'Generate effective search keywords. Respond ONLY with a valid JSON array of strings.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      let content = response.choices?.[0]?.message?.content || '[]';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        const match = content.match(/\[[\s\S]*\]/);
        parsed = match ? JSON.parse(match[0]) : [];
      }
      return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
      console.error('Error generating keywords:', error);
      return [product.title];
    }
  }
}

export default AIService;