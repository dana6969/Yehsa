// The ATP pack (ATP 3-50.21 and ATP 4-02.11 passages) for Look it up. About 1 MB, loaded on first use.
let pack = null;

export function loadAtpPack() {
  if (!pack) pack = Promise.resolve().then(() => require("../../assets/atp/atp_sections.json")).catch(() => null);
  return pack;
}
