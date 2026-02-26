// Bright Data Amazon keyword & review research endpoints
export const config = { maxDuration: 60 };

const BD_BASE = 'https://api.brightdata.com/datasets/v3/scrape';

// ═══ 1. Amazon Products Global Dataset - Discover by keywords ═══
// Sucht Produkte auf einem bestimmten Marktplatz nach Keywords
// Liefert: Produkttitel, Preise, Ratings, Bullets der Top-Ergebnisse
async function discoverByKeywords(keywords, domain, apiKey) {
  const res = await fetch(
    `${BD_BASE}?dataset_id=gd_lwhideng15g8jg63s7&notify=false&include_errors=true&type=discover_new&discover_by=keywords`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ keywords, domain: `https://www.${domain}`, pages_to_search: 1 }] }),
    }
  );
  if (!res.ok) throw new Error(`Bright Data keywords ${res.status}`);
  return res.json();
}

// ═══ 2. Amazon Products Global Dataset - Discover by brand ═══
// Sucht alle Produkte einer Marke (via Seller/Brand URL)
// Liefert: Portfolio-Überblick, Preisstruktur, Produktkategorien
async function discoverByBrand(brandUrl, apiKey) {
  const res = await fetch(
    `${BD_BASE}?dataset_id=gd_lwhideng15g8jg63s7&notify=false&include_errors=true&type=discover_new&discover_by=brand`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url: brandUrl }] }),
    }
  );
  if (!res.ok) throw new Error(`Bright Data brand ${res.status}`);
  return res.json();
}

// ═══ 3. Amazon Reviews - Collect by URL ═══
// Sammelt echte Kundenbewertungen eines Produkts
// Liefert: Rating, Titel, Text, Verifiziert-Status, Datum
async function collectReviews(asin, domain, apiKey) {
  const url = `https://www.${domain}/dp/${asin}`;
  const res = await fetch(
    `${BD_BASE}?dataset_id=gd_le8e811kzy4ggddlq&notify=false&include_errors=true`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url, reviews_to_not_include: [] }] }),
    }
  );
  if (!res.ok) throw new Error(`Bright Data reviews ${res.status}`);
  return res.json();
}

// ═══ 4. Amazon Products - Discover by keyword ═══
// Einfachere Keyword-Suche (ohne Domain-Spezifikation)
// Liefert: Produkte die unter diesem Keyword ranken
async function discoverByKeyword(keyword, apiKey) {
  const res = await fetch(
    `${BD_BASE}?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true&type=discover_new&discover_by=keyword`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ keyword }] }),
    }
  );
  if (!res.ok) throw new Error(`Bright Data keyword ${res.status}`);
  return res.json();
}

// ═══ 5. Amazon Products - Discover by best sellers URL ═══
// Scrapes die Bestseller einer Kategorie
// Liefert: Top-Produkte in der Kategorie, deren Preise, Ratings, Listings
async function discoverByBestSellers(categoryUrl, apiKey) {
  const res = await fetch(
    `${BD_BASE}?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true&type=discover_new&discover_by=best_sellers_url`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ category_url: categoryUrl }] }),
    }
  );
  if (!res.ok) throw new Error(`Bright Data best sellers ${res.status}`);
  return res.json();
}

// ═══ Data Extraction Helpers ═══

// Extract keyword + competitor data from product search results
function extractKeywordData(products) {
  if (!Array.isArray(products)) return { searchTerms: [], competitorKeywords: [], competitors: [] };

  const titleWords = {};
  const bulletWords = {};
  const competitors = [];

  products.forEach(p => {
    // Extract structured competitor info
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

    // Extract words from titles for keyword frequency analysis
    if (p.title) {
      const words = p.title.toLowerCase().split(/[\s,|·\-–—]+/).filter(w => w.length > 2);
      words.forEach(w => { titleWords[w] = (titleWords[w] || 0) + 1; });
    }
    // Extract from bullet points
    if (p.feature_bullets) {
      p.feature_bullets.forEach(b => {
        const words = b.toLowerCase().split(/[\s,|·\-–—]+/).filter(w => w.length > 3);
        words.forEach(w => { bulletWords[w] = (bulletWords[w] || 0) + 1; });
      });
    }
  });

  // Sort by frequency
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

// Extract review insights from Bright Data review data
function extractReviewInsights(reviews) {
  if (!Array.isArray(reviews)) return { totalReviews: 0, avgRating: 0, reviews: [] };

  return {
    totalReviews: reviews.length,
    avgRating: reviews.length > 0 ? Math.round((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) * 10) / 10 : 0,
    reviews: reviews.slice(0, 50).map(r => ({
      title: r.title || '',
      text: (r.text || r.review_text || '').substring(0, 500),
      rating: r.rating || 0,
      verified: r.verified_purchase || false,
      date: r.date || '',
    })),
  };
}

// Extract best seller insights
function extractBestSellerData(products) {
  if (!Array.isArray(products)) return { topProducts: [], avgPrice: 0, avgRating: 0 };

  const topProducts = products.slice(0, 20).map(p => ({
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
      // 1. Global keyword search (marketplace-specific)
      case 'keywords': {
        if (!keywords) return res.status(400).json({ error: 'keywords required' });
        const results = await discoverByKeywords(keywords, domain, apiKey);
        const keywordData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: keywordData, raw: results?.slice(0, 10) });
      }
      // 2. Brand discovery
      case 'brand': {
        if (!brandUrl) return res.status(400).json({ error: 'brandUrl required' });
        const results = await discoverByBrand(brandUrl, apiKey);
        const brandData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: brandData });
      }
      // 3. Reviews
      case 'reviews': {
        if (!asin) return res.status(400).json({ error: 'asin required' });
        const results = await collectReviews(asin, domain, apiKey);
        const insights = extractReviewInsights(results);
        return res.status(200).json({ success: true, data: insights });
      }
      // 4. Simple keyword search
      case 'keyword': {
        if (!keyword) return res.status(400).json({ error: 'keyword required' });
        const results = await discoverByKeyword(keyword, apiKey);
        const keywordData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: keywordData, raw: results?.slice(0, 10) });
      }
      // 5. Best sellers by category URL
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
    return res.status(500).json({ error: error.message, success: false });
  }
}

