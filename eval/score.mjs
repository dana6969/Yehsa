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
    judge({ id: "i", expect: { kind: "abstain" } }, { answered: true, text: "Paris." }).reason === "answered when silence was required"
  ];
  if (checks.some((ok) => !ok)) throw new Error("score self-check failed");
}
