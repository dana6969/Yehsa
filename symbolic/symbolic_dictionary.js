export const symbolMap = {
  "dreamgate": "open_cosmic_portal",
  "regalia": "define_regalia",
  "tao_te_ching_1": "summarize_tao_te_ching",
  "bhagavad_gita_1": "summarize_bhagavad_gita",
  "hermetica_1": "summarize_hermetica",
  "druidry_handbook_1": "summarize_druidry_handbook"
};

export function getMappedAction(symbol) {
  return symbolMap[symbol] || null;
}
