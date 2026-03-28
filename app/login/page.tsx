"use client";

import { createBrowserSupabase } from "../../lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type View = "sign_in" | "sign_up" | "forgot";

function isEmailNotConfirmed(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  const code = (err as { code?: string }).code ?? "";
  return (
    code === "email_not_confirmed" ||
    msg.includes("email not confirmed") ||
    msg.includes("not confirmed")
  );
}

function isAlreadyRegistered(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  const code = (err as { code?: string }).code ?? "";
  return (
    code === "user_already_exists" ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already")
  );
}

export default function LoginPage() {
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabase();
    } catch (e) {
      console.error("Supabase init failed:", e);
      return null;
    }
  }, []);
  const router = useRouter();

  const [view, setView] = useState<View>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 100);
    const t2 = setTimeout(() => setStep(2), 400);
    const t3 = setTimeout(() => setStep(3), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && view !== "forgot") {
        router.push("/home");
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase, router, view]);

  const resetFormMessages = () => {
    setError(null);
    setSuccessMessage(null);
    setShowResendConfirmation(false);
  };

  const handleResendConfirmation = async () => {
    if (!supabase || !email.trim()) {
      setError("Enter your email above first.");
      return;
    }
    setResendLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (resendError) {
        setError(resendError.message);
        return;
      }
      setSuccessMessage(
        "Confirmation email sent. Check inbox and spam, then open the link before signing in."
      );
      setShowResendConfirmation(false);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("App is not configured. NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from the environment. Contact the developer.");
      return;
    }

    if (view === "forgot") {
      if (!email.trim()) {
        setError("Enter the email for your account.");
        return;
      }
      setLoading(true);
      resetFormMessages();
      try {
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
          }
        );
        if (resetError) {
          setError(resetError.message);
          return;
        }
        setSuccessMessage(
          "If an account exists for that email, we sent a reset link. Check your inbox and spam."
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (view === "sign_up") {
      if (password !== passwordConfirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    resetFormMessages();

    try {
      if (view === "sign_up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/callback`
                : undefined,
          },
        });
        if (signUpError) {
          if (isAlreadyRegistered(signUpError)) {
            setError(
              "This email already has an account. Sign in with your password below — or resend a confirmation email if you never verified."
            );
            setShowResendConfirmation(true);
          } else {
            setError(signUpError.message);
          }
          return;
        }
        if (data.session) {
          router.push("/home");
        } else {
          setSuccessMessage(
            "Check your email for a confirmation link, then sign in. If you don't see it, check spam."
          );
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          if (isEmailNotConfirmed(signInError)) {
            setError(
              "Confirm your email before signing in. Check spam for the original link, or send a new one below."
            );
            setShowResendConfirmation(true);
          } else {
            setError(signInError.message);
          }
          return;
        }
        router.push("/home");
      }
    } finally {
      setLoading(false);
    }
  };

  const switchView = (next: View) => {
    setView(next);
    setError(null);
    setSuccessMessage(null);
    if (next === "forgot") setShowResendConfirmation(false);
    if (next !== "sign_up") setPasswordConfirm("");
  };

  const primaryLabel =
    view === "forgot"
      ? "Send reset link"
      : view === "sign_in"
        ? "Sign In"
        : "Create Account";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "#0b0e11" }}
    >
      <div className="w-full max-w-sm">
        <div
          className={`text-center transition-all duration-[1200ms] ease-out ${
            step >= 1 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <h1 className="text-5xl font-light tracking-[0.5em]">STACK</h1>
        </div>

        <div
          className={`mt-4 text-center transition-all duration-[900ms] ease-out ${
            step >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <p className="font-light italic tracking-[0.15em] text-[#a8adb8]">
            {view === "forgot" ? "Reset your password" : "Your circle, curated."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`mt-12 space-y-5 transition-all duration-[900ms] ease-out ${
            step >= 2 ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); resetFormMessages(); }}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 text-sm text-[#fafafa] placeholder-[#444a55] outline-none transition focus:border-[#fafafa]"
            />
          </div>

          {view !== "forgot" ? (
            <>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); resetFormMessages(); }}
                    required
                    autoComplete={view === "sign_up" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 pr-12 text-sm text-[#fafafa] placeholder-[#444a55] outline-none transition focus:border-[#fafafa]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8adb8] transition hover:text-[#fafafa]"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.25} />
                    ) : (
                      <Eye size={16} strokeWidth={1.25} />
                    )}
                  </button>
                </div>
              </div>

              {view === "sign_up" ? (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
                    Confirm password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => { setPasswordConfirm(e.target.value); resetFormMessages(); }}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 text-sm text-[#fafafa] placeholder-[#444a55] outline-none transition focus:border-[#fafafa]"
                  />
                </div>
              ) : null}

              {view === "sign_in" ? (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-[11px] tracking-[0.08em] text-[#555a66] transition hover:text-[#a8adb8]"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <p className="text-xs text-rose-400">{error}</p>
          ) : null}
          {successMessage ? (
            <p className="text-xs text-emerald-400/90">{successMessage}</p>
          ) : null}

          {showResendConfirmation && view !== "forgot" ? (
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendLoading || !email.trim()}
              className="w-full border border-[#2a2e36] py-2.5 text-[11px] uppercase tracking-[0.2em] text-[#a8adb8] transition hover:border-[#fafafa] hover:text-[#fafafa] disabled:opacity-50"
            >
              {resendLoading ? "Sending…" : "Resend confirmation email"}
            </button>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#fafafa] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[#0b0e11] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Hold on..." : primaryLabel}
          </button>
        </form>

        <div
          className={`mt-16 text-center transition-all duration-700 ease-out ${
            step >= 3 ? "opacity-100" : "opacity-0"
          }`}
        >
          {view === "forgot" ? (
            <button
              type="button"
              onClick={() => switchView("sign_in")}
              className="text-[11px] tracking-[0.1em] text-[#555a66] transition hover:text-[#a8adb8]"
            >
              Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchView(view === "sign_in" ? "sign_up" : "sign_in")}
              className="text-[11px] tracking-[0.1em] text-[#555a66] transition hover:text-[#a8adb8]"
            >
              {view === "sign_in"
                ? "Create an account"
                : "Already have an account? Sign in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
