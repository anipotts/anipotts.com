import { DateInput } from "@astryxdesign/core/DateInput";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import {
  createISOTimeString,
  parseDateInput,
  plainDateToISO,
} from "@astryxdesign/core/utils";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

/** One stored instant as one row: the date, then the time with UTC named
 * once after it. The fields align by their labels, and on a narrow sheet
 * the time and its zone wrap together under the date. */
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
    <HStack gap={2} vAlign="start" className="editor-date-row">
      <DateInput
        label={label}
        value={day ? plainDateToISO(day) : undefined}
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
      <HStack gap={2} vAlign="end" className="editor-date-time">
        <TimeInput
          label="Time"
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
        <Text type="supporting" color="secondary" className="editor-date-zone">
          UTC
        </Text>
      </HStack>
    </HStack>
  );
}
