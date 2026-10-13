import type { LeadDraft } from "../lead-schema";
import { extractionInstructions, nextStepInstruction, replyInstructions } from "./buyer-chat";

const PROFILE_UNTIL_BEDROOMS: LeadDraft = {
  name: "Maria",
  description: "Casa em condomínio com jardim",
  city: "Curitiba",
  neighborhoods: "Santa Felicidade",
  propertyType: "Casa em condomínio",
  budgetRange: "Até 1 milhão",
  purpose: "morar",
  bedrooms: "3",
};

describe("nextStepInstruction", () => {
  it("greets by name and asks for a description after the name", () => {
    expect(nextStepInstruction({ name: "Maria" })).toMatch(/descreva/);
  });

  it("asks about suites after bedrooms", () => {
    expect(nextStepInstruction(PROFILE_UNTIL_BEDROOMS)).toMatch(/suítes/);
  });

  it("asks about planned rooms only after a furnished choice", () => {
    const ready: LeadDraft = { ...PROFILE_UNTIL_BEDROOMS, suites: "1", areaM2: "200" };
    expect(nextStepInstruction(ready)).toMatch(/mobiliado/);
    expect(nextStepInstruction({ ...ready, furnishing: "Mobiliado" })).toMatch(/armários planejados/);
    expect(nextStepInstruction({ ...ready, furnishing: "Semi-mobiliado" })).toMatch(/armários planejados/);
    expect(nextStepInstruction({ ...ready, furnishing: "Sem mobília" })).toMatch(/cozinha completa/);
  });

  it("asks condo details for a condominium and floor only for an apartment", () => {
    const ready: LeadDraft = {
      ...PROFILE_UNTIL_BEDROOMS,
      suites: "1",
      areaM2: "200",
      furnishing: "Sem mobília",
      fullKitchen: "Não",
    };
    expect(nextStepInstruction({ ...ready, propertyType: "Casa em condomínio" })).toMatch(/valor de condomínio/);
    expect(
      nextStepInstruction({ ...ready, propertyType: "Casa em condomínio", condoFee: "R$ 500" }),
    ).toMatch(/amenidades/);
    expect(
      nextStepInstruction({
        ...ready,
        propertyType: "Apartamento",
        condoFee: "R$ 500",
        condoAmenities: "Piscina",
      }),
    ).toMatch(/andar/);
    expect(nextStepInstruction({ ...ready, propertyType: "Casa" })).toMatch(/em quanto tempo/);
  });

  it("asks only for the chosen contact channel", () => {
    const lead: LeadDraft = {
      ...PROFILE_UNTIL_BEDROOMS,
      suites: "1",
      areaM2: "200",
      furnishing: "Sem mobília",
      fullKitchen: "Não",
      condoFee: "R$ 500",
      condoAmenities: "Piscina",
      timeline: "6 meses",
      financing: "banco",
      requirements: "jardim",
      contactPreference: "whatsapp",
    };
    expect(nextStepInstruction(lead)).toMatch(/WhatsApp/);
  });
});

describe("replyInstructions", () => {
  it("acknowledges without restating the answer", () => {
    expect(replyInstructions({ name: "Maria", description: "Casa com jardim" })).toMatch(
      /sem repetir nem reformular/,
    );
  });

  it("closes without questions when everything was collected", () => {
    const complete: LeadDraft = {
      ...PROFILE_UNTIL_BEDROOMS,
      suites: "1",
      areaM2: "200",
      furnishing: "Sem mobília",
      fullKitchen: "Não",
      condoFee: "R$ 500",
      condoAmenities: "Piscina",
      timeline: "6 meses",
      financing: "banco",
      requirements: "jardim",
      contactPreference: "phone",
      phone: "41 99997-8787",
      extraNotes: "Nenhuma",
    };
    const instructions = replyInstructions(complete);
    expect(instructions).toMatch(/um de nossos representantes entrará em contato/);
    expect(instructions).toMatch(/Não resuma os dados/);
    expect(instructions).toMatch(/não cite canal/);
    expect(instructions).not.toMatch(/única pergunta/);
  });
});

describe("extractionInstructions", () => {
  it("forbids inferring values that were not said", () => {
    expect(extractionInstructions({})).toMatch(/Nunca deduza nem invente/);
  });
});
