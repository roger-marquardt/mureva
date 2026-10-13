import type { LeadDraft, LeadFieldKey } from "../lead-schema";
import {
  CONTACT_LABELS,
  firstNameOf,
  formatLeadSummary,
  nextMissingField,
} from "../lead-schema";

const PERSONA = `Você é a Mureva, consultora de imóveis. Fale em primeira pessoa, em português do Brasil.
Tom: caloroso, curioso e humano — como uma conversa boa, não um formulário. Frases curtas.
Evite markdown, listas e emojis. Nunca se apresente de novo: a saudação inicial já foi feita.`;

const NEXT_STEP: Record<Exclude<LeadFieldKey, "contactValue">, string> = {
  name: "Pergunte o nome da pessoa.",
  description:
    "Cumprimente a pessoa pelo primeiro nome e peça que ela descreva, do jeito dela, o imóvel que deseja.",
  city: "Pergunte em qual cidade ela quer o imóvel.",
  neighborhoods: "Pergunte se há algum bairro ou região de preferência.",
  propertyType: "Pergunte qual tipo de imóvel ela procura (apartamento, casa, casa em condomínio, cobertura, terreno).",
  budgetRange: "Pergunte qual faixa de valor ela pretende investir.",
  purpose: "Pergunte se o imóvel é para morar ou para investir.",
  bedrooms: "Pergunte quantos quartos ela deseja.",
  suites: "Pergunte quantos desses quartos ela gostaria que fossem suítes.",
  areaM2: "Pergunte se ela tem ideia da metragem desejada, em metros quadrados.",
  furnishing:
    "Pergunte se ela busca o imóvel mobiliado, semi-mobiliado ou sem mobília. Ela pode dizer que não tem preferência.",
  plannedRooms: "Pergunte se ela quer os quartos com armários planejados.",
  fullKitchen: "Pergunte se ela quer a cozinha completa.",
  condoFee: "Pergunte qual valor de condomínio ela deseja pagar.",
  condoAmenities:
    "Pergunte quais amenidades ela gostaria que o condomínio tivesse, como salão de festas, academia ou piscina. Ela pode dizer que não tem preferência.",
  floorPreference: "Pergunte se ela tem alguma preferência de andar.",
  timeline: "Pergunte em quanto tempo ela pretende comprar.",
  financing: "Pergunte como pretende pagar: à vista, financiamento bancário ou usando FGTS.",
  requirements:
    "Pergunte se há algo indispensável no imóvel (vaga de garagem, aceitar pet, elevador, área de lazer etc.).",
  contactPreference:
    "Diga que já está quase no fim e pergunte como ela prefere ser contactada: telefone, WhatsApp ou e-mail. Não diga que você vai entrar em contato.",
  extraNotes: "Pergunte se ela deseja adicionar mais alguma coisa sobre o imóvel ou a busca.",
};

function contactValueStep(lead: LeadDraft): string {
  const channel = lead.contactPreference ? CONTACT_LABELS[lead.contactPreference] : "contato";
  const target = lead.contactPreference === "email" ? "o endereço de e-mail" : `o número de ${channel}`;
  return `Peça somente ${target}. Não peça nenhum outro meio de contato.`;
}

function closingStep(): string {
  return `A conversa terminou. Agradeça pelo primeiro nome em uma frase curta, diga apenas que um de nossos representantes entrará em contato e se despeça. Não resuma os dados e não cite canal, número, cidade nem qualquer outro dado da conversa. Não faça nenhuma pergunta.`;
}

export function nextStepInstruction(lead: LeadDraft): string {
  const field = nextMissingField(lead);
  if (!field) {
    return closingStep();
  }
  if (field === "contactValue") {
    return contactValueStep(lead);
  }
  return NEXT_STEP[field];
}

const EXTRACTION_TARGET_OVERRIDES: Partial<Record<LeadFieldKey, string>> = {
  contactPreference: "contactPreference (e o valor do canal, se ela já informar)",
  contactValue: "phone, whatsapp ou email, conforme o canal escolhido",
};

export function extractionInstructions(lead: LeadDraft): string {
  const askedField = nextMissingField(lead);
  const askedLine = askedField
    ? `A pergunta que a pessoa acabou de responder era sobre: ${EXTRACTION_TARGET_OVERRIDES[askedField] ?? askedField}.`
    : "Todos os dados já foram coletados.";
  return `Você extrai dados de uma conversa de compra de imóvel. Chame a ferramenta update_lead com os campos que a ÚLTIMA mensagem do usuário informou.
${askedLine}

Regras:
- Preencha somente os campos que a pessoa mencionou. Todos os outros devem ser null; nunca use valores de exemplo, traços ou textos de preenchimento.
- Registre somente o que a pessoa disse explicitamente. Nunca deduza nem invente (por exemplo, não marque "morar" nem "à vista" se ela não disse).
- Uma descrição livre do imóvel vai em description; extraia dela também os campos específicos que ela mencionar.
- Se a pessoa disser que não sabe, que tanto faz ou que não tem preferência, registre "Não definido" (ou "indefinido" em purpose e financing; "Indiferente" em furnishing, plannedRooms e fullKitchen) apenas no campo perguntado.
- Em furnishing use mobiliado, semi-mobiliado, sem mobília ou indiferente. Em plannedRooms e fullKitchen registre sim, não ou indiferente.
- Em contactPreference use phone, whatsapp ou email. Guarde o número ou endereço no campo do canal correspondente.
- Em extraNotes guarde o que a pessoa quis acrescentar no final; se ela disser que não tem mais nada, registre "Nenhuma".
- Se a mensagem não trouxer nenhum dado novo, chame update_lead com todos os campos null.

Dados já coletados:
${formatLeadSummary(lead)}`;
}

function stepDirective(lead: LeadDraft): string {
  const field = nextMissingField(lead);
  if (!field) {
    return closingStep();
  }
  const opening =
    field === "description"
      ? "Siga EXATAMENTE este próximo passo, com uma única pergunta e sem cumprimentar duas vezes:"
      : "Comece só com Entendi, Certo ou Perfeito — varie a palavra, sem repetir a da mensagem anterior — sem repetir nem reformular o que a pessoa disse, e então siga EXATAMENTE este próximo passo, com uma única pergunta:";
  return `${opening}
${nextStepInstruction(lead)}

Não pergunte nada além disso e não antecipe outras perguntas.`;
}

export function replyInstructions(lead: LeadDraft): string {
  const firstName = firstNameOf(lead);
  return `${PERSONA}
${firstName ? `A pessoa se chama ${firstName}; use o primeiro nome de vez em quando, sem exagero.` : ""}

${stepDirective(lead)}`;
}
