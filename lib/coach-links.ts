/** Public coaching / programs — used on marketing and in-app (no secrets). */
export const COACH_PROGRAMS_URL = "https://www.domovangdating.com/";
export const COACH_CALENDLY_URL = "https://calendly.com/domovang87/standard";

/** Ask Domo — same product as askdomo.ai; `q` prefills the chat (see site example links). */
export const ASK_DOMO_CHAT_URL = "https://askdomo.ai/chat";

export function askDomoChatUrl(prompt?: string): string {
  const q = prompt?.trim();
  if (!q) return ASK_DOMO_CHAT_URL;
  return `${ASK_DOMO_CHAT_URL}?q=${encodeURIComponent(q)}`;
}
