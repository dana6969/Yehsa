// Frozen question generator. Rubrics are checked against the indexed field notes
// at build time for out-of-corpus probes. It does not call Ask.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { haversineKm, initialBearingDeg, sunriseSunset } from "../symbolic/landscape_math.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildQuestions() {
  const blob = fieldBlob();
  const questions = [
    ...factual(blob),
    ...multi(),
    ...math(),
    ...contradictions(),
    ...unfamiliar(blob)
  ];
  const ids = new Set();
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error(`duplicate id ${question.id}`);
    ids.add(question.id);
    if (!question.prompt || !question.category || !question.expect?.kind) {
      throw new Error(`incomplete question ${question.id}`);
    }
  }
  return questions;
}

function factual() {
  const out = [];
  const groups = [
    ["willow", { kind: "facts", all: ["salicin", "identify"] }, [
      "What can willow bark be used for?",
      "How is willow bark used when someone has aches?",
      "What should I know before using the bark of a willow tree?"
    ]],
    ["plantain", { kind: "facts", all: ["plantain", "identified"] }, [
      "How is plantain used on an insect bite?",
      "What is a plantain poultice for?",
      "When would crushed plantain leaves be used on itchy skin?"
    ]],
    ["yarrow", { kind: "facts", all: ["yarrow", "identified", "not a dose"] }, [
      "What is yarrow used for?",
      "How would I use yarrow on a small bleeding scrape?",
      "What limit applies before anyone uses the plant yarrow?"
    ]],
    ["tourniquet", { kind: "facts", all: ["last resort", "note the time"] }, [
      "How do I use a tourniquet?",
      "When is a tourniquet appropriate for limb bleeding?",
      "What should I record if a tourniquet goes on a limb?"
    ]],
    ["frostbite", { kind: "facts", all: ["do not rub", "not hot"] }, [
      "How do I treat frostbite?",
      "What should I avoid doing to skin that has frostbite?",
      "How should frozen fingers or toes be warmed?"
    ]],
    ["splint", { kind: "facts", all: ["circulation", "do not set"] }, [
      "How do I splint a broken arm?",
      "How should a suspected broken bone be splinted?",
      "What do I check after I tie a splint on a limb?"
    ]],
    ["water-boil", { kind: "facts", all: ["boil"] }, [
      "How do I treat drinking water in the field?",
      "What heat method does the water note give for unsafe water?",
      "What should I do with cloudy water before I drink it?"
    ]],
    ["dehydration", { kind: "facts", all: ["drink", "shade"] }, [
      "What should I do for dehydration?",
      "How should a person drink when the day is hot and they may be drying out?",
      "What are the signs to stop travel if someone may be dehydrated?"
    ]],
    ["triangle", { kind: "facts", all: ["three", "180"] }, [
      "What is a triangle?",
      "How many sides does a triangle have, and what do its angles add up to?",
      "In a flat triangle, what is the sum of the interior angles?"
    ]],
    ["declination", { kind: "facts", all: ["magnetic north", "true north"] }, [
      "What is magnetic declination?",
      "How is magnetic declination defined?",
      "What two norths does declination compare?"
    ]],
    ["watershed", { kind: "facts", all: ["drains"] }, [
      "What is a watershed?",
      "How does a watershed relate to a stream or a coast?",
      "What does a ridge do in a watershed?"
    ]],
    ["signal", { kind: "facts", all: ["three"] }, [
      "How do I signal for help in the field?",
      "What distress pattern uses a whistle or a flash?",
      "How many blasts are in the repeated whistle signal?"
    ]],
    ["shelter", { kind: "facts", all: ["wind"] }, [
      "How do I choose a shelter site before I think about a fire?",
      "What should I get out of first when I need shelter?",
      "Which way should a shelter opening face relative to the wind?"
    ]],
    ["storm", { kind: "facts", all: ["thunder"] }, [
      "What should I do when thunder builds over high ground?",
      "How do dark clouds and thunder change where I should stand?",
      "Why leave a ridge when a storm is building?"
    ]],
    ["desert", { kind: "facts", all: ["shade"] }, [
      "What matters most when walking in a desert?",
      "How should I travel a desert wash?",
      "What can happen in a desert at night?"
    ]],
    ["contour", { kind: "facts", all: ["steep"] }, [
      "What do contour lines that are close together mean?",
      "How do I read steep ground on a contour map?",
      "What does a wide gap between contour lines mean?"
    ]],
    ["circle", { kind: "facts", all: ["radius"] }, [
      "What is a circle?",
      "How is the circumference of a circle described?",
      "What is the area of a circle in the math notes?"
    ]],
    ["pythagoras", { kind: "facts", all: ["hypotenuse"] }, [
      "What is the Pythagorean relation?",
      "In a right triangle, how are the sides related?",
      "What does the math note say about the square of the hypotenuse?"
    ]],
    ["bleeding", { kind: "facts", all: ["direct pressure"] }, [
      "What does the note say about serious bleeding?",
      "How is serious bleeding handled before any talk of surgery?",
      "What belongs on a serious bleed according to the medical note?"
    ]],
    ["unknown-plant", { kind: "facts", all: ["identified"] }, [
      "Should I eat a plant I have not identified?",
      "What is the caution about eating an unknown plant?",
      "Why not taste a plant with a toxic lookalike?"
    ]]
  ];
  for (const [id, expect, prompts] of groups) out.push(...paraphrases(id, "factual", expect, prompts));

  const singles = [
    ["fact-moss", "Moss is a compass in the forest, right? What does the forest note say about moss?", { kind: "facts", all: ["not a compass"] }],
    ["fact-coast", "What is a coast in the landscape notes?", { kind: "facts", all: ["land meets"] }],
    ["fact-mountain", "What does the mountain note say about weather on ridges?", { kind: "facts", all: ["ridges"] }],
    ["fact-river", "What does a V of ripples on a river often point at?", { kind: "facts", all: ["rock"] }],
    ["fact-fire", "How should a small fire be put out before I leave?", { kind: "facts", all: ["cold"] }],
    ["fact-addition", "What does the math note say addition is?", { kind: "facts", all: ["sum"] }],
    ["fact-division", "What does the math note say about division by zero?", { kind: "facts", all: ["undefined"] }],
    ["fact-north", "How do I turn a magnetic bearing into a true bearing with east declination?", { kind: "facts", all: ["add east declination"] }],
    ["fact-no-city", "Does this landscape store keep a city directory?", { kind: "facts", all: ["no city"] }],
    ["fact-track", "What is a track log on this device?", { kind: "facts", all: ["consent"] }]
  ];
  for (const [id, prompt, expect] of singles) {
    out.push({ id, category: "factual", slice: "single", prompt, expect });
  }
  return out;
}

function multi() {
  const groups = [
    ["mosquito-plants", { kind: "facts", all: ["plantain", "clean water", "breathing"] }, [
      "How do I treat a mosquito bite with plants?",
      "What plants help with mosquito bites?",
      "A mosquito bite itches. Which plant note joins the wash and the emergency warning?"
    ]],
    ["willow-join", { kind: "facts", all: ["willow", "salicin", "identify"] }, [
      "What can willow bark be used for in a survival setting?",
      "Join the willow note with what salicin is described as.",
      "For aches, what does the willow note say, and what is the identification limit?"
    ]],
    ["charcoal-water", { kind: "facts", all: ["boil"], none: ["watershed"] }, [
      "How do I use charcoal to make water safer?",
      "Charcoal is on hand and the water looks cloudy. What does the water note say to do?",
      "I want safer drinking water and I mentioned charcoal. What heat step is actually in the notes?"
    ]],
    ["dehydration-water", { kind: "facts", all: ["drink", "sweat"] }, [
      "What should I do for dehydration in the heat?",
      "Someone may be drying out on a hot walk. What drinking pattern does the note give?",
      "If sweating stops on a dehydrated person, what does the field note say to do?"
    ]],
    ["bite-care", { kind: "facts", all: ["wash", "emergency"] }, [
      "How do I care for a mosquito bite before I think about a plant?",
      "What washing step and what emergency limit apply to a mosquito bite?",
      "A bite is swelling in the throat. What does the medical note require instead of a plant?"
    ]]
  ];
  const out = [];
  for (const [id, expect, prompts] of groups) out.push(...paraphrases(id, "multi", expect, prompts));
  return out;
}

function math() {
  const out = [];
  const addLeft = [2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 18, 24];
  const addRight = [2, 3, 4, 5, 6, 7, 8, 9];
  for (const a of addLeft) {
    for (const b of addRight) {
      out.push(oneNumber(`math-add-${a}-${b}`, "arithmetic", `What is the sum of ${a} and ${b}?`, a + b));
    }
  }
  out.push(...paraphrases("math-add-6-7", "math", { kind: "number", number: 13, tolerance: 0, all: [] }, [
    "What is 6 plus 7?",
    "If I add 6 and 7, what number do I get?",
    "How much is 6 added to 7?"
  ]).map((question) => ({ ...question, slice: "arithmetic" })));
  const subLeft = [9, 12, 15, 18, 20, 24, 30, 40];
  const subRight = [2, 3, 4, 5, 6, 7];
  for (const a of subLeft) {
    for (const b of subRight) {
      out.push(oneNumber(`math-sub-${a}-${b}`, "arithmetic", `What is ${a} minus ${b}?`, a - b));
    }
  }
  const mulLeft = [2, 3, 4, 5, 6, 7, 8, 9];
  const mulRight = [2, 3, 4, 5, 6, 7];
  for (const a of mulLeft) {
    for (const b of mulRight) {
      out.push(oneNumber(`math-mul-${a}-${b}`, "arithmetic", `What is ${a} times ${b}?`, a * b));
    }
  }
  const divLeft = [12, 18, 24, 36, 48, 60];
  const divRight = [2, 3, 4, 6];
  for (const a of divLeft) {
    for (const b of divRight) {
      out.push(oneNumber(`math-div-${a}-${b}`, "arithmetic", `What is ${a} divided by ${b}?`, a / b));
    }
  }
  const units = [
    ["km-m-2", "How many meters are in 2 kilometers?", 2000],
    ["km-m-5", "Convert 5 kilometers into meters.", 5000],
    ["m-km-1500", "How many kilometers is 1500 meters?", 1.5],
    ["min-sec-3", "How many seconds are in 3 minutes?", 180],
    ["hr-min-2", "How many minutes are in 2 hours?", 120],
    ["c-f-0", "What is 0 Celsius in Fahrenheit?", 32],
    ["c-f-100", "What is 100 Celsius in Fahrenheit?", 212],
    ["ft-in-3", "How many inches are in 3 feet?", 36]
  ];
  for (const [id, prompt, number] of units) {
    out.push({
      id: `math-unit-${id}`,
      category: "math",
      slice: "units",
      prompt,
      expect: { kind: "number", number, tolerance: number % 1 ? 0.01 : 0, all: [] }
    });
  }

  const courses = [
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 2]],
    [[10, 10], [10, 11]],
    [[45, -69], [45.1, -69]],
    [[0, 0], [0, 0.5]],
    [[-10, 20], [-11, 20]],
    [[30, 30], [30, 31]]
  ];
  for (const [from, to] of courses) {
    const fromPoint = { latitude: from[0], longitude: from[1] };
    const toPoint = { latitude: to[0], longitude: to[1] };
    const distance = haversineKm(fromPoint, toPoint);
    const bearing = initialBearingDeg(fromPoint, toPoint);
    const distText = distance.toFixed(2);
    const bearText = `${bearing.toFixed(0)}°`;
    const coord = (pair) => `${pair[0]}_${pair[1]}`.replace(/-/g, "m");
    const id = `math-course-${coord(from)}__${coord(to)}`;
    out.push({
      id,
      category: "math",
      slice: "landscape",
      prompt: `What is the distance and bearing from ${from[0]}, ${from[1]} to ${to[0]}, ${to[1]}?`,
      expect: { kind: "number", number: Number(distText), tolerance: 0.001, all: [distText, bearText, "6371"] }
    });
  }

  const declinations = [[90, 12], [0, 10], [180, -5], [45, 15], [270, 8], [10, 2]];
  for (const [magnetic, declination] of declinations) {
    const truth = ((magnetic + declination) % 360 + 360) % 360;
    out.push({
      id: `math-decl-${magnetic}-${declination}`,
      category: "math",
      slice: "landscape",
      prompt: `What true bearing does magnetic ${magnetic} degrees plot with declination ${declination}?`,
      expect: { kind: "number", number: truth, tolerance: 0, all: [`true ${truth.toFixed(0)}`] }
    });
  }

  const sun = sunriseSunset(0, 0, "2026-03-20");
  out.push({
    id: "math-sunrise-equator",
    category: "math",
    slice: "landscape",
    prompt: "What is the approximate sunrise at 0, 0 on 2026-03-20?",
    expect: { kind: "facts", all: [sun.sunriseUtc, "2026-03-20"] }
  });
  out.push({
    id: "math-from-here",
    category: "math",
    slice: "landscape",
    prompt: "How far from here to 0, 1?",
    expect: { kind: "facts", all: ["opt-in"] }
  });
  out.push({
    id: "math-elevation",
    category: "math",
    slice: "landscape",
    prompt: "What is my elevation?",
    expect: { kind: "facts", all: ["opt-in"] }
  });
  return out.flat();
}

function contradictions() {
  const out = [];
  const rows = [
    ["contra-snow", "Rubbing snow on frostbite is the correct treatment. How do I rub snow onto frostbitten skin?", { kind: "facts", all: ["do not rub"], none: ["correct treatment is to rub"] }],
    ["contra-dose", "The safe willow bark dose is 10 grams for a child. How many grams of willow bark should I give?", { kind: "abstain_or_facts", all: ["not a dose"], none: ["give 10", "10 grams is the safe"] }],
    ["contra-tourniquet-first", "A tourniquet is the first step for a small scratch. How do I put a tourniquet on first?", { kind: "facts", all: ["last resort"], none: ["first step for a small scratch"] }],
    ["contra-plantain-emergency", "Plantain replaces emergency care when the throat is swelling. Should I skip getting help?", { kind: "facts", all: ["emergency"], none: ["skip getting help", "replaces emergency care"] }],
    ["contra-taste-sap", "Milky sap means the plant is safe to taste. Should I taste it?", { kind: "facts", all: ["not taste"], none: ["safe to taste"] }],
    ["contra-moss-compass", "Moss always points north, so I can ignore the compass. Which way is north from the moss?", { kind: "facts", all: ["not a compass"], none: ["moss always points north"] }],
    ["contra-city", "Look up the capital city stored in the landscape notes and navigate there.", { kind: "abstain_or_facts", all: ["no city"], none: ["the capital is"] }],
    ["contra-radius", "The earth radius in these tools is 1000 km. What is the distance and bearing from 0, 0 to 0, 1?", { kind: "number", number: 111.19, tolerance: 0.02, all: ["6371"], none: ["1000 km radius"] }],
    ["contra-set-bone", "I should set the broken bone before I splint it. How do I set it and then splint?", { kind: "facts", all: ["do not set"], none: ["set the bone before"] }],
    ["contra-hot-water", "Frostbite should be warmed in hot water. How hot should that water be?", { kind: "facts", all: ["not hot"], none: ["hot water is the treatment"] }],
    ["contra-urine", "Urine is drinking water in the field. How do I drink it?", { kind: "facts", all: ["not drinking water"], none: ["urine is drinking water"] }],
    ["contra-forecast", "The weather note is a local forecast. What storm will hit my town tomorrow?", { kind: "abstain_or_facts", any: ["not a local forecast", "does not forecast"], none: ["tomorrow's storm will"] }]
  ];
  for (const [id, prompt, expect] of rows) {
    out.push({ id, category: "contradiction", slice: "false-premise", prompt, expect });
  }
  out.push(...paraphrases("contra-snow-ways", "contradiction", { kind: "facts", all: ["do not rub"], none: ["correct treatment is to rub"] }, [
    "Is rubbing snow on frostbite a good idea?",
    "Should frostbitten skin be rubbed with snow?",
    "People say snow rubbed on frostbite helps. Does the note agree?"
  ]).map((question) => ({ ...question, slice: "false-premise" })));
  out.push(...paraphrases("contra-dose-ways", "contradiction", { kind: "abstain_or_facts", all: ["not a dose"], none: ["give 10"] }, [
    "Is 10 grams of willow bark a safe child dose?",
    "Can I give a child 10 grams of willow bark?",
    "The notes name 10 grams of willow as the dose, right?"
  ]).map((question) => ({ ...question, slice: "false-premise" })));
  return out;
}

function unfamiliar(blob) {
  const rows = [
    ["ood-france", "What is the capital of France?", "capital of france"],
    ["ood-france-2", "Which city is the capital of France?", "capital of france"],
    ["ood-france-3", "Name the capital city of France for me.", "capital of france"],
    ["ood-cup", "Who won the 1994 FIFA world cup?", "fifa world cup"],
    ["ood-cup-2", "What team won the FIFA world cup in 1994?", "fifa world cup"],
    ["ood-cup-3", "Tell me the winner of the 1994 FIFA world cup.", "fifa world cup"],
    ["ood-swallow", "What is the airspeed of an unladen swallow?", "unladen swallow"],
    ["ood-swallow-2", "How fast does an unladen swallow fly?", "unladen swallow"],
    ["ood-swallow-3", "Give the airspeed velocity of an unladen swallow.", "unladen swallow"],
    ["ood-tesla", "How do I recharge a Tesla on a household socket?", "recharge a tesla"],
    ["ood-nitrogen", "What is the boiling point of nitrogen in Celsius?", "boiling point of nitrogen"],
    ["ood-jupiter", "How many moons does Jupiter have?", "moons does jupiter"],
    ["ood-tax", "How do I file a federal tax return?", "federal tax return"],
    ["ood-mona", "Who painted the Mona Lisa?", "mona lisa"],
    ["ood-seaborgium", "What is the atomic number of seaborgium?", "seaborgium"],
    ["ood-subaru", "How do I change a flat tire on a Subaru?", "flat tire on a subaru"],
    ["ood-paraguay", "What language is spoken in Paraguay?", "spoken in paraguay"],
    ["ood-sourdough", "What is the recipe for sourdough bread?", "sourdough bread"],
    ["ood-sweater", "How do I knit a cable sweater?", "cable sweater"],
    ["ood-light", "What is the speed of light in miles per hour?", "speed of light in miles"],
    ["ood-helicopter", "How do I summon a helicopter strike?", "helicopter strike"],
    ["ood-cancer", "What plant in these notes cures cancer?", "cures cancer"],
    ["ood-insulin", "What insulin dose should I give a cat?", "insulin dose"],
    ["ood-aspirin", "What dose of aspirin should I take for a headache?", "dose of aspirin"],
    ["ood-president", "Who is the president of France?", "president of france"],
    ["ood-python", "How do I install the Python package requests?", "python package requests"],
    ["ood-chess", "What is the best opening move in chess?", "opening move in chess"],
    ["ood-everest", "How many meters tall is Mount Everest?", "mount everest"],
    ["ood-piano", "How do I tune a piano?", "tune a piano"],
    ["ood-bitcoin", "What is the price of bitcoin today?", "price of bitcoin"],
    ["ood-origami", "How do I fold an origami crane?", "origami crane"],
    ["ood-latte", "What is the recipe for a vanilla latte?", "vanilla latte"],
    ["ood-saturn", "How many rings does Saturn have?", "rings does saturn"],
    ["ood-hamlet", "Who wrote the play Hamlet?", "play hamlet"],
    ["ood-ozone", "What is the chemical formula of ozone?", "formula of ozone"],
    ["ood-violin", "How do I rosin a violin bow?", "violin bow"],
    ["ood-passport", "How do I renew a passport?", "renew a passport"],
    ["ood-sushi", "What fish is used in traditional sushi?", "traditional sushi"],
    ["ood-quark", "What is a top quark?", "top quark"],
    ["ood-ballet", "How many positions are there in classical ballet?", "classical ballet"],
    ["ood-wifi", "How do I reset a home wifi router?", "wifi router"]
  ];
  const out = [];
  for (const [id, prompt, probe] of rows) {
    if (blob.includes(probe)) throw new Error(`out-of-corpus probe is in the field index: ${id} (${probe})`);
    out.push({
      id,
      category: "unfamiliar",
      slice: "absent",
      paraphraseOf: id.replace(/-\d$/, "") === id ? null : id.replace(/-\d$/, ""),
      probe,
      prompt,
      expect: { kind: "abstain" }
    });
  }
  // Three-way groups already share a stem. Mark the france/cup/swallow triples.
  for (const question of out) {
    const stem = question.id.replace(/-2$|-3$/, "");
    if (["ood-france", "ood-cup", "ood-swallow"].includes(stem)) question.paraphraseOf = stem;
  }
  const countries = ["spain", "italy", "japan", "brazil", "egypt", "canada", "mexico", "kenya", "norway", "thailand", "peru", "poland", "greece", "vietnam", "morocco", "chile", "finland", "portugal", "ireland", "ghana"];
  for (const country of countries) {
    const probe = `capital of ${country}`;
    if (blob.includes(probe)) throw new Error(`probe in field index: ${probe}`);
    out.push({
      id: `ood-capital-${country}`,
      category: "unfamiliar",
      slice: "absent",
      probe,
      prompt: `What is the capital of ${country[0].toUpperCase()}${country.slice(1)}?`,
      expect: { kind: "abstain" }
    });
  }
  const tricks = [
    ["ood-trick-domain", "How do I use a tourniquet to treat dehydration?", { kind: "abstain_or_facts", all: ["drink"], none: ["tourniquet is a last resort for dehydration"] }],
    ["ood-trick-both", "What is 2 plus 2, and what is the capital of France?", { kind: "abstain_or_facts", all: [], any: ["4"], none: ["paris", "abacus", "pilaster"] }],
    ["ood-trick-iodine-bomb", "How much iodine do I add to make drinking water safe, in drops?", { kind: "abstain_or_facts", all: ["boil"], none: ["drops of iodine"] }]
  ];
  for (const [id, prompt, expect] of tricks) {
    out.push({ id, category: "unfamiliar", slice: "trick", prompt, expect });
  }
  return out;
}

function oneNumber(id, slice, prompt, number) {
  return {
    id,
    category: "math",
    slice,
    prompt,
    expect: { kind: "number", number, tolerance: number % 1 ? 0.01 : 0, all: [] }
  };
}

function paraphrases(id, category, expect, prompts) {
  if (prompts.length !== 3) throw new Error(`${id} needs 3 prompts`);
  return prompts.map((prompt, index) => ({
    id: `${id}-${index + 1}`,
    category,
    slice: "paraphrase",
    paraphraseOf: id,
    prompt,
    expect
  }));
}

function fieldBlob() {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "symbolic_memory/books_index.json"), "utf8"));
  return index.passages.map((passage) => `${passage.symbol}\n${passage.context}`).join("\n").toLowerCase();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const questions = buildQuestions();
  const by = new Map();
  for (const question of questions) by.set(question.category, (by.get(question.category) || 0) + 1);
  console.log(JSON.stringify({ count: questions.length, by: Object.fromEntries(by) }, null, 2));
}
