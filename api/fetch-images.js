export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { asin, marketplace } = req.body || {};
  if (!asin) return res.status(400).json({ error: 'ASIN required' });

  // Map marketplace to domain
  const domains = {
    'Amazon.de': 'amazon.de', 'Amazon.com': 'amazon.com', 'Amazon.co.uk': 'amazon.co.uk',
    'Amazon.fr': 'amazon.fr', 'Amazon.it': 'amazon.it', 'Amazon.es': 'amazon.es',
  };
  const domain = domains[marketplace] || 'amazon.de';
  const url = `https://www.${domain}/dp/${asin}`;

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  ];
  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
  const isDE = domain === 'amazon.de';

  try {
    // Fetch Amazon product page with browser-like headers
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': isDE ? 'de-DE,de;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!pageRes.ok) {
      return res.status(502).json({ error: `Amazon returned ${pageRes.status}` });
    }

    const html = await pageRes.text();

    // ═══ EXTRACT PRODUCT DATA ═══
    const productData = {};

    // Title
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    if (titleMatch) productData.title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

    // Brand
    const brandMatch = html.match(/<a[^>]*id="bylineInfo"[^>]*>[^<]*?(?:Visit the |Besuche den |Brand:\s*|Marke:\s*)(.*?)(?:\s*Store|\s*Shop|<)/i);
    if (brandMatch) productData.brand = brandMatch[1].replace(/<[^>]+>/g, '').trim();
    if (!productData.brand) {
      const brandMatch2 = html.match(/"brand"\s*:\s*"([^"]+)"/);
      if (brandMatch2) productData.brand = brandMatch2[1];
    }

    // Price
    const priceMatch = html.match(/<span[^>]*class="a-price-whole"[^>]*>(\d[\d.,]*)/);
    const priceFractionMatch = html.match(/<span[^>]*class="a-price-fraction"[^>]*>(\d+)/);
    if (priceMatch) {
      const currency = isDE ? '€' : (domain === 'amazon.co.uk' ? '£' : '$');
      productData.price = priceMatch[1] + (priceFractionMatch ? ',' + priceFractionMatch[1] : '') + currency;
    }
    if (!productData.price) {
      const offscreenPrice = html.match(/<span[^>]*class="a-offscreen"[^>]*>\s*([\d.,]+\s*[€$£]|[€$£]\s*[\d.,]+)/);
      if (offscreenPrice) productData.price = offscreenPrice[1].trim();
    }

    // Rating
    const ratingMatch = html.match(/<span[^>]*class="a-icon-alt"[^>]*>\s*(\d[.,]\d)\s/);
    if (ratingMatch) productData.rating = ratingMatch[1];

    // Review count
    const reviewCountMatch = html.match(/<span[^>]*id="acrCustomerReviewText"[^>]*>\s*([\d.,]+)/);
    if (reviewCountMatch) productData.reviewCount = reviewCountMatch[1];

    // Bullet points
    const bulletsSection = html.match(/<div[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (bulletsSection) {
      const bulletItems = [...bulletsSection[1].matchAll(/<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>/g)];
      productData.bullets = bulletItems
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(b => b.length > 5 && b.length < 500);
    }

    // Product description
    const descMatch = html.match(/<div[^>]*id="productDescription"[^>]*>([\s\S]*?)<\/div>/);
    if (descMatch) {
      productData.description = descMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 1000);
    }

    // Category / BSR
    const bsrMatch = html.match(/(?:#|Nr\.)\s*([\d.,]+)\s*(?:in|unter)\s+([^<(]+)/);
    if (bsrMatch) {
      productData.bsr = bsrMatch[1].replace(/[.,]/g, '');
      productData.category = bsrMatch[2].trim();
    }

    // ═══ EXTRACT IMAGES ═══
    let imageUrls = [];

    // Strategy 1: Extract from colorImages/initial JSON (most reliable)
    const colorImagesMatch = html.match(/'colorImages'\s*:\s*\{[^}]*'initial'\s*:\s*(\[[^\]]+\])/);
    if (colorImagesMatch) {
      try {
        const parsed = JSON.parse(colorImagesMatch[1].replace(/'/g, '"'));
        imageUrls = parsed.map(img => img.hiRes || img.large).filter(Boolean);
      } catch {}
    }

    // Strategy 2: Look for imageGalleryData
    if (imageUrls.length === 0) {
      const galleryMatch = html.match(/imageGalleryData\s*[=:]\s*(\[[\s\S]*?\])\s*[;,]/);
      if (galleryMatch) {
        try {
          const parsed = JSON.parse(galleryMatch[1]);
          imageUrls = parsed.map(img => img.mainUrl || img.thumbUrl).filter(Boolean);
        } catch {}
      }
    }

    // Strategy 3: Extract from data-a-dynamic-image attributes (product image block)
    if (imageUrls.length === 0) {
      const dynamicMatches = [...html.matchAll(/data-a-dynamic-image="([^"]+)"/g)];
      for (const m of dynamicMatches) {
        try {
          const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const obj = JSON.parse(decoded);
          const urls = Object.keys(obj).filter(u => u.includes('images/I/'));
          imageUrls.push(...urls);
        } catch {}
      }
    }

    // Strategy 4: Regex for hi-res image URLs in script blocks
    if (imageUrls.length === 0) {
      const hiResMatches = [...html.matchAll(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g)];
      imageUrls = hiResMatches.map(m => m[1]);
    }

    // Strategy 5: Fallback to any large product images in img tags
    if (imageUrls.length === 0) {
      const imgMatches = [...html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9._%-]+\._(?:SL1500|SL1200|SL1000|SL800)_\.(?:jpg|png|webp)/g)];
      imageUrls = [...new Set(imgMatches.map(m => m[0]))];
    }

    // Deduplicate and limit to 7 images (Main + PT01-PT06)
    imageUrls = [...new Set(imageUrls)].slice(0, 7);

    // Upgrade to hi-res where possible (replace size suffixes)
    imageUrls = imageUrls.map(url => {
      return url.replace(/\._[A-Z]{2}\d+_\./, '._SL1500_.');
    });

    if (imageUrls.length === 0 && Object.keys(productData).length === 0) {
      return res.status(200).json({ images: [], productData: {}, message: 'Keine Daten gefunden. Amazon hat die Anfrage moeglicherweise blockiert.' });
    }

    // Fetch each image and convert to base64
    const images = [];
    for (const imgUrl of imageUrls) {
      try {
        const imgRes = await fetch(imgUrl, {
          headers: {
            'User-Agent': ua,
            'Referer': `https://www.${domain}/`,
          },
        });
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          images.push({
            url: imgUrl,
            base64: `data:${contentType};base64,${base64}`,
            index: images.length,
            label: images.length === 0 ? 'Main Image' : `PT0${images.length}`,
          });
        }
      } catch {
        // Skip failed images
      }
    }

    return res.status(200).json({ images, productData, asin, marketplace: domain });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
