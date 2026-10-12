export const DEFAULT_CHAT_MODEL = "gpt-6-luna";

export function chatModelId(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}
