import { useState, useRef, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } from "docx";

const MAX_HL = 35, SOFT_HL = 30, FN = "'Outfit', system-ui, sans-serif";
const V = { violet: "#7C3AED", blue: "#2563EB", cyan: "#0891B2", teal: "#0D9488", emerald: "#059669", orange: "#EA580C", rose: "#E11D48", amber: "#D97706", ink: "#0F172A", text: "#334155", textMed: "#64748B", textDim: "#94A3B8" };
const glass = { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 18, boxShadow: "0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7)" };
const gS = { ...glass, background: "rgba(255,255,255,0.4)", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)" };
const BG = "linear-gradient(170deg, #f0f0ff 0%, #fff8f0 30%, #f0faf5 60%, #f8f0ff 100%)";
const Orbs = () => <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}><div style={{ position: "absolute", top: -80, right: -80, width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${V.violet}12, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${V.cyan}10, transparent 70%)` }} /></div>;
const inpS = { width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.6)", fontFamily: FN, fontSize: 13, color: V.ink, outline: "none", boxSizing: "border-box" };

const HK = "briefing_history", MH = 10;
// ═══════ SHARED HELPERS ═══════
const strip = s => (s || "").replace(/\*\*(.+?)\*\*/g, "$1");
const md2html = s => (s || "").replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const html2md = s => (s || "").replace(/<b>(.*?)<\/b>/gi, '**$1**').replace(/<strong>(.*?)<\/strong>/gi, '**$1**').replace(/<[^>]+>/g, '');
// Normalize bullet: handles both string "text" and {text, format} object format
const bText = b => typeof b === "string" ? b : b?.text || "";
const bFmt = b => { const f = typeof b === "string" ? "bullet" : (b?.format || "bullet"); return f === "headline" || f === "benefit-pill" ? "bullet" : f; };
const formatLabels = { display: "Display-Typografie", infocard: "Info-Karte", "zoom-label": "Zoom-Label", annotation: "Annotation/Label", "panel-text": "Kachel-Text", "step-overlay": "Schritt-Overlay", comparison: "Vergleichstext", "badge-context": "Badge m. Kontext", bullet: "Bullet Point (+ Icon)" };
const formatLabelsEn = { display: "Display Type", infocard: "Info Card", "zoom-label": "Zoom Label", annotation: "Annotation", "panel-text": "Panel Text", "step-overlay": "Step Overlay", comparison: "Comparison", "badge-context": "Badge", bullet: "Bullet Point (+ Icon)" };
const formatColors = { display: "#7C3AED", infocard: "#2563EB", "zoom-label": "#0891B2", annotation: "#D97706", "panel-text": "#059669", "step-overlay": "#0D9488", comparison: "#E11D48", "badge-context": "#D97706", bullet: "#64748B" };
const formatDescriptions = { display: "Große Typografie als visuelles Zentrum — Zahlen, Preise, Claims als Designelement", infocard: "Eigenständige Info-Karte mit Titel + Beschreibung", "zoom-label": "Text an einem Zoom-Inset oder Detail-Ausschnitt", annotation: "Label mit Pfeil/Linie an konkretem Produktteil", "panel-text": "Text innerhalb einer Bild-Kachel (Grid-Layout)", "step-overlay": "Schrittnummer + Titel auf Lifestyle-Foto", comparison: "Vergleichstext: eigenes Produkt vs. Alternative", "badge-context": "Siegel/Badge neben dem Feature das es belegt", bullet: "Aufzählungspunkt — Designer entscheidet ob mit/ohne Icon" };
const formatDescriptionsEn = { display: "Large typography as visual center — numbers, prices, claims as design element", infocard: "Standalone info card with title + description", "zoom-label": "Text bound to a zoom inset or detail view", annotation: "Label with arrow/line at a specific product part", "panel-text": "Text inside an image tile in grid layouts", "step-overlay": "Step number + title on lifestyle photo", comparison: "Comparison text: own product vs. alternative", "badge-context": "Seal/badge next to the feature it certifies", bullet: "Bullet point — designer decides with/without icon" };
// Eyecatcher helpers — backward compatible with old {idea, risk} format
const ecType = ec => ec?.type || (ec?.idea?.length <= 40 && ec?.idea?.split(" ").length <= 5 && /^[A-ZÄÖÜ0-9]/.test(ec?.idea || "") ? "text" : "visual");
const ecCopy = ec => ec?.copyText || (ecType(ec) !== "visual" ? ec?.idea : null);
// Format legend component — explains text element types with wireframe sketches
const formatWireframes = {
  display: (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}08`} stroke={`${c}40`} strokeWidth="1"/><rect x="8" y="10" width="48" height="14" rx="2" fill={`${c}25`}/><text x="32" y="21" textAnchor="middle" fontSize="9" fontWeight="900" fill={c}>47%</text><rect x="18" y="28" width="28" height="3" rx="1" fill={`${c}15`}/></svg>,
  infocard: (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><rect x="34" y="4" width="26" height="32" rx="3" fill="white" stroke={`${c}30`} strokeWidth="1"/><rect x="37" y="8" width="16" height="3" rx="1" fill={`${c}35`}/><rect x="37" y="14" width="20" height="2" rx="1" fill={`${c}15`}/><rect x="37" y="18" width="18" height="2" rx="1" fill={`${c}15`}/><rect x="37" y="22" width="20" height="2" rx="1" fill={`${c}15`}/><circle cx="16" cy="20" r="10" fill={`${c}10`} stroke={`${c}20`} strokeWidth="0.5" strokeDasharray="2 1"/></svg>,
  "zoom-label": (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><circle cx="20" cy="20" r="12" fill={`${c}10`} stroke={`${c}20`} strokeWidth="0.5" strokeDasharray="2 1"/><circle cx="48" cy="14" r="8" fill="white" stroke={`${c}35`} strokeWidth="1.5"/><line x1="30" y1="16" x2="40" y2="14" stroke={`${c}30`} strokeWidth="0.5" strokeDasharray="1 1"/><rect x="38" y="25" width="22" height="4" rx="1" fill={`${c}25`}/><rect x="38" y="31" width="16" height="2" rx="1" fill={`${c}12`}/></svg>,
  annotation: (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><rect x="18" y="8" width="20" height="24" rx="2" fill={`${c}10`} stroke={`${c}20`} strokeWidth="0.5" strokeDasharray="2 1"/><line x1="38" y1="14" x2="50" y2="10" stroke={c} strokeWidth="0.8"/><circle cx="50" cy="10" r="1.2" fill={c}/><rect x="44" y="6" width="16" height="3" rx="1" fill={`${c}30`}/><line x1="38" y1="26" x2="50" y2="30" stroke={c} strokeWidth="0.8"/><circle cx="50" cy="30" r="1.2" fill={c}/><rect x="44" y="28" width="14" height="3" rx="1" fill={`${c}30`}/></svg>,
  "panel-text": (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><rect x="4" y="4" width="27" height="15" rx="2" fill={`${c}12`} stroke={`${c}20`} strokeWidth="0.5"/><rect x="7" y="7" width="14" height="3" rx="1" fill={`${c}30`}/><rect x="7" y="12" width="20" height="2" rx="1" fill={`${c}15`}/><rect x="33" y="4" width="27" height="15" rx="2" fill={`${c}12`} stroke={`${c}20`} strokeWidth="0.5"/><rect x="36" y="7" width="12" height="3" rx="1" fill={`${c}30`}/><rect x="36" y="12" width="18" height="2" rx="1" fill={`${c}15`}/><rect x="4" y="21" width="27" height="15" rx="2" fill={`${c}12`} stroke={`${c}20`} strokeWidth="0.5"/><rect x="7" y="24" width="16" height="3" rx="1" fill={`${c}30`}/><rect x="7" y="29" width="20" height="2" rx="1" fill={`${c}15`}/><rect x="33" y="21" width="27" height="15" rx="2" fill={`${c}12`} stroke={`${c}20`} strokeWidth="0.5"/><rect x="36" y="24" width="14" height="3" rx="1" fill={`${c}30`}/><rect x="36" y="29" width="20" height="2" rx="1" fill={`${c}15`}/></svg>,
  "step-overlay": (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><rect x="4" y="4" width="18" height="32" rx="2" fill={`${c}08`} stroke={`${c}15`} strokeWidth="0.5"/><circle cx="13" cy="10" r="4" fill={c}/><text x="13" y="12.5" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">1</text><rect x="6" y="18" width="14" height="3" rx="1" fill={`${c}25`}/><rect x="23" y="4" width="18" height="32" rx="2" fill={`${c}08`} stroke={`${c}15`} strokeWidth="0.5"/><circle cx="32" cy="10" r="4" fill={c}/><text x="32" y="12.5" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">2</text><rect x="25" y="18" width="14" height="3" rx="1" fill={`${c}25`}/><rect x="42" y="4" width="18" height="32" rx="2" fill={`${c}08`} stroke={`${c}15`} strokeWidth="0.5"/><circle cx="51" cy="10" r="4" fill={c}/><text x="51" y="12.5" textAnchor="middle" fontSize="6" fontWeight="900" fill="white">3</text><rect x="44" y="18" width="14" height="3" rx="1" fill={`${c}25`}/></svg>,
  comparison: (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><line x1="32" y1="4" x2="32" y2="36" stroke={`${c}20`} strokeWidth="0.8" strokeDasharray="2 1"/><rect x="8" y="6" width="18" height="4" rx="1" fill="#05966930"/><text x="17" y="10" textAnchor="middle" fontSize="5" fill="#059669">Ours</text><rect x="38" y="6" width="18" height="4" rx="1" fill={`${c}25`}/><text x="47" y="10" textAnchor="middle" fontSize="5" fill={c}>Other</text><rect x="6" y="14" width="22" height="2" rx="1" fill="#05966918"/><rect x="6" y="19" width="20" height="2" rx="1" fill="#05966918"/><rect x="36" y="14" width="22" height="2" rx="1" fill={`${c}12`}/><rect x="36" y="19" width="18" height="2" rx="1" fill={`${c}12`}/></svg>,
  "badge-context": (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><rect x="20" y="10" width="20" height="20" rx="2" fill={`${c}10`} stroke={`${c}20`} strokeWidth="0.5" strokeDasharray="2 1"/><circle cx="50" cy="12" r="7" fill="white" stroke={c} strokeWidth="1.2"/><text x="50" y="14" textAnchor="middle" fontSize="5" fontWeight="700" fill={c}>TUV</text><rect x="42" y="22" width="18" height="3" rx="1" fill={`${c}20`}/><rect x="44" y="27" width="14" height="2" rx="1" fill={`${c}12`}/></svg>,
  bullet: (c) => <svg width="64" height="40" viewBox="0 0 64 40"><rect x="1" y="1" width="62" height="38" rx="3" fill={`${c}06`} stroke={`${c}40`} strokeWidth="1"/><circle cx="10" cy="11" r="2" fill={c}/><rect x="16" y="9.5" width="40" height="3" rx="1" fill={`${c}20`}/><circle cx="10" cy="21" r="2" fill={c}/><rect x="16" y="19.5" width="36" height="3" rx="1" fill={`${c}20`}/><circle cx="10" cy="31" r="2" fill={c}/><rect x="16" y="29.5" width="32" height="3" rx="1" fill={`${c}20`}/></svg>,
};
function FormatLegend({ lang = "de", defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const descs = lang === "en" ? formatDescriptionsEn : formatDescriptions;
  const labels = lang === "en" ? formatLabelsEn : formatLabels;
  const fmts = Object.keys(formatLabels);
  const isDesigner = defaultOpen;
  return <div style={{ ...gS, padding: open ? "14px 16px" : "8px 14px", marginBottom: 10, transition: "all 0.15s", ...(isDesigner && !open ? { border: `2px solid ${V.violet}40`, background: `${V.violet}08` } : {}), ...(isDesigner && open ? { border: `2px solid ${V.violet}25`, background: `${V.violet}04` } : {}) }}>
    <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
      <span style={{ fontSize: isDesigner ? 11 : 10, fontWeight: isDesigner ? 800 : 700, color: isDesigner ? V.violet : V.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>{lang === "en" ? "Text Format Guide" : "Textformat-Legende"}</span>
      <span style={{ fontSize: 11, color: isDesigner ? V.violet : V.textDim, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
    </div>
    {open && <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
      {fmts.map(f => { const c = formatColors[f]; return <div key={f} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 10, background: `${c}04`, border: `1px solid ${c}12` }}>
        <div style={{ flexShrink: 0 }}>{formatWireframes[f]?.(c)}</div>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: c, textTransform: "uppercase", letterSpacing: ".04em", padding: "1px 5px", borderRadius: 3, background: `${c}12`, display: "inline-block", marginBottom: 3 }}>{labels[f]}</span>
          <div style={{ fontSize: 10, color: V.textMed, lineHeight: 1.4 }}>{descs[f]}</div>
        </div>
      </div>; })}
    </div>}
  </div>;
}
// Compress/resize images to stay under Vercel's 4.5MB body limit
function compressImage(dataUrl, maxDim = 800, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
const getAllBadges = te => [...(te?.badges || []), ...(te?.callouts || [])];
const getSelectedBadge = (bdgSel, imgId, allBadges) => {
  const v = bdgSel?.[imgId];
  if (v === false) return { idx: -1, badge: null }; // backward compat: old boolean false = no badge
  const idx = typeof v === "number" ? v : (allBadges.length > 0 ? 0 : -1);
  return { idx, badge: idx >= 0 && idx < allBadges.length ? allBadges[idx] : null };
};
const fmtDate = (d) => { try { return new Date(d + "Z").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d || ""; } };
function loadH() { try { return JSON.parse(localStorage.getItem(HK) || "[]"); } catch { return []; } }
function saveH(d, asin) { const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4); const h = loadH(); h.unshift({ id, name: d.product?.name || "?", brand: d.product?.brand || "", asin: asin || d.product?.sku || "", date: new Date().toLocaleDateString("de-DE"), data: d }); if (h.length > MH) h.pop(); try { localStorage.setItem(HK, JSON.stringify(h)); } catch {} return id; }
function encodeBriefing(d) { try { const json = JSON.stringify(d); const bytes = new TextEncoder().encode(json); const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")); return new Response(cs).arrayBuffer().then(buf => { let b = ""; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i++) b += String.fromCharCode(u8[i]); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }); } catch { return Promise.resolve(null); } }
function decodeBriefing(s) { try { const b64 = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")); return new Response(ds).text().then(t => JSON.parse(t)); } catch { return Promise.resolve(null); } }

// ═══════ HELIUM10 CSV PARSER ═══════
function parseHelium10CSV(csvText) {
  if (!csvText || !csvText.trim()) return null;
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  // Detect separator (comma or semicolon)
  const sep = lines[0].includes("\t") ? "\t" : lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  // Parse header row - handle quoted fields
  const parseRow = (line) => {
    const fields = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === sep && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    fields.push(cur.trim());
    return fields;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^\w\s]/g, "").trim());
  // Find column indices - flexible matching for different Helium10 versions
  const findCol = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));
  const colKw = findCol("keyword phrase", "keyword", "search term", "suchbegriff");
  const colSV = findCol("search volume", "suchvolumen", "volume");
  const colCPR = findCol("cpr", "cerebro product rank", "cpp");
  const colOrg = findCol("organic rank", "organischer rang", "organic position");
  const colSpon = findCol("sponsored rank", "sponsored position", "gesponsert");
  const colComp = findCol("competing products", "competing", "konkurrenzprodukte");
  const colSFR = findCol("search frequency rank", "sfr", "amazon search frequency");
  const colTitleDensity = findCol("title density", "titeldichte");
  const colIQ = findCol("cerebro iq", "iq score");
  const colKwSales = findCol("keyword sales", "kw sales");
  if (colKw === -1) return null; // Must have keyword column
  const keywords = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseRow(lines[i]);
    const kw = row[colKw]?.trim();
    if (!kw) continue;
    const num = (idx) => { if (idx === -1 || !row[idx]) return null; const v = row[idx].replace(/[,.\s]/g, m => m === "." ? "" : m === "," ? "" : ""); const n = parseInt(v); return isNaN(n) ? null : n; };
    keywords.push({
      keyword: kw,
      searchVolume: num(colSV),
      cpr: num(colCPR),
      organicRank: num(colOrg),
      sponsoredRank: num(colSpon),
      competingProducts: num(colComp),
      sfr: num(colSFR),
      titleDensity: num(colTitleDensity),
      cerebroIQ: num(colIQ),
      keywordSales: num(colKwSales),
    });
  }
  if (keywords.length === 0) return null;
  return { keywords, totalCount: keywords.length, hasVolume: keywords.some(k => k.searchVolume !== null), hasCPR: keywords.some(k => k.cpr !== null) };
}

// Score and filter keywords by relevance (search volume + conversion strength)
function filterH10Keywords(h10Data, maxVolume = 25, maxPurchase = 20) {
  if (!h10Data?.keywords?.length) return null;
  const kws = h10Data.keywords.filter(k => k.keyword && k.keyword.length > 1);
  // Score each keyword: higher = more relevant
  const scored = kws.map(k => {
    let score = 0;
    // Search volume score (0-50 points)
    if (k.searchVolume !== null) {
      if (k.searchVolume >= 10000) score += 50;
      else if (k.searchVolume >= 5000) score += 40;
      else if (k.searchVolume >= 1000) score += 30;
      else if (k.searchVolume >= 300) score += 20;
      else if (k.searchVolume >= 100) score += 10;
      else score += 5;
    }
    // CPR score (lower = easier to rank = bonus, 0-30 points)
    if (k.cpr !== null) {
      if (k.cpr <= 5) score += 30;
      else if (k.cpr <= 15) score += 25;
      else if (k.cpr <= 50) score += 20;
      else if (k.cpr <= 100) score += 15;
      else score += 5;
    }
    // Organic rank bonus (if we rank, keyword is proven relevant)
    if (k.organicRank !== null && k.organicRank > 0 && k.organicRank <= 50) score += 10;
    // Title density bonus (others use it in title = important)
    if (k.titleDensity !== null && k.titleDensity > 50) score += 5;
    // Cerebro IQ bonus (high = good opportunity)
    if (k.cerebroIQ !== null && k.cerebroIQ >= 3) score += 10;
    // Keyword sales bonus (proven revenue keyword)
    if (k.keywordSales !== null && k.keywordSales > 0) score += 15;
    return { ...k, score };
  });
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  // Volume keywords: high search volume, broad terms
  const volumeKws = scored
    .filter(k => k.searchVolume !== null && k.searchVolume >= 100)
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
    .slice(0, maxVolume);
  // Purchase keywords: good conversion indicators (have CPR data or are long-tail with decent volume)
  const purchaseKws = scored
    .filter(k => {
      const hasConversion = k.cpr !== null && k.cpr > 0;
      const isLongTail = k.keyword.split(/\s+/).length >= 2;
      const hasVolume = k.searchVolume !== null && k.searchVolume >= 50;
      return (hasConversion && hasVolume) || (isLongTail && hasVolume);
    })
    .sort((a, b) => {
      // Sort by conversion strength: low CPR first, then by volume
      const cprA = a.cpr ?? 999, cprB = b.cpr ?? 999;
      if (cprA !== cprB) return cprA - cprB;
      return (b.searchVolume || 0) - (a.searchVolume || 0);
    })
    .slice(0, maxPurchase);
  return { volume: volumeKws, purchase: purchaseKws, all: scored };
}

// ═══════ PROMPT ═══════
const buildPrompt = (asin, mp, pi, ft, productData, density, keywordData, reviewData, refData, imageCount, h10Keywords) => {
  const hasA = asin && asin.trim();
  const numImages = imageCount || 7;
  const pd = productData || {};
  let scraped = "";
  if (pd.title || pd.brand || pd.price || pd.bullets?.length) {
    scraped = "\nAMAZON-DATEN:\n";
    if (pd.title) scraped += `Titel: ${pd.title}\n`;
    if (pd.brand) scraped += `Marke: ${pd.brand}\n`;
    if (pd.price) scraped += `Preis: ${pd.price}\n`;
    if (pd.rating) scraped += `Bewertung: ${pd.rating}/5 (${pd.reviewCount || "?"} Reviews)\n`;
    if (pd.bsr) scraped += `BSR: #${pd.bsr}${pd.category ? " in " + pd.category : ""}\n`;
    if (pd.bullets?.length) scraped += `Bullets:\n${pd.bullets.slice(0, 5).map(b => "- " + b).join("\n")}\n`;
    if (pd.description) scraped += `Beschreibung: ${pd.description.substring(0, 300)}\n`;
  }
  let kwData = "";
  // Use Helium10 keyword data if available (real search volumes + conversion metrics)
  if (h10Keywords?.volume?.length || h10Keywords?.purchase?.length) {
    kwData = "\nAMAZON KEYWORD-DATEN (Helium10 Cerebro — echte Suchvolumen & Conversion-Daten):";
    if (h10Keywords.volume?.length) {
      kwData += "\n\nHAUPT-KEYWORDS nach Suchvolumen:";
      h10Keywords.volume.forEach(k => {
        kwData += `\n  "${k.keyword}" | SV: ${k.searchVolume?.toLocaleString("de-DE") || "?"}/Monat`;
        if (k.cpr) kwData += ` | CPR: ${k.cpr}`;
        if (k.organicRank) kwData += ` | Org.Rank: #${k.organicRank}`;
        if (k.keywordSales) kwData += ` | Sales: ~${k.keywordSales}/Monat`;
      });
    }
    if (h10Keywords.purchase?.length) {
      kwData += "\n\nKAUFINTENT-KEYWORDS (hohe Conversion-Wahrscheinlichkeit):";
      h10Keywords.purchase.forEach(k => {
        kwData += `\n  "${k.keyword}" | SV: ${k.searchVolume?.toLocaleString("de-DE") || "?"}/Monat`;
        if (k.cpr) kwData += ` | CPR: ${k.cpr} (${k.cpr <= 10 ? "leicht zu ranken" : k.cpr <= 50 ? "mittelschwer" : "schwer"})`;
        if (k.keywordSales) kwData += ` | Sales: ~${k.keywordSales}/Monat`;
      });
    }
    kwData += "\n\nWICHTIG: Diese Keywords basieren auf echten Amazon-Suchdaten. Verwende VORRANGIG die Keywords mit hohem Suchvolumen in Headlines und Bullets. Die Kaufintent-Keywords sind besonders wertvoll für Conversion. Arbeite so viele wie möglich natürlich in die Texte ein.";
    // Still include competitor data from Bright Data if available
    if (keywordData?.competitors?.length) {
      kwData += `\n\nWETTBEWERBER (${keywordData.competitors.length} Produkte auf Seite 1):`;
      keywordData.competitors.slice(0, 8).forEach((c, i) => {
        kwData += `\n  ${i + 1}. ${c.brand || "?"}: ${c.title?.substring(0, 80) || "?"} | ${c.price || "?"}${c.currency || ""} | ${c.rating || "?"}★ (${c.reviewCount || "?"} Rev.) | ${c.bulletCount} Bullets | ${c.imageCount} Bilder`;
      });
    }
  } else {
    // Fallback: Bright Data word-frequency data
    const hasKwData = keywordData && (keywordData.searchTerms?.length > 0 || keywordData.competitors?.length > 0);
    if (hasKwData) {
      kwData = "\nAMAZON KEYWORD-DATEN (Wettbewerber-Analyse):";
      if (keywordData.searchTerms?.length) kwData += `\nHäufige Begriffe in Wettbewerber-Titeln: ${keywordData.searchTerms.slice(0, 15).map(t => t.term + "(" + t.frequency + "x)").join(", ")}`;
      if (keywordData.competitorKeywords?.length) kwData += `\nHäufige Begriffe in Wettbewerber-Bullets: ${keywordData.competitorKeywords.slice(0, 10).map(t => t.term + "(" + t.frequency + "x)").join(", ")}`;
      if (keywordData.competitors?.length) {
        kwData += `\nTOP-WETTBEWERBER (${keywordData.competitors.length} Produkte auf Seite 1):`;
        keywordData.competitors.slice(0, 8).forEach((c, i) => {
          kwData += `\n  ${i + 1}. ${c.brand || "?"}: ${c.title?.substring(0, 80) || "?"} | ${c.price || "?"}${c.currency || ""} | ${c.rating || "?"}★ (${c.reviewCount || "?"} Rev.) | ${c.bulletCount} Bullets | ${c.imageCount} Bilder`;
        });
      }
      kwData += "\nHinweis: Keine Helium10-Daten vorhanden. Die Keyword-Häufigkeiten basieren auf Wettbewerber-Analyse. Nutze dein Wissen über Amazon-Suchverhalten zusätzlich.";
    } else {
      kwData = "\nKEINE KEYWORD-DATEN VERFÜGBAR. WICHTIG: Recherchiere die Keywords besonders sorgfältig basierend auf deinem Wissen über Amazon-Suchverhalten für diese Produktkategorie. Kennzeichne alle Keywords im Output mit used:true/false.";
    }
  }
  // Bestseller benchmark data
  if (keywordData?.bestseller) {
    const bs = keywordData.bestseller;
    kwData += `\n\nKEYWORD-BESTSELLER (relevantester Wettbewerber als Benchmark):`;
    kwData += `\n  ${bs.brand || "?"}: ${bs.title?.substring(0, 100) || "?"}`;
    kwData += `\n  Preis: ${bs.price || "?"} | Bewertung: ${bs.rating || "?"}★ (${bs.reviewCount || "?"} Reviews)`;
    if (bs.bsr) kwData += ` | BSR: #${bs.bsr}`;
    if (bs.bullets?.length) kwData += `\n  Bullets: ${bs.bullets.slice(0, 5).map(b => "- " + b.substring(0, 80)).join("\n  ")}`;
    kwData += "\n  Analysiere was diesen Bestseller erfolgreich macht und nutze Erkenntnisse für die Positionierung.";
  }
  let rvData = "";
  if (reviewData?.reviews?.length) {
    rvData = `\nECHTE AMAZON-BEWERTUNGEN (${reviewData.totalReviews} total, Durchschnitt ${reviewData.avgRating}/5):`;
    rvData += "\n" + reviewData.reviews.slice(0, 25).map(r => `[${r.rating}★${r.verified ? " Verifiziert" : ""}] ${r.title}: ${r.text.substring(0, 200)}`).join("\n");
    rvData += "\nAnalysiere diese echten Bewertungen für die Review-Sektion. Gruppiere nach Themen, berechne relative Häufigkeiten.";
  }
  const densityHint = density === "light" ? "\nTEXTDICHTE: Wenig Text. Kurze Headlines, kurze Bullets (max 4-5 Wörter), weniger Bullets (max 3). Subheadlines optional." : "";
  let refSection = "";
  if (refData?.images?.length > 0) {
    const isManual = refData.isManual;
    if (isManual) {
      refSection = `\n\nREFERENZ-MODUS (MANUELL HOCHGELADEN): Die oben angehängten ${refData.images.length} Bilder sind bereits fertige Produktbilder eines BESTEHENDEN Listings dieser Marke.`;
    } else {
      refSection = `\n\nREFERENZ-MODUS: Die oben angehängten ${refData.images.length} Bilder sind die aktuellen Galeriebilder eines BESTEHENDEN Amazon-Listings (Referenz-ASIN: ${refData.asin || "unbekannt"}).`;
    }
    if (refData.productData?.title) refSection += `\nReferenz-Produkt: ${refData.productData.title}`;
    if (refData.productData?.brand) refSection += ` | Marke: ${refData.productData.brand}`;
    refSection += `\n\nANALYSIERE die Referenz-Bilder visuell und übernimm EXAKT:
- Bildaufbau pro Bild: Wo ist das Produktfoto, wo sind Textelemente platziert?
- Bild-Text-Verhältnis: Wie viel Fläche nimmt Text vs. Bild ein?
- Textarten pro Bild: Headline-Stil, Subheadline-Stil, Anzahl Bullets, Badge-Nutzung
- Visueller Stil: Farbschema, Hintergrundstil, Typografie-Charakter
- Layoutstruktur: Grid, Spalten, Freiflächen, Bildkomposition

ERSTELLE ein NEUES Briefing mit EXAKT diesem Aufbau und Stil, aber tausche ALLE Inhalte gegen das neue Produkt aus.`;
    if (refData.newProductText) refSection += `\n\nNEUE PRODUKTDATEN (diese Inhalte verwenden statt der Referenz-Inhalte):\n${refData.newProductText}`;
    refSection += "\n";
  }
  const imgCountHint = numImages < 7 ? `\nBILDANZAHL: Erstelle ein Briefing für EXAKT ${numImages} Bild${numImages === 1 ? "" : "er"} (1 Main Image${numImages > 1 ? ` + ${numImages - 1} weitere Bilder` : ""}). ALLE relevanten USPs, Features und Produktvorteile MÜSSEN auf diesen ${numImages} Bildern untergebracht werden. Keine Informationen weglassen, sondern auf die vorhandenen Bilder verdichten.` : "";
  return `Analysiere ${hasA ? "ASIN " + asin + " auf " : ""}${mp || "Amazon.de"}. Erstelle ${numImages}-Bild-Briefing.
${pi ? "Produkt: " + pi : ""}${ft ? "\nHinweise: " + ft : ""}${scraped}${kwData}${rvData}${densityHint}${refSection}${imgCountHint}
REGELN:
- BILDKONZEPT-DENKEN: Beschreibe KEINE "Bilder mit Text darüber", sondern INTEGRIERTE BILDKONZEPTE. Jedes Textelement hat eine konkrete Position, Größe und visuelle Beziehung zu Bildelementen. Der Designer muss beim Lesen sofort das fertige Bild vor seinem inneren Auge sehen.
- TEXTFORMAT-VIELFALT: Verwende verschiedene Textformate passend zum Bildinhalt. NICHT einfach nur "Bullet Points" — wähle das Format das den Inhalt am besten transportiert:
  * "display": Große Typografie als visuelles Zentrum (Zahlen, Preise, Claims als Designelement)
  * "infocard": Eigenständige Info-Karte mit Titel + Beschreibung neben dem Produkt
  * "zoom-label": Text gebunden an ein Zoom-Inset oder Detail-Ansicht
  * "annotation": Label mit Pfeil/Linie an einem konkreten Produktteil
  * "panel-text": Text innerhalb einer Bild-Kachel (bei Grid-Layouts)
  * "step-overlay": Schrittnummer + Titel + Erklärung auf Lifestyle-Foto
  * "comparison": Vergleichstext (Zeile 1 = eigenes Produkt, Zeile 2 = Alternative, getrennt durch \n)
  * "badge-context": Siegel/Badge mit spezifischer Platzierung neben dem Feature das es belegt
  * "bullet": Aufzählungspunkt (Designer entscheidet ob mit/ohne Icon)
  KEIN "headline" Format verwenden — Headlines werden separat in texts.headlines definiert.
  WICHTIG: Wähle pro Bild die Formate die inhaltlich SINN ergeben. Ein Detailbild → zoom-labels + annotations. Eine Anleitung → step-overlays. Ein Vergleich → comparison. Features → info-cards oder bullets. NICHT alles als bullets.
- In concept UND visual KEINE konkreten Designentscheidungen treffen (keine Farben, Transparenzen, Schriftgrößen, Hintergrundstile). Das ist Sache des Designers.
- concept = Grobe inhaltliche Beschreibung des Bildes: Was zeigt das Bild? Welche Elemente sind zu sehen? Welche Geschichte/Aussage transportiert es? Beschreibe die KOMPOSITION (Produktplatzierung, Szene, Textelemente als Bestandteil der Komposition).
- visual = Hinweise NUR wenn Textelemente in VISUELLER BEZIEHUNG zu Bildelementen stehen müssen. Beispiele: "Zoom-Labels zeigen auf die konkreten Produktdetails", "Annotations verbinden sich per Linie mit den beschriebenen Produktteilen", "Step-Overlay-Nummern liegen auf den jeweiligen Anwendungsschritten". Wenn keine besondere Text-Bild-Beziehung nötig ist, reicht ein kurzer Hinweis zum Bildstil (z.B. "Clean Freisteller", "Warme Lifestyle-Szene"). KEINE Typografie-Anweisungen, KEINE Farbvorgaben, KEINE Hintergrund-Spezifikationen.
- Headlines: max 25 Zeichen, 3 Varianten. KEINE Gedankenstriche (—, –, -) in allen Textelementen. Keine Kommas.
  1. "USP": Das TECHNISCHE/FAKTISCHE Alleinstellungsmerkmal als Headline. Nenne die KONKRETE PRODUKTEIGENSCHAFT die dieses Produkt von der Konkurrenz abhebt — Material, Technologie, Maß, Leistungswert, Zertifizierung, Mechanismus. Beispiele: "8h Akkulaufzeit", "Premium-Silikon", "3-Schicht-Filter", "Medical Grade 316L", "40mm Treiber". NIEMALS einen Nutzen oder Vorteil formulieren — nur das nackte Produktmerkmal/die Spezifikation.
  2. "Kundenvorteil": Der NUTZEN aus Kundensicht — was ändert sich im Alltag des Kunden? Formuliere das ERGEBNIS das der Kunde erlebt, NICHT das Feature. Beispiele: "Nie wieder Verbrennungen", "Den ganzen Tag Musik", "Schluss mit Kabelsalat". Die USP-Headline sagt WAS das Produkt hat, die Kundenvorteil-Headline sagt WAS DER KUNDE DAVON HAT.
  3. "Kreativ": Emotionale, aufmerksamkeitsstarke Variante. MUSS ein grammatisch vollständiger, natürlich klingender deutscher Ausdruck sein (z.B. "Kochen wie ein Profi", "Dein Küchen-Upgrade", "Endlich sorglos grillen"). KEINE einzelnen Adjektive oder abgehackten Wortfragmente. Jede kreative Headline MUSS im normalen Sprachgebrauch Sinn ergeben.
- Subheadlines: 3 Varianten (kurz/erklärend/emotional). Dürfen auch leer bleiben falls nicht nötig. KEINE Gedankenstriche.
- Bullets/Textbausteine: Jeder Textbaustein hat ein "format" Feld das seinen Typ beschreibt. So viele wie inhaltlich sinnvoll (2-6), NICHT immer gleich viele pro Bild. Schlüsselwörter mit **fett** markieren. Max 1-2 Fettungen pro Eintrag. KEINE Gedankenstriche. Korrekte deutsche Grammatik. Format-Mix erwünscht!
- Badge: Max 1 Badge pro Bild. Nur bei wirklich herausragenden Fakten. badges ist ein Array mit 0 oder 1 Einträgen. KEINE Gedankenstriche.
- Bildtexte DE. Concept/Rationale/Visual jeweils ZWEISPRACHIG: concept(DE) + conceptEn(EN), rationale(DE) + rationaleEn(EN), visual(DE) + visualEn(EN). Keywords integrieren.
- Lifestyle ohne Text-Overlay: concept+visual DETAILLIERT (Szenerie, Personen, Stimmung, Kamera). "Kein Text" ist eine bewusste, valide Option — texts:null setzen.
- KEIN Split-Screen als Standardlayout! Split-Screen/geteiltes Bild nur wenn es inhaltlich Sinn ergibt (z.B. Vorher/Nachher, Vergleich eigenes Produkt vs. Alternative). Die meisten Produktbilder sollen EINZELNE Szenen zeigen, nicht zwei Hälften. Variiere die Bildlayouts: Freisteller, Lifestyle-Szene, Detailaufnahme, Infografik, Querschnitt, Grid/Kacheln, etc.
- KATEGORIE-BEWUSSTSEIN: Lifestyle/Fashion-Produkte → weniger Text, mehr Fotografie, 2-3 Bilder können textfrei sein. Technische Produkte → mehr Annotations, Zoom-Labels, Callouts. Nahrungsergänzung/Health → Info-Karten, Benefit-Pills, Schritt-Overlays.
- Fussnoten mit * im referenzierten Text kennzeichnen (z.B. "Laborgetestet*") und Fussnote beginnt mit "* ...".
- Reviews: relative %, absteigend, deutlich unterschiedlich (nicht alle 30-35%).
- Blacklist: vulgaer, negative Laendernennung, Wettbewerber-Vergleiche, unbelegte Statistiken.
- Siegel: nur beantragungspflichtige. Kaufausloeser absteigend. Keywords: used true/false.
- NUTZER-ANWEISUNGEN: Falls der Nutzer in der Produktbeschreibung oder den Hinweisen Vorgaben macht, MÜSSEN diese beachtet werden. Das können sein: konkrete Bild-Zuordnungen ("Bild 1 soll X zeigen"), grobe thematische Ideen ("irgendwas mit Nachhaltigkeit auf einem Bild"), gewünschte Aspekte die vorkommen sollen ("Bitte die Verpackung hervorheben"), Image-Ideen die aufgegriffen und professionell ausformuliert werden sollen, oder generelle Hinweise zu Stil/Tonalität. Konkrete Vorgaben exakt übernehmen, vage Anregungen professionell interpretieren und ins Briefing einarbeiten.
- KEYWORDS: Recherchiere echte Amazon-Suchbegriffe, die Kunden tatsächlich in die Amazon-Suche eingeben würden, um dieses spezifische Produkt zu finden. Volume-Keywords = Hauptsuchbegriffe mit hohem Suchvolumen (z.B. "Nudelsieb", "Sieb Küche", "Abtropfsieb"). Purchase-Keywords = Kaufentscheidende Suchbegriffe, die auf konkrete Kaufabsicht hindeuten (z.B. "Nudelsieb Silikon", "Nudelsieb faltbar"). KEINE generischen Adjektive wie "BPA-frei" oder "hitzebeständig" als alleinstehende Keywords verwenden.

BILDER: ${numImages === 7 ? "Main(kein Text, 3 Eyecatcher mit risk:low/medium), PT01(STAERKSTER Kauftrigger), PT02(Differenzierung), PT03(Lifestyle/emotional), PT04-06(Einwandbehandlung neg. Reviews)." : `Erstelle EXAKT ${numImages} Bilder. Main Image (kein Text, 3 Eyecatcher). Die weiteren ${numImages - 1} Bilder decken die wichtigsten USPs, Features und Kauftrigger ab. ALLE relevanten Produktinformationen auf ${numImages} Bilder verteilen, nichts weglassen.`}
Jedes Bild MUSS ein "theme" Feld haben: Kurze Beschreibung des Bildthemas (2-4 Wörter, DE), z.B. "Materialqualität", "Lifestyle Küche", "Größenvergleich".
EYECATCHER-TYPEN (nur Main Image): Jeder Eyecatcher hat type + copyText + idea + risk. Typen:
- type:"text" → Konkreter Text der AUF das Bild kommt (z.B. "4x5 Meter", "Made in Germany"). copyText = der EXAKTE Text zum Copy/Paste.
- type:"badge" → Badge/Siegel-Text der als Badge auf dem Bild erscheint (z.B. "Inklusive Befestigungszubehör", "TÜV geprüft"). copyText = der EXAKTE Badge-Text.
- type:"visual" → Visueller Darstellungshinweis OHNE kopierbaren Text (z.B. Produkt im Einsatz zeigen, Maschenweite sichtbar machen). copyText = null.
WICHTIG: copyText enthält NUR den Text der 1:1 auf das Bild soll, NICHT die Platzierungsanweisung. Die Anweisung kommt in idea.

NUR JSON, keine Backticks/Markdown:
{product:{name,brand,sku,marketplace,category,price,position}, audience:{persona,desire,fear,triggers:[absteigend],balance}, listingWeaknesses:${hasA ? "[{weakness,impact:high/medium/low,briefingAction}]" : "null"}, reviews:{source,estimated:true, positive:[{theme,pct}], negative:[{theme,pct,quotes:[],status:solved/unclear/neutral,implication}]}, keywords:{volume:[{kw,used:bool}],purchase:[{kw,used:bool}],badges:[{kw,note,requiresApplication:bool}]}, competitive:{patterns,gaps:[]}, images:[${numImages} Objekte mit id:main${numImages > 1 ? "/pt01" : ""}${numImages > 2 ? `-pt0${Math.min(numImages - 1, 6)}` : ""}, label, theme(DE kurz 2-4 Wörter), role, concept(DE), conceptEn(EN), rationale(DE), rationaleEn(EN), visual(DE), visualEn(EN), texts:{headlines:[3],subheadlines:[3 Varianten oder leeres Array],bullets:[{text:"**fett** markierter Text",format:"display|infocard|zoom-label|annotation|panel-text|step-overlay|comparison|badge-context|bullet"}],badges:["max 1 oder leer"],footnotes:["* Fussnotentext"]}|null, eyecatchers(nur main):[{type:"text"|"visual"|"badge",copyText:"exakter Text"|null,idea:"Beschreibung/Anweisung",risk:"low"|"medium"}]]}`;
};

// ═══════ JSON EXTRACTION ═══════
function extractJSON(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    if (c === "}") { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

// ═══════ API ═══════
async function runAnalysis(asin, mp, pi, ft, onS, productData, density, keywordData, reviewData, refData, imageCount, h10Keywords) {
  onS("Sende Analyse-Anfrage...");
  // Build user message content
  let userContent;
  if (refData?.images?.length > 0) {
    // Vision mode: send reference images + text prompt
    const imgBlocks = refData.images.slice(0, 7).filter(img => img?.base64).map((img, i) => {
      const raw = img.base64.replace(/^data:[^;]+;base64,/, "");
      const mt = img.base64.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
      return { type: "image", source: { type: "base64", media_type: mt, data: raw } };
    });
    userContent = [...imgBlocks, { type: "text", text: buildPrompt(asin, mp, pi, ft, productData, density, keywordData, reviewData, refData, imageCount, h10Keywords) }];
  } else {
    userContent = buildPrompt(asin, mp, pi, ft, productData, density, keywordData, reviewData, null, imageCount, h10Keywords);
  }
  let r;
  try {
    r = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        stream: true,
        system: "Amazon Listing Analyst. Antworte NUR mit validem JSON. Kein Markdown/Codeblocks/Text. Antwort beginnt mit { und endet mit }.",
        messages: [{ role: "user", content: userContent }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
  } catch { throw new Error("Netzwerkfehler: API nicht erreichbar."); }
  if (!r.ok) {
    const statusMessages = {
      400: "Ungültige Anfrage — bitte Eingaben prüfen",
      401: "API-Key ungültig oder nicht konfiguriert",
      403: "Zugriff verweigert — API-Key hat keine Berechtigung",
      404: "API-Endpunkt nicht gefunden",
      413: "Anfrage zu groß — zu viele Referenzbilder oder zu langer Text",
      429: "Rate-Limit erreicht — zu viele Anfragen. Bitte 30 Sekunden warten und erneut versuchen",
      500: "Interner Serverfehler — bitte erneut versuchen",
      503: "KI-Service vorübergehend nicht verfügbar (Überlastung). Bitte 1-2 Minuten warten und erneut versuchen",
      504: "Zeitüberschreitung — die Analyse hat zu lange gedauert. Bitte erneut versuchen (evtl. weniger Referenzbilder nutzen)",
      529: "KI-Service überlastet. Bitte einige Minuten warten und erneut versuchen",
    };
    let detail = "";
    try { const e = await r.json(); detail = e.error?.message || ""; } catch {}
    const desc = statusMessages[r.status] || "Unbekannter Fehler";
    throw new Error(`API-Fehler ${r.status}: ${desc}${detail ? ` (${detail})` : ""}`);
  }
  // ── Read SSE stream from server ──
  onS("KI analysiert...");
  // Fallback: if server returned JSON instead of SSE (e.g. cached old version), parse directly
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const d = await r.json();
    if (d.stop_reason === "max_tokens") throw new Error("Antwort wurde abgeschnitten (Token-Limit). Bitte versuche es erneut.");
    const textBlocks = (d.content || []).filter(i => i.type === "text").map(i => i.text).filter(Boolean);
    if (!textBlocks.length) throw new Error("Keine Antwort erhalten.");
    onS("Erstelle Briefing...");
    let p = null;
    for (const block of textBlocks) {
      const cl = block.replace(/```json\s*|```\s*/g, "").trim();
      try { p = JSON.parse(cl); break; } catch {}
      const ex = extractJSON(cl); if (ex) { try { p = JSON.parse(ex); break; } catch {} }
    }
    if (!p) {
      const full = textBlocks.join("\n").replace(/```json\s*|```\s*/g, "").trim();
      try { p = JSON.parse(full); } catch {}
      if (!p) { const ex = extractJSON(full); if (ex) { try { p = JSON.parse(ex); } catch {} } }
      if (!p) { const m = full.match(/\{[\s\S]*\}/); if (m) { try { p = JSON.parse(m[0]); } catch {} } }
    }
    if (!p) throw new Error("JSON konnte nicht geparst werden. Bitte versuche es erneut.");
    if (!p.product || !p.images) throw new Error("Unvollstaendige Antwort: 'product' oder 'images' fehlt. Bitte erneut versuchen.");
    return p;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  const contentBlocks = []; // {type, text, ...}
  let stopReason = null;
  let lastDataTime = Date.now();
  const STALL_TIMEOUT = 90000; // 90s without data = stalled
  // Stall detection: check every 5s if data stopped flowing
  const stallChecker = setInterval(() => {
    const elapsed = Date.now() - lastDataTime;
    if (elapsed > STALL_TIMEOUT) {
      reader.cancel();
      clearInterval(stallChecker);
    } else if (elapsed > 30000) {
      onS("KI arbeitet noch... (lange Analyse)");
    }
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastDataTime = Date.now();
      sseBuffer += decoder.decode(value, { stream: true });
      // Parse SSE events from buffer
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || ""; // keep incomplete line
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        let evt;
        try { evt = JSON.parse(raw); } catch { continue; }
        const t = evt.type;
        if (t === "message_start") {
          // noop — message metadata
        } else if (t === "content_block_start") {
          contentBlocks.push({ type: evt.content_block?.type || "text", text: "" });
        } else if (t === "content_block_delta") {
          const delta = evt.delta;
          if (delta?.type === "text_delta" && delta.text) {
            const idx = contentBlocks.length - 1;
            if (idx >= 0) contentBlocks[idx].text += delta.text;
          }
          // Live status based on what Claude is doing
          if (delta?.type === "text_delta") onS("Schreibt Briefing...");
          if (delta?.type === "input_json_delta") onS("Web-Recherche...");
        } else if (t === "content_block_stop") {
          // block finished
        } else if (t === "message_delta") {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        } else if (t === "message_stop") {
          // done
        } else if (t === "error") {
          throw new Error(evt.error?.message || "Stream-Fehler");
        }
      }
    }
  } finally {
    clearInterval(stallChecker);
  }
  if (Date.now() - lastDataTime > STALL_TIMEOUT) {
    throw new Error("Verbindung abgebrochen — keine Daten mehr vom KI-Service. Bitte erneut versuchen.");
  }
  if (stopReason === "max_tokens") throw new Error("Antwort wurde abgeschnitten (Token-Limit). Bitte versuche es erneut.");
  const textBlocks = contentBlocks.filter(b => b.type === "text" && b.text).map(b => b.text);
  if (!textBlocks.length) throw new Error("Keine Antwort erhalten.");
  onS("Erstelle Briefing...");
  let p = null;
  // Strategy 1: Try each text block individually
  for (const block of textBlocks) {
    const cl = block.replace(/```json\s*|```\s*/g, "").trim();
    try { p = JSON.parse(cl); break; } catch {}
    const ex = extractJSON(cl);
    if (ex) { try { p = JSON.parse(ex); break; } catch {} }
  }
  // Strategy 2: Join all blocks and try
  if (!p) {
    const full = textBlocks.join("\n").replace(/```json\s*|```\s*/g, "").trim();
    try { p = JSON.parse(full); } catch {}
    if (!p) { const ex = extractJSON(full); if (ex) { try { p = JSON.parse(ex); } catch {} } }
    if (!p) { const m = full.match(/\{[\s\S]*\}/); if (m) { try { p = JSON.parse(m[0]); } catch {} } }
  }
  if (!p) throw new Error("JSON konnte nicht geparst werden. Bitte versuche es erneut.");
  if (!p.product || !p.images) throw new Error("Unvollstaendige Antwort: 'product' oder 'images' fehlt. Bitte erneut versuchen.");
  return p;
}

// Scrape Amazon product data + images (via Bright Data only)
async function scrapeProduct(asin, marketplace) {
  if (!asin || !asin.trim()) return { images: [], productData: {} };
  const r = await fetch("/api/fetch-images", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asin: asin.trim(), marketplace }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `Scraping fehlgeschlagen (${r.status})`);
  return { images: d.images || [], productData: d.productData || {} };
}

// Bright Data API helper — retries are now handled server-side
async function bdFetch(body) {
  try {
    const r = await fetch("/api/keyword-research", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn(`[BrightData] ${body.type} HTTP ${r.status}:`, err.error || "unknown");
      return null;
    }
    const d = await r.json();
    if (d.debug) console.log(`[BrightData] ${body.type} debug:`, d.debug);
    if (!d.success) {
      console.warn(`[BrightData] ${body.type}: success=false`, d.error || "(empty data from Bright Data)");
      return d.data || null; // Return whatever data we got (may be empty)
    }
    return d.data;
  } catch (e) {
    console.warn(`[BrightData] ${body.type} network error:`, e.message);
    return null;
  }
}

// 1. Keyword-Recherche (Global, marktplatzspezifisch)
async function fetchKeywordData(keyword, marketplace) {
  if (!keyword?.trim()) return null;
  return bdFetch({ type: "keywords", keywords: keyword.trim(), marketplace });
}

// 2. Einfache Keyword-Suche (ohne Marktplatz)
async function fetchSimpleKeywordData(keyword) {
  if (!keyword?.trim()) return null;
  return bdFetch({ type: "keyword", keyword: keyword.trim() });
}

// 3. Echte Amazon-Reviews
async function fetchReviewData(asin, marketplace) {
  if (!asin?.trim()) return null;
  return bdFetch({ type: "reviews", asin: asin.trim(), marketplace });
}

// 4. Brand-Analyse (Seller/Brand URL)
async function fetchBrandData(brandUrl) {
  if (!brandUrl?.trim()) return null;
  return bdFetch({ type: "brand", brandUrl: brandUrl.trim() });
}

// 5. Bestseller der Kategorie
async function fetchBestSellers(categoryUrl) {
  if (!categoryUrl?.trim()) return null;
  return bdFetch({ type: "best_sellers", categoryUrl: categoryUrl.trim() });
}

// Merge keyword data from multiple Bright Data sources
function mergeKeywordData(global, simple) {
  if (!global && !simple) return null;
  const merged = { searchTerms: [], competitorKeywords: [], competitors: [] };
  // Merge search terms (deduplicate by term name)
  const termMap = {};
  [global?.searchTerms, simple?.searchTerms].forEach(arr => {
    (arr || []).forEach(t => { termMap[t.term] = (termMap[t.term] || 0) + t.frequency; });
  });
  merged.searchTerms = Object.entries(termMap).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([term, frequency]) => ({ term, frequency }));
  // Merge competitor keywords
  const kwMap = {};
  [global?.competitorKeywords, simple?.competitorKeywords].forEach(arr => {
    (arr || []).forEach(t => { kwMap[t.term] = (kwMap[t.term] || 0) + t.frequency; });
  });
  merged.competitorKeywords = Object.entries(kwMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([term, frequency]) => ({ term, frequency }));
  // Competitors only from global (has marketplace context)
  merged.competitors = global?.competitors || simple?.competitors || [];
  return merged;
}

// ═══════ COMPONENTS ═══════
const Pill = ({ children, c = V.violet, s = {} }) => <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 20, background: `${c}14`, color: c, fontSize: 10.5, fontWeight: 700, border: `1px solid ${c}22`, ...s }}>{children}</span>;
const CopyBtn = ({ text, label }) => { const [ok, set] = useState(false); return <button onClick={() => { navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 1200); }} style={{ ...gS, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: ok ? "#fff" : V.textMed, cursor: "pointer", fontFamily: FN, background: ok ? V.emerald : "rgba(255,255,255,0.5)", border: ok ? `1px solid ${V.emerald}` : "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}>{ok ? "Kopiert" : (label || "Kopieren")}</button>; };
const RelBar = ({ pct, maxPct, color }) => { const w = maxPct > 0 ? (pct / maxPct) * 100 : 0; return <div style={{ flex: 1, height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}BB)`, borderRadius: 99 }} /></div>; };
const GC = ({ children, style: s = {}, onClick: oc }) => <div style={{ ...glass, ...s }} onClick={oc}>{children}</div>;
const Lbl = ({ children, c = V.violet }) => <div style={{ fontSize: 10, fontWeight: 800, color: c, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
const Check = ({ on }) => <span style={{ color: on ? V.emerald : V.textDim, fontSize: 11, fontWeight: 800 }}>{on ? "✓" : "○"}</span>;
const Err = ({ msg, onX }) => msg ? <div style={{ ...gS, padding: "12px 18px", background: `${V.rose}10`, border: `1px solid ${V.rose}25`, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><span style={{ fontSize: 12, color: V.rose, fontWeight: 600, lineHeight: 1.5 }}>{msg}</span>{onX && <button onClick={onX} style={{ background: "none", border: "none", color: V.rose, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 16 }}>×</button>}</div> : null;
const AsinNotFoundErr = ({ onReset }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }}><div style={{ ...glass, maxWidth: 440, width: "100%", padding: "36px 32px", background: "rgba(255,255,255,0.92)", textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 99, background: `${V.rose}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><span style={{ fontSize: 28, color: V.rose }}>!</span></div><div style={{ fontSize: 20, fontWeight: 800, color: V.rose, marginBottom: 8 }}>ASIN nicht gefunden</div><p style={{ fontSize: 14, color: V.text, lineHeight: 1.7, margin: "0 0 24px" }}>Bright Data hat keine Produktdaten für diese ASIN zurückgegeben. Bitte überprüfe die ASIN und den Marketplace.</p><button onClick={onReset} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 20px ${V.violet}35` }}>Neues Briefing starten</button></div></div>;
const ScrapeErr = ({ error, onReset }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }}><div style={{ ...glass, maxWidth: 480, width: "100%", padding: "36px 32px", background: "rgba(255,255,255,0.92)", textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 99, background: `${V.orange}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><span style={{ fontSize: 28, color: V.orange }}>⚠</span></div><div style={{ fontSize: 20, fontWeight: 800, color: V.orange, marginBottom: 8 }}>Scraping fehlgeschlagen</div><p style={{ fontSize: 14, color: V.text, lineHeight: 1.7, margin: "0 0 12px" }}>Die Produktdaten konnten nicht von Amazon abgerufen werden. Das kann an der Bright Data API liegen.</p><div style={{ ...gS, padding: "10px 14px", fontSize: 12, color: V.rose, fontFamily: "monospace", textAlign: "left", wordBreak: "break-all", marginBottom: 20 }}>{error}</div><button onClick={onReset} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 20px ${V.violet}35` }}>Erneut versuchen</button></div></div>;

// ═══════ TIME TRACKER (persistent per ASIN, restores on reload, time only increases) ═══════
function TimeTracker({ productName, brand, asin, marketplace, briefingUrl, outputUrl, projectId }) {
  // Use ASIN as primary key — one timesheet row per ASIN; briefingId as fallback
  const effectiveKey = asin || projectId || null;
  const lsKey = effectiveKey ? `tt_${effectiveKey.toUpperCase()}` : null;
  // Restore from localStorage immediately (fast), then upgrade from server
  const initSecs = () => {
    if (!lsKey) return 0;
    try { const v = parseInt(localStorage.getItem(lsKey) || "0"); return isNaN(v) ? 0 : v; } catch { return 0; }
  };
  const [secs, setSecs] = useState(initSecs);
  const [running, setRunning] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncErr, setSyncErr] = useState(false);
  const [restored, setRestored] = useState(false);
  const iRef = useRef(null);
  const syncRef = useRef(null);
  const secsRef = useRef(secs);
  secsRef.current = secs;
  // Save to localStorage on every change (time can only increase)
  useEffect(() => {
    if (!lsKey || secs <= 0) return;
    try {
      const prev = parseInt(localStorage.getItem(lsKey) || "0");
      if (secs > prev) localStorage.setItem(lsKey, String(secs));
    } catch {}
  }, [secs, lsKey]);
  // Restore from server on mount (may be higher than localStorage if tracked from another device/tab)
  useEffect(() => {
    if (!effectiveKey) { setRestored(true); return; }
    const doRestore = (attempt = 1) => {
      fetch("/api/timesheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", asin: asin || undefined, projectId: effectiveKey }) })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => {
          if (d?.seconds > 0 && d.seconds > secsRef.current) setSecs(d.seconds);
          setRestored(true); setSyncErr(false);
        })
        .catch(e => {
          console.error("[time-restore] Failed (attempt " + attempt + "):", e.message);
          if (attempt < 3) { setTimeout(() => doRestore(attempt + 1), 2000 * attempt); }
          else { setRestored(true); setSyncErr(true); }
        });
    };
    doRestore();
  }, [effectiveKey, asin]);
  // Timer uses wall-clock time so it stays accurate even when the tab is in the background
  const startTimeRef = useRef(null);
  const startSecsRef = useRef(0);
  useEffect(() => {
    if (iRef.current) clearInterval(iRef.current);
    if (running) {
      startTimeRef.current = Date.now();
      startSecsRef.current = secsRef.current;
      iRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
        setSecs(startSecsRef.current + elapsed);
      }, 500);
    }
    return () => clearInterval(iRef.current);
  }, [running]);
  const syncToSheet = useCallback(async (s, retries = 2) => {
    if (!effectiveKey) return;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch("/api/timesheet", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", productName, brand: brand || "", asin: asin || "", marketplace, seconds: s, projectId: effectiveKey, briefingUrl: briefingUrl || undefined, outputUrl: outputUrl || undefined }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.seconds > secsRef.current) setSecs(d.seconds);
          setSynced(true); setSyncErr(false);
          return;
        }
        const errText = await r.text().catch(() => "");
        console.error("[time-sync] HTTP", r.status, errText);
        if (attempt < retries) { await new Promise(ok => setTimeout(ok, 2000)); continue; }
        setSyncErr(true);
      } catch (e) {
        console.error("[time-sync] Error:", e.message);
        if (attempt < retries) { await new Promise(ok => setTimeout(ok, 2000)); continue; }
        setSyncErr(true);
      }
    }
  }, [productName, brand, asin, marketplace, briefingUrl, outputUrl, effectiveKey]);
  useEffect(() => {
    if (syncRef.current) clearInterval(syncRef.current);
    if (running) { syncRef.current = setInterval(() => syncToSheet(secsRef.current), 30000); }
    return () => clearInterval(syncRef.current);
  }, [running, syncToSheet]);
  // Re-sync when briefingUrl or outputUrl become available (they may arrive after first sync)
  const prevUrlsRef = useRef({ briefingUrl: "", outputUrl: "" });
  useEffect(() => {
    const prev = prevUrlsRef.current;
    if (secsRef.current > 0 && ((!prev.briefingUrl && briefingUrl) || (!prev.outputUrl && outputUrl))) {
      syncToSheet(secsRef.current);
    }
    prevUrlsRef.current = { briefingUrl, outputUrl };
  }, [briefingUrl, outputUrl, syncToSheet]);
  // Sync before page unload (sendBeacon for reliability)
  useEffect(() => {
    const onUnload = () => {
      if (secsRef.current > 0 && effectiveKey) {
        try {
          navigator.sendBeacon("/api/timesheet", new Blob([JSON.stringify({ action: "update", productName, brand: brand || "", asin: asin || "", marketplace, seconds: secsRef.current, projectId: effectiveKey, briefingUrl: briefingUrl || undefined, outputUrl: outputUrl || undefined })], { type: "application/json" }));
        } catch {}
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [productName, brand, asin, marketplace, briefingUrl, outputUrl, effectiveKey]);
  // Re-sync when tab becomes visible again (handles tab-switch + cross-device scenarios)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && secsRef.current > 0 && effectiveKey) {
        syncToSheet(secsRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [effectiveKey, syncToSheet]);
  const handleToggle = () => {
    if (running && secs > 0) syncToSheet(secs); // sync on pause
    if (!running && secs > 0) syncToSheet(secs); // sync on resume — recreates row if deleted
    setRunning(r => !r);
  };
  const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}` : `${m}:${ss.toString().padStart(2, "0")}`; };
  return <div style={{ ...glass, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
    <div><div style={{ fontSize: 10, fontWeight: 800, color: V.teal, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 2 }}>Time Tracking</div><div style={{ fontSize: 11, color: V.textDim }}>{productName || "Briefing"}{synced && !syncErr ? <span style={{ fontSize: 9, color: V.emerald, marginLeft: 8 }}>synced</span> : ""}{syncErr ? <span style={{ fontSize: 10, fontWeight: 700, color: V.rose, marginLeft: 8, padding: "2px 6px", borderRadius: 4, background: `${V.rose}15` }}>Sync fehlgeschlagen — Zeit wird nur lokal gespeichert</span> : ""}{restored && secs > 0 && !running && !synced ? <span style={{ fontSize: 9, color: V.blue, marginLeft: 8 }}>restored</span> : ""}</div></div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 28, fontWeight: 800, color: running ? V.teal : V.ink, fontVariantNumeric: "tabular-nums", fontFamily: FN }}>{fmt(secs)}</span>
      <button onClick={handleToggle} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: running ? V.rose : `linear-gradient(135deg, ${V.teal}, ${V.emerald})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN, minWidth: 80 }}>{running ? "Pause" : secs > 0 ? "Resume" : "Start"}</button>
      {secs > 0 && !running && <button onClick={() => { navigator.clipboard.writeText(`${productName || "Briefing"}: ${fmt(secs)}`); }} style={{ ...gS, padding: "10px 14px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8 }}>Copy</button>}
    </div>
  </div>;
}

// ═══════ START ═══════
function StartScreen({ onStart, loading, status, error, onDismiss, onLoad, txtDensity, setTD }) {
  const [asin, sa] = useState(""); const [mp, sm] = useState("Amazon.de"); const [pi, sp] = useState(""); const [ft, sf] = useState("");
  const [hist, setHist] = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  useEffect(() => {
    // Load from DB, fallback to localStorage if DB is empty or fails
    fetch("/api/briefing?list=recent&limit=10")
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => {
        const dbItems = (d.items || []).map(h => ({ ...h, source: "db" }));
        if (dbItems.length > 0) { setHist(dbItems); }
        else {
          // DB empty → show localStorage history
          const local = loadH().map(h => ({ ...h, source: "local" }));
          setHist(local);
        }
      })
      .catch(() => { setHist(loadH().map(h => ({ ...h, source: "local" }))); })
      .finally(() => setHistLoading(false));
  }, []);
  const [imageCount, setImageCount] = useState(7);
  // Reference listing state
  const [refAsin, setRefAsin] = useState("");
  const [refLoading, setRefLoading] = useState(false);
  const [refImages, setRefImages] = useState([]);
  const [refData, setRefData] = useState(null);
  const [refOpen, setRefOpen] = useState(false);
  const [refIsManual, setRefIsManual] = useState(false);
  const [newProductText, setNewProductText] = useState("");
  const manualUploadRef = useRef(null);
  // Helium10 keyword data state
  const [h10Open, setH10Open] = useState(false);
  const [h10Raw, setH10Raw] = useState(null); // parsed CSV data
  const [h10Filtered, setH10Filtered] = useState(null); // filtered/scored keywords
  const [h10FileName, setH10FileName] = useState("");
  const csvUploadRef = useRef(null);
  // Bestseller ASIN state
  const [bsAsin, setBsAsin] = useState("");
  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setH10FileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseHelium10CSV(ev.target.result);
      if (parsed) {
        setH10Raw(parsed);
        setH10Filtered(filterH10Keywords(parsed));
      } else {
        setH10Raw(null); setH10Filtered(null);
        setH10FileName("");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-upload of same file
  };
  const loadRef = async () => {
    if (!refAsin.trim() || refLoading) return;
    setRefLoading(true); setRefImages([]); setRefData(null); setRefIsManual(false);
    try {
      const res = await scrapeProduct(refAsin.trim(), mp);
      // Compress scraped images for Claude vision (1568px = Claude max)
      const compressed = await Promise.all((res.images || []).map(async img => ({
        ...img, base64: await compressImage(img.base64, 1568, 0.8)
      })));
      setRefImages(compressed);
      setRefData(res.productData || null);
    } catch { setRefImages([]); setRefData(null); }
    setRefLoading(false);
  };
  const handleManualUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const total = Math.min(files.length, 7);
    const results = [];
    files.slice(0, 7).forEach(f => {
      const r = new FileReader();
      r.onload = async ev => {
        // Compress uploaded images for Claude vision (1568px = Claude max)
        const compressed = await compressImage(ev.target.result, 1568, 0.8);
        results.push({ base64: compressed });
        if (results.length === total) {
          setRefImages(results);
          setRefData(null);
          setRefAsin("");
          setRefIsManual(true);
        }
      };
      r.readAsDataURL(f);
    });
  };
  const hasRef = refImages.length > 0;
  const hasH10 = h10Filtered?.volume?.length > 0 || h10Filtered?.purchase?.length > 0;
  const ok = asin.trim() || pi.trim() || hasRef;
  const refPayload = hasRef ? { asin: refAsin || null, images: refImages, productData: refData, newProductText: newProductText.trim() || null, isManual: refIsManual } : null;
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 24, position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 580, width: "100%" }}>
          <GC style={{ padding: 0, marginBottom: 14 }}>
            <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Neues Briefing</div>
              <p style={{ fontSize: 13, color: V.textMed, margin: 0, lineHeight: 1.6 }}>ASIN eingeben oder Produktinfos beschreiben.</p>
            </div>
            <div style={{ padding: "20px 32px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
              {error && error !== "ASIN_NOT_FOUND" && !error.startsWith("SCRAPE_ERROR:") && <Err msg={error} onX={onDismiss} />}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>ASIN (optional)</label>
                  <input type="text" autoComplete="off" value={asin} onChange={e => sa(e.target.value)} placeholder="z.B. B0CX7K9QDR" style={inpS} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>Marktplatz</label>
                  <select value={mp} onChange={e => sm(e.target.value)} style={{ ...inpS, cursor: "pointer", appearance: "auto" }}>{["Amazon.de","Amazon.com","Amazon.co.uk","Amazon.fr","Amazon.it","Amazon.es"].map(m => <option key={m}>{m}</option>)}</select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>Produktbeschreibung</label>
                <textarea value={pi} onChange={e => sp(e.target.value)} placeholder="Features, Materialien, USPs... Du kannst auch spezifische Anweisungen pro Bild geben, z.B. 'Bild 1: Materialqualität zeigen, Bild 2: Anwendungsszenarien'" rows={3} style={{ ...inpS, resize: "vertical", lineHeight: 1.6 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>Zusätzliche Hinweise (optional)</label>
                <textarea value={ft} onChange={e => sf(e.target.value)} placeholder="Wettbewerber, Markenwerte, Tonalität, Bild-spezifische Anweisungen..." rows={2} style={{ ...inpS, resize: "vertical", lineHeight: 1.6 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 8, display: "block" }}>Textdichte</label>
                  <div style={{ display: "flex", gap: 8 }}>{[["light", "Wenig Text"], ["normal", "Normal"]].map(([val, lbl]) => <button key={val} onClick={() => setTD(val)} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: txtDensity === val ? `2px solid ${V.violet}` : "1px solid rgba(0,0,0,0.08)", background: txtDensity === val ? `${V.violet}10` : "rgba(255,255,255,0.5)", color: txtDensity === val ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{lbl}</button>)}</div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 8, display: "block" }}>Anzahl Bilder</label>
                  <div style={{ display: "flex", gap: 4 }}>{[1,2,3,4,5,6,7].map(n => <button key={n} onClick={() => setImageCount(n)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: imageCount === n ? `2px solid ${V.cyan}` : "1px solid rgba(0,0,0,0.08)", background: imageCount === n ? `${V.cyan}10` : "rgba(255,255,255,0.5)", color: imageCount === n ? V.cyan : V.textDim, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{n}</button>)}</div>
                </div>
              </div>
              {/* ── REFERENZ-LISTING ── */}
              <div style={{ ...gS, padding: 0, overflow: "hidden", border: hasRef ? `1.5px solid ${V.orange}40` : "1px solid rgba(0,0,0,0.06)" }}>
                <button onClick={() => setRefOpen(o => !o)} style={{ width: "100%", padding: "12px 16px", border: "none", background: hasRef ? `${V.orange}08` : "transparent", cursor: "pointer", fontFamily: FN, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: hasRef ? V.orange : V.textMed, letterSpacing: ".04em", textTransform: "uppercase" }}>Referenz-Listing</span>
                    {hasRef && <span style={{ fontSize: 10, fontWeight: 700, color: V.orange, padding: "2px 8px", borderRadius: 6, background: `${V.orange}15` }}>{refImages.length} Bilder {refIsManual ? "(hochgeladen)" : "geladen"}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: V.textDim, fontWeight: 700 }}>{refOpen ? "▾" : "▸"}</span>
                </button>
                {refOpen && <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 11, color: V.textDim, margin: 0, lineHeight: 1.5 }}>Bestehendes Listing als Stil-Vorlage verwenden. Per ASIN von Amazon scrapen oder Bilder manuell hochladen.</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="text" autoComplete="off" value={refAsin} onChange={e => setRefAsin(e.target.value)} placeholder="Referenz-ASIN" style={{ ...inpS, flex: 1 }} onKeyDown={e => e.key === "Enter" && loadRef()} />
                    <button onClick={loadRef} disabled={!refAsin.trim() || refLoading} style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: refLoading ? `${V.orange}60` : refAsin.trim() ? `linear-gradient(135deg, ${V.orange}, ${V.amber})` : "rgba(0,0,0,0.06)", color: refAsin.trim() || refLoading ? "#fff" : V.textDim, fontSize: 12, fontWeight: 800, cursor: refAsin.trim() && !refLoading ? "pointer" : "default", fontFamily: FN, whiteSpace: "nowrap", flexShrink: 0 }}>{refLoading ? "..." : "ASIN"}</button>
                    <input ref={manualUploadRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleManualUpload} />
                    <button onClick={() => manualUploadRef.current?.click()} style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${V.teal}, ${V.emerald})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", flexShrink: 0 }}>Upload</button>
                  </div>
                  {hasRef && <>
                    {refData && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {refData.brand && <span style={{ fontSize: 10, fontWeight: 700, color: V.violet, padding: "2px 8px", borderRadius: 6, background: `${V.violet}12` }}>{refData.brand}</span>}
                      {refData.title && <span style={{ fontSize: 10, color: V.textDim, lineHeight: 1.4 }}>{refData.title.substring(0, 80)}{refData.title.length > 80 ? "..." : ""}</span>}
                    </div>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {refImages.slice(0, 7).map((img, i) => <div key={i} style={{ background: "#F8F9FB", borderRadius: 8, padding: 4, textAlign: "center", border: `1px solid ${V.orange}15` }}>
                        {img.base64 && <img src={img.base64} alt={["Main", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06"][i]} style={{ width: "100%", height: 60, objectFit: "contain", borderRadius: 6 }} />}
                        <div style={{ fontSize: 8, fontWeight: 700, color: V.orange, marginTop: 2 }}>{["Main", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06"][i]}</div>
                      </div>)}
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: V.orange, marginBottom: 6, display: "block" }}>Neue Produktdaten (ersetzen Referenz-Inhalte)</label>
                      <textarea value={newProductText} onChange={e => setNewProductText(e.target.value)} placeholder="Produktname, Features, USPs, Materialien, Anwendung... Alles was das neue Produkt beschreibt." rows={4} style={{ ...inpS, resize: "vertical", lineHeight: 1.6, borderColor: `${V.orange}30` }} />
                    </div>
                    <button onClick={() => { setRefAsin(""); setRefImages([]); setRefData(null); setNewProductText(""); setRefIsManual(false); }} style={{ ...gS, padding: "6px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8, alignSelf: "flex-start" }}>Referenz entfernen</button>
                  </>}
                </div>}
              </div>
              {/* ── KEYWORD-DATEN (Helium10 CSV) ── */}
              <div style={{ ...gS, padding: 0, overflow: "hidden", border: hasH10 ? `1.5px solid ${V.blue}40` : "1px solid rgba(0,0,0,0.06)" }}>
                <button onClick={() => setH10Open(o => !o)} style={{ width: "100%", padding: "12px 16px", border: "none", background: hasH10 ? `${V.blue}08` : "transparent", cursor: "pointer", fontFamily: FN, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: hasH10 ? V.blue : V.textMed, letterSpacing: ".04em", textTransform: "uppercase" }}>Keyword-Daten</span>
                    {hasH10 && <span style={{ fontSize: 10, fontWeight: 700, color: V.blue, padding: "2px 8px", borderRadius: 6, background: `${V.blue}15` }}>{h10Raw.totalCount} Keywords geladen</span>}
                  </div>
                  <span style={{ fontSize: 12, color: V.textDim, fontWeight: 700 }}>{h10Open ? "▾" : "▸"}</span>
                </button>
                {h10Open && <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 11, color: V.textDim, margin: 0, lineHeight: 1.5 }}>Helium10 Cerebro CSV-Export hochladen für echte Suchvolumen und Conversion-Daten. Ohne Upload werden Keywords KI-geschätzt.</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input ref={csvUploadRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }} onChange={handleCSVUpload} />
                    <button onClick={() => csvUploadRef.current?.click()} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${V.blue}, ${V.violet})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap" }}>CSV hochladen</button>
                    {h10FileName && <span style={{ fontSize: 11, color: V.textMed, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h10FileName}</span>}
                    {hasH10 && <button onClick={() => { setH10Raw(null); setH10Filtered(null); setH10FileName(""); }} style={{ ...gS, padding: "6px 10px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8 }}>Entfernen</button>}
                  </div>
                  {hasH10 && <div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                      <div style={{ ...gS, padding: "8px 14px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: V.blue }}>{h10Filtered.volume?.length || 0}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: V.textDim, textTransform: "uppercase" }}>Volumen-KWs</div>
                      </div>
                      <div style={{ ...gS, padding: "8px 14px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: V.orange }}>{h10Filtered.purchase?.length || 0}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: V.textDim, textTransform: "uppercase" }}>Kaufintent-KWs</div>
                      </div>
                      <div style={{ ...gS, padding: "8px 14px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: V.textMed }}>{h10Raw.totalCount}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: V.textDim, textTransform: "uppercase" }}>Total</div>
                      </div>
                    </div>
                    {h10Filtered.volume?.length > 0 && <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: V.blue, marginBottom: 4 }}>Top Suchvolumen:</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {h10Filtered.volume.slice(0, 8).map((k, i) => <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: `${V.blue}12`, color: V.blue, whiteSpace: "nowrap" }}>{k.keyword} <span style={{ opacity: 0.7 }}>{k.searchVolume?.toLocaleString("de-DE")}</span></span>)}
                      </div>
                    </div>}
                    {h10Filtered.purchase?.length > 0 && <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: V.orange, marginBottom: 4 }}>Top Kaufintent:</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {h10Filtered.purchase.slice(0, 6).map((k, i) => <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: `${V.orange}12`, color: V.orange, whiteSpace: "nowrap" }}>{k.keyword} {k.cpr ? `CPR:${k.cpr}` : ""}</span>)}
                      </div>
                    </div>}
                  </div>}
                  {h10Raw && !hasH10 && <div style={{ ...gS, padding: 10, background: `${V.rose}08`, border: `1px solid ${V.rose}20` }}><span style={{ fontSize: 11, color: V.rose }}>CSV konnte nicht verarbeitet werden. Stelle sicher, dass die Datei eine "Keyword Phrase" und "Search Volume" Spalte enthält.</span></div>}
                </div>}
              </div>
              {/* ── KEYWORD-BESTSELLER-ASIN (optional) ── */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>Keyword-Bestseller ASIN (optional)</label>
                <input type="text" autoComplete="off" value={bsAsin} onChange={e => setBsAsin(e.target.value)} placeholder="ASIN des relevantesten Bestsellers" style={inpS} />
                <div style={{ fontSize: 10, color: V.textDim, marginTop: 4 }}>Der Bestseller für das relevanteste Keyword deines Produkts (nicht Kategorie-Bestseller). Wird als Benchmark analysiert.</div>
              </div>
              <button onClick={() => ok && !loading && onStart(asin, mp, pi, ft, refPayload, imageCount, h10Filtered, bsAsin.trim() || null)} disabled={!ok || loading} style={{ padding: "14px 24px", borderRadius: 14, border: "none", background: loading ? `${V.violet}80` : ok ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(0,0,0,0.08)", color: ok || loading ? "#fff" : V.textDim, fontSize: 14, fontWeight: 800, cursor: ok && !loading ? "pointer" : "default", fontFamily: FN, boxShadow: ok ? `0 4px 20px ${V.violet}35` : "none" }}>{loading ? "Analyse läuft..." : `${imageCount}-Bild Analyse starten${hasRef ? " (mit Referenz)" : ""}${hasH10 ? " (mit Keywords)" : ""}`}</button>
              {loading && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 10, height: 10, border: `2px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: 99, animation: "spin 0.7s linear infinite" }} /><span style={{ fontSize: 12, color: V.violet, fontWeight: 600 }}>{status}</span></div>}
            </div>
          </GC>
          {histLoading ? <GC style={{ padding: 20, textAlign: "center" }}><div style={{ width: 20, height: 20, border: `2px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} /></GC> : hist.length > 0 && <GC style={{ padding: 0 }}><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl></div><div style={{ padding: "8px 12px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", borderRadius: 10, cursor: "pointer" }} onClick={() => {
            if (h.source === "local" && h.data) {
              // localStorage entry — data is inline
              onLoad(h.data, null, null);
            } else {
              // DB entry — fetch full data with selections
              fetch("/api/briefing?id=" + h.id).then(r => r.ok ? r.json() : null).then(d => {
                if (d?.data?.briefing?.product) onLoad(d.data.briefing, d.data.selections || null, h.id);
              }).catch(() => {});
            }
          }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name || h.data?.product?.name || "?"}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand || h.data?.product?.brand || ""}{h.asin ? ` · ${h.asin}` : ""}{h.marketplace ? ` · ${h.marketplace}` : ""}{h.source === "local" ? " · lokal" : ""}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC>}
        </div>
      </div>
      {error === "ASIN_NOT_FOUND" && <AsinNotFoundErr onReset={onDismiss} />}
      {error?.startsWith("SCRAPE_ERROR:") && <ScrapeErr error={error.replace("SCRAPE_ERROR:", "")} onReset={onDismiss} />}
    </div>
  );
}

// ═══════ SERVER HISTORY ═══════
function ServerHistory({ items, loading, onLoad, onClose }) {
  return <GC style={{ padding: 0, marginBottom: 14 }}>
    <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.textMed}>Alle Briefings</Lbl><button onClick={onClose} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div>
    <div style={{ padding: "6px 10px", maxHeight: 400, overflowY: "auto" }}>
      {loading && <div style={{ textAlign: "center", padding: 20 }}><div style={{ width: 20, height: 20, border: `2px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} /></div>}
      {!loading && items.length === 0 && <div style={{ textAlign: "center", padding: 20, fontSize: 12, color: V.textDim }}>Noch keine Briefings vorhanden.</div>}
      {items.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", borderRadius: 10, cursor: "pointer" }} onClick={() => onLoad(h.id)} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
          <div style={{ fontSize: 10, color: V.textDim }}>{h.brand}{h.asin ? ` · ${h.asin}` : ""}{h.marketplace ? ` · ${h.marketplace}` : ""} · {h.imageCount} Bilder · v{h.version}</div>
          <div style={{ fontSize: 9, color: V.textDim }}>{fmtDate(h.updatedAt)}</div>
        </div>
        <span style={{ fontSize: 11, color: V.violet, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>Laden →</span>
      </div>)}
    </div>
  </GC>;
}

function OverwriteWarn({ name, onOk, onNo }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onNo}><GC style={{ maxWidth: 440, width: "100%", padding: 28, background: "rgba(255,255,255,0.9)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing überschreiben?</div><p style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6, margin: "0 0 6px" }}>Das Briefing für <b>{name}</b> wird ersetzt.</p><p style={{ fontSize: 12, color: V.textDim, margin: "0 0 20px" }}>Die letzten {MH} Briefings bleiben abrufbar.</p><div style={{ display: "flex", gap: 8, justifyContent: "center" }}><button onClick={onNo} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textMed, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Abbrechen</button><button onClick={onOk} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.rose}, ${V.orange})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Überschreiben</button></div></GC></div>;
}

// ═══════ BILD-BRIEFING ═══════
function BildBriefing({ D, hlC, setHlC, shC, setShC, bulSel, setBulSel, bdgSel, setBdgSel, imgDisabled, setImgDisabled, refImages, setRefImages, ecSel, setEcSel, pushUndo, onEditText }) {
  const [sel, setSel] = useState(0);
  const [editField, setEditField] = useState(null); // { type: 'hl'|'sub'|'bul'|'badge'|'concept'|'visual'|'rationale'|'eyecatcher', idx: number }
  const [editVal, setEditVal] = useState("");
  const [dragIdx, setDragIdx] = useState(null); // bullet drag-and-drop
  const [dragOver, setDragOver] = useState(null);
  const [addFmtOpen, setAddFmtOpen] = useState(false); // format picker for new text elements
  const dragIdxRef = useRef(null); // refs to avoid stale closures in drag events
  const dragOverRef = useRef(null);
  useEffect(() => { setEditField(null); setEditVal(""); }, [sel]);
  if (!D.images?.length) return null;
  const img = D.images[sel], te = img?.texts;
  const hls = te?.headlines || (te?.headline ? [te.headline] : []);
  const ci = hlC[img.id] ?? 0, curHl = hls[ci] || hls[0] || "";
  const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
  const si = shC[img.id] ?? 0;
  const curSh = si === -1 ? "" : (subs[si] || subs[0] || te?.subheadline || "");
  const bKey = img.id;
  const bullets = te?.bullets || [];
  const bSel = bulSel[bKey] || bullets.map(() => true);
  const selectedBullets = bullets.filter((_, i) => bSel[i]);
  const allBadges = getAllBadges(te);
  const { idx: bdgIdx, badge: selectedBadge } = getSelectedBadge(bdgSel, img.id, allBadges);
  const allTxt = te ? [curHl, curSh, ...selectedBullets.map(bText), ...(selectedBadge ? [selectedBadge] : [])].filter(Boolean).join("\n") : "";
  const isOff = imgDisabled?.[img.id];
  // Inline editing helpers
  const startEdit = (type, idx, val) => { setEditField({ type, idx }); setEditVal(val); };
  const commitEdit = () => {
    if (!editField || !onEditText) { setEditField(null); return; }
    const { type, idx } = editField;
    onEditText(sel, type, idx, editVal);
    setEditField(null);
  };
  const cancelEdit = () => setEditField(null);
  const isEditing = (type, idx) => editField?.type === type && editField?.idx === idx;
  // Reference image upload
  const handleRefUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    processRefFiles(files);
    e.target.value = "";
  };
  const processRefFiles = (files) => {
    files.filter(f => f.type.startsWith("image/")).forEach(file => {
      const reader = new FileReader();
      reader.onload = async () => {
        const compressed = await compressImage(reader.result, 400, 0.6);
        setRefImages(prev => ({ ...prev, [img.id]: [...(prev[img.id] || []), compressed] }));
      };
      reader.readAsDataURL(file);
    });
  };
  const [refDragOver, setRefDragOver] = useState(false);
  const handleRefDrop = (e) => {
    e.preventDefault();
    setRefDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) processRefFiles(files);
  };
  const removeRefImage = (imgId, idx) => {
    setRefImages(prev => ({ ...prev, [imgId]: (prev[imgId] || []).filter((_, i) => i !== idx) }));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{D.images.map((im, i) => {
        const tabLabel = getImgLabel(D.images, i);
        const theme = im.theme || "";
        const isOff = imgDisabled?.[D.images[i]?.id];
        return <button key={i} onClick={() => setSel(i)} style={{ ...gS, padding: "8px 14px", background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : isOff ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.5)", color: sel === i ? "#fff" : V.textDim, border: sel === i ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0, opacity: isOff ? 0.45 : 1, transition: "all 0.15s" }}><span style={{ fontSize: 11, fontWeight: 800 }}>{tabLabel}</span>{theme && <span style={{ fontSize: 9, fontWeight: 500, opacity: sel === i ? 0.85 : 0.7, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{theme}</span>}{isOff && <span style={{ fontSize: 8, color: sel === i ? "#fff" : V.textDim }}>AUS</span>}</button>;
      })}</div>
      <GC>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 18, fontWeight: 800, color: isOff ? V.textDim : V.ink }}>{getImgLabel(D.images, sel)}</span><span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span>
            <button onClick={() => { pushUndo(); setImgDisabled(p => ({ ...p, [img.id]: !isOff })); }} style={{ ...gS, padding: "4px 10px", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: FN, borderRadius: 8, color: isOff ? V.rose : V.emerald, background: isOff ? `${V.rose}10` : `${V.emerald}10`, border: isOff ? `1px solid ${V.rose}30` : `1px solid ${V.emerald}30`, marginLeft: 4 }}>{isOff ? "Deaktiviert" : "Aktiv"}</button>
          </div>
          {te && <CopyBtn text={allTxt} label="Alle Texte" />}
        </div>
        {isOff && <div style={{ padding: "10px 22px", background: `${V.rose}08`, borderBottom: `1px solid ${V.rose}15`, fontSize: 12, color: V.rose, fontWeight: 600 }}>Dieses Bild wird vom Briefing ausgeschlossen.</div>}
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {img.concept && <div><Lbl c={V.blue}>Bildkonzept</Lbl>{isEditing("concept", 0) ? <textarea autoFocus value={editVal} onChange={e => { setEditVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }} ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} style={{ ...inpS, fontSize: 13, lineHeight: 1.75, minHeight: 80, resize: "vertical", overflow: "hidden" }} /> : <p onClick={() => startEdit("concept", 0, img.concept)} style={{ fontSize: 13, color: V.text, lineHeight: 1.75, margin: 0, cursor: "text", borderRadius: 8, padding: "4px 6px", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"} title="Klick zum Bearbeiten">{img.concept}</p>}</div>}
          {img.rationale && <div style={{ background: `${V.violet}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.violet}12` }}><Lbl c={V.violet}>Strategische Begründung</Lbl>{isEditing("rationale", 0) ? <textarea autoFocus value={editVal} onChange={e => { setEditVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }} ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} style={{ ...inpS, fontSize: 12.5, lineHeight: 1.75, minHeight: 80, resize: "vertical", overflow: "hidden" }} /> : <p onClick={() => startEdit("rationale", 0, img.rationale)} style={{ fontSize: 12.5, color: V.text, lineHeight: 1.75, margin: 0, cursor: "text", borderRadius: 8, padding: "4px 6px", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = `${V.violet}12`} onMouseLeave={e => e.currentTarget.style.background = "transparent"} title="Klick zum Bearbeiten">{img.rationale}</p>}</div>}
          {img.visual && <div style={{ background: `${V.cyan}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.cyan}12` }}><Lbl c={V.cyan}>Visuelle Hinweise für Designer</Lbl>{isEditing("visual", 0) ? <textarea autoFocus value={editVal} onChange={e => { setEditVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }} ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} style={{ ...inpS, fontSize: 12.5, lineHeight: 1.65, minHeight: 80, resize: "vertical", overflow: "hidden" }} /> : <p onClick={() => startEdit("visual", 0, img.visual)} style={{ fontSize: 12.5, color: V.text, lineHeight: 1.65, margin: 0, fontStyle: "italic", cursor: "text", borderRadius: 8, padding: "4px 6px", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = `${V.cyan}12`} onMouseLeave={e => e.currentTarget.style.background = "transparent"} title="Klick zum Bearbeiten">{img.visual}</p>}</div>}

          {img.eyecatchers?.length > 0 && <div><Lbl c={V.amber}>Eyecatcher-Vorschläge</Lbl><div style={{ fontSize: 10, color: V.textDim, marginBottom: 8 }}>Wähle einen Eyecatcher aus — nur der ausgewählte wird im Designer-Export angezeigt.</div>{img.eyecatchers.map((ec, i) => { const ecActive = (ecSel[img.id] ?? 0) === i; const eType = ecType(ec); const eCopy = ecCopy(ec); const typeLabel = eType === "badge" ? "Badge-Text" : eType === "text" ? "Bild-Text" : "Darstellungshinweis"; const typeColor = eType === "visual" ? V.textDim : V.amber; return <div key={i} onClick={() => { pushUndo(); setEcSel(p => ({ ...p, [img.id]: ecActive ? -1 : i })); }} style={{ ...gS, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", border: ecActive ? `2px solid ${V.amber}` : "1px solid rgba(0,0,0,0.06)", background: ecActive ? `${V.amber}08` : "transparent", cursor: "pointer", opacity: ecActive ? 1 : 0.6, transition: "all 0.15s" }}><div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-start" }}><div style={{ width: 18, height: 18, borderRadius: 99, border: ecActive ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{ecActive && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.amber }} />}</div><span style={{ color: V.amber, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>{isEditing("eyecatcher", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 12.5, padding: "4px 8px", flex: 1 }} /> : <div onClick={e => { e.stopPropagation(); startEdit("eyecatcher", i, ec.copyText || ec.idea); }} style={{ cursor: "text", flex: 1 }} title="Klick zum Bearbeiten"><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: eCopy && ec.idea && eType !== "visual" ? 4 : 0 }}><span style={{ fontSize: 9, fontWeight: 700, color: typeColor, textTransform: "uppercase", letterSpacing: ".06em", padding: "1px 6px", borderRadius: 4, background: eType === "visual" ? "rgba(0,0,0,0.04)" : `${V.amber}12` }}>{typeLabel}</span></div>{eCopy ? <span style={{ padding: "4px 12px", borderRadius: 6, background: eType === "badge" ? `${V.emerald}12` : `${V.amber}15`, border: `1px solid ${eType === "badge" ? V.emerald : V.amber}25`, fontSize: 14, fontWeight: 800, color: eType === "badge" ? V.emerald : V.amber, display: "inline-block" }}>{eCopy}</span> : null}{eType === "visual" ? <span style={{ fontSize: 12.5, color: V.text, lineHeight: 1.5 }}>{ec.idea}</span> : ec.idea && ec.idea !== eCopy ? <div style={{ fontSize: 10.5, color: V.textDim, marginTop: 3, fontStyle: "italic" }}>{ec.idea}</div> : null}</div>}</div><Pill c={ec.risk === "low" ? V.emerald : V.amber}>{ec.risk === "low" ? "Geringes Risiko" : "Graubereich"}</Pill></div>; })}<div onClick={() => { pushUndo(); setEcSel(p => ({ ...p, [img.id]: -1 })); }} style={{ ...gS, padding: 10, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", opacity: (ecSel[img.id] ?? 0) === -1 ? 1 : 0.5 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: (ecSel[img.id] ?? 0) === -1 ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{(ecSel[img.id] ?? 0) === -1 && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.amber }} />}</div><span style={{ fontSize: 12, color: V.textDim, fontStyle: "italic" }}>Kein Eyecatcher</span></div></div>}

          {te ? <div><Lbl c={V.orange}>Bildtexte (Deutsch)</Lbl>
            {/* HEADLINES */}
            {hls.length > 0 && <>
            <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.orange}>HEADLINE-VARIANTEN</Pill><CopyBtn text={curHl} /></div>
              {hls.map((h, i) => { const hlWarn = h.length > MAX_HL, hlSoft = h.length > SOFT_HL && h.length <= MAX_HL, act = ci === i; const labels = ["USP", "Kundenvorteil", "Kreativ"]; const labelColors = [V.orange, V.emerald, V.violet]; return <div key={i} onClick={() => setHlC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.violet}` : "1px solid rgba(0,0,0,0.06)", background: act ? `${V.violet}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.violet}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.violet }} />}</div>{isEditing("hl", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 15, fontWeight: 800, padding: "4px 8px", flex: 1 }} /> : <span onDoubleClick={e => { e.stopPropagation(); startEdit("hl", i, h); }} style={{ fontSize: 15, fontWeight: 800, color: V.ink }} title="Doppelklick zum Bearbeiten">{h}</span>}</div><div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}><span style={{ fontSize: 9, color: labelColors[i] || V.textDim, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${labelColors[i] || V.textDim}12` }}>{labels[i] || ""}</span><span style={{ fontSize: 10, fontWeight: 700, color: hlWarn ? V.rose : hlSoft ? V.amber : V.textDim }}>{h.length}/{SOFT_HL}</span></div></div>; })}
            </div>
            {/* SUBHEADLINES */}
            {subs.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.blue}>SUBHEADLINE-VARIANTEN</Pill><CopyBtn text={curSh} /></div>
              {subs.map((s, i) => { const act = si === i || (si === undefined && i === 0); return <div key={i} onClick={() => setShC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: act ? `${V.blue}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div>{isEditing("sub", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 13, fontWeight: 600, padding: "4px 8px", flex: 1 }} /> : <span onDoubleClick={e => { e.stopPropagation(); startEdit("sub", i, s); }} style={{ fontSize: 13, fontWeight: 600, color: V.ink }} title="Doppelklick zum Bearbeiten">{s}</span>}</div></div>; })}
              <div onClick={() => setShC(p => ({ ...p, [img.id]: -1 }))} style={{ padding: "10px 14px", borderRadius: 10, border: si === -1 ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: si === -1 ? `${V.blue}08` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: si === -1 ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{si === -1 && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div><span style={{ fontSize: 13, fontWeight: 600, color: V.textDim, fontStyle: "italic" }}>Keine Subheadline</span></div>
            </div>}
            {/* Legacy single subheadline fallback */}
            {subs.length === 0 && te.subheadline && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><Pill c={V.blue}>SUBHEADLINE</Pill><CopyBtn text={te.subheadline} /></div><div style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6 }}>{te.subheadline}</div></div>}
            </>}
            {/* FORMAT LEGEND */}
            {bullets.length > 0 && bullets.some(b => bFmt(b) !== "bullet") && <FormatLegend lang="de" />}
            {/* TEXTBAUSTEINE — with drag-and-drop reordering + rich text editing + format labels */}
            <div style={{ ...gS, padding: 14, marginBottom: 10 }}>{bullets.length > 0 && <><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill c={V.teal}>TEXTBAUSTEINE · {selectedBullets.length}/{bullets.length}</Pill><CopyBtn text={selectedBullets.map(bText).join("\n")} /></div>{bullets.map((b, i) => { const bt = bText(b), bf = bFmt(b), fCol = formatColors[bf] || V.textDim; const on = bSel[i] !== false; const isDragging = dragIdx === i; const isDragOver = dragOver === i && dragIdx !== i; return <div key={i} onDragStart={() => { dragIdxRef.current = i; setDragIdx(i); }} onDragEnd={e => { e.currentTarget.removeAttribute("draggable"); const from = dragIdxRef.current, to = dragOverRef.current; if (from !== null && to !== null && from !== to) { onEditText(sel, "reorder_bullets", from, to); setBulSel(p => { const old = p[bKey] || bullets.map(() => true); const ns = [...old]; const [moved] = ns.splice(from, 1); ns.splice(to, 0, moved); return { ...p, [bKey]: ns }; }); } dragIdxRef.current = null; dragOverRef.current = null; setDragIdx(null); setDragOver(null); }} onDragOver={e => { e.preventDefault(); dragOverRef.current = i; if (dragOver !== i) setDragOver(i); }} onDragLeave={() => setDragOver(null)} style={{ display: "flex", gap: 6, marginTop: 10, padding: "8px 10px", borderRadius: 8, border: isDragOver ? `2px solid ${V.teal}` : on ? `1.5px solid ${fCol}30` : "1.5px solid rgba(0,0,0,0.04)", background: isDragOver ? `${V.teal}15` : on ? `${fCol}06` : "transparent", cursor: "default", opacity: isDragging ? 0.4 : on ? 1 : 0.45, transition: "all 0.15s", alignItems: "flex-start" }}>
              <div onMouseDown={e => { e.currentTarget.parentElement.setAttribute("draggable", "true"); }} style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, cursor: "grab", padding: "4px 2px", color: V.textDim, fontSize: 10, userSelect: "none" }} title="Ziehen zum Verschieben">⋮⋮</div>
              <div onClick={e => { e.stopPropagation(); const next = [...(bulSel[bKey] || bullets.map(() => true))]; next[i] = !on; setBulSel(p => ({ ...p, [bKey]: next })); }} style={{ width: 18, height: 18, borderRadius: 4, border: on ? `2px solid ${fCol}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer" }}>{on && <span style={{ color: fCol, fontSize: 12, fontWeight: 800 }}>✓</span>}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {bf !== "bullet" && <span style={{ fontSize: 8, fontWeight: 800, color: fCol, textTransform: "uppercase", letterSpacing: ".06em", padding: "1px 5px", borderRadius: 3, background: `${fCol}12`, marginBottom: 3, display: "inline-block" }}>{formatLabels[bf] || bf}</span>}
                {bf === "comparison" ? (
                  isEditing("bul", i) ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 9, color: V.textDim, marginBottom: 2 }}>Zeile 1 = eigenes Produkt · Zeile 2 = Alternative/Vergleich</div><textarea autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={e => { onEditText(sel, "bul", i, editVal); setEditField(null); }} onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }} style={{ ...inpS, fontSize: 12.5, padding: "8px 10px", minHeight: 56, resize: "vertical", lineHeight: 1.6 }} placeholder={"Eigenes Produkt: Vorteil\nAlternative: Nachteil"} /></div> : <div onClick={e => { e.stopPropagation(); startEdit("bul", i, bt); }} style={{ cursor: "text", display: "block", minHeight: 20 }} title="Klick zum Bearbeiten">{bt ? bt.split("\n").map((line, li) => <div key={li} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}><span style={{ fontSize: 9, fontWeight: 800, color: li === 0 ? V.emerald : V.rose, flexShrink: 0, width: 12, textAlign: "center" }}>{li === 0 ? "+" : "−"}</span><span style={{ fontSize: 12.5, color: li === 0 ? V.text : V.textDim, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<b style="color:#0F172A;font-weight:700">$1</b>') }} /></div>) : <span style={{ fontSize: 12.5, color: V.textDim, fontStyle: "italic" }}>Vergleich eingeben…</span>}</div>
                ) : isEditing("bul", i) ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><div style={{ display: "flex", gap: 4, marginBottom: 2 }}><button onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: FN, color: V.ink }}>B</button><span style={{ fontSize: 9, color: V.textDim, alignSelf: "center" }}>oder Strg+B</span></div><div contentEditable suppressContentEditableWarning ref={el => { if (el && !el.dataset.init) { el.innerHTML = editVal; el.dataset.init = "1"; } }} onBlur={e => { onEditText(sel, "bul", i, html2md(e.currentTarget.innerHTML)); setEditField(null); }} onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "b" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("bold"); } }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 12.5, padding: "4px 8px", minHeight: 28, outline: "none", lineHeight: 1.6 }} /></div> : <span onClick={e => { e.stopPropagation(); startEdit("bul", i, md2html(bt)); }} style={{ fontSize: 12.5, color: bt ? V.textMed : V.textDim, lineHeight: 1.6, cursor: "text", display: "block", minHeight: 20, fontStyle: bt ? "normal" : "italic" }} title="Klick zum Bearbeiten">{bt ? <span dangerouslySetInnerHTML={{ __html: bt.replace(/\*\*(.+?)\*\*/g, '<b style="color:#0F172A;font-weight:700">$1</b>') }} /> : "Text eingeben…"}</span>}
              </div>
              <button onClick={e => { e.stopPropagation(); onEditText(sel, "delete_bullet", i, null); }} style={{ background: "none", border: "none", color: V.textDim, fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0, opacity: 0.5 }} title="Textbaustein löschen">×</button>
            </div>; })}</>}<div style={{ position: "relative", marginTop: 8 }}><button onClick={() => setAddFmtOpen(!addFmtOpen)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px dashed ${V.teal}40`, background: addFmtOpen ? `${V.teal}08` : "transparent", color: V.teal, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN, width: "100%" }}>+ Textbaustein hinzufügen</button>{addFmtOpen && <><div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setAddFmtOpen(false)} /><div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 100, marginBottom: 4, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(16px)", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 360, overflowY: "auto" }}>{Object.keys(formatLabels).map(f => { const c = formatColors[f]; return <button key={f} onClick={() => { onEditText(sel, "add_bullet", bullets.length, f); setAddFmtOpen(false); setTimeout(() => startEdit("bul", bullets.length, f === "comparison" ? "" : ""), 50); }} onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = `0 2px 12px ${c}25`; e.currentTarget.style.borderColor = `${c}50`; }} onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = `${c}20`; }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c}20`, background: `${c}04`, cursor: "pointer", fontFamily: FN, textAlign: "left", transition: "all 0.15s" }}><div style={{ flexShrink: 0, width: 48, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{formatWireframes[f]?.(c) || null}</div><div><div style={{ fontSize: 9, fontWeight: 800, color: c, textTransform: "uppercase", letterSpacing: ".04em" }}>{formatLabels[f]}</div><div style={{ fontSize: 8.5, color: V.textDim, lineHeight: 1.3, marginTop: 1 }}>{formatDescriptions[f]?.split("—")[0]?.trim() || ""}</div></div></button>; })}</div></>}</div></div>
            {/* BADGE — select one from multiple options + inline editing */}
            {allBadges.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.amber}>BADGE-VARIANTEN</Pill></div>
              {allBadges.map((b, i) => { const act = bdgIdx === i; return <div key={i} onClick={() => setBdgSel(p => ({ ...p, [img.id]: act ? -1 : i }))} style={{ padding: "8px 12px", borderRadius: 10, border: act ? `2px solid ${V.amber}` : "1px solid rgba(0,0,0,0.06)", background: act ? `${V.amber}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: act ? 1 : 0.6, transition: "all 0.15s" }}><div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.amber }} />}</div>{isEditing("badge", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 13, fontWeight: 800, padding: "4px 8px", flex: 1 }} /> : <span onClick={e => { e.stopPropagation(); startEdit("badge", i, b); }} style={{ fontSize: 13, fontWeight: 800, color: V.amber, cursor: "text" }} title="Klick zum Bearbeiten">{b}</span>}</div>{act && <CopyBtn text={b} />}</div>; })}
              <div onClick={() => setBdgSel(p => ({ ...p, [img.id]: -1 }))} style={{ padding: "8px 12px", borderRadius: 10, border: bdgIdx === -1 ? `2px solid ${V.amber}` : "1px solid rgba(0,0,0,0.06)", background: bdgIdx === -1 ? `${V.amber}08` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: bdgIdx === -1 ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{bdgIdx === -1 && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.amber }} />}</div><span style={{ fontSize: 13, fontWeight: 600, color: V.textDim, fontStyle: "italic" }}>Kein Badge</span></div>
            </div>}
            {/* FOOTNOTES */}
            {te.footnotes?.length > 0 && <div style={{ ...gS, padding: 12, background: `${V.textDim}08`, marginBottom: 10 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>Fußnoten</span>{te.footnotes.map((f, i) => <div key={i} style={{ fontSize: 11, color: V.textDim, marginTop: 4, lineHeight: 1.5 }}>{f}</div>)}</div>}
          </div> : <div style={{ padding: 16, ...gS, borderStyle: "dashed", textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Kein Text-Overlay. Rein visuelles Bild.</span></div>}

          {/* REFERENCE IMAGES — upload per image, supports drag-and-drop */}
          <div onDragOver={e => { e.preventDefault(); setRefDragOver(true); }} onDragLeave={() => setRefDragOver(false)} onDrop={handleRefDrop} style={{ ...gS, padding: 14, marginTop: 8, borderStyle: (refImages[img.id]?.length ? "solid" : "dashed"), borderColor: refDragOver ? V.blue : undefined, background: refDragOver ? `${V.blue}08` : undefined, transition: "all 0.15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><Lbl c={V.textMed}>Referenzbilder</Lbl><label style={{ fontSize: 10, fontWeight: 700, color: V.blue, cursor: "pointer", padding: "4px 10px", borderRadius: 6, background: `${V.blue}10`, border: `1px solid ${V.blue}25` }}>+ Hochladen<input type="file" accept="image/*" multiple onChange={handleRefUpload} style={{ display: "none" }} /></label></div>
            {(refImages[img.id]?.length > 0) ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{refImages[img.id].map((src, ri) => <div key={ri} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}><img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button onClick={() => removeRefImage(img.id, ri)} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 99, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button></div>)}</div> : <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: refDragOver ? V.blue : V.textDim }}>{refDragOver ? "Bilder hier ablegen..." : "Bilder hierher ziehen oder oben klicken zum Hochladen."}</div>}
          </div>

        </div>
      </GC>
      {/* Kaufauslöser-Abdeckung — live check across all selected texts (updates on every edit, toggle, add, delete) */}
      {D.audience?.triggers?.length > 0 && (() => {
        const triggers = D.audience.triggers;
        const norm = s => (s || "").toLowerCase().replace(/[^a-zäöüß0-9\s]/g, "");
        // Helper: return live editVal if this field is currently being edited, otherwise the committed value
        const liveVal = (imgIdx, type, idx, committed) => (editField && sel === imgIdx && editField.type === type && editField.idx === idx) ? editVal : committed;
        // Collect all currently active texts across all enabled images
        let allTexts = "";
        (D.images || []).forEach((im, imgIdx) => {
          if (imgDisabled?.[im.id]) return;
          const t = im.texts;
          if (!t) return;
          // Headlines — selected variant, with live edit overlay
          const h = t.headlines || (t.headline ? [t.headline] : []);
          const ci = hlC[im.id] ?? 0;
          allTexts += " " + liveVal(imgIdx, "hl", ci, h[ci] || h[0] || "");
          // Subheadlines — selected variant
          const ss = Array.isArray(t.subheadlines) ? t.subheadlines : (t.subheadline ? [t.subheadline] : []);
          const si = shC[im.id] ?? 0;
          if (si !== -1) allTexts += " " + liveVal(imgIdx, "sub", si, ss[si] || ss[0] || "");
          // Bullets — only active ones
          const bl = t.bullets || [];
          const bs = bulSel[im.id] || bl.map(() => true);
          bl.forEach((b, i) => { if (bs[i] !== false) allTexts += " " + liveVal(imgIdx, "bul", i, bText(b)); });
          // Badges — all badges (not variant-selected, all contribute to the image)
          const ab = getAllBadges(t);
          ab.forEach((b, i) => { if (b) allTexts += " " + liveVal(imgIdx, "badge", i, b); });
          // Eyecatchers — selected one
          const ecIdx = ecSel?.[im.id] ?? 0;
          const ec = im.eyecatchers?.[ecIdx];
          if (ec) { const ct = liveVal(imgIdx, "eyecatcher", ecIdx, ecCopy(ec)); if (ct) allTexts += " " + ct; allTexts += " " + (ec.idea || ""); }
        });
        const normAll = norm(allTexts);
        // German morpheme analysis for compound word matching
        const derivSuffixes = ["keit","heit","ung","lich","isch","bar","sam","los","ig","ieren","iert","tion","ment","nis","tät"];
        const fugenLaute = ["s","n","en","es","er","ns"];
        const stripSuffix = (w) => {
          for (const sx of derivSuffixes) {
            if (w.endsWith(sx) && w.length > sx.length + 2) return w.substring(0, w.length - sx.length);
          }
          return w;
        };
        // Split compound into meaningful morphemes at Fugenlaute boundaries
        const splitCompound = (word) => {
          const w = norm(word).replace(/[\s\-]+/g, "");
          if (w.length < 6) return [w];
          const stems = new Set([w, stripSuffix(w)]);
          // Try splitting at each position — left part must be ≥3 chars
          for (let i = 3; i <= w.length - 3; i++) {
            const left = w.substring(0, i);
            const right = w.substring(i);
            // Right side might start with a Fugenlaut
            let rightCore = right;
            for (const f of fugenLaute) {
              if (right.startsWith(f) && right.length > f.length + 2) {
                rightCore = right.substring(f.length);
                break;
              }
            }
            // Only keep splits where left is ≥4 chars (meaningful)
            if (left.length >= 4) {
              stems.add(left);
              stems.add(stripSuffix(left));
            }
            if (rightCore.length >= 4) {
              stems.add(rightCore);
              stems.add(stripSuffix(rightCore));
            }
          }
          // Filter: only stems ≥4 chars that aren't pure suffixes
          return [...stems].filter(s => s.length >= 4 && !derivSuffixes.includes(s));
        };
        const missing = triggers.filter(tr => {
          const trigNorm = norm(tr).replace(/[\s\-]+/g, "");
          // 1. Exact match
          if (trigNorm.length >= 4 && normAll.includes(trigNorm)) return false;
          // 2. Space/hyphen-separated words
          const words = norm(tr).split(/[\s\-]+/).filter(w => w.length > 3);
          if (words.some(w => normAll.includes(w))) return false;
          // 3. Morpheme matching via compound splitting
          const stems = splitCompound(tr);
          if (stems.length > 0) {
            const found = stems.filter(s => normAll.includes(s));
            // Covered if at least one meaningful stem (≥5 chars) found in texts
            if (found.some(s => s.length >= 5)) return false;
          }
          return true;
        });
        if (!missing.length) return null;
        return <div style={{ ...gS, padding: "14px 18px", marginTop: 10, background: `${V.rose}08`, border: `2px solid ${V.rose}30`, borderRadius: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: V.rose, marginBottom: 6 }}>Kaufauslöser nicht abgedeckt</div>
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.6, marginBottom: 6 }}>Folgende Kaufauslöser aus der Analyse sind in der aktuellen Textauswahl nicht erkennbar:</div>
              {missing.map((tr, i) => <div key={i} style={{ fontSize: 12, fontWeight: 700, color: V.rose, padding: "4px 10px", borderRadius: 6, background: `${V.rose}10`, display: "inline-block", marginRight: 6, marginBottom: 4 }}>{tr}</div>)}
              <div style={{ fontSize: 10, color: V.textDim, marginTop: 8 }}>Prüfe, ob diese Kaufargumente durch andere Texte/Bilder oder die aktuelle Auswahl abgedeckt werden.</div>
            </div>
          </div>
        </div>;
      })()}
    </div>
  );
}

// ═══════ REVIEWS ═══════
function ReviewsTab({ D }) {
  const r = D.reviews || { positive: [], negative: [] };
  const maxPos = Math.max(...(r.positive || []).map(x => x.pct || 0), 1);
  const maxNeg = Math.max(...(r.negative || []).map(x => x.pct || 0), 1);
  const sc = { solved: V.emerald, unclear: V.amber, neutral: V.textDim };
  const sl = { solved: "Im Briefing adressiert", unclear: "Klärung erforderlich", neutral: "Kein Handlungsbedarf" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {r.source && <div style={{ ...gS, padding: 14 }}><span style={{ fontSize: 12, color: V.textMed }}><b style={{ color: V.violet }}>Datenquelle:</b> {r.source}</span>{r.estimated && <span style={{ fontSize: 10, color: V.textDim, marginLeft: 8 }}>(Geschätzte relative Häufigkeiten)</span>}</div>}
      <GC><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.emerald}>Positive Bewertungsthemen</Lbl></div><div style={{ padding: "14px 20px" }}>{(r.positive || []).map((x, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}><span style={{ fontSize: 12, fontWeight: 600, color: V.text, width: 240, flexShrink: 0 }}>{x.theme}</span><RelBar pct={x.pct} maxPct={maxPos} color={V.emerald} /><span style={{ fontSize: 11, color: V.textDim, width: 50, textAlign: "right", flexShrink: 0, fontWeight: 600 }}>~{x.pct}%</span></div>)}</div></GC>
      <GC><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.rose}>Negative Bewertungsthemen & Handlungsbedarf</Lbl></div><div style={{ padding: "14px 20px" }}>{(r.negative || []).map((x, i) => <div key={i} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: i < r.negative.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}><span style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{x.theme}</span><span style={{ marginLeft: "auto" }}><Pill c={sc[x.status] || V.textDim}>{sl[x.status] || x.status}</Pill></span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}><RelBar pct={x.pct} maxPct={maxNeg} color={V.rose} /><span style={{ fontSize: 11, color: V.textDim, width: 50, textAlign: "right", flexShrink: 0 }}>~{x.pct}%</span></div>
        {x.quotes?.length > 0 && <div style={{ marginBottom: 8 }}>{x.quotes.map((q, qi) => <div key={qi} style={{ fontSize: 12, color: V.textMed, fontStyle: "italic", lineHeight: 1.5, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${V.rose}30` }}>"{q}"</div>)}</div>}
        {x.implication && <div style={{ fontSize: 12, color: V.text, lineHeight: 1.55, padding: "8px 12px", background: `${sc[x.status] || V.textDim}08`, borderRadius: 8 }}><b>Aktion:</b> {x.implication}</div>}
      </div>)}</div></GC>
    </div>
  );
}

// ═══════ LISTING QUALITY SCORE ═══════
function calcLQS(pd) {
  if (!pd || (!pd.title && !pd.bullets)) return null;
  const titleLen = pd.title?.length || 0;
  // Bullet length in bytes (UTF-8) — use TextEncoder for accurate byte count
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const bulletBytes = (pd.bullets || []).map(b => encoder ? encoder.encode(b).length : b.length);
  const minBulletBytes = bulletBytes.length > 0 ? Math.min(...bulletBytes) : 0;
  const checks = [
    // Sorted by weight descending — highest impact first
    { label: "Titel 150+ Zeichen", ok: titleLen >= 150, weight: 1.5 },
    { label: "5 Bullet Points", ok: (pd.bullets?.length || 0) >= 5, weight: 1.5 },
    { label: "Bullets 200+ Bytes je Bullet", ok: bulletBytes.length >= 5 && minBulletBytes >= 200, weight: 1.5 },
    { label: "7 Bilder", ok: (pd.imageCount || 0) >= 7, weight: 1.5 },
    { label: `A+ Content (${pd.aplusModuleCount || 0}/6+ Module)`, ok: (pd.aplusModuleCount || 0) >= 6, weight: 1, badge: "aplus", unknown: pd.hasAPlus == null },
    { label: pd.buyboxSeller && !pd.hasBuybox ? `Buybox fremd (${pd.buyboxSeller})` : "Buybox vorhanden", ok: !!pd.hasBuybox, weight: 1, unknown: pd.hasBuybox == null },
    { label: "Versand unter 4 Tagen", ok: pd.deliveryDays != null && pd.deliveryDays < 4, weight: 1, unknown: pd.deliveryDays == null },
    { label: "Prime", ok: !!pd.isPrime, weight: 1, badge: "prime", unknown: pd.isPrime == null },
    { label: "Rating 4.3+", ok: parseFloat(pd.rating || 0) >= 4.3, weight: 1 },
    { label: "20+ Bewertungen", ok: parseInt(pd.reviewCount || 0) >= 20, weight: 1 },
    { label: "Beschreibung vorhanden", ok: !!pd.description && pd.description.length > 50, weight: 1 },
    { label: "Inkl. Video", ok: !!pd.hasVideo, weight: 0.5 },
    { label: "Brand Story", ok: !!pd.hasBrandStory, weight: 0.5, badge: "brandstory", unknown: pd.hasBrandStory == null },
    { label: "Brand Store", ok: !!pd.hasBrandStore, weight: 0.5, badge: "brandstore", unknown: pd.hasBrandStore == null },
    { label: "Climate Pledge Friendly", ok: !!pd.climatePledge, weight: 0.5, badge: "climate", unknown: pd.climatePledge == null },
  ];
  // Only count checks where data is available (unknown = not scraped → exclude from max weight)
  const knownChecks = checks.filter(c => !c.unknown);
  const maxW = knownChecks.reduce((a, c) => a + c.weight, 0);
  const score = knownChecks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0);
  return { score: Math.round((score / maxW) * 10 * 10) / 10, max: 10, checks, pct: Math.round((score / maxW) * 100) };
}

// SVG badges for Prime and Climate Pledge
const PrimeBadge = ({ size = 16, dim }) => <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity: dim ? 0.35 : 1 }}><path d="M2 12l2-2h4l2-4h4l2 4h4l2 2-6 8H8z" fill={dim ? "#999" : "#00A8E1"} /><path d="M9.5 12.5l1.5 1.5 3.5-3.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ClimateBadge = ({ size = 16, dim }) => <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity: dim ? 0.35 : 1 }}><circle cx="12" cy="12" r="10" fill={dim ? "#999" : "#2D6B4D"} /><path d="M12 6c-2 2-4 5-2 8s4 3 4 3c0-2-1-4-1-6s1-3 1-5c-1 0-1.5 0-2 0z" fill="#8FD4A4" /><path d="M10 14c1-1 3-1 4 0" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" /></svg>;

function LQSCard({ lqs }) {
  if (!lqs) return null;
  const color = lqs.score >= 7 ? V.emerald : lqs.score >= 4 ? V.amber : V.rose;
  const badgeIcon = (c) => {
    if (c.badge === "prime") return <PrimeBadge size={14} dim={!c.ok} />;
    if (c.badge === "climate") return <ClimateBadge size={14} dim={!c.ok} />;
    return null;
  };
  return <GC style={{ padding: 20, gridColumn: "1 / -1" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <Lbl c={color}>Listing Quality Score</Lbl>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={{ fontSize: 28, fontWeight: 900, color }}>{lqs.score}</span><span style={{ fontSize: 12, color: V.textDim, fontWeight: 700 }}>/ {lqs.max}</span></div>
    </div>
    <div style={{ height: 8, background: "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}><div style={{ width: `${lqs.pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}BB)`, borderRadius: 99 }} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{lqs.checks.map((c, i) => {
      const icon = badgeIcon(c);
      const statusColor = c.unknown ? V.textDim : c.ok ? V.emerald : V.rose;
      const statusSymbol = c.unknown ? "–" : c.ok ? "✓" : "✗";
      return <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
        {icon || <span style={{ color: statusColor, fontSize: 11, fontWeight: 800 }}>{statusSymbol}</span>}
        <span style={{ fontSize: 11, color: c.unknown ? V.textDim : c.ok ? V.text : V.textDim, fontStyle: c.unknown ? "italic" : "normal" }}>{c.label}{c.unknown ? " (n/a)" : ""}</span>
      </div>;
    })}</div>
  </GC>;
}

// ═══════ ANALYSE ═══════
function AnalyseTab({ D, lqs }) {
  const a = D.audience || {}, c = D.competitive || {}, k = D.keywords || {}, lw = D.listingWeaknesses;
  const ic = { high: V.rose, medium: V.amber, low: V.textDim };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14 }}>
      {lqs && <LQSCard lqs={lqs} />}
      {lw?.length > 0 && <GC style={{ padding: 20, gridColumn: "1 / -1", background: `${V.rose}06` }}><Lbl c={V.rose}>Schwachstellen im aktuellen Listing</Lbl>{lw.map((w, i) => <div key={i} style={{ ...gS, padding: 14, marginBottom: 8, background: "rgba(255,255,255,0.6)", display: "flex", gap: 14 }}><Pill c={ic[w.impact] || V.textDim} s={{ flexShrink: 0 }}>{w.impact === "high" ? "Hoch" : w.impact === "medium" ? "Mittel" : "Gering"}</Pill><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, marginBottom: 4 }}>{w.weakness}</div><div style={{ fontSize: 12, color: V.emerald }}>→ {w.briefingAction}</div></div></div>)}</GC>}
      <GC style={{ padding: 20, background: `${V.orange}06` }}><Lbl c={V.orange}>Kaufauslöser (nach Wichtigkeit)</Lbl>{(a.triggers || []).map((t, i) => { const s = 1 - i / Math.max((a.triggers?.length || 1) - 1, 1); return <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: `${V.orange}${Math.round(s * 12).toString(16).padStart(2, "0")}`, border: i === 0 ? `1px solid ${V.orange}25` : "1px solid transparent" }}><span style={{ color: V.orange, fontWeight: 800, fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 12.5, color: i === 0 ? V.ink : V.textMed, fontWeight: i === 0 ? 700 : 400, lineHeight: 1.55 }}>{t}</span></div>; })}{a.balance && <div style={{ marginTop: 10, padding: 10, background: `${V.orange}0A`, borderRadius: 10 }}><span style={{ fontSize: 11, fontWeight: 700, color: V.orange }}>{a.balance}</span></div>}</GC>
      <GC style={{ padding: 20 }}><Lbl c={V.violet}>Zielgruppe</Lbl><p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{a.persona}</p>{a.desire && <div style={{ background: `${V.emerald}0A`, borderRadius: 12, padding: 12, marginBottom: 8 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.emerald }}>KERNWUNSCH</span><p style={{ fontSize: 12, color: V.emerald, lineHeight: 1.55, margin: "4px 0 0" }}>{a.desire}</p></div>}{a.fear && <div style={{ background: `${V.rose}0A`, borderRadius: 12, padding: 12 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.rose }}>KERNANGST</span><p style={{ fontSize: 12, color: V.rose, lineHeight: 1.55, margin: "4px 0 0" }}>{a.fear}</p></div>}</GC>
      <GC style={{ padding: 20 }}><Lbl c={V.blue}>Wettbewerbslandschaft</Lbl><p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{c.patterns}</p>{(c.gaps || []).length > 0 && <><span style={{ fontSize: 10, fontWeight: 800, color: V.cyan }}>MARKTLÜCKEN</span>{c.gaps.map((g, i) => <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}><span style={{ color: V.cyan, fontSize: 10, marginTop: 2 }}>◆</span><span style={{ fontSize: 12, color: V.textMed, lineHeight: 1.55 }}>{g}</span></div>)}</>}</GC>
      <GC style={{ padding: 20 }}><Lbl c={V.violet}>Keywords</Lbl>{(k.volume || []).length > 0 && <div style={{ marginBottom: 14 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.blue }}>SUCHVOLUMEN</span><div style={{ marginTop: 6 }}>{k.volume.map((kw, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: `${V.blue}14`, border: `1px solid ${V.blue}22`, margin: "0 5px 5px 0" }}><Check on={kw.used} /><span style={{ fontSize: 10.5, fontWeight: 700, color: V.blue }}>{kw.kw}</span></div>)}</div></div>}{(k.purchase || []).length > 0 && <div><span style={{ fontSize: 10, fontWeight: 800, color: V.orange }}>KAUFABSICHT</span><div style={{ marginTop: 6 }}>{k.purchase.map((kw, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: `${V.orange}14`, border: `1px solid ${V.orange}22`, margin: "0 5px 5px 0" }}><Check on={kw.used} /><span style={{ fontSize: 10.5, fontWeight: 700, color: V.orange }}>{kw.kw}</span></div>)}</div></div>}</GC>
      {(k.badges || []).filter(b => b.requiresApplication !== false).length > 0 && <GC style={{ padding: 20, gridColumn: "1 / -1" }}><Lbl c={V.amber}>Beantragungspflichtige Siegel</Lbl><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>{k.badges.filter(b => b.requiresApplication !== false).map((b, i) => <div key={i} style={{ ...gS, padding: 12, background: "rgba(255,255,255,0.5)" }}><span style={{ fontSize: 12, fontWeight: 800, color: V.amber }}>{b.kw}</span><p style={{ fontSize: 11, color: V.textDim, margin: "4px 0 0" }}>{b.note}</p></div>)}</div></GC>}
    </div>
  );
}


// ═══════ BRIEFING EXPORT ═══════
const IMG_LABELS = ["Main Image", "PT.01", "PT.02", "PT.03", "PT.04", "PT.05", "PT.06"];
// Dynamic image label that supports multiple MAIN images
function getImgLabel(images, idx) {
  const img = images[idx];
  const id = (img?.id || "").toLowerCase();
  if (id.startsWith("main")) {
    const mainCount = images.filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
    if (mainCount <= 1) return "Main Image";
    const mainIdx = images.slice(0, idx + 1).filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
    return mainIdx === 1 ? "Main Image" : `Main Image ${mainIdx}`;
  }
  const ptIdx = images.slice(0, idx + 1).filter(im => !(im.id || "").toLowerCase().startsWith("main")).length;
  return `PT.${String(ptIdx).padStart(2, "0")}`;
}
function getImgFileName(images, idx, asin) {
  const img = images[idx];
  const id = (img?.id || "").toLowerCase();
  let label;
  if (id.startsWith("main")) {
    const mainCount = images.filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
    if (mainCount <= 1) { label = "MAIN"; }
    else {
      const mainIdx = images.slice(0, idx + 1).filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
      label = mainIdx === 1 ? "MAIN" : `MAIN${mainIdx}`;
    }
  } else {
    const ptIdx = images.slice(0, idx + 1).filter(im => !(im.id || "").toLowerCase().startsWith("main")).length;
    label = `PT${String(ptIdx).padStart(2, "0")}`;
  }
  return asin ? `${asin}.${label}` : label;
}
function genBrief(D, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel) {
  let t = `AMAZON GALLERY IMAGE BRIEFING\n${"=".repeat(50)}\nProduct: ${D.product?.name} | ${D.product?.brand}\nMarketplace: ${D.product?.marketplace}\n\n`;
  (D.images || []).forEach((im, idx) => {
    if (imgDisabled?.[im.id]) return; // skip disabled images
    const expLabel = getImgLabel(D.images, idx) + (im.theme ? " | " + im.theme : "") + " (" + (im.role || im.label) + ")";
    t += `${"-".repeat(50)}\n${expLabel}\n${"-".repeat(50)}\nCONCEPT:\n${im.conceptEn || im.concept}\n\nRATIONALE:\n${im.rationaleEn || im.rationale}\n`;
    if (im.eyecatchers?.length) {
      const selEcIdx = ecSel?.[im.id] ?? 0;
      if (selEcIdx !== -1 && im.eyecatchers[selEcIdx]) {
        const ec = im.eyecatchers[selEcIdx];
        const eType = ecType(ec); const eCopy = ecCopy(ec);
        t += `\nSELECTED EYECATCHER [${eType}]:\n`;
        if (eCopy) t += `  Copy text: "${eCopy}"\n`;
        if (ec.idea && ec.idea !== eCopy) t += `  ${eType === "visual" ? "Visual direction" : "Placement"}: ${ec.idea}\n`;
        t += `  Risk: ${ec.risk}\n`;
      }
    }
    if (im.texts) {
      const h = im.texts.headlines || (im.texts.headline ? [im.texts.headline] : []);
      const ci = hlC[im.id] ?? 0;
      const subs = Array.isArray(im.texts.subheadlines) ? im.texts.subheadlines : (im.texts.subheadline ? [im.texts.subheadline] : []);
      const si = shC?.[im.id] ?? 0;
      const bullets = im.texts.bullets || [];
      const bSel = bulSel?.[im.id] || bullets.map(() => true);
      const selBullets = bullets.filter((_, i) => bSel[i]);
      const allBadges = getAllBadges(im.texts);
      const { badge: selBadge } = getSelectedBadge(bdgSel, im.id, allBadges);
      t += "\nTEXTS (DE):\n";
      if (h.length) t += `  Headline: "${h[ci] || h[0]}"\n`;
      if (si !== -1 && subs.length > 0) { t += `  Subheadline: "${subs[si] || subs[0]}"\n`; }
      if (selBullets.length) t += `  Text Elements:\n${selBullets.map(b => { const f = bFmt(b); return `    - [${f}] "${strip(bText(b))}"` }).join("\n")}\n`;
      if (selBadge) t += `  Badge: "${selBadge}"\n`;
      if (im.texts.footnotes?.length) t += `  Footnotes: ${im.texts.footnotes.map(f => `"${f}"`).join(" | ")}\n`;
    } else { t += "\nTEXTS: None — visual-only image\n"; }
    t += `\nVISUAL NOTES:\n${im.visualEn || im.visual}\n\n`;
  });
  return t;
}
// ═══════ FILE NAME COPY (click-to-copy for designer) ═══════
function FileNameCopy({ name }) {
  const [ok, set] = useState(false);
  return <span onClick={() => { navigator.clipboard.writeText(name); set(true); setTimeout(() => set(false), 1200); }} style={{ fontSize: 12, fontWeight: 700, color: ok ? V.emerald : V.violet, padding: "4px 10px", borderRadius: 6, background: ok ? `${V.emerald}15` : `${V.violet}10`, fontFamily: "monospace", cursor: "pointer", border: ok ? `1px solid ${V.emerald}30` : "1px solid transparent", transition: "all 0.15s", userSelect: "all" }}>{ok ? "Copied!" : name}</span>;
}
// ═══════ DESIGNER VIEW (standalone shareable page - final decisions only) ═══════
function DesignerView({ D: initialD, selections: initialSelections, briefingId, serverVersion, userAsin: initialUserAsin }) {
  const [liveD, setLiveD] = useState(initialD);
  const [liveSelections, setLiveSelections] = useState(initialSelections);
  const D = liveD;
  const hlC = liveSelections?.hlC || {}, shC = liveSelections?.shC || {}, bulSel = liveSelections?.bulSel || {}, bdgSel = liveSelections?.bdgSel || {}, ecSel = liveSelections?.ecSel || {};
  const links = liveSelections?.links || {};
  const designerNotes = liveSelections?.designerNotes || "";
  const [dTab, setDTab] = useState(0); // designer tab index
  const [lightboxSrc, setLightboxSrc] = useState(null); // enlarged reference image
  const [updateBanner, setUpdateBanner] = useState(null);
  const [changedFields, setChangedFields] = useState(new Set());
  const versionRef = useRef(serverVersion || 1);
  // Poll for briefing updates every 15 seconds — auto-apply new data
  useEffect(() => {
    if (!briefingId) return;
    const check = async () => {
      try {
        const r = await fetch("/api/briefing?id=" + briefingId);
        if (!r.ok) return;
        const d = await r.json();
        if (d.version && d.version > versionRef.current) {
          const newBriefing = d.data?.briefing;
          const newSelections = d.data?.selections;
          // Detect which images changed
          const changes = new Set();
          if (newBriefing?.images && D?.images) {
            newBriefing.images.forEach((ni, idx) => {
              const oi = D.images?.[idx];
              if (!oi || JSON.stringify(ni) !== JSON.stringify(oi)) changes.add(idx);
            });
            // Check for added/removed images
            if (newBriefing.images.length !== D.images.length) {
              for (let i = D.images.length; i < newBriefing.images.length; i++) changes.add(i);
            }
          }
          // Also detect selection changes
          const selKeys = ["hlC", "shC", "bulSel", "bdgSel", "links"];
          const selChanges = [];
          if (newSelections) {
            selKeys.forEach(k => {
              if (JSON.stringify(newSelections[k] || {}) !== JSON.stringify((liveSelections || {})[k] || {})) selChanges.push(k);
            });
          }
          // Build change description — tell the designer exactly what changed
          const parts = [];
          if (changes.size > 0) {
            // List which images changed by name
            const changedNames = [...changes].map(idx => {
              const img = newBriefing.images[idx];
              const id = (img?.id || "").toLowerCase();
              if (id.startsWith("main")) return "Main Image";
              const ptIdx = newBriefing.images.slice(0, idx + 1).filter(im => !(im.id || "").toLowerCase().startsWith("main")).length;
              return `PT.${String(ptIdx).padStart(2, "0")}`;
            });
            parts.push(`Images changed: ${changedNames.join(", ")}`);
          }
          if (selChanges.includes("hlC") || selChanges.includes("shC")) parts.push("Text selections updated");
          if (selChanges.includes("bulSel")) parts.push("Bullet selection changed");
          if (selChanges.includes("bdgSel")) parts.push("Badge selection changed");
          if (selChanges.includes("links")) parts.push("Links updated");
          const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          // Auto-apply new data
          if (newBriefing) setLiveD(newBriefing);
          if (newSelections) setLiveSelections(newSelections);
          versionRef.current = d.version;
          setChangedFields(changes);
          if (parts.length > 0) {
            setUpdateBanner({ text: parts.join(" · "), time: timeStr });
          }
        }
      } catch {}
    };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, [briefingId, D, liveSelections]);
  // Detect changes from previous version (on initial load)
  useEffect(() => {
    const prevData = initialSelections?._previousData || null;
    if (!prevData?.briefing?.images || !D?.images) return;
    const changes = new Set();
    const prev = prevData.briefing;
    D.images.forEach((ni, idx) => {
      const oi = prev.images?.[idx];
      if (!oi || JSON.stringify(ni) !== JSON.stringify(oi)) changes.add(idx);
    });
    if (changes.size > 0) {
      const changedNames = [...changes].map(idx => {
        const img = D.images[idx];
        const id = (img?.id || "").toLowerCase();
        if (id.startsWith("main")) return "Main Image";
        const ptIdx = D.images.slice(0, idx + 1).filter(im => !(im.id || "").toLowerCase().startsWith("main")).length;
        return `PT.${String(ptIdx).padStart(2, "0")}`;
      });
      setChangedFields(changes);
      setUpdateBanner({ text: `Images changed since last version: ${changedNames.join(", ")}`, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) });
    }
  }, []);
  if (!D?.images?.length) return null;
  const asin = D.product?.sku || "";
  const ICopy = ({ text, children, style: s = {} }) => {
    const [ok, set] = useState(false);
    return <div onClick={() => { navigator.clipboard.writeText(strip(text)); set(true); setTimeout(() => set(false), 1200); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: ok ? `${V.emerald}12` : "transparent", border: ok ? `1px solid ${V.emerald}25` : "1px solid transparent", transition: "all 0.15s", ...s }} onMouseEnter={e => { if (!ok) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }} onMouseLeave={e => { if (!ok) e.currentTarget.style.background = "transparent"; }}>{children}<span style={{ fontSize: 10, fontWeight: 700, color: ok ? V.emerald : V.textDim, opacity: ok ? 1 : 0, transition: "opacity 0.15s", flexShrink: 0 }}>{ok ? "Copied" : ""}</span></div>;
  };
  const liveImgDisabled = liveSelections?.imgDisabled || {};
  const liveRefImages = liveSelections?.refImages || {};
  const getImageData = (img) => {
    const te = img?.texts;
    const hls = te?.headlines || (te?.headline ? [te.headline] : []);
    const ci = hlC[img.id] ?? 0;
    const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
    const si = shC[img.id] ?? 0;
    const bullets = te?.bullets || [];
    const bSel = bulSel[img.id] || bullets.map(() => true);
    const allBadges = getAllBadges(te);
    const { badge: selBadge } = getSelectedBadge(bdgSel, img.id, allBadges);
    return {
      headline: hls[ci] || hls[0] || "",
      subheadline: si === -1 ? "" : (subs[si] || subs[0] || te?.subheadline || ""),
      bullets: bullets.filter((_, i) => bSel[i]),
      badges: selBadge ? [selBadge] : [],
      footnotes: te?.footnotes || [],
      hasTexts: !!te,
    };
  };
  // Image file naming — supports multiple MAIN images: MAIN, MAIN2, MAIN3...
  const imgName = (idx) => {
    // Count how many "main" images there are (id starts with "main")
    const mainCount = D.images.filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
    const img = D.images[idx];
    const id = (img?.id || "").toLowerCase();
    let label;
    if (id.startsWith("main")) {
      if (mainCount <= 1) { label = "MAIN"; }
      else {
        // MAIN, MAIN2, MAIN3...
        const mainIdx = D.images.slice(0, idx + 1).filter(im => (im.id || "").toLowerCase().startsWith("main")).length;
        label = mainIdx === 1 ? "MAIN" : `MAIN${mainIdx}`;
      }
    } else {
      // PT images: count non-main images before this one
      const ptIdx = D.images.slice(0, idx + 1).filter(im => !(im.id || "").toLowerCase().startsWith("main")).length;
      label = `PT${String(ptIdx).padStart(2, "0")}`;
    }
    return asin ? `${asin}.${label}` : label;
  };
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Orbs /><style>{`*, *::before, *::after { box-sizing: border-box; } @media print { body { background: white !important; } } @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {/* Sticky Time Tracker */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <TimeTracker productName={D.product?.name} brand={initialUserAsin ? (D.product?.brand || "") : ""} asin={initialUserAsin || ""} marketplace={D.product?.marketplace} briefingUrl={briefingId ? (window.location.origin + "/d/" + briefingId) : window.location.href} outputUrl={links.outputUrl || ""} projectId={briefingId || ""} />
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 80px", position: "relative", zIndex: 1 }}>
        {/* Update banner — auto-applied, shows what changed */}
        {updateBanner && <div style={{ ...glass, padding: "16px 22px", marginBottom: 18, background: `${V.orange}10`, border: `2px solid ${V.orange}40`, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: V.orange, marginBottom: 6 }}>Heads up — Briefing has just been updated</div>
              <div style={{ fontSize: 13, color: V.text, lineHeight: 1.6, marginBottom: 4 }}>Changes have been made to this briefing. The updates are already applied automatically and highlighted below.</div>
              <div style={{ fontSize: 12, color: V.textMed, marginTop: 6 }}>{updateBanner.text}</div>
              <div style={{ fontSize: 11, color: V.textDim, marginTop: 4 }}>Updated at {updateBanner.time}</div>
            </div>
            <button onClick={() => { setUpdateBanner(null); setChangedFields(new Set()); }} style={{ ...gS, padding: "8px 14px", fontSize: 11, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8, flexShrink: 0 }}>Got it</button>
          </div>
        </div>}
        {/* Header */}
        <div style={{ ...glass, padding: "18px 24px", marginBottom: 18 }}>
          <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Designer Briefing</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: V.ink }}>{D.product?.name}</div>
          <div style={{ fontSize: 13, color: V.textDim }}>{D.product?.brand} · {D.product?.marketplace}{asin ? ` · ${asin}` : ""}</div>
        </div>
        {/* Links section */}
        {(links.inputUrls?.length > 0 || links.inputUrl || links.outputUrl || links.psdUrl) && <div style={{ ...glass, padding: "14px 22px", marginBottom: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(links.inputUrls || (links.inputUrl ? [links.inputUrl] : [])).map((u, i) => u && <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${V.blue}, ${V.violet})`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FN }}>{(links.inputUrls?.length || 0) > 1 ? `Assets ${i + 1}` : "Assets / Source Files"}</a>)}
          {links.outputUrl && <a href={links.outputUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${V.emerald}, ${V.teal})`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FN }}>Upload Results</a>}
          {links.psdUrl && <a href={links.psdUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${V.violet}, ${V.rose})`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FN }}>PSD Files</a>}
        </div>}
        {/* Designer Notes */}
        {designerNotes && <div style={{ ...glass, padding: "14px 22px", marginBottom: 18, border: `1px solid ${V.orange}20` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: V.orange, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>General Notes</div>
          <p style={{ fontSize: 14, color: V.text, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{designerNotes}</p>
        </div>}
        {/* File naming convention — click to copy */}
        <div style={{ ...gS, padding: "12px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: V.textMed, textTransform: "uppercase", letterSpacing: ".06em" }}>File naming:</span>
          {D.images.map((img, i) => liveImgDisabled[img.id] ? null : <FileNameCopy key={i} name={imgName(i)} />)}
          <span style={{ fontSize: 11, color: V.textDim }}>.jpg / .png, max 5 MB each</span>
        </div>
        {/* Image tabs — like Studio, switch between images */}
        {(() => {
          const visibleImages = D.images.map((img, idx) => ({ img, idx })).filter(({ img }) => !liveImgDisabled[img.id]);
          const safeTab = Math.min(dTab, visibleImages.length - 1);
          if (!visibleImages.length) return <div style={{ ...glass, padding: 32, textAlign: "center", color: V.textDim }}>No images in this briefing.</div>;
          const { img, idx } = visibleImages[safeTab] || visibleImages[0];
          const d = getImageData(img);
          const isMain = (img.id || "").toLowerCase().startsWith("main");
          const isChanged = changedFields.has(idx);
          const imgRefs = liveRefImages[img.id] || [];
          return <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 14 }}>{visibleImages.map(({ img: vi, idx: vi_idx }, ti) => {
            const viChanged = changedFields.has(vi_idx);
            const active = ti === safeTab;
            return <button key={vi_idx} onClick={() => setDTab(ti)} style={{ ...gS, padding: "8px 14px", background: active ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : viChanged ? `${V.orange}12` : "rgba(255,255,255,0.5)", color: active ? "#fff" : V.textDim, border: active ? "none" : viChanged ? `1px solid ${V.orange}40` : "1px solid rgba(0,0,0,0.06)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: active ? `0 4px 20px ${V.violet}40` : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0, transition: "all 0.15s" }}><span style={{ fontSize: 11, fontWeight: 800 }}>{imgName(vi_idx)}</span>{vi.theme && <span style={{ fontSize: 9, fontWeight: 500, opacity: active ? 0.85 : 0.7, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{vi.theme}</span>}</button>;
          })}</div>
          <GC key={idx} style={{ marginBottom: 18, border: isChanged ? `2px solid ${V.orange}50` : undefined }}>
            {isChanged && <div style={{ padding: "8px 22px", background: `${V.orange}10`, borderBottom: `1px solid ${V.orange}20`, fontSize: 12, fontWeight: 700, color: V.orange }}>This image was changed in the latest update</div>}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{imgName(idx)}</span>
                {img.theme && <Pill c={V.violet}>{img.theme}</Pill>}
                <span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span>
              </div>
              {d.hasTexts && <CopyBtn text={[d.headline, d.subheadline, ...d.bullets.map(b => strip(bText(b))), ...d.badges].filter(Boolean).join("\n")} label="Copy All" />}
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Concept + Visual side by side */}
              <div style={{ display: "grid", gridTemplateColumns: img.visual ? "1fr 1fr" : "1fr", gap: 16 }}>
                {img.concept && <div><Lbl c={V.blue}>Concept</Lbl><p style={{ fontSize: 14, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.conceptEn || img.concept}</p></div>}
                {img.visual && <div><Lbl c={V.textDim}>Visual Notes</Lbl><p style={{ fontSize: 13, color: V.textDim, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visualEn || img.visual}</p></div>}
              </div>
              {img.rationale && <div style={{ background: `${V.violet}06`, borderRadius: 12, padding: 16, border: `1px solid ${V.violet}10` }}><Lbl c={V.violet}>Rationale</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.7, margin: 0 }}>{img.rationaleEn || img.rationale}</p></div>}
              {/* Eyecatchers - Main Image only, show only selected */}
              {isMain && img.eyecatchers?.length > 0 && (() => {
                const selIdx = ecSel[img.id] ?? 0;
                if (selIdx === -1) return null;
                const ec = img.eyecatchers[selIdx];
                if (!ec) return null;
                const eType = ecType(ec); const eCopy = ecCopy(ec);
                const typeLabel = eType === "badge" ? "Badge Text" : eType === "text" ? "Image Text" : "Visual Direction";
                return <div><Lbl c={V.amber}>Eyecatcher Element</Lbl><div style={{ ...gS, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <Pill c={eType === "visual" ? V.textDim : eType === "badge" ? V.emerald : V.amber} s={{ marginBottom: 6 }}>{typeLabel}</Pill>
                    {eCopy ? (
                      <ICopy text={eCopy}><span style={{ padding: "5px 14px", borderRadius: 8, background: eType === "badge" ? `${V.emerald}12` : `${V.amber}15`, border: `1px solid ${eType === "badge" ? V.emerald : V.amber}25`, fontSize: 16, fontWeight: 800, color: eType === "badge" ? V.emerald : V.amber, display: "inline-block" }}>{eCopy}</span></ICopy>
                    ) : null}
                    {eType === "visual" ? (
                      <p style={{ fontSize: 14, color: V.text, lineHeight: 1.6, margin: "4px 0 0" }}>{ec.idea}</p>
                    ) : ec.idea && ec.idea !== eCopy ? (
                      <p style={{ fontSize: 12, color: V.textDim, lineHeight: 1.5, margin: "6px 0 0", fontStyle: "italic" }}>{ec.idea}</p>
                    ) : null}
                  </div>
                  <Pill c={ec.risk === "low" ? V.emerald : V.amber}>{ec.risk === "low" ? "Low risk" : "Gray area"}</Pill>
                </div></div>;
              })()}
              {/* ── IMAGE TEXTS ── clearly separated from concept/visual above */}
              {d.hasTexts && <div style={{ background: `${V.orange}06`, borderRadius: 14, padding: 18, border: `2px solid ${V.orange}18`, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: V.orange, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${V.orange}20` }}>Image Texts</div>
                {/* HEADLINE — prominent, clearly distinct */}
                {d.headline && <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 10, border: `1px solid ${V.orange}15` }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.orange, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Headline</div>
                  <ICopy text={d.headline}><span style={{ fontSize: 20, fontWeight: 800, color: V.ink, lineHeight: 1.3 }}>{d.headline}</span></ICopy>
                </div>}
                {/* SUBHEADLINE */}
                {d.subheadline && <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.blue, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Subheadline</div>
                  <ICopy text={d.subheadline}><span style={{ fontSize: 15, color: V.textMed, lineHeight: 1.4 }}>{d.subheadline}</span></ICopy>
                </div>}
                {/* FORMAT LEGEND + TEXT ELEMENTS */}
                {d.bullets.length > 0 && d.bullets.some(b => bFmt(b) !== "bullet") && <FormatLegend lang="en" defaultOpen={true} />}
                {d.bullets.length > 0 && <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.teal, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Text Elements</div>
                  {d.bullets.map((b, i) => { const bt = bText(b), bf = bFmt(b), fCol = formatColors[bf] || V.textDim; return <ICopy key={i} text={strip(bt)} style={{ marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      {bf !== "bullet" && <span style={{ fontSize: 7, fontWeight: 800, color: fCol, textTransform: "uppercase", letterSpacing: ".04em", padding: "2px 5px", borderRadius: 3, background: `${fCol}12`, flexShrink: 0, marginTop: 4 }}>{formatLabelsEn[bf] || bf}</span>}
                      {bf === "bullet" && <span style={{ color: V.teal, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>-</span>}
                      {bf === "comparison" ? <div>{bt.split("\n").map((line, li) => <div key={li} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}><span style={{ fontSize: 9, fontWeight: 800, color: li === 0 ? V.emerald : V.rose, flexShrink: 0 }}>{li === 0 ? "+" : "−"}</span><span style={{ fontSize: 14, color: li === 0 ? V.text : V.textDim, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<b style="font-weight:700;color:#0F172A">$1</b>') }} /></div>)}</div> : <span style={{ fontSize: 14, color: V.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: bt.replace(/\*\*(.+?)\*\*/g, '<b style="font-weight:700;color:#0F172A">$1</b>') }} />}
                    </div>
                  </ICopy>; })}
                </div>}
                {/* BADGES */}
                {d.badges.length > 0 && <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.amber, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Badge</div>
                  {d.badges.map((b, i) => <ICopy key={i} text={b}><span style={{ padding: "6px 14px", borderRadius: 8, background: `${V.amber}15`, border: `1px solid ${V.amber}25`, fontSize: 14, fontWeight: 800, color: V.amber }}>{b}</span></ICopy>)}
                </div>}
                {/* FOOTNOTES */}
                {d.footnotes.length > 0 && <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${V.textDim}15` }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.textDim, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Footnotes</div>
                  {d.footnotes.map((f, i) => <ICopy key={i} text={f}><span style={{ fontSize: 12, color: V.textDim, lineHeight: 1.5 }}>{f}</span></ICopy>)}
                </div>}
              </div>}
              {!d.hasTexts && <div style={{ padding: 18, ...gS, borderStyle: "dashed", textAlign: "center" }}><span style={{ fontSize: 13, color: V.textDim }}>No text overlay. Visual-only image.</span></div>}
              {/* Reference images — click to enlarge */}
              {imgRefs.length > 0 && <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: V.textMed, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Reference Images</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{imgRefs.map((src, ri) => <img key={ri} src={src} alt="" onClick={() => setLightboxSrc(src)} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", cursor: "pointer", transition: "transform 0.15s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={e => e.currentTarget.style.transform = ""} />)}</div>
              </div>}
            </div>
          </GC>
          </>;
        })()}
      </div>
      {/* Lightbox overlay for reference images */}
      {lightboxSrc && <div onClick={() => setLightboxSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 24 }}>
        <img src={lightboxSrc} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 20px 80px rgba(0,0,0,0.5)" }} />
        <button onClick={() => setLightboxSrc(null)} style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: 99, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 22, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>}
    </div>
  );
}

// ═══════ CLIENT DOCX EXPORT ═══════
async function generateClientDocx(D, selections, lang) {
  const isDE = lang === "de";
  const hlC = selections?.hlC || {}, shC = selections?.shC || {}, bulSel = selections?.bulSel || {}, bdgSel = selections?.bdgSel || {}, imgDisabled = selections?.imgDisabled || {}, ecSel = selections?.ecSel || {};
  const productName = D.product?.name || "";
  const brand = D.product?.brand || "";
  const sku = D.product?.sku || "";
  const marketplace = D.product?.marketplace || "";

  // helpers
  const txt = (s, opts = {}) => new TextRun({ text: s || "", font: "Calibri", ...opts });
  const bold = (s, opts = {}) => txt(s, { bold: true, ...opts });
  const para = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 120 }, ...opts });
  const h1 = (s) => new Paragraph({ children: [new TextRun({ text: s, bold: true, size: 36, color: "7C3AED", font: "Calibri" })], heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 160 } });
  const h2 = (s) => new Paragraph({ children: [new TextRun({ text: s, bold: true, size: 28, color: "2563EB", font: "Calibri" })], heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } });
  const h3 = (s) => new Paragraph({ children: [new TextRun({ text: s, bold: true, size: 24, color: "334155", font: "Calibri" })], heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } });
  const divider = () => new Paragraph({ children: [], border: { bottom: { color: "E2E8F0", style: BorderStyle.SINGLE, size: 6 } }, spacing: { after: 200 } });
  const getImgLabelStr = (images, i) => { const m = images.filter(x => (x.id || "").toLowerCase().startsWith("main")); const p = images.filter(x => !(x.id || "").toLowerCase().startsWith("main")); const isM = (images[i]?.id || "").toLowerCase().startsWith("main"); if (isM) { const mi = m.indexOf(images[i]); return m.length === 1 ? (isDE ? "Hauptbild" : "Main Image") : `${isDE ? "Hauptbild" : "Main Image"} ${mi + 1}`; } return `${isDE ? "Produktbild" : "Product Image"} ${p.indexOf(images[i]) + 1}`; };

  const sections = [];

  // ── TITLE PAGE ──
  sections.push(para([bold(productName, { size: 52, color: "7C3AED" })]));
  if (brand) sections.push(para([txt(brand, { size: 28, color: "64748B" })]));
  sections.push(para([]));
  if (sku) sections.push(para([bold(isDE ? "ASIN / SKU: " : "ASIN / SKU: "), txt(sku)]));
  if (marketplace) sections.push(para([bold(isDE ? "Marktplatz: " : "Marketplace: "), txt(marketplace)]));
  sections.push(para([bold(isDE ? "Erstellt am: " : "Created: "), txt(new Date().toLocaleDateString(isDE ? "de-DE" : "en-US"))]));
  sections.push(divider());

  // ── INTRO ──
  sections.push(h1(isDE ? "Ihr Listing-Konzept" : "Your Listing Concept"));
  sections.push(para([txt(isDE
    ? `Dieses Dokument stellt das entwickelte Konzept für Ihr Amazon-Listing dar. Es umfasst das visuelle Konzept, die strategische Ausrichtung sowie die empfohlenen Textelemente für jedes Ihrer Produktbilder.`
    : `This document presents the developed concept for your Amazon listing. It covers the visual concept, strategic direction, and recommended text elements for each of your product images.`,
    { size: 24 })]));
  sections.push(divider());

  // ── PER IMAGE ──
  const visibleImages = D.images.filter(im => !imgDisabled[im.id]);
  for (let i = 0; i < visibleImages.length; i++) {
    const img = visibleImages[i];
    const realIdx = D.images.indexOf(img);
    const label = getImgLabelStr(D.images, realIdx);
    const concept = isDE ? img.concept : (img.conceptEn || img.concept);
    const rationale = isDE ? img.rationale : (img.rationaleEn || img.rationale);
    const te = img.texts;
    const hls = te?.headlines || (te?.headline ? [te.headline] : []);
    const ci = hlC[img.id] ?? 0;
    const headline = hls[ci] || hls[0] || "";
    const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
    const si = shC[img.id] ?? 0;
    const subheadline = si !== -1 ? (subs[si] || subs[0] || "") : "";
    const bullets = te?.bullets || [];
    const bSelArr = bulSel[img.id] || bullets.map(() => true);
    const activeBullets = bullets.filter((_, bi) => bSelArr[bi] !== false);

    sections.push(h2(`${label}${img.theme ? ` — ${img.theme}` : ""}`));

    // Concept
    if (concept) {
      sections.push(h3(isDE ? "Bildkonzept" : "Image Concept"));
      sections.push(para([txt(concept, { size: 22 })]));
    }

    // Rationale — reframed for client
    if (rationale) {
      sections.push(h3(isDE ? "Strategische Ausrichtung" : "Strategic Direction"));
      sections.push(para([txt(rationale, { size: 22 })]));
    }

    // Text elements
    if (headline || subheadline || activeBullets.length > 0) {
      sections.push(h3(isDE ? "Empfohlene Textelemente" : "Recommended Text Elements"));
      if (headline) {
        sections.push(para([bold(isDE ? "Überschrift: " : "Headline: "), txt(headline, { size: 22 })]));
      }
      if (subheadline) {
        sections.push(para([bold(isDE ? "Unterzeile: " : "Subheadline: "), txt(subheadline, { size: 22 })]));
      }
      if (activeBullets.length > 0) {
        sections.push(para([bold(isDE ? "Weitere Textelemente:" : "Additional text elements:")]));
        for (const b of activeBullets) {
          const bt = typeof b === "string" ? b : b.text || "";
          const cleanBt = bt.replace(/\*\*(.+?)\*\*/g, "$1");
          sections.push(new Paragraph({ children: [txt(`• ${cleanBt}`, { size: 22 })], spacing: { after: 80 }, indent: { left: 360 } }));
        }
      }
    }

    if (i < visibleImages.length - 1) sections.push(divider());
  }

  // ── FOOTER NOTE ──
  sections.push(divider());
  sections.push(para([txt(isDE
    ? "Alle Konzepte und Texte sind urheberrechtlich geschützt und wurden exklusiv für dieses Projekt entwickelt."
    : "All concepts and texts are protected by copyright and have been developed exclusively for this project.",
    { size: 18, color: "94A3B8", italics: true })]));

  const doc = new Document({ sections: [{ properties: {}, children: sections }], creator: "Briefing Studio", title: productName });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(productName || "briefing").replace(/\s+/g, "_")}_concept_${lang}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════ PDF (temoa CI) ═══════
function exportPDF(D) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [338.67, 190.5] });
  const W = 338.67, H = 190.5;
  // temoa CI colors
  const C = { re: "#FF3130", or: "#FF9903", na: "#023048", lb: "#CEE7F5", bk: "#000000", gr: "#8E9AAD", wh: "#FFFFFF", bg: "#F8F9FB" };
  // Bottom color bar (4 segments)
  const colorBar = () => { const b = 2; pdf.setFillColor(C.re); pdf.rect(0, H - b, W / 4, b, "F"); pdf.setFillColor(C.or); pdf.rect(W / 4, H - b, W / 4, b, "F"); pdf.setFillColor(C.na); pdf.rect(W / 2, H - b, W / 4, b, "F"); pdf.setFillColor(C.lb); pdf.rect(W * 3 / 4, H - b, W / 4, b, "F"); };
  // Top red bar
  const topBar = () => { pdf.setFillColor(C.re); pdf.rect(0, 0, W, 3, "F"); };
  // Footer
  const footer = (n, t) => { pdf.setFontSize(6.5); pdf.setTextColor(C.gr); pdf.text("temoa", 20, H - 8); pdf.text(n + " / " + t, W - 20, H - 8, { align: "right" }); };
  // Logo dots (simplified: 4 colored squares)
  const logoDots = (x, y) => { const s = 2.5, g = 0.8; pdf.setFillColor(C.re); pdf.rect(x, y, s, s, "F"); pdf.setFillColor(C.or); pdf.rect(x + s + g, y, s, s, "F"); pdf.setFillColor(C.na); pdf.rect(x, y + s + g, s, s, "F"); pdf.setFillColor(C.lb); pdf.rect(x + s + g, y + s + g, s, s, "F"); };
  // Shapes as decoration
  const shapeCircle = (x, y, r, c) => { pdf.setFillColor(c); pdf.circle(x, y, r, "F"); };
  const shapeHalf = (x, y, r, c) => { pdf.setFillColor(c); pdf.circle(x, y, r, "F"); pdf.setFillColor(C.wh); pdf.rect(x - r, y, r * 2, r, "F"); };
  // Helpers
  const h1 = (t, x, y, sz) => { pdf.setFontSize(sz || 28); pdf.setTextColor(C.bk); pdf.setFont("helvetica", "bold"); pdf.text(String(t || ""), x, y); };
  const h2 = (t, x, y) => { pdf.setFontSize(14); pdf.setTextColor(C.bk); pdf.setFont("helvetica", "bold"); pdf.text(String(t || ""), x, y); };
  const redText = (t, x, y, sz) => { pdf.setFontSize(sz || 14); pdf.setTextColor(C.re); pdf.setFont("helvetica", "bold"); pdf.text(String(t || ""), x, y); };
  const body = (t, x, y, mw) => { pdf.setFontSize(9); pdf.setTextColor("#5A6B80"); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(String(t || ""), mw || 140), x, y); };
  const label = (t, x, y, c) => { pdf.setFontSize(7); pdf.setTextColor(c || C.or); pdf.setFont("helvetica", "bold"); pdf.text(t.toUpperCase(), x, y); };
  const pill = (t, x, y, w, h, c) => { pdf.setFillColor(c); pdf.roundedRect(x, y, w, h, 2, 2, "F"); pdf.setFontSize(10); pdf.setTextColor(C.wh); pdf.setFont("helvetica", "bold"); pdf.text(String(t), x + w / 2, y + h / 2 + 3.5, { align: "center" }); };
  const a = D.audience || {}, rv = D.reviews || { positive: [], negative: [] }, k = D.keywords || { volume: [], purchase: [] }, co = D.competitive || { gaps: [] }, lw = D.listingWeaknesses || [];
  const TP = 6;

  // ═══ SLIDE 1: Title ═══
  logoDots(20, H - 16);
  shapeCircle(W - 40, 50, 45, C.na);
  shapeCircle(W - 10, H - 20, 35, C.re);
  h1("Datenbasierte", 50, 75, 36);
  h1("Listing-Analyse", 50, 95, 36);
  pdf.setFontSize(14); pdf.setTextColor("#5A6B80"); pdf.setFont("helvetica", "normal");
  pdf.text(String(D.product?.name || ""), 50, 115);
  pdf.setFontSize(10); pdf.text(String((D.product?.brand || "") + " | " + (D.product?.marketplace || "")), 50, 125);
  colorBar(); footer(1, TP);

  // ═══ SLIDE 2: Zielgruppe & Kaufauslöser ═══
  pdf.addPage(); topBar();
  h1("Zielgruppe &", 20, 28, 24); redText("Kaufauslöser", 126, 28, 24);
  // Left: Persona box
  pdf.setFillColor(C.bg); pdf.roundedRect(20, 40, 150, 50, 3, 3, "F");
  label("PERSONA", 28, 50, C.na); body(a.persona, 28, 56, 134);
  // Desire/Fear
  pdf.setFillColor("#ECFDF5"); pdf.roundedRect(20, 96, 150, 22, 3, 3, "F");
  label("KERNWUNSCH", 28, 106, "#1A8754"); body(a.desire, 28, 112, 134);
  pdf.setFillColor("#FFF0F0"); pdf.roundedRect(20, 122, 150, 22, 3, 3, "F");
  label("KERNANGST", 28, 132, C.re); body(a.fear, 28, 138, 134);
  // Right: Triggers
  label("KAUFAUSLÖSER", 186, 50, C.or);
  (a.triggers || []).slice(0, 6).forEach((t, i) => {
    const ry = 58 + i * 13;
    pdf.setFontSize(12); pdf.setTextColor(C.or); pdf.setFont("helvetica", "bold"); pdf.text(String(i + 1) + ".", 186, ry);
    pdf.setFontSize(8.5); pdf.setTextColor(i === 0 ? C.bk : "#5A6B80"); pdf.setFont("helvetica", i === 0 ? "bold" : "normal"); pdf.text(pdf.splitTextToSize(t, 120), 196, ry);
  });
  colorBar(); footer(2, TP);

  // ═══ SLIDE 3: Bewertungen ═══
  pdf.addPage(); topBar();
  h1("Bewertungs", 20, 28, 24); redText("analyse", 107, 28, 24);
  const mp = Math.max(...rv.positive.map(x => x.pct || 0), 1);
  const mn = Math.max(...rv.negative.map(x => x.pct || 0), 1);
  label("POSITIV", 20, 46, "#1A8754");
  rv.positive.slice(0, 6).forEach((x, i) => { const ry = 54 + i * 12; pdf.setFontSize(7.5); pdf.setTextColor("#5A6B80"); pdf.text(String(x.theme), 20, ry, { maxWidth: 80 }); pdf.setFillColor("#E8EAF0"); pdf.roundedRect(105, ry - 3, 50, 4, 1, 1, "F"); pdf.setFillColor("#1A8754"); pdf.roundedRect(105, ry - 3, (x.pct / mp) * 50, 4, 1, 1, "F"); pdf.setFontSize(6.5); pdf.text("~" + x.pct + "%", 158, ry); });
  label("NEGATIV", 186, 46, C.re);
  rv.negative.slice(0, 6).forEach((x, i) => { const ry = 54 + i * 12; pdf.setFontSize(7.5); pdf.setTextColor("#5A6B80"); pdf.text(String(x.theme), 186, ry, { maxWidth: 80 }); pdf.setFillColor("#E8EAF0"); pdf.roundedRect(270, ry - 3, 50, 4, 1, 1, "F"); pdf.setFillColor(C.re); pdf.roundedRect(270, ry - 3, (x.pct / mn) * 50, 4, 1, 1, "F"); pdf.setFontSize(6.5); pdf.text("~" + x.pct + "%", 323, ry); });
  // Listing weaknesses if present
  if (lw.length > 0) { label("LISTING-SCHWACHSTELLEN", 20, 136, C.re); lw.slice(0, 3).forEach((w, i) => { pdf.setFontSize(7.5); pdf.setTextColor(C.bk); pdf.setFont("helvetica", "bold"); pdf.text(String(w.weakness), 20, 144 + i * 10, { maxWidth: 140 }); pdf.setTextColor(C.or); pdf.setFont("helvetica", "normal"); pdf.text("→ " + String(w.briefingAction), 165, 144 + i * 10, { maxWidth: 150 }); }); }
  colorBar(); footer(3, TP);

  // ═══ SLIDE 4: Keywords ═══
  pdf.addPage(); topBar();
  h1("Keywords &", 20, 28, 24); redText("Differenzierung", 110, 28, 24);
  label("TOP KEYWORDS (SUCHVOLUMEN)", 20, 46, C.na);
  (k.volume || []).slice(0, 10).forEach((kw, i) => { const col = i % 5, row = Math.floor(i / 5); pdf.setFillColor(C.na + "12"); pdf.roundedRect(20 + col * 60, 52 + row * 14, 56, 10, 2, 2, "F"); pdf.setFontSize(7); pdf.setTextColor(C.na); pdf.setFont("helvetica", "bold"); pdf.text(String(kw.kw), 24 + col * 60, 52 + row * 14 + 6.5, { maxWidth: 52 }); });
  label("KAUFABSICHT", 20, 88, C.or);
  (k.purchase || []).slice(0, 8).forEach((kw, i) => { const col = i % 4, row = Math.floor(i / 4); pdf.setFillColor(C.or + "12"); pdf.roundedRect(20 + col * 75, 94 + row * 14, 71, 10, 2, 2, "F"); pdf.setFontSize(7); pdf.setTextColor(C.or); pdf.setFont("helvetica", "bold"); pdf.text(String(kw.kw), 24 + col * 75, 94 + row * 14 + 6.5, { maxWidth: 67 }); });
  label("MARKTLÜCKEN", 20, 128, C.na);
  (co.gaps || []).slice(0, 4).forEach((g, i) => { pdf.setFontSize(8); pdf.setTextColor(C.or); pdf.setFont("helvetica", "bold"); pdf.text("◆", 20, 136 + i * 12); pdf.setTextColor("#5A6B80"); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(g, 280), 28, 136 + i * 12); });
  colorBar(); footer(4, TP);

  // ═══ SLIDE 5: Bildstrategie ═══
  pdf.addPage(); topBar();
  h1("Bild", 20, 28, 24); redText("strategie", 52, 28, 24);
  body((D.images || []).length + " datenbasierte Bilder für maximale Conversion", 20, 38, 300);
  (D.images || []).forEach((im, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const bx = 20 + col * 78, by = 48 + row * 58;
    const bgc = i === 0 ? C.re : [C.or, C.na, C.lb, C.re, C.or, C.na, C.lb][i] || C.bg;
    pdf.setFillColor(bgc); pdf.roundedRect(bx, by, 74, 52, 3, 3, "F");
    pdf.setFontSize(9); pdf.setTextColor(C.wh); pdf.setFont("helvetica", "bold"); pdf.text(String(im.label || ""), bx + 6, by + 12);
    if (im.theme) { pdf.setFontSize(7); pdf.text(String(im.theme), bx + 6, by + 18); pdf.setFontSize(6); pdf.text(String(im.role || ""), bx + 6, by + 24); } else { pdf.setFontSize(6.5); pdf.text(String(im.role || ""), bx + 6, by + 18); }
    pdf.setFontSize(7); pdf.setFont("helvetica", "normal");
    const hl = im.texts?.headlines?.[0] || im.texts?.headline || "Nur visuell";
    pdf.text(pdf.splitTextToSize(hl, 62), bx + 6, by + (im.theme ? 30 : 26));
  });
  colorBar(); footer(5, TP);

  // ═══ LAST SLIDE: Nächste Schritte ═══
  pdf.addPage(); topBar();
  shapeCircle(W - 40, H - 30, 40, C.na);
  shapeCircle(W - 90, 30, 25, C.re);
  h1("Nächste", 40, 75, 32); h1("Schritte", 40, 95, 32);
  const steps = ["Briefing-Freigabe durch Kunden", "Bildproduktion durch Design-Team", "A/B Testing & Optimierung"];
  steps.forEach((s, i) => { pdf.setFontSize(11); pdf.setTextColor(C.or); pdf.setFont("helvetica", "bold"); pdf.text(String(i + 1) + ".", 40, 116 + i * 14); pdf.setTextColor("#5A6B80"); pdf.setFont("helvetica", "normal"); pdf.text(s, 52, 116 + i * 14); });
  logoDots(20, H - 16);
  colorBar(); footer(TP, TP);

  pdf.save("temoa_analyse_" + (D.product?.sku || D.product?.name?.replace(/\s+/g, "_") || "export") + ".pdf");
}

// ═══════ MAIN ═══════
const TABS = [{ id: "b", l: "Bild-Briefing" }, { id: "r", l: "Bewertungen" }, { id: "a", l: "Analyse" }, { id: "f", l: "Feedback" }];
export default function App() {
  const [data, setData] = useState(null), [tab, setTab] = useState("b"), [showExp, setSE] = useState(false), [pdfL, setPL] = useState(false), [loading, setL] = useState(false), [status, setSt] = useState(""), [error, setE] = useState(null), [showNew, setSN] = useState(false), [pending, setP] = useState(null), [hlC, setHlC] = useState({}), [shC, setShC] = useState({}), [bulSel, setBulSel] = useState({}), [bdgSel, setBdgSel] = useState({}), [curAsin, setCurAsin] = useState(""), [showHist, setShowHist] = useState(false), [productData, setPD] = useState(null), [txtDensity, setTD] = useState("normal");
  const [shareUrl, setShareUrl] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [designerMode, setDesignerMode] = useState(null);
  const [designerBriefingId, setDesignerBriefingId] = useState(null);
  const [designerVersion, setDesignerVersion] = useState(1);
  const [designerLoading, setDesignerLoading] = useState(false);
  // Image enable/disable state (excluded images)
  const [imgDisabled, setImgDisabled] = useState({});
  // Reference images per briefing image (keyed by image id → array of data URLs)
  const [refImages, setRefImages] = useState({});
  // Server-side briefing history
  const [serverHist, setServerHist] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  // Input/Output links for designer collaboration
  const [inputUrls, setInputUrls] = useState([""]);
  const [outputUrl, setOutputUrl] = useState("");
  const [psdUrl, setPsdUrl] = useState("");
  const [designerNotes, setDesignerNotes] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const [clientExportLoading, setClientExportLoading] = useState(false);
  const [feedback, setFeedback] = useState([]); // [{id, timestamp, text, images:[]}]
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackImages, setFeedbackImages] = useState([]);
  const [feedbackRefining, setFeedbackRefining] = useState(false);
  const [feedbackRefineStatus, setFeedbackRefineStatus] = useState("");
  const [feedbackRefineError, setFeedbackRefineError] = useState(null);
  const [feedbackChanges, setFeedbackChanges] = useState(null); // {summary: string, changedImages: [{idx, label, changes: string[]}]}
  // Track the shared briefing ID so we can update it instead of creating duplicates
  const [sharedBriefingId, setSharedBriefingId] = useState(null);
  // Eyecatcher selection per main image (keyed by image id → selected eyecatcher index, -1 = none)
  const [ecSel, setEcSel] = useState({});
  // Undo/Redo history for data + selections
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const pushUndo = useCallback(() => {
    if (!data) return;
    undoStack.current.push(JSON.stringify({ data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel }));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true); setCanRedo(false);
  }, [data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel]);
  const doUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(JSON.stringify({ data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel }));
    const prev = JSON.parse(undoStack.current.pop());
    setData(prev.data); setHlC(prev.hlC); setShC(prev.shC); setBulSel(prev.bulSel); setBdgSel(prev.bdgSel); setImgDisabled(prev.imgDisabled); setEcSel(prev.ecSel || {});
    setCanUndo(undoStack.current.length > 0); setCanRedo(true);
  }, [data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel]);
  const doRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(JSON.stringify({ data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel }));
    const next = JSON.parse(redoStack.current.pop());
    setData(next.data); setHlC(next.hlC); setShC(next.shC); setBulSel(next.bulSel); setBdgSel(next.bdgSel); setImgDisabled(next.imgDisabled); setEcSel(next.ecSel || {});
    setCanUndo(true); setCanRedo(redoStack.current.length > 0);
  }, [data, hlC, shC, bulSel, bdgSel, imgDisabled, ecSel]);
  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doUndo, doRedo]);
  // Load briefing from shared URL on mount (short ID or legacy hash)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    // Legacy: #d=<compressed> links still work
    if (hash && hash.startsWith("d=")) {
      setDesignerLoading(true);
      // Generate stable project ID from hash data for time tracking
      let hv = 0; for (let i = 0; i < hash.length; i++) { hv = ((hv << 5) - hv) + hash.charCodeAt(i); hv |= 0; }
      setDesignerBriefingId("H" + Math.abs(hv).toString(36));
      decodeBriefing(hash.slice(2)).then(d => { if (d?.briefing?.product) setDesignerMode(d); }).finally(() => setDesignerLoading(false));
      return;
    }
    // New: /d/<id> short URL
    const m = window.location.pathname.match(/^\/d\/([A-Za-z0-9]{6,12})$/);
    if (m) {
      setDesignerLoading(true);
      const bId = m[1];
      fetch("/api/briefing?id=" + bId + "&_=" + Date.now()).then(async r => {
        console.log("[load-briefing] GET /api/briefing?id=" + bId, "status:", r.status);
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          console.error("[load-briefing] Error response:", r.status, errText);
          throw new Error(`API ${r.status}: ${errText}`);
        }
        return r.json();
      }).then(d => {
        console.log("[load-briefing] Response:", d ? "has data" : "null", "briefing:", !!d?.data?.briefing, "product:", !!d?.data?.briefing?.product);
        if (d?.data?.briefing?.product) {
          setDesignerMode(d.data);
          setDesignerBriefingId(bId);
          setDesignerVersion(d.version || 1);
        } else {
          const detail = !d ? "Keine Antwort" : !d.data ? "Keine Daten" : !d.data.briefing ? "Kein Briefing in Daten" : "Kein Produkt in Briefing";
          setE(`Briefing nicht gefunden (${detail}). Der Link ist möglicherweise ungültig oder abgelaufen.`);
        }
      }).catch(e => { console.error("[load-briefing]", e); setE("Briefing konnte nicht geladen werden: " + e.message); }).finally(() => setDesignerLoading(false));
    }
  }, []);
  // Fetch server-side history when panel opens
  useEffect(() => {
    if (!showHist) return;
    setHistLoading(true);
    fetch("/api/briefing?list=recent&limit=20").then(r => r.ok ? r.json() : { items: [] }).then(d => setServerHist(d.items || [])).catch(() => setServerHist([])).finally(() => setHistLoading(false));
  }, [showHist]);
  const shareDesignerLink = useCallback(async () => {
    if (!data) return;
    setShareLoading(true);
    const payload = { briefing: data, selections: { hlC, shC, bulSel, bdgSel, ecSel, imgDisabled, refImages, links: { inputUrls: inputUrls.map(u => u.trim()).filter(Boolean), outputUrl: outputUrl.trim() || null, psdUrl: psdUrl.trim() || null }, designerNotes: designerNotes.trim() || null, feedback: feedback.length ? feedback : undefined, userAsin: curAsin || "" } };
    if (sharedBriefingId) payload._updateId = sharedBriefingId;
    try {
      const bodyStr = JSON.stringify(payload);
      console.log("[share] Payload size:", (bodyStr.length / 1024).toFixed(1) + "KB");
      const res = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyStr });
      console.log("[share] Response status:", res.status);
      if (res.ok) {
        const { id } = await res.json();
        console.log("[share] Saved with ID:", id);
        // Verify the save actually worked by reading it back
        try {
          const verifyRes = await fetch("/api/briefing?id=" + id + "&_=" + Date.now());
          const verifyData = verifyRes.ok ? await verifyRes.json() : null;
          console.log("[share] Verify response:", verifyRes.status, verifyData ? "has data" : "no data", verifyData?.data?.briefing?.product ? "valid" : "INVALID");
          if (!verifyRes.ok || !verifyData?.data?.briefing?.product) {
            console.error("[share] Verification failed! Save returned ID but GET cannot find it.", { status: verifyRes.status, hasData: !!verifyData?.data, hasBriefing: !!verifyData?.data?.briefing });
            setShareUrl("error:Briefing wurde gespeichert (ID: " + id + ") aber kann nicht geladen werden. Mögliches Datenbank-Problem. Prüfe TURSO_DATABASE_URL und TURSO_AUTH_TOKEN in Vercel.");
            setShareLoading(false);
            return;
          }
        } catch (verifyErr) {
          console.error("[share] Verification fetch failed:", verifyErr.message);
        }
        setSharedBriefingId(id);
        const url = window.location.origin + "/d/" + id;
        setShareUrl(url);
        try { await navigator.clipboard.writeText(url); } catch {}
      } else {
        const errText = await res.text().catch(() => "");
        console.error("[share] DB save failed:", res.status, errText);
        setShareUrl("error:" + (errText || res.status));
      }
    } catch (err) {
      console.error("[share] Network error:", err);
      setShareUrl("error");
    }
    setShareLoading(false);
  }, [data, hlC, shC, bulSel, bdgSel, ecSel, imgDisabled, refImages, inputUrls, outputUrl, psdUrl, designerNotes, feedback, sharedBriefingId, curAsin]);
  // Auto-sync changes to designer link whenever data/selections change (debounced 3s)
  const autoSyncRef = useRef(null);
  useEffect(() => {
    if (!sharedBriefingId || !data) return;
    if (autoSyncRef.current) clearTimeout(autoSyncRef.current);
    autoSyncRef.current = setTimeout(async () => {
      const payload = { briefing: data, selections: { hlC, shC, bulSel, bdgSel, ecSel, imgDisabled, refImages, links: { inputUrls: inputUrls.map(u => u.trim()).filter(Boolean), outputUrl: outputUrl.trim() || null, psdUrl: psdUrl.trim() || null }, designerNotes: designerNotes.trim() || null, feedback: feedback.length ? feedback : undefined, userAsin: curAsin || "" }, _updateId: sharedBriefingId };
      try {
        const r = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!r.ok) console.warn("[auto-sync] Failed:", r.status, await r.text().catch(() => ""));
      } catch (e) { console.warn("[auto-sync] Error:", e.message); }
    }, 3000);
    return () => clearTimeout(autoSyncRef.current);
  }, [data, hlC, shC, bulSel, bdgSel, ecSel, imgDisabled, refImages, inputUrls, outputUrl, psdUrl, designerNotes, feedback, sharedBriefingId, curAsin]);
  const go = useCallback(async (a, m, p, f, refData, imgCount, h10Keywords, bestsellerAsin) => {
    setL(true); setE(null); setSt("Starte...");
    try {
      // Step 1: Scrape Amazon product data first (needed for keyword search term)
      setSt("Lade Amazon-Produktdaten...");
      let scrapeResult;
      try {
        scrapeResult = a && a.trim() ? await scrapeProduct(a, m) : { images: [], productData: {} };
      } catch (scrapeErr) {
        throw new Error("SCRAPE_ERROR:" + (scrapeErr.message || "Unbekannter Fehler"));
      }
      const pd = scrapeResult.productData || {};
      // If an ASIN was entered but Bright Data returned empty product data
      if (a && a.trim() && !pd.title && !pd.brand && !pd.bullets?.length) {
        throw new Error("ASIN_NOT_FOUND");
      }
      // Derive best search term: product title keywords or user input
      const searchTerm = pd.title ? pd.title.split(/[,|·\-–—]/).slice(0, 2).join(" ").trim().substring(0, 60) : (p ? p.split(/[,.\n]/)[0].trim() : "");
      // Step 2: All Bright Data queries in parallel (competitors + reviews)
      // If Helium10 data is available, we still fetch BD for competitors & reviews
      setSt(h10Keywords ? "Recherchiere Reviews & Wettbewerber..." : "Recherchiere Keywords, Reviews & Wettbewerber...");
      const bdPromises = [
        // 1. Global keyword search (marketplace-specific) - für Wettbewerber
        searchTerm ? fetchKeywordData(searchTerm, m) : Promise.resolve(null),
        // 2. Simple keyword search (ergänzend)
        searchTerm ? fetchSimpleKeywordData(searchTerm) : Promise.resolve(null),
        // 3. Echte Reviews
        a && a.trim() ? fetchReviewData(a, m) : Promise.resolve(null),
      ];
      // Step 2b: Scrape bestseller if provided
      if (bestsellerAsin) {
        setSt("Lade Bestseller-Daten...");
        bdPromises.push(scrapeProduct(bestsellerAsin, m));
      }
      const results = await Promise.all(bdPromises);
      const [kwGlobal, kwSimple, rvResult] = results;
      const bsResult = bestsellerAsin ? results[3] : null;
      // Merge keyword results from both BD endpoints (used for competitor data)
      let kwResult = mergeKeywordData(kwGlobal, kwSimple);
      // If we have a bestseller, add it to the keyword context
      if (bsResult?.productData?.title) {
        const bsPd = bsResult.productData;
        if (!kwResult) kwResult = { searchTerms: [], competitorKeywords: [], competitors: [] };
        kwResult.bestseller = { title: bsPd.title, brand: bsPd.brand, price: bsPd.price, rating: bsPd.rating, reviewCount: bsPd.reviewCount, bullets: bsPd.bullets, bsr: bsPd.bsr, asin: bestsellerAsin };
      }
      const kwEmpty = !kwResult || (!kwResult.searchTerms?.length && !kwResult.competitors?.length);
      if (kwEmpty && searchTerm && !h10Keywords) {
        console.warn("[Keywords] Keine Keyword-Daten von Bright Data erhalten. Keywords im Briefing werden KI-geschätzt.");
      }
      // Log data collection results
      const bdSummary = [];
      if (h10Keywords) bdSummary.push(`${(h10Keywords.volume?.length || 0) + (h10Keywords.purchase?.length || 0)} Helium10-Keywords`);
      if (kwResult && !kwEmpty) bdSummary.push(`${kwResult.competitors?.length || 0} Wettbewerber`);
      if (rvResult) bdSummary.push(`${rvResult.totalReviews || 0} Reviews`);
      if (bsResult?.productData?.title) bdSummary.push(`Bestseller: ${bsResult.productData.title?.substring(0, 40)}`);
      if (kwEmpty && searchTerm && !h10Keywords) bdSummary.push("Keywords: KI-Schätzung");
      setSt(bdSummary.length ? `Daten geladen: ${bdSummary.join(", ")}. Erstelle Briefing...` : "Erstelle Briefing...");
      // Step 3: Run AI analysis with all scraped + researched data
      if (refData?.images?.length) setSt("Sende Referenz-Bilder an KI (Vision-Analyse)...");
      const result = await runAnalysis(a, m, p, f, setSt, pd, txtDensity, kwResult, rvResult, refData || null, imgCount || 7, h10Keywords || null);
      setData(result); setTab("b"); setSN(false); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setEcSel({}); setCurAsin(a || ""); setPD({ ...pd, imageCount: scrapeResult.images?.length || 0 }); setSharedBriefingId(null); undoStack.current = []; redoStack.current = []; setCanUndo(false); setCanRedo(false); saveH(result, a);
      // Auto-save to DB with retry — every briefing must get a permanent ID
      const autoSavePayload = { briefing: result, selections: { hlC: {}, shC: {}, bulSel: {}, bdgSel: {}, ecSel: {}, imgDisabled: {}, refImages: {}, links: {}, userAsin: a || "" } };
      for (let att = 0; att < 3; att++) {
        try {
          const sr = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autoSavePayload) });
          if (sr.ok) { const { id } = await sr.json(); setSharedBriefingId(id); break; }
          console.error("[auto-save] Attempt", att + 1, "failed:", sr.status);
        } catch (e) { console.error("[auto-save] Attempt", att + 1, "error:", e.message); }
        if (att < 2) await new Promise(ok => setTimeout(ok, 2000 * (att + 1)));
      }
    } catch (e) { setE(e.message); }
    setL(false); setSt("");
  }, [txtDensity]);
  const goNew = useCallback((a, m, p, f, ref, ic, h10, bs) => { data ? setP({ a, m, p, f, ref, ic, h10, bs }) : go(a, m, p, f, ref, ic, h10, bs); }, [data, go]);
  // Standalone views (no app features visible)
  if (designerMode) return <DesignerView D={designerMode.briefing} selections={designerMode.selections} briefingId={designerBriefingId} serverVersion={designerVersion} userAsin={designerMode.selections?.userAsin || ""} />;
  if (designerLoading) return <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, display: "flex", justifyContent: "center", alignItems: "center" }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs /><div style={{ textAlign: "center" }}><div style={{ width: 32, height: 32, border: `3px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} /><div style={{ fontSize: 14, fontWeight: 700, color: V.textMed }}>Designer Briefing wird geladen...</div></div></div>;
  if ((!data && !showNew) || (showNew && !loading) || (loading && !data)) return <StartScreen onStart={data ? goNew : go} loading={loading} status={status} error={error} onDismiss={() => setE(null)} onLoad={(briefingData, selections, briefingId) => {
    setData(briefingData); setTab("b"); setSN(false);
    const sel = selections || {};
    setHlC(sel.hlC || {}); setShC(sel.shC || {}); setBulSel(sel.bulSel || {}); setBdgSel(sel.bdgSel || {}); setEcSel(sel.ecSel || {});
    setImgDisabled(sel.imgDisabled || {}); setRefImages(sel.refImages || {});
    setCurAsin(briefingData.product?.sku || "");
    if (briefingId) setSharedBriefingId(briefingId);
    if (sel.links?.inputUrls?.length) setInputUrls(sel.links.inputUrls); else if (sel.links?.inputUrl) setInputUrls([sel.links.inputUrl]);
    if (sel.links?.outputUrl) setOutputUrl(sel.links.outputUrl);
    if (sel.links?.psdUrl) setPsdUrl(sel.links.psdUrl);
    if (sel.designerNotes) setDesignerNotes(sel.designerNotes);
    if (sel.feedback?.length) setFeedback(sel.feedback);
  }} txtDensity={txtDensity} setTD={setTD} />;
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs /><style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ ...glass, position: "sticky", top: 0, zIndex: 100, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 900 }}>Briefing Studio</div><div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.product?.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{data.product?.brand}{curAsin ? ` · ${curAsin}` : ""}</div></div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setSN(true)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Neues Briefing</button>
            <button onClick={() => setShowHist(p => !p)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10, position: "relative" }}>Verlauf</button>
            <button onClick={() => setShowLinks(p => !p)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: showLinks ? V.blue : V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10, border: showLinks ? `1.5px solid ${V.blue}40` : "1px solid rgba(0,0,0,0.08)" }}>Links</button>
            <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
              <button onClick={doUndo} disabled={!canUndo} title="Rückgängig (Strg+Z)" style={{ ...gS, padding: "6px 8px", fontSize: 14, fontWeight: 700, color: canUndo ? V.ink : V.textDim, cursor: canUndo ? "pointer" : "default", fontFamily: FN, borderRadius: 8, opacity: canUndo ? 1 : 0.35, lineHeight: 1 }}>↩</button>
              <button onClick={doRedo} disabled={!canRedo} title="Wiederherstellen (Strg+Y)" style={{ ...gS, padding: "6px 8px", fontSize: 14, fontWeight: 700, color: canRedo ? V.ink : V.textDim, cursor: canRedo ? "pointer" : "default", fontFamily: FN, borderRadius: 8, opacity: canRedo ? 1 : 0.35, lineHeight: 1 }}>↪</button>
            </div>
            {/* Client DOCX export — DE / EN */}
            <div style={{ display: "flex", gap: 2 }}>
              <button onClick={async () => { setClientExportLoading(true); try { await generateClientDocx(data, { hlC, shC, bulSel, bdgSel, imgDisabled, ecSel }, "de"); } finally { setClientExportLoading(false); } }} disabled={clientExportLoading} style={{ ...gS, padding: "7px 10px", fontSize: 10, fontWeight: 700, color: V.orange, cursor: clientExportLoading ? "wait" : "pointer", fontFamily: FN, borderRadius: "10px 0 0 10px", border: `1.5px solid ${V.orange}30`, background: `${V.orange}08` }} title="Kunden-Export als DOCX (Deutsch)">📄 DE</button>
              <button onClick={async () => { setClientExportLoading(true); try { await generateClientDocx(data, { hlC, shC, bulSel, bdgSel, imgDisabled, ecSel }, "en"); } finally { setClientExportLoading(false); } }} disabled={clientExportLoading} style={{ ...gS, padding: "7px 10px", fontSize: 10, fontWeight: 700, color: V.orange, cursor: clientExportLoading ? "wait" : "pointer", fontFamily: FN, borderRadius: "0 10px 10px 0", border: `1.5px solid ${V.orange}30`, borderLeft: "none", background: `${V.orange}08` }} title="Client Export as DOCX (English)">📄 EN</button>
            </div>
            {sharedBriefingId && <button onClick={shareDesignerLink} disabled={shareLoading} style={{ padding: "8px 18px", borderRadius: 10, border: `1.5px solid ${V.emerald}40`, background: `${V.emerald}10`, color: V.emerald, fontSize: 11, fontWeight: 800, cursor: shareLoading ? "wait" : "pointer", fontFamily: FN, opacity: shareLoading ? 0.7 : 1 }}>{shareLoading ? "Speichern..." : "Speichern"}</button>}
            <button onClick={shareDesignerLink} disabled={shareLoading} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: shareLoading ? "wait" : "pointer", fontFamily: FN, boxShadow: `0 4px 16px ${V.violet}30`, opacity: shareLoading ? 0.7 : 1 }}>{shareLoading ? "Erstellen..." : "Designer-Link"}</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "transparent", borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent", color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{t.l}</button>)}</div>
      </div></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {showHist && <ServerHistory items={serverHist} loading={histLoading} onLoad={(briefingId) => {
          fetch("/api/briefing?id=" + briefingId).then(r => r.ok ? r.json() : null).then(d => {
            if (d?.data?.briefing?.product) {
              setData(d.data.briefing); setTab("b");
              const sel = d.data.selections || {};
              setHlC(sel.hlC || {}); setShC(sel.shC || {}); setBulSel(sel.bulSel || {}); setBdgSel(sel.bdgSel || {}); setEcSel(sel.ecSel || {}); setImgDisabled(sel.imgDisabled || {}); setRefImages(sel.refImages || {});
              setCurAsin(d.data.briefing.product?.sku || "");
              setSharedBriefingId(briefingId);
              setShowHist(false);
              if (sel.links?.inputUrls?.length) setInputUrls(sel.links.inputUrls); else if (sel.links?.inputUrl) setInputUrls([sel.links.inputUrl]);
              if (sel.links?.outputUrl) setOutputUrl(sel.links.outputUrl);
              if (sel.links?.psdUrl) setPsdUrl(sel.links.psdUrl);
              if (sel.designerNotes) setDesignerNotes(sel.designerNotes);
    if (sel.feedback?.length) setFeedback(sel.feedback);
            }
          }).catch(() => {});
        }} onClose={() => setShowHist(false)} />}
        {showLinks && <GC style={{ padding: 0, marginBottom: 14 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.blue}>Designer Links & Notizen</Lbl><button onClick={() => setShowLinks(false)} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div>
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* INPUT LINKS — up to 5 */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.blue, marginBottom: 6, display: "block" }}>Input Links (Assets / Source Files)</label>
              {inputUrls.map((u, i) => <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input type="url" value={u} onChange={e => { const n = [...inputUrls]; n[i] = e.target.value; setInputUrls(n); }} placeholder={`Link ${i + 1} — z.B. Google Drive, Dropbox, Figma...`} style={{ ...inpS, flex: 1 }} />
                {inputUrls.length > 1 && <button onClick={() => setInputUrls(inputUrls.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: V.textDim, fontSize: 16, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>×</button>}
              </div>)}
              {inputUrls.length < 5 && <button onClick={() => setInputUrls([...inputUrls, ""])} style={{ fontSize: 10, fontWeight: 700, color: V.blue, cursor: "pointer", fontFamily: FN, background: `${V.blue}08`, border: `1px dashed ${V.blue}30`, borderRadius: 6, padding: "4px 10px" }}>+ Weiteren Input-Link hinzufügen</button>}
              <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Links zu Produktfotos, Logos, Assets die der Designer braucht (max. 5).</div>
            </div>
            {/* OUTPUT LINKS — normal + PSD */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.emerald, marginBottom: 6, display: "block" }}>Output Link (Upload-Ordner)</label>
                <input type="url" value={outputUrl} onChange={e => setOutputUrl(e.target.value)} placeholder="z.B. Google Drive Upload-Ordner..." style={inpS} />
                <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Ordner für fertige Bilder (.jpg/.png).</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.violet, marginBottom: 6, display: "block" }}>PSD-Output Link</label>
                <input type="url" value={psdUrl} onChange={e => setPsdUrl(e.target.value)} placeholder="z.B. Google Drive PSD-Ordner..." style={inpS} />
                <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Separater Ordner für PSD-Dateien.</div>
              </div>
            </div>
            {/* DESIGNER NOTES */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.orange, marginBottom: 6, display: "block" }}>Allgemeine Hinweise für den Designer</label>
              <textarea value={designerNotes} onChange={e => { setDesignerNotes(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} placeholder="z.B. organisatorische Hinweise, Varianten-Info, Prioritäten, besondere Wünsche..." style={{ ...inpS, resize: "vertical", lineHeight: 1.6, minHeight: 60, overflow: "hidden" }} />
              <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Allgemeine Infos, die nicht zu einem bestimmten Bild gehören. Wird im Designer-Export oben angezeigt.</div>
            </div>
            <div style={{ ...gS, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.textMed, marginBottom: 4 }}>Dateinamen-Konvention:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(data?.images || []).map((_, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, color: V.violet, padding: "2px 8px", borderRadius: 6, background: `${V.violet}10`, fontFamily: "monospace" }}>{getImgFileName(data.images, i, curAsin)}</span>)}
                <span style={{ fontSize: 10, color: V.textDim, alignSelf: "center" }}>.jpg / .png, max 5 MB</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: V.textDim }}>Diese Links und Notizen werden im Designer-Export sichtbar.</div>
          </div>
        </GC>}
        {tab === "b" && <BildBriefing D={data} hlC={hlC} setHlC={setHlC} shC={shC} setShC={setShC} bulSel={bulSel} setBulSel={setBulSel} bdgSel={bdgSel} setBdgSel={setBdgSel} imgDisabled={imgDisabled} setImgDisabled={setImgDisabled} refImages={refImages} setRefImages={setRefImages} ecSel={ecSel} setEcSel={setEcSel} pushUndo={pushUndo} onEditText={(imgIdx, type, textIdx, newVal) => {
          pushUndo();
          setData(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            if (type === "concept") { next.images[imgIdx].concept = newVal; delete next.images[imgIdx].conceptEn; return next; }
            if (type === "visual") { next.images[imgIdx].visual = newVal; delete next.images[imgIdx].visualEn; return next; }
            if (type === "rationale") { next.images[imgIdx].rationale = newVal; delete next.images[imgIdx].rationaleEn; return next; }
            if (type === "eyecatcher") { if (next.images[imgIdx].eyecatchers?.[textIdx]) { const ec = next.images[imgIdx].eyecatchers[textIdx]; if (ec.copyText !== undefined) { ec.copyText = newVal; } else { ec.idea = newVal; } } return next; }
            if (type === "badge") { const te = next.images[imgIdx]?.texts; if (te?.badges?.[textIdx] !== undefined) te.badges[textIdx] = newVal; else if (te?.callouts?.[textIdx - (te.badges?.length || 0)] !== undefined) te.callouts[textIdx - (te.badges?.length || 0)] = newVal; return next; }
            if (type === "reorder_bullets") { const te = next.images[imgIdx]?.texts; if (te?.bullets) { const [from, to] = [textIdx, newVal]; const b = [...te.bullets]; const [moved] = b.splice(from, 1); b.splice(to, 0, moved); te.bullets = b; } return next; }
            if (type === "add_bullet") { const te = next.images[imgIdx]?.texts; if (te) { if (!te.bullets) te.bullets = []; const fmt = newVal || "bullet"; te.bullets.push(fmt === "bullet" ? "" : { text: "", format: fmt }); } return next; }
            if (type === "delete_bullet") { const te = next.images[imgIdx]?.texts; if (te?.bullets) { te.bullets.splice(textIdx, 1); } return next; }
            const te = next.images[imgIdx]?.texts;
            if (!te) return prev;
            if (type === "hl") {
              if (te.headlines) te.headlines[textIdx] = newVal;
              else te.headline = newVal;
            } else if (type === "sub") {
              if (te.subheadlines) te.subheadlines[textIdx] = newVal;
              else te.subheadline = newVal;
            } else if (type === "bul") {
              if (te.bullets) {
                const old = te.bullets[textIdx];
                // Preserve format if bullet is an object
                if (typeof old === "object" && old !== null) {
                  te.bullets[textIdx] = { ...old, text: newVal };
                } else {
                  te.bullets[textIdx] = newVal;
                }
              }
            }
            return next;
          });
        }} />}
        {/* Feedback indicator — simple info when feedback exists, no unreliable keyword matching */}
        {tab === "b" && feedback.length > 0 && <div style={{ padding: "10px 16px", background: `${V.orange}08`, border: `1.5px solid ${V.orange}25`, borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: V.orange, fontWeight: 700 }}>{feedback.length} Kunden-Feedback-{feedback.length === 1 ? "Eintrag" : "Einträge"} vorhanden</span>
          <button onClick={() => setTab("f")} style={{ fontSize: 10, fontWeight: 700, color: V.orange, cursor: "pointer", fontFamily: FN, background: `${V.orange}12`, border: `1px solid ${V.orange}30`, borderRadius: 6, padding: "4px 10px" }}>Zum Feedback</button>
        </div>}
        {tab === "r" && <ReviewsTab D={data} />}
        {tab === "a" && <AnalyseTab D={data} lqs={calcLQS(productData)} />}
        {tab === "f" && <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Refine progress overlay */}
          {feedbackRefining && <GC style={{ border: `2px solid ${V.violet}40`, overflow: "hidden" }}>
            <div style={{ padding: "20px 22px", background: `linear-gradient(135deg, ${V.violet}08, ${V.blue}08)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, border: `3px solid ${V.violet}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: V.violet }}>Briefing wird verfeinert</div>
                  <div style={{ fontSize: 12, color: V.text, marginTop: 2 }}>{feedbackRefineStatus || "KI analysiert das Feedback..."}</div>
                </div>
              </div>
              <div style={{ marginTop: 14, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${V.violet}, ${V.blue})`, animation: "spin 2s ease-in-out infinite", width: "60%", transformOrigin: "left" }} />
              </div>
            </div>
          </GC>}
          {/* Changes summary — after refinement */}
          {feedbackChanges && !feedbackRefining && <GC style={{ border: `2px solid ${V.emerald}40` }}>
            <div style={{ padding: "16px 22px", background: `${V.emerald}06`, borderBottom: `1px solid ${V.emerald}20` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: V.emerald }}>Briefing erfolgreich aktualisiert</div>
                <button onClick={() => setFeedbackChanges(null)} style={{ background: "none", border: "none", color: V.textDim, fontSize: 14, cursor: "pointer" }}>×</button>
              </div>
              {feedbackChanges.summary && <div style={{ fontSize: 12, color: V.text, lineHeight: 1.6, marginTop: 8 }}>{feedbackChanges.summary}</div>}
            </div>
            {feedbackChanges.changedImages?.length > 0 && <div style={{ padding: "14px 22px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 8 }}>Geänderte Bilder:</div>
              {feedbackChanges.changedImages.map((ci, i) => <div key={i} style={{ ...gS, padding: "10px 14px", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: V.violet, marginBottom: 4 }}>{ci.label}</div>
                {ci.changes.map((c, j) => <div key={j} style={{ fontSize: 11, color: V.text, lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${V.emerald}40`, marginBottom: 3 }}>{c}</div>)}
              </div>)}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => { setFeedbackChanges(null); setTab("b"); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Zum Bild-Briefing</button>
                <button onClick={() => { if (canUndo) doUndo(); setFeedbackChanges(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${V.rose}30`, background: `${V.rose}08`, color: V.rose, fontSize: 11, fontWeight: 700, cursor: canUndo ? "pointer" : "not-allowed", fontFamily: FN, opacity: canUndo ? 1 : 0.4 }}>Änderungen rückgängig</button>
              </div>
            </div>}
          </GC>}
          {/* Feedback input card */}
          {!feedbackRefining && <GC>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: V.ink }}>Kunden-Feedback</div>
              <div style={{ fontSize: 12, color: V.textDim, marginTop: 2 }}>Feedback als Text und/oder Bilder eingeben. Claude analysiert alles und überarbeitet das Briefing — Konzepte, Texte, Designer-Anweisungen.</div>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <textarea value={feedbackText} onChange={e => { setFeedbackText(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} ref={el => { if (el && el.value) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} placeholder={"Feedback des Kunden hier eingeben...\n\nBeispiele:\n• \"Bitte mehr Fokus auf Nachhaltigkeit und Bio-Aspekte\"\n• \"Schriftart: Montserrat, Farben: #1A3B5C und #F5A623\"\n• \"Das Hauptbild gefällt uns gut, aber die Infografik-Bilder sollen familienfreundlicher wirken\"\n• \"Wir haben 5 Varianten, starten aber erst mit Schwarz\""} style={{ ...inpS, resize: "none", lineHeight: 1.6, minHeight: 100, overflow: "hidden" }} />
              {/* Image upload for feedback */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6 }}>Bilder zum Feedback (optional)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {feedbackImages.map((src, i) => <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => setFeedbackImages(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: 1, right: 1, width: 16, height: 16, borderRadius: 99, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>)}
                  <label style={{ width: 64, height: 64, borderRadius: 8, border: `2px dashed ${V.blue}30`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: V.blue, fontSize: 22 }}>+<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { Array.from(e.target.files || []).forEach(f => { const r = new FileReader(); r.onload = ev => setFeedbackImages(p => [...p, ev.target.result]); r.readAsDataURL(f); }); e.target.value = ""; }} /></label>
                </div>
              </div>
              {feedbackRefineError && <div style={{ padding: "10px 14px", borderRadius: 10, background: `${V.rose}10`, border: `1px solid ${V.rose}30`, fontSize: 12, color: V.rose, lineHeight: 1.5 }}>{feedbackRefineError}</div>}
              <button disabled={(!feedbackText.trim() && !feedbackImages.length)} onClick={async () => {
                if (!feedbackText.trim() && !feedbackImages.length) return;
                const item = { id: Date.now().toString(36), timestamp: new Date().toISOString(), text: feedbackText.trim(), images: [...feedbackImages] };
                const newFeedback = [...feedback, item];
                setFeedback(newFeedback);
                setFeedbackText(""); setFeedbackImages([]);
                setFeedbackRefining(true); setFeedbackRefineStatus("Sende an Claude..."); setFeedbackRefineError(null); setFeedbackChanges(null);
                const oldData = JSON.parse(JSON.stringify(data));
                try {
                  const briefingJson = JSON.stringify(data, null, 2);
                  const feedbackSummary = newFeedback.map((fb, i) => `Feedback ${i + 1} (${new Date(fb.timestamp).toLocaleDateString("de-DE")}):\n${fb.text}${fb.images.length ? ` [+ ${fb.images.length} Bild(er) angehängt — bitte analysiere diese]` : ""}`).join("\n\n");
                  const imgContent = [];
                  for (const fb of newFeedback) {
                    for (const src of fb.images) {
                      const mt = src.startsWith("data:image/png") ? "image/png" : src.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
                      imgContent.push({ type: "image", source: { type: "base64", media_type: mt, data: src.split(",")[1] } });
                    }
                  }
                  const systemPrompt = `Du bist ein erfahrener Amazon-Listing-Stratege. Deine Aufgabe: Ein bestehendes Briefing anhand von Kundenfeedback überarbeiten.

REGELN:
1. Gib NUR valides JSON zurück — kein Markdown, keine Erklärungen, kein Text davor oder danach
2. Behalte die EXAKTE JSON-Struktur bei (gleiche Felder, gleiche Hierarchie)
3. Alle Feedback-Punkte des Kunden MÜSSEN im überarbeiteten Briefing berücksichtigt sein
4. Wenn der Kunde Schriftarten, Farben oder allgemeine Vorgaben nennt: Integriere diese in die "visual"-Felder der relevanten Bilder
5. Wenn der Kunde allgemeines Feedback gibt (z.B. Tonalität, Zielgruppe): Passe concept, rationale UND Texte entsprechend an
6. Aktualisiere BEIDE Sprachversionen: concept+conceptEn, rationale+rationaleEn, visual+visualEn
7. Texte (headlines, subheadlines, bullets) nur auf Deutsch — EN-Versionen nur für concept/rationale/visual
8. Am Ende des JSON-Objekts füge ein Feld "_feedbackChanges" hinzu mit: { "summary": "Kurze Zusammenfassung der Änderungen", "changedImages": [{"idx": 0, "changes": ["Konzept angepasst: ...", "Headline geändert: ..."]}] }`;
                  const messages = [{ role: "user", content: [
                    { type: "text", text: `BESTEHENDES BRIEFING:\n${briefingJson}\n\nKUNDEN-FEEDBACK:\n${feedbackSummary}\n\nBitte überarbeite das Briefing. Antworte NUR mit dem aktualisierten JSON.` },
                    ...imgContent
                  ] }];
                  setFeedbackRefineStatus("Claude analysiert das Feedback...");
                  const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16000, stream: true, system: systemPrompt, messages }) });
                  if (!r.ok) {
                    const errMsgs = { 400: "Ungültige Anfrage", 401: "API-Key nicht konfiguriert", 429: "Rate-Limit — bitte 30s warten", 500: "Serverfehler", 503: "KI-Service überlastet — bitte 1-2 Min warten" };
                    let detail = ""; try { const e = await r.json(); detail = e.error?.message || ""; } catch {}
                    throw new Error(`${errMsgs[r.status] || `Fehler ${r.status}`}${detail ? `: ${detail}` : ""}`);
                  }
                  setFeedbackRefineStatus("Claude schreibt das überarbeitete Briefing...");
                  // Stream SSE
                  const reader = r.body.getReader();
                  const decoder = new TextDecoder();
                  let sseBuffer = "", contentBlocks = [], stopReason = null;
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    sseBuffer += decoder.decode(value, { stream: true });
                    const lines = sseBuffer.split("\n");
                    sseBuffer = lines.pop() || "";
                    for (const line of lines) {
                      if (!line.startsWith("data: ")) continue;
                      const raw = line.slice(6).trim();
                      if (raw === "[DONE]") continue;
                      let evt; try { evt = JSON.parse(raw); } catch { continue; }
                      if (evt.type === "content_block_start") contentBlocks.push({ type: evt.content_block?.type || "text", text: "" });
                      else if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                        const idx = contentBlocks.length - 1;
                        if (idx >= 0) contentBlocks[idx].text += evt.delta.text;
                        // Live progress based on content length
                        const total = contentBlocks.reduce((s, b) => s + b.text.length, 0);
                        if (total > 5000) setFeedbackRefineStatus("Finalisiert Briefing-Texte...");
                        else if (total > 2000) setFeedbackRefineStatus("Überarbeitet Bildkonzepte...");
                        else if (total > 500) setFeedbackRefineStatus("Analysiert Feedback-Punkte...");
                      } else if (evt.type === "message_delta" && evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
                      else if (evt.type === "error") throw new Error(evt.error?.message || "Stream-Fehler");
                    }
                  }
                  if (stopReason === "max_tokens") throw new Error("Antwort abgeschnitten — Briefing zu groß. Bitte erneut versuchen.");
                  const textBlocks = contentBlocks.filter(b => b.type === "text" && b.text).map(b => b.text);
                  if (!textBlocks.length) throw new Error("Keine Antwort erhalten.");
                  setFeedbackRefineStatus("Verarbeitet Ergebnis...");
                  let p = null;
                  const full = textBlocks.join("").replace(/```json\s*|```\s*/g, "").trim();
                  try { p = JSON.parse(full); } catch {}
                  if (!p) { const m = full.match(/\{[\s\S]*\}/); if (m) try { p = JSON.parse(m[0]); } catch {} }
                  if (!p) throw new Error("KI-Antwort konnte nicht als JSON geparst werden. Bitte erneut versuchen.");
                  if (!p.images || !p.product) throw new Error("Unvollständige Antwort — 'product' oder 'images' fehlt.");
                  // Extract _feedbackChanges before applying
                  const fc = p._feedbackChanges; delete p._feedbackChanges;
                  pushUndo(); setData(p);
                  // Build changes diff
                  const changes = { summary: fc?.summary || "Briefing wurde aktualisiert.", changedImages: [] };
                  const imgLabels = (imgs) => imgs.map((im, i) => { const isM = (im.id || "").toLowerCase().startsWith("main"); return isM ? "Main Image" : `PT.${String(i).padStart(2, "0")}`; });
                  const oldLabels = imgLabels(oldData.images || []);
                  (p.images || []).forEach((newImg, i) => {
                    const oldImg = oldData.images?.[i];
                    if (!oldImg) { changes.changedImages.push({ label: oldLabels[i] || `Bild ${i + 1}`, changes: ["Neues Bild hinzugefügt"] }); return; }
                    const diffs = [];
                    if (newImg.concept !== oldImg.concept) diffs.push("Bildkonzept angepasst");
                    if (newImg.rationale !== oldImg.rationale) diffs.push("Strategische Begründung angepasst");
                    if (newImg.visual !== oldImg.visual) diffs.push("Visuelle Hinweise angepasst");
                    const newHls = newImg.texts?.headlines || []; const oldHls = oldImg.texts?.headlines || [];
                    if (JSON.stringify(newHls) !== JSON.stringify(oldHls)) diffs.push("Headlines geändert");
                    const newSubs = newImg.texts?.subheadlines || []; const oldSubs = oldImg.texts?.subheadlines || [];
                    if (JSON.stringify(newSubs) !== JSON.stringify(oldSubs)) diffs.push("Subheadlines geändert");
                    const newBul = newImg.texts?.bullets || []; const oldBul = oldImg.texts?.bullets || [];
                    if (JSON.stringify(newBul) !== JSON.stringify(oldBul)) diffs.push("Textbausteine geändert");
                    if (diffs.length > 0) changes.changedImages.push({ label: fc?.changedImages?.find(c => c.idx === i)?.label || oldLabels[i] || `Bild ${i + 1}`, changes: fc?.changedImages?.find(c => c.idx === i)?.changes || diffs });
                  });
                  if (changes.changedImages.length === 0) changes.changedImages.push({ label: "Alle Bilder", changes: ["Keine strukturellen Änderungen erkannt — bitte im Bild-Briefing prüfen"] });
                  setFeedbackChanges(changes);
                } catch (err) {
                  setFeedbackRefineError(err.message || "Unbekannter Fehler.");
                } finally {
                  setFeedbackRefining(false); setFeedbackRefineStatus("");
                }
              }} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.orange}, ${V.rose})`, color: "#fff", fontSize: 13, fontWeight: 800, cursor: (!feedbackText.trim() && !feedbackImages.length) ? "not-allowed" : "pointer", fontFamily: FN, opacity: (!feedbackText.trim() && !feedbackImages.length) ? 0.5 : 1 }}>Feedback speichern & Briefing verfeinern</button>
            </div>
          </GC>}
          {/* Existing feedback history */}
          {feedback.length > 0 && !feedbackRefining && <GC>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: V.ink }}>Gespeichertes Feedback ({feedback.length})</div>
              <button onClick={() => setFeedback([])} style={{ fontSize: 10, color: V.rose, background: "none", border: "none", cursor: "pointer", fontFamily: FN, fontWeight: 700 }}>Alle löschen</button>
            </div>
            <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              {feedback.map((fb, i) => <div key={fb.id} style={{ ...gS, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: V.textDim, marginBottom: 4 }}>#{i + 1} · {new Date(fb.timestamp).toLocaleString("de-DE")}</div>
                    {fb.text && <div style={{ fontSize: 13, color: V.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{fb.text}</div>}
                    {fb.images.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{fb.images.map((src, j) => <img key={j} src={src} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />)}</div>}
                  </div>
                  <button onClick={() => setFeedback(prev => prev.filter(x => x.id !== fb.id))} style={{ background: "none", border: "none", color: V.textDim, fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>×</button>
                </div>
              </div>)}
            </div>
          </GC>}
        </div>}
      </div>
      {shareUrl && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={() => setShareUrl(null)}><GC style={{ maxWidth: 520, width: "100%", padding: 28, background: "rgba(255,255,255,0.92)", textAlign: "center" }} onClick={e => e.stopPropagation()}>{shareUrl?.startsWith("error") ? <><div style={{ fontSize: 18, fontWeight: 800, color: V.rose, marginBottom: 8 }}>Speichern fehlgeschlagen</div><p style={{ fontSize: 12, color: V.textMed, margin: "0 0 14px" }}>Das Briefing konnte nicht in der Datenbank gespeichert werden.</p>{shareUrl.length > 6 && <p style={{ fontSize: 10, color: V.textDim, margin: "0 0 14px", wordBreak: "break-all" }}>Detail: {shareUrl.slice(6)}</p>}</> : <><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing-Link</div><p style={{ fontSize: 12, color: V.textMed, margin: "0 0 14px" }}>Link wurde in die Zwischenablage kopiert.</p><input value={shareUrl} readOnly onClick={e => e.target.select()} style={{ ...inpS, fontSize: 11, textAlign: "center" }} /></>}<button onClick={() => setShareUrl(null)} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Schließen</button></GC></div>}
      {pending && <OverwriteWarn name={data.product?.name || "Produkt"} onOk={() => { const p = pending; setP(null); setData(null); setSN(false); go(p.a, p.m, p.p, p.f, p.ref, p.ic, p.h10, p.bs); }} onNo={() => setP(null)} />}
    </div>
  );
}
