import { buildConversationEmail, type ConversationEmail } from "./email";

const BASE_EMAIL: ConversationEmail = {
  status: "COMPLETED",
  lead: { name: "Maria Souza", city: "Curitiba", contactPreference: "phone", phone: "41 99997-8787" },
  transcript: [
    { role: "ASSISTANT", content: "Olá, eu sou a Mureva." },
    { role: "USER", content: "Maria" },
  ],
  ip: "200.100.50.25",
  location: { city: "Curitiba", region: "Paraná", country: "Brazil", network: "Operadora X" },
};

describe("buildConversationEmail", () => {
  it("keeps the lead summary on top and appends the full transcript", () => {
    const { subject, text } = buildConversationEmail(BASE_EMAIL);
    expect(subject).toBe("Nova conversa concluída — Maria Souza");
    expect(text.indexOf("Nome: Maria Souza")).toBeLessThan(text.indexOf("Conversa completa"));
    expect(text).toContain("Mureva: Olá, eu sou a Mureva.");
    expect(text).toContain("Maria: Maria");
    expect(text).toContain("IP: 200.100.50.25 — Curitiba, Paraná, Brazil (Operadora X)");
  });

  it("flags abandoned conversations in the subject and tolerates missing location", () => {
    const { subject, text } = buildConversationEmail({
      ...BASE_EMAIL,
      status: "ABANDONED",
      lead: {},
      ip: null,
      location: null,
    });
    expect(subject).toBe("Conversa interrompida — sem nome");
    expect(text).toContain("IP: —");
    expect(text).toContain("Cliente: Maria");
  });
});
