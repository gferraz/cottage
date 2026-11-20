window.FloorPlanCatalog = {
  walls: {
    thickness: 0.12,
  },
  colors: {
    "casca-de-pinus": "#6e5241", // SW 2807
    "jangada-de-bambu": "#ad9b8c", // SW 7501
    "mate-amargo": "#606b4a", // SW 6433
    "prosa-ao-entardecer": "#989192", // SW 9155
    "tacho-de-cobre": "#b27147", // SW 7709
    "leite-maltado": "#decabd", // SW 6057
    endro: "#7c9067", // SW 6438
    "malva-exotica": "#afa7ac", // SW 6269
    "sertao-nordestino": "#cd7d4c", // SW 6642
    "desejo-ambar": "#f2cb96", // SW 6366
    "abobrinha-italiana": "#9ea67d", // SW 9038
    "aroma-de-uva": "#c5c0c9", // SW 6548
    furniture: "#a67c52",
    bed: "#78b8b2",
    appliance: "#c7d2dc",
    sanitary: "#d9e8ee",
    circulation: "#f5eede",
    terracotta: "#b15232",
    neutral: "#d8d8d8",
  },
  items: typeof module === "object" && module.exports ? require("../../lib/items.json") : {},
  openings: {
    door: { w: 0.8, z0: 0, h: 2.1 },
    opening: { w: 1.0, z0: 0, h: 2.1 },
    window: { w: 0.9, z0: 0.9, h: 1.5 },
  },
};

if (!(typeof module === "object" && module.exports)) {
  window.FloorPlanItemLibraryReady = fetch("lib/items.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Biblioteca de itens: HTTP ${response.status}`);
      return response.json();
    })
    .then((items) => {
      Object.assign(window.FloorPlanCatalog.items, items);
    });
}
