# Phoenix

A writing room with real stacked pages, for English, German and Turkish. Plain HTML/CSS/JS, no build step — same style as LabGorilla and Hedgehog.

Run it locally: `python -m http.server 8124` in this folder, then open http://localhost:8124

## What it does (step 1: Write)

- Documents in a list on the left, each with its own language (EN / DE / TR) so the browser's spell-check follows it.
- Word-like pages stacked on a dark desk: page size (A4, A5, A6, B5, Letter, Legal, custom), portrait/landscape, margins, page numbers, paper colour.
- Text: base font, size, line spacing, paragraph spacing, optional first-line indent; per-selection size/font/bold/italic/underline/strike, headings, quote, lists, alignment.
- Autosaves into one file, `Phoenix.phx`, in a folder you pick (File System Access API, like LabGorilla's `.lbk`). Falls back to browser storage. Backup/restore from the ⋯ menu. Double-click `.phx` opens it when installed as an app.
- Print / save as PDF, export a document as plain text.

## Step 2a: comments + Study tab

- Select text in Write, right-click inside the selection → **Comment…** (or the speech-bubble button in the toolbar). Right-click without a selection still gives the browser's own menu, so spelling suggestions keep working.
- A comment has a type (Note / Strength / To improve / Language), is painted on the page with the CSS Highlight API (no markup in the document) and stored in `doc.comments`.
- It is anchored by its **quoted text** plus 24 characters before/after (`quote`, `before`, `after`, hint `pos`), found again after every edit; `page` is kept up to date. If the passage has been edited away the card says so ("passage changed").
- The highlighter button in the toolbar switches the comment colours on the page on/off (remembered; comments stay in Study).
- **Study → Comments**: left a tree (🐦‍🔥 document → Note / Strength / Language / To improve, with counts, collapsible); clicking a document or a type shows all matching comments on the right as separate cards, grouped by page ("Hide done" filter). Each card quotes the passage with Show in text / Edit / Mark as done / Delete. `author` is "You"; the field exists so critiques written into `Phoenix.phx` by Claude can show up the same way later.

## How the pages work (so a future session doesn't have to rediscover it)

There is one `contenteditable` column. After every change `js/editor.js` removes and re-inserts invisible `.pgap` spacers so no line is cut by a page edge (block-level before a paragraph, or inline inside a paragraph at the first line that does not fit). The white sheets are drawn behind the text. Because the spacers change the DOM, undo/redo is our own (snapshots of the clean HTML), not the browser's.
Spacers are never saved: `doc.html` is always the clean HTML.

## Files

- `js/store.js` — data, `.phx` file, folder picker, backup
- `js/editor.js` — page layout, history, formatting, paste clean-up
- `js/app.js` — document list, toolbar, dialogs, menu, status bar
- `Phoenix.phx` — your writing (never committed, see `.gitignore`)

## Next

- Step 2: Study tab (highlight a sentence → send to Study, personal dictionaries per language, word look-up, grammar / vocabulary / examples).
- Step 3: World cards (characters, places).
- Not yet: bundled fonts (only fonts already on the computer are offered), images in documents, headings kept with the next paragraph at page ends.
