import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { colors } from "../../constants/theme";

/**
 * A long legal document, opened a section at a time.
 *
 * The registration screen used to render five documents' blocks concatenated
 * inside one 320-point scroll box, with a checkbox underneath and nothing
 * connecting the two. Twenty-four articles arriving at once is a wall, and
 * the tick was the only thing standing between a partner and a contract they
 * had not looked at.
 *
 * Sections come from the `h2` blocks. Opening one marks it read; the caller
 * is told when every section has been opened, which is what gates the
 * signature. Mirrors the web reader so the same document behaves the same
 * way in both places.
 */

export interface DocBlock {
  type: string;
  text: string;
}

interface Section {
  title: string | null;
  blocks: DocBlock[];
}

function toSections(blocks: DocBlock[]): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: null, blocks: [] };
  for (const b of blocks) {
    if (b.type === "h2") {
      if (cur.blocks.length || cur.title) out.push(cur);
      cur = { title: b.text, blocks: [] };
    } else {
      cur.blocks.push(b);
    }
  }
  if (cur.blocks.length || cur.title) out.push(cur);
  return out;
}

export function DocumentReader({
  title,
  version,
  blocks,
  onAllRead,
  signature,
}: {
  title: string;
  version?: string;
  blocks: DocBlock[];
  /** Fires once when every section has been opened. */
  onAllRead?: () => void;
  /** Rendered at the foot of the document, as on the web. */
  signature?: { name: string; image?: string | null; date?: Date } | null;
}) {
  const sections = useMemo(() => toSections(blocks), [blocks]);
  const [open, setOpen] = useState<number[]>([0]);
  const [seen, setSeen] = useState<number[]>([0]);
  const [reported, setReported] = useState(false);

  function toggle(i: number) {
    setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
    setSeen((s) => {
      if (s.includes(i)) return s;
      const next = [...s, i];
      if (next.length >= sections.length && !reported) {
        setReported(true);
        onAllRead?.();
      }
      return next;
    });
  }

  const signedOn = signature?.date ?? new Date();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 3,
        }}
      >
        <Text style={{ color: colors.gold, fontSize: 14, fontWeight: "700" }}>
          {title}
          {version ? ` · v${version}` : ""}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11.5 }}>
          {seen.length} din {sections.length} secțiuni deschise
        </Text>
      </View>

      <View style={{ height: 3, backgroundColor: colors.border }}>
        <View
          style={{
            height: 3,
            width: `${(seen.length / Math.max(sections.length, 1)) * 100}%`,
            backgroundColor: colors.gold,
          }}
        />
      </View>

      {sections.map((s, i) => {
        const isOpen = open.includes(i);
        return (
          <View
            key={i}
            style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}
          >
            <Pressable
              onPress={() => toggle(i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: colors.foreground,
                  fontSize: 13.5,
                  fontWeight: "600",
                }}
              >
                {s.title ?? "Preambul"}
              </Text>
              <Text
                style={{
                  color: seen.includes(i) ? colors.success : colors.gold,
                  fontSize: 11.5,
                }}
              >
                {seen.includes(i) ? "citit" : "deschide"}
              </Text>
            </Pressable>
            {isOpen && (
              <ScrollView
                nestedScrollEnabled
                style={{ maxHeight: 260 }}
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingBottom: 12,
                  gap: 7,
                }}
              >
                {s.blocks.map((b, j) => (
                  <Text
                    key={j}
                    style={{
                      color: colors.mutedForeground,
                      fontSize: 12.5,
                      lineHeight: 19,
                    }}
                  >
                    {b.text}
                  </Text>
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}

      {signature && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 4,
          }}
        >
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Semnat de
          </Text>
          <Text
            style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}
          >
            {signature.name}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {signedOn.toLocaleDateString("ro-RO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>
      )}
    </View>
  );
}
