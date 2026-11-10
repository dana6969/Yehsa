// Score one Ask result against a frozen rubric. This file does not call Yehsa.

export function judge(question, result) {
  const text = String(result?.text || "");
  const answered = Boolean(result?.answered && text.trim());
  const abstained = !answered;
  const expect = question.expect || {};
  const hasAll = (expect.all || []).every((part) => includes(text, part));
  const hasAny = !(expect.any || []).length || (expect.any || []).some((part) => includes(text, part));
  const lacksForbidden = (expect.none || []).every((part) => !includes(text, part));
  const numberOk = expect.number == null || numberInText(text, expect.number, expect.tolerance);

  let pass = false;
  if (expect.kind === "abstain") pass = abstained;
  else if (expect.kind === "facts" || expect.kind === "number") {
    pass = answered && hasAll && hasAny && lacksForbidden && numberOk;
  } else if (expect.kind === "abstain_or_facts") {
    pass = abstained || (answered && hasAll && hasAny && lacksForbidden && numberOk);
  } else {
    throw new Error(`unknown rubric kind ${expect.kind} on ${question.id}`);
  }

  const wrongConfident = answered && !pass;
  let reason = "pass";
  if (!pass && expect.kind === "abstain") reason = "answered when silence was required";
  else if (!pass && abstained) reason = "abstained";
  else if (!pass && !lacksForbidden) reason = "endorsed a forbidden claim";
  else if (!pass && !numberOk) reason = "missing the required number";
  else if (!pass && (!hasAll || !hasAny)) reason = "missing a required fact";
  return { pass, wrongConfident, abstained, answered, reason };
}

function includes(text, part) {
  return text.toLowerCase().includes(String(part).toLowerCase());
}

function numberInText(text, value, tolerance = 0) {
  const numbers = text.match(/-?\d+(?:\.\d+)?/g) || [];
  return numbers.some((token) => Math.abs(Number(token) - Number(value)) <= tolerance);
}

const HEDGE = /\b(i(?:'| a)?m not sure|not sure|i do not know|i don't know|cannot tell|can't tell|unsure|might be wrong|not confident|unverified|i cannot say|i can't say)\b/i;

export function classifyOutcome(question, result) {
  const expectKind = question?.expect?.kind || result?.expectKind;
  const silent = result?.abstained === true || result?.answered === false;
  if (silent) {
    const appropriate = expectKind === "abstain" || expectKind === "abstain_or_facts";
    return appropriate ? "appropriate-abstention" : "unnecessary-refusal";
  }
  if (result?.pass === true) return "correct";
  return HEDGE.test(String(result?.text || "")) ? "incorrect-hedged" : "incorrect-confident";
}

export function tallyOutcomes(items) {
  const counts = {
    correct: 0,
    incorrectConfident: 0,
    incorrectHedged: 0,
    appropriateAbstention: 0,
    unnecessaryRefusal: 0
  };
  for (const item of items) {
    const outcome = item.outcome || classifyOutcome({ expect: { kind: item.expectKind } }, item);
    if (outcome === "correct") counts.correct += 1;
    else if (outcome === "incorrect-confident") counts.incorrectConfident += 1;
    else if (outcome === "incorrect-hedged") counts.incorrectHedged += 1;
    else if (outcome === "appropriate-abstention") counts.appropriateAbstention += 1;
    else if (outcome === "unnecessary-refusal") counts.unnecessaryRefusal += 1;
    else throw new Error(`unknown outcome ${outcome} on ${item.id}`);
  }
  const incorrect = counts.incorrectConfident + counts.incorrectHedged;
  const refusals = counts.appropriateAbstention + counts.unnecessaryRefusal;
  const total = counts.correct + incorrect + refusals;
  return { ...counts, incorrect, refusals, total };
}

export function selfCheck() {
  const checks = [
    judge({ id: "a", expect: { kind: "abstain" } }, { answered: false, text: null }).pass === true,
    judge({ id: "b", expect: { kind: "facts", all: ["boil"] } }, { answered: true, text: "Boil the water." }).pass === true,
    judge({ id: "c", expect: { kind: "facts", all: ["boil"] } }, { answered: true, text: "A watershed drains." }).wrongConfident === true,
    judge({ id: "d", expect: { kind: "facts", all: ["boil"], none: ["watershed"] } }, { answered: true, text: "Boil it. A watershed drains." }).pass === false,
    judge({ id: "e", expect: { kind: "number", number: 13, tolerance: 0, all: [] } }, { answered: true, text: "The sum is 13." }).pass === true,
    judge({ id: "f", expect: { kind: "number", number: 13, tolerance: 0, all: [] } }, { answered: true, text: "Addition combines quantities." }).wrongConfident === true,
    judge({ id: "g", expect: { kind: "abstain_or_facts", all: ["not a dose"] } }, { answered: false, text: null }).pass === true,
    judge({ id: "h", expect: { kind: "number", number: 111.19, tolerance: 0.001, all: ["6371"] } }, { answered: true, text: "111.19 km. Radius 6371 km." }).pass === true,
    judge({ id: "i", expect: { kind: "abstain" } }, { answered: true, text: "Paris." }).wrongConfident === true,
    judge({ id: "i", expect: { kind: "abstain" } }, { answered: true, text: "Paris." }).reason === "answered when silence was required",
    classifyOutcome({ expect: { kind: "facts" } }, { pass: true, abstained: false, text: "Boil the water." }) === "correct",
    classifyOutcome({ expect: { kind: "facts" } }, { pass: false, abstained: false, text: "The capital is Paris." }) === "incorrect-confident",
    classifyOutcome({ expect: { kind: "facts" } }, { pass: false, abstained: false, text: "I am not sure that is right." }) === "incorrect-hedged",
    classifyOutcome({ expect: { kind: "abstain" } }, { pass: true, abstained: true, text: "" }) === "appropriate-abstention",
    classifyOutcome({ expect: { kind: "facts" } }, { pass: false, abstained: true, text: "" }) === "unnecessary-refusal"
  ];
  if (checks.some((ok) => !ok)) throw new Error("score self-check failed");
}
