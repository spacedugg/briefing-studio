// Allow longer execution for Bright Data API calls (polling may take time)
export const config = { maxDuration: 300 };

const DOMAINS = {
  'Amazon.de': 'amazon.de', 'Amazon.com': 'amazon.com', 'Amazon.co.uk': 'amazon.co.uk',
  'Amazon.fr': 'amazon.fr', 'Amazon.it': 'amazon.it', 'Amazon.es': 'amazon.es',
};

// ═══ Bright Data Scraper ═══
const BD_POLL_INTERVAL = 5000; // 5s between polls
const BD_MAX_POLLS = 18;       // max 90s polling

async function pollSnapshot(snapshotId, apiKey) {
  for (let i = 0; i < BD_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, BD_POLL_INTERVAL));
    const pollRes = await fetch(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    console.log(`[BD] Poll #${i + 1} snapshot ${snapshotId}: status=${pollRes.status}`);
    if (pollRes.status === 200) {
      const data = await pollRes.json();
      if (Array.isArray(data) && data.length > 0) return data;
      throw new Error(`Snapshot leer (${JSON.stringify(data).substring(0, 200)})`);
    }
    // 202 = still processing, keep polling
    if (pollRes.status !== 202) {
      const errText = await pollRes.text().catch(() => '');
      throw new Error(`Snapshot-Poll fehlgeschlagen: ${pollRes.status} ${errText.substring(0, 200)}`);
    }
  }
  throw new Error(`Bright Data Timeout nach ${BD_MAX_POLLS * BD_POLL_INTERVAL / 1000}s — Snapshot ${snapshotId} nicht fertig`);
}

async function scrapeBrightData(asin, domain, apiKey) {
  const url = `https://www.${domain}/dp/${asin}`;
  const bdRes = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l7q7dkf244hwjntr0&notify=false&include_errors=true&format=json',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ url }] }),
    }
  );

  const rawText = await bdRes.text();
  console.log(`[BD] Response status=${bdRes.status}, body=${rawText.substring(0, 500)}`);

  if (!bdRes.ok && bdRes.status !== 202) {
    throw new Error(`Bright Data HTTP ${bdRes.status}: ${rawText.substring(0, 300)}`);
  }

  let parsed;
  try { parsed = JSON.parse(rawText); } catch { throw new Error(`Bright Data JSON-Fehler: ${rawText.substring(0, 300)}`); }

  // Case 1: Synchronous — direct array of results
  if (Array.isArray(parsed) && parsed.length > 0) {
    console.log(`[BD] Synchrone Antwort mit ${parsed.length} Ergebnis(sen)`);
    const p = parsed[0];
    if (p.error) throw new Error(`BD Scrape-Error: ${p.error}`);
    return mapBrightDataResult(p);
  }

  // Case 2: Asynchronous — snapshot_id returned, need to poll
  const snapshotId = parsed?.snapshot_id;
  if (snapshotId) {
    console.log(`[BD] Async-Modus, polling snapshot ${snapshotId}...`);
    const results = await pollSnapshot(snapshotId, apiKey);
    const p = results[0];
    if (p.error) throw new Error(`BD Scrape-Error: ${p.error}`);
    return mapBrightDataResult(p);
  }

  throw new Error(`Unerwartete Bright Data Antwort: ${rawText.substring(0, 300)}`);
}

function mapBrightDataResult(p) {

  // Log all available keys for debugging new fields
  console.log('[BD] Available fields:', Object.keys(p).join(', '));

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

  // ── New fields for Listing Quality Score ──
  // Prime badge
  if (p.is_prime != null) productData.isPrime = !!p.is_prime;
  else if (p.prime != null) productData.isPrime = !!p.prime;
  // Climate Pledge Friendly
  if (p.climate_pledge_friendly != null) productData.climatePledge = !!p.climate_pledge_friendly;
  else if (p.badges?.some(b => typeof b === 'string' ? b.toLowerCase().includes('climate') : b?.name?.toLowerCase().includes('climate'))) productData.climatePledge = true;
  // Buybox — compare buybox seller against the product's own seller (seller_name)
  const buyboxSeller = p.buybox_seller || p.buy_box_winner?.name || p.buy_box_winner || null;
  const productSeller = p.seller_name || null;
  if (buyboxSeller) productData.buyboxSeller = typeof buyboxSeller === 'string' ? buyboxSeller : String(buyboxSeller);
  if (productSeller) productData.seller = productSeller;
  if (p.inactive_buy_box != null) {
    productData.hasBuybox = false;
    // inactive_buy_box.delivery contains delivery info even when buybox is lost
    const ibDelivery = p.inactive_buy_box?.delivery;
    if (ibDelivery) {
      const ibStr = typeof ibDelivery === 'string' ? ibDelivery : ibDelivery?.text || JSON.stringify(ibDelivery);
      productData.deliveryRaw = String(ibStr).substring(0, 200);
      const dayMatch = String(ibStr).match(/(\d+)\s*(?:Tag|day|jour|día|giorn)/i);
      if (dayMatch) productData.deliveryDays = parseInt(dayMatch[1]);
    }
  } else if (buyboxSeller && productSeller) {
    // Buybox exists — check if buybox seller matches the product's own seller
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
    const bbNorm = norm(buyboxSeller);
    const sellerNorm = norm(productSeller);
    productData.hasBuybox = !!(bbNorm && sellerNorm && bbNorm === sellerNorm);
    if (!productData.hasBuybox) {
      console.log(`[BD] Buybox mismatch: seller="${productSeller}" vs buybox="${buyboxSeller}"`);
    }
  } else if (productSeller && !buyboxSeller) {
    // No separate buybox field — seller is likely the buybox winner
    productData.hasBuybox = true;
  }
  // Delivery / Shipping days (from main delivery field, if not already set via inactive_buy_box)
  if (productData.deliveryDays == null) {
    const deliveryStr = typeof p.delivery === 'string' ? p.delivery : Array.isArray(p.delivery) ? p.delivery[0] : p.delivery?.text || p.delivery_info || '';
    if (deliveryStr) {
      productData.deliveryRaw = String(deliveryStr).substring(0, 200);
      const dayMatch = String(deliveryStr).match(/(\d+)\s*(?:Tag|day|jour|día|giorn)/i);
      if (dayMatch) productData.deliveryDays = parseInt(dayMatch[1]);
    }
  }
  // A+ Content / Enhanced Brand Content — count modules
  const aplusRaw = p.a_plus_content ?? p.aplus ?? p.enhanced_content ?? null;
  if (aplusRaw != null) {
    if (Array.isArray(aplusRaw)) {
      // Structured: array of modules
      productData.aplusModuleCount = aplusRaw.length;
    } else if (typeof aplusRaw === 'string' && aplusRaw.length > 50) {
      // HTML string — count module containers (apm- divs or aplus-module sections)
      const moduleMatches = aplusRaw.match(/(?:class="apm-|class="aplus-module|<section|celwidget.*?aplus)/gi);
      productData.aplusModuleCount = moduleMatches ? moduleMatches.length : (aplusRaw.length > 200 ? 1 : 0);
    } else if (typeof aplusRaw === 'object' && aplusRaw !== null) {
      // Object with modules property
      const modules = aplusRaw.modules || aplusRaw.sections || aplusRaw.content;
      productData.aplusModuleCount = Array.isArray(modules) ? modules.length : (Object.keys(aplusRaw).length > 0 ? 1 : 0);
    } else {
      productData.aplusModuleCount = aplusRaw ? 1 : 0;
    }
    productData.hasAPlus = productData.aplusModuleCount > 0;
    console.log(`[BD] A+ modules detected: ${productData.aplusModuleCount}`);
  }
  // Brand Story
  if (p.brand_story != null) productData.hasBrandStory = !!p.brand_story;
  // Brand Store
  if (p.brand_store_url || p.brand_url || p.brand_page_url) productData.hasBrandStore = true;
  // Video
  if (p.videos?.length > 0 || p.video_count > 0) productData.hasVideo = true;

  // Extract image URLs from Bright Data response
  let imageUrls = [];
  if (Array.isArray(p.images)) {
    imageUrls = p.images.map(img => typeof img === 'string' ? img : img?.url || img?.link || '').filter(Boolean);
  } else if (p.main_image) {
    imageUrls = [p.main_image, ...(p.other_images || [])].filter(Boolean);
  }

  return { productData, imageUrls: imageUrls.slice(0, 7) };
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
    if (!bdKey) {
      return res.status(500).json({ error: 'BRIGHT_DATA_API_KEY nicht konfiguriert', code: 'NO_API_KEY', images: [], productData: {} });
    }

    const result = await scrapeBrightData(asin, domain, bdKey);
    const { productData, imageUrls } = result;
    const images = await fetchImagesBase64(imageUrls, domain);

    return res.status(200).json({ images, productData, asin, marketplace: domain });
  } catch (error) {
    return res.status(500).json({ error: error.message, code: 'SCRAPE_FAILED', images: [], productData: {} });
  }
}
