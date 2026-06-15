"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  id: string;
  label: React.ReactNode;
  unit?: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  tooltip?: React.ReactNode;
}

export function NumField({
  id,
  label,
  unit,
  value,
  onChange,
  step = 0.01,
  min = 0,
  max,
  tooltip,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const allowNegative = min < 0;
  const fallbackValue =
    min <= 0 && (max === undefined || max >= 0) ? 0 : min;

  const updateDraftValue = (rawValue: string) => {
    const nextDraft = allowNegative ? rawValue : rawValue.replace(/-/g, "");
    const nextValue = Number(nextDraft);
    setDraft(nextDraft);
    if (nextDraft.trim() === "") onChange(fallbackValue);
    else if (Number.isFinite(nextValue)) onChange(nextValue);
  };

  return (
    <div className="flex h-full flex-col space-y-1.5">
      <div className="flex flex-1 items-end gap-1.5">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info size={13} />
                </button>
              }
            />
            <TooltipContent className="max-w-xs text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="relative mt-auto">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={focused ? draft : Number.isFinite(value) ? String(value) : ""}
          onFocus={() => {
            setDraft(Number.isFinite(value) ? String(value) : "");
            setFocused(true);
          }}
          onKeyDown={(event) => {
            if (!allowNegative && event.key === "-") event.preventDefault();
          }}
          onInput={(event) => updateDraftValue(event.currentTarget.value)}
          onChange={(event) => updateDraftValue(event.currentTarget.value)}
          onBlur={() => {
            setFocused(false);
            const nextValue = Number(draft);
            if (draft.trim() === "" || !Number.isFinite(nextValue)) {
              onChange(fallbackValue);
            }
          }}
          className={unit ? "pr-16" : undefined}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
