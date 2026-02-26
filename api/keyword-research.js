// Bright Data Amazon keyword & review research endpoints
export const config = { maxDuration: 60 };

const BD_BASE = 'https://api.brightdata.com/datasets/v3/scrape';

// Amazon Products Global Dataset - Discover by keywords
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

// Amazon Products - Discover by keyword (simpler endpoint)
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

// Amazon Reviews - Collect by URL
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

// Amazon Products Global Dataset - Discover by brand
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

// Extract useful keyword data from Bright Data product results
function extractKeywordData(products) {
  if (!Array.isArray(products)) return { searchTerms: [], competitorKeywords: [] };

  const titleWords = {};
  const bulletWords = {};

  products.forEach(p => {
    // Extract words from titles
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

  return { searchTerms, competitorKeywords };
}

// Extract review insights from Bright Data review data
function extractReviewInsights(reviews) {
  if (!Array.isArray(reviews)) return { totalReviews: 0, avgRating: 0, themes: [] };

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, asin, keyword, keywords, marketplace, brandUrl } = req.body || {};
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
        const results = await discoverByKeywords(keywords, domain, apiKey);
        const keywordData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: keywordData, raw: results?.slice(0, 10) });
      }
      case 'keyword': {
        if (!keyword) return res.status(400).json({ error: 'keyword required' });
        const results = await discoverByKeyword(keyword, apiKey);
        const keywordData = extractKeywordData(results);
        return res.status(200).json({ success: true, data: keywordData, raw: results?.slice(0, 10) });
      }
      case 'reviews': {
        if (!asin) return res.status(400).json({ error: 'asin required' });
        const results = await collectReviews(asin, domain, apiKey);
        const insights = extractReviewInsights(results);
        return res.status(200).json({ success: true, data: insights });
      }
      case 'brand': {
        if (!brandUrl) return res.status(400).json({ error: 'brandUrl required' });
        const results = await discoverByBrand(brandUrl, apiKey);
        return res.status(200).json({ success: true, data: results?.slice(0, 20) });
      }
      default:
        return res.status(400).json({ error: 'Invalid type. Use: keywords, keyword, reviews, brand' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message, success: false });
  }
}
