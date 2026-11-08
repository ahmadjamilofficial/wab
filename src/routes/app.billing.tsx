import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, CreditCard, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Panel, StatusPill } from "@/components/kit";
import { PeriodToggle, PlanCards } from "@/components/site/PlanCards";
import { useAuth } from "@/lib/auth-context";
import {
  MONTHLY_DAYS,
  YEARLY_DAYS,
  pausePaidClock,
  resolveEntitlement,
  resumePaidClock,
} from "@/lib/entitlement";
import {
  type ChargePeriod,
  type PlanId,
  PLANS,
  TRIAL_DAYS,
  kelviqCheckoutUrl,
  normalizePlanId,
} from "@/lib/plans";
import { supabase } from "@/lib/supabase";
import {
  clearTrialClock,
  getTrialClock,
  isTrialExpired,
  startTrialClock,
  trialDaysRemaining,
} from "@/lib/trial";

export const Route = createFileRoute("/app/billing")({
  component: Billing,
});

interface SubRow {
  plan: string;
  status: string;
  trial_end_at: string | null;
  charge_period?: string | null;
  current_period_end?: string | null;
  created_at?: string | null;
}

function Billing() {
  const { profile, user, refreshProfile } = useAuth();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [period, setPeriod] = useState<ChargePeriod>("monthly");
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const orgId = profile?.org_id;
    if (!orgId) return;
    void (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, status, trial_end_at, charge_period, current_period_end, created_at")
        .eq("org_id", orgId)
        .maybeSingle();
      if (!alive) return;
      setSub((data as SubRow | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [profile?.org_id, clockTick]);

  const orgId = profile?.org_id ?? "";
  const userId = user?.id ?? "";
  const clock = getTrialClock(orgId, userId);
  const serverEnds = sub?.trial_end_at ?? null;
  const entitlement = resolveEntitlement({
    orgId,
    userId,
    subPlan: sub?.plan ?? profile?.plan,
    subStatus: sub?.status ?? profile?.plan_status,
    chargePeriod: sub?.charge_period,
    currentPeriodEnd: sub?.current_period_end,
    createdAt: sub?.created_at,
  });
  const currentPlan = normalizePlanId(entitlement.featurePlan);
  const status = sub?.status ?? profile?.plan_status ?? "active";
  const onTrial =
    status === "trialing" || (Boolean(clock) && !isTrialExpired(clock, serverEnds) && currentPlan === "standard");
  const trialDays = trialDaysRemaining(clock, serverEnds);
  const trialExpired =
    (status === "trialing" && isTrialExpired(clock, serverEnds)) ||
    (Boolean(clock) && isTrialExpired(clock, serverEnds) && currentPlan !== "pro" && status !== "active");

  const priceNow =
    currentPlan === "free"
      ? "$0"
      : period === "yearly" || sub?.charge_period === "YEARLY"
        ? `$${PLANS[currentPlan].yearlyPrice}/year`
        : `$${PLANS[currentPlan].monthlyPrice}/month`;

  async function revertToFree() {
    if (!orgId || !userId) return;
    pausePaidClock(orgId, userId);
    try {
      await supabase
        .from("subscriptions")
        .update({ cancel_at_period_end: true } as never)
        .eq("org_id", orgId);
    } catch {
      /* local pause still applies */
    }
    setClockTick((n) => n + 1);
    await refreshProfile();
    toast.success("Reverted to Basic ($0). You can restore your paid plan for free until the paid window ends.");
  }

  async function restorePaid(plan: PlanId) {
    if (!orgId || !userId) return;
    if (plan !== "standard" && plan !== "pro") return;
    if (!entitlement.canRestore || entitlement.paidPlan !== plan) return;
    resumePaidClock(orgId, userId);
    try {
      await supabase
        .from("subscriptions")
        .update({ cancel_at_period_end: false, status: "active", plan } as never)
        .eq("org_id", orgId);
    } catch {
      /* local resume still applies */
    }
    setClockTick((n) => n + 1);
    await refreshProfile();
    toast.success(`Restored ${PLANS[plan].name} at no extra charge. ${entitlement.daysLeft} day(s) left in this cycle.`);
  }

  function openPlan(plan: PlanId) {
    if (plan === "free") {
      if (currentPlan === "free") {
        toast.info("You are already on Basic.");
        return;
      }
      void revertToFree();
      return;
    }
    if (entitlement.canRestore && entitlement.paidPlan === plan && !entitlement.expired) {
      void restorePaid(plan);
      return;
    }
    window.open(kelviqCheckoutUrl({ plan, period, orgId }), "_blank", "noopener");
    toast.info(`Opening secure checkout for ${PLANS[plan].name}.`);
  }

  async function handleStartTrial() {
    if (!orgId || !userId) {
      toast.error("Sign in to start the free trial.");
      return;
    }
    const started = startTrialClock(orgId, userId);
    try {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("org_id", orgId)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("subscriptions")
          .update({
            plan: "standard",
            status: "trialing",
            charge_period: "MONTHLY",
            trial_end_at: started.endsAt,
          } as never)
          .eq("id", existing.id);
      } else {
        await supabase.from("subscriptions").insert({
          org_id: orgId,
          plan: "standard",
          status: "trialing",
          charge_period: "MONTHLY",
          trial_end_at: started.endsAt,
        } as never);
      }
    } catch {
      /* local clock still tracks days if the row cannot be written */
    }
    setClockTick((n) => n + 1);
    window.open(
      kelviqCheckoutUrl({ plan: "standard", period: "monthly", orgId }),
      "_blank",
      "noopener",
    );
    toast.info(`Started your ${TRIAL_DAYS}-day Standard trial. Days keep counting even if you sign out.`);
  }

  function handleStayBasic() {
    clearTrialClock(orgId, userId);
    void revertToFree();
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Billing</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
          Manage your plan, usage and payment details.
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
              CURRENT PLAN
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold">{PLANS[currentPlan].name}</p>
              <StatusPill tone={onTrial ? "info" : trialExpired ? "bad" : "ok"}>
                {onTrial
                  ? `Free trial · ${trialDays} day${trialDays === 1 ? "" : "s"} left`
                  : trialExpired
                    ? "Trial ended"
                    : currentPlan === "free"
                      ? "Free"
                      : "Active"}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              {priceNow}
              {onTrial
                ? " · free until your trial ends"
                : currentPlan === "free" && entitlement.canRestore
                  ? ` · Basic now · ${entitlement.paidPlan ? PLANS[entitlement.paidPlan].name : "paid"} can be restored free for ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? "" : "s"}`
                  : currentPlan === "free"
                    ? " · completely free"
                    : ` · billed every ${period === "yearly" ? `${YEARLY_DAYS} days` : `${MONTHLY_DAYS} days`}${
                        entitlement.daysLeft
                          ? ` · ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? "" : "s"} left in this cycle`
                          : ""
                      }`}
            </p>
          </div>
          <Btn
            variant="secondary"
            onClick={() => openPlan(currentPlan === "free" ? "standard" : currentPlan)}
          >
            <CreditCard size={15} strokeWidth={1.75} />
            Manage payment
          </Btn>
        </div>
      </Panel>

      {trialExpired && (
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: "color-mix(in srgb, var(--bad) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--bad) 24%, transparent)" }}
        >
          <p className="text-sm font-semibold">Your {TRIAL_DAYS}-day Standard trial has ended</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
            Upgrade to keep Standard or Pro features, or switch back to Basic at $0 with limited AI
            quality and tools.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="primary" onClick={() => openPlan("standard")}>
              Upgrade to Standard
            </Btn>
            <Btn variant="secondary" onClick={() => openPlan("pro")}>
              Upgrade to Pro
            </Btn>
            <Btn variant="secondary" onClick={handleStayBasic}>
              Continue on Basic $0
            </Btn>
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4"
        style={{ background: "var(--accent-6)", border: "1px solid var(--accent-15)" }}
      >
        <div className="flex items-start gap-3">
          <Sparkles
            size={16}
            strokeWidth={1.75}
            style={{ color: "var(--color-accent)", marginTop: 2 }}
          />
          <div>
            <p className="text-sm font-semibold">
              {onTrial
                ? `${TRIAL_DAYS}-day Standard trial — ${trialDays} day${trialDays === 1 ? "" : "s"} remaining`
                : trialExpired
                  ? "Trial ended — upgrade or switch to Basic"
                  : `Start a ${TRIAL_DAYS}-day free trial of Standard`}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
              This card is the only way to start a free trial. Days are counted strictly from the
              start date and continue if you sign out or sign back in. After {TRIAL_DAYS} days you
              choose Standard, Pro, or Basic $0.
            </p>
          </div>
        </div>
        <Btn
          variant="primary"
          disabled={onTrial}
          onClick={() => {
            if (trialExpired) openPlan("standard");
            else void handleStartTrial();
          }}
        >
          {onTrial
            ? "Trial active"
            : trialExpired
              ? "Upgrade to Standard"
              : `Start ${TRIAL_DAYS}-day free trial`}
        </Btn>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">Available Plans</p>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>
      <PlanCards
        period={period}
        {...(trialExpired ? {} : { currentPlan })}
        onSelect={openPlan}
        ctaFor={(id) => {
          if (id === "free") return currentPlan === "free" ? "Current plan" : "Revert to Basic $0";
          if (entitlement.canRestore && entitlement.paidPlan === id) {
            return `Restore ${PLANS[id].name} free · ${entitlement.daysLeft}d left`;
          }
          return `Subscribe to ${PLANS[id].name}`;
        }}
      />

      <div
        className="flex items-start gap-2.5 rounded-2xl px-5 py-4 text-sm"
        style={{ background: "var(--accent-6)", border: "1px solid var(--accent-15)" }}
      >
        <ArrowUpRight
          size={15}
          strokeWidth={1.75}
          style={{ color: "var(--color-accent)", marginTop: 2, flexShrink: 0 }}
        />
        <p style={{ color: "var(--ink-2)" }}>
          <strong>Plans:</strong> Basic is $0. Switching to Basic from a paid plan happens in the
          app — no Kelviq checkout. If your paid cycle is still active ({MONTHLY_DAYS} days monthly /{" "}
          {YEARLY_DAYS} days yearly, counted strictly), you can restore that paid plan at no extra
          charge. New paid cycles still go through Kelviq. A {TRIAL_DAYS}-day trial applies only to
          Standard from the trial card above.
        </p>
      </div>
    </div>
  );
}
