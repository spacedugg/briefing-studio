import { useState, useRef, useCallback } from "react";
import { jsPDF } from "jspdf";

const MAX_HL = 25, FN = "'Outfit', system-ui, sans-serif";
const V = { violet: "#7C3AED", blue: "#2563EB", cyan: "#0891B2", teal: "#0D9488", emerald: "#059669", orange: "#EA580C", rose: "#E11D48", amber: "#D97706", ink: "#0F172A", text: "#334155", textMed: "#64748B", textDim: "#94A3B8" };
const glass = { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 18, boxShadow: "0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7)" };
const gS = { ...glass, background: "rgba(255,255,255,0.4)", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)" };
const BG = "linear-gradient(170deg, #f0f0ff 0%, #fff8f0 30%, #f0faf5 60%, #f8f0ff 100%)";
const Orbs = () => <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}><div style={{ position: "absolute", top: -80, right: -80, width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${V.violet}12, transparent 70%)` }} /><div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${V.cyan}10, transparent 70%)` }} /></div>;
const inpS = { width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.6)", fontFamily: FN, fontSize: 13, color: V.ink, outline: "none", boxSizing: "border-box" };

const HK = "briefing_history", MH = 3;
function loadH() { try { return JSON.parse(localStorage.getItem(HK) || "[]"); } catch { return []; } }
function saveH(d, asin) { const h = loadH(); h.unshift({ id: Date.now(), name: d.product?.name || "?", brand: d.product?.brand || "", asin: asin || d.product?.sku || "", date: new Date().toLocaleDateString("de-DE"), data: d }); if (h.length > MH) h.pop(); try { localStorage.setItem(HK, JSON.stringify(h)); } catch {} }

// ═══════ PROMPT ═══════
const buildPrompt = (asin, mp, pi, ft, productData) => {
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
  return `Analysiere ${hasA ? "ASIN " + asin + " auf " : ""}${mp || "Amazon.de"}. Erstelle 7-Bild-Briefing.
${pi ? "Produkt: " + pi : ""}${ft ? "\nHinweise: " + ft : ""}${scraped}
REGELN:
- Headlines: max 25 Zeichen, 3 Varianten (1:Feature/USP direkt, 2:Kundenvorteil, 3:Kreativ). Keine Kommas/Gedankenstriche. Konkret statt abstrakt.
- Bildtexte DE, Concept/Rationale/Visual EN. Keywords integrieren.
- Lifestyle ohne Text-Overlay: concept+visual DETAILLIERT (Szenerie, Personen, Stimmung, Kamera).
- Badges als eigenes Array. Fussnoten mit * kennzeichnen.
- Reviews: relative %, absteigend, deutlich unterschiedlich (nicht alle 30-35%).
- Blacklist: vulgaer, negative Laendernennung, Wettbewerber-Vergleiche, unbelegte Statistiken.
- Siegel: nur beantragungspflichtige. Kaufausloeser absteigend. Keywords: used true/false.

BILDER: Main(kein Text, 3 Eyecatcher mit risk:low/medium), PT01(STAERKSTER Kauftrigger), PT02(Differenzierung), PT03(Lifestyle/emotional), PT04-06(Einwandbehandlung neg. Reviews).

NUR JSON, keine Backticks/Markdown:
{product:{name,brand,sku,marketplace,category,price,position}, audience:{persona,desire,fear,triggers:[absteigend],balance}, listingWeaknesses:${hasA ? "[{weakness,impact:high/medium/low,briefingAction}]" : "null"}, reviews:{source,estimated:true, positive:[{theme,pct}], negative:[{theme,pct,quotes:[],status:solved/unclear/neutral,implication}]}, keywords:{volume:[{kw,used:bool}],purchase:[{kw,used:bool}],badges:[{kw,note,requiresApplication:bool}]}, competitive:{patterns,gaps:[]}, images:[7 Objekte mit id:main/pt01-pt06, label, role, concept(EN), rationale(EN), visual(EN), texts:{headlines:[3],subheadline,bullets[],badges[],callouts[],footnotes[]}|null, eyecatchers(nur main):[{idea(DE),risk}]]}`;
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
async function runAnalysis(asin, mp, pi, ft, onS, productData) {
  onS("Sende Analyse-Anfrage...");
  let r;
  try {
    r = await fetch("/api/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: "Amazon Listing Analyst. Antworte NUR mit validem JSON. Kein Markdown/Codeblocks/Text. Antwort beginnt mit { und endet mit }.",
        messages: [{ role: "user", content: buildPrompt(asin, mp, pi, ft, productData) }],
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

// ═══════ START ═══════
function StartScreen({ onStart, loading, status, error, onDismiss, onLoad }) {
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
function BildBriefing({ D, hlC, setHlC, listingImgs }) {
  const [sel, setSel] = useState(0);
  if (!D.images?.length) return null;
  const img = D.images[sel], te = img?.texts;
  const hls = te?.headlines || (te?.headline ? [te.headline] : []);
  const ci = hlC[img.id] ?? 0, curHl = hls[ci] || hls[0] || "";
  const allTxt = te ? [curHl, te.subheadline, ...(te.bullets || []), ...(te.badges || []), ...(te.callouts || [])].filter(Boolean).join("\n") : "";
  const curListingImg = listingImgs && listingImgs[sel] ? listingImgs[sel].base64 : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{D.images.map((im, i) => {
        const h = im.texts?.headlines || (im.texts?.headline ? [im.texts.headline] : []);
        const ov = h.some(x => x.length > MAX_HL);
        return <button key={i} onClick={() => setSel(i)} style={{ ...gS, padding: "9px 16px", background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(255,255,255,0.5)", color: sel === i ? "#fff" : ov ? V.rose : V.textDim, border: ov && sel !== i ? `1.5px solid ${V.rose}50` : sel === i ? "none" : "1px solid rgba(0,0,0,0.06)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12, boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "none" }}>{im.label}{ov ? " !" : ""}</button>;
      })}</div>
      <GC>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{img.label}</span><span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span></div>
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
            {/* SUBHEADLINE */}
            {te.subheadline && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><Pill c={V.blue}>SUBHEADLINE</Pill><CopyBtn text={te.subheadline} /></div><div style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6 }}>{te.subheadline}</div></div>}
            {/* BULLETS */}
            {te.bullets?.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><Pill c={V.teal}>BULLETS · {te.bullets.length}/5</Pill>{te.bullets.map((b, i) => <div key={i} style={{ display: "flex", gap: 10, marginTop: 10 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: V.violet, marginTop: 6, flexShrink: 0 }} /><span style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.6 }}>{b}</span></div>)}</div>}
            {/* BADGES */}
            {te.badges?.length > 0 && <div style={{ ...gS, padding: 14, marginBottom: 10 }}><Pill c={V.amber}>BADGES</Pill><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{te.badges.map((b, i) => <span key={i} style={{ padding: "5px 12px", borderRadius: 8, background: `${V.amber}12`, border: `1px solid ${V.amber}20`, fontSize: 12, fontWeight: 700, color: V.amber }}>{b}</span>)}</div></div>}
            {/* CALLOUTS */}
            {te.callouts?.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}><Pill c={V.cyan} s={{ marginRight: 4 }}>CALLOUTS</Pill>{te.callouts.map((c, i) => <Pill key={i} c={V.cyan}>{c}</Pill>)}</div>}
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

// ═══════ ANALYSE ═══════
function AnalyseTab({ D }) {
  const a = D.audience || {}, c = D.competitive || {}, k = D.keywords || {}, lw = D.listingWeaknesses;
  const ic = { high: V.rose, medium: V.amber, low: V.textDim };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14 }}>
      {lw?.length > 0 && <GC style={{ padding: 20, gridColumn: "1 / -1", background: `${V.rose}06` }}><Lbl c={V.rose}>Schwachstellen im aktuellen Listing</Lbl>{lw.map((w, i) => <div key={i} style={{ ...gS, padding: 14, marginBottom: 8, background: "rgba(255,255,255,0.6)", display: "flex", gap: 14 }}><Pill c={ic[w.impact] || V.textDim} s={{ flexShrink: 0 }}>{w.impact === "high" ? "Hoch" : w.impact === "medium" ? "Mittel" : "Gering"}</Pill><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, marginBottom: 4 }}>{w.weakness}</div><div style={{ fontSize: 12, color: V.emerald }}>→ {w.briefingAction}</div></div></div>)}</GC>}
      <GC style={{ padding: 20 }}><Lbl c={V.violet}>Zielgruppe</Lbl><p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{a.persona}</p>{a.desire && <div style={{ background: `${V.emerald}0A`, borderRadius: 12, padding: 12, marginBottom: 8 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.emerald }}>KERNWUNSCH</span><p style={{ fontSize: 12, color: V.emerald, lineHeight: 1.55, margin: "4px 0 0" }}>{a.desire}</p></div>}{a.fear && <div style={{ background: `${V.rose}0A`, borderRadius: 12, padding: 12 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.rose }}>KERNANGST</span><p style={{ fontSize: 12, color: V.rose, lineHeight: 1.55, margin: "4px 0 0" }}>{a.fear}</p></div>}</GC>
      <GC style={{ padding: 20, background: `${V.orange}06` }}><Lbl c={V.orange}>Kaufauslöser (nach Wichtigkeit)</Lbl>{(a.triggers || []).map((t, i) => { const s = 1 - i / Math.max((a.triggers?.length || 1) - 1, 1); return <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: `${V.orange}${Math.round(s * 12).toString(16).padStart(2, "0")}`, border: i === 0 ? `1px solid ${V.orange}25` : "1px solid transparent" }}><span style={{ color: V.orange, fontWeight: 800, fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 12.5, color: i === 0 ? V.ink : V.textMed, fontWeight: i === 0 ? 700 : 400, lineHeight: 1.55 }}>{t}</span></div>; })}{a.balance && <div style={{ marginTop: 10, padding: 10, background: `${V.orange}0A`, borderRadius: 10 }}><span style={{ fontSize: 11, fontWeight: 700, color: V.orange }}>{a.balance}</span></div>}</GC>
      <GC style={{ padding: 20 }}><Lbl c={V.blue}>Wettbewerbslandschaft</Lbl><p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{c.patterns}</p>{(c.gaps || []).length > 0 && <><span style={{ fontSize: 10, fontWeight: 800, color: V.cyan }}>MARKTLÜCKEN</span>{c.gaps.map((g, i) => <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}><span style={{ color: V.cyan, fontSize: 10, marginTop: 2 }}>◆</span><span style={{ fontSize: 12, color: V.textMed, lineHeight: 1.55 }}>{g}</span></div>)}</>}</GC>
      <GC style={{ padding: 20 }}><Lbl c={V.violet}>Keywords</Lbl>{(k.volume || []).length > 0 && <div style={{ marginBottom: 14 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.blue }}>SUCHVOLUMEN</span><div style={{ marginTop: 6 }}>{k.volume.map((kw, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: `${V.blue}14`, border: `1px solid ${V.blue}22`, margin: "0 5px 5px 0" }}><Check on={kw.used} /><span style={{ fontSize: 10.5, fontWeight: 700, color: V.blue }}>{kw.kw}</span></div>)}</div></div>}{(k.purchase || []).length > 0 && <div><span style={{ fontSize: 10, fontWeight: 800, color: V.orange }}>KAUFABSICHT</span><div style={{ marginTop: 6 }}>{k.purchase.map((kw, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: `${V.orange}14`, border: `1px solid ${V.orange}22`, margin: "0 5px 5px 0" }}><Check on={kw.used} /><span style={{ fontSize: 10.5, fontWeight: 700, color: V.orange }}>{kw.kw}</span></div>)}</div></div>}</GC>
      {(k.badges || []).filter(b => b.requiresApplication !== false).length > 0 && <GC style={{ padding: 20, gridColumn: "1 / -1" }}><Lbl c={V.amber}>Beantragungspflichtige Siegel</Lbl><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>{k.badges.filter(b => b.requiresApplication !== false).map((b, i) => <div key={i} style={{ ...gS, padding: 12, background: "rgba(255,255,255,0.5)" }}><span style={{ fontSize: 12, fontWeight: 800, color: V.amber }}>{b.kw}</span><p style={{ fontSize: 11, color: V.textDim, margin: "4px 0 0" }}>{b.note}</p></div>)}</div></GC>}
    </div>
  );
}

// ═══════ BRIEFING EXPORT ═══════
function genBrief(D, hlC) {
  let t = `AMAZON GALLERY IMAGE BRIEFING\n${"=".repeat(50)}\nProduct: ${D.product?.name} | ${D.product?.brand}\nMarketplace: ${D.product?.marketplace}\n\n`;
  (D.images || []).forEach(im => {
    t += `${"-".repeat(50)}\n${im.label} | ${im.role}\n${"-".repeat(50)}\nCONCEPT:\n${im.concept}\n\nRATIONALE:\n${im.rationale}\n`;
    if (im.eyecatchers?.length) t += `\nEYECATCHER IDEAS:\n${im.eyecatchers.map((e, i) => `  ${i + 1}. ${e.idea} [${e.risk}]`).join("\n")}\n`;
    if (im.texts) {
      const h = im.texts.headlines || (im.texts.headline ? [im.texts.headline] : []);
      const ci = hlC[im.id] ?? 0;
      t += "\nTEXTS (DE):\n";
      if (h.length) t += `  Headline: ${h[ci] || h[0]}\n`;
      if (h.length > 1) t += `  (Alternativen: ${h.filter((_, i) => i !== ci).join(" | ")})\n`;
      if (im.texts.subheadline) t += `  Subheadline: ${im.texts.subheadline}\n`;
      if (im.texts.bullets?.length) t += `  Bullets:\n${im.texts.bullets.map(b => "    - " + b).join("\n")}\n`;
      if (im.texts.badges?.length) t += `  Badges: ${im.texts.badges.join(" | ")}\n`;
      if (im.texts.callouts?.length) t += `  Callouts: ${im.texts.callouts.join(" | ")}\n`;
      if (im.texts.footnotes?.length) t += `  Footnotes: ${im.texts.footnotes.join(" | ")}\n`;
    } else { t += "\nTEXTS: None — visual-only image\n"; }
    t += `\nVISUAL NOTES:\n${im.visual}\n\n`;
  });
  return t;
}
function BriefExport({ D, hlC, onClose }) {
  const [t, st] = useState(() => genBrief(D, hlC));
  const [cp, sc] = useState(false);
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onClose}><div style={{ ...glass, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.88)" }} onClick={e => e.stopPropagation()}><div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 16, fontWeight: 800, color: V.ink }}>Designer-Briefing</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => { navigator.clipboard.writeText(t); sc(true); setTimeout(() => sc(false), 2000); }} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: cp ? V.emerald : `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{cp ? "Kopiert" : "Alles kopieren"}</button><button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Schließen</button></div></div><div style={{ padding: 18, flex: 1, overflow: "auto" }}><textarea value={t} onChange={e => st(e.target.value)} style={{ width: "100%", minHeight: 500, padding: 18, borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.75, color: V.text, resize: "vertical", outline: "none", boxSizing: "border-box" }} spellCheck={false} /></div></div></div>;
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
    const labels = ["Main", "PT01", "PT02", "PT03", "PT04", "PT05", "PT06"];

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
  const [data, setData] = useState(null), [tab, setTab] = useState("b"), [brandLogo, setBL] = useState(null), [showExp, setSE] = useState(false), [pdfL, setPL] = useState(false), [loading, setL] = useState(false), [status, setSt] = useState(""), [error, setE] = useState(null), [showNew, setSN] = useState(false), [pending, setP] = useState(null), [hlC, setHlC] = useState({}), [curAsin, setCurAsin] = useState(""), [showHist, setShowHist] = useState(false), [listingImgs, setListingImgs] = useState([]);
  const fR = useRef(null);
  const go = useCallback(async (a, m, p, f) => {
    setL(true); setE(null); setSt("Starte...");
    try {
      // Step 1: Scrape Amazon data first (if ASIN provided)
      let scrapeResult = { images: [], productData: {} };
      if (a && a.trim()) { setSt("Lade Amazon-Daten..."); scrapeResult = await scrapeProduct(a, m); }
      // Step 2: Run AI analysis with scraped product data
      const result = await runAnalysis(a, m, p, f, setSt, scrapeResult.productData);
      setData(result); setTab("b"); setSN(false); setHlC({}); setCurAsin(a || ""); setListingImgs(scrapeResult.images); saveH(result, a);
    } catch (e) { setE(e.message); }
    setL(false); setSt("");
  }, []);
  const goNew = useCallback((a, m, p, f) => { data ? setP({ a, m, p, f }) : go(a, m, p, f); }, [data, go]);
  if ((!data && !showNew) || (showNew && !loading) || (loading && !data)) return <StartScreen onStart={data ? goNew : go} loading={loading} status={status} error={error} onDismiss={() => setE(null)} onLoad={(d, asin) => { setData(d); setTab("b"); setHlC({}); setCurAsin(asin || ""); setSN(false); }} />;
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
            <button onClick={() => setSE(true)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 16px ${V.violet}30` }}>Designer-Briefing</button>
            <button onClick={() => { setPL(true); try { exportPDF(data, listingImgs); } catch (e) { alert("PDF: " + e.message); } setPL(false); }} style={{ ...gS, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: V.textMed, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Kunden-PDF</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "transparent", borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent", color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{t.l}</button>)}</div>
      </div></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {showHist && (() => { const hist = loadH(); return hist.length > 0 ? <GC style={{ padding: 0, marginBottom: 14 }}><div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl><button onClick={() => setShowHist(false)} style={{ background: "none", border: "none", color: V.textDim, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button></div><div style={{ padding: "6px 10px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", borderRadius: 10, cursor: "pointer" }} onClick={() => { setData(h.data); setTab("b"); setHlC({}); setCurAsin(h.asin || ""); setShowHist(false); }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand}{h.asin ? ` · ${h.asin}` : ""} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC> : <GC style={{ padding: 16, marginBottom: 14, textAlign: "center" }}><span style={{ fontSize: 12, color: V.textDim }}>Noch keine gespeicherten Briefings.</span></GC>; })()}
        {tab === "b" && <BildBriefing D={data} hlC={hlC} setHlC={setHlC} listingImgs={listingImgs} />}
        {tab === "r" && <ReviewsTab D={data} />}
        {tab === "a" && <AnalyseTab D={data} />}
      </div>
      {showExp && <BriefExport D={data} hlC={hlC} onClose={() => setSE(false)} />}
      {pending && <OverwriteWarn name={data.product?.name || "Produkt"} onOk={() => { const p = pending; setP(null); setData(null); setSN(false); go(p.a, p.m, p.p, p.f); }} onNo={() => setP(null)} />}
    </div>
  );
}
