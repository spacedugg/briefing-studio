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

  try {
    // Fetch Amazon product page with browser-like headers
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
      },
    });

    if (!pageRes.ok) {
      return res.status(502).json({ error: `Amazon returned ${pageRes.status}` });
    }

    const html = await pageRes.text();

    // Strategy 1: Extract from colorImages/initial JSON (most reliable)
    let imageUrls = [];

    // Look for colorImages data (contains hi-res URLs)
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

    if (imageUrls.length === 0) {
      return res.status(200).json({ images: [], message: 'No images found. Amazon may have blocked the request.' });
    }

    // Upgrade to hi-res where possible (replace size suffixes)
    imageUrls = imageUrls.map(url => {
      // Try to get SL1500 version
      return url.replace(/\._[A-Z]{2}\d+_\./, '._SL1500_.');
    });

    // Fetch each image and convert to base64
    const images = [];
    for (const imgUrl of imageUrls) {
      try {
        const imgRes = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

    return res.status(200).json({ images, asin, marketplace: domain });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
