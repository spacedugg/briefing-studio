import { useState, useRef, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";

const MAX_HL = 25, FN = "'Outfit', system-ui, sans-serif";
const V = { violet: "#7C3AED", blue: "#2563EB", cyan: "#0891B2", teal: "#0D9488", emerald: "#059669", orange: "#EA580C", rose: "#E11D48", amber: "#D97706", ink: "#0F172A", text: "#334155", textMed: "#64748B", textDim: "#94A3B8" };
const glass = { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 18, boxShadow: "0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7)" };
const gS = { ...glass, background: "rgba(255,255,255,0.4)", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)" };
const BG = "linear-gradient(170deg, #f0f0ff 0%, #fff8f0 30%, #f0faf5 60%, #f8f0ff 100%)";
const Orbs = () => <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}><div style={{ position: "absolute", top: -80, right: -80, width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${V.violet}12, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${V.cyan}10, transparent 70%)` }} /></div>;
const inpS = { width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.6)", fontFamily: FN, fontSize: 13, color: V.ink, outline: "none", boxSizing: "border-box" };

const HK = "briefing_history", MH = 5;
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
- Headlines: max 25 Zeichen, 3 Varianten. KEINE Gedankenstriche (—, –, -) in Headlines, Subheadlines, Bullets oder Badges. Verwende auch keine Satzkonstruktionen, die Gedankenstriche erfordern. Keine Kommas.
  1. "USP": Nenne das KONKRETE Alleinstellungsmerkmal direkt beim Namen (z.B. "Premium-Silikon" statt "Hochwertig kochen", "3-Schicht-Filter" statt "Saubere Luft"). Das wichtigste Produktmerkmal MUSS in der Headline stehen.
  2. "Kundenvorteil": Formuliere den konkreten Nutzen aus Kundensicht (z.B. "Nie wieder Verbrennungen" statt "Sicher kochen"). Was hat der Kunde davon?
  3. "Kreativ": Emotionale, aufmerksamkeitsstarke Variante. MUSS ein grammatisch vollständiger, natürlich klingender deutscher Ausdruck sein (z.B. "Kochen wie ein Profi", "Dein Küchen-Upgrade", "Endlich sorglos grillen"). KEINE einzelnen Adjektive oder abgehackten Wortfragmente. Jede kreative Headline MUSS im normalen Sprachgebrauch Sinn ergeben.
- HIERARCHIE: Die wichtigsten Produktaspekte (Material, Hauptfeature, Kernvorteil) MÜSSEN bereits in Headline/Subheadline stehen. Bullets vertiefen diese Aspekte, wiederholen sie aber nicht. Headline = Kernaussage, Subheadline = Erweiterung, Bullets = Details.
- Subheadlines: 3 Varianten (kurz/erklärend/emotional). Dürfen auch leer bleiben falls nicht nötig. KEINE Gedankenstriche.
- Bullets: So viele wie inhaltlich sinnvoll (2-6), NICHT immer gleich viele pro Bild. Orientiere dich am Bildinhalt. Schlüsselwörter mit **fett** markieren. Jeder Bullet max 1-2 Fettungen. KEINE Gedankenstriche. Achte auf korrekte deutsche Grammatik.
- Badge: Max 1 Badge pro Bild. Nur wenn es einen wirklich herausragenden Fakt gibt (z.B. "Inkl. Videoanleitung", "Nur 1g Zucker", "TÜV-geprüft"). Nicht jedes Bild braucht ein Badge! badges ist ein Array mit 0 oder 1 Einträgen. Badge = auffälligstes Eyecatcher-Element, nur für besonders wichtige/coole/persönliche Fakten. KEINE Gedankenstriche.
- Bildtexte DE, Concept/Rationale/Visual EN. Keywords integrieren.
- Lifestyle ohne Text-Overlay: concept+visual DETAILLIERT (Szenerie, Personen, Stimmung, Kamera).
- Fussnoten mit * im referenzierten Text kennzeichnen (z.B. "Laborgetestet*") und Fussnote beginnt mit "* ...".
- Reviews: relative %, absteigend, deutlich unterschiedlich (nicht alle 30-35%).
- Blacklist: vulgaer, negative Laendernennung, Wettbewerber-Vergleiche, unbelegte Statistiken.
- Siegel: nur beantragungspflichtige. Kaufausloeser absteigend. Keywords: used true/false.
- NUTZER-ANWEISUNGEN: Falls der Nutzer in der Produktbeschreibung oder den Hinweisen Vorgaben macht, MÜSSEN diese beachtet werden. Das können sein: konkrete Bild-Zuordnungen ("Bild 1 soll X zeigen"), grobe thematische Ideen ("irgendwas mit Nachhaltigkeit auf einem Bild"), gewünschte Aspekte die vorkommen sollen ("Bitte die Verpackung hervorheben"), Image-Ideen die aufgegriffen und professionell ausformuliert werden sollen, oder generelle Hinweise zu Stil/Tonalität. Konkrete Vorgaben exakt übernehmen, vage Anregungen professionell interpretieren und ins Briefing einarbeiten.
- KEYWORDS: Recherchiere echte Amazon-Suchbegriffe, die Kunden tatsächlich in die Amazon-Suche eingeben würden, um dieses spezifische Produkt zu finden. Volume-Keywords = Hauptsuchbegriffe mit hohem Suchvolumen (z.B. "Nudelsieb", "Sieb Küche", "Abtropfsieb"). Purchase-Keywords = Kaufentscheidende Suchbegriffe, die auf konkrete Kaufabsicht hindeuten (z.B. "Nudelsieb Silikon", "Nudelsieb faltbar"). KEINE generischen Adjektive wie "BPA-frei" oder "hitzebeständig" als alleinstehende Keywords verwenden.

BILDER: ${numImages === 7 ? "Main(kein Text, 3 Eyecatcher mit risk:low/medium), PT01(STAERKSTER Kauftrigger), PT02(Differenzierung), PT03(Lifestyle/emotional), PT04-06(Einwandbehandlung neg. Reviews)." : `Erstelle EXAKT ${numImages} Bilder. Main Image (kein Text, 3 Eyecatcher). Die weiteren ${numImages - 1} Bilder decken die wichtigsten USPs, Features und Kauftrigger ab. ALLE relevanten Produktinformationen auf ${numImages} Bilder verteilen, nichts weglassen.`}
Jedes Bild MUSS ein "theme" Feld haben: Kurze Beschreibung des Bildthemas (2-4 Wörter, DE), z.B. "Materialqualität", "Lifestyle Küche", "Größenvergleich".

NUR JSON, keine Backticks/Markdown:
{product:{name,brand,sku,marketplace,category,price,position}, audience:{persona,desire,fear,triggers:[absteigend],balance}, listingWeaknesses:${hasA ? "[{weakness,impact:high/medium/low,briefingAction}]" : "null"}, reviews:{source,estimated:true, positive:[{theme,pct}], negative:[{theme,pct,quotes:[],status:solved/unclear/neutral,implication}]}, keywords:{volume:[{kw,used:bool}],purchase:[{kw,used:bool}],badges:[{kw,note,requiresApplication:bool}]}, competitive:{patterns,gaps:[]}, images:[${numImages} Objekte mit id:main${numImages > 1 ? "/pt01" : ""}${numImages > 2 ? `-pt0${Math.min(numImages - 1, 6)}` : ""}, label, theme(DE kurz 2-4 Wörter), role, concept(EN), rationale(EN), visual(EN), texts:{headlines:[3],subheadlines:[3 Varianten oder leeres Array],bullets:["variabel viele, **fett** markiert"],badges:["max 1 oder leer"],footnotes:["* Fussnotentext"]}|null, eyecatchers(nur main):[{idea(DE),risk}]]}`;
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
    const imgBlocks = refData.images.slice(0, 7).map((img, i) => {
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
        system: "Amazon Listing Analyst. Antworte NUR mit validem JSON. Kein Markdown/Codeblocks/Text. Antwort beginnt mit { und endet mit }.",
        messages: [{ role: "user", content: userContent }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
  } catch { throw new Error("Netzwerkfehler: API nicht erreichbar."); }
  if (!r.ok) {
    let m = "API-Fehler " + r.status;
    try { const e = await r.json(); m = e.error?.message || m; } catch {}
    throw new Error(m);
  }
  onS("Analysiere Ergebnisse...");
  const d = await r.json();
  if (d.stop_reason === "max_tokens") throw new Error("Antwort wurde abgeschnitten (Token-Limit). Bitte versuche es erneut.");
  const textBlocks = (d.content || []).filter(i => i.type === "text").map(i => i.text).filter(Boolean);
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

// Scrape Amazon product data + images
async function scrapeProduct(asin, marketplace) {
  if (!asin || !asin.trim()) return { images: [], productData: {} };
  try {
    const r = await fetch("/api/fetch-images", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asin: asin.trim(), marketplace }),
    });
    if (!r.ok) return { images: [], productData: {} };
    const d = await r.json();
    return { images: d.images || [], productData: d.productData || {} };
  } catch { return { images: [], productData: {} }; }
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
const AsinNotFoundErr = ({ onReset }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }}><div style={{ ...glass, maxWidth: 440, width: "100%", padding: "36px 32px", background: "rgba(255,255,255,0.92)", textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 99, background: `${V.rose}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><span style={{ fontSize: 28, color: V.rose }}>!</span></div><div style={{ fontSize: 20, fontWeight: 800, color: V.rose, marginBottom: 8 }}>ASIN nicht gefunden</div><p style={{ fontSize: 14, color: V.text, lineHeight: 1.7, margin: "0 0 24px" }}>Das Produkt konnte auf Amazon nicht gefunden werden. Bitte überprüfe die ASIN und versuche es erneut.</p><button onClick={onReset} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 20px ${V.violet}35` }}>Neues Briefing starten</button></div></div>;

// ═══════ TIME TRACKER (persistent per ASIN, restores on reload, time only increases) ═══════
function TimeTracker({ productName, brand, asin, marketplace }) {
  const lsKey = asin ? `tt_${asin.toUpperCase()}` : null;
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
    if (!asin) { setRestored(true); return; }
    fetch("/api/timesheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", asin }) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.seconds > 0 && d.seconds > secsRef.current) setSecs(d.seconds);
        setRestored(true);
      })
      .catch(() => setRestored(true));
  }, [asin]);
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
  const syncToSheet = useCallback(async (s) => {
    if (!asin) return;
    try {
      const r = await fetch("/api/timesheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", productName, brand, asin, marketplace, seconds: s }),
      });
      if (r.ok) {
        const d = await r.json();
        // Server may return higher seconds (time only increases)
        if (d.seconds > secsRef.current) setSecs(d.seconds);
        setSynced(true); setSyncErr(false);
      } else { setSyncErr(true); }
    } catch { setSyncErr(true); }
  }, [productName, brand, asin, marketplace]);
  useEffect(() => {
    if (syncRef.current) clearInterval(syncRef.current);
    if (running) { syncRef.current = setInterval(() => syncToSheet(secsRef.current), 10000); }
    return () => clearInterval(syncRef.current);
  }, [running, syncToSheet]);
  const handleToggle = () => {
    if (running && secs > 0) syncToSheet(secs);
    setRunning(r => !r);
  };
  const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}` : `${m}:${ss.toString().padStart(2, "0")}`; };
  return <div style={{ ...glass, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
    <div><div style={{ fontSize: 10, fontWeight: 800, color: V.teal, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 2 }}>Time Tracking</div><div style={{ fontSize: 11, color: V.textDim }}>{productName || "Briefing"}{synced && !syncErr ? <span style={{ fontSize: 9, color: V.emerald, marginLeft: 8 }}>synced</span> : ""}{syncErr ? <span style={{ fontSize: 9, color: V.rose, marginLeft: 8 }}>sync failed</span> : ""}{restored && secs > 0 && !running && !synced ? <span style={{ fontSize: 9, color: V.blue, marginLeft: 8 }}>restored</span> : ""}</div></div>
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
  const [hist] = useState(loadH);
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
      setRefImages(res.images || []);
      setRefData(res.productData || null);
    } catch { setRefImages([]); setRefData(null); }
    setRefLoading(false);
  };
  const handleManualUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const results = [];
    files.slice(0, 7).forEach(f => {
      const r = new FileReader();
      r.onload = ev => {
        results.push({ base64: ev.target.result });
        if (results.length === Math.min(files.length, 7)) {
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
              {error && error !== "ASIN_NOT_FOUND" && <Err msg={error} onX={onDismiss} />}
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
          {hist.length > 0 && <GC style={{ padding: 0 }}><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl></div><div style={{ padding: "8px 12px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", borderRadius: 10, cursor: "pointer" }} onClick={() => onLoad(h.data, h.asin)} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC>}
        </div>
      </div>
      {error === "ASIN_NOT_FOUND" && <AsinNotFoundErr onReset={onDismiss} />}
    </div>
  );
}

function OverwriteWarn({ name, onOk, onNo }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onNo}><GC style={{ maxWidth: 440, width: "100%", padding: 28, background: "rgba(255,255,255,0.9)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing überschreiben?</div><p style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6, margin: "0 0 6px" }}>Das Briefing für <b>{name}</b> wird ersetzt.</p><p style={{ fontSize: 12, color: V.textDim, margin: "0 0 20px" }}>Die letzten {MH} Briefings bleiben abrufbar.</p><div style={{ display: "flex", gap: 8, justifyContent: "center" }}><button onClick={onNo} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textMed, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Abbrechen</button><button onClick={onOk} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.rose}, ${V.orange})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Überschreiben</button></div></GC></div>;
}

// ═══════ BILD-BRIEFING ═══════
function BildBriefing({ D, hlC, setHlC, shC, setShC, bulSel, setBulSel, bdgSel, setBdgSel, onEditText }) {
  const [sel, setSel] = useState(0);
  const [editField, setEditField] = useState(null); // { type: 'hl'|'sub'|'bul', idx: number }
  const [editVal, setEditVal] = useState("");
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
  const allBadges = [...(te?.badges || []), ...(te?.callouts || [])];
  const badgeOn = bdgSel[img.id] !== false;
  const allTxt = te ? [curHl, curSh, ...selectedBullets, ...(badgeOn ? allBadges : [])].filter(Boolean).join("\n") : "";
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{D.images.map((im, i) => {
        const h = im.texts?.headlines || (im.texts?.headline ? [im.texts.headline] : []);
        const ov = h.some(x => x.length > MAX_HL);
        const tabLabel = getImgLabel(D.images, i);
        const theme = im.theme || "";
        return <button key={i} onClick={() => setSel(i)} style={{ ...gS, padding: "8px 14px", background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(255,255,255,0.5)", color: sel === i ? "#fff" : ov ? V.rose : V.textDim, border: ov && sel !== i ? `1.5px solid ${V.rose}50` : sel === i ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}><span style={{ fontSize: 11, fontWeight: 800 }}>{tabLabel}</span>{theme && <span style={{ fontSize: 9, fontWeight: 500, opacity: sel === i ? 0.85 : 0.7, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{theme}</span>}{ov && <span style={{ fontSize: 8, color: sel === i ? "#fff" : V.rose }}>!</span>}</button>;
      })}</div>
      <GC>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{getImgLabel(D.images, sel)}</span><span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span></div>
          {te && <CopyBtn text={allTxt} label="Alle Texte" />}
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {img.concept && <div><Lbl c={V.blue}>Bildkonzept</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.concept}</p></div>}
          {img.rationale && <div style={{ background: `${V.violet}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.violet}12` }}><Lbl c={V.violet}>Strategische Begründung</Lbl><p style={{ fontSize: 12.5, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.rationale}</p></div>}
          {img.visual && <div style={{ background: `${V.cyan}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.cyan}12` }}><Lbl c={V.cyan}>Visuelle Hinweise für Designer</Lbl><p style={{ fontSize: 12.5, color: V.text, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visual}</p></div>}

          {img.eyecatchers?.length > 0 && <div><Lbl c={V.amber}>Eyecatcher-Vorschläge</Lbl>{img.eyecatchers.map((ec, i) => <div key={i} style={{ ...gS, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", gap: 10 }}><span style={{ color: V.amber, fontWeight: 800 }}>{i + 1}.</span><span style={{ fontSize: 12.5, color: V.text, lineHeight: 1.5 }}>{ec.idea}</span></div><Pill c={ec.risk === "low" ? V.emerald : V.amber}>{ec.risk === "low" ? "Geringes Risiko" : "Graubereich"}</Pill></div>)}</div>}

          {te && hls.length > 0 ? <div><Lbl c={V.orange}>Bildtexte (Deutsch)</Lbl>
            {/* HEADLINES */}
            <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.orange}>HEADLINE-VARIANTEN</Pill><CopyBtn text={curHl} /></div>
              {hls.map((h, i) => { const ov = h.length > MAX_HL, act = ci === i; const labels = ["USP", "Kundenvorteil", "Kreativ"]; const labelColors = [V.orange, V.emerald, V.violet]; return <div key={i} onClick={() => setHlC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.violet}` : `1px solid ${ov ? V.rose + "40" : "rgba(0,0,0,0.06)"}`, background: act ? `${V.violet}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.violet}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.violet }} />}</div>{isEditing("hl", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 15, fontWeight: 800, padding: "4px 8px", flex: 1 }} /> : <span onDoubleClick={e => { e.stopPropagation(); startEdit("hl", i, h); }} style={{ fontSize: 15, fontWeight: 800, color: V.ink }} title="Doppelklick zum Bearbeiten">{h}</span>}</div><div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}><span style={{ fontSize: 9, color: labelColors[i] || V.textDim, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${labelColors[i] || V.textDim}12` }}>{labels[i] || ""}</span><span style={{ fontSize: 10, fontWeight: 700, color: ov ? V.rose : V.textDim }}>{h.length}/{MAX_HL}</span></div></div>; })}
            </div>
            {/* SUBHEADLINES */}
            {subs.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.blue}>SUBHEADLINE-VARIANTEN</Pill><CopyBtn text={curSh} /></div>
              {subs.map((s, i) => { const act = si === i || (si === undefined && i === 0); return <div key={i} onClick={() => setShC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: act ? `${V.blue}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div>{isEditing("sub", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 13, fontWeight: 600, padding: "4px 8px", flex: 1 }} /> : <span onDoubleClick={e => { e.stopPropagation(); startEdit("sub", i, s); }} style={{ fontSize: 13, fontWeight: 600, color: V.ink }} title="Doppelklick zum Bearbeiten">{s}</span>}</div></div>; })}
              <div onClick={() => setShC(p => ({ ...p, [img.id]: -1 }))} style={{ padding: "10px 14px", borderRadius: 10, border: si === -1 ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: si === -1 ? `${V.blue}08` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: si === -1 ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{si === -1 && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div><span style={{ fontSize: 13, fontWeight: 600, color: V.textDim, fontStyle: "italic" }}>Keine Subheadline</span></div>
            </div>}
            {/* Legacy single subheadline fallback */}
            {subs.length === 0 && te.subheadline && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><Pill c={V.blue}>SUBHEADLINE</Pill><CopyBtn text={te.subheadline} /></div><div style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6 }}>{te.subheadline}</div></div>}
            {/* BULLETS */}
            {bullets.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill c={V.teal}>BULLETS · {selectedBullets.length}/{bullets.length}</Pill><CopyBtn text={selectedBullets.join("\n")} /></div>{bullets.map((b, i) => { const on = bSel[i] !== false; return <div key={i} onClick={() => { const next = [...(bulSel[bKey] || bullets.map(() => true))]; next[i] = !on; setBulSel(p => ({ ...p, [bKey]: next })); }} style={{ display: "flex", gap: 10, marginTop: 10, padding: "8px 10px", borderRadius: 8, border: on ? `1.5px solid ${V.teal}30` : "1.5px solid rgba(0,0,0,0.04)", background: on ? `${V.teal}06` : "transparent", cursor: "pointer", opacity: on ? 1 : 0.45, transition: "all 0.15s" }}><div style={{ width: 18, height: 18, borderRadius: 4, border: on ? `2px solid ${V.teal}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{on && <span style={{ color: V.teal, fontSize: 12, fontWeight: 800 }}>✓</span>}</div>{isEditing("bul", i) ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} onClick={e => e.stopPropagation()} style={{ ...inpS, fontSize: 12.5, padding: "4px 8px", flex: 1 }} /> : <span onDoubleClick={e => { e.stopPropagation(); startEdit("bul", i, b.replace(/\*\*(.+?)\*\*/g, "$1")); }} style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.+?)\*\*/g, '<b style="color:#0F172A">$1</b>') }} title="Doppelklick zum Bearbeiten" />}</div>; })}</div>}
            {/* BADGE (max 1, selectable) */}
            {allBadges.length > 0 && <div onClick={() => setBdgSel(p => ({ ...p, [img.id]: !badgeOn }))} style={{ ...gS, padding: 14, marginBottom: 10, cursor: "pointer", border: badgeOn ? `1.5px solid ${V.amber}40` : "1.5px solid rgba(0,0,0,0.04)", opacity: badgeOn ? 1 : 0.45, transition: "all 0.15s" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill c={V.amber}>BADGE</Pill><div style={{ width: 18, height: 18, borderRadius: 4, border: badgeOn ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{badgeOn && <span style={{ color: V.amber, fontSize: 12, fontWeight: 800 }}>✓</span>}</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{allBadges.map((b, i) => <span key={i} style={{ padding: "5px 12px", borderRadius: 8, background: `${V.amber}12`, border: `1px solid ${V.amber}20`, fontSize: 12, fontWeight: 800, color: V.amber }}>{b}</span>)}</div></div>}
            {/* FOOTNOTES */}
            {te.footnotes?.length > 0 && <div style={{ ...gS, padding: 12, background: `${V.textDim}08`, marginBottom: 10 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>Fußnoten</span>{te.footnotes.map((f, i) => <div key={i} style={{ fontSize: 11, color: V.textDim, marginTop: 4, lineHeight: 1.5 }}>{f}</div>)}</div>}
          </div> : !te && <div style={{ padding: 16, ...gS, borderStyle: "dashed", textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Kein Text-Overlay. Rein visuelles Bild.</span></div>}

        </div>
      </GC>
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
  const avgBulletLen = pd.bullets?.length > 0 ? pd.bullets.reduce((a, b) => a + b.length, 0) / pd.bullets.length : 0;
  const checks = [
    { label: "Titel vorhanden", ok: !!pd.title, weight: 1 },
    { label: "Titel 150–200 Zeichen", ok: titleLen >= 150 && titleLen <= 200, weight: 1.5 },
    { label: "5 Bullet Points", ok: (pd.bullets?.length || 0) >= 5, weight: 1.5 },
    { label: "Bullets 150–200 Zeichen avg.", ok: avgBulletLen >= 150 && avgBulletLen <= 200, weight: 1.5 },
    { label: "Beschreibung vorhanden", ok: !!pd.description && pd.description.length > 50, weight: 1 },
    { label: "Marke angegeben", ok: !!pd.brand, weight: 0.5 },
    { label: "Rating >= 4.0", ok: parseFloat(pd.rating || 0) >= 4.0, weight: 1 },
    { label: "7+ Bilder", ok: (pd.imageCount || 0) >= 7, weight: 1.5 },
    { label: "Inkl. Video", ok: !!pd.hasVideo, weight: 0.5 },
    { label: "20+ Bewertungen", ok: parseInt(pd.reviewCount || 0) >= 20, weight: 1 },
  ];
  const maxW = checks.reduce((a, c) => a + c.weight, 0);
  const score = checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0);
  return { score: Math.round((score / maxW) * 10 * 10) / 10, max: 10, checks, pct: Math.round((score / maxW) * 100) };
}

function LQSCard({ lqs }) {
  if (!lqs) return null;
  const color = lqs.score >= 7 ? V.emerald : lqs.score >= 4 ? V.amber : V.rose;
  return <GC style={{ padding: 20, gridColumn: "1 / -1" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <Lbl c={color}>Listing Quality Score</Lbl>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={{ fontSize: 28, fontWeight: 900, color }}>{lqs.score}</span><span style={{ fontSize: 12, color: V.textDim, fontWeight: 700 }}>/ {lqs.max}</span></div>
    </div>
    <div style={{ height: 8, background: "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}><div style={{ width: `${lqs.pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}BB)`, borderRadius: 99 }} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{lqs.checks.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}><span style={{ color: c.ok ? V.emerald : V.rose, fontSize: 11, fontWeight: 800 }}>{c.ok ? "✓" : "✗"}</span><span style={{ fontSize: 11, color: c.ok ? V.text : V.textDim }}>{c.label}</span></div>)}</div>
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
function genBrief(D, hlC, shC, bulSel, bdgSel) {
  let t = `AMAZON GALLERY IMAGE BRIEFING\n${"=".repeat(50)}\nProduct: ${D.product?.name} | ${D.product?.brand}\nMarketplace: ${D.product?.marketplace}\n\n`;
  (D.images || []).forEach((im, idx) => {
    const expLabel = getImgLabel(D.images, idx) + (im.theme ? " | " + im.theme : "") + " (" + (im.role || im.label) + ")";
    t += `${"-".repeat(50)}\n${expLabel}\n${"-".repeat(50)}\nCONCEPT:\n${im.concept}\n\nRATIONALE:\n${im.rationale}\n`;
    if (im.eyecatchers?.length) t += `\nEYECATCHER IDEAS:\n${im.eyecatchers.map((e, i) => `  ${i + 1}. ${e.idea} [${e.risk}]`).join("\n")}\n`;
    if (im.texts) {
      const h = im.texts.headlines || (im.texts.headline ? [im.texts.headline] : []);
      const ci = hlC[im.id] ?? 0;
      const subs = Array.isArray(im.texts.subheadlines) ? im.texts.subheadlines : (im.texts.subheadline ? [im.texts.subheadline] : []);
      const si = shC?.[im.id] ?? 0;
      const bullets = im.texts.bullets || [];
      const bSel = bulSel?.[im.id] || bullets.map(() => true);
      const selBullets = bullets.filter((_, i) => bSel[i]);
      const allBadges = [...(im.texts.badges || []), ...(im.texts.callouts || [])];
      const bOn = bdgSel?.[im.id] !== false;
      const strip = s => s.replace(/\*\*(.+?)\*\*/g, "$1");
      t += "\nTEXTS (DE):\n";
      if (h.length) t += `  Headline: "${h[ci] || h[0]}"\n`;
      if (si !== -1 && subs.length > 0) { t += `  Subheadline: "${subs[si] || subs[0]}"\n`; }
      if (selBullets.length) t += `  Bullets:\n${selBullets.map(b => `    - "${strip(b)}"`).join("\n")}\n`;
      if (bOn && allBadges.length > 0) t += `  Badge: "${allBadges[0]}"\n`;
      if (im.texts.footnotes?.length) t += `  Footnotes: ${im.texts.footnotes.map(f => `"${f}"`).join(" | ")}\n`;
    } else { t += "\nTEXTS: None — visual-only image\n"; }
    t += `\nVISUAL NOTES:\n${im.visual}\n\n`;
  });
  return t;
}
// ═══════ FILE NAME COPY (click-to-copy for designer) ═══════
function FileNameCopy({ name }) {
  const [ok, set] = useState(false);
  return <span onClick={() => { navigator.clipboard.writeText(name); set(true); setTimeout(() => set(false), 1200); }} style={{ fontSize: 12, fontWeight: 700, color: ok ? V.emerald : V.violet, padding: "4px 10px", borderRadius: 6, background: ok ? `${V.emerald}15` : `${V.violet}10`, fontFamily: "monospace", cursor: "pointer", border: ok ? `1px solid ${V.emerald}30` : "1px solid transparent", transition: "all 0.15s", userSelect: "all" }}>{ok ? "Copied!" : name}</span>;
}
// ═══════ DESIGNER VIEW (standalone shareable page - final decisions only) ═══════
function DesignerView({ D: initialD, selections: initialSelections, briefingId, serverVersion }) {
  const [liveD, setLiveD] = useState(initialD);
  const [liveSelections, setLiveSelections] = useState(initialSelections);
  const D = liveD;
  const hlC = liveSelections?.hlC || {}, shC = liveSelections?.shC || {}, bulSel = liveSelections?.bulSel || {}, bdgSel = liveSelections?.bdgSel || {};
  const links = liveSelections?.links || {};
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
          // Build change description
          const parts = [];
          if (changes.size > 0) parts.push(`${changes.size} Bild${changes.size > 1 ? "er" : ""} aktualisiert`);
          if (selChanges.length > 0) parts.push("Textauswahl geändert");
          // Auto-apply new data
          if (newBriefing) setLiveD(newBriefing);
          if (newSelections) setLiveSelections(newSelections);
          versionRef.current = d.version;
          setChangedFields(changes);
          if (parts.length > 0) {
            setUpdateBanner(parts.join(", "));
            setTimeout(() => setUpdateBanner(null), 8000);
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
    if (changes.size > 0) { setChangedFields(changes); setUpdateBanner(`${changes.size} Bild${changes.size > 1 ? "er" : ""} seit letzter Version geändert`); }
  }, []);
  if (!D?.images?.length) return null;
  const strip = s => s.replace(/\*\*(.+?)\*\*/g, "$1");
  const asin = D.product?.sku || "";
  const ICopy = ({ text, children, style: s = {} }) => {
    const [ok, set] = useState(false);
    return <div onClick={() => { navigator.clipboard.writeText(strip(text)); set(true); setTimeout(() => set(false), 1200); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: ok ? `${V.emerald}12` : "transparent", border: ok ? `1px solid ${V.emerald}25` : "1px solid transparent", transition: "all 0.15s", ...s }} onMouseEnter={e => { if (!ok) e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }} onMouseLeave={e => { if (!ok) e.currentTarget.style.background = "transparent"; }}>{children}<span style={{ fontSize: 10, fontWeight: 700, color: ok ? V.emerald : V.textDim, opacity: ok ? 1 : 0, transition: "opacity 0.15s", flexShrink: 0 }}>{ok ? "Copied" : ""}</span></div>;
  };
  const getImageData = (img) => {
    const te = img?.texts;
    const hls = te?.headlines || (te?.headline ? [te.headline] : []);
    const ci = hlC[img.id] ?? 0;
    const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
    const si = shC[img.id] ?? 0;
    const bullets = te?.bullets || [];
    const bSel = bulSel[img.id] || bullets.map(() => true);
    const allBadges = [...(te?.badges || []), ...(te?.callouts || [])];
    return {
      headline: hls[ci] || hls[0] || "",
      subheadline: si === -1 ? "" : (subs[si] || subs[0] || te?.subheadline || ""),
      bullets: bullets.filter((_, i) => bSel[i]),
      badges: bdgSel[img.id] !== false ? allBadges : [],
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
        <TimeTracker productName={D.product?.name} brand={D.product?.brand} asin={D.product?.sku} marketplace={D.product?.marketplace} />
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 80px", position: "relative", zIndex: 1 }}>
        {/* Update banner — auto-applied, shows what changed */}
        {updateBanner && <div style={{ ...glass, padding: "14px 22px", marginBottom: 18, background: `${V.emerald}12`, border: `2px solid ${V.emerald}40`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: V.emerald, marginBottom: 2 }}>Briefing aktualisiert</div>
            <div style={{ fontSize: 12, color: V.text }}>{updateBanner}. Änderungen sind unten hervorgehoben.</div>
          </div>
          <button onClick={() => { setUpdateBanner(null); setChangedFields(new Set()); }} style={{ ...gS, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8, flexShrink: 0 }}>OK</button>
        </div>}
        {/* Header */}
        <div style={{ ...glass, padding: "18px 24px", marginBottom: 18 }}>
          <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Designer Briefing</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: V.ink }}>{D.product?.name}</div>
          <div style={{ fontSize: 13, color: V.textDim }}>{D.product?.brand} · {D.product?.marketplace}{asin ? ` · ${asin}` : ""}</div>
        </div>
        {/* Links section */}
        {(links.inputUrl || links.outputUrl) && <div style={{ ...glass, padding: "14px 22px", marginBottom: 18, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {links.inputUrl && <a href={links.inputUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${V.blue}, ${V.violet})`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FN }}>Assets / Source Files</a>}
          {links.outputUrl && <a href={links.outputUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${V.emerald}, ${V.teal})`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FN }}>Upload Results</a>}
        </div>}
        {/* File naming convention — click to copy */}
        <div style={{ ...gS, padding: "12px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: V.textMed, textTransform: "uppercase", letterSpacing: ".06em" }}>File naming:</span>
          {D.images.map((_, i) => <FileNameCopy key={i} name={imgName(i)} />)}
          <span style={{ fontSize: 11, color: V.textDim }}>.jpg / .png, max 5 MB each</span>
        </div>
        {/* All images listed sequentially */}
        {D.images.map((img, idx) => {
          const d = getImageData(img);
          const isMain = (img.id || "").toLowerCase().startsWith("main");
          const isChanged = changedFields.has(idx);
          return <GC key={idx} style={{ marginBottom: 18, border: isChanged ? `2px solid ${V.blue}50` : undefined }}>
            {isChanged && <div style={{ padding: "6px 22px", background: `${V.blue}10`, borderBottom: `1px solid ${V.blue}20`, fontSize: 11, fontWeight: 700, color: V.blue }}>Updated in latest revision</div>}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{imgName(idx)}</span>
                {img.theme && <Pill c={V.violet}>{img.theme}</Pill>}
                <span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span>
              </div>
              {d.hasTexts && <CopyBtn text={[d.headline, d.subheadline, ...d.bullets.map(strip), ...d.badges].filter(Boolean).join("\n")} label="Copy All" />}
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Concept + Visual side by side */}
              <div style={{ display: "grid", gridTemplateColumns: img.visual ? "1fr 1fr" : "1fr", gap: 16 }}>
                {img.concept && <div><Lbl c={V.blue}>Concept</Lbl><p style={{ fontSize: 14, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.concept}</p></div>}
                {img.visual && <div><Lbl c={V.textDim}>Visual Notes</Lbl><p style={{ fontSize: 13, color: V.textDim, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visual}</p></div>}
              </div>
              {img.rationale && <div style={{ background: `${V.violet}06`, borderRadius: 12, padding: 16, border: `1px solid ${V.violet}10` }}><Lbl c={V.violet}>Rationale</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.7, margin: 0 }}>{img.rationale}</p></div>}
              {/* Eyecatchers - Main Image only */}
              {isMain && img.eyecatchers?.length > 0 && <div><Lbl c={V.amber}>Eyecatcher Elements</Lbl><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{img.eyecatchers.map((ec, i) => {
                const isShort = ec.idea.length <= 30 && !ec.idea.includes(" ");
                const looksLikeBadgeText = isShort || /^[A-ZÄÖÜ0-9]/.test(ec.idea) && ec.idea.split(" ").length <= 4;
                return <div key={i} style={{ ...gS, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: V.amber, flexShrink: 0, marginTop: 2 }}>{i + 1}.</span>
                  <div style={{ flex: 1 }}>
                    {looksLikeBadgeText ? (
                      <ICopy text={ec.idea}><span style={{ padding: "5px 14px", borderRadius: 8, background: `${V.amber}15`, border: `1px solid ${V.amber}25`, fontSize: 14, fontWeight: 800, color: V.amber }}>{ec.idea}</span></ICopy>
                    ) : (
                      <div><Pill c={V.textDim} s={{ marginBottom: 4 }}>Visual description</Pill><p style={{ fontSize: 14, color: V.text, lineHeight: 1.6, margin: "4px 0 0" }}>{ec.idea}</p></div>
                    )}
                  </div>
                </div>;
              })}</div></div>}
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
                {/* BULLETS */}
                {d.bullets.length > 0 && <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: V.teal, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Bullet Points (+ Icons)</div>
                  {d.bullets.map((b, i) => <ICopy key={i} text={strip(b)} style={{ marginBottom: 3 }}>
                    <span style={{ color: V.teal, fontWeight: 800, flexShrink: 0 }}>-</span>
                    <span style={{ fontSize: 14, color: V.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
                  </ICopy>)}
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
            </div>
          </GC>;
        })}
      </div>
    </div>
  );
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
const TABS = [{ id: "b", l: "Bild-Briefing" }, { id: "r", l: "Bewertungen" }, { id: "a", l: "Analyse" }];
export default function App() {
  const [data, setData] = useState(null), [tab, setTab] = useState("b"), [showExp, setSE] = useState(false), [pdfL, setPL] = useState(false), [loading, setL] = useState(false), [status, setSt] = useState(""), [error, setE] = useState(null), [showNew, setSN] = useState(false), [pending, setP] = useState(null), [hlC, setHlC] = useState({}), [shC, setShC] = useState({}), [bulSel, setBulSel] = useState({}), [bdgSel, setBdgSel] = useState({}), [curAsin, setCurAsin] = useState(""), [showHist, setShowHist] = useState(false), [productData, setPD] = useState(null), [txtDensity, setTD] = useState("normal");
  const [shareUrl, setShareUrl] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [designerMode, setDesignerMode] = useState(null);
  const [designerBriefingId, setDesignerBriefingId] = useState(null);
  const [designerVersion, setDesignerVersion] = useState(1);
  // Input/Output links for designer collaboration
  const [inputUrl, setInputUrl] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  // Track the shared briefing ID so we can update it instead of creating duplicates
  const [sharedBriefingId, setSharedBriefingId] = useState(null);
  // Load briefing from shared URL on mount (short ID or legacy hash)
  useState(() => {
    const hash = window.location.hash.slice(1);
    // Legacy: #d=<compressed> links still work
    if (hash && hash.startsWith("d=")) { decodeBriefing(hash.slice(2)).then(d => { if (d?.briefing?.product) setDesignerMode(d); }); return; }
    // New: /d/<id> short URL
    const m = window.location.pathname.match(/^\/d\/([A-Za-z0-9]{6,12})$/);
    if (m) {
      const bId = m[1];
      fetch("/api/briefing?id=" + bId).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.data?.briefing?.product) {
          setDesignerMode(d.data);
          setDesignerBriefingId(bId);
          setDesignerVersion(d.version || 1);
        }
      }).catch(() => {});
    }
  });
  const shareDesignerLink = useCallback(async () => {
    if (!data) return;
    setShareLoading(true);
    const payload = { briefing: data, selections: { hlC, shC, bulSel, bdgSel, links: { inputUrl: inputUrl.trim() || null, outputUrl: outputUrl.trim() || null } } };
    // If we already shared this briefing, update it (same URL, new version)
    if (sharedBriefingId) payload._updateId = sharedBriefingId;
    try {
      const res = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const { id } = await res.json();
        if (!sharedBriefingId) setSharedBriefingId(id);
        const url = window.location.origin + "/d/" + (sharedBriefingId || id);
        setShareUrl(url);
        try { await navigator.clipboard.writeText(url); } catch {}
      } else { throw new Error("API error"); }
    } catch {
      const enc = await encodeBriefing(payload);
      if (enc) { const url = window.location.origin + window.location.pathname + "#d=" + enc; setShareUrl(url); try { await navigator.clipboard.writeText(url); } catch {} }
    }
    setShareLoading(false);
  }, [data, hlC, shC, bulSel, bdgSel, inputUrl, outputUrl, sharedBriefingId]);
  // Auto-sync changes to designer link whenever data/selections change (debounced 3s)
  const autoSyncRef = useRef(null);
  useEffect(() => {
    if (!sharedBriefingId || !data) return;
    if (autoSyncRef.current) clearTimeout(autoSyncRef.current);
    autoSyncRef.current = setTimeout(async () => {
      const payload = { briefing: data, selections: { hlC, shC, bulSel, bdgSel, links: { inputUrl: inputUrl.trim() || null, outputUrl: outputUrl.trim() || null } }, _updateId: sharedBriefingId };
      try {
        await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch {}
    }, 3000);
    return () => clearTimeout(autoSyncRef.current);
  }, [data, hlC, shC, bulSel, bdgSel, inputUrl, outputUrl, sharedBriefingId]);
  const go = useCallback(async (a, m, p, f, refData, imgCount, h10Keywords, bestsellerAsin) => {
    setL(true); setE(null); setSt("Starte...");
    try {
      // Step 1: Scrape Amazon product data first (needed for keyword search term)
      setSt("Lade Amazon-Produktdaten...");
      const scrapeResult = a && a.trim() ? await scrapeProduct(a, m) : { images: [], productData: {} };
      const pd = scrapeResult.productData || {};
      // If an ASIN was entered but nothing was found, show error and abort
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
      setData(result); setTab("b"); setSN(false); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(a || ""); setPD({ ...pd, imageCount: scrapeResult.images?.length || 0 }); saveH(result, a);
    } catch (e) { setE(e.message); }
    setL(false); setSt("");
  }, [txtDensity]);
  const goNew = useCallback((a, m, p, f, ref, ic, h10, bs) => { data ? setP({ a, m, p, f, ref, ic, h10, bs }) : go(a, m, p, f, ref, ic, h10, bs); }, [data, go]);
  // Standalone views (no app features visible)
  if (designerMode) return <DesignerView D={designerMode.briefing} selections={designerMode.selections} briefingId={designerBriefingId} serverVersion={designerVersion} />;
  if ((!data && !showNew) || (showNew && !loading) || (loading && !data)) return <StartScreen onStart={data ? goNew : go} loading={loading} status={status} error={error} onDismiss={() => setE(null)} onLoad={(d, asin) => { setData(d); setTab("b"); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(asin || ""); setSN(false); }} txtDensity={txtDensity} setTD={setTD} />;
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs /><style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ ...glass, position: "sticky", top: 0, zIndex: 100, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 900 }}>Briefing Studio</div><div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.product?.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{data.product?.brand}{curAsin ? ` · ${curAsin}` : ""}</div></div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setSN(true)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Neues Briefing</button>
            <button onClick={() => setShowHist(p => !p)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10, position: "relative" }}>Verlauf</button>
            <button onClick={() => setShowLinks(p => !p)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: showLinks ? V.blue : V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10, border: showLinks ? `1.5px solid ${V.blue}40` : "1px solid rgba(0,0,0,0.08)" }}>Links</button>
            {sharedBriefingId && <button onClick={shareDesignerLink} disabled={shareLoading} style={{ padding: "8px 18px", borderRadius: 10, border: `1.5px solid ${V.emerald}40`, background: `${V.emerald}10`, color: V.emerald, fontSize: 11, fontWeight: 800, cursor: shareLoading ? "wait" : "pointer", fontFamily: FN, opacity: shareLoading ? 0.7 : 1 }}>{shareLoading ? "Speichern..." : "Speichern"}</button>}
            <button onClick={() => { if (sharedBriefingId) { const url = window.location.origin + "/d/" + sharedBriefingId; setShareUrl(url); try { navigator.clipboard.writeText(url); } catch {} } else { shareDesignerLink(); } }} disabled={shareLoading && !sharedBriefingId} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: shareLoading && !sharedBriefingId ? "wait" : "pointer", fontFamily: FN, boxShadow: `0 4px 16px ${V.violet}30`, opacity: shareLoading && !sharedBriefingId ? 0.7 : 1 }}>{shareLoading && !sharedBriefingId ? "Erstellen..." : "Designer-Link"}</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "transparent", borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent", color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{t.l}</button>)}</div>
      </div></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {showHist && (() => { const hist = loadH(); return hist.length > 0 ? <GC style={{ padding: 0, marginBottom: 14 }}><div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl><button onClick={() => setShowHist(false)} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div><div style={{ padding: "6px 10px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", borderRadius: 10, cursor: "pointer" }} onClick={() => { setData(h.data); setTab("b"); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(h.asin || ""); setShowHist(false); }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand}{h.asin ? ` · ${h.asin}` : ""} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC> : <GC style={{ padding: 16, marginBottom: 14, textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Noch keine gespeicherten Briefings.</span></GC>; })()}
        {showLinks && <GC style={{ padding: 0, marginBottom: 14 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.blue}>Designer Links</Lbl><button onClick={() => setShowLinks(false)} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div>
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.blue, marginBottom: 6, display: "block" }}>Input Link (Assets / Source Files)</label>
              <input type="url" value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="z.B. Google Drive, Dropbox, Figma..." style={inpS} />
              <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Link zu Produktfotos, Logos, Assets die der Designer braucht.</div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.emerald, marginBottom: 6, display: "block" }}>Output Link (Upload-Ordner)</label>
              <input type="url" value={outputUrl} onChange={e => setOutputUrl(e.target.value)} placeholder="z.B. Google Drive Upload-Ordner..." style={inpS} />
              <div style={{ fontSize: 10, color: V.textDim, marginTop: 3 }}>Ordner in den der Designer seine fertigen Bilder hochlädt.</div>
            </div>
            <div style={{ ...gS, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: V.textMed, marginBottom: 4 }}>Dateinamen-Konvention:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(data?.images || []).map((_, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, color: V.violet, padding: "2px 8px", borderRadius: 6, background: `${V.violet}10`, fontFamily: "monospace" }}>{getImgFileName(data.images, i, curAsin)}</span>)}
                <span style={{ fontSize: 10, color: V.textDim, alignSelf: "center" }}>.jpg / .png, max 5 MB</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: V.textDim }}>Diese Links werden im Designer-Export sichtbar. Klicke "Designer-Link" um den Link mit den aktuellen Einstellungen neu zu generieren.</div>
          </div>
        </GC>}
        {tab === "b" && <BildBriefing D={data} hlC={hlC} setHlC={setHlC} shC={shC} setShC={setShC} bulSel={bulSel} setBulSel={setBulSel} bdgSel={bdgSel} setBdgSel={setBdgSel} onEditText={(imgIdx, type, textIdx, newVal) => {
          setData(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const te = next.images[imgIdx]?.texts;
            if (!te) return prev;
            if (type === "hl") {
              if (te.headlines) te.headlines[textIdx] = newVal;
              else te.headline = newVal;
            } else if (type === "sub") {
              if (te.subheadlines) te.subheadlines[textIdx] = newVal;
              else te.subheadline = newVal;
            } else if (type === "bul") {
              if (te.bullets) te.bullets[textIdx] = newVal;
            }
            return next;
          });
        }} />}
        {tab === "r" && <ReviewsTab D={data} />}
        {tab === "a" && <AnalyseTab D={data} lqs={calcLQS(productData)} />}
      </div>
      {shareUrl && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={() => setShareUrl(null)}><GC style={{ maxWidth: 520, width: "100%", padding: 28, background: "rgba(255,255,255,0.92)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing-Link</div><p style={{ fontSize: 12, color: V.textMed, margin: "0 0 14px" }}>Link wurde in die Zwischenablage kopiert.</p><input value={shareUrl} readOnly onClick={e => e.target.select()} style={{ ...inpS, fontSize: 11, textAlign: "center" }} /><button onClick={() => setShareUrl(null)} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Schließen</button></GC></div>}
      {pending && <OverwriteWarn name={data.product?.name || "Produkt"} onOk={() => { const p = pending; setP(null); setData(null); setSN(false); go(p.a, p.m, p.p, p.f, p.ref, p.ic, p.h10, p.bs); }} onNo={() => setP(null)} />}
    </div>
  );
}
