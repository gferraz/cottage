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
    furniture: "#d8c19a",
    appliance: "#c7d2dc",
    sanitary: "#d9e8ee",
    circulation: "#f5eede",
    terracotta: "#b15232",
    neutral: "#d8d8d8",
  },
  items: {
    "washing-machine": {
      label: "Lavadora",
      size: [0.6, 0.6, 0.85],
      classes: "appliance washing-machine",
      color: "appliance",
    },
    "queen-bed": {
      label: "Cama Queen",
      size: [1.6, 2.0, 0.55],
      classes: "furniture queen-bed",
      color: "furniture",
    },
    "three-seat-sofa": {
      label: "Sofá de 3 lugares",
      size: [2.1, 0.9, 0.85],
      classes: "furniture three-seat-sofa",
      color: "furniture",
    },
    armchair: {
      label: "Poltrona",
      size: [0.8, 0.85, 0.85],
      classes: "furniture armchair",
      color: "furniture",
    },
    railing: {
      label: "Cerca da varanda",
      size: [1.0, 0.08, 1.1],
      classes: "architectural railing",
      color: "neutral",
    },
  },
  openings: {
    door: { w: 0.8, z0: 0, h: 2.1 },
    opening: { w: 1.0, z0: 0, h: 2.1 },
    window: { w: 0.9, z0: 0.9, h: 1.5 },
  },
};
