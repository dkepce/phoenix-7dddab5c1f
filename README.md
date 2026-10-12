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

## Step 2b: Vocabulary (look-up + personal dictionary)

- Add words two ways: select a word (up to 4) → right-click → **Look up “word”…** (or the magnifier button), or the "Look up a word…" box in Study → Vocabulary. Both open the same panel (`js/vocab.js`).
- The panel asks **Wiktionary** (definitions, en.wiktionary.org REST API; works for English, German and Turkish words, definitions in English), **MyMemory** (translations into the other two languages, machine quality — editable) and **Datamuse** + Wiktionary search (spelling suggestions, "Did you mean"). Only the looked-up word is sent. If the dictionary cannot be reached the word can still be saved with your own definition.
- The example sentence is the sentence around the selection (`selectionInfo().sentence`). Cards are saved in `data.vocab`: `{word, lang, pos, def, trans, sentence, note, doc, created}`.
- Study → Vocabulary: tree (All words / English / Deutsch / Türkçe) and A–Z cards with a filter box. No progress tags or quiz yet (decided with Doruk; quiz maybe later).

## Step 3: World cards (`js/world.js`, World tab)

- Card types: Character, Location, Race, Item (definitions in `TYPES` at the top of `world.js`; add a type or field there). Data in `data.world`: `{id, type, name, f:{field:value}, extra:[{label,value}], notes}`.
- Field kinds: `text` (with suggestions), `long`, `link` (one card) and `links` (several). A link stores the card id, shows the name. Typing a name that no card of that kind has yet **creates a new card** and links it (Birthplace → new Location, Race → new Race, ...). Chips open the linked card (Back button); each card lists "Linked from" (backlinks).
- Empty stubs are discarded when the card closes (and on load). Deleting a card removes links to it. "Your own fields" add free label/value pairs.
- From the text: select a name → right-click → **New world card…** (asks which type) or **Open world card** if it exists.
- Note: the dialog's `close` event is not relied on for cleanup (the embedded preview browser never fires it); the Close button runs the cleanup itself and the event covers Esc.

## Turkish letters on a German keyboard (autocorrect)

- `js/turkish.js` + `data/tr-words.txt` (49,188 word forms with counts, derived from hermitdave's FrequencyWords `tr_50k.txt`, **CC-BY-SA-4.0**, see `data/NOTICE.txt`).
- In a Turkish document, when a word is finished (space, punctuation, Enter) c/g/i/s are turned into ç/ğ/ı/ş where that is the real spelling. Known words: the most common form wins (typed form kept unless the other is ≥2× as common). Unknown words: a character 4-gram model trained on the list decides, only when clearly better (margin 1.5). ü/ö are taken as typed (they are on a German keyboard). Capitalised words starting with I become İ (İzmir). Apostrophe suffixes (Ankara'nın) are judged together with the stem.
- Measured on held-out words (script in the session scratchpad, not in the repo): ~99 % right for known words; for unseen words ~80 % fixed while ~96 % of plain unseen words stay untouched.
- Switch: the amber "ç ş ğ ı auto" button next to the language select (only for Turkish documents), stored as `settings.trAuto`. Ctrl+Z right after a correction restores what was typed and remembers the word in `settings.trKeep`, so it is not corrected again.
- The look-up panel uses the same engine first, then falls back to asking Wiktionary which spellings exist.

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
