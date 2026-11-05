/** Očakávané rozpisy DPH pre fixtures v tomto priečinku. */
export const OCAKAVANY_RISS = [
  { sadzba: 0, zaklad: 26.9, dph: 0, vat_category: "reverse_charge" },
  { sadzba: 23, zaklad: 116.87, dph: 26.88, vat_category: "standard" },
] as const;

export const OCAKAVANY_REGISTRACIA = [
  { sadzba: 0, zaklad: 360, dph: 0, vat_category: "out_of_scope" },
  { sadzba: 23, zaklad: 24.39, dph: 5.61, vat_category: "standard" },
] as const;
