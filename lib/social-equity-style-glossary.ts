/**
 * Copy for Social Equity thread style tags — must match the four strings from `communicationStyleFromContext`.
 */
export const SOCIAL_EQUITY_STYLE_INTRO =
  "Only four tags, all about how you show up in what you logged (your lines vs theirs). None of these are the other person’s personality — just the shape of the thread in your data.";

export const SOCIAL_EQUITY_STYLE_GLOSSARY: readonly { title: string; body: string }[] = [
  {
    title: "The Investor",
    body: "Most logged lines are outbound from you — you’re putting more text into the thread in what you saved.",
  },
  {
    title: "The Magnet",
    body: "Most logged lines are inbound from them — they’re showing up more than you in the thread count.",
  },
  {
    title: "The Volley",
    body: "Roughly even mix of your lines and theirs — neither side is clearly dominating the count.",
  },
  {
    title: "No read",
    body: "Too few text lines logged to call a pattern yet — keep logging direction under Texts.",
  },
];
