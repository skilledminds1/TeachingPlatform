"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createPlanSale,
  deactivatePlanSale,
  updatePlanSale,
} from "@/actions/admin-subscriptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatDateTime } from "@/lib/format";

type PlanOption = {
  id: string;
  name: string;
  slug: string;
};

type SaleItem = {
  id: string;
  name: string;
  percentOff: number;
  paddleDiscountId: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  active: boolean;
  isLive: boolean;
  intervalScope: "monthly" | "annual" | "both";
  plans: Array<{ plan: PlanOption }>;
};

function toLocalInputValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlanSaleManager({
  plans,
  sales,
  viewerTimeZone,
}: {
  plans: PlanOption[];
  sales: SaleItem[];
  /** INT-03: the viewer's IANA zone — client components cannot read the session. */
  viewerTimeZone: string;
}) {
  const paidPlans = useMemo(
    () => plans.filter((plan) => plan.slug !== "free"),
    [plans],
  );

  return (
    <div className="space-y-6">
      <SaleForm plans={paidPlans} />
      <div className="space-y-3">
        {sales.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            No scheduled sales yet. Create one to discount selected plans publicly.
          </p>
        ) : (
          sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} plans={paidPlans} viewerTimeZone={viewerTimeZone} />
          ))
        )}
      </div>
    </div>
  );
}

function SaleForm({
  plans,
  sale,
}: {
  plans: PlanOption[];
  sale?: SaleItem;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(sale?.name ?? "");
  const [percentOff, setPercentOff] = useState(String(sale?.percentOff ?? 20));
  const [paddleDiscountId, setPaddleDiscountId] = useState(sale?.paddleDiscountId ?? "");
  const [startsAt, setStartsAt] = useState(
    sale ? toLocalInputValue(sale.startsAt) : "",
  );
  const [endsAt, setEndsAt] = useState(sale ? toLocalInputValue(sale.endsAt) : "");
  const [intervalScope, setIntervalScope] = useState<"monthly" | "annual" | "both">(
    sale?.intervalScope ?? "both",
  );
  const [active, setActive] = useState(sale?.active ?? true);
  const [planIds, setPlanIds] = useState<string[]>(
    sale?.plans.map((item) => item.plan.id) ?? plans.map((plan) => plan.id),
  );

  function togglePlan(planId: string) {
    setPlanIds((current) =>
      current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId],
    );
  }

  function submit() {
    if (!startsAt || !endsAt) {
      toast.error("Set a start and end date for the sale.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name,
        percentOff: Number(percentOff),
        paddleDiscountId: paddleDiscountId.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        intervalScope,
        planIds,
        active,
      };
      const result = sale
        ? await updatePlanSale({ ...payload, saleId: sale.id })
        : await createPlanSale(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(sale ? "Sale updated." : "Sale created.");
      if (!sale) {
        setName("");
        setPercentOff("20");
        setStartsAt("");
        setEndsAt("");
        setIntervalScope("both");
        setActive(true);
        setPlanIds(plans.map((plan) => plan.id));
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-heading text-lg font-semibold">
        {sale ? "Edit sale" : "Create scheduled sale"}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Name</Label>
          <Input
            value={name}
            placeholder="Spring teaching sale"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Percent off</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={percentOff}
            onChange={(event) => setPercentOff(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Paddle discount ID</Label>
          <Input
            value={paddleDiscountId}
            placeholder="dsc_01abc…"
            onChange={(event) => setPaddleDiscountId(event.target.value)}
          />
          {/*
            Not decoration. Paddle applies a discount by id, so a sale without one cannot be
            charged — and rather than show a percentage the till will ignore, the plan cards
            hide the sale entirely until this is filled in.
          */}
          <p className="text-xs text-muted-foreground">
            {paddleDiscountId.trim()
              ? "Create this discount in Paddle → Catalog → Discounts. It must cover the plans selected below."
              : "Without a Paddle discount ID this sale is saved but never shown or applied."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Interval scope</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={intervalScope}
            onChange={(event) =>
              setIntervalScope(event.target.value as "monthly" | "annual" | "both")
            }
          >
            <option value="both">Monthly & annual</option>
            <option value="monthly">Monthly only</option>
            <option value="annual">Annual only</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Starts</Label>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ends</Label>
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label>Plans included</Label>
        <div className="flex flex-wrap gap-3">
          {plans.map((plan) => (
            <label key={plan.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={planIds.includes(plan.id)}
                onChange={() => togglePlan(plan.id)}
              />
              {plan.name}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        <Button size="sm" onClick={submit} disabled={isPending}>
          {isPending ? "Saving…" : sale ? "Update sale" : "Create sale"}
        </Button>
      </div>
    </div>
  );
}

function SaleCard({
  sale,
  plans,
  viewerTimeZone,
}: {
  sale: SaleItem;
  plans: PlanOption[];
  viewerTimeZone: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function deactivate() {
    startTransition(async () => {
      const result = await deactivatePlanSale({ saleId: sale.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Sale deactivated.");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <SaleForm plans={plans} sale={sale} />
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Close editor
        </Button>
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{sale.name}</h4>
          <StatusBadge tone={sale.isLive ? "success" : sale.active ? "warning" : "neutral"}>
            {sale.isLive ? "Live" : sale.active ? "Scheduled" : "Inactive"}
          </StatusBadge>
          <span className="text-xs font-medium text-emerald-600">{sale.percentOff}% off</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(sale.startsAt, viewerTimeZone)} → {formatDateTime(sale.endsAt, viewerTimeZone)} ·{" "}
          {sale.intervalScope === "both" ? "all intervals" : sale.intervalScope}
        </p>
        <p className="text-xs text-muted-foreground">
          {sale.plans.map((item) => item.plan.name).join(", ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {sale.active ? (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={deactivate}>
            Deactivate
          </Button>
        ) : null}
      </div>
    </article>
  );
}
