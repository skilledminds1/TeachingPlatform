"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updatePlanCatalog } from "@/actions/admin-subscriptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planFeatureLabels, planFeatures, type PlanFeature } from "@/features/billing/lib/plan-feature-labels";
import { formatCurrency } from "@/lib/format";

type PlanCatalogItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  studentLimit: number | null;
  monthlyLiveLessonMinutes: number | null;
  courseLimit: number | null;
  features: string[];
  marketplaceListing: boolean;
  videoSessions: boolean;
  teacherPayments: boolean;
  highlighted: boolean;
  sortOrder: number;
  isPublic: boolean;
  monthlyEffective: {
    listCents: number;
    effectiveCents: number;
    percentOff: number;
  };
  annualEffective: {
    listCents: number;
    effectiveCents: number;
    percentOff: number;
  };
};

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function PlanCatalogEditor({ plans }: { plans: PlanCatalogItem[] }) {
  return (
    <div className="space-y-4">
      {plans.map((plan) => (
        <PlanEditorCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanEditorCard({ plan }: { plan: PlanCatalogItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [monthlyDollars, setMonthlyDollars] = useState(String(plan.monthlyPriceCents / 100));
  const [annualDollars, setAnnualDollars] = useState(String(plan.annualPriceCents / 100));
  const [currency, setCurrency] = useState(plan.currency);
  const [studentLimit, setStudentLimit] = useState(
    plan.studentLimit === null ? "" : String(plan.studentLimit),
  );
  const [liveHours, setLiveHours] = useState(
    plan.monthlyLiveLessonMinutes === null
      ? ""
      : String(plan.monthlyLiveLessonMinutes / 60),
  );
  const [courseLimit, setCourseLimit] = useState(
    plan.courseLimit === null ? "" : String(plan.courseLimit),
  );
  const [features, setFeatures] = useState<PlanFeature[]>(
    plan.features.filter((feature): feature is PlanFeature =>
      (planFeatures as readonly string[]).includes(feature),
    ),
  );
  const [marketplaceListing, setMarketplaceListing] = useState(plan.marketplaceListing);
  const [videoSessions, setVideoSessions] = useState(plan.videoSessions);
  const [teacherPayments, setTeacherPayments] = useState(plan.teacherPayments);
  const [highlighted, setHighlighted] = useState(plan.highlighted);
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [isPublic, setIsPublic] = useState(plan.isPublic);

  function toggleFeature(feature: PlanFeature) {
    setFeatures((current) =>
      current.includes(feature)
        ? current.filter((item) => item !== feature)
        : [...current, feature],
    );
  }

  function save() {
    const monthlyPriceCents = Math.round(Number(monthlyDollars) * 100);
    const annualPriceCents = Math.round(Number(annualDollars) * 100);
    if (!Number.isFinite(monthlyPriceCents) || !Number.isFinite(annualPriceCents)) {
      toast.error("Enter valid prices.");
      return;
    }

    startTransition(async () => {
      const result = await updatePlanCatalog({
        planId: plan.id,
        name,
        description: description.trim() || null,
        monthlyPriceCents,
        annualPriceCents,
        currency,
        studentLimit: optionalInt(studentLimit),
        monthlyLiveLessonMinutes: (() => {
          const hours = optionalInt(liveHours);
          return hours === null ? null : hours * 60;
        })(),
        courseLimit: optionalInt(courseLimit),
        features,
        marketplaceListing,
        videoSessions,
        teacherPayments,
        highlighted,
        sortOrder: optionalInt(sortOrder) ?? 0,
        isPublic,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} updated.`);
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
          <p className="text-xs text-muted-foreground">slug: {plan.slug}</p>
          {plan.monthlyEffective.percentOff > 0 || plan.annualEffective.percentOff > 0 ? (
            <p className="mt-1 text-xs font-medium text-emerald-600">
              Active sale · monthly{" "}
              {formatCurrency(plan.monthlyEffective.effectiveCents, plan.currency)} · annual{" "}
              {formatCurrency(plan.annualEffective.effectiveCents, plan.currency)}
            </p>
          ) : null}
        </div>
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save plan"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Monthly price (USD)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={monthlyDollars}
            onChange={(event) => setMonthlyDollars(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Annual price (USD)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={annualDollars}
            onChange={(event) => setAnnualDollars(event.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Student limit (blank = unlimited)</Label>
          <Input
            value={studentLimit}
            onChange={(event) => setStudentLimit(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Live hours / month (blank = unlimited)</Label>
          <Input value={liveHours} onChange={(event) => setLiveHours(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Course limit (blank = unlimited)</Label>
          <Input
            value={courseLimit}
            onChange={(event) => setCourseLimit(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Sort order</Label>
          <Input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={highlighted}
            onChange={(event) => setHighlighted(event.target.checked)}
          />
          Highlighted
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Public
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={marketplaceListing}
            onChange={(event) => setMarketplaceListing(event.target.checked)}
          />
          Marketplace listing
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={videoSessions}
            onChange={(event) => setVideoSessions(event.target.checked)}
          />
          Video sessions
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={teacherPayments}
            onChange={(event) => setTeacherPayments(event.target.checked)}
          />
          Teacher payments
        </label>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">Features</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {planFeatures.map((feature) => (
            <label key={feature} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={features.includes(feature)}
                onChange={() => toggleFeature(feature)}
              />
              <span>{planFeatureLabels[feature] ?? feature}</span>
            </label>
          ))}
        </div>
      </div>
    </article>
  );
}
