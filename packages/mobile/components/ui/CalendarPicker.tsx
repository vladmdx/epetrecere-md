// CalendarPicker — a website-style month-grid date picker in a sheet modal.
//
// Replaces the native @react-native-community/datetimepicker for DATE entry so
// tapping a date field ALWAYS opens the same calendar the web uses (Monday-
// first, Romanian labels, gold selected day, past dates disabled). Controlled:
// pass `value` + `onChange`. Everything is inline-styled (css-interop 0.1.x
// drops className).

import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { colors, radii } from "../../constants/theme";

const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];
const WEEKDAYS_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** 42 cells (6 weeks), Monday-first, with leading/trailing adjacent-month days. */
function buildMatrix(viewed: Date): { date: Date; inMonth: boolean }[] {
  const first = firstOfMonth(viewed);
  const startOffset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i,
    );
    cells.push({ date, inMonth: date.getMonth() === viewed.getMonth() });
  }
  return cells;
}

interface Props {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  /** Dates before this are disabled. */
  minDate?: Date;
  /** Dates after this are disabled. */
  maxDate?: Date;
  title?: string;
}

export function CalendarPicker({
  visible,
  value,
  onChange,
  onClose,
  minDate,
  maxDate,
  title,
}: Props) {
  const [viewed, setViewed] = useState<Date>(() => firstOfMonth(value));

  // Re-seed the visible month from the selected value each time it opens.
  useEffect(() => {
    if (visible) setViewed(firstOfMonth(value));
  }, [visible, value]);

  const min = minDate ? startOfDay(minDate) : null;
  const max = maxDate ? startOfDay(maxDate) : null;
  const today = new Date();
  const cells = buildMatrix(viewed);

  const prevDisabled = min ? firstOfMonth(viewed) <= firstOfMonth(min) : false;
  const nextDisabled = max ? firstOfMonth(viewed) >= firstOfMonth(max) : false;

  function pick(d: Date) {
    // Anchor at noon LOCAL so `toLocalYMD` / any serialization can't slip a day
    // across the UTC boundary in negative-offset zones.
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0));
    onClose();
  }

  function shiftMonth(delta: number) {
    setViewed((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function quickPick(d: Date) {
    pick(d);
  }

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const nextSaturday = (() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d;
  })();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
            {title ?? "Alege data"}
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={24} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={{ padding: 20, gap: 14 }}>
          {/* Month navigation */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={() => !prevDisabled && shiftMonth(-1)}
              disabled={prevDisabled}
              hitSlop={8}
              style={{ opacity: prevDisabled ? 0.3 : 1, padding: 4 }}
            >
              <ChevronLeft size={26} color={colors.gold} />
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              {MONTHS_RO[viewed.getMonth()]} {viewed.getFullYear()}
            </Text>
            <Pressable
              onPress={() => !nextDisabled && shiftMonth(1)}
              disabled={nextDisabled}
              hitSlop={8}
              style={{ opacity: nextDisabled ? 0.3 : 1, padding: 4 }}
            >
              <ChevronRight size={26} color={colors.gold} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS_RO.map((w) => (
              <Text
                key={w}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.mutedForeground,
                }}
              >
                {w}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map(({ date, inMonth }, i) => {
              const disabled =
                (min != null && date < min) || (max != null && date > max);
              const selected = sameDay(date, value);
              const isToday = sameDay(date, today);
              return (
                <Pressable
                  key={i}
                  onPress={() => !disabled && pick(date)}
                  disabled={disabled}
                  style={{
                    width: `${100 / 7}%`,
                    aspectRatio: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.gold : "transparent",
                      borderWidth: !selected && isToday && inMonth ? 1 : 0,
                      borderColor: colors.gold,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: selected ? "700" : "500",
                        color: selected
                          ? colors.background
                          : disabled
                            ? "rgba(142,139,130,0.35)"
                            : inMonth
                              ? colors.foreground
                              : colors.mutedForeground,
                      }}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Quick picks */}
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 4 }}>
            {[
              { label: "Mâine", date: tomorrow },
              { label: "Sâmbătă viitoare", date: nextSaturday },
            ].map((q) => (
              <Pressable
                key={q.label}
                onPress={() => quickPick(q.date)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.gold }}>
                  {q.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
