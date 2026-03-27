"use client";

import { createBrowserSupabase } from "../../lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type View = "sign_in" | "sign_up";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();

  const [view, setView] = useState<View>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 100);
    const t2 = setTimeout(() => setStep(2), 400);
    const t3 = setTimeout(() => setStep(3), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.push("/home");
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (view === "sign_up") {
      const { error: signUpError } = await supabase.auth.signUp({
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
        setError(signUpError.message);
        setLoading(false);
      }
    } else {
      const { error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
      }
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "#0b0e11" }}
    >
      <div className="w-full max-w-sm">
        {/* Title */}
        <div
          className={`text-center transition-all duration-[1200ms] ease-out ${
            step >= 1 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <h1 className="text-5xl font-light tracking-[0.5em]">STACK</h1>
        </div>

        {/* Tagline */}
        <div
          className={`mt-4 text-center transition-all duration-[900ms] ease-out ${
            step >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <p className="font-light italic tracking-[0.15em] text-[#a8adb8]">
            Your circle, curated.
          </p>
        </div>

        {/* Form */}
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
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 text-sm text-[#fafafa] placeholder-[#444a55] outline-none transition focus:border-[#fafafa]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
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

          {error ? (
            <p className="text-xs text-rose-400">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#fafafa] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[#0b0e11] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Hold on..."
              : view === "sign_in"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        {/* Bottom link */}
        <div
          className={`mt-16 text-center transition-all duration-700 ease-out ${
            step >= 3 ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setView(view === "sign_in" ? "sign_up" : "sign_in");
              setError(null);
            }}
            className="text-[11px] tracking-[0.1em] text-[#555a66] transition hover:text-[#a8adb8]"
          >
            {view === "sign_in"
              ? "Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
