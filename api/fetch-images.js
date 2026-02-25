// Allow longer execution for Bright Data API calls
export const config = { maxDuration: 60 };

const DOMAINS = {
  'Amazon.de': 'amazon.de', 'Amazon.com': 'amazon.com', 'Amazon.co.uk': 'amazon.co.uk',
  'Amazon.fr': 'amazon.fr', 'Amazon.it': 'amazon.it', 'Amazon.es': 'amazon.es',
};

// ═══ Bright Data Scraper ═══
async function scrapeBrightData(asin, domain, apiKey) {
  const url = `https://www.${domain}/dp/${asin}`;
  const bdRes = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url, zipcode: '', language: '' }] }),
    }
  );
  if (!bdRes.ok) throw new Error(`Bright Data ${bdRes.status}`);
  const results = await bdRes.json();
  if (!results || !results.length) throw new Error('No results');
  const p = results[0];
  if (p.error) throw new Error(p.error);

  // Map Bright Data response to our format
  const productData = {};
  if (p.title) productData.title = p.title;
  if (p.brand) productData.brand = p.brand;
  if (p.final_price != null) {
    productData.price = `${p.final_price}${p.currency === 'EUR' ? '€' : p.currency === 'GBP' ? '£' : p.currency === 'USD' ? '$' : ' ' + (p.currency || '')}`;
  }
  if (p.rating != null) productData.rating = String(p.rating);
  if (p.reviews_count != null) productData.reviewCount = String(p.reviews_count);
  if (p.feature_bullets?.length) productData.bullets = p.feature_bullets;
  if (p.description) productData.description = p.description.substring(0, 1000);
  // BSR - Bright Data may return as array or single value
  const bsr = Array.isArray(p.best_sellers_rank) ? p.best_sellers_rank[0] : p.best_sellers_rank;
  if (bsr?.rank) { productData.bsr = String(bsr.rank); productData.category = bsr.category || ''; }
  // Seller info
  if (p.seller_name) productData.seller = p.seller_name;

  // Extract image URLs from Bright Data response
  let imageUrls = [];
  if (Array.isArray(p.images)) {
    imageUrls = p.images.map(img => typeof img === 'string' ? img : img?.url || img?.link || '').filter(Boolean);
  } else if (p.main_image) {
    imageUrls = [p.main_image, ...(p.other_images || [])].filter(Boolean);
  }

  return { productData, imageUrls: imageUrls.slice(0, 7) };
}

// ═══ Direct Scraper (fallback) ═══
async function scrapeDirect(asin, domain) {
  const url = `https://www.${domain}/dp/${asin}`;
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  ];
  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
  const isDE = domain === 'amazon.de';

  const pageRes = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': isDE ? 'de-DE,de;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
    },
  });
  if (!pageRes.ok) throw new Error(`Amazon ${pageRes.status}`);
  const html = await pageRes.text();

  // Extract product data
  const productData = {};
  const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
  if (titleMatch) productData.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  const brandMatch = html.match(/<a[^>]*id="bylineInfo"[^>]*>[^<]*?(?:Visit the |Besuche den |Brand:\s*|Marke:\s*)(.*?)(?:\s*Store|\s*Shop|<)/i)
    || html.match(/"brand"\s*:\s*"([^"]+)"/);
  if (brandMatch) productData.brand = brandMatch[1].replace(/<[^>]+>/g, '').trim();
  const priceMatch = html.match(/<span[^>]*class="a-price-whole"[^>]*>(\d[\d.,]*)/);
  if (priceMatch) productData.price = priceMatch[1] + (isDE ? '€' : '$');
  const ratingMatch = html.match(/<span[^>]*class="a-icon-alt"[^>]*>\s*(\d[.,]\d)\s/);
  if (ratingMatch) productData.rating = ratingMatch[1];
  const reviewCountMatch = html.match(/<span[^>]*id="acrCustomerReviewText"[^>]*>\s*([\d.,]+)/);
  if (reviewCountMatch) productData.reviewCount = reviewCountMatch[1];
  const bulletsSection = html.match(/<div[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  if (bulletsSection) {
    productData.bullets = [...bulletsSection[1].matchAll(/<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(b => b.length > 5 && b.length < 500);
  }

  // Extract images
  let imageUrls = [];
  const colorImagesMatch = html.match(/'colorImages'\s*:\s*\{[^}]*'initial'\s*:\s*(\[[^\]]+\])/);
  if (colorImagesMatch) {
    try { imageUrls = JSON.parse(colorImagesMatch[1].replace(/'/g, '"')).map(img => img.hiRes || img.large).filter(Boolean); } catch {}
  }
  if (!imageUrls.length) {
    const hiRes = [...html.matchAll(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g)];
    imageUrls = hiRes.map(m => m[1]);
  }
  if (!imageUrls.length) {
    const dyn = [...html.matchAll(/data-a-dynamic-image="([^"]+)"/g)];
    for (const m of dyn) { try { imageUrls.push(...Object.keys(JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))).filter(u => u.includes('images/I/'))); } catch {} }
  }
  if (!imageUrls.length) {
    imageUrls = [...new Set([...html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9._%-]+\._(?:SL1500|SL1200|SL1000|SL800)_\.(?:jpg|png|webp)/g)].map(m => m[0]))];
  }
  imageUrls = [...new Set(imageUrls)].slice(0, 7).map(u => u.replace(/\._[A-Z]{2}\d+_\./, '._SL1500_.'));

  return { productData, imageUrls };
}

// ═══ Fetch images as base64 ═══
async function fetchImagesBase64(imageUrls, domain) {
  const images = [];
  for (const imgUrl of imageUrls) {
    try {
      const imgRes = await fetch(imgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': `https://www.${domain}/` },
      });
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        images.push({
          url: imgUrl, base64: `data:${contentType};base64,${base64}`,
          index: images.length, label: images.length === 0 ? 'Main Image' : `PT0${images.length}`,
        });
      }
    } catch {}
  }
  return images;
}

// ═══ Handler ═══
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { asin, marketplace } = req.body || {};
  if (!asin) return res.status(400).json({ error: 'ASIN required' });

  const domain = DOMAINS[marketplace] || 'amazon.de';
  const bdKey = process.env.BRIGHT_DATA_API_KEY;

  try {
    let result;

    // Try Bright Data first (if API key configured), fallback to direct
    if (bdKey) {
      try {
        result = await scrapeBrightData(asin, domain, bdKey);
      } catch (bdErr) {
        console.error('Bright Data failed, falling back to direct:', bdErr.message);
        result = await scrapeDirect(asin, domain);
      }
    } else {
      result = await scrapeDirect(asin, domain);
    }

    const { productData, imageUrls } = result;
    const images = await fetchImagesBase64(imageUrls, domain);

    return res.status(200).json({ images, productData, asin, marketplace: domain });
  } catch (error) {
    return res.status(500).json({ error: error.message, images: [], productData: {} });
  }
}
