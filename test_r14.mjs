// Round 14 (Dana, Nov 25): "What's on page 789 of the encyclopedia of world history" must read that
// page from the book (or say plainly it isn't on the phone and offer copies), "Download the
// encyclopedia of the world" must list that book and not World Religions or American Indian
// Contributions, and catalog pages (loc.gov, archive.org) must resolve to their real PDF. All
// network here is mocked; the archive.org and loc.gov fixtures are trimmed from the real pages.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import nacl from "tweetnacl";
import { docRequest, pageRequest } from "./symbolic/docs/doc_intents.js";
import { pageAnswer, libraryAnswer } from "./symbolic/library/library_answer.js";
import { hasDownloadable, pendingLine, planBookRequest } from "./symbolic/library/book_request.js";
import { routeAsk } from "./symbolic/reasoning/ask_route.js";
import { bookFromDoc, bookFromText } from "./symbolic/library/library.js";
import { createDocService } from "./symbolic/docs/doc_service.js";
import { candidateLine, displayTitle, documentIntent, downloadDocument, filterByTitle, findDocuments, isTitleQuery, isVagueTitle, mainTitle, titleMatch } from "./symbolic/docs/doc_find.js";
import { catalogItem, iaFiles, isLandingPage, locFiles, locFilesFromHtml, resolveItem, volumeOf } from "./symbolic/docs/doc_resolve.js";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { buildQuestions } from "./eval/questions.mjs";

const SAMPLE = new Uint8Array(fs.readFileSync("eval/fixtures/docs/sample_field_manual.pdf"));
const IA_META = fs.readFileSync("eval/fixtures/docs/r14/ia_encyclopediaofworldhistoryvol4.json", "utf8");
const LOC_HTML = fs.readFileSync("eval/fixtures/docs/r14/loc_item_01025634.html", "utf8");
const IA_PDF = "https://archive.org/download/encyclopediaofworldhistoryvol4/Encyclopedia%20of%20World%20History-%20Vol%204.pdf";
const LOC_PDF = "https://tile.loc.gov/storage-services/public/gdcmassbookdig/worldencyclopedi00morr/worldencyclopedi00morr.pdf";

// Dana's real result titles.
const RELIGIONS = "The Encyclopedia of WORLD RELIGIONS";
const AMERICAN = "Encyclopedia of American Indian Contributions to the World - Mexika";
const VAGUE = "Encyclopedia Of";
const LOC_TITLE = "The world encyclopedia; a library of ready reference";
const STANFORD = "The encyclopedia of world history: ancient, medieval, and modern, chronologically arranged / Peter N. [1]";

function fakeFetch(routes, calls = []) {
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const hit = routes.find((r) => (typeof r.match === "string" ? url.startsWith(r.match) : r.match.test(url)) && (!r.method || r.method === (init.method || "GET")));
    if (!hit) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    const headers = { "content-type": hit.type || "application/pdf", ...(hit.headers || {}) };
    if ((init.method || "GET") === "HEAD") return new Response(null, { status: hit.status || 200, headers });
    return new Response(hit.body, { status: hit.status || 200, headers });
  };
  return impl;
}
const ddgLink = (url) => `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc`;
const ddgPage = (items) => `<html><body>${items.map(([url, title]) => `<div class="result"><h2><a rel="nofollow" class="result__a" href="${ddgLink(url)}">${title}</a></h2><a class="result__snippet" href="${ddgLink(url)}">snippet</a></div>`).join("\n")}</body></html>`;
const CLOUDFLARE = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";

// ---------- page lookup ----------

test("'What's on page 789 of the encyclopedia of world history' is a page lookup", () => {
  for (const [q, n, target] of [
    ["What's on page 789 of the encyclopedia of world history", 789, "encyclopedia of world history"],
    ["what's on page 789 of the encyclopedia of the world", 789, "encyclopedia of the world"],
    ["What is on page 1,204 of the encyclopedia of world history?", 1204, "encyclopedia of world history"],
    ["what is on page 44 in FM 21-76", 44, "FM 21-76"]
  ]) {
    const r = pageRequest(q);
    assert.ok(r, q);
    assert.equal(r.kind, "page");
    assert.equal(r.n, n, q);
    assert.match(r.target, new RegExp(target.replace(/[-]/g, "\\-"), "i"), q);
    assert.equal(docRequest(q).kind, "page", q);
  }
  assert.equal(pageRequest("open the canning guide at page 7").open, true);
  for (const plain of ["go to page 5", "show me page 2 of the results", "what page is the map on", "turn the page", "I am on page 5", "we are on page 3", "back to page 4"]) assert.equal(pageRequest(plain), null, plain);
  // "Kybalion page 12" has the same shape as "my notes page 2": only for a title already on the phone.
  assert.equal(pageRequest("Kybalion page 12").needsMatch, true);
  assert.equal(routeAsk("my notes page 2", { entries: [] }), null);
  assert.equal(pageRequest("read page 3 of kubark").open, true);
  // The route never reaches web-learn: missing book -> document search for that title.
  const route = routeAsk("What's on page 789 of the encyclopedia of world history", { entries: [] });
  assert.equal(route.kind, "book");
  assert.equal(route.book.req.kind, "page");
  assert.deepEqual(route.book.search, { query: "encyclopedia of world history", format: "any", book: true });
});

const BIG = bookFromText({ id: "book:test", title: "Encyclopedia of World History", raw: Array.from({ length: 120 }, (_, i) => `Entry ${i + 1}: the Battle of Hastings was fought in 1066 between the Normans and the English, and entry ${i + 1} tells it again in its own words for the reader.`.repeat(4)).join("\n\n") });

test("a built-in book answers with page N's own text, the book and page, and an Open in reader", () => {
  assert.ok(BIG.pages.length >= 5);
  const got = libraryAnswer({ kind: "page", n: 3, target: "encyclopedia of world history", open: false }, BIG);
  assert.equal(got.libraryKind, "page");
  assert.match(got.text, /Page 3 of "Encyclopedia of World History" \(reader page 3 of \d+\)/);
  assert.ok(got.text.includes(BIG.pages[2].slice(0, 60).trim()), "quotes page 3 itself");
  assert.match(got.text, /Source: Encyclopedia of World History, reader page 3\./);
  assert.deepEqual(got.reader, { bookId: "book:test", page: 3, auto: false, title: got.reader.title });
  assert.equal(got.citations[0].page, 3);
  const missing = pageAnswer(BIG, 789);
  assert.equal(missing.libraryKind, "page-missing");
  assert.match(missing.text, new RegExp(`has ${BIG.pages.length} pages on this phone, so there's no page 789\\. Ask for a page from 1 to ${BIG.pages.length}\\.`));
  assert.equal(pageAnswer(BIG, 2, { open: true }).reader.auto, true);
});

test("a book that isn't on the phone says so plainly and offers downloadable copies, no web snippet", () => {
  const req = docRequest("What's on page 789 of the encyclopedia of world history");
  const plan = planBookRequest("What's on page 789 of the encyclopedia of world history", { entries: [] });
  assert.ok(plan.search && !plan.entry);
  const found = { candidates: [{ id: "a", downloadable: true, tooBig: false }] };
  const line = pendingLine(req, req.target, found);
  assert.match(line, /"encyclopedia of world history" isn't on this phone yet, so I can't read you page 789\. Here are copies I can download\./);
  assert.match(line, /I'll show page 789 from its own text/);
  const none = { candidates: [{ id: "a", downloadable: false }, { id: "b", downloadable: true, tooBig: true }] };
  assert.equal(hasDownloadable(none), false);
  assert.match(pendingLine(req, req.target, none), /isn't on this phone yet, and the copies I found are over the 50 MB download limit or are library web pages.*can't read you page 789 until a copy is saved/);
  assert.doesNotMatch(pendingLine(req, req.target, none), /Here are copies I can download/);
});

test("after Download, the page question is answered from the PDF's own page index", async () => {
  const files = new Map();
  const secrets = new Map();
  const fetchImpl = fakeFetch([{ match: "https://armypubs.example.mil/sample.pdf", body: SAMPLE }]);
  const service = createDocService({
    getSecret: async (k) => secrets.get(k) || null, setSecret: async (k, v) => { secrets.set(k, v); }, deleteSecret: async (k) => { secrets.delete(k); },
    readFile: async (k) => files.get(k) || null, writeFile: async (k, v) => { files.set(k, v); }, deleteFile: async (k) => { files.delete(k); },
    fileSize: async (k) => (files.has(k) ? files.get(k).length : null), fetchImpl, randomBytes: (n) => nacl.randomBytes(n)
  });
  const got = await service.download({ url: "https://armypubs.example.mil/sample.pdf", title: "Sample Field Manual" });
  assert.equal(got.ok, true);
  const meta = got.meta;
  const book = bookFromDoc(meta, await service.body(meta.id));
  const req = docRequest("what's on page 2 of the sample field manual");
  const answer = libraryAnswer(req, book);
  assert.equal(answer.libraryKind, "page");
  assert.match(answer.text, /Page 2 of "Sample Field Manual: Water and Fire" \(page 2 of 2 in the downloaded copy\)/);
  assert.match(answer.text, /A fire needs three things: tinder, kindling and fuel\./);
  assert.doesNotMatch(answer.text, /Boil water/, "page 1 is not quoted");
  assert.match(answer.text, /Source: Sample Field Manual: Water and Fire, page 2\./);
  assert.equal(answer.reader.page, 2);
  const tooFar = libraryAnswer(docRequest("what's on page 789 of the sample field manual"), book);
  assert.equal(tooFar.libraryKind, "page-missing");
  assert.match(tooFar.text, /has 2 pages on this phone, so there's no page 789/);
});

// ---------- ranking ----------

test("title words: key words required, extra subject words count against, vague titles noticed", () => {
  const q = "encyclopedia of the world";
  assert.equal(titleMatch(LOC_TITLE, q).exact, true);
  assert.deepEqual(titleMatch(RELIGIONS, q).extras, ["religion"]);
  assert.deepEqual(titleMatch(AMERICAN, q).extras, ["american", "indian", "contribution"]);
  assert.equal(titleMatch(VAGUE, q).all, false);
  assert.equal(isVagueTitle(VAGUE), true);
  assert.equal(isVagueTitle(LOC_TITLE), false);
  assert.equal(mainTitle(LOC_TITLE), "The world encyclopedia");
  assert.equal(mainTitle(STANFORD), "The encyclopedia of world history");
  assert.equal(titleMatch(STANFORD, "encyclopedia of world history").exact, true);
  assert.equal(titleMatch("The Encyclopaedia of World History, Vol. 2", "encyclopedia of world history").exact, true);
  assert.equal(titleMatch("Encyclopedia of World Religions", "encyclopedia of world religions").exact, true, "asked-for subject words are fine");
  assert.equal(isTitleQuery(q), true);
  assert.equal(isTitleQuery("FM 21-76"), false);
  assert.equal(isTitleQuery("Maine hunting regulations"), false);
  assert.equal(isTitleQuery("kubark", { book: true }), true);
  assert.equal(displayTitle(STANFORD), "The encyclopedia of world history: ancient, medieval, and modern, chronologically arranged");
  assert.equal(displayTitle("Encyclopedia of World History- Volume 4"), "Encyclopedia of World History, Volume 4");
  assert.equal(displayTitle("Encyclopedia of World History", 4), "Encyclopedia of World History, Volume 4");
  assert.equal(displayTitle("- World History Encyclopedia"), "World History Encyclopedia");
  assert.deepEqual(titleMatch("The World Book Encyclopedia, Volume 1", q).extras, ["book"], "World Book is another title");
  assert.equal(volumeOf("encyclopediaofworldhistoryvol4"), 4);
  assert.equal(volumeOf("Encyclopedia of World History, Vol. IV"), 4);
});

const rows = (titles) => titles.map((title, i) => ({ id: `r${i}`, title, url: `https://x.example.org/${i}.pdf`, downloadable: true, score: 1 }));

test("'encyclopedia of the world' keeps only that book: not World Religions, American Indian or World History", () => {
  const kept = filterByTitle(rows([RELIGIONS, AMERICAN, "Encyclopedia of World History, Volume 4", LOC_TITLE]), "encyclopedia of the world", { strict: true });
  assert.deepEqual(kept.map((r) => r.title), [LOC_TITLE]);
  // With no exact title, a near one (one extra word) is allowed, after; two extra words never are.
  const near = filterByTitle(rows([AMERICAN, RELIGIONS]), "encyclopedia of the world", { strict: true });
  assert.deepEqual(near.map((r) => r.title), [RELIGIONS]);
  // 'encyclopedia of world history': both World History copies, exact titles first, nothing else.
  const wh = filterByTitle(rows([RELIGIONS, LOC_TITLE, "Encyclopedia of World History, Volume 4", STANFORD, AMERICAN]), "encyclopedia of world history", { strict: true });
  assert.deepEqual(wh.map((r) => r.title).sort(), ["Encyclopedia of World History, Volume 4", STANFORD].sort());
  // Topic searches are only re-sorted, never filtered.
  assert.equal(filterByTitle(rows(["Sample Field Manual", "Big manual"]), "sample field manual").length, 2);
});

test("Dana's search end to end: archive.org 'Encyclopedia Of' gets its real title and volume, loc.gov its PDF, Religions and American Indian are gone", async () => {
  const calls = [];
  const fetchImpl = fakeFetch([
    { match: "https://html.duckduckgo.com/", type: "text/html", body: ddgPage([
      ["https://library.diplomatic.ac/encyclopedia-of-world-religions.pdf", RELIGIONS],
      ["https://mexika.org/wp-content/uploads/encyclopedia-american-indian-contributions.pdf", AMERICAN],
      ["https://archive.org/details/encyclopediaofworldhistoryvol4", VAGUE],
      ["https://www.loc.gov/item/01025634/", LOC_TITLE]
    ]) },
    { match: "https://library.diplomatic.ac/", method: "HEAD", headers: { "content-length": "5000000" } },
    { match: "https://mexika.org/", method: "HEAD", headers: { "content-length": "3000000" } },
    { match: "https://archive.org/metadata/encyclopediaofworldhistoryvol4", type: "application/json", body: IA_META },
    { match: IA_PDF, method: "HEAD", headers: { "content-length": "24013961" } },
    { match: "https://www.loc.gov/item/01025634/?fo=json", type: "text/html", status: 403, body: CLOUDFLARE },
    { match: "https://www.loc.gov/item/01025634/", type: "text/html", body: LOC_HTML },
    { match: LOC_PDF, method: "HEAD", headers: { "content-length": "201906146" } }
  ], calls);
  const world = await findDocuments({ fetchImpl, intent: documentIntent("Download the encyclopedia of the world") });
  assert.equal(world.ok, true);
  const titles = world.candidates.map((c) => c.title);
  assert.ok(!titles.some((t) => /RELIGIONS|American Indian/i.test(t)), titles.join(" | "));
  assert.ok(!titles.includes(VAGUE), "no 'Encyclopedia Of'");
  assert.equal(world.candidates[0].url, LOC_PDF);
  assert.equal(world.candidates[0].pageUrl, "https://www.loc.gov/item/01025634/");
  assert.match(world.candidates[0].title, /^The world encyclopedia; a library of ready reference/);
  assert.equal(world.candidates[0].format, "pdf");
  assert.equal(world.candidates[0].tooBig, true, "193 MB is over the 50 MB cap");
  assert.match(world.candidates[0].line, /^PDF · www\.loc\.gov|^PDF · loc\.gov/);
  // Only the query words went to the search engine; the rest are item addresses.
  const search = calls.filter((c) => /duckduckgo/.test(c.url));
  assert.equal(search.length, 1);
  assert.ok(calls.every((c) => c.init.credentials === "omit"));

  const history = await findDocuments({ fetchImpl, intent: { query: "encyclopedia of world history", format: "any", book: true } });
  const vol4 = history.candidates.find((c) => c.url === IA_PDF);
  assert.ok(vol4, history.candidates.map((c) => c.title).join(" | "));
  assert.equal(vol4.title, "Encyclopedia of World History, Volume 4");
  assert.equal(vol4.volume, 4);
  assert.equal(vol4.size, 24013961);
  assert.equal(vol4.downloadable, true);
  assert.match(vol4.line, /PDF · archive\.org · 2\d(?:\.\d)? MB · Volume 4 of a multi-volume set/);
  assert.ok(!history.candidates.some((c) => /RELIGIONS|American Indian|world encyclopedia;/i.test(c.title)));
});

// ---------- catalog resolvers ----------

test("catalog items: loc.gov and archive.org pages are recognized; https only", () => {
  assert.deepEqual(catalogItem("https://www.loc.gov/item/01025634/"), { kind: "loc", id: "01025634" });
  assert.deepEqual(catalogItem("https://archive.org/details/encyclopediaofworldhistoryvol4"), { kind: "ia", id: "encyclopediaofworldhistoryvol4" });
  assert.equal(catalogItem("http://www.loc.gov/item/01025634/"), null);
  assert.equal(catalogItem("https://example.org/item/1/"), null);
  assert.equal(isLandingPage("https://www.loc.gov/item/01025634/"), true);
  assert.equal(isLandingPage("https://archive.org/details/x"), true);
  assert.equal(isLandingPage("https://example.org/guide.html"), false);
});

test("resolvers read loc.gov JSON (resources/files), its item page, and archive.org metadata", async () => {
  const locJson = { item: { title: "The world encyclopedia; a library of ready reference" }, resources: [{ files: [[{ mimetype: "image/jpeg", url: "https://tile.loc.gov/a.jpg" }], [{ mimetype: "application/pdf", url: LOC_PDF, size: 201906146 }]] }] };
  assert.deepEqual(locFiles(locJson).pdfs, [{ url: LOC_PDF, size: 201906146 }]);
  const html = locFilesFromHtml(LOC_HTML);
  assert.deepEqual(html.pdfs.map((p) => p.url), [LOC_PDF]);
  assert.match(html.title, /^The world encyclopedia; a library of ready reference/);
  const ia = iaFiles(JSON.parse(IA_META), "encyclopediaofworldhistoryvol4");
  assert.equal(ia.pdfs[0].url, IA_PDF);
  assert.equal(ia.title, "Encyclopedia of World History- Volume 4");
  assert.equal(ia.volume, 4);

  const viaJson = await resolveItem({ fetchImpl: fakeFetch([{ match: "https://www.loc.gov/item/01025634/?fo=json", type: "application/json", body: JSON.stringify(locJson) }]), url: "https://www.loc.gov/item/01025634/" });
  assert.equal(viaJson.ok, true);
  assert.equal(viaJson.url, LOC_PDF);
  assert.equal(viaJson.size, 201906146);
  const viaIa = await resolveItem({ fetchImpl: fakeFetch([{ match: "https://archive.org/metadata/", type: "application/json", body: IA_META }]), url: "https://archive.org/details/encyclopediaofworldhistoryvol4" });
  assert.equal(viaIa.ok, true);
  assert.equal(viaIa.url, IA_PDF);
  assert.equal(viaIa.size, 24013961);
});

test("a catalog page with no resolvable file is 'Web page, opens in browser' and is never downloaded", async () => {
  const fetchImpl = fakeFetch([
    { match: "https://html.duckduckgo.com/", type: "text/html", body: ddgPage([["https://www.loc.gov/item/99999999/", "The world encyclopedia"]]) },
    { match: "https://www.loc.gov/item/99999999/", type: "text/html", body: CLOUDFLARE }
  ]);
  const failed = await resolveItem({ fetchImpl, url: "https://www.loc.gov/item/99999999/" });
  assert.equal(failed.ok, false);
  const found = await findDocuments({ fetchImpl, intent: documentIntent("Download the encyclopedia of the world") });
  assert.equal(found.ok, true);
  const c = found.candidates[0];
  assert.equal(c.downloadable, false);
  assert.equal(c.format, "page");
  assert.match(c.line, /^Web page, opens in browser · (?:www\.)?loc\.gov/);
  assert.equal(candidateLine({ format: "page", site: "example.org" }), "Web page · example.org");
  const dl = await downloadDocument({ fetchImpl, candidate: c });
  assert.equal(dl.ok, false);
  assert.match(dl.reason, /catalog page, not the book file/);
});

test("the hot path is untouched and no eval, dev or paraphrase question becomes a page lookup", () => {
  const src = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  assert.doesNotMatch(src, /doc_resolve|doc_find|library_answer|doc_intents/);
  const prompts = [
    ...buildQuestions().map((q) => q.prompt),
    ...DEV_SET.map((q) => q.prompt || q.question || q.q || ""),
    ...PARAPHRASE_SET.map((q) => q.prompt || q.question || q.q || q.text || "")
  ].filter(Boolean);
  assert.ok(prompts.length > 400);
  assert.deepEqual(prompts.filter((p) => pageRequest(p)), []);
});
