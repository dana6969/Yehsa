// R7: web quotes must be about the subject ("kubark" must appear), and page chrome is stripped.
import assert from "node:assert/strict";
import test from "node:test";
import { buildAnswer, cleanQuote } from "./symbolic/web/answer_builder.js";

test("snippets lose cache-busters, bare addresses, timestamps and a trailing site/date", () => {
  assert.equal(cleanQuote("The manual covers interrogation methods in detail, officials said on example.com, Nov 24, 2026."), "The manual covers interrogation methods in detail, officials said.");
  assert.doesNotMatch(cleanQuote("Burns are graded by depth and size of the injury area today _=1795557549451"), /_=|\d{10}/);
  assert.doesNotMatch(cleanQuote("See the full report at https://site.org/a?utm_source=x#frag for the details of it."), /utm|#frag/);
});

test("a chapter or summary question never quotes an unrelated page that only says 'chapter'", () => {
  const candidates = [
    { kind: "web", title: "Burn care manual", url: "https://a.example/burns", text: "Chapter 3 explains how burns are cooled with clean running water for twenty minutes before covering." },
    { kind: "web", title: "KUBARK Counterintelligence Interrogation", url: "https://b.example/kubark", text: "The KUBARK manual describes the structure of a counterintelligence interrogation and the screening of sources in its chapters." }
  ];
  const got = buildAnswer({ question: "give me chapters of kubark", candidates });
  if (got) {
    assert.doesNotMatch(JSON.stringify(got), /burns are cooled/);
    assert.match(JSON.stringify(got), /KUBARK/);
  }
  assert.equal(buildAnswer({ question: "give me chapters of kubark", candidates: [candidates[0]] }), null);
  assert.equal(buildAnswer({ question: "give me a summary of the chapters", candidates }), null, "no subject words at all");
});
