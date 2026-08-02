"use client";

import { Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ConversationListItem = {
  id: string;
  name: string;
  avatarUrl: string | null;
  preview: string;
  dateLabel: string;
  unread: number;
  platformOwner?: boolean;
};

const tabs = ["All", "Unread", "Archived"] as const;
type Tab = (typeof tabs)[number];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ConversationSidebar({
  conversations,
  activeId,
  emptyHint,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("All");

  const unreadTotal = conversations.reduce((sum, item) => sum + item.unread, 0);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((item) => {
      if (tab === "Unread" && item.unread === 0) return false;
      if (tab === "Archived") return false;
      if (!normalized) return true;
      return (
        item.name.toLowerCase().includes(normalized) ||
        item.preview.toLowerCase().includes(normalized)
      );
    });
  }, [conversations, query, tab]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-e border-border/60 bg-background md:w-80 lg:w-96">
      <div className="p-4 pb-0">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="ps-9"
            aria-label="Search conversations"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter conversations"
          className="mt-3 flex items-center gap-5 border-b border-border/60"
        >
          {tabs.map((item) => {
            const selected = tab === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
                {item === "Unread" && unreadTotal > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                    {unreadTotal}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length > 0 ? (
          <ul>
            {visible.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <Link
                    href={`/dashboard/messages/${item.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-3 border-b border-border/40 px-4 py-3.5 transition-colors",
                      active ? "bg-muted/60" : "hover:bg-muted/40",
                    )}
                  >
                    <Avatar size="lg" className="mt-0.5">
                      {item.avatarUrl ? (
                        <AvatarImage src={item.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback>{initials(item.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p
                            className={cn(
                              "truncate text-sm",
                              item.unread > 0 ? "font-semibold" : "font-medium",
                            )}
                          >
                            {item.name}
                          </p>
                          {item.platformOwner ? (
                            <ShieldCheck
                              className="size-3.5 shrink-0 text-amber-600"
                              aria-label="Platform Owner"
                            />
                          ) : null}
                        </div>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {item.dateLabel}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {item.preview}
                        </p>
                        {item.unread > 0 ? (
                          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                            {item.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {tab === "Archived"
              ? "No archived conversations."
              : tab === "Unread"
                ? "No unread conversations."
                : emptyHint}
          </p>
        )}
      </div>
    </aside>
  );
}
