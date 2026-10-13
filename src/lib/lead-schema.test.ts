import {
  acceptedExtraction,
  chipsForField,
  formatLeadSummary,
  isLeadComplete,
  LEAD_FIELD_KEYS,
  leadPatchFromExtraction,
  mergeLead,
  missingLeadFields,
  nextMissingField,
  parseLead,
  type LeadDraft,
  type LeadExtraction,
} from "./lead-schema";

const PROFILE: LeadDraft = {
  name: "Maria Souza",
  description: "Casa em condomínio, espaçosa, com jardim",
  city: "Curitiba",
  neighborhoods: "Santa Felicidade",
  propertyType: "Casa em condomínio",
  budgetRange: "Até 1 milhão",
  purpose: "morar",
  bedrooms: "3",
  suites: "1",
  areaM2: "200 m²",
  furnishing: "Sem mobília",
  fullKitchen: "Não",
  condoFee: "Até R$ 800",
  condoAmenities: "Piscina",
  timeline: "Até 6 meses",
  financing: "banco",
  requirements: "Jardim e vaga para 2 carros",
};

const COMPLETE_LEAD: LeadDraft = {
  ...PROFILE,
  contactPreference: "phone",
  phone: "41 99997-8787",
  extraNotes: "Nenhuma",
};

describe("missingLeadFields", () => {
  it("starts with the name and skips conditional questions before the property is known", () => {
    const missing = missingLeadFields({});
    expect(missing[0]).toBe("name");
    expect(missing).toContain("furnishing");
    expect(missing).toContain("fullKitchen");
    expect(missing).not.toContain("plannedRooms");
    expect(missing).not.toContain("condoFee");
    expect(missing).not.toContain("floorPreference");
    expect(missing).toHaveLength(LEAD_FIELD_KEYS.length - 4);
  });

  it("asks for the free description right after the name", () => {
    expect(nextMissingField({ name: "Maria" })).toBe("description");
  });

  it("asks bedrooms, suites and area before timeline", () => {
    const rest: LeadDraft = {
      ...PROFILE,
      bedrooms: undefined,
      suites: undefined,
      areaM2: undefined,
      timeline: undefined,
    };
    const missing = missingLeadFields(rest);
    expect(missing.indexOf("bedrooms")).toBeLessThan(missing.indexOf("suites"));
    expect(missing.indexOf("suites")).toBeLessThan(missing.indexOf("areaM2"));
    expect(missing.indexOf("areaM2")).toBeLessThan(missing.indexOf("timeline"));
  });

  it("asks contact only after the profile, then the chosen channel, then extra notes", () => {
    expect(nextMissingField(PROFILE)).toBe("contactPreference");
    expect(nextMissingField({ ...PROFILE, contactPreference: "email" })).toBe("contactValue");
    expect(
      nextMissingField({ ...PROFILE, contactPreference: "email", email: "maria@email.com" }),
    ).toBe("extraNotes");
  });

  it("asks for planned rooms only when the property will be furnished", () => {
    const base: LeadDraft = { ...PROFILE, furnishing: undefined, fullKitchen: undefined };
    expect(missingLeadFields({ ...base, furnishing: "Mobiliado" }).slice(0, 2)).toEqual([
      "plannedRooms",
      "fullKitchen",
    ]);
    expect(missingLeadFields({ ...base, furnishing: "Semi-mobiliado" })[0]).toBe("plannedRooms");
    expect(missingLeadFields({ ...base, furnishing: "Sem mobília" })).not.toContain("plannedRooms");
    expect(missingLeadFields({ ...base, furnishing: "Indiferente" })).not.toContain("plannedRooms");
  });

  it("asks condo fee and amenities for a condominium, and floor only for an apartment", () => {
    const ready: LeadDraft = {
      ...PROFILE,
      propertyType: "Casa",
      condoFee: undefined,
      condoAmenities: undefined,
    };
    expect(missingLeadFields(ready)).not.toContain("condoFee");
    expect(missingLeadFields(ready)).not.toContain("floorPreference");

    const condo = missingLeadFields({ ...ready, propertyType: "Casa em condomínio" });
    expect(condo.slice(0, 2)).toEqual(["condoFee", "condoAmenities"]);
    expect(condo).not.toContain("floorPreference");

    const apartment = missingLeadFields({ ...ready, propertyType: "Apartamento" });
    expect(apartment.slice(0, 3)).toEqual(["condoFee", "condoAmenities", "floorPreference"]);
  });

  it("does not accept a value from a different channel than the chosen one", () => {
    const lead = { ...COMPLETE_LEAD, contactPreference: "whatsapp" as const };
    expect(missingLeadFields(lead)).toEqual(["contactValue"]);
  });
});

describe("isLeadComplete", () => {
  it("is true only when extra notes were answered", () => {
    expect(isLeadComplete(COMPLETE_LEAD)).toBe(true);
    const withoutNotes: LeadDraft = { ...COMPLETE_LEAD, extraNotes: undefined };
    expect(isLeadComplete(withoutNotes)).toBe(false);
  });
});

describe("mergeLead", () => {
  it("returns a new object and ignores empty values", () => {
    const current: LeadDraft = { name: "Maria" };
    const merged = mergeLead(current, { city: "Curitiba", neighborhoods: "" });
    expect(merged).toEqual({ name: "Maria", city: "Curitiba" });
    expect(current).toEqual({ name: "Maria" });
  });
});

describe("leadPatchFromExtraction", () => {
  const EMPTY_EXTRACTION: LeadExtraction = {
    name: null,
    description: null,
    city: null,
    neighborhoods: null,
    propertyType: null,
    budgetRange: null,
    purpose: null,
    bedrooms: null,
    suites: null,
    areaM2: null,
    furnishing: null,
    plannedRooms: null,
    fullKitchen: null,
    condoFee: null,
    condoAmenities: null,
    floorPreference: null,
    timeline: null,
    financing: null,
    requirements: null,
    contactPreference: null,
    phone: null,
    whatsapp: null,
    email: null,
    extraNotes: null,
  };

  it("returns an empty patch when every field is null", () => {
    expect(leadPatchFromExtraction(EMPTY_EXTRACTION)).toEqual({});
  });

  it("keeps mentioned values and drops dash-only fillers", () => {
    const extraction: LeadExtraction = { ...EMPTY_EXTRACTION, city: "Curitiba", suites: "—", areaM2: "-" };
    expect(leadPatchFromExtraction(extraction)).toEqual({ city: "Curitiba" });
  });

  it("drops an invalid email without losing the other fields", () => {
    const extraction: LeadExtraction = { ...EMPTY_EXTRACTION, name: "Maria", email: "não sei" };
    expect(leadPatchFromExtraction(extraction)).toEqual({ name: "Maria" });
  });
});

describe("acceptedExtraction", () => {
  const PLACEHOLDER_FLOOD: LeadDraft = {
    name: "Maria Souza",
    city: "Não definido",
    purpose: "indefinido",
    email: "nao@nao.com",
    contactPreference: "phone",
    extraNotes: "Não definido",
    suites: "Nenhuma",
  };

  it("keeps only the asked field when the model fills every field after the name", () => {
    expect(acceptedExtraction(PLACEHOLDER_FLOOD, "name")).toEqual({ name: "Maria Souza" });
  });

  it("keeps concrete profile details volunteered in the description", () => {
    const patch: LeadDraft = {
      description: "Casa em condomínio em Curitiba",
      city: "Curitiba",
      propertyType: "Casa em condomínio",
    };
    expect(acceptedExtraction(patch, "description")).toEqual(patch);
  });

  it("accepts a placeholder only for the asked field", () => {
    expect(acceptedExtraction({ areaM2: "Não definido", timeline: "Não definido" }, "areaM2")).toEqual({
      areaM2: "Não definido",
    });
  });

  it("accepts contact data only when contact is being asked", () => {
    const patch: LeadDraft = { contactPreference: "whatsapp", whatsapp: "41 99997-8787" };
    expect(acceptedExtraction(patch, "city")).toEqual({});
    expect(acceptedExtraction(patch, "contactPreference")).toEqual(patch);
    expect(acceptedExtraction({ whatsapp: "41 99997-8787" }, "contactValue")).toEqual({
      whatsapp: "41 99997-8787",
    });
  });

  it("does not let a later answer overwrite the free description", () => {
    const patch: LeadDraft = { description: "Casa em condomínio", propertyType: "Casa em condomínio" };
    expect(acceptedExtraction(patch, "budgetRange")).toEqual({ propertyType: "Casa em condomínio" });
  });

  it("drops an indifferent answer that was not asked and keeps a volunteered furnishing", () => {
    expect(acceptedExtraction({ furnishing: "Indiferente", city: "Curitiba" }, "city")).toEqual({
      city: "Curitiba",
    });
    expect(
      acceptedExtraction({ description: "Apartamento mobiliado", furnishing: "Mobiliado" }, "description"),
    ).toEqual({ description: "Apartamento mobiliado", furnishing: "Mobiliado" });
  });

  it("accepts extra notes only when they are being asked", () => {
    expect(acceptedExtraction({ extraNotes: "Nenhuma" }, "requirements")).toEqual({});
    expect(acceptedExtraction({ extraNotes: "Nenhuma" }, "extraNotes")).toEqual({ extraNotes: "Nenhuma" });
  });

  it("returns a new object without mutating the patch", () => {
    const patch: LeadDraft = { name: "Maria", city: "Não definido" };
    acceptedExtraction(patch, "name");
    expect(patch).toEqual({ name: "Maria", city: "Não definido" });
  });
});

describe("parseLead", () => {
  it("falls back to an empty lead for invalid JSON from the database", () => {
    expect(parseLead({ purpose: "alugar" })).toEqual({});
    expect(parseLead(null)).toEqual({});
  });
});

describe("chipsForField", () => {
  it("offers furnishing, condo and closing chips", () => {
    expect(chipsForField("furnishing")).toEqual([
      "Mobiliado",
      "Semi-mobiliado",
      "Sem mobília",
      "Indiferente",
    ]);
    expect(chipsForField("condoAmenities")).toEqual(["Sem preferência"]);
    expect(chipsForField("floorPreference")).toContain("Andar alto");
    expect(chipsForField("extraNotes")).toEqual(["Não, é só isso"]);
    expect(chipsForField(undefined)).toEqual([]);
  });
});

describe("formatLeadSummary", () => {
  it("hides condominium and floor lines for a house and shows them for an apartment", () => {
    const house: LeadDraft = {
      ...PROFILE,
      propertyType: "Casa",
      condoFee: undefined,
      condoAmenities: undefined,
    };
    const houseSummary = formatLeadSummary(house);
    expect(houseSummary).not.toContain("Valor do condomínio");
    expect(houseSummary).not.toContain("Andar");
    expect(houseSummary).toContain("Mobília: Sem mobília");

    const apartment = formatLeadSummary({
      ...PROFILE,
      propertyType: "Apartamento",
      floorPreference: "Andar alto",
    });
    expect(apartment).toContain("Valor do condomínio: Até R$ 800");
    expect(apartment).toContain("Andar: Andar alto");
  });
});
