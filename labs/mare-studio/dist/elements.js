import catalog from "./assets/elements.json" with { type: "json" };

export const elements = catalog;
export const elementNames = Object.fromEntries(Object.entries(catalog).map(([id, asset]) => [id, asset.name]));
export const elementWords = Object.fromEntries(Object.entries(catalog).map(([id, asset]) => [
  asset.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), id,
]));
