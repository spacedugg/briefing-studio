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

// ═══════ PROMPT ═══════
const buildPrompt = (asin, mp, pi, ft, productData, density) => {
  const hasA = asin && asin.trim();
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
  const densityHint = density === "light" ? "\nTEXTDICHTE: Wenig Text. Kurze Headlines, kurze Bullets (max 4-5 Wörter), weniger Bullets (max 3). Subheadlines optional." : "";
  return `Analysiere ${hasA ? "ASIN " + asin + " auf " : ""}${mp || "Amazon.de"}. Erstelle 7-Bild-Briefing.
${pi ? "Produkt: " + pi : ""}${ft ? "\nHinweise: " + ft : ""}${scraped}${densityHint}
REGELN:
- Headlines: max 25 Zeichen, 3 Varianten (1:Feature/USP direkt, 2:Kundenvorteil, 3:Kreativ). Keine Kommas/Gedankenstriche. Konkret statt abstrakt.
- Subheadlines: 3 Varianten (kurz/erklärend/emotional). Dürfen auch leer bleiben falls nicht nötig.
- Bullets: So viele wie inhaltlich sinnvoll (2-6), NICHT immer gleich viele pro Bild. Orientiere dich am Bildinhalt. Schlüsselwörter mit **fett** markieren. Jeder Bullet max 1-2 Fettungen.
- Badge: Max 1 Badge pro Bild. Nur wenn es einen wirklich herausragenden Fakt gibt (z.B. "Inkl. Videoanleitung", "Nur 1g Zucker", "TÜV-geprüft"). Nicht jedes Bild braucht ein Badge! badges ist ein Array mit 0 oder 1 Einträgen. Badge = auffälligstes Eyecatcher-Element, nur für besonders wichtige/coole/persönliche Fakten.
- Bildtexte DE, Concept/Rationale/Visual EN. Keywords integrieren.
- Lifestyle ohne Text-Overlay: concept+visual DETAILLIERT (Szenerie, Personen, Stimmung, Kamera).
- Fussnoten mit * im referenzierten Text kennzeichnen (z.B. "Laborgetestet*") und Fussnote beginnt mit "* ...".
- Reviews: relative %, absteigend, deutlich unterschiedlich (nicht alle 30-35%).
- Blacklist: vulgaer, negative Laendernennung, Wettbewerber-Vergleiche, unbelegte Statistiken.
- Siegel: nur beantragungspflichtige. Kaufausloeser absteigend. Keywords: used true/false.

BILDER: Main(kein Text, 3 Eyecatcher mit risk:low/medium), PT01(STAERKSTER Kauftrigger), PT02(Differenzierung), PT03(Lifestyle/emotional), PT04-06(Einwandbehandlung neg. Reviews).

NUR JSON, keine Backticks/Markdown:
{product:{name,brand,sku,marketplace,category,price,position}, audience:{persona,desire,fear,triggers:[absteigend],balance}, listingWeaknesses:${hasA ? "[{weakness,impact:high/medium/low,briefingAction}]" : "null"}, reviews:{source,estimated:true, positive:[{theme,pct}], negative:[{theme,pct,quotes:[],status:solved/unclear/neutral,implication}]}, keywords:{volume:[{kw,used:bool}],purchase:[{kw,used:bool}],badges:[{kw,note,requiresApplication:bool}]}, competitive:{patterns,gaps:[]}, images:[7 Objekte mit id:main/pt01-pt06, label, role, concept(EN), rationale(EN), visual(EN), texts:{headlines:[3],subheadlines:[3 Varianten oder leeres Array],bullets:["variabel viele, **fett** markiert"],badges:["max 1 oder leer"],footnotes:["* Fussnotentext"]}|null, eyecatchers(nur main):[{idea(DE),risk}]]}`;
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
async function runAnalysis(asin, mp, pi, ft, onS, productData, density) {
  onS("Sende Analyse-Anfrage...");
  let r;
  try {
    r = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: "Amazon Listing Analyst. Antworte NUR mit validem JSON. Kein Markdown/Codeblocks/Text. Antwort beginnt mit { und endet mit }.",
        messages: [{ role: "user", content: buildPrompt(asin, mp, pi, ft, productData, density) }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
  } catch { throw new Error("Netzwerkfehler: API nicht erreichbar."); }
  if (!r.ok) { let m = "API " + r.status; try { const e = await r.json(); m += ": " + (e.error?.message || ""); } catch {} throw new Error(m); }
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

// ═══════ COMPONENTS ═══════
const Pill = ({ children, c = V.violet, s = {} }) => <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 20, background: `${c}14`, color: c, fontSize: 10.5, fontWeight: 700, border: `1px solid ${c}22`, ...s }}>{children}</span>;
const CopyBtn = ({ text, label }) => { const [ok, set] = useState(false); return <button onClick={() => { navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 1200); }} style={{ ...gS, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: ok ? "#fff" : V.textMed, cursor: "pointer", fontFamily: FN, background: ok ? V.emerald : "rgba(255,255,255,0.5)", border: ok ? `1px solid ${V.emerald}` : "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}>{ok ? "Kopiert" : (label || "Kopieren")}</button>; };
const RelBar = ({ pct, maxPct, color }) => { const w = maxPct > 0 ? (pct / maxPct) * 100 : 0; return <div style={{ flex: 1, height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}BB)`, borderRadius: 99 }} /></div>; };
const GC = ({ children, style: s = {}, onClick: oc }) => <div style={{ ...glass, ...s }} onClick={oc}>{children}</div>;
const Lbl = ({ children, c = V.violet }) => <div style={{ fontSize: 10, fontWeight: 800, color: c, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
const Check = ({ on }) => <span style={{ color: on ? V.emerald : V.textDim, fontSize: 11, fontWeight: 800 }}>{on ? "✓" : "○"}</span>;
const Err = ({ msg, onX }) => msg ? <div style={{ ...gS, padding: "12px 18px", background: `${V.rose}10`, border: `1px solid ${V.rose}25`, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><span style={{ fontSize: 12, color: V.rose, fontWeight: 600, lineHeight: 1.5 }}>{msg}</span>{onX && <button onClick={onX} style={{ background: "none", border: "none", color: V.rose, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 16 }}>×</button>}</div> : null;

// ═══════ TIME TRACKER (single overall timer for designer view) ═══════
function TimeTracker({ productName }) {
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);
  const iRef = useRef(null);
  useEffect(() => { if (iRef.current) clearInterval(iRef.current); if (running) { iRef.current = setInterval(() => setSecs(p => p + 1), 1000); } return () => clearInterval(iRef.current); }, [running]);
  const fmt = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}` : `${m}:${ss.toString().padStart(2, "0")}`; };
  return <div style={{ ...glass, padding: "20px 28px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
    <div><div style={{ fontSize: 10, fontWeight: 800, color: V.teal, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Zeiterfassung</div><div style={{ fontSize: 11, color: V.textDim }}>{productName || "Briefing"}</div></div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 28, fontWeight: 800, color: running ? V.teal : V.ink, fontVariantNumeric: "tabular-nums", fontFamily: FN }}>{fmt(secs)}</span>
      <button onClick={() => setRunning(r => !r)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: running ? V.rose : `linear-gradient(135deg, ${V.teal}, ${V.emerald})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN, minWidth: 80 }}>{running ? "Pause" : secs > 0 ? "Weiter" : "Start"}</button>
      {secs > 0 && !running && <button onClick={() => { navigator.clipboard.writeText(`${productName || "Briefing"}: ${fmt(secs)}`); }} style={{ ...gS, padding: "10px 14px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 8 }}>Kopieren</button>}
    </div>
  </div>;
}

// ═══════ START ═══════
function StartScreen({ onStart, loading, status, error, onDismiss, onLoad, txtDensity, setTD }) {
  const [asin, sa] = useState(""); const [mp, sm] = useState("Amazon.de"); const [pi, sp] = useState(""); const [ft, sf] = useState("");
  const [hist] = useState(loadH); const ok = asin.trim() || pi.trim();
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 24, position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 580, width: "100%" }}>
          <GC style={{ padding: 0, marginBottom: hist.length ? 14 : 0 }}>
            <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Neues Briefing</div>
              <p style={{ fontSize: 13, color: V.textMed, margin: 0, lineHeight: 1.6 }}>ASIN eingeben oder Produktinfos beschreiben.</p>
            </div>
            <div style={{ padding: "20px 32px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
              <Err msg={error} onX={onDismiss} />
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
                <textarea value={pi} onChange={e => sp(e.target.value)} placeholder="Features, Materialien, USPs..." rows={3} style={{ ...inpS, resize: "vertical", lineHeight: 1.6 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 6, display: "block" }}>Zusätzliche Hinweise (optional)</label>
                <textarea value={ft} onChange={e => sf(e.target.value)} placeholder="Wettbewerber, Markenwerte, Tonalität..." rows={2} style={{ ...inpS, resize: "vertical", lineHeight: 1.6 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 8, display: "block" }}>Textdichte</label>
                <div style={{ display: "flex", gap: 8 }}>{[["light", "Wenig Text"], ["normal", "Normal"]].map(([val, lbl]) => <button key={val} onClick={() => setTD(val)} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: txtDensity === val ? `2px solid ${V.violet}` : "1px solid rgba(0,0,0,0.08)", background: txtDensity === val ? `${V.violet}10` : "rgba(255,255,255,0.5)", color: txtDensity === val ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{lbl}</button>)}</div>
              </div>
              <button onClick={() => ok && !loading && onStart(asin, mp, pi, ft)} disabled={!ok || loading} style={{ padding: "14px 24px", borderRadius: 14, border: "none", background: loading ? `${V.violet}80` : ok ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(0,0,0,0.08)", color: ok || loading ? "#fff" : V.textDim, fontSize: 14, fontWeight: 800, cursor: ok && !loading ? "pointer" : "default", fontFamily: FN, boxShadow: ok ? `0 4px 20px ${V.violet}35` : "none" }}>{loading ? "Analyse läuft..." : "Analyse starten"}</button>
              {loading && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 10, height: 10, border: `2px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: 99, animation: "spin 0.7s linear infinite" }} /><span style={{ fontSize: 12, color: V.violet, fontWeight: 600 }}>{status}</span></div>}
            </div>
          </GC>
          {hist.length > 0 && <GC style={{ padding: 0 }}><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl></div><div style={{ padding: "8px 12px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", borderRadius: 10, cursor: "pointer" }} onClick={() => onLoad(h.data, h.asin)} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC>}
        </div>
      </div>
    </div>
  );
}

function OverwriteWarn({ name, onOk, onNo }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onNo}><GC style={{ maxWidth: 440, width: "100%", padding: 28, background: "rgba(255,255,255,0.9)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing überschreiben?</div><p style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6, margin: "0 0 6px" }}>Das Briefing für <b>{name}</b> wird ersetzt.</p><p style={{ fontSize: 12, color: V.textDim, margin: "0 0 20px" }}>Die letzten {MH} Briefings bleiben abrufbar.</p><div style={{ display: "flex", gap: 8, justifyContent: "center" }}><button onClick={onNo} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textMed, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Abbrechen</button><button onClick={onOk} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.rose}, ${V.orange})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Überschreiben</button></div></GC></div>;
}

// ═══════ BILD-BRIEFING ═══════
function BildBriefing({ D, hlC, setHlC, shC, setShC, bulSel, setBulSel, bdgSel, setBdgSel, listingImgs }) {
  const [sel, setSel] = useState(0);
  if (!D.images?.length) return null;
  const img = D.images[sel], te = img?.texts;
  const hls = te?.headlines || (te?.headline ? [te.headline] : []);
  const ci = hlC[img.id] ?? 0, curHl = hls[ci] || hls[0] || "";
  // Subheadlines: support both old (single string) and new (array) format
  const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
  const si = shC[img.id] ?? 0; // -1 = keine subheadline
  const curSh = si === -1 ? "" : (subs[si] || subs[0] || te?.subheadline || "");
  // Bullet selection state
  const bKey = img.id;
  const bullets = te?.bullets || [];
  const bSel = bulSel[bKey] || bullets.map(() => true);
  const selectedBullets = bullets.filter((_, i) => bSel[i]);
  // Badge selection state (include/exclude)
  const allBadges = [...(te?.badges || []), ...(te?.callouts || [])];
  const badgeOn = bdgSel[img.id] !== false; // default: included
  const allTxt = te ? [curHl, curSh, ...selectedBullets, ...(badgeOn ? allBadges : [])].filter(Boolean).join("\n") : "";
  const curListingImg = listingImgs && listingImgs[sel] ? listingImgs[sel].base64 : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{D.images.map((im, i) => {
        const h = im.texts?.headlines || (im.texts?.headline ? [im.texts.headline] : []);
        const ov = h.some(x => x.length > MAX_HL);
        const tabLabel = IMG_LABELS[i] || im.label;
        return <button key={i} onClick={() => setSel(i)} style={{ ...gS, padding: "9px 16px", background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(255,255,255,0.5)", color: sel === i ? "#fff" : ov ? V.rose : V.textDim, border: ov && sel !== i ? `1.5px solid ${V.rose}50` : sel === i ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "none" }}>{tabLabel}{ov ? " !" : ""}</button>;
      })}</div>
      <GC>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{IMG_LABELS[sel] || img.label}</span><span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span></div>
          {te && <CopyBtn text={allTxt} label="Alle Texte" />}
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {curListingImg && <div style={{ ...gS, padding: 12, display: "flex", gap: 14, alignItems: "flex-start" }}><img src={curListingImg} alt={img.label} style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8, background: "#fff", border: "1px solid rgba(0,0,0,0.06)" }} /><div><Lbl c={V.rose}>Aktuelles Listing-Bild</Lbl><p style={{ fontSize: 11, color: V.textDim, margin: 0, lineHeight: 1.4 }}>So sieht das {img.label} aktuell auf Amazon aus. Das neue Briefing rechts ersetzt dieses Bild.</p></div></div>}
          {img.concept && <div><Lbl c={V.blue}>Bildkonzept</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.concept}</p></div>}
          {img.rationale && <div style={{ background: `${V.violet}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.violet}12` }}><Lbl c={V.violet}>Strategische Begründung</Lbl><p style={{ fontSize: 12.5, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.rationale}</p></div>}

          {img.eyecatchers?.length > 0 && <div><Lbl c={V.amber}>Eyecatcher-Vorschläge</Lbl>{img.eyecatchers.map((ec, i) => <div key={i} style={{ ...gS, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", gap: 10 }}><span style={{ color: V.amber, fontWeight: 800 }}>{i + 1}.</span><span style={{ fontSize: 12.5, color: V.text, lineHeight: 1.5 }}>{ec.idea}</span></div><Pill c={ec.risk === "low" ? V.emerald : V.amber}>{ec.risk === "low" ? "Geringes Risiko" : "Graubereich"}</Pill></div>)}</div>}

          {te && hls.length > 0 ? <div><Lbl c={V.orange}>Bildtexte (Deutsch)</Lbl>
            {/* HEADLINES */}
            <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.orange}>HEADLINE-VARIANTEN</Pill><CopyBtn text={curHl} /></div>
              {hls.map((h, i) => { const ov = h.length > MAX_HL, act = ci === i; const labels = ["Feature/USP", "Kundenvorteil", "Kreativ"]; return <div key={i} onClick={() => setHlC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.violet}` : `1px solid ${ov ? V.rose + "40" : "rgba(0,0,0,0.06)"}`, background: act ? `${V.violet}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.violet}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.violet }} />}</div><span style={{ fontSize: 15, fontWeight: 800, color: V.ink }}>{h}</span></div><div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 9, color: V.textDim, fontWeight: 600 }}>{labels[i] || ""}</span><span style={{ fontSize: 10, fontWeight: 700, color: ov ? V.rose : V.textDim }}>{h.length}/{MAX_HL}</span></div></div>; })}
            </div>
            {/* SUBHEADLINES */}
            {subs.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Pill c={V.blue}>SUBHEADLINE-VARIANTEN</Pill><CopyBtn text={curSh} /></div>
              {subs.map((s, i) => { const act = si === i || (si === undefined && i === 0); return <div key={i} onClick={() => setShC(p => ({ ...p, [img.id]: i }))} style={{ padding: "10px 14px", borderRadius: 10, border: act ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: act ? `${V.blue}08` : "transparent", cursor: "pointer", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: act ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{act && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div><span style={{ fontSize: 13, fontWeight: 600, color: V.ink }}>{s}</span></div></div>; })}
              <div onClick={() => setShC(p => ({ ...p, [img.id]: -1 }))} style={{ padding: "10px 14px", borderRadius: 10, border: si === -1 ? `2px solid ${V.blue}` : "1px solid rgba(0,0,0,0.06)", background: si === -1 ? `${V.blue}08` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 18, height: 18, borderRadius: 99, border: si === -1 ? `2px solid ${V.blue}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{si === -1 && <div style={{ width: 8, height: 8, borderRadius: 99, background: V.blue }} />}</div><span style={{ fontSize: 13, fontWeight: 600, color: V.textDim, fontStyle: "italic" }}>Keine Subheadline</span></div>
            </div>}
            {/* Legacy single subheadline fallback */}
            {subs.length === 0 && te.subheadline && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><Pill c={V.blue}>SUBHEADLINE</Pill><CopyBtn text={te.subheadline} /></div><div style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6 }}>{te.subheadline}</div></div>}
            {/* BULLETS */}
            {bullets.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill c={V.teal}>BULLETS · {selectedBullets.length}/{bullets.length}</Pill><CopyBtn text={selectedBullets.join("\n")} /></div>{bullets.map((b, i) => { const on = bSel[i] !== false; return <div key={i} onClick={() => { const next = [...(bulSel[bKey] || bullets.map(() => true))]; next[i] = !on; setBulSel(p => ({ ...p, [bKey]: next })); }} style={{ display: "flex", gap: 10, marginTop: 10, padding: "8px 10px", borderRadius: 8, border: on ? `1.5px solid ${V.teal}30` : "1.5px solid rgba(0,0,0,0.04)", background: on ? `${V.teal}06` : "transparent", cursor: "pointer", opacity: on ? 1 : 0.45, transition: "all 0.15s" }}><div style={{ width: 18, height: 18, borderRadius: 4, border: on ? `2px solid ${V.teal}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{on && <span style={{ color: V.teal, fontSize: 12, fontWeight: 800 }}>✓</span>}</div><span style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.+?)\*\*/g, '<b style="color:#0F172A">$1</b>') }} /></div>; })}</div>}
            {/* BADGE (max 1, selectable) */}
            {allBadges.length > 0 && <div onClick={() => setBdgSel(p => ({ ...p, [img.id]: !badgeOn }))} style={{ ...gS, padding: 14, marginBottom: 10, cursor: "pointer", border: badgeOn ? `1.5px solid ${V.amber}40` : "1.5px solid rgba(0,0,0,0.04)", opacity: badgeOn ? 1 : 0.45, transition: "all 0.15s" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Pill c={V.amber}>BADGE</Pill><div style={{ width: 18, height: 18, borderRadius: 4, border: badgeOn ? `2px solid ${V.amber}` : "2px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>{badgeOn && <span style={{ color: V.amber, fontSize: 12, fontWeight: 800 }}>✓</span>}</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{allBadges.map((b, i) => <span key={i} style={{ padding: "5px 12px", borderRadius: 8, background: `${V.amber}12`, border: `1px solid ${V.amber}20`, fontSize: 12, fontWeight: 800, color: V.amber }}>{b}</span>)}</div></div>}
            {/* FOOTNOTES */}
            {te.footnotes?.length > 0 && <div style={{ ...gS, padding: 12, background: `${V.textDim}08`, marginBottom: 10 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>Fußnoten</span>{te.footnotes.map((f, i) => <div key={i} style={{ fontSize: 11, color: V.textDim, marginTop: 4, lineHeight: 1.5 }}>{f}</div>)}</div>}
          </div> : !te && <div style={{ padding: 16, ...gS, borderStyle: "dashed", textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Kein Text-Overlay. Rein visuelles Bild.</span></div>}

          {img.visual && <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 14 }}><Lbl c={V.textDim}>Visuelle Hinweise für Designer</Lbl><p style={{ fontSize: 12, color: V.textDim, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visual}</p></div>}
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
  const checks = [
    { label: "Titel vorhanden", ok: !!pd.title, weight: 1 },
    { label: "Titel > 80 Zeichen", ok: (pd.title?.length || 0) >= 80, weight: 1 },
    { label: "Titel < 200 Zeichen", ok: (pd.title?.length || 0) <= 200, weight: 0.5 },
    { label: "5 Bullet Points", ok: (pd.bullets?.length || 0) >= 5, weight: 1.5 },
    { label: "Bullets > 100 Zeichen avg.", ok: pd.bullets?.length > 0 && pd.bullets.reduce((a, b) => a + b.length, 0) / pd.bullets.length > 100, weight: 1 },
    { label: "Beschreibung vorhanden", ok: !!pd.description && pd.description.length > 50, weight: 1 },
    { label: "Preis angegeben", ok: !!pd.price, weight: 0.5 },
    { label: "Marke angegeben", ok: !!pd.brand, weight: 0.5 },
    { label: "Bewertungen vorhanden", ok: (pd.reviewCount || 0) > 0, weight: 1 },
    { label: "Rating >= 4.0", ok: parseFloat(pd.rating || 0) >= 4.0, weight: 1 },
    { label: "7+ Bilder", ok: (pd.imageCount || 0) >= 7, weight: 1.5 },
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
function genBrief(D, hlC, shC, bulSel, bdgSel) {
  let t = `AMAZON GALLERY IMAGE BRIEFING\n${"=".repeat(50)}\nProduct: ${D.product?.name} | ${D.product?.brand}\nMarketplace: ${D.product?.marketplace}\n\n`;
  (D.images || []).forEach((im, idx) => {
    const expLabel = IMG_LABELS[idx] + " - " + (im.role || im.label);
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
// ═══════ DESIGNER VIEW (standalone shareable page) ═══════
function DesignerView({ D, selections }) {
  const [sel, setSel] = useState(0);
  const hlC = selections?.hlC || {}, shC = selections?.shC || {}, bulSel = selections?.bulSel || {}, bdgSel = selections?.bdgSel || {};
  if (!D?.images?.length) return null;
  const img = D.images[sel], te = img?.texts;
  const hls = te?.headlines || (te?.headline ? [te.headline] : []);
  const ci = hlC[img.id] ?? 0, curHl = hls[ci] || hls[0] || "";
  const subs = te ? (Array.isArray(te.subheadlines) ? te.subheadlines : (te.subheadline ? [te.subheadline] : [])) : [];
  const si = shC[img.id] ?? 0;
  const curSh = si === -1 ? "" : (subs[si] || subs[0] || te?.subheadline || "");
  const bullets = te?.bullets || [];
  const bSel = bulSel[img.id] || bullets.map(() => true);
  const selectedBullets = bullets.filter((_, i) => bSel[i]);
  const allBadges = [...(te?.badges || []), ...(te?.callouts || [])];
  const badgeOn = bdgSel[img.id] !== false;
  const strip = s => s.replace(/\*\*(.+?)\*\*/g, "$1");
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Orbs /><style>{`*, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px", position: "relative", zIndex: 1 }}>
        <TimeTracker productName={D.product?.name} />
        <div style={{ ...glass, padding: "16px 22px", marginBottom: 18 }}>
          <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Designer-Briefing</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{D.product?.name}</div>
          <div style={{ fontSize: 11, color: V.textDim }}>{D.product?.brand} · {D.product?.marketplace}</div>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 14 }}>{D.images.map((im, i) => <button key={i} onClick={() => setSel(i)} style={{ ...gS, padding: "9px 16px", background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(255,255,255,0.5)", color: sel === i ? "#fff" : V.textDim, border: sel === i ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "none" }}>{IMG_LABELS[i] || im.label}</button>)}</div>
        <GC>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{IMG_LABELS[sel] || img.label}</span><span style={{ fontSize: 12, color: V.textDim, marginLeft: 10 }}>{img.role}</span>
          </div>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            {img.concept && <div><Lbl c={V.blue}>Concept</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.concept}</p></div>}
            {img.rationale && <div style={{ background: `${V.violet}08`, borderRadius: 14, padding: 16, border: `1px solid ${V.violet}12` }}><Lbl c={V.violet}>Rationale</Lbl><p style={{ fontSize: 12.5, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.rationale}</p></div>}
            {img.eyecatchers?.length > 0 && <div><Lbl c={V.amber}>Eyecatcher</Lbl>{img.eyecatchers.map((ec, i) => <div key={i} style={{ ...gS, padding: 12, marginBottom: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: V.text }}>{i + 1}. {ec.idea}</span><Pill c={ec.risk === "low" ? V.emerald : V.amber}>{ec.risk}</Pill></div>)}</div>}
            {te && <>
              {curHl && <div style={{ ...gS, padding: 14 }}><Pill c={V.orange}>HEADLINE</Pill><div style={{ fontSize: 16, fontWeight: 800, color: V.ink, marginTop: 8 }}>"{curHl}"</div></div>}
              {curSh && <div style={{ ...gS, padding: 14 }}><Pill c={V.blue}>SUBHEADLINE</Pill><div style={{ fontSize: 13, color: V.textMed, marginTop: 8 }}>"{curSh}"</div></div>}
              {selectedBullets.length > 0 && <div style={{ ...gS, padding: 14 }}><Pill c={V.teal}>BULLETS</Pill>{selectedBullets.map((b, i) => <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}><span style={{ color: V.teal, fontWeight: 800 }}>-</span><span style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.6 }}>"{strip(b)}"</span></div>)}</div>}
              {badgeOn && allBadges.length > 0 && <div style={{ ...gS, padding: 14 }}><Pill c={V.amber}>BADGE</Pill><div style={{ marginTop: 8 }}>{allBadges.map((b, i) => <span key={i} style={{ padding: "5px 12px", borderRadius: 8, background: `${V.amber}12`, border: `1px solid ${V.amber}20`, fontSize: 12, fontWeight: 800, color: V.amber }}>{b}</span>)}</div></div>}
              {te.footnotes?.length > 0 && <div style={{ ...gS, padding: 12, background: `${V.textDim}08` }}><span style={{ fontSize: 10, fontWeight: 800, color: V.textDim }}>FUSSNOTEN</span>{te.footnotes.map((f, i) => <div key={i} style={{ fontSize: 11, color: V.textDim, marginTop: 4 }}>{f}</div>)}</div>}
            </>}
            {img.visual && <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 14 }}><Lbl c={V.textDim}>Visual Notes</Lbl><p style={{ fontSize: 12, color: V.textDim, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visual}</p></div>}
          </div>
        </GC>
      </div>
    </div>
  );
}

// ═══════ PRESENTATION VIEW (standalone shareable page, temoa CI) ═══════
const TC = { or: "#FF9903", lb: "#CDE6F4", re: "#FF3132", na: "#043047", bk: "#000", wh: "#FFF" };
function PresentationView({ briefing, productData, listingImgs, level }) {
  const [slide, setSlide] = useState(0);
  const D = briefing, a = D?.audience || {}, rv = D?.reviews || { positive: [], negative: [] }, k = D?.keywords || {}, co = D?.competitive || {}, lw = D?.listingWeaknesses || [];
  const lqs = calcLQS(productData);
  // Build slides based on level
  const slides = [];
  // S0: Title
  slides.push({ id: "title", render: () => <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", height: "100%", padding: "60px 80px" }}>
    <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>{[TC.re, TC.or, TC.na, TC.lb].map((c, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}</div>
    <h1 style={{ fontSize: 42, fontWeight: 900, color: TC.bk, margin: 0, lineHeight: 1.2 }}>Datenbasierte<br /><span style={{ color: TC.re }}>Listing-Analyse</span></h1>
    <p style={{ fontSize: 18, color: "#5A6B80", margin: "20px 0 0", fontWeight: 500 }}>{D?.product?.name}</p>
    <p style={{ fontSize: 14, color: "#8E9AAD", margin: "6px 0 0" }}>{D?.product?.brand} | {D?.product?.marketplace}</p>
  </div> });
  // S1: LQS
  if (lqs) slides.push({ id: "lqs", render: () => <div style={{ padding: "50px 80px" }}>
    <h2 style={{ fontSize: 28, fontWeight: 900, color: TC.bk, margin: "0 0 30px" }}>Listing Quality <span style={{ color: TC.or }}>Score</span></h2>
    <div style={{ display: "flex", gap: 40, alignItems: "center", marginBottom: 30 }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", border: `6px solid ${lqs.score >= 7 ? TC.or : lqs.score >= 4 ? TC.or : TC.re}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 36, fontWeight: 900, color: TC.bk }}>{lqs.score}</span><span style={{ fontSize: 14, color: "#8E9AAD" }}>/10</span></div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>{lqs.checks.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: c.ok ? "#1A8754" : TC.re, fontSize: 14, fontWeight: 800 }}>{c.ok ? "✓" : "✗"}</span><span style={{ fontSize: 13, color: c.ok ? TC.bk : "#8E9AAD" }}>{c.label}</span></div>)}</div>
      </div>
    </div>
  </div> });
  // S2: Kaufauslöser
  slides.push({ id: "triggers", render: () => <div style={{ padding: "50px 80px" }}>
    <h2 style={{ fontSize: 28, fontWeight: 900, color: TC.bk, margin: "0 0 30px" }}>Kauf<span style={{ color: TC.or }}>auslöser</span></h2>
    {(a.triggers || []).slice(0, 6).map((t, i) => <div key={i} style={{ display: "flex", gap: 16, marginBottom: 14, padding: "12px 16px", borderRadius: 12, background: i === 0 ? `${TC.or}15` : "transparent", border: i === 0 ? `1px solid ${TC.or}30` : "none" }}><span style={{ fontSize: 20, fontWeight: 900, color: TC.or, width: 30, flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 15, color: i === 0 ? TC.bk : "#5A6B80", fontWeight: i === 0 ? 700 : 400 }}>{t}</span></div>)}
  </div> });
  // S3: Reviews
  slides.push({ id: "reviews", render: () => { const mp = Math.max(...rv.positive.map(x => x.pct || 0), 1); const mn = Math.max(...rv.negative.map(x => x.pct || 0), 1); return <div style={{ padding: "50px 80px" }}>
    <h2 style={{ fontSize: 28, fontWeight: 900, color: TC.bk, margin: "0 0 30px" }}>Bewertungs<span style={{ color: TC.re }}>analyse</span></h2>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
      <div><h3 style={{ fontSize: 12, fontWeight: 800, color: "#1A8754", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Positiv</h3>{rv.positive.slice(0, 5).map((x, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5A6B80", marginBottom: 3 }}><span>{x.theme}</span><span>~{x.pct}%</span></div><div style={{ height: 4, background: "#E8EAF0", borderRadius: 99 }}><div style={{ width: `${(x.pct / mp) * 100}%`, height: "100%", background: "#1A8754", borderRadius: 99 }} /></div></div>)}</div>
      <div><h3 style={{ fontSize: 12, fontWeight: 800, color: TC.re, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Negativ</h3>{rv.negative.slice(0, 5).map((x, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5A6B80", marginBottom: 3 }}><span>{x.theme}</span><span>~{x.pct}%</span></div><div style={{ height: 4, background: "#E8EAF0", borderRadius: 99 }}><div style={{ width: `${(x.pct / mn) * 100}%`, height: "100%", background: TC.re, borderRadius: 99 }} /></div></div>)}</div>
    </div>
  </div>; } });
  // S4: Bildstrategie
  slides.push({ id: "images", render: () => <div style={{ padding: "50px 80px" }}>
    <h2 style={{ fontSize: 28, fontWeight: 900, color: TC.bk, margin: "0 0 8px" }}>Bild<span style={{ color: TC.or }}>strategie</span></h2>
    <p style={{ fontSize: 14, color: "#5A6B80", margin: "0 0 24px" }}>{(D?.images || []).length} datenbasierte Bilder für maximale Conversion</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>{(D?.images || []).map((im, i) => { const bgc = [TC.re, TC.or, TC.na, TC.lb, TC.re, TC.or, TC.na][i]; return <div key={i} style={{ background: bgc, borderRadius: 12, padding: 16, color: TC.wh, minHeight: 90 }}><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{IMG_LABELS[i]}</div><div style={{ fontSize: 9, opacity: 0.85, marginBottom: 8 }}>{im.role}</div><div style={{ fontSize: 10 }}>{im.texts?.headlines?.[0] || "Visuell"}</div></div>; })}</div>
  </div> });
  // S5: Aktuelles Listing (wenn Bilder vorhanden)
  if (listingImgs?.length > 0) slides.push({ id: "current", render: () => <div style={{ padding: "50px 80px" }}>
    <h2 style={{ fontSize: 28, fontWeight: 900, color: TC.bk, margin: "0 0 24px" }}>Aktuelles <span style={{ color: TC.re }}>Listing</span></h2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>{listingImgs.slice(0, 7).map((im, i) => <div key={i} style={{ background: "#F8F9FB", borderRadius: 12, padding: 8, textAlign: "center" }}>{im.base64 && <img src={im.base64} alt={IMG_LABELS[i]} style={{ width: "100%", height: 100, objectFit: "contain", borderRadius: 8 }} />}<div style={{ fontSize: 10, fontWeight: 700, color: TC.na, marginTop: 6 }}>{IMG_LABELS[i]}</div></div>)}</div>
  </div> });
  // S6: Nächste Schritte
  slides.push({ id: "next", render: () => <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "60px 80px" }}>
    <h2 style={{ fontSize: 32, fontWeight: 900, color: TC.bk, margin: "0 0 40px" }}>Nächste <span style={{ color: TC.or }}>Schritte</span></h2>
    {["Briefing-Freigabe", "Bildproduktion durch Design-Team", "A/B Testing & Optimierung"].map((s, i) => <div key={i} style={{ display: "flex", gap: 16, marginBottom: 18 }}><span style={{ fontSize: 22, fontWeight: 900, color: TC.or }}>{i + 1}.</span><span style={{ fontSize: 16, color: "#5A6B80" }}>{s}</span></div>)}
    <div style={{ display: "flex", gap: 8, marginTop: 40 }}>{[TC.re, TC.or, TC.na, TC.lb].map((c, i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}</div>
  </div> });

  const total = slides.length;
  return (
    <div style={{ minHeight: "100vh", background: "#FFF", fontFamily: FN }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*, *::before, *::after { box-sizing: border-box; }`}</style>
      {/* Top color bar */}
      <div style={{ height: 3, display: "flex" }}>{[TC.re, TC.or, TC.na, TC.lb].map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}</div>
      {/* Slide content */}
      <div style={{ maxWidth: 1000, margin: "0 auto", minHeight: "calc(100vh - 60px)" }}>
        {slides[slide]?.render()}
      </div>
      {/* Navigation */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderTop: "1px solid rgba(0,0,0,0.06)", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{[TC.re, TC.or, TC.na, TC.lb].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />)}<span style={{ fontSize: 11, color: "#8E9AAD", marginLeft: 4 }}>temoa</span></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)", background: slide === 0 ? "rgba(0,0,0,0.02)" : "#fff", color: slide === 0 ? "#ccc" : TC.bk, fontSize: 12, fontWeight: 700, cursor: slide === 0 ? "default" : "pointer", fontFamily: FN }}>Zurück</button>
          <span style={{ fontSize: 11, color: "#8E9AAD", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{slide + 1} / {total}</span>
          <button onClick={() => setSlide(s => Math.min(total - 1, s + 1))} disabled={slide >= total - 1} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: slide >= total - 1 ? "rgba(0,0,0,0.06)" : TC.na, color: slide >= total - 1 ? "#ccc" : TC.wh, fontSize: 12, fontWeight: 700, cursor: slide >= total - 1 ? "default" : "pointer", fontFamily: FN }}>Weiter</button>
        </div>
        <span style={{ fontSize: 11, color: "#8E9AAD" }}>{slide + 1} / {total}</span>
      </div>
      {/* Bottom color bar */}
      <div style={{ position: "fixed", bottom: 52, left: 0, right: 0, height: 2, display: "flex" }}>{[TC.re, TC.or, TC.na, TC.lb].map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}</div>
    </div>
  );
}

// ═══════ PDF (temoa CI) ═══════
function exportPDF(D, listingImgs) {
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
  const hasImgs = listingImgs && listingImgs.length > 0;
  const TP = hasImgs ? 7 : 6;

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
    pdf.setFontSize(6.5); pdf.text(String(im.role || ""), bx + 6, by + 18);
    pdf.setFontSize(7); pdf.setFont("helvetica", "normal");
    const hl = im.texts?.headlines?.[0] || im.texts?.headline || "Nur visuell";
    pdf.text(pdf.splitTextToSize(hl, 62), bx + 6, by + 26);
  });
  colorBar(); footer(5, TP);

  // ═══ SLIDE 6 (conditional): Aktuelles Listing — Bilder ═══
  if (hasImgs) {
    pdf.addPage(); topBar();
    h1("Aktuelles", 20, 28, 24); redText("Listing", 100, 28, 24);
    body("Aktuelle Amazon-Galleriebilder des Produkts", 20, 38, 300);

    const imgs = listingImgs.slice(0, 7);
    // Layout: up to 7 images in a grid
    // Row 1: Main image large + 3 small
    // Row 2: 3 small
    const labels = ["Main Image", "PT.01", "PT.02", "PT.03", "PT.04", "PT.05", "PT.06"];

    if (imgs.length > 0) {
      // Main image — large on the left
      try {
        const mainImg = imgs[0];
        if (mainImg.base64) {
          const fmt = mainImg.base64.includes("image/png") ? "PNG" : "JPEG";
          pdf.addImage(mainImg.base64, fmt, 20, 46, 72, 72);
          pdf.setFontSize(7); pdf.setTextColor(C.re); pdf.setFont("helvetica", "bold");
          pdf.text("Main Image", 20, 123);
        }
      } catch {}

      // PT01-PT03 — right of main
      for (let i = 1; i <= 3 && i < imgs.length; i++) {
        try {
          const img = imgs[i];
          if (img.base64) {
            const fmt = img.base64.includes("image/png") ? "PNG" : "JPEG";
            const ix = 100 + (i - 1) * 56;
            pdf.addImage(img.base64, fmt, ix, 46, 50, 50);
            pdf.setFontSize(6.5); pdf.setTextColor(C.na); pdf.setFont("helvetica", "bold");
            pdf.text(labels[i] || "", ix, 100);
          }
        } catch {}
      }

      // PT04-PT06 — bottom row
      for (let i = 4; i <= 6 && i < imgs.length; i++) {
        try {
          const img = imgs[i];
          if (img.base64) {
            const fmt = img.base64.includes("image/png") ? "PNG" : "JPEG";
            const ix = 100 + (i - 4) * 56;
            pdf.addImage(img.base64, fmt, ix, 106, 50, 50);
            pdf.setFontSize(6.5); pdf.setTextColor(C.na); pdf.setFont("helvetica", "bold");
            pdf.text(labels[i] || "", ix, 160);
          }
        } catch {}
      }
    }

    colorBar(); footer(6, TP);
  }

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
  const [data, setData] = useState(null), [tab, setTab] = useState("b"), [brandLogo, setBL] = useState(null), [showExp, setSE] = useState(false), [pdfL, setPL] = useState(false), [loading, setL] = useState(false), [status, setSt] = useState(""), [error, setE] = useState(null), [showNew, setSN] = useState(false), [pending, setP] = useState(null), [hlC, setHlC] = useState({}), [shC, setShC] = useState({}), [bulSel, setBulSel] = useState({}), [bdgSel, setBdgSel] = useState({}), [curAsin, setCurAsin] = useState(""), [showHist, setShowHist] = useState(false), [listingImgs, setListingImgs] = useState([]), [productData, setPD] = useState(null), [txtDensity, setTD] = useState("normal");
  const fR = useRef(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [designerMode, setDesignerMode] = useState(null);
  const [presMode, setPresMode] = useState(null); // { briefing, productData, listingImgs, level }
  // Load briefing from shared URL on mount
  useState(() => { const hash = window.location.hash.slice(1);
    if (hash && hash.startsWith("d=")) { decodeBriefing(hash.slice(2)).then(d => { if (d?.briefing?.product) setDesignerMode(d); }); }
    else if (hash && hash.startsWith("p=")) { decodeBriefing(hash.slice(2)).then(d => { if (d?.briefing?.product) setPresMode(d); }); }
    else if (hash && hash.startsWith("b=")) { decodeBriefing(hash.slice(2)).then(d => { if (d?.product && d?.images) { setData(d); setTab("b"); } }); }
  });
  const shareDesignerLink = useCallback(async () => { if (!data) return; const payload = { briefing: data, selections: { hlC, shC, bulSel, bdgSel } }; const enc = await encodeBriefing(payload); if (enc) { const url = window.location.origin + window.location.pathname + "#d=" + enc; setShareUrl(url); try { await navigator.clipboard.writeText(url); } catch {} } }, [data, hlC, shC, bulSel, bdgSel]);
  const shareBriefing = useCallback(async () => { if (!data) return; const enc = await encodeBriefing(data); if (enc) { const url = window.location.origin + window.location.pathname + "#b=" + enc; setShareUrl(url); try { await navigator.clipboard.writeText(url); } catch {} } }, [data]);
  const go = useCallback(async (a, m, p, f) => {
    setL(true); setE(null); setSt("Starte...");
    try {
      // Step 1: Scrape Amazon data first (if ASIN provided)
      let scrapeResult = { images: [], productData: {} };
      if (a && a.trim()) { setSt("Lade Amazon-Daten..."); scrapeResult = await scrapeProduct(a, m); }
      // Step 2: Run AI analysis with scraped product data
      const result = await runAnalysis(a, m, p, f, setSt, scrapeResult.productData, txtDensity);
      setData(result); setTab("b"); setSN(false); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(a || ""); setListingImgs(scrapeResult.images); setPD({ ...scrapeResult.productData, imageCount: scrapeResult.images?.length || 0 }); saveH(result, a);
    } catch (e) { setE(e.message); }
    setL(false); setSt("");
  }, [txtDensity]);
  const goNew = useCallback((a, m, p, f) => { data ? setP({ a, m, p, f }) : go(a, m, p, f); }, [data, go]);
  // Standalone views (no app features visible)
  if (designerMode) return <DesignerView D={designerMode.briefing} selections={designerMode.selections} />;
  if (presMode) return <PresentationView briefing={presMode.briefing} productData={presMode.productData} listingImgs={presMode.listingImgs} level={presMode.level || 1} />;
  if ((!data && !showNew) || (showNew && !loading) || (loading && !data)) return <StartScreen onStart={data ? goNew : go} loading={loading} status={status} error={error} onDismiss={() => setE(null)} onLoad={(d, asin) => { setData(d); setTab("b"); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(asin || ""); setSN(false); }} txtDensity={txtDensity} setTD={setTD} />;
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs /><style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ ...glass, position: "sticky", top: 0, zIndex: 100, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 900 }}>Briefing Studio</div><div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.product?.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{data.product?.brand}{curAsin ? ` · ${curAsin}` : ""}</div></div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setSN(true)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Neues Briefing</button>
            <button onClick={() => setShowHist(p => !p)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10, position: "relative" }}>Verlauf</button>
            <input ref={fR} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setBL(ev.target.result); r.readAsDataURL(f); } }} />
            <button onClick={() => fR.current?.click()} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>{brandLogo ? "Logo ändern" : "Kundenlogo"}</button>
            <button onClick={shareBriefing} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Teilen</button>
            <button onClick={shareDesignerLink} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 16px ${V.violet}30` }}>Designer-Link</button>
            <button onClick={async () => { const payload = { type: "presentation", briefing: data, productData, listingImgs: listingImgs?.slice(0, 7)?.map(im => ({ base64: im.base64 })), level: 1 }; const enc = await encodeBriefing(payload); if (enc) { const url = window.location.origin + window.location.pathname + "#p=" + enc; setShareUrl(url); try { await navigator.clipboard.writeText(url); } catch {} } }} style={{ ...gS, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: V.textMed, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Kunden-Link</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "transparent", borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent", color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{t.l}</button>)}</div>
      </div></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {showHist && (() => { const hist = loadH(); return hist.length > 0 ? <GC style={{ padding: 0, marginBottom: 14 }}><div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl><button onClick={() => setShowHist(false)} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div><div style={{ padding: "6px 10px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", borderRadius: 10, cursor: "pointer" }} onClick={() => { setData(h.data); setTab("b"); setHlC({}); setShC({}); setBulSel({}); setBdgSel({}); setCurAsin(h.asin || ""); setShowHist(false); }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand}{h.asin ? ` · ${h.asin}` : ""} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC> : <GC style={{ padding: 16, marginBottom: 14, textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Noch keine gespeicherten Briefings.</span></GC>; })()}
        {tab === "b" && <BildBriefing D={data} hlC={hlC} setHlC={setHlC} shC={shC} setShC={setShC} bulSel={bulSel} setBulSel={setBulSel} bdgSel={bdgSel} setBdgSel={setBdgSel} listingImgs={listingImgs} />}
        {tab === "r" && <ReviewsTab D={data} />}
        {tab === "a" && <AnalyseTab D={data} lqs={calcLQS(productData)} />}
      </div>
      {shareUrl && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={() => setShareUrl(null)}><GC style={{ maxWidth: 520, width: "100%", padding: 28, background: "rgba(255,255,255,0.92)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing-Link</div><p style={{ fontSize: 12, color: V.textMed, margin: "0 0 14px" }}>Link wurde in die Zwischenablage kopiert.</p><input value={shareUrl} readOnly onClick={e => e.target.select()} style={{ ...inpS, fontSize: 11, textAlign: "center" }} /><button onClick={() => setShareUrl(null)} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Schließen</button></GC></div>}
      {pending && <OverwriteWarn name={data.product?.name || "Produkt"} onOk={() => { const p = pending; setP(null); setData(null); setSN(false); go(p.a, p.m, p.p, p.f); }} onNo={() => setP(null)} />}
    </div>
  );
}
