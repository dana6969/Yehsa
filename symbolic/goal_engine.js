import fs from "fs";
const goalPath = "./symbolic_memory/goals.json";
const donePath = "./symbolic_memory/goals_done.json";
export function loadGoals() {
  if (!fs.existsSync(goalPath)) fs.writeFileSync(goalPath, "[]");
  return JSON.parse(fs.readFileSync(goalPath, "utf8"));
}
export function markGoalComplete(goalId) {
  const done = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, "utf8")) : [];
  if (!done.includes(goalId)) {
    done.push(goalId);
    fs.writeFileSync(donePath, JSON.stringify(done, null, 2));
  }
}
export function nextGoal() {
  const goals = loadGoals();
  const done = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, "utf8")) : [];
  const next = goals.filter(g => !done.includes(g.id)).sort((a,b) => b.priority - a.priority)[0];
  return next || null;
}
