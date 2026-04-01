import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · STACK",
  description: "How STACK handles your information.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--rm-bg)] px-6 py-12 text-[var(--rm-text)] sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--rm-text-muted)]">
          The boring but important page
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Privacy policy</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--rm-text-muted)]">
          Hi — we tried to write this the way we&apos;d want to read it: plain language up front, then the
          careful bits that keep everyone honest. STACK (&quot;we,&quot; &quot;us,&quot; &quot;the app&quot;) runs this service. By using
          it, you agree to this policy. If you don&apos;t, please don&apos;t use the app.
        </p>
        <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
          Last updated: March 28, 2026 · We may update this page; the date above will change when we do.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[var(--rm-text-muted)]">
          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">The short version</h2>
            <ul className="mt-3 list-inside list-disc space-y-2">
              <li>We use your data to run STACK — accounts, your roster, texts you log, and features you ask for.</li>
              <li>We use trusted vendors (hosting, auth, payments, email, AI) to make that possible.</li>
              <li>We don&apos;t sell your personal information as a mailing list or ad profile.</li>
              <li>Stuff you type into AI features gets sent to our AI provider to generate responses — don&apos;t put secrets you wouldn&apos;t put in a support ticket.</li>
              <li>We&apos;re not perfect; no service is. We use reasonable safeguards, but you use the app at your own risk.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">What we collect</h2>
            <p className="mt-3">
              <strong className="text-[var(--rm-text)]">Account &amp; login:</strong> email address and authentication
              data from our auth provider (e.g. Supabase), session cookies, and basic technical logs (IP, device/browser
              type, timestamps) typical for web apps.
            </p>
            <p className="mt-2">
              <strong className="text-[var(--rm-text)]">What you put in the app:</strong> names or labels you assign to
              people on your roster, notes, message content or screenshots you choose to log, tier settings, and similar
              content you submit.
            </p>
            <p className="mt-2">
              <strong className="text-[var(--rm-text)]">Billing:</strong> if you subscribe, our payment processor
              (e.g. Stripe) receives and stores payment details — we don&apos;t store full card numbers on our servers.
            </p>
            <p className="mt-2">
              <strong className="text-[var(--rm-text)]">Support &amp; coaching links:</strong> if you email us or use
              third-party booking tools, those channels have their own policies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">How we use it</h2>
            <p className="mt-3">
              To provide, secure, improve, and troubleshoot the service; to process payments; to send transactional or
              service-related messages; to detect abuse, fraud, or violations of our terms; and to comply with law when
              required. We don&apos;t use your roster content to train public AI models unless we&apos;ve told you otherwise in
              writing and offered a clear opt-out where we&apos;re required to.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">AI features</h2>
            <p className="mt-3">
              Drafts, screenshot parsing, coaching-style reads, and similar features send relevant text or images to an
              AI provider under our control. Output is for your use only and can be wrong — it&apos;s not professional,
              legal, medical, or relationship advice. You&apos;re responsible for what you send and what you do with
              replies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Cookies &amp; similar tech</h2>
            <p className="mt-3">
              We use cookies and local storage to keep you signed in, remember preferences, and understand basic usage.
              You can block cookies in your browser; parts of the app may not work without them.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Who we share with</h2>
            <p className="mt-3">
              We share data with service providers who process it on our instructions — for example cloud hosting,
              authentication, database, payments, email delivery, analytics we enable, and AI inference. We may disclose
              information if we believe in good faith it&apos;s required by law, legal process, or to protect the rights,
              safety, or integrity of users, us, or the public. If we&apos;re involved in a merger or acquisition, your
              information may transfer as part of that transaction subject to this policy or a successor policy you&apos;re
              notified of.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Retention</h2>
            <p className="mt-3">
              We keep information as long as your account is active and as needed to provide the service, comply with
              law, resolve disputes, and enforce agreements. You can ask us to delete your account; some records may
              persist where law or legitimate business needs require (e.g. billing records).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Security</h2>
            <p className="mt-3">
              We use industry-typical technical and organizational measures. No method of transmission or storage is 100%
              secure. You agree we&apos;re not liable for unauthorized access beyond our reasonable control, to the maximum
              extent allowed by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Your choices &amp; rights</h2>
            <p className="mt-3">
              Depending on where you live, you may have rights to access, correct, delete, export, or restrict certain
              processing of your personal information, or to object to processing or opt out of certain uses. Contact
              us at the email below to make a request. We may need to verify you before responding. If you&apos;re in the
              EEA/UK/Switzerland or California, additional rights may apply under local law; we&apos;ll respond as required.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Children</h2>
            <p className="mt-3">
              STACK isn&apos;t directed at children under 13 (or the age required in your jurisdiction). Don&apos;t use the
              service if you&apos;re under that age. If we learn we&apos;ve collected a child&apos;s data without proper consent,
              we&apos;ll delete it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">International users</h2>
            <p className="mt-3">
              We may process and store information in the United States and other countries where we or our vendors
              operate. Those countries may have different data protection rules than yours. By using STACK, you consent
              to that transfer where consent is a valid basis.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Disclaimer</h2>
            <p className="mt-3">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. TO THE FULLEST EXTENT
              PERMITTED BY LAW, WE AND OUR AFFILIATES, OFFICERS, EMPLOYEES, AND SUPPLIERS ARE NOT LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL,
              OR REPUTATION, ARISING FROM YOUR USE OF THE SERVICE OR THIS POLICY, EVEN IF WE&apos;VE BEEN ADVISED OF THE
              POSSIBILITY. SOME JURISDICTIONS DON&apos;T ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR LIABILITY IS LIMITED
              TO THE MAXIMUM EXTENT ALLOWED BY LAW.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[var(--rm-text)]">Contact</h2>
            <p className="mt-3">
              Questions about this policy or a data request? Use whatever contact method we publish in the app or on
              this site (e.g. support email or in-app help). We&apos;ll get back to you within a reasonable time.
            </p>
          </section>
        </div>

        <p className="mt-12 border-t border-[var(--rm-border)] pt-8 text-[11px] leading-relaxed text-[var(--rm-text-muted)]">
          This page is a practical summary, not personalized legal advice. Have a lawyer review it for your entity,
          jurisdiction, and product — especially if you serve EU/UK users or regulated industries.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-xs uppercase tracking-[0.2em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
