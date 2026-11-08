import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRightCircle, Eye, EyeOff } from "lucide-react";
import { persistInviteToken } from "@/lib/team";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LogoIcon } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signUpWithEmail, signInWithGoogle } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { kelviqCheckoutUrl, normalizePlanId } from "@/lib/plans";

export const Route = createFileRoute("/signup")({
  component: SignUp,
});

const schema = z
  .object({
    full_name: z.string().min(2, "Name is required"),
    email: z.string().email("Enter a valid email"),
    org: z.string().min(2, "Organisation name is required"),
    jurisdiction: z.enum(["PSX", "NSE"]),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

function SignUp() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    persistInviteToken(new URLSearchParams(window.location.search).get("invite"));
  }, []);

  // Get plan from URL query param
  const searchParams = new URLSearchParams(window.location.search);
  const selectedPlan = searchParams.get("plan");

  // As soon as session is confirmed, redirect to checkout if plan selected, otherwise dashboard
  useEffect(() => {
    if (!loading && session) {
      if (selectedPlan) {
        // Get org_id from profile first
        const fetchProfileAndRedirect = async () => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("org_id")
            .eq("user_id", session.user.id)
            .single();

          if (profileData) {
            if (selectedPlan === "trial") {
              nav({ to: "/app/billing" });
              return;
            }
            const plan = normalizePlanId(selectedPlan === "basic" ? "free" : selectedPlan);
            window.location.href = kelviqCheckoutUrl({
              plan,
              orgId: profileData.org_id,
            });
          }
        };
        fetchProfileAndRedirect();
      } else {
        nav({ to: "/app/overview", replace: true });
      }
    }
  }, [session, loading, nav, selectedPlan]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { jurisdiction: "PSX" },
  });

  async function onSubmit(data: FormData) {
    setServerErr("");
    try {
      await signUpWithEmail(data.email, data.password, {
        full_name: data.full_name,
        org_name: data.org,
        jurisdiction: data.jurisdiction,
      });
      // Supabase sends a confirmation email by default.
      // If email confirmation is disabled in Supabase, redirect directly.
      setEmailSent(true);
    } catch (e) {
      setServerErr((e as Error).message);
    }
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setServerErr((e as Error).message);
      setGoogleLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-6"
        style={{ background: "var(--color-login-bg)", fontFamily: "var(--font-body)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm rounded-2xl bg-surface p-10 text-center"
          style={{ border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)" }}
        >
          <div
            className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--ok) 10%, transparent)" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ok)"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.4rem" }}>
            Check your inbox
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            We sent a confirmation link. Click it to activate your account and log in.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            (If email confirmation is disabled in your Supabase project, you can{" "}
            <button
              type="button"
              className="underline"
              style={{ color: "var(--color-accent)" }}
              onClick={() => nav({ to: "/signin" })}
            >
              sign in now
            </button>
            .)
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ fontFamily: "var(--font-body)", color: "var(--color-text)" }}
    >
      {/* LEFT brand panel */}
      <div
        className="relative hidden w-[42%] flex-col justify-between p-12 lg:flex"
        style={{ background: "var(--brand-panel)", color: "var(--brand-panel-fg)" }}
      >
        <LogoIcon size={34} tone="onDark" />

        <div className="max-w-xs">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(1.6rem,3vw,2.2rem)",
              lineHeight: 1.1,
              color: "var(--brand-panel-fg)",
            }}
          >
            Start your audit-ready ledger in minutes.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="mt-4 text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Free for your first 50 transactions. No credit card required.
          </motion.p>
        </div>

        <div className="space-y-3">
          {[
            "Multimodal statement parser (PDF, photo, CSV)",
            "FIFO CGT computation for PSX & NSE",
            "Immutable hash-chained audit trail",
            "Tax-loss harvesting recommendations",
          ].map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-start gap-2.5 text-sm"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              <span
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--color-accent)", color: "var(--accent-fg)" }}
              >
                ✓
              </span>
              {item}
            </motion.div>
          ))}
        </div>
      </div>

      {/* RIGHT form */}
      <div
        className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12"
        style={{ background: "var(--color-login-bg)" }}
      >
        <Link
          to="/"
          className="absolute left-5 top-5 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold md:inline-flex"
          style={{ border: "1px solid var(--hairline)", color: "var(--ink-2)", background: "var(--surface)" }}
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to home
        </Link>
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="mb-8 lg:hidden">
          <LogoIcon size={30} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <h1
            className="mb-1"
            style={{ fontFamily: "var(--font-heading)", fontSize: "1.8rem", lineHeight: 1.1 }}
          >
            Create account
          </h1>
          <p className="mb-6 text-sm" style={{ color: "var(--ink-2)" }}>
            Already have an account?{" "}
            <Link to="/signin" className="font-medium" style={{ color: "var(--color-accent)" }}>
              Sign in
            </Link>
          </p>

          {/* Google OAuth */}
          <motion.button
            type="button"
            disabled={googleLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleSignUp}
            className="flex w-full items-center justify-center gap-3 rounded-full border bg-surface px-6 py-3 text-sm font-medium transition-shadow hover:shadow-md disabled:opacity-60"
            style={{ borderColor: "var(--hairline)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? "Redirecting…" : "Sign up with Google"}
          </motion.button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              or sign up with email
            </span>
            <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Full name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Full name</label>
              <input
                type="text"
                placeholder="Your full name"
                {...register("full_name")}
                className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                style={{
                  borderColor: errors.full_name ? "var(--bad)" : "var(--hairline)",
                  ["--tw-ring-color" as string]: "var(--color-accent)",
                }}
              />
              {errors.full_name && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.full_name.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                style={{
                  borderColor: errors.email ? "var(--bad)" : "var(--hairline)",
                  ["--tw-ring-color" as string]: "var(--color-accent)",
                }}
              />
              {errors.email && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Organisation */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Organisation name</label>
              <input
                type="text"
                placeholder="My Trading Firm"
                {...register("org")}
                className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                style={{
                  borderColor: errors.org ? "var(--bad)" : "var(--hairline)",
                  ["--tw-ring-color" as string]: "var(--color-accent)",
                }}
              />
              {errors.org && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.org.message}
                </p>
              )}
            </div>

            {/* Jurisdiction */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Default jurisdiction</label>
              <select
                {...register("jurisdiction")}
                className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                style={{
                  borderColor: "var(--hairline)",
                  ["--tw-ring-color" as string]: "var(--color-accent)",
                }}
              >
                <option value="PSX">PSX — Pakistan (CGT + WHT)</option>
                <option value="NSE">NSE — India (STCG / LTCG)</option>
              </select>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="At least 8 characters"
                  {...register("password")}
                  className="w-full rounded-[10px] border bg-surface px-4 py-3 pr-11 text-sm outline-none focus:ring-2"
                  style={{
                    borderColor: errors.password ? "var(--bad)" : "var(--hairline)",
                    ["--tw-ring-color" as string]: "var(--color-accent)",
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPw(!showPw)}
                  style={{ color: "var(--ink-3)" }}
                >
                  {showPw ? (
                    <EyeOff size={18} strokeWidth={1.75} />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <input
                type={showPw ? "text" : "password"}
                placeholder="Repeat password"
                {...register("confirm")}
                className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                style={{
                  borderColor: errors.confirm ? "var(--bad)" : "var(--hairline)",
                  ["--tw-ring-color" as string]: "var(--color-accent)",
                }}
              />
              {errors.confirm && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                  {errors.confirm.message}
                </p>
              )}
            </div>

            {serverErr && (
              <div
                className="rounded-[10px] px-4 py-3 text-sm"
                style={{
                  background: "color-mix(in srgb, var(--bad) 8%, transparent)",
                  color: "var(--bad)",
                }}
              >
                {serverErr}
              </div>
            )}

            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-between gap-4 rounded-full px-6 py-3.5 text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-accent)", color: "var(--accent-fg)" }}
            >
              {isSubmitting ? "Creating account…" : "Create free account"}
              {!isSubmitting && <ArrowRightCircle size={18} strokeWidth={1.75} />}
            </motion.button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
            By signing up you agree to our Terms of Service. Wab does not provide tax or legal
            advice.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
