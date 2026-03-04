// Bright Data Amazon keyword & review research endpoints
export const config = { maxDuration: 300 };

const BD_BASE = 'https://api.brightdata.com/datasets/v3/scrape';
const BD_TIMEOUT = 55000; // 55s timeout per request (Vercel has 120s max)
const BD_RETRIES = 2; // retry up to 2 times on failure/empty

// ═══ Retry wrapper with timeout ═══
async function bdRequest(url, body, apiKey, label) {
  for (let attempt = 1; attempt <= BD_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BD_TIMEOUT);
    try {
      console.log(`[BD] ${label} attempt ${attempt}/${BD_RETRIES}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[BD] ${label} attempt ${attempt} HTTP ${res.status}: ${errText.substring(0, 200)}`);
        if (attempt < BD_RETRIES) { await sleep(3000); continue; }
        throw new Error(`Bright Data ${label} HTTP ${res.status}: ${errText.substring(0, 100)}`);
      }
      const data = await res.json();
      // Check for empty results
      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.warn(`[BD] ${label} attempt ${attempt}: empty response`);
        if (attempt < BD_RETRIES) { await sleep(3000); continue; }
        return []; // Return empty array on final attempt
      }
      // Check for Bright Data error objects in response
      if (Array.isArray(data) && data.length > 0 && data[0].__error) {
        console.warn(`[BD] ${label} attempt ${attempt}: BD error:`, data[0].__error);
        if (attempt < BD_RETRIES) { await sleep(3000); continue; }
        return []; // Return empty on final attempt
      }
      console.log(`[BD] ${label} attempt ${attempt}: success, ${Array.isArray(data) ? data.length : 1} results`);
      return data;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        console.warn(`[BD] ${label} attempt ${attempt}: timeout after ${BD_TIMEOUT}ms`);
      } else {
        console.warn(`[BD] ${label} attempt ${attempt}: ${e.message}`);
      }
      if (attempt < BD_RETRIES) { await sleep(3000); continue; }
      throw new Error(`Bright Data ${label} fehlgeschlagen nach ${BD_RETRIES} Versuchen: ${e.message}`);
    }
  }
  return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══ 1. Amazon Products Global Dataset - Discover by keywords ═══
async function discoverByKeywords(keywords, domain, apiKey) {
  const url = `${BD_BASE}?dataset_id=gd_lwhideng15g8jg63s7&notify=false&include_errors=true&type=discover_new&discover_by=keywords`;
  return bdRequest(url, { input: [{ keywords, domain: `https://www.${domain}`, pages_to_search: 1 }] }, apiKey, `keywords:"${keywords}"`);
}

// ═══ 2. Amazon Products Global Dataset - Discover by brand ═══
async function discoverByBrand(brandUrl, apiKey) {
  const url = `${BD_BASE}?dataset_id=gd_lwhideng15g8jg63s7&notify=false&include_errors=true&type=discover_new&discover_by=brand`;
  return bdRequest(url, { input: [{ url: brandUrl }] }, apiKey, `brand`);
}

// ═══ 3. Amazon Reviews - Collect by URL ═══
async function collectReviews(asin, domain, apiKey) {
  const productUrl = `https://www.${domain}/dp/${asin}`;
  const url = `${BD_BASE}?dataset_id=gd_le8e811kzy4ggddlq&notify=false&include_errors=true`;
  return bdRequest(url, { input: [{ url: productUrl, reviews_to_not_include: [] }] }, apiKey, `reviews:${asin}`);
}

// ═══ 4. Amazon Products - Discover by keyword ═══
async function discoverByKeyword(keyword, apiKey) {
  const url = `${BD_BASE}?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true&type=discover_new&discover_by=keyword`;
  return bdRequest(url, { input: [{ keyword }] }, apiKey, `keyword:"${keyword}"`);
}

// ═══ 5. Amazon Products - Discover by best sellers URL ═══
async function discoverByBestSellers(categoryUrl, apiKey) {
  const url = `${BD_BASE}?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true&type=discover_new&discover_by=best_sellers_url`;
  return bdRequest(url, { input: [{ category_url: categoryUrl }] }, apiKey, `best_sellers`);
}

// ═══ Data Extraction Helpers ═══

function extractKeywordData(products) {
  if (!Array.isArray(products) || products.length === 0) return { searchTerms: [], competitorKeywords: [], competitors: [] };

  const titleWords = {};
  const bulletWords = {};
  const competitors = [];

  products.forEach(p => {
    if (!p || p.__error) return; // Skip error entries

    competitors.push({
      title: p.title || '',
      brand: p.brand || '',
      price: p.final_price || p.price || null,
      currency: p.currency || '',
      rating: p.rating || null,
      reviewCount: p.reviews_count || null,
      asin: p.asin || '',
      bulletCount: p.feature_bullets?.length || 0,
      imageCount: Array.isArray(p.images) ? p.images.length : 0,
    });

    if (p.title) {
      const words = p.title.toLowerCase().split(/[\s,|·\-–—]+/).filter(w => w.length > 2);
      words.forEach(w => { titleWords[w] = (titleWords[w] || 0) + 1; });
    }
    if (p.feature_bullets) {
      p.feature_bullets.forEach(b => {
        const words = b.toLowerCase().split(/[\s,|·\-–—]+/).filter(w => w.length > 3);
        words.forEach(w => { bulletWords[w] = (bulletWords[w] || 0) + 1; });
      });
    }
  });

  const searchTerms = Object.entries(titleWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, count]) => ({ term, frequency: count }));

  const competitorKeywords = Object.entries(bulletWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, count]) => ({ term, frequency: count }));

  return { searchTerms, competitorKeywords, competitors: competitors.slice(0, 15) };
}

function extractReviewInsights(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return { totalReviews: 0, avgRating: 0, reviews: [] };

  return {
    totalReviews: reviews.length,
    avgRating: reviews.length > 0 ? Math.round((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) * 10) / 10 : 0,
    reviews: reviews.filter(r => r && !r.__error).slice(0, 50).map(r => ({
      title: r.title || '',
      text: (r.text || r.review_text || '').substring(0, 500),
      rating: r.rating || 0,
      verified: r.verified_purchase || false,
      date: r.date || '',
    })),
  };
}

function extractBestSellerData(products) {
  if (!Array.isArray(products) || products.length === 0) return { topProducts: [], avgPrice: 0, avgRating: 0 };

  const topProducts = products.filter(p => p && !p.__error).slice(0, 20).map(p => ({
    title: p.title || '',
    brand: p.brand || '',
    price: p.final_price || p.price || null,
    rating: p.rating || null,
    reviewCount: p.reviews_count || null,
    asin: p.asin || '',
  }));

  const prices = topProducts.filter(p => p.price).map(p => p.price);
  const ratings = topProducts.filter(p => p.rating).map(p => p.rating);

  return {
    topProducts,
    avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : 0,
    avgRating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : 0,
    priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
  };
}

// ═══ Handler ═══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, asin, keyword, keywords, marketplace, brandUrl, categoryUrl } = req.body || {};
  const apiKey = process.env.BRIGHT_DATA_API_KEY;

  if (!apiKey) return res.status(400).json({ error: 'Bright Data API key not configured', available: false });

  const DOMAINS = {
    'Amazon.de': 'amazon.de', 'Amazon.com': 'amazon.com', 'Amazon.co.uk': 'amazon.co.uk',
    'Amazon.fr': 'amazon.fr', 'Amazon.it': 'amazon.it', 'Amazon.es': 'amazon.es',
  };
  const domain = DOMAINS[marketplace] || 'amazon.de';

  try {
    switch (type) {
      case 'keywords': {
        if (!keywords) return res.status(400).json({ error: 'keywords required' });
        console.log(`[Handler] keywords request: "${keywords}" on ${domain}`);
        const results = await discoverByKeywords(keywords, domain, apiKey);
        const keywordData = extractKeywordData(results);
        const isEmpty = keywordData.searchTerms.length === 0 && keywordData.competitors.length === 0;
        if (isEmpty) console.warn(`[Handler] keywords: extraction returned empty for "${keywords}" (raw: ${Array.isArray(results) ? results.length : 0} items)`);
        return res.status(200).json({ success: !isEmpty, data: keywordData, raw: results?.slice?.(0, 3), debug: { rawCount: Array.isArray(results) ? results.length : 0, isEmpty } });
      }
      case 'brand': {
        if (!brandUrl) return res.status(400).json({ error: 'brandUrl required' });
        const results = await discoverByBrand(brandUrl, apiKey);
        const brandData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: brandData });
      }
      case 'reviews': {
        if (!asin) return res.status(400).json({ error: 'asin required' });
        console.log(`[Handler] reviews request: ${asin} on ${domain}`);
        const results = await collectReviews(asin, domain, apiKey);
        const insights = extractReviewInsights(results);
        return res.status(200).json({ success: insights.totalReviews > 0, data: insights, debug: { rawCount: Array.isArray(results) ? results.length : 0 } });
      }
      case 'keyword': {
        if (!keyword) return res.status(400).json({ error: 'keyword required' });
        console.log(`[Handler] keyword request: "${keyword}"`);
        const results = await discoverByKeyword(keyword, apiKey);
        const keywordData = extractKeywordData(results);
        const isEmpty = keywordData.searchTerms.length === 0 && keywordData.competitors.length === 0;
        if (isEmpty) console.warn(`[Handler] keyword: extraction returned empty for "${keyword}" (raw: ${Array.isArray(results) ? results.length : 0} items)`);
        return res.status(200).json({ success: !isEmpty, data: keywordData, raw: results?.slice?.(0, 3), debug: { rawCount: Array.isArray(results) ? results.length : 0, isEmpty } });
      }
      case 'best_sellers': {
        if (!categoryUrl) return res.status(400).json({ error: 'categoryUrl required' });
        const results = await discoverByBestSellers(categoryUrl, apiKey);
        const bsData = extractBestSellerData(results);
        return res.status(200).json({ success: true, data: bsData });
      }
      default:
        return res.status(400).json({ error: 'Invalid type. Use: keywords, keyword, reviews, brand, best_sellers' });
    }
  } catch (error) {
    console.error(`[Handler] ${type} error:`, error.message);
    return res.status(500).json({ error: error.message, success: false });
  }
}
