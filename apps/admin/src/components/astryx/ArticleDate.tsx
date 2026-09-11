import { DateInput } from "@astryxdesign/core/DateInput";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import {
  createISOTimeString,
  parseDateInput,
  plainDateToISO,
} from "@astryxdesign/core/utils";
import { HStack } from "@astryxdesign/core/HStack";

/** Display a single stored instant with an explicit, stable timezone. */
export function ArticleDate({
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const parsed =
    typeof value === "string" || value instanceof Date ? new Date(value) : null;
  const date = parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  const iso = date?.toISOString();
  const day = iso ? parseDateInput(iso.slice(0, 10)) : null;
  return (
    <HStack gap={3} wrap="wrap" vAlign="start">
      <DateInput
        label={label}
        description="UTC"
        value={day ? plainDateToISO(day) : undefined}
        isRequired
        isDisabled={disabled}
        status={
          error || !date
            ? { type: "error", message: error ?? "Choose a valid date." }
            : undefined
        }
        onChange={(value) => {
          if (!value) {
            onChange("");
            return;
          }
          const next = new Date(date?.getTime() ?? 0);
          const [year, month, day] = value.split("-").map(Number);
          next.setUTCFullYear(year!, month! - 1, day!);
          if (!date || next.getTime() !== date.getTime())
            onChange(next.toISOString());
        }}
      />
      <TimeInput
        label="Time"
        description="UTC"
        value={
          iso
            ? (createISOTimeString(iso.slice(11, 19)) ?? undefined)
            : undefined
        }
        isDisabled={disabled || !date}
        onChange={(value) => {
          if (!date || !value) return;
          const [hours, minutes] = value.split(":").map(Number);
          const next = new Date(date);
          next.setUTCHours(hours!, minutes!);
          if (!date || next.getTime() !== date.getTime())
            onChange(next.toISOString());
        }}
      />
    </HStack>
  );
}
