import type { PortfolioAuditCopy } from "./portfolio-stats";

export type RosterAuditDigest = {
  subject: string;
  previewText: string;
  plainText: string;
  html: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-language body lines (shared semantics for text + HTML). */
export function formatRosterAuditDigestLines(audit: PortfolioAuditCopy): string[] {
  const lines: string[] = [];
  if (audit.weekOverWeekPct === null) {
    lines.push(
      "Baseline week — next Sunday we'll compare your roster Active Charisma Score to this snapshot."
    );
  } else if (audit.weekOverWeekPct > 0) {
    lines.push(`You gained ${audit.weekOverWeekPct}% on your Active Charisma Score this week.`);
  } else if (audit.weekOverWeekPct < 0) {
    lines.push(`You slipped ${Math.abs(audit.weekOverWeekPct)}% on your Active Charisma Score this week.`);
  } else {
    lines.push("Your Active Charisma Score held steady this week.");
  }

  if (audit.aTierAtRisk > 0) {
    lines.push(
      `${audit.aTierAtRisk} A-Tier${audit.aTierAtRisk === 1 ? "" : "s"} ${audit.aTierAtRisk === 1 ? "is" : "are"} at risk of ghosting.`
    );
  } else {
    lines.push("No A-Tiers flagged as ghost-risk.");
  }

  if (audit.bTierTrending > 0) {
    lines.push(
      `${audit.bTierTrending} B-Tier${audit.bTierTrending === 1 ? "" : "s"} ${audit.bTierTrending === 1 ? "is" : "are"} trending up.`
    );
  }

  lines.push("Tap to secure your leads in STACK.");
  return lines;
}

/**
 * Weekly Roster Audit copy + elite dark-mode HTML for Resend (and optional plain text).
 */
export function formatRosterAuditDigest(
  audit: PortfolioAuditCopy,
  options: { appUrl: string; weekLabel?: string }
): RosterAuditDigest {
  const { appUrl, weekLabel } = options;
  const baseUrl = appUrl.replace(/\/$/, "");
  const homeUrl = `${baseUrl}/home#stack-roster-cards`;
  const lines = formatRosterAuditDigestLines(audit);
  const plainText = ["WEEKLY ROSTER AUDIT", "", ...lines, "", homeUrl].join("\n");

  const previewText = lines.slice(0, 2).join(" ");
  const subject = `Weekly Roster Audit · Active Charisma Score ${audit.avgMomentum}${
    weekLabel ? ` · ${weekLabel}` : ""
  }`;

  const wowBlock =
    audit.weekOverWeekPct === null
      ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#a8adbc;">Baseline week — your next audit will include week-over-week Active Charisma Score change.</p>`
      : audit.weekOverWeekPct > 0
        ? `<p style="margin:0 0 16px 0;font-size:17px;line-height:1.5;color:#f0e6d8;font-weight:500;">You gained <span style="color:#e8c547;font-weight:600;">${audit.weekOverWeekPct}%</span> on your Active Charisma Score this week.</p>`
        : audit.weekOverWeekPct < 0
          ? `<p style="margin:0 0 16px 0;font-size:17px;line-height:1.5;color:#f0e6d8;font-weight:500;">You slipped <span style="color:#e07a7a;font-weight:600;">${Math.abs(audit.weekOverWeekPct)}%</span> on your Active Charisma Score this week.</p>`
          : `<p style="margin:0 0 16px 0;font-size:17px;line-height:1.5;color:#f0e6d8;">Your Active Charisma Score held steady this week.</p>`;

  const riskColor = audit.aTierAtRisk > 0 ? "#e8a849" : "#6b7280";
  const riskText =
    audit.aTierAtRisk > 0
      ? `${audit.aTierAtRisk} A-Tier${audit.aTierAtRisk === 1 ? "" : "s"} at risk of ghosting`
      : "No A-Tiers flagged as ghost-risk";

  const trendText =
    audit.bTierTrending > 0
      ? `${audit.bTierTrending} B-Tier${audit.bTierTrending === 1 ? "" : "s"} trending up`
      : "No B-Tier Active Charisma surges flagged";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#050508;font-family:'SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#050508 0%,#0c0d14 45%,#050508 100%);padding:32px 16px 48px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;border-collapse:separate;border-spacing:0;">
          <tr>
            <td style="padding:0 0 20px 0;text-align:left;">
              <span style="display:inline-block;padding:6px 12px;border-radius:999px;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#f5e0a8;background:linear-gradient(135deg,rgba(212,168,83,0.22) 0%,rgba(212,168,83,0.06) 100%);border:1px solid rgba(212,168,83,0.45);font-weight:600;">Elite</span>
              <span style="margin-left:10px;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:#5c6170;">Weekly Roster Audit</span>
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(145deg,#12131c 0%,#0a0b10 100%);border:1px solid #252836;border-radius:16px;padding:28px 24px 24px;box-shadow:0 24px 48px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.04);">
              <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#7a8194;">Active Charisma · roster</p>
              <p style="margin:0 0 4px 0;font-size:42px;font-weight:700;letter-spacing:-0.03em;color:#faf7f2;line-height:1;">${audit.avgMomentum}<span style="font-size:16px;font-weight:500;color:#8b92a8;margin-left:6px;vertical-align:middle;">out of 100</span></p>
              <p style="margin:0 0 24px 0;font-size:12px;color:#6d7384;letter-spacing:0.06em;">${audit.prospectCount} lead${audit.prospectCount === 1 ? "" : "s"} on file</p>
              ${wowBlock}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.03);border:1px solid #2a2e3d;border-radius:12px;padding:14px 16px;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7280;">Ghost risk · A-Tier</p>
                    <p style="margin:6px 0 0 0;font-size:15px;font-weight:600;color:${riskColor};">${escapeHtml(riskText)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:rgba(255,255,255,0.03);border:1px solid #2a2e3d;border-radius:12px;padding:14px 16px;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#6b7280;">Trending · B-Tier</p>
                    <p style="margin:6px 0 0 0;font-size:15px;font-weight:600;color:#9fd4c1;">${escapeHtml(trendText)}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;width:100%;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(homeUrl)}" style="display:inline-block;padding:14px 28px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;color:#14151a;background:linear-gradient(180deg,#e8c547 0%,#c9a227 100%);border:1px solid #f5e08a;box-shadow:0 8px 24px rgba(232,197,71,0.25);">Secure your leads</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:11px;line-height:1.6;color:#4b5260;text-align:center;">Social portfolio management · STACK</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, previewText, plainText, html };
}
