# Briefing Studio — Entwicklungskontext

## Architektur
- Single-page React App (src/App.jsx) + Vercel Serverless Functions (api/)
- Hauptkomponenten: StartScreen, BildBriefing, DesignerView, ReviewsTab, AnalyseTab
- State: React useState/useRef, kein externer State Manager
- DB: Turso SQLite via api/briefing.js
- AI: Claude API via api/analyze.js (Streaming SSE)
- Scraping: Bright Data via api/fetch-images.js + api/keyword-research.js

## Briefing-Sprache (Bildkonzept-Ansatz)
Briefings beschreiben KEINE "Bilder mit Text darüber", sondern INTEGRIERTE BILDKONZEPTE.
Jedes Textelement hat eine konkrete Position, Größe und visuelle Beziehung zu Bildelementen.

### Textformat-Typen (bullets[].format)
- `display`: Große Typografie als visuelles Zentrum
- `headline`: Klassische Headline
- `infocard`: Info-Karte mit Titel + Beschreibung
- `zoom-label`: Text an Zoom-Inset/Detail
- `annotation`: Label mit Pfeil/Linie an Produktteil
- `panel-text`: Text in Bild-Kachel (Grid)
- `step-overlay`: Schrittnummer + Titel auf Lifestyle-Foto
- `comparison`: Vergleichstext (eigenes Produkt vs. Alternative)
- `badge-context`: Siegel mit Platzierungskontext
- `benefit-pill`: Icon + Kurztext Pill-Shape
- `bullet`: Klassischer Aufzählungspunkt

### Bullet-Datenformat (abwärtskompatibel)
- Alt: `bullets: ["Text1", "Text2"]` (strings)
- Neu: `bullets: [{text: "Text1", format: "zoom-label"}, ...]` (objects)
- Helper: `bText(b)` gibt den Text, `bFmt(b)` gibt das Format

## Kaufauslöser-Analyse
- audience.triggers[] enthält Kaufauslöser absteigend nach Wichtigkeit
- Live-Check im BildBriefing: Alle ausgewählten Texte werden gegen Trigger geprüft
- Morphem-basiertes Matching für deutsche Komposita (Fugenlaute, Suffix-Stripping)

## Concept/Rationale/Visual
- Werden ZWEISPRACHIG generiert: concept(DE) + conceptEn(EN)
- Studio zeigt Deutsch, Designer-Export zeigt Englisch
- concept = Bildkonzept als zusammenhängende Komposition
- visual = Konkrete Designanweisungen
- rationale = Strategische Begründung

## Eyecatcher (nur Main Image)
- Auswahl per Radio-Button (ecSel State)
- Text-Eyecatcher vs. Darstellungshinweis (visuell differenziert)
- Nur ausgewählter Eyecatcher erscheint im Designer-Export
