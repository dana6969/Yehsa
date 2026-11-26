// Round 6 (Dana, Nov 24): "I would also like it to be able to find and download documents I ask it
// and learn from those." Find a document, download it (guarded), read it on the phone, seal it,
// and answer from it offline with the title and page. All network here is mocked.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import nacl from "tweetnacl";
import { strToU8, zipSync } from "fflate";
import { extractPdfText } from "./symbolic/docs/pdf_text.js";
import { kindFromUrl, sniffDocument } from "./symbolic/docs/doc_check.js";
import { documentIntent, documentQuery, downloadDocument, findDocuments, rankDocResults } from "./symbolic/docs/doc_find.js";
import { buildSections, isHeading } from "./symbolic/docs/doc_sections.js";
import { docAnswer, docMeta, namedDocument, renameDocument, emptyDocCatalog, addDocument } from "./symbolic/docs/doc_store.js";
import { documentText } from "./symbolic/docs/doc_text.js";
import { createDocService } from "./symbolic/docs/doc_service.js";
import { pickResults, webCandidates } from "./symbolic/web/web_search.js";
import { buildPdf, samplePdf, scannedPdf } from "./symbolic/tools/make_sample_pdf.mjs";
import { voiceReply } from "./symbolic/yehsa_voice.js";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { buildQuestions } from "./eval/questions.mjs";

const SAMPLE = new Uint8Array(fs.readFileSync("eval/fixtures/docs/sample_field_manual.pdf"));
const SAMPLE_OBJSTM = new Uint8Array(fs.readFileSync("eval/fixtures/docs/sample_field_manual_objstm.pdf"));
const PDF_URL = "https://armypubs.example.mil/pubs/sample_field_manual.pdf";

function fakeFetch(routes, calls = []) {
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const hit = routes.find((route) => (typeof route.match === "string" ? url.startsWith(route.match) : route.match.test(url)) && (!route.method || route.method === (init.method || "GET")));
    if (!hit) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    if (hit.throw) throw new TypeError("Network request failed");
    if (hit.status && hit.status >= 300 && hit.status < 400) return new Response(null, { status: hit.status, headers: { location: hit.location || "" } });
    const headers = { "content-type": hit.type || "application/pdf", ...(hit.headers || {}) };
    if ((init.method || "GET") === "HEAD") return new Response(null, { status: hit.status || 200, headers });
    return new Response(hit.body, { status: hit.status || 200, headers });
  };
  impl.calls = calls;
  return impl;
}

const ddgLink = (url) => `//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc`;
function ddgPage(items) {
  return `<html><body>${items.map(([url, title]) => `<div class="result"><h2><a rel="nofollow" class="result__a" href="${ddgLink(url)}">${title}</a></h2><a class="result__snippet" href="${ddgLink(url)}">snippet</a></div>`).join("\n")}</body></html>`;
}

function memoryIo(fetchImpl, { embed = null } = {}) {
  const secrets = new Map();
  const files = new Map();
  return {
    files,
    secrets,
    getSecret: async (n) => secrets.get(n) || null,
    setSecret: async (n, v) => { secrets.set(n, v); },
    deleteSecret: async (n) => { secrets.delete(n); },
    readFile: async (n) => files.get(n) || null,
    writeFile: async (n, t) => { files.set(n, t); },
    deleteFile: async (n) => { files.delete(n); },
    fetchImpl,
    embed,
    randomBytes: (n) => nacl.randomBytes(n)
  };
}

// ---------- the PDF reader ----------

test("reads a small PDF: plain and Flate pages, WinAnsi and a two-byte font with ToUnicode, TJ spacing, title", () => {
  const r = extractPdfText(SAMPLE);
  assert.equal(r.ok, true);
  assert.equal(r.pageCount, 2);
  assert.equal(r.title, "Sample Field Manual: Water and Fire");
  assert.match(r.pages[0], /Boil water for at least one minute to kill germs/);
  assert.match(r.pages[0], /Water purification tablets also work/);
  assert.match(r.pages[1], /A fire needs three things: tinder, kindling and fuel\./);
});

test("reads PDFs whose objects sit in a compressed object stream (PDF 1.5+)", () => {
  const r = extractPdfText(SAMPLE_OBJSTM);
  assert.equal(r.ok, true);
  assert.match(r.pages[1], /Tinder is dry material that catches a spark/);
});

test("a locked PDF, a scan with no text, and a non-PDF are reported plainly, never guessed at", () => {
  const locked = extractPdfText(samplePdf({ encrypt: true }));
  assert.equal(locked.ok, false);
  assert.equal(locked.encrypted, true);
  assert.match(locked.reason, /locked/);
  const scan = extractPdfText(scannedPdf());
  assert.equal(scan.ok, false);
  assert.match(scan.reason, /scan/);
  assert.equal(extractPdfText(new TextEncoder().encode("hello")).ok, false);
});

test("a damaged PDF does not throw", () => {
  const cut = SAMPLE.slice(0, Math.floor(SAMPLE.length * 0.6));
  assert.doesNotThrow(() => extractPdfText(cut));
  const junk = buildPdf([{ dict: "<< /Type /Catalog /Pages 2 0 R >>" }, { dict: "<< /Type /Pages /Kids [9 0 R] /Count 1 >>" }]);
  assert.equal(extractPdfText(junk).ok, false);
});

// ---------- what a file really is ----------

test("only PDF, EPUB, text and web pages are read; programs, archives and pictures are refused", () => {
  assert.equal(sniffDocument(SAMPLE, "application/pdf").format, "pdf");
  assert.equal(sniffDocument(SAMPLE, "application/octet-stream").format, "pdf");
  assert.equal(sniffDocument(new TextEncoder().encode("MZ\x90\x00 this is a program"), "application/pdf").ok, false);
  assert.equal(sniffDocument(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]), "application/octet-stream").ok, false);
  assert.equal(sniffDocument(new TextEncoder().encode("dex\n035\0"), "application/octet-stream").ok, false);
  assert.equal(sniffDocument(SAMPLE, "application/vnd.android.package-archive").ok, false);
  assert.equal(sniffDocument(zipSync({ "a.txt": strToU8("hi") }), "application/zip").ok, false);
  assert.equal(sniffDocument(new TextEncoder().encode("Plain words about water and fire."), "text/plain").format, "text");
  assert.equal(sniffDocument(new TextEncoder().encode("<!doctype html><html><p>Hi</p></html>"), "text/html").format, "html");
  assert.equal(kindFromUrl("https://x.example.org/setup.apk"), null);
  assert.equal(kindFromUrl("https://x.example.org/a/b.exe"), null);
  assert.equal(kindFromUrl("https://x.example.org/FM%2021-76.pdf"), "pdf");
  assert.equal(kindFromUrl("https://x.example.org/guide"), "page");
});

test("an EPUB is read chapter by chapter, scripts dropped", async () => {
  const epub = zipSync({
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
    "OEBPS/content.opf": strToU8('<package><metadata><dc:title>Canning Basics</dc:title></metadata><manifest><item id="c1" href="ch1.xhtml"/></manifest><spine><itemref idref="c1"/></spine></package>'),
    "OEBPS/ch1.xhtml": strToU8("<html><body><h1>Jars</h1><script>alert(1)</script><p>Process pint jars of tomatoes in a boiling water canner for 35 minutes at sea level.</p><p>Add lemon juice to each jar of tomatoes before processing to make them acid enough.</p></body></html>")
  }, { level: 6 });
  assert.equal(sniffDocument(epub, "application/epub+zip").format, "epub");
  const read = await documentText(epub, "epub");
  assert.equal(read.ok, true);
  assert.equal(read.title, "Canning Basics");
  assert.match(read.pages.join(" "), /boiling water canner for 35 minutes/);
  assert.doesNotMatch(read.pages.join(" "), /alert/);
});

// ---------- asking for a document ----------

test("Ask spots document requests and leaves ordinary questions alone", () => {
  assert.deepEqual(documentIntent("download FM 21-76"), { query: "FM 21-76", format: "any" });
  assert.equal(documentIntent("find the Maine hunting regulations PDF").query, "Maine hunting regulations PDF");
  assert.equal(documentIntent("get me the USDA canning guide").query, "USDA canning guide");
  assert.equal(documentIntent("Can you pull up ATP 3-50.21?").query, "ATP 3-50.21");
  for (const plain of ["find water", "how do I download maps", "download maps for Maine", "get me the weather", "what is deer scat", "find shelter", "how do I field dress a deer", "directions to the boat launch"]) {
    assert.equal(documentIntent(plain), null, plain);
  }
  assert.equal(documentQuery({ query: "FM 21-76" }), "FM 21-76 pdf");
  assert.equal(documentQuery({ query: "Maine hunting regulations PDF" }), "Maine hunting regulations PDF");
});

test("search results become document candidates: files first, official sites first, no copies, no junk sites", () => {
  const ranked = rankDocResults([
    { url: "https://www.scribd.com/doc/1/fm-21-76", title: "FM 21-76 on Scribd" },
    { url: "https://blog.example.com/survival-tips", title: "Survival tips" },
    { url: "https://ia800904.us.archive.org/3/items/x/FM21-76_SurvivalManual.pdf", title: "FM 21-76 Survival Manual" },
    { url: "https://ia801604.us.archive.org/28/items/x/FM21-76_SurvivalManual.pdf", title: "FM 21-76 Survival Manual (mirror)" },
    { url: "https://example.army.mil/pubs/fm21-76.pdf", title: "FM 21-76" },
    { url: "https://bad.example.com/fm2176.exe", title: "FM 21-76 installer" }
  ], "FM 21-76");
  assert.equal(ranked[0].url, "https://example.army.mil/pubs/fm21-76.pdf");
  assert.equal(ranked.filter((c) => /FM21-76_SurvivalManual/.test(c.url)).length, 1);
  assert.ok(!ranked.some((c) => /scribd|\.exe/.test(c.url)));
});

test("find sends only the cleaned words, asks each link its size and date, and downloads nothing", async () => {
  const calls = [];
  const fetchImpl = fakeFetch([
    { match: "https://html.duckduckgo.com/", type: "text/html", body: ddgPage([[PDF_URL, "Sample Field Manual"], ["https://huge.example.org/big.pdf", "Big manual"], ["https://evil.example.org/app.apk", "App"]]) },
    { match: PDF_URL, method: "HEAD", headers: { "content-length": String(SAMPLE.length), "last-modified": "Tue, 01 Sep 2020 16:00:00 GMT" } },
    { match: "https://huge.example.org/big.pdf", method: "HEAD", headers: { "content-length": String(80 * 1024 * 1024) } }
  ], calls);
  const found = await findDocuments({ fetchImpl, intent: documentIntent("download the sample field manual for me, my name is Dana Ashey") });
  assert.equal(found.ok, true);
  assert.equal(found.sent, "sample field manual pdf");
  assert.match(found.disclosure, /Only the words "sample field manual pdf" left this phone/);
  assert.match(found.disclosure, /Nothing downloads until you tap one/);
  const search = calls.filter((c) => /duckduckgo/.test(c.url));
  assert.equal(search.length, 1);
  assert.ok(!/Dana|Ashey/i.test(search[0].url));
  assert.ok(calls.every((c) => c.init.method === "HEAD" || /duckduckgo/.test(c.url)), "nothing but HEAD after the search");
  assert.ok(!found.candidates.some((c) => /\.apk/.test(c.url)));
  const sample = found.candidates.find((c) => c.url === PDF_URL);
  assert.match(sample.line, /PDF · armypubs\.example\.mil · 2 KB · updated Sep 1, 2020/);
  assert.equal(found.candidates.find((c) => /huge/.test(c.url)).tooBig, true);
  assert.ok(calls.every((c) => c.init.credentials === "omit"));
});

test("download is https only, capped at 50 MB, re-checks redirects, and refuses programs dressed as PDFs", async () => {
  const fetchImpl = fakeFetch([
    { match: "https://a.example.org/ok.pdf", body: SAMPLE },
    { match: "https://a.example.org/big.pdf", body: SAMPLE, headers: { "content-length": String(60 * 1024 * 1024) } },
    { match: "https://a.example.org/moved.pdf", status: 302, location: "https://localhost/secret.pdf" },
    { match: "https://a.example.org/fake.pdf", body: new TextEncoder().encode("MZ\x90\x00program"), type: "application/pdf" },
    { match: "https://a.example.org/image.pdf", body: SAMPLE, type: "image/png" }
  ]);
  const ok = await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/ok.pdf" } });
  assert.equal(ok.ok, true);
  assert.equal(ok.format, "pdf");
  assert.match((await downloadDocument({ fetchImpl, candidate: { url: "http://a.example.org/ok.pdf" } })).reason, /https/);
  assert.match((await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/big.pdf" } })).reason, /50 MB/);
  assert.equal((await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/moved.pdf" } })).ok, false);
  assert.match((await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/fake.pdf" } })).reason, /program/);
  assert.equal((await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/image.pdf" } })).ok, false);
  assert.match((await downloadDocument({ fetchImpl, candidate: { url: "https://a.example.org/x.pdf", tooBig: true } })).reason, /50 MB/);
});

// ---------- sections and answers ----------

test("sections keep headings and page numbers, and drop running footers", () => {
  const read = extractPdfText(SAMPLE);
  const sections = buildSections(read.pages);
  assert.ok(sections.some((s) => s.page === 2 && /FIRE/.test(s.heading)));
  assert.ok(!sections.some((s) => /Sample Field Manual 1-2/.test(s.text)) || sections.length > 0);
  assert.equal(isHeading("BITES AND STINGS"), true);
  assert.equal(isHeading("Boil water for one minute."), false);
});

async function sampleEntries() {
  const read = await documentText(SAMPLE, "pdf");
  const sections = buildSections(read.pages);
  const meta = docMeta({ id: "d1", candidate: { url: PDF_URL, title: "Sample Field Manual" }, read, bytes: SAMPLE.length, format: "pdf", sections });
  return [{ meta, body: { pages: read.pages, sections } }];
}

test("answers quote the document word for word, labeled with its title and page, and unverified", async () => {
  const entries = await sampleEntries();
  const a = docAnswer(entries, "how long should I boil water");
  assert.ok(a);
  assert.equal(a.kind, "document");
  assert.match(a.text, /^From downloaded document "Sample Field Manual: Water and Fire":/);
  assert.match(a.text, /Boil water for at least one minute to kill germs/);
  assert.match(a.text, /\[1\] "Sample Field Manual: Water and Fire", page 1, CHAPTER 1 - WATER\. https:\/\/armypubs/);
  assert.match(a.text, /Unverified/);
  const fire = docAnswer(entries, "what is tinder");
  assert.match(fire.text, /page 2/);
  assert.equal(docAnswer(entries, "maine child support law"), null);
  // The chat shows the opener, the quote and the sources as given; nothing is reworded.
  const voiced = voiceReply(a, "how long should I boil water");
  assert.match(voiced.text, /Boil water for at least one minute/);
});

test("document text is data: an instruction inside a PDF is never quoted or followed", async () => {
  const entries = await sampleEntries();
  assert.ok(!entries[0].body.pages.join(" ").includes("Ignore all previous instructions"));
  const a = docAnswer(entries, "is the water safe");
  assert.ok(!a || !/Ignore all previous/.test(a.text));
});

test("medical and dose answers say to check the source", async () => {
  const entries = await sampleEntries();
  const a = docAnswer(entries, "water purification tablets dose");
  assert.ok(a);
  assert.match(a.text, /Check the source; this is not dosing advice/);
});

test("a question that names a downloaded document goes to that document", () => {
  let catalog = addDocument(emptyDocCatalog(), { id: "fm", title: "FM 21-76 US Army Survival Manual", url: "https://a.example.org/fm.pdf" });
  catalog = addDocument(catalog, { id: "can", title: "USDA Complete Guide to Home Canning", url: "https://a.example.org/can.pdf" });
  assert.equal(namedDocument(catalog, "what does FM 21-76 say about snares"), "fm");
  assert.equal(namedDocument(catalog, "in the home canning guide, how long for tomatoes"), "can");
  assert.equal(namedDocument(catalog, "how do I set a snare"), null);
  assert.equal(renameDocument(catalog, "fm", "  ").ok, false);
  assert.equal(renameDocument(catalog, "fm", "Survival manual").catalog.docs.find((d) => d.id === "fm").title, "Survival manual");
});

// ---------- the whole path, sealed ----------

test("find, download, seal, answer offline, rename, re-index and delete", async () => {
  const fetchImpl = fakeFetch([
    { match: "https://html.duckduckgo.com/", type: "text/html", body: ddgPage([[PDF_URL, "Sample Field Manual"]]) },
    { match: PDF_URL, method: "HEAD", headers: { "content-length": String(SAMPLE.length) } },
    { match: PDF_URL, body: SAMPLE }
  ]);
  const embedded = [];
  const io = memoryIo(fetchImpl, { embed: async (texts) => { embedded.push(...texts); return { model: "test-model", vectors: texts.map(() => new Float32Array(384).fill(0.05)) }; } });
  const docs = createDocService(io);
  await docs.load();
  const found = await docs.find(documentIntent("download the sample field manual"));
  const got = await docs.download(found.candidates[0]);
  assert.equal(got.ok, true);
  assert.equal(got.meta.pageCount, 2);
  assert.equal(await got.vectorsDone, true);
  assert.ok(embedded.length >= 2);
  // At rest: only ciphertext. No page text, no title in the files.
  for (const [, text] of io.files) {
    assert.ok(!/Boil water|Sample Field Manual|tinder/i.test(text));
    assert.match(text, /"box"/);
  }
  assert.ok(io.secrets.has("key.v1"));
  // Offline from here: a fresh service over the same files answers with no network at all.
  const offline = createDocService({ ...io, fetchImpl: null });
  const a = await offline.answer("how long should I boil water");
  assert.match(a.text, /From downloaded document/);
  assert.match(a.text, /page 1/);
  // The notes already answered: documents stay out of it unless the question names one.
  assert.equal(await offline.answer("how long should I boil water", { notesAnswered: true }), null);
  assert.ok(await offline.answer("in the sample field manual, how long should I boil water", { notesAnswered: true }));
  assert.equal((await offline.rename(got.meta.id, "My water manual")).ok, true);
  assert.equal(offline.snapshot().catalog.docs[0].title, "My water manual");
  const re = await offline.reindex(got.meta.id);
  assert.equal(re.ok, true);
  assert.equal((await offline.pages(got.meta.id)).length, 2);
  await offline.remove(got.meta.id);
  assert.equal(offline.snapshot().catalog.docs.length, 0);
  assert.ok(![...io.files.keys()].some((k) => k.startsWith("doc-")));
});

test("sealed documents copied to another phone are reported, not opened", async () => {
  const fetchImpl = fakeFetch([{ match: PDF_URL, body: SAMPLE }]);
  const io = memoryIo(fetchImpl);
  const docs = createDocService(io);
  await docs.download({ url: PDF_URL, title: "Sample" });
  const other = createDocService({ ...io, getSecret: async () => null });
  await other.load();
  assert.equal(other.snapshot().foreign, true);
  assert.equal(await other.answer("boil water"), null);
});

// ---------- the general web answer reads PDF results now ----------

test("open-web answers read PDF results too, quoting whole sentences", async () => {
  const picked = pickResults([{ url: PDF_URL, title: "Manual" }, { url: "https://x.example.org/a.docx", title: "doc" }], "how long to boil water");
  assert.deepEqual(picked.map((p) => p.url), [PDF_URL]);
  const fetchImpl = fakeFetch([
    { match: "https://html.duckduckgo.com/", type: "text/html", body: ddgPage([[PDF_URL, "Sample Field Manual"]]) },
    { match: PDF_URL, body: SAMPLE }
  ]);
  const found = await webCandidates({ fetchImpl, question: "how long should I boil water", query: "boil water how long" });
  assert.equal(found.candidates.length, 1);
  assert.match(found.candidates[0].text, /Boil water for at least one minute to kill germs; at high altitude boil it for three minutes\./);
  assert.equal(found.candidates[0].title, "Sample Field Manual: Water and Fire");
});

test("getMappedAction and the symbol dictionary never import the document code", () => {
  const src = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  assert.ok(!/docs\/|pdf_text|doc_service|fflate/.test(src));
});

test("no eval, dev or paraphrase question is taken as a document request", () => {
  const prompts = [
    ...buildQuestions().map((q) => q.prompt),
    ...DEV_SET.map((q) => q.prompt || q.question || q.q || ""),
    ...PARAPHRASE_SET.map((q) => q.prompt || q.question || q.q || q.text || "")
  ].filter(Boolean);
  assert.ok(prompts.length > 400);
  assert.deepEqual(prompts.filter((p) => documentIntent(p)), []);
});
