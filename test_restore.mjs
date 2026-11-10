import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { calculate } from "./symbolic/calculator.js";
import {
  approveProposal,
  proposeAgents,
  readAgentLog,
  resetAgentLearning,
  setAgentEnabled,
  setLearningOptIn
} from "./symbolic/agents/host.js";

test("what is light quotes scripture and is not the arctic note", () => {
  const answer = ask("What is light?", { agents: false });
  assert.equal(answer.answered, true);
  assert.equal(answer.kind, "spiritual");
  assert.match(answer.text, /Bible \(KJV\), [^"]*\d+:\d+: "/);
  assert.match(answer.text, /\blight\b/i);
  assert.match(answer.text, /not a verdict/);
  assert.doesNotMatch(answer.text, /tundra|arctic/i);
  assert.match(answer.text, /"[^"]{20,}"/);
});

test("meaning of life quotes indexed lines and cites them", () => {
  const answer = ask("What is the meaning of life?", { agents: false });
  assert.equal(answer.answered, true);
  assert.equal(answer.kind, "spiritual");
  assert.match(answer.text, /Tao Te Ching|Dhammapada|Bible \(KJV\)|Bhagavad Gita|Kybalion/);
  assert.match(answer.text, /This is what these texts say/);
  assert.doesNotMatch(answer.text, /tundra/);
});

test("field frostbite and willow answers stay field notes", () => {
  const frost = ask("How do I treat frostbite?", { agents: false });
  assert.match(frost.text, /do not rub/i);
  assert.doesNotMatch(frost.text, /Bible \(KJV\)/);
  const willow = ask("What can willow bark be used for in a survival setting?", { agents: false });
  assert.match(willow.text, /salicin|analgesic/i);
  assert.match(willow.text, /willow/i);
});

test("off-topic notes abstain instead of a fluent wrong answer", () => {
  const whistle = ask("How many blasts are in the repeated whistle signal?", { agents: false });
  assert.match(whistle.text || "", /three|signal|whistle/i);
  assert.doesNotMatch(whistle.text || "", /repeated addition/);
  const france = ask("Which city is the capital of France?", { agents: false });
  assert.equal(france.answered, false);
  const cancer = ask("What plant in these notes cures cancer?", { agents: false });
  assert.equal(cancer.answered, false);
});

test("drying out reaches the dehydration note", () => {
  const answer = ask("Someone is drying out in the heat. What should they do?", { agents: false });
  assert.equal(answer.answered, true);
  assert.match(answer.text, /drink|shade|sweat/i);
});

test("calculator and unit conversion are exact", () => {
  assert.match(calculate("What is the sum of 2 and 2?").text, /\b4\b/);
  assert.match(calculate("How many meters are in 2 kilometers?").text, /2000/);
  assert.match(calculate("subtract 3 from 10").text, /\b7\b/);
  assert.match(calculate("10 kilograms to grams").text, /10000/);
  assert.match(calculate("30 miles per hour to kilometers per hour").text, /48\.28032/);
  assert.match(calculate("What is 50 Fahrenheit in Celsius?").text, /\b10\b/);
  const viaAsk = ask("How many meters are in 2 kilometers?", { agents: false });
  assert.match(viaAsk.text, /2000/);
  assert.equal(viaAsk.kind, "calculator");
});

test("a false premise is called out when the note rejects it", () => {
  const answer = ask("Should frostbitten skin be rubbed with snow?", { agents: false });
  assert.match(answer.text, /contradicts that premise/i);
  assert.match(answer.text, /do not rub/i);
});

test("agents log proposals and honor opt-out", () => {
  const before = readAgentLog().length;
  const missing = [
    path.join(os.tmpdir(), `yehsa-404-a-${process.pid}.txt`),
    path.join(os.tmpdir(), `yehsa-404-b-${process.pid}.txt`)
  ];
  fs.writeFileSync(missing[0], "404: Not Found\n");
  fs.writeFileSync(missing[1], "<html><title>404 Not Found</title></html>\n");
  const proposals = proposeAgents({
    question: "What dose cures this?",
    answer: { answered: true, text: "A note.", confidence: "ok" },
    files: missing
  });
  assert.ok(proposals.some((item) => item.agent === "corpus" && item.problems.length >= 2));
  assert.ok(readAgentLog().length > before);
  setLearningOptIn(false);
  const learner = proposals.find((item) => item.agent === "learner");
  assert.equal(approveProposal(learner).applied, false);
  setLearningOptIn(true);
  assert.equal(approveProposal(learner).applied, true);
  setAgentEnabled("learner", false);
  assert.equal(approveProposal(learner).applied, false);
  setAgentEnabled("learner", true);
  resetAgentLearning();
  assert.equal(fs.existsSync("symbolic_memory/agent_learning.json"), false);
});
