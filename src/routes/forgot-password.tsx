import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Logo } from "@/components/brand/Logo";\nimport { resetPassword } from "@/lib/supabase";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormData = z.infer<typeof schema>;

function ForgotPassword() {
  const [sent, setSent] = useState(false);\n  const [serverErr, setServerErr] = useState("");

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(_data: FormData) {
    await new Promise((r) => setTimeout(r, 800));
    setSent(true);
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-12"
      style={{
        background: "var(--color-login-bg)",
        fontFamily: "var(--font-body)",
        color: "var(--color-text)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-10">
          <Logo />
        </div>

        {!sent ? (
          <>
            <h1
              className="mb-1"
              style={{ fontFamily: "var(--font-heading)", fontSize: "1.8rem", lineHeight: 1.1 }}
            >
              Reset password
            </h1>
            <p className="mb-8 text-sm" style={{ color: "var(--ink-2)" }}>
              Enter your email and we'll send a reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  {...register("email")}
                  className="w-full rounded-[10px] border bg-surface px-4 py-3 text-sm outline-none focus:ring-2"
                  style={{
                    borderColor: errors.email ? "var(--bad)" : "var(--hairline)",
                    // @ts-expect-error css variable
                    "--tw-ring-color": "var(--color-accent)",
                  }}
                />
                {errors.email && (
                  <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>
                    {errors.email.message}
                  </p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--color-accent)", boxShadow: "var(--shadow-accent)" }}
              >
                <Mail size={16} strokeWidth={1.75} />
                {isSubmitting ? "Sending…" : "Send reset link"}
              </motion.button>
              {serverErr && <p className="text-sm" style={{ color: "var(--bad)" }}>{serverErr}</p>}\n            </form>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl bg-surface p-8 text-center"
            style={{ border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)" }}
          >
            <div
              className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--ok) 10%, transparent)" }}
            >
              <Mail size={22} strokeWidth={1.75} style={{ color: "var(--ok)" }} />
            </div>
            <h2 className="text-lg font-semibold">Check your inbox</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
              We sent a reset link to <strong>{getValues("email")}</strong>.
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
              (Demo mode — no real email is sent)
            </p>
          </motion.div>
        )}

        <div className="mt-8">
          <Link
            to="/signin"
            className="inline-flex items-center gap-2 text-sm font-medium"
            style={{ color: "var(--ink-2)" }}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
