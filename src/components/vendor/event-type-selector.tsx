"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_EVENT_TYPES,
  eventTypeLabel,
  type EventTypeKey,
} from "@/lib/events/normalize";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";

interface EventTypeSelectorProps {
  value: EventTypeKey[];
  onChange: (value: EventTypeKey[]) => void;
  locale: Locale;
  title: string;
  hint: string;
  error?: string;
}

export function EventTypeSelector({
  value,
  onChange,
  locale,
  title,
  hint,
  error,
}: EventTypeSelectorProps) {
  const selected = new Set(value);

  function toggle(eventType: EventTypeKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(eventType);
    else next.delete(eventType);
    onChange(ALL_EVENT_TYPES.filter((key) => next.has(key)));
  }

  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="text-sm font-medium">{title}</legend>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ALL_EVENT_TYPES.map((eventType) => {
          const checked = selected.has(eventType);
          const id = `partner-event-${eventType}`;
          return (
            <label
              key={eventType}
              htmlFor={id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                checked
                  ? "border-gold bg-gold/10 text-foreground"
                  : "border-border/40 hover:border-gold/40",
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) => toggle(eventType, Boolean(next))}
                aria-invalid={Boolean(error)}
                className="data-checked:border-gold data-checked:bg-gold data-checked:text-[#0D0D0D]"
              />
              <span>{eventTypeLabel(eventType, locale)}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}
