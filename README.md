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

## Step 2c: Grammar (`js/grammar.js`, Study -> Grammar)

- Rule cards `data.grammar`: `{id, lang, cat, title, rule, examples:[{wrong,right}], src, created}`. Tree: language -> category (Tenses & verbs, Word order, Punctuation, Prepositions & cases, Articles & nouns, Spelling, Word choice, Other); cards show the rule and the examples (wrong struck through, correct in green).
- Make a rule with **+ New rule**, or from Study -> Comments: Language / To improve cards have **Save as grammar rule** (title = first sentence of the comment, category guessed from keywords, the comment text becomes the explanation, the commented passage becomes the first "wrong" example waiting for the corrected version).
- Documents can be deleted from the sidebar (x on hover), from the "Delete document" button above the page, or the menu; their world cards go with them.

## Step 3: World cards (`js/world.js`, World tab)

- Every card belongs to a **document** (`card.doc`, one world per book). The left tree is document (🐦‍🔥) → Characters / Locations / Races / Items / Magic systems / Spells with counts; the form has a document selector to move a card. Links, suggestions and name look-ups stay inside the card's document; the same name in another document is a separate card. Deleting a document deletes its cards. Cards from before this change are put in the fullest document (`fixData`).

- Card types: Character, Location, Race, Item, Magic system, Spell / ability (definitions in `TYPES` at the top of `world.js`; add a type or field there). Data in `data.world`: `{id, type, name, f:{field:value}, extra:[{label,value}], notes}`.
- Magic works on two levels: a **Magic system** card (source, peoples and characters who can use it, tied items and places, how it works, schools, cost, limits, dangers, history) and **Spell / ability** cards whose *Magic system* field links back to it (the system card then lists its spells under "Linked from"). Colours: system purple, spell teal.
- Field kinds: `text` (with suggestions), `long`, `link` (one card) and `links` (several). A link stores the card id, shows the name. Typing a name that no card of that kind has yet **creates a new card** and links it (Birthplace → new Location, Race → new Race, ...). Chips open the linked card (Back button); each card lists "Linked from" (backlinks).
- Empty stubs are discarded when the card closes (and on load). Deleting a card removes links to it. "Your own fields" add free label/value pairs.
- From the text: select a name → right-click → **New world card…** (asks which type) or **Open world card** if it exists.
- Note: the dialog's `close` event is not relied on for cleanup (the embedded preview browser never fires it); the Close button runs the cleanup itself and the event covers Esc.

## Step 4: document types + the Read tab (`js/kinds.js`, `js/reading.js`)

- **Types:** every document has `doc.type`: `story` (the old kind; documents without a type are stories), `book`, `document`, `note`, `email`, `journal`, and `chapter` (belongs to a book via `doc.parent`, order in `doc.order`; not offered in the New dialog). Definitions (icon, colour, description, starting page/text settings, default `meta`) are in `PX.TYPES` in `store.js`. Type-specific fields live in `doc.meta`: book `{author, cover}`, email `{from, to}` (subject = title), journal `{date}`, note `{color}`, document `{status}`.
- **New…** opens a picker with the six types. A new book starts with one chapter. The row under the title (`#metaRow`) shows the type badge and its fields; a chapter shows a link back to its book.
- **A book has no page of its own.** Its Write screen (`#bookHome`) is a chapter overview: cover preview, the automatic table of contents, add / reorder chapters, "Read this book". Each chapter is a normal document (comments, world cards, autosave all work per chapter) and starts with the book's page & text settings; "Page & text…" on a book can apply them to all chapters. Deleting a book deletes its chapters. Sidebar: chapters hang under their book.
- **Read tab:** left list of every top-level document with its icon (filter by type, search); chapters are not listed, they are in the book. The view depends on the type:
  - **book / journal:** an open book (CSS 3D, `.rb-leaf` per sheet, rotating around the spine). Closed cover → arrow keys / click turn the pages (Home/End jump). Front matter: cover, endpaper, title page, copyright page, **table of contents** (clickable, page numbers), chapters starting on right-hand pages, back cover. Journal = all journal entries sorted by date in one volume (no title page / contents; each entry starts on a new page with its date). Only sheets near the open spread are built.
  - **document:** a clipboard; each page is a sheet hinged at the top edge that flips up and over (`rotateX`), fading behind the board; status stamp (Draft / In review / Final).
  - **story:** one calm page at a time, slide transition, reading time.
  - **email:** an inbox-style message (avatar, From/To, date, subject). **note:** a sticky note pinned to cork, in the chosen colour.
- **Bookmark** (book + journal): button / **B** key in the Read bar places a bookmark on the current page (right-hand page of the spread), press again to remove; "↩ Bookmark" jumps back to it; a book without a saved position opens at its bookmark. Two styles, swapped with the Strip / Corner chip in the Read bar or the "Bookmark" select in the book's row in Write: **strip** (a long card strip with the book's title written down it, slides down onto the page along the gutter, longer than the page; navy/oxblood… takes the cover colour) and **corner** (a dog-ear: the flap rotates 180° around the diagonal fold line, `rotate3d(1,-1,0,180deg)`, revealing the cut-away). Stored in `data.marks[bookId | "journal"] = { style, doc, i }` (page `i` of chapter/entry `doc`), so it survives edits to other chapters; it is shown only while its spread is open (it fades when you turn away).
- **Chapter / journal heading (`PX.docHeader` in `store.js`).** A chapter starts with "CHAPTER n" + its title, a journal entry with its date + title. Write shows these as locked blocks (`data-hd="1" contenteditable="false"`) at the top of the page and the Read tab puts the very same blocks in front of the text, so page breaks are identical in both. They are rebuilt on every layout (`syncHeader()` in `editor.js`, so a changed title / date / chapter number shows at once), never saved inside `doc.html` (`PX.stripHeader`), left out of word counts, and Backspace at the start of the text does not eat them. (A first version of the Read tab added the heading only there, which shifted its page breaks away from Write's. Fixed.)
- **Pages in the Read tab are the same pages as in Write.** `reading.js` contains a headless copy of the editor's break algorithm (`place()`; if `layout()` in `editor.js` changes, change it there too): the text is laid out once in a hidden box, spacers push lines that would be cut onto the next page, and a page is a window (`translateY(-n * pageStep)`) onto that column. Checked against Write: same page counts and same first words on every page.
- Reading position per document is remembered in `PX.ui.readPos`. `prefers-reduced-motion` shortens the animations. Designed for PC only; no sound.
- **Pictures** (`js/images.js`, `PX.img` in `store.js`, figure code in `editor.js`): toolbar button, paste (screenshots, copied pictures) or drag a picture file into the text. Shrunk to max 2000 px on import (re-encoded as webp unless small), stored **as files in a `PhoenixFiles` folder next to `Phoenix.phx`** (same pattern as LabGorilla's "LabGorilla files": `D.images[id] = { name, type, size, w, h, loc: "dir" | "idb", fn }`; without a linked folder the file waits in IndexedDB under `blob:<id>` and moves into the folder when one is linked). The document only holds `<figure class="fig plate|wide|small" contenteditable="false" data-img="id"><img data-img="id" width height alt><figcaption>…</figcaption></figure>`; blob addresses are stripped when saving (`PX.img.stripUrls`) and put back on load (`PX.img.hydrate`, from `urlCache`, filled by `PX.img.warm()`). Click a picture to get the bar: **Full page** (a page of its own, exactly the height of the text area, `--C`), **Wide**, **Small**, caption, Remove (Delete key too). Tall pictures start as Full page. The layout never cuts a picture: if it does not fit it moves whole to the next page (rule is in `editor.js layout()` and in `reading.js place()`). Pictures show in the Read tab (book, document board, story, email, note) and in print. A `.phx` backup does not contain the pictures: copy the `PhoenixFiles` folder as well. Not yet: removing unused picture files, cover art / chapter-opener art, pictures in a book's own cover page.
- **World tab = books.** Only books get an entry; a chapter uses its book's world (`W.homeOf`, cards found on a chapter are moved to the book in `fixData`). A document that is not a book is listed only while it still holds cards from before (move them with the selector on the card; the entry then disappears).
- Not yet: printing a whole book; email/note have no page flip (by design).

## Turkish letters on a German keyboard (autocorrect)

- `js/turkish.js` + `data/tr-words.txt` (49,188 word forms with counts, derived from hermitdave's FrequencyWords `tr_50k.txt`, **CC-BY-SA-4.0**, see `data/NOTICE.txt`).
- In a Turkish document, when a word is finished (space, punctuation, Enter) c/g/i/s are turned into ç/ğ/ı/ş where that is the real spelling. Known words: the most common form wins (typed form kept unless the other is ≥2× as common). Unknown words: a character 4-gram model trained on the list decides, only when clearly better (margin 1.5). ü/ö are taken as typed (they are on a German keyboard). Capitalised words starting with I become İ (İzmir). Apostrophe suffixes (Ankara'nın) are judged together with the stem.
- Measured on held-out words (script in the session scratchpad, not in the repo): ~99 % right for known words; for unseen words ~80 % fixed while ~96 % of plain unseen words stay untouched.
- Switch: the amber "ç ş ğ ı auto" button next to the language select (only for Turkish documents), stored as `settings.trAuto`. Ctrl+Z right after a correction restores what was typed and remembers the word in `settings.trKeep`, so it is not corrected again.
- The look-up panel uses the same engine first, then falls back to asking Wiktionary which spellings exist.

## How the pages work (so a future session doesn't have to rediscover it)

There is one `contenteditable` column. After every change `js/editor.js` removes and re-inserts invisible `.pgap` spacers so no line is cut by a page edge (block-level before a paragraph, or inline inside a paragraph at the first line that does not fit). The white sheets are drawn behind the text. Because the spacers change the DOM, undo/redo is our own (snapshots of the clean HTML), not the browser's.
Spacers are never saved: `doc.html` is always the clean HTML.

Alignment (`E.align` in `editor.js`) is set directly on the paragraphs / headings touched by the selection (`style="text-align: …"`), not through the browser's `justify…` commands: those do nothing when the browser believes the text is already aligned, which a stray `text-align` on an inline `<span>` (left behind by older edits) made it believe. The toolbar highlight comes from the paragraph's computed `text-align`, and stray inline `text-align` on spans is removed on every layout.

## Files

- `js/store.js` — data, `.phx` file, folder picker, backup
- `js/editor.js` — page layout, history, formatting, paste clean-up
- `js/app.js` — document list, toolbar, dialogs, menu, status bar
- `js/kinds.js` — document types in Write: New… picker, fields under the title, book overview
- `js/reading.js` — the Read tab: pagination, book / journal / document / story / email / note views
- `Phoenix.phx` — your writing (never committed, see `.gitignore`)

## Next

- Step 2: Study tab (highlight a sentence → send to Study, personal dictionaries per language, word look-up, grammar / vocabulary / examples).
- Step 3: World cards (characters, places).
- Not yet: bundled fonts (only fonts already on the computer are offered), images in documents, headings kept with the next paragraph at page ends.
