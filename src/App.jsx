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
function saveH(d) { const h = loadH(); h.unshift({ id: Date.now(), name: d.product?.name || "?", brand: d.product?.brand || "", date: new Date().toLocaleDateString("de-DE"), data: d }); if (h.length > MH) h.pop(); try { localStorage.setItem(HK, JSON.stringify(h)); } catch {} }

// ═══════ PROMPT ═══════
const buildPrompt = (asin, mp, pi, ft) => {
  const hasA = asin && asin.trim();
  return `Du bist ein erfahrener Amazon Listing Analyst. Analysiere gruendlich mit Web Search und liefere NUR valides JSON.

INPUT: ${hasA ? "ASIN: " + asin + " auf " : ""}${mp || "Amazon.de"}
${pi ? "Produkt: " + pi : ""}${ft ? "\nZusatz: " + ft : ""}

SCHRITTE: 1) Produkt+Wettbewerber suchen 2) Kategorie-Reviews analysieren 3) Keywords recherchieren ${hasA ? "4) Listing-Schwachstellen finden " : ""}5) 7-Bild-Briefing

HEADLINE-REGELN (SEHR WICHTIG):
- Max 25 Zeichen, keine Kommas, keine Gedankenstriche
- 3 Varianten pro Bild mit VERSCHIEDENEN Strategien:
  * Variante 1: Feature/USP DIREKT benennen (z.B. "Kapseln statt Pulver", "60kg Tragkraft", "Hergestellt in Koeln")
  * Variante 2: Konkreter Kundenvorteil, der in 1 Sekunde klar wird (z.B. "Kein Abmessen noetig", "Standfest auf Fliesen")
  * Variante 3: Emotionaler/kreativer Ansatz, NUR wenn sofort verstaendlich
- REGEL: Im Zweifel Feature direkt nennen. Wenn der Vorteil zu weit hergeholt ist oder nicht in 1 Sekunde klar wird, lieber das Feature/den USP direkt als Headline verwenden.
- Vermeide abstrakte/vage Headlines wie "Muehelose Power", "Einfach stark", "Dein Vorteil"

TEXTREGEL-BLACKLIST (niemals verwenden):
- Keine vulgaeren Ausdruecke
- Niemals "China" oder andere Laendernamen in negativem Kontext
- Keine reisserischen Vergleiche mit Wettbewerbern
- Keine unbelegten Prozentzahlen oder Statistiken in Bildtexten, AUSSER mit korrekter Fussnote
- Bei Fussnoten: Sternchen (*) direkt an die Aussage UND den Fussnotentext am Ende, z.B. "78% mehr Ausdauer*" mit Fussnote "*bei kurzen intensiven Belastungen, Studie XY"

BILDTEXTE ALLGEMEIN:
- Alle Bildtexte DEUTSCH, Concept/Rationale/Visual Notes ENGLISCH
- Keywords natuerlich integrieren
- Wenn ein Bild NUR eine Headline hat und keine weiteren Texte (Lifestyle-Bild), dann MUSS im "concept" und "visual" Feld GENAU beschrieben werden was im Lifestyle-Bild zu sehen sein soll (Szenerie, Personen, Stimmung, Kamerawinkel etc.)
- Badges IMMER als eigenes Feld mit Label kennzeichnen (z.B. ["BPA-frei", "CE-zertifiziert"])

BEWERTUNGEN:
- Relative Haeufigkeiten schaetzen
- WICHTIG: Die Prozentwerte muessen sich deutlich unterscheiden (nicht alle 30-35%). Sortiere absteigend und verteile realistisch, z.B. haeufigster Punkt 35%, seltenster 5%.

BILDLOGIK:
- Main Image: Kein Text. 3 Eyecatcher-Vorschlaege (Verpackung/Props/Badges/Hangtags).
- PT01: Klickbestaetigung. PT02: Differenzierung. PT03: Traumzustand/Lifestyle.
- PT04-PT06: Einwandbehandlung.
- Bei Lifestyle-Bildern ohne Text-Overlay: concept und visual DETAILLIERT beschreiben.

Negative Reviews: status solved/unclear/neutral + 1-2 Kundenzitate + Implikation.
Siegel: NUR beantragungspflichtige.
Kaufausloeser absteigend.
Keywords: used true/false markieren.

ANTWORT: NUR JSON. Keine Backticks. Kein Markdown.

{"product":{"name":"","brand":"","sku":"","marketplace":"","category":"","price":"","position":""},"audience":{"persona":"","desire":"","fear":"","triggers":["wichtigster zuerst"],"balance":""},"listingWeaknesses":${hasA ? '[{"weakness":"","impact":"high|medium|low","briefingAction":""}]' : 'null'},"reviews":{"source":"","estimated":true,"positive":[{"theme":"","pct":0}],"negative":[{"theme":"","pct":0,"quotes":[""],"status":"solved","implication":""}]},"keywords":{"volume":[{"kw":"","used":true}],"purchase":[{"kw":"","used":false}],"badges":[{"kw":"","note":"","requiresApplication":true}]},"competitive":{"patterns":"","gaps":[""]},"images":[{"id":"main","label":"Main Image","role":"SERP/CTR","concept":"english - DETAILLIERT","rationale":"english","eyecatchers":[{"idea":"deutsch","risk":"low|medium"},{"idea":"","risk":""},{"idea":"","risk":""}],"texts":null,"visual":"english - DETAILLIERT"},{"id":"pt01","label":"PT01","role":"","concept":"english","rationale":"english","texts":{"headlines":["Feature direkt","Kundenvorteil","Kreativ"],"subheadline":"oder null","bullets":["oder null"],"badges":["oder null"],"callouts":["oder null"],"footnotes":["*text oder null"]},"visual":"english"},{"id":"pt02","label":"PT02","role":"","concept":"","rationale":"","texts":{"headlines":["","",""],"subheadline":"","bullets":null,"badges":null,"callouts":null,"footnotes":null},"visual":""},{"id":"pt03","label":"PT03","role":"","concept":"DETAILLIERT wenn Lifestyle","rationale":"","texts":{"headlines":["","",""],"subheadline":null,"bullets":null,"badges":null,"callouts":null,"footnotes":null},"visual":"DETAILLIERT wenn Lifestyle"},{"id":"pt04","label":"PT04","role":"","concept":"","rationale":"","texts":{"headlines":["","",""],"subheadline":"","bullets":[""],"badges":null,"callouts":null,"footnotes":null},"visual":""},{"id":"pt05","label":"PT05","role":"","concept":"","rationale":"","texts":{"headlines":["","",""],"subheadline":"","bullets":null,"badges":null,"callouts":null,"footnotes":null},"visual":""},{"id":"pt06","label":"PT06","role":"","concept":"","rationale":"","texts":{"headlines":["","",""],"subheadline":"","bullets":[""],"badges":[""],"callouts":null,"footnotes":null},"visual":""}]}`;
};

// ═══════ API ═══════
async function runAnalysis(asin, mp, pi, ft, onS) {
  onS("Suche Produktdaten...");
  let r;
  try { r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: buildPrompt(asin, mp, pi, ft) }], tools: [{ type: "web_search_20250305", name: "web_search" }] }) }); }
  catch { throw new Error("Netzwerkfehler: API nicht erreichbar."); }
  if (!r.ok) { let m = "API " + r.status; try { const e = await r.json(); m += ": " + (e.error?.message || ""); } catch {} throw new Error(m); }
  onS("Analysiere Bewertungen...");
  const d = await r.json();
  const txt = d.content?.map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n");
  if (!txt) throw new Error("Keine Antwort.");
  onS("Erstelle Briefing...");
  const cl = txt.replace(/```json|```/g, "").trim();
  let p;
  try { p = JSON.parse(cl); } catch { const m = cl.match(/\{[\s\S]*\}/); if (m) { try { p = JSON.parse(m[0]); } catch { throw new Error("JSON Parse-Fehler."); } } else throw new Error("Kein JSON."); }
  if (!p.product || !p.images) throw new Error("Schema ungueltig.");
  return p;
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
          {hist.length > 0 && <GC style={{ padding: 0 }}><div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl c={V.textMed}>Letzte Briefings</Lbl></div><div style={{ padding: "8px 12px" }}>{hist.map(h => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", borderRadius: 10, cursor: "pointer" }} onClick={() => onLoad(h.data)} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{h.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{h.brand} · {h.date}</div></div><span style={{ fontSize: 11, color: V.violet, fontWeight: 700 }}>Laden →</span></div>)}</div></GC>}
        </div>
      </div>
    </div>
  );
}

function OverwriteWarn({ name, onOk, onNo }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onNo}><GC style={{ maxWidth: 440, width: "100%", padding: 28, background: "rgba(255,255,255,0.9)", textAlign: "center" }} onClick={e => e.stopPropagation()}><div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 8 }}>Briefing überschreiben?</div><p style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6, margin: "0 0 6px" }}>Das Briefing für <b>{name}</b> wird ersetzt.</p><p style={{ fontSize: 12, color: V.textDim, margin: "0 0 20px" }}>Die letzten {MH} Briefings bleiben abrufbar.</p><div style={{ display: "flex", gap: 8, justifyContent: "center" }}><button onClick={onNo} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textMed, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Abbrechen</button><button onClick={onOk} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.rose}, ${V.orange})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Überschreiben</button></div></GC></div>;
}

// ═══════ BILD-BRIEFING ═══════
function BildBriefing({ D, hlC, setHlC }) {
  const [sel, setSel] = useState(0);
  if (!D.images?.length) return null;
  const img = D.images[sel], te = img?.texts;
  const hls = te?.headlines || (te?.headline ? [te.headline] : []);
  const ci = hlC[img.id] ?? 0, curHl = hls[ci] || hls[0] || "";
  const allTxt = te ? [curHl, te.subheadline, ...(te.bullets || []), ...(te.badges || []), ...(te.callouts || [])].filter(Boolean).join("\n") : "";
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

// ═══════ PDF (imported jsPDF) ═══════
function exportPDF(D) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [338.67, 190.5] });
  const W = 338.67, H = 190.5;
  const tc = { or: "#FF9903", re: "#FF3130", na: "#023048", ic: "#CEE7F5", bg: "#F8F9FB", tm: "#5A6B80", td: "#8E9AAD", gr: "#1A8754" };
  const cb = () => { const b = 1.5; pdf.setFillColor(tc.or); pdf.rect(0, H - b, W / 4, b, "F"); pdf.setFillColor(tc.re); pdf.rect(W / 4, H - b, W / 4, b, "F"); pdf.setFillColor(tc.na); pdf.rect(W / 2, H - b, W / 4, b, "F"); pdf.setFillColor(tc.ic); pdf.rect(W * 3 / 4, H - b, W / 4, b, "F"); };
  const ft = (n, t) => { pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text("temoa GmbH", 20, H - 8); pdf.text(n + "/" + t, W - 20, H - 8, { align: "right" }); };
  const lb = (t, x, y, c) => { pdf.setFontSize(6.5); pdf.setTextColor(c || tc.or); pdf.setFont("helvetica", "bold"); pdf.text(t.toUpperCase(), x, y); };
  const hd = (t, x, y, sz) => { pdf.setFontSize(sz || 22); pdf.setTextColor(tc.na); pdf.setFont("helvetica", "bold"); pdf.text(String(t || ""), x, y); };
  const bd = (t, x, y, mw) => { pdf.setFontSize(8); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(String(t || ""), mw || 140), x, y); };
  const rr = (x, y, w, h, r, c) => { pdf.setFillColor(c); pdf.roundedRect(x, y, w, h, r, r, "F"); };
  const a = D.audience || {}, rv = D.reviews || { positive: [], negative: [] }, k = D.keywords || { volume: [], purchase: [] }, co = D.competitive || { gaps: [] };

  lb("temoa · Datenbasierte Listing-Analyse", 20, 22); hd(D.product?.name, 20, 38, 26); bd(D.product?.position, 20, 48, 240);
  [{ v: String(rv.positive.length + rv.negative.length), l: "Bewertungsthemen" }, { v: String((k.volume || []).length + (k.purchase || []).length), l: "Keywords" }, { v: String((D.images || []).length), l: "Bildslots" }].forEach((x, i) => { const kx = 20 + i * 70; rr(kx, 90, 62, 36, 3, tc.bg); pdf.setFontSize(18); pdf.setTextColor(tc.or); pdf.setFont("helvetica", "bold"); pdf.text(x.v, kx + 8, 108); pdf.setFontSize(6.5); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(x.l, kx + 8, 116); });
  cb(); ft(1, 5);

  pdf.addPage(); lb("Zielgruppe & Kaufausloeser", 20, 22); hd("Was treibt den Kauf?", 20, 36, 20);
  rr(20, 46, 140, 32, 3, "#ECFDF5"); lb("KERNWUNSCH", 26, 54, tc.gr); bd(a.desire, 26, 60, 128);
  rr(20, 82, 140, 32, 3, "#FFF0F0"); lb("KERNANGST", 26, 90, tc.re); bd(a.fear, 26, 96, 128);
  lb("KAUFAUSLOESER", 174, 50, tc.or);
  (a.triggers || []).slice(0, 6).forEach((t, i) => { pdf.setFontSize(7.5); pdf.setTextColor(tc.or); pdf.setFont("helvetica", "bold"); pdf.text(String(i + 1) + ".", 174, 58 + i * 10); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(t, 120), 184, 58 + i * 10); });
  cb(); ft(2, 5);

  pdf.addPage(); lb("Bewertungsanalyse", 20, 22); hd("Was Kunden sagen", 20, 36, 20);
  lb("POSITIV", 20, 50, tc.gr); const mp = Math.max(...rv.positive.map(x => x.pct || 0), 1); rv.positive.slice(0, 5).forEach((x, i) => { const ry = 56 + i * 14; pdf.setFontSize(7); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(String(x.theme), 20, ry, { maxWidth: 90 }); rr(115, ry - 3, 40, 3, 1, "#E8EAF0"); rr(115, ry - 3, (x.pct / mp) * 40, 3, 1, tc.gr); pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text("~" + x.pct + "%", 158, ry); });
  lb("NEGATIV", 186, 50, tc.re); const mn = Math.max(...rv.negative.map(x => x.pct || 0), 1); rv.negative.slice(0, 5).forEach((x, i) => { const ry = 56 + i * 14; pdf.setFontSize(7); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(String(x.theme), 186, ry, { maxWidth: 90 }); rr(280, ry - 3, 40, 3, 1, "#E8EAF0"); rr(280, ry - 3, (x.pct / mn) * 40, 3, 1, tc.re); pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text("~" + x.pct + "%", 323, ry); });
  cb(); ft(3, 5);

  pdf.addPage(); lb("Keywords & Differenzierung", 20, 22); hd("Was Kunden suchen", 20, 36, 20);
  lb("TOP KEYWORDS", 20, 50, tc.na); (k.volume || []).slice(0, 8).forEach((kw, i) => { const col = i % 4, row = Math.floor(i / 4); rr(20 + col * 38, 56 + row * 12, 35, 8, 2, "#0230480D"); pdf.setFontSize(6.5); pdf.setTextColor(tc.na); pdf.setFont("helvetica", "bold"); pdf.text(String(kw.kw), 22 + col * 38, 56 + row * 12 + 5.5); });
  lb("KAUFABSICHT", 20, 88, tc.or); (k.purchase || []).slice(0, 6).forEach((kw, i) => { const col = i % 3, row = Math.floor(i / 3); rr(20 + col * 52, 94 + row * 12, 49, 8, 2, "#FF990310"); pdf.setFontSize(6.5); pdf.setTextColor(tc.or); pdf.setFont("helvetica", "bold"); pdf.text(String(kw.kw), 22 + col * 52, 94 + row * 12 + 5.5, { maxWidth: 45 }); });
  lb("MARKTLUECKEN", 200, 50, tc.na); (co.gaps || []).slice(0, 4).forEach((g, i) => { pdf.setFontSize(7); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); pdf.text(pdf.splitTextToSize(g, 120), 207, 58 + i * 14); });
  cb(); ft(4, 5);

  pdf.addPage(); lb("Bildstrategie", 20, 22); hd((D.images || []).length + " Bilder. Jedes datenbasiert.", 20, 36, 20);
  (D.images || []).forEach((im, i) => { const col = i % 4, row = Math.floor(i / 4), bx = 20 + col * 76, by = 48 + row * 50; rr(bx, by, 72, 44, 3, tc.bg); pdf.setFontSize(7); pdf.setTextColor(tc.or); pdf.setFont("helvetica", "bold"); pdf.text(String(im.label || ""), bx + 6, by + 10); pdf.setFontSize(6); pdf.setTextColor(tc.na); pdf.text(String(im.role || ""), bx + 6, by + 16); pdf.setFontSize(6.5); pdf.setTextColor(tc.tm); pdf.setFont("helvetica", "normal"); const hl = im.texts?.headlines?.[0] || im.texts?.headline || "Nur visuell"; pdf.text(pdf.splitTextToSize(hl, 60), bx + 6, by + 24); });
  rr(20, 150, W - 40, 24, 3, "#EBF3F8"); pdf.setFontSize(8); pdf.setTextColor(tc.na); pdf.setFont("helvetica", "normal"); pdf.text("Jedes Bild basiert auf Datenanalyse: Bewertungen, Keywords, Wettbewerb.", 28, 164, { maxWidth: W - 56 });
  cb(); ft(5, 5);
  pdf.save("temoa_analyse_" + (D.product?.sku || "export") + ".pdf");
}

// ═══════ MAIN ═══════
const TABS = [{ id: "b", l: "Bild-Briefing" }, { id: "r", l: "Bewertungen" }, { id: "a", l: "Analyse" }];
export default function App() {
  const [data, setData] = useState(null), [tab, setTab] = useState("b"), [brandLogo, setBL] = useState(null), [showExp, setSE] = useState(false), [pdfL, setPL] = useState(false), [loading, setL] = useState(false), [status, setSt] = useState(""), [error, setE] = useState(null), [showNew, setSN] = useState(false), [pending, setP] = useState(null), [hlC, setHlC] = useState({});
  const fR = useRef(null);
  const go = useCallback(async (a, m, p, f) => { setL(true); setE(null); setSt("Starte..."); try { const r = await runAnalysis(a, m, p, f, setSt); setData(r); setTab("b"); setSN(false); setHlC({}); saveH(r); } catch (e) { setE(e.message); } setL(false); setSt(""); }, []);
  const goNew = useCallback((a, m, p, f) => { data ? setP({ a, m, p, f }) : go(a, m, p, f); }, [data, go]);
  if ((!data && !showNew) || (showNew && !loading) || (loading && !data)) return <StartScreen onStart={data ? goNew : go} loading={loading} status={status} error={error} onDismiss={() => setE(null)} onLoad={d => { setData(d); setTab("b"); setHlC({}); }} />;
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" /><Orbs /><style>{`@keyframes spin{to{transform:rotate(360deg)}} *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{ ...glass, position: "sticky", top: 0, zIndex: 100, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}><div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}><div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 900 }}>Briefing Studio</div><div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.product?.name}</div><div style={{ fontSize: 10, color: V.textDim }}>{data.product?.brand}</div></div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <button onClick={() => setSN(true)} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Neues Briefing</button>
            <input ref={fR} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setBL(ev.target.result); r.readAsDataURL(f); } }} />
            <button onClick={() => fR.current?.click()} style={{ ...gS, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>{brandLogo ? "Logo ändern" : "Kundenlogo"}</button>
            <button onClick={() => setSE(true)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN, boxShadow: `0 4px 16px ${V.violet}30` }}>Designer-Briefing</button>
            <button onClick={() => { setPL(true); try { exportPDF(data); } catch (e) { alert("PDF: " + e.message); } setPL(false); }} style={{ ...gS, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: V.textMed, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Kunden-PDF</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "transparent", borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent", color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>{t.l}</button>)}</div>
      </div></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {tab === "b" && <BildBriefing D={data} hlC={hlC} setHlC={setHlC} />}
        {tab === "r" && <ReviewsTab D={data} />}
        {tab === "a" && <AnalyseTab D={data} />}
      </div>
      {showExp && <BriefExport D={data} hlC={hlC} onClose={() => setSE(false)} />}
      {pending && <OverwriteWarn name={data.product?.name || "Produkt"} onOk={() => { const p = pending; setP(null); setData(null); setSN(false); go(p.a, p.m, p.p, p.f); }} onNo={() => setP(null)} />}
    </div>
  );
}
