import { useState, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MAX_HL = 25;
const FN = "'Outfit', system-ui, sans-serif";

const V = {
  violet: "#7C3AED", blue: "#2563EB", cyan: "#0891B2", teal: "#0D9488",
  emerald: "#059669", orange: "#EA580C", rose: "#E11D48", pink: "#DB2777",
  amber: "#D97706", ink: "#0F172A", text: "#334155", textMed: "#64748B", textDim: "#94A3B8",
};

const glass = {
  background: "rgba(255,255,255,0.55)",
  backdropFilter: "blur(20px) saturate(1.8)",
  WebkitBackdropFilter: "blur(20px) saturate(1.8)",
  border: "1px solid rgba(255,255,255,0.65)",
  borderRadius: 18,
  boxShadow: "0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
};
const glassSub = { ...glass, background: "rgba(255,255,255,0.4)", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)" };

const BG = "linear-gradient(170deg, #f0f0ff 0%, #fff8f0 30%, #f0faf5 60%, #f8f0ff 100%)";

const Orbs = () => (
  <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
    <div style={{ position: "absolute", top: -80, right: -80, width: 350, height: 350, borderRadius: "50%", background: `radial-gradient(circle, ${V.violet}12, transparent 70%)` }} />
    <div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${V.cyan}10, transparent 70%)` }} />
    <div style={{ position: "absolute", top: "40%", left: "50%", width: 250, height: 250, borderRadius: "50%", background: `radial-gradient(circle, ${V.orange}08, transparent 70%)` }} />
  </div>
);

// ═══════════════════════════════════════════════════════════════
// ANALYSIS PROMPT
// ═══════════════════════════════════════════════════════════════

const buildPrompt = (asin, marketplace, productInfo, freetext) => `Du bist ein Amazon Listing Analyst für eine Agentur die Produktbilder erstellt. Analysiere folgendes Produkt und liefere ein strukturiertes JSON zurück.

PRODUKT-INPUT:
${asin ? `ASIN: ${asin}` : ""}
${marketplace ? `Marktplatz: ${marketplace}` : "Marktplatz: Amazon.de"}
${productInfo ? `Produktinfos: ${productInfo}` : ""}
${freetext ? `Zusätzliche Infos: ${freetext}` : ""}

AUFGABE:
1. Suche das Produkt und die Top-Wettbewerber auf Amazon
2. Analysiere Bewertungen der Kategorie (positive und negative Themen mit geschätzter Häufigkeit)
3. Identifiziere relevante Keywords (Suchvolumen-Keywords und Kaufabsicht-Keywords)
4. Erstelle ein 7-Bild Briefing (Main Image + PT01-PT06) mit deutschen Bildtexten

REGELN FÜR BILDTEXTE:
- Headlines: MAXIMAL 25 Zeichen, keine Kommas, keine Gedankenstriche
- Subheadlines: kurz bis mittel
- Max 5 Bullets pro Bild
- Keine Faktenwiederholung über Bilder hinweg (außer Kern-USP: einmal prominent + einmal subtil)
- Alle Texte auf Deutsch, natürlich formuliert
- Keywords natürlich integrieren, kein Stuffing

BILDLOGIK:
- Main Image: Rein visuell, kein Text (Amazon Richtlinie). CTR auf SERP maximieren.
- PT01: Klickbestätigung. Die 2 wichtigsten Kaufgründe: Wunschergebnis + stärkster Vertrauensbeweis.
- PT02: Zweitwichtigstes Verkaufsargument als Differenzierungsfaktor.
- PT03: Zentraler Nutzen emotional visualisieren. Traumzustand des Kunden. Vorher/Nachher wenn passend.
- PT04-PT06: Einwandbehandlung. Kaufzweifel beseitigen basierend auf negativen Reviews, Retourengründen.

Für negative Bewertungsthemen: Bewerte ob unser Produkt das Problem LÖST ("solved"), ob es UNKLAR ist ("unclear"), oder ob es NICHT RELEVANT ist ("neutral").

ANTWORT: NUR valides JSON, kein Markdown, keine Erklärung, keine Backticks. Exakt dieses Schema:

{"product":{"name":"string","brand":"string","sku":"string","marketplace":"string","category":"string","price":"string","position":"string 2-3 Sätze"},"audience":{"persona":"string","desire":"string","fear":"string","triggers":["string"],"balance":"string"},"reviews":{"source":"string","positive":[{"theme":"string","count":0,"pct":0}],"negative":[{"theme":"string","count":0,"pct":0,"status":"solved|unclear|neutral","action":"string"}]},"keywords":{"volume":[{"kw":"string"}],"purchase":[{"kw":"string"}],"badges":[{"kw":"string","note":"string"}]},"competitive":{"patterns":"string","gaps":["string"]},"images":[{"id":"main","label":"Main Image","role":"string","concept":"string english","rationale":"string english","texts":null,"visual":"string english"},{"id":"pt01","label":"PT01","role":"string","concept":"string english","rationale":"string english","texts":{"headline":"max 25 chars DEUTSCH","subheadline":"string|null","bullets":["string"],"badges":["string"],"callouts":["string"]},"visual":"string english"},{"id":"pt02","label":"PT02","role":"string","concept":"string","rationale":"string","texts":{"headline":"max 25 chars DE","subheadline":"string|null","bullets":null,"badges":null,"callouts":null},"visual":"string"},{"id":"pt03","label":"PT03","role":"string","concept":"string","rationale":"string","texts":{"headline":"max 25 chars DE","subheadline":"string|null","bullets":null,"badges":null,"callouts":["string"]|null},"visual":"string"},{"id":"pt04","label":"PT04","role":"string","concept":"string","rationale":"string","texts":{"headline":"max 25 chars DE","subheadline":"string|null","bullets":["string"],"badges":null,"callouts":null},"visual":"string"},{"id":"pt05","label":"PT05","role":"string","concept":"string","rationale":"string","texts":{"headline":"max 25 chars DE","subheadline":"string|null","bullets":null,"badges":null,"callouts":null},"visual":"string"},{"id":"pt06","label":"PT06","role":"string","concept":"string","rationale":"string","texts":{"headline":"max 25 chars DE","subheadline":"string|null","bullets":["string"],"badges":["string"],"callouts":null},"visual":"string"}]}`;

// ═══════════════════════════════════════════════════════════════
// API CALL
// ═══════════════════════════════════════════════════════════════

async function runAnalysis(asin, marketplace, productInfo, freetext, onStatus) {
  onStatus("Suche Produktdaten und Wettbewerber...");

  let response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: buildPrompt(asin, marketplace, productInfo, freetext) }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
  } catch (networkErr) {
    throw new Error("Netzwerkfehler: API nicht erreichbar. Prüfe deine Verbindung.");
  }

  if (!response.ok) {
    let errMsg = `API Fehler ${response.status}`;
    try { const errBody = await response.json(); errMsg += `: ${errBody.error?.message || JSON.stringify(errBody)}`; } catch {}
    throw new Error(errMsg);
  }

  onStatus("Analysiere Bewertungen und Keywords...");

  const data = await response.json();

  const fullText = data.content
    ?.map(item => (item.type === "text" ? item.text : ""))
    .filter(Boolean)
    .join("\n");

  if (!fullText) {
    throw new Error("Keine verwertbare Antwort erhalten. Content-Blocks: " + JSON.stringify(data.content?.map(c => c.type)));
  }

  onStatus("Erstelle Briefing...");

  const cleaned = fullText.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) {
        throw new Error("JSON konnte nicht geparst werden. Erneut versuchen.");
      }
    } else {
      throw new Error("Antwort enthält kein valides JSON. Erneut versuchen.");
    }
  }

  // Basic validation
  if (!parsed.product || !parsed.images || !Array.isArray(parsed.images)) {
    throw new Error("Antwort-Schema ungültig. Erneut versuchen.");
  }

  return parsed;
}

// ═══════════════════════════════════════════════════════════════
// MICRO COMPONENTS
// ═══════════════════════════════════════════════════════════════

const Pill = ({ children, color = V.violet }) => (
  <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 20, background: `${color}14`, color, fontSize: 10.5, fontWeight: 700, border: `1px solid ${color}22` }}>{children}</span>
);

const CopyBtn = ({ text, label }) => {
  const [ok, s] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(text); s(true); setTimeout(() => s(false), 1200); }} style={{ ...glassSub, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: ok ? "#fff" : V.textMed, cursor: "pointer", fontFamily: FN, background: ok ? V.emerald : "rgba(255,255,255,0.5)", border: ok ? `1px solid ${V.emerald}` : "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}>{ok ? "Kopiert" : (label || "Kopieren")}</button>;
};

const Bar = ({ pct, color, h = 6 }) => (
  <div style={{ flex: 1, height: h, background: "rgba(0,0,0,0.06)", borderRadius: 99, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(pct * 2.5, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}BB)`, borderRadius: 99, transition: "width .6s cubic-bezier(.4,0,.2,1)" }} />
  </div>
);

const GlassCard = ({ children, style = {}, onClick }) => <div style={{ ...glass, ...style }} onClick={onClick}>{children}</div>;
const Lbl = ({ children, color = V.violet }) => <div style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;

const inputStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.6)", fontFamily: FN, fontSize: 13, color: V.ink,
  outline: "none", backdropFilter: "blur(10px)",
};

const ErrorBox = ({ msg, onDismiss }) => msg ? (
  <div style={{ ...glassSub, padding: "12px 18px", background: `${V.rose}10`, border: `1px solid ${V.rose}25`, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <span style={{ fontSize: 12, color: V.rose, fontWeight: 600 }}>{msg}</span>
    {onDismiss && <button onClick={onDismiss} style={{ background: "none", border: "none", color: V.rose, fontWeight: 800, cursor: "pointer", fontFamily: FN, fontSize: 14 }}>×</button>}
  </div>
) : null;

// ═══════════════════════════════════════════════════════════════
// START SCREEN
// ═══════════════════════════════════════════════════════════════

function StartScreen({ onStart, loading, status, error, onDismissError }) {
  const [asin, setAsin] = useState("");
  const [marketplace, setMarketplace] = useState("Amazon.de");
  const [productInfo, setProductInfo] = useState("");
  const [freetext, setFreetext] = useState("");
  const canStart = asin.trim() || productInfo.trim();

  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Orbs />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 24, position: "relative", zIndex: 1 }}>
        <GlassCard style={{ maxWidth: 580, width: "100%", padding: 0 }}>
          <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Neues Briefing</div>
            <p style={{ fontSize: 13, color: V.textMed, margin: 0, lineHeight: 1.6 }}>ASIN eingeben oder Produktinfos beschreiben. Die Analyse läuft automatisch über Web Search.</p>
          </div>
          <div style={{ padding: "20px 32px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <ErrorBox msg={error} onDismiss={onDismissError} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 5, display: "block" }}>ASIN (optional)</label>
                <input type="text" autoComplete="off" value={asin} onChange={e => setAsin(e.target.value)} placeholder="z.B. B0CX7K9QDR" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 5, display: "block" }}>Marktplatz</label>
                <select value={marketplace} onChange={e => setMarketplace(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {["Amazon.de","Amazon.com","Amazon.co.uk","Amazon.fr","Amazon.it","Amazon.es"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 5, display: "block" }}>Produktbeschreibung</label>
              <textarea value={productInfo} onChange={e => setProductInfo(e.target.value)} placeholder="Was ist das Produkt? Features, Materialien, Zielgruppe, USPs..." rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: V.textMed, marginBottom: 5, display: "block" }}>Zusätzliche Hinweise (optional)</label>
              <textarea value={freetext} onChange={e => setFreetext(e.target.value)} placeholder="Besondere Wünsche, Wettbewerber-ASINs, Markenwerte, Tonalität..." rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <button
              onClick={() => canStart && !loading && onStart(asin, marketplace, productInfo, freetext)}
              disabled={!canStart || loading}
              style={{
                padding: "14px 24px", borderRadius: 14, border: "none",
                background: loading ? `linear-gradient(135deg, ${V.violet}80, ${V.blue}80)` : canStart ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(0,0,0,0.08)",
                color: canStart || loading ? "#fff" : V.textDim,
                fontSize: 14, fontWeight: 800, cursor: canStart && !loading ? "pointer" : "default",
                fontFamily: FN, boxShadow: canStart ? `0 4px 20px ${V.violet}35` : "none",
              }}
            >
              {loading ? "Analyse läuft..." : "Analyse starten"}
            </button>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, border: `2px solid ${V.violet}30`, borderTopColor: V.violet, borderRadius: 99, animation: "spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 12, color: V.violet, fontWeight: 600 }}>{status}</span>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERWRITE WARNING
// ═══════════════════════════════════════════════════════════════

function OverwriteWarning({ productName, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onCancel}>
      <GlassCard style={{ maxWidth: 420, width: "100%", padding: 28, background: "rgba(255,255,255,0.88)", textAlign: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 800, color: V.ink, marginBottom: 10 }}>Briefing überschreiben?</div>
        <p style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6, margin: "0 0 20px" }}>
          Das aktuelle Briefing für <b style={{ color: V.ink }}>{productName}</b> geht verloren. Exportiere es vorher, falls nötig.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textMed, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Abbrechen</button>
          <button onClick={onConfirm} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.rose}, ${V.orange})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>Überschreiben</button>
        </div>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD TABS
// ═══════════════════════════════════════════════════════════════

function BildBriefing({ D }) {
  const [sel, setSel] = useState(0);
  if (!D.images?.length) return <div style={{ padding: 20, color: V.textDim }}>Keine Bilddaten vorhanden.</div>;
  const img = D.images[sel];
  const te = img?.texts;
  const allText = te ? [te.headline, te.subheadline, ...(te.bullets || []), ...(te.badges || []), ...(te.callouts || [])].filter(Boolean).join("\n") : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {D.images.map((im, i) => {
          const over = im.texts?.headline?.length > MAX_HL;
          return (
            <button key={i} onClick={() => setSel(i)} style={{
              ...glassSub, padding: "9px 16px",
              background: sel === i ? `linear-gradient(135deg, ${V.violet}, ${V.blue})` : "rgba(255,255,255,0.5)",
              color: sel === i ? "#fff" : over ? V.rose : V.textDim,
              border: over && sel !== i ? `1.5px solid ${V.rose}50` : sel === i ? "none" : "1px solid rgba(0,0,0,0.06)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN, whiteSpace: "nowrap", borderRadius: 12,
              boxShadow: sel === i ? `0 4px 20px ${V.violet}40` : "0 2px 8px rgba(0,0,0,0.04)",
            }}>{im.label || `Bild ${i + 1}`}{over ? " !" : ""}</button>
          );
        })}
      </div>
      <GlassCard>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{img.label}</span>
            <span style={{ fontSize: 12, color: V.textDim }}>{img.role}</span>
          </div>
          {te && <CopyBtn text={allText} label="Alle Texte" />}
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {img.concept && <div><Lbl color={V.blue}>Bildkonzept</Lbl><p style={{ fontSize: 13, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.concept}</p></div>}
          {img.rationale && (
            <div style={{ background: `linear-gradient(135deg, ${V.violet}08, ${V.blue}08)`, borderRadius: 14, padding: 16, border: `1px solid ${V.violet}12` }}>
              <Lbl color={V.violet}>Strategische Begründung</Lbl>
              <p style={{ fontSize: 12.5, color: V.text, lineHeight: 1.75, margin: 0 }}>{img.rationale}</p>
            </div>
          )}
          {te ? (
            <div>
              <Lbl color={V.orange}>Bildtexte (Deutsch)</Lbl>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {te.headline && (() => {
                  const over = te.headline.length > MAX_HL;
                  return (
                    <div style={{ ...glassSub, padding: 14, background: over ? `${V.rose}08` : "rgba(255,255,255,0.45)", border: over ? `1px solid ${V.rose}30` : "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Pill color={V.orange}>HEADLINE</Pill>
                          <span style={{ fontSize: 10, fontWeight: 700, color: over ? V.rose : V.textDim }}>{te.headline.length}/{MAX_HL}{over ? ` (+${te.headline.length - MAX_HL})` : ""}</span>
                        </div>
                        <CopyBtn text={te.headline} />
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: V.ink }}>{te.headline}</div>
                    </div>
                  );
                })()}
                {te.subheadline && (
                  <div style={{ ...glassSub, padding: 14, background: "rgba(255,255,255,0.45)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <Pill color={V.blue}>SUBHEADLINE · {te.subheadline.length} Z.</Pill>
                      <CopyBtn text={te.subheadline} />
                    </div>
                    <div style={{ fontSize: 13, color: V.textMed, lineHeight: 1.6 }}>{te.subheadline}</div>
                  </div>
                )}
                {te.bullets?.length > 0 && (
                  <div style={{ ...glassSub, padding: 14, background: "rgba(255,255,255,0.45)" }}>
                    <Pill color={V.teal}>BULLETS · {te.bullets.length}/5</Pill>
                    {te.bullets.map((b, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, marginTop: 6, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.6 }}>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {te.badges?.map((b, i) => <Pill key={i} color={V.amber}>{b}</Pill>)}
                  {te.callouts?.map((c, i) => <Pill key={i} color={V.cyan}>{c}</Pill>)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, ...glassSub, borderStyle: "dashed", textAlign: "center" }}>
              <span style={{ fontSize: 12, color: V.textDim }}>Kein Text-Overlay. Main Image ist rein visuell (Amazon Richtlinie).</span>
            </div>
          )}
          {img.visual && (
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 14 }}>
              <Lbl color={V.textDim}>Visuelle Hinweise für Designer</Lbl>
              <p style={{ fontSize: 12, color: V.textDim, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{img.visual}</p>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function ReviewsTab({ D }) {
  const r = D.reviews || { source: "", positive: [], negative: [] };
  const sc = { solved: V.emerald, unclear: V.amber, neutral: V.textDim };
  const sl = { solved: "Gelöst", unclear: "Prüfen", neutral: "Neutral" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {r.source && <div style={{ ...glassSub, padding: 14 }}><span style={{ fontSize: 12, color: V.textMed }}><b style={{ color: V.violet }}>Datenquelle:</b> {r.source}</span></div>}
      <GlassCard>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl color={V.emerald}>Positive Bewertungsthemen</Lbl></div>
        <div style={{ padding: "14px 20px" }}>
          {r.positive.map((x, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: V.text, width: 240, flexShrink: 0 }}>{x.theme}</span>
              <Bar pct={x.pct} color={V.emerald} />
              <span style={{ fontSize: 11, color: V.textDim, width: 70, textAlign: "right", flexShrink: 0, fontWeight: 600 }}>{x.count}× · {x.pct}%</span>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}><Lbl color={V.rose}>Negative Bewertungsthemen & Produktstatus</Lbl></div>
        <div style={{ padding: "14px 20px" }}>
          {r.negative.map((x, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < r.negative.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: V.text, width: 240, flexShrink: 0 }}>{x.theme}</span>
                <Bar pct={x.pct} color={V.rose} />
                <span style={{ fontSize: 11, color: V.textDim, width: 70, textAlign: "right", flexShrink: 0, fontWeight: 600 }}>{x.count}× · {x.pct}%</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Pill color={sc[x.status] || V.textDim}>{sl[x.status] || x.status}</Pill>
                <span style={{ fontSize: 11, color: V.textMed, lineHeight: 1.55 }}>{x.action}</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function AnalyseTab({ D }) {
  const a = D.audience || {}; const c = D.competitive || {}; const k = D.keywords || {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14 }}>
      <GlassCard style={{ padding: 20 }}>
        <Lbl color={V.violet}>Zielgruppe</Lbl>
        <p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{a.persona}</p>
        {a.desire && <div style={{ background: `${V.emerald}0A`, borderRadius: 12, padding: 12, marginBottom: 8, border: `1px solid ${V.emerald}15` }}><span style={{ fontSize: 10, fontWeight: 800, color: V.emerald }}>KERNWUNSCH</span><p style={{ fontSize: 12, color: V.emerald, lineHeight: 1.55, margin: "4px 0 0" }}>{a.desire}</p></div>}
        {a.fear && <div style={{ background: `${V.rose}0A`, borderRadius: 12, padding: 12, border: `1px solid ${V.rose}15` }}><span style={{ fontSize: 10, fontWeight: 800, color: V.rose }}>KERNANGST</span><p style={{ fontSize: 12, color: V.rose, lineHeight: 1.55, margin: "4px 0 0" }}>{a.fear}</p></div>}
      </GlassCard>
      <GlassCard style={{ padding: 20 }}>
        <Lbl color={V.orange}>Kaufauslöser</Lbl>
        {(a.triggers || []).map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <span style={{ color: V.orange, fontWeight: 800, fontSize: 14 }}>→</span>
            <span style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.55 }}>{t}</span>
          </div>
        ))}
        {a.balance && <div style={{ marginTop: 10, padding: 10, background: `${V.orange}0A`, borderRadius: 10, border: `1px solid ${V.orange}15` }}><span style={{ fontSize: 11, fontWeight: 700, color: V.orange }}>Balance: {a.balance}</span></div>}
      </GlassCard>
      <GlassCard style={{ padding: 20 }}>
        <Lbl color={V.blue}>Wettbewerbslandschaft</Lbl>
        <p style={{ fontSize: 12.5, color: V.textMed, lineHeight: 1.65, margin: "0 0 12px" }}>{c.patterns}</p>
        {(c.gaps || []).length > 0 && <><span style={{ fontSize: 10, fontWeight: 800, color: V.cyan }}>MARKTLÜCKEN</span>{c.gaps.map((g, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 8 }}><span style={{ color: V.cyan, fontSize: 10, marginTop: 2 }}>◆</span><span style={{ fontSize: 12, color: V.textMed, lineHeight: 1.55 }}>{g}</span></div>
        ))}</>}
      </GlassCard>
      <GlassCard style={{ padding: 20 }}>
        <Lbl color={V.violet}>Keywords</Lbl>
        {(k.volume || []).length > 0 && <div style={{ marginBottom: 12 }}><span style={{ fontSize: 10, fontWeight: 800, color: V.blue }}>SUCHVOLUMEN</span><div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>{k.volume.map((kw, i) => <Pill key={i} color={V.blue}>{kw.kw}</Pill>)}</div></div>}
        {(k.purchase || []).length > 0 && <div><span style={{ fontSize: 10, fontWeight: 800, color: V.orange }}>KAUFABSICHT</span><div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>{k.purchase.map((kw, i) => <Pill key={i} color={V.orange}>{kw.kw}</Pill>)}</div></div>}
      </GlassCard>
      {(k.badges || []).length > 0 && (
        <GlassCard style={{ padding: 20, gridColumn: "1 / -1", background: `linear-gradient(135deg, ${V.amber}08, ${V.orange}06)` }}>
          <Lbl color={V.amber}>Siegel-Signale (intern)</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {k.badges.map((b, i) => (
              <div key={i} style={{ ...glassSub, padding: 12, background: "rgba(255,255,255,0.5)" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: V.amber }}>{b.kw}</span>
                <p style={{ fontSize: 11, color: V.textDim, margin: "4px 0 0" }}>{b.note}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BRIEFING EXPORT
// ═══════════════════════════════════════════════════════════════

function generateBriefingText(D) {
  let t = `AMAZON GALLERY IMAGE BRIEFING\n${"═".repeat(50)}\nProduct: ${D.product?.name} | ${D.product?.brand} | ${D.product?.sku || "N/A"}\nMarketplace: ${D.product?.marketplace}\n\n`;
  (D.images || []).forEach(im => {
    t += `${"─".repeat(50)}\n${im.label} | ${im.role}\n${"─".repeat(50)}\nCONCEPT:\n${im.concept}\n\nRATIONALE:\n${im.rationale}\n`;
    if (im.texts) {
      t += `\nTEXTS (DE):\n`;
      if (im.texts.headline) t += `  Headline: ${im.texts.headline}  [${im.texts.headline.length}/${MAX_HL}]\n`;
      if (im.texts.subheadline) t += `  Subheadline: ${im.texts.subheadline}\n`;
      if (im.texts.bullets?.length) t += `  Bullets:\n${im.texts.bullets.map(b => `    • ${b}`).join("\n")}\n`;
      if (im.texts.badges?.length) t += `  Badges: ${im.texts.badges.join(" | ")}\n`;
      if (im.texts.callouts?.length) t += `  Callouts: ${im.texts.callouts.join(" | ")}\n`;
    } else { t += `\nTEXTS: None (visual only)\n`; }
    t += `\nVISUAL NOTES:\n${im.visual}\n\n`;
  });
  return t;
}

function BriefingExport({ D, onClose }) {
  const [text, setText] = useState(() => generateBriefingText(D));
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center", padding: 24 }} onClick={onClose}>
      <div style={{ ...glass, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.88)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: V.ink }}>Designer-Briefing</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: copied ? V.emerald : `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN }}>{copied ? "Kopiert" : "Alles kopieren"}</button>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.5)", color: V.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FN }}>Schließen</button>
          </div>
        </div>
        <div style={{ padding: 18, flex: 1, overflow: "auto" }}>
          <textarea value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", minHeight: 500, padding: 18, borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono','SF Mono',monospace", fontSize: 12, lineHeight: 1.75, color: V.text, resize: "vertical", outline: "none" }} spellCheck={false} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PDF EXPORT — temoa CI
// ═══════════════════════════════════════════════════════════════

async function exportPDF(D) {
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";
  document.head.appendChild(s);
  await new Promise(r => { s.onload = r; s.onerror = () => r(); });
  if (!window.jspdf) throw new Error("PDF-Bibliothek konnte nicht geladen werden.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [338.67, 190.5] });
  const W = 338.67, H = 190.5;
  const tc = { or: "#FF9903", re: "#FF3130", na: "#023048", ic: "#CEE7F5", bg: "#F8F9FB", tm: "#5A6B80", td: "#8E9AAD", gr: "#1A8754" };

  const cb = () => { const b=1.5; pdf.setFillColor(tc.or); pdf.rect(0,H-b,W/4,b,"F"); pdf.setFillColor(tc.re); pdf.rect(W/4,H-b,W/4,b,"F"); pdf.setFillColor(tc.na); pdf.rect(W/2,H-b,W/4,b,"F"); pdf.setFillColor(tc.ic); pdf.rect(W*3/4,H-b,W/4,b,"F"); };
  const ft = (n,t) => { pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text("temoa GmbH · temoa.de",20,H-8); pdf.text(`Slide ${n}/${t}`,W-20,H-8,{align:"right"}); };
  const lb = (t,x,y,c) => { pdf.setFontSize(6.5); pdf.setTextColor(c||tc.or); pdf.setFont("helvetica","bold"); pdf.text(t.toUpperCase(),x,y); };
  const hd = (t,x,y,sz) => { pdf.setFontSize(sz||22); pdf.setTextColor(tc.na); pdf.setFont("helvetica","bold"); pdf.text(t,x,y); };
  const bd = (t,x,y,mw,sz) => { pdf.setFontSize(sz||8); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(pdf.splitTextToSize(String(t||""),mw||140),x,y); };
  const rr = (x,y,w,h,r,c) => { pdf.setFillColor(c); pdf.roundedRect(x,y,w,h,r,r,"F"); };

  const a = D.audience || {}; const r = D.reviews || {positive:[],negative:[]}; const k = D.keywords || {volume:[],purchase:[]}; const co = D.competitive || {gaps:[]};

  lb("temoa Content Studio · Datenbasierte Analyse",20,22); hd(D.product?.name||"Produkt",20,38,26); bd(D.product?.position||"",20,48,240,9);
  [{v:`${r.positive.length+r.negative.length}`,l:"Bewertungsthemen"},{v:`${(k.volume||[]).length+(k.purchase||[]).length}`,l:"Keywords"},{v:`${(D.images||[]).length}`,l:"Bildslots"}].forEach((x,i) => { const kx=20+i*70; rr(kx,90,62,36,3,tc.bg); pdf.setFontSize(18); pdf.setTextColor(tc.or); pdf.setFont("helvetica","bold"); pdf.text(x.v,kx+8,108); pdf.setFontSize(6.5); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(x.l,kx+8,116); });
  cb(); ft(1,5);

  pdf.addPage(); lb("Zielgruppe & Kaufauslöser",20,22); hd("Was treibt den Kauf?",20,36,20);
  rr(20,46,140,32,3,"#ECFDF5"); lb("KERNWUNSCH",26,54,tc.gr); bd(a.desire,26,60,128,8);
  rr(20,82,140,32,3,"#FFF0F0"); lb("KERNANGST",26,90,tc.re); bd(a.fear,26,96,128,8);
  lb("KAUFAUSLÖSER",174,50,tc.or);
  (a.triggers||[]).forEach((t,i) => { pdf.setFontSize(7.5); pdf.setTextColor(tc.or); pdf.setFont("helvetica","bold"); pdf.text("→",174,58+i*10); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(pdf.splitTextToSize(t,130),182,58+i*10); });
  cb(); ft(2,5);

  pdf.addPage(); lb("Bewertungsanalyse",20,22); hd("Was Kunden sagen",20,36,20);
  lb("POSITIV",20,50,tc.gr); r.positive.slice(0,5).forEach((x,i) => { const ry=56+i*14; pdf.setFontSize(7); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(String(x.theme),20,ry,{maxWidth:90}); rr(115,ry-3,40,3,1,"#E8EAF0"); rr(115,ry-3,Math.min(x.pct||0,40),3,1,tc.gr); pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text(`${x.count}× · ${x.pct}%`,158,ry); });
  lb("NEGATIV",186,50,tc.re); r.negative.slice(0,5).forEach((x,i) => { const ry=56+i*14; pdf.setFontSize(7); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(String(x.theme),186,ry,{maxWidth:90}); rr(280,ry-3,40,3,1,"#E8EAF0"); rr(280,ry-3,Math.min(x.pct||0,40),3,1,tc.re); pdf.setFontSize(6); pdf.setTextColor(tc.td); pdf.text(`${x.count}× · ${x.pct}%`,323,ry); });
  cb(); ft(3,5);

  pdf.addPage(); lb("Keywords & Differenzierung",20,22); hd("Was Kunden suchen",20,36,20);
  lb("TOP KEYWORDS",20,50,tc.na);
  (k.volume||[]).forEach((kw,i) => { rr(20+(i%4)*38,56+Math.floor(i/4)*12,35,8,2,"#0230480D"); pdf.setFontSize(6.5); pdf.setTextColor(tc.na); pdf.setFont("helvetica","bold"); pdf.text(String(kw.kw),22+(i%4)*38,56+Math.floor(i/4)*12+5.5); });
  lb("KAUFABSICHT",20,88,tc.or);
  (k.purchase||[]).forEach((kw,i) => { rr(20+(i%3)*52,94+Math.floor(i/3)*12,49,8,2,"#FF990310"); pdf.setFontSize(6.5); pdf.setTextColor(tc.or); pdf.setFont("helvetica","bold"); pdf.text(String(kw.kw),22+(i%3)*52,94+Math.floor(i/3)*12+5.5,{maxWidth:45}); });
  lb("MARKTLÜCKEN",200,50,tc.na);
  (co.gaps||[]).forEach((g,i) => { pdf.setFontSize(7); pdf.setTextColor(tc.or); pdf.setFont("helvetica","bold"); pdf.text("◆",200,58+i*14); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(pdf.splitTextToSize(g,120),207,58+i*14); });
  cb(); ft(4,5);

  pdf.addPage(); lb("Bildstrategie",20,22); hd(`${(D.images||[]).length} Bilder. Jedes mit einer Aufgabe.`,20,36,20);
  (D.images||[]).forEach((im,i) => { const c=i%4,row=Math.floor(i/4),bx=20+c*76,by=48+row*50; rr(bx,by,72,44,3,tc.bg); pdf.setFontSize(7); pdf.setTextColor(tc.or); pdf.setFont("helvetica","bold"); pdf.text(im.label||"",bx+6,by+10); pdf.setFontSize(6); pdf.setTextColor(tc.na); pdf.setFont("helvetica","bold"); pdf.text(im.role||"",bx+6,by+16); pdf.setFontSize(6.5); pdf.setTextColor(tc.tm); pdf.setFont("helvetica","normal"); pdf.text(pdf.splitTextToSize(im.texts?.headline||"Nur visuell",60),bx+6,by+24); });
  rr(20,150,W-40,24,3,"#EBF3F8"); pdf.setFontSize(8); pdf.setTextColor(tc.na); pdf.setFont("helvetica","normal"); pdf.text("Jedes Produktbild basiert auf realer Datenanalyse: Kundenbewertungen, Keyword-Recherche, Wettbewerbsanalyse und Zielgruppenverständnis.",28,164,{maxWidth:W-56});
  cb(); ft(5,5);

  pdf.save(`temoa_analyse_${D.product?.sku || "export"}.pdf`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const TABS = [
  { id: "briefing", label: "Bild-Briefing" },
  { id: "reviews", label: "Bewertungen" },
  { id: "analysis", label: "Analyse" },
];

export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("briefing");
  const [brandLogo, setBrandLogo] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);
  const fileRef = useRef(null);

  const handleStart = useCallback(async (asin, marketplace, productInfo, freetext) => {
    setLoading(true); setError(null); setStatus("Starte Analyse...");
    try {
      const result = await runAnalysis(asin, marketplace, productInfo, freetext, setStatus);
      setData(result); setTab("briefing"); setShowNewForm(false);
    } catch (e) {
      setError(e.message || "Unbekannter Fehler");
    }
    setLoading(false); setStatus("");
  }, []);

  const handleNewRequest = useCallback((asin, marketplace, productInfo, freetext) => {
    if (data) {
      setPendingStart({ asin, marketplace, productInfo, freetext });
    } else {
      handleStart(asin, marketplace, productInfo, freetext);
    }
  }, [data, handleStart]);

  const handlePdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try { await exportPDF(data); } catch (e) { alert("PDF-Export: " + e.message); }
    setPdfLoading(false);
  };

  // START SCREEN
  if (!data && !showNewForm) {
    return <StartScreen onStart={handleStart} loading={loading} status={status} error={error} onDismissError={() => setError(null)} />;
  }

  // NEW FORM (when data already exists, user clicked "Neues Briefing")
  if (showNewForm && !loading) {
    return <StartScreen onStart={handleNewRequest} loading={loading} status={status} error={error} onDismissError={() => setError(null)} />;
  }

  // LOADING (after form submit)
  if (loading && !data) {
    return <StartScreen onStart={() => {}} loading={true} status={status} error={error} onDismissError={() => setError(null)} />;
  }

  // DASHBOARD
  return (
    <div style={{ minHeight: "100vh", fontFamily: FN, background: BG, backgroundAttachment: "fixed" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Orbs />
      <div style={{ ...glass, position: "sticky", top: 0, zIndex: 100, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 58 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 900 }}>Briefing Studio</div>
              <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{data.product?.name}</div>
                <div style={{ fontSize: 10, color: V.textDim }}>{data.product?.brand}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => setShowNewForm(true)} style={{ ...glassSub, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>Neues Briefing</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setBrandLogo(ev.target.result); r.readAsDataURL(f); }}} />
              <button onClick={() => fileRef.current?.click()} style={{ ...glassSub, padding: "7px 12px", fontSize: 10, fontWeight: 700, color: V.textDim, cursor: "pointer", fontFamily: FN, borderRadius: 10 }}>{brandLogo ? "Logo ändern" : "Kundenlogo"}</button>
              <button onClick={() => setShowExport(true)} style={{ ...glassSub, padding: "8px 16px", fontSize: 11, fontWeight: 700, color: V.violet, cursor: "pointer", fontFamily: FN, borderRadius: 10, border: `1px solid ${V.violet}25` }}>Designer-Briefing</button>
              <button onClick={handlePdf} disabled={pdfLoading} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${V.violet}, ${V.blue})`, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FN, opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "PDF..." : "Kunden-Präsentation"}</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "10px 20px", border: "none", background: "transparent",
                borderBottom: tab === t.id ? `2.5px solid ${V.violet}` : "2.5px solid transparent",
                color: tab === t.id ? V.violet : V.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FN,
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 24px 80px", position: "relative", zIndex: 1 }}>
        {tab === "briefing" && <BildBriefing D={data} />}
        {tab === "reviews" && <ReviewsTab D={data} />}
        {tab === "analysis" && <AnalyseTab D={data} />}
      </div>
      {showExport && <BriefingExport D={data} onClose={() => setShowExport(false)} />}
      {pendingStart && (
        <OverwriteWarning
          productName={data.product?.name || "aktuelles Produkt"}
          onConfirm={() => { const p = pendingStart; setPendingStart(null); setData(null); setShowNewForm(false); handleStart(p.asin, p.marketplace, p.productInfo, p.freetext); }}
          onCancel={() => setPendingStart(null)}
        />
      )}
    </div>
  );
}
