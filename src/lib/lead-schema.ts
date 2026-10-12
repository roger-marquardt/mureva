import { z } from "zod";

export const contactPreferenceSchema = z.enum(["phone", "whatsapp", "email"]);
export const purposeSchema = z.enum(["morar", "investir", "indefinido"]);
export const financingSchema = z.enum(["avista", "banco", "fgts", "indefinido"]);

export const leadDraftSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  neighborhoods: z.string().trim().min(1).optional(),
  propertyType: z.string().trim().min(1).optional(),
  budgetRange: z.string().trim().min(1).optional(),
  purpose: purposeSchema.optional(),
  bedrooms: z.string().trim().min(1).optional(),
  suites: z.string().trim().min(1).optional(),
  areaM2: z.string().trim().min(1).optional(),
  timeline: z.string().trim().min(1).optional(),
  financing: financingSchema.optional(),
  requirements: z.string().trim().min(1).optional(),
  contactPreference: contactPreferenceSchema.optional(),
  phone: z.string().trim().min(1).optional(),
  whatsapp: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  extraNotes: z.string().trim().min(1).optional(),
});

export type LeadDraft = z.infer<typeof leadDraftSchema>;

/**
 * Tool input for OpenAI strict mode, where every property must be present:
 * null means "not mentioned in the last message".
 */
export const leadExtractionSchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  city: z.string().nullable(),
  neighborhoods: z.string().nullable(),
  propertyType: z.string().nullable(),
  budgetRange: z.string().nullable(),
  purpose: purposeSchema.nullable(),
  bedrooms: z.string().nullable(),
  suites: z.string().nullable(),
  areaM2: z.string().nullable(),
  timeline: z.string().nullable(),
  financing: financingSchema.nullable(),
  requirements: z.string().nullable(),
  contactPreference: contactPreferenceSchema.nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  extraNotes: z.string().nullable(),
});

export type LeadExtraction = z.infer<typeof leadExtractionSchema>;

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function isValidLeadValue(key: string, value: unknown): boolean {
  if (typeof value !== "string" || !HAS_LETTER_OR_DIGIT.test(value)) {
    return false;
  }
  const fieldSchema = leadDraftSchema.shape[key as keyof LeadDraft];
  return fieldSchema !== undefined && fieldSchema.safeParse(value).success;
}

/** Drops nulls, dash-only fillers and values that fail their field's validation, one field at a time. */
export function leadPatchFromExtraction(extraction: LeadExtraction): LeadDraft {
  return parseLead(
    Object.fromEntries(Object.entries(extraction).filter(([key, value]) => isValidLeadValue(key, value))),
  );
}
export type ContactPreference = z.infer<typeof contactPreferenceSchema>;

const PROFILE_KEYS = [
  "name",
  "description",
  "city",
  "neighborhoods",
  "propertyType",
  "budgetRange",
  "purpose",
  "bedrooms",
  "suites",
  "areaM2",
  "timeline",
  "financing",
  "requirements",
] as const satisfies ReadonlyArray<keyof LeadDraft>;

export const LEAD_FIELD_KEYS = [
  ...PROFILE_KEYS,
  "contactPreference",
  "contactValue",
  "extraNotes",
] as const;

export type LeadFieldKey = (typeof LEAD_FIELD_KEYS)[number];

export function emptyLead(): LeadDraft {
  return {};
}

export function parseLead(value: unknown): LeadDraft {
  const parsed = leadDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function mergeLead(current: LeadDraft, patch: LeadDraft): LeadDraft {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined && value !== ""),
    ),
  };
}

const CONTACT_KEYS = ["contactPreference", "phone", "whatsapp", "email"] as const;
const ASK_ONLY_KEYS: ReadonlySet<string> = new Set(["name", "description", ...CONTACT_KEYS, "extraNotes"]);
const UNKNOWN_VALUES: ReadonlySet<string> = new Set(["não definido", "indefinido", "nenhuma"]);

function keysAnswering(field: LeadFieldKey | undefined): ReadonlySet<string> {
  if (field === "contactPreference" || field === "contactValue") {
    return new Set(CONTACT_KEYS);
  }
  return new Set(field ? [field] : []);
}

function isUnknownValue(value: unknown): boolean {
  return typeof value === "string" && UNKNOWN_VALUES.has(value.trim().toLowerCase());
}

/**
 * Keeps only extracted fields the person could have answered: anything for the field just asked,
 * plus concrete values volunteered for other profile fields. Placeholders, name, contact and final
 * notes are accepted only when that field was the one asked, so later answers never overwrite them.
 */
export function acceptedExtraction(patch: LeadDraft, askedField: LeadFieldKey | undefined): LeadDraft {
  const answering = keysAnswering(askedField);
  const isAccepted = (key: string, value: unknown) =>
    answering.has(key) || (!ASK_ONLY_KEYS.has(key) && !isUnknownValue(value));
  return parseLead(
    Object.fromEntries(Object.entries(patch).filter(([key, value]) => isAccepted(key, value))),
  );
}

export function contactValue(lead: LeadDraft): string {
  if (lead.contactPreference === "phone") {
    return lead.phone ?? "";
  }
  if (lead.contactPreference === "whatsapp") {
    return lead.whatsapp ?? "";
  }
  if (lead.contactPreference === "email") {
    return lead.email ?? "";
  }
  return "";
}

export function missingLeadFields(lead: LeadDraft): LeadFieldKey[] {
  const missingProfile = PROFILE_KEYS.filter((key) => !lead[key]);
  const missingContact: LeadFieldKey[] = [
    ...(lead.contactPreference ? [] : (["contactPreference"] as const)),
    ...(contactValue(lead) ? [] : (["contactValue"] as const)),
  ];
  const missingNotes: LeadFieldKey[] = lead.extraNotes ? [] : ["extraNotes"];
  return [...missingProfile, ...missingContact, ...missingNotes];
}

export function nextMissingField(lead: LeadDraft): LeadFieldKey | undefined {
  return missingLeadFields(lead)[0];
}

export function isLeadComplete(lead: LeadDraft): boolean {
  return missingLeadFields(lead).length === 0;
}

export function firstNameOf(lead: LeadDraft): string | undefined {
  return lead.name?.trim().split(/\s+/)[0];
}

export const PURPOSE_LABELS: Record<z.infer<typeof purposeSchema>, string> = {
  morar: "Morar",
  investir: "Investir",
  indefinido: "Não definido",
};

export const FINANCING_LABELS: Record<z.infer<typeof financingSchema>, string> = {
  avista: "À vista",
  banco: "Financiamento bancário",
  fgts: "FGTS",
  indefinido: "Não definido",
};

export const CONTACT_LABELS: Record<ContactPreference, string> = {
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
};

export function formatLeadSummary(lead: LeadDraft): string {
  const contactChannel = lead.contactPreference ? CONTACT_LABELS[lead.contactPreference] : "—";
  const lines = [
    `Nome: ${lead.name ?? "—"}`,
    `Contato: ${contactChannel} — ${contactValue(lead) || "—"}`,
    `Descrição: ${lead.description ?? "—"}`,
    `Cidade: ${lead.city ?? "—"}`,
    `Bairro: ${lead.neighborhoods ?? "—"}`,
    `Tipo: ${lead.propertyType ?? "—"}`,
    `Orçamento: ${lead.budgetRange ?? "—"}`,
    `Finalidade: ${lead.purpose ? PURPOSE_LABELS[lead.purpose] : "—"}`,
    `Quartos: ${lead.bedrooms ?? "—"}`,
    `Suítes: ${lead.suites ?? "—"}`,
    `Metragem: ${lead.areaM2 ?? "—"}`,
    `Prazo: ${lead.timeline ?? "—"}`,
    `Financiamento: ${lead.financing ? FINANCING_LABELS[lead.financing] : "—"}`,
    `Requisitos: ${lead.requirements ?? "—"}`,
    `Observações: ${lead.extraNotes ?? "—"}`,
  ];
  return lines.join("\n");
}

const CHIPS_BY_FIELD: Partial<Record<LeadFieldKey, string[]>> = {
  propertyType: ["Apartamento", "Casa", "Casa em condomínio", "Cobertura", "Terreno"],
  purpose: ["Morar", "Investir"],
  bedrooms: ["1", "2", "3", "4+"],
  suites: ["Nenhuma", "1", "2", "3+"],
  timeline: ["Imediato", "Até 3 meses", "Até 6 meses", "1 ano ou mais"],
  financing: ["À vista", "Financiamento bancário", "FGTS"],
  contactPreference: ["Telefone", "WhatsApp", "E-mail"],
  extraNotes: ["Não, é só isso"],
};

export function chipsForField(field: LeadFieldKey | undefined): string[] {
  return field ? (CHIPS_BY_FIELD[field] ?? []) : [];
}
