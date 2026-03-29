import { Resend } from "resend";
import { NextResponse } from "next/server";
import { formatRosterAuditDigest } from "../../../../lib/format-roster-audit-digest";
import { getIsoWeekKeyUTC, getPreviousIsoWeekKeyUTC } from "../../../../lib/roster-audit-time";
import { buildPortfolioAudit } from "../../../../lib/portfolio-stats";
import {
  buildPortfolioProspectsForAudit,
  remindByTierFromRulesRows,
} from "../../../../lib/roster-portfolio-compute";
import { getSupabaseServiceRoleClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

function fromAddress(): string | null {
  const v = process.env.RESEND_FROM_EMAIL?.trim() || process.env.STACK_FROM_EMAIL?.trim();
  return v && v.length > 0 ? v : null;
}

/**
 * Vercel Cron: Sundays (see vercel.json). Sends each confirmed user their Weekly Roster Audit via Resend.
 * Requires: CRON_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL (verified domain or Resend test sender),
 * SUPABASE_SERVICE_ROLE_KEY, migration `roster_audit_weekly_snapshots`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set." }, { status: 500 });
  }

  const from = fromAddress();
  if (!from) {
    return NextResponse.json(
      {
        error: "Set RESEND_FROM_EMAIL (e.g. \"STACK <onboarding@resend.dev>\" or your verified domain).",
      },
      { status: 500 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase admin client failed." },
      { status: 500 }
    );
  }

  const resend = new Resend(resendKey);
  const now = new Date();
  const currentWeek = getIsoWeekKeyUTC(now);
  const previousWeek = getPreviousIsoWeekKeyUTC(now);
  const baseUrl = appBaseUrl();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let page = 1; page < 500; page += 1) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (listErr) {
      errors.push(`listUsers page ${page}: ${listErr.message}`);
      break;
    }

    const users = listData?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      const email = user.email?.trim();
      if (!email || !user.email_confirmed_at) {
        skipped += 1;
        continue;
      }

      const { data: prospectRows, error: pErr } = await supabase
        .from("prospects")
        .select("id,name,tier")
        .eq("user_id", user.id);

      if (pErr) {
        failed += 1;
        errors.push(`prospects ${user.id}: ${pErr.message}`);
        continue;
      }

      const prospects = prospectRows ?? [];
      if (prospects.length === 0) {
        skipped += 1;
        continue;
      }

      const { data: alreadyThisWeek } = await supabase
        .from("roster_audit_weekly_snapshots")
        .select("id")
        .eq("user_id", user.id)
        .eq("iso_week", currentWeek)
        .maybeSingle();

      if (alreadyThisWeek) {
        skipped += 1;
        continue;
      }

      const ids = prospects.map((p) => p.id as string);
      const { data: messageRows, error: mErr } = await supabase
        .from("messages")
        .select("body,created_at,direction,prospect_id,event_type")
        .in("prospect_id", ids)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (mErr) {
        failed += 1;
        errors.push(`messages ${user.id}: ${mErr.message}`);
        continue;
      }

      const { data: rulesRows, error: rErr } = await supabase
        .from("tier_rules")
        .select("tier,remind_after_days")
        .eq("user_id", user.id);

      if (rErr) {
        failed += 1;
        errors.push(`tier_rules ${user.id}: ${rErr.message}`);
        continue;
      }

      const remindByTier = remindByTierFromRulesRows(rulesRows ?? []);
      const portfolio = buildPortfolioProspectsForAudit(
        prospects,
        messageRows ?? [],
        remindByTier,
        now
      );

      const { data: prevSnap, error: snapErr } = await supabase
        .from("roster_audit_weekly_snapshots")
        .select("avg_momentum,prospect_momenta")
        .eq("user_id", user.id)
        .eq("iso_week", previousWeek)
        .maybeSingle();

      if (snapErr) {
        failed += 1;
        errors.push(`snapshot read ${user.id}: ${snapErr.message}`);
        continue;
      }

      const prevAvg =
        typeof prevSnap?.avg_momentum === "number" && Number.isFinite(prevSnap.avg_momentum)
          ? prevSnap.avg_momentum
          : null;
      const rawPrev = prevSnap?.prospect_momenta;
      const prevById: Record<string, number> =
        rawPrev && typeof rawPrev === "object" && !Array.isArray(rawPrev)
          ? Object.fromEntries(
              Object.entries(rawPrev as Record<string, unknown>).filter(
                ([, v]) => typeof v === "number" && Number.isFinite(v)
              ) as [string, number][]
            )
          : {};

      const audit = buildPortfolioAudit(portfolio, prevAvg, prevById, now);
      const digest = formatRosterAuditDigest(audit, { appUrl: baseUrl, weekLabel: currentWeek });

      const { error: sendErr } = await resend.emails.send({
        from,
        to: email,
        subject: digest.subject,
        text: digest.plainText,
        html: digest.html,
      });

      if (sendErr) {
        failed += 1;
        errors.push(`resend ${email}: ${sendErr.message}`);
        continue;
      }

      const prospectMomenta: Record<string, number> = {};
      for (const p of portfolio) prospectMomenta[p.id] = p.momentum ?? 0;

      const { error: upErr } = await supabase.from("roster_audit_weekly_snapshots").upsert(
        {
          user_id: user.id,
          iso_week: currentWeek,
          avg_momentum: audit.avgMomentum,
          prospect_momenta: prospectMomenta,
        },
        { onConflict: "user_id,iso_week" }
      );

      if (upErr) {
        failed += 1;
        errors.push(`snapshot upsert ${user.id}: ${upErr.message}`);
        continue;
      }

      sent += 1;
    }
  }

  console.info(
    "[weekly-roster-audit]",
    JSON.stringify({ currentWeek, previousWeek, sent, skipped, failed, errorCount: errors.length })
  );

  return NextResponse.json({
    ok: failed === 0,
    currentWeek,
    previousWeek,
    sent,
    skipped,
    failed,
    errors: errors.slice(0, 25),
  });
}
