import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-expo";
import { ArrowLeft, Check } from "lucide-react-native";
import { API_PATHS } from "@epetrecere/shared/api";
import { checkName, checkDescription, textIssueMessage } from "@epetrecere/shared/validators";
import { useApi } from "../../lib/api";
import { colors } from "../../constants/theme";
import { Button, Input, ErrorState } from "../../components/ui";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "../../components/legal/SignaturePad";

/**
 * Becoming an artist, from the phone.
 *
 * This did not exist. The app could sign a user up and let them pick the
 * artist role, and then the dashboard sent them to "complete your profile" —
 * a screen that only ever updated an existing profile, which they did not
 * have. Nothing in the app could create one, and nothing could sign the
 * contract that has to exist first, so every partner had to finish on the
 * website.
 *
 * The order matters and is the server's, not ours: the contract is recorded
 * BEFORE the artist row exists, deliberately, so nobody goes live unsigned.
 * Registration then backfills the profile id onto the signature.
 */

interface Category {
  id: number;
  nameRo: string;
  slug: string;
}

interface Tier {
  price: string;
  hours: string;
  pricingMode: "per_hour" | "per_event";
  eventType: string | null;
}

const EVENT_TYPES: { key: string; label: string }[] = [
  { key: "wedding", label: "Nuntă" },
  { key: "proposal", label: "Cerere în căsătorie" },
  { key: "cununie", label: "Cununie" },
  { key: "baptism", label: "Botez" },
  { key: "cumatrie", label: "Cumătrie" },
  { key: "birthday", label: "Aniversare" },
  { key: "kids_birthday", label: "Aniversare copii" },
  { key: "corporate", label: "Corporate" },
  { key: "concert", label: "Concert / Petrecere" },
  { key: "other", label: "Alt tip" },
];

const PARTNER_TYPES = [
  { key: "individual", label: "Persoană fizică" },
  { key: "sole_trader", label: "Întreprinzător individual" },
  { key: "company", label: "Persoană juridică" },
] as const;

type PartnerType = (typeof PARTNER_TYPES)[number]["key"];

const STEPS = ["Profil", "Tarife", "Contract"] as const;

export default function InregistrareArtistScreen() {
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1: profile ──────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState(
    user?.phoneNumbers?.[0]?.phoneNumber ?? "",
  );

  const nameCheck = checkName(name);
  const descCheck = checkDescription(description);
  const phoneOk = phone.replace(/\D/g, "").length >= 8;
  const step1Ok =
    nameCheck.ok && descCheck.ok && categoryId !== null && phoneOk;

  // ── Step 2: tariffs ──────────────────────────────────────────────────
  const [tiers, setTiers] = useState<Tier[]>([
    { price: "", hours: "", pricingMode: "per_hour", eventType: null },
  ]);

  const usableTiers = useMemo(
    () =>
      tiers.filter(
        (t) =>
          Number(t.price) > 0 &&
          (t.pricingMode === "per_event" || Number(t.hours) > 0),
      ),
    [tiers],
  );
  const step2Ok = usableTiers.length > 0;

  // ── Step 3: contract ─────────────────────────────────────────────────
  const [partnerType, setPartnerType] = useState<PartnerType>("individual");
  const [legalName, setLegalName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [readAll, setReadAll] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signing, setSigning] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  const step3Ok =
    readAll &&
    hasSignature &&
    signatureName.trim().length >= 3 &&
    legalName.trim().length >= 3 &&
    (partnerType === "individual" || idNumber.trim().length >= 4);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ categories: Category[] } | Category[]>(
        API_PATHS.categories,
      );
      const body = res.data;
      if (Array.isArray(body)) return body;
      return body?.categories ?? [];
    },
  });

  const docsQuery = useQuery({
    queryKey: ["legal-documents", "artist"],
    enabled: step === 2,
    queryFn: async () => {
      const res = await api.get<{
        items: {
          slug: string;
          title: string;
          blocks: { type: string; text: string }[];
        }[];
      }>(API_PATHS.legalDocuments, {
        query: { subject_type: "artist", locale: "ro" },
      });
      return res.data?.items ?? [];
    },
  });

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const signatureImage = await padRef.current?.toPngDataUrl();
      if (!signatureImage) {
        Alert.alert(
          "Semnătura lipsește",
          "Semnează în casetă înainte de a trimite.",
        );
        return;
      }

      // 1. Record the contract. On the server this happens before the artist
      //    row exists; the profile id is backfilled by registration below.
      const accept = await api.post(API_PATHS.legalAccept, {
        subjectType: "artist",
        signatureName: signatureName.trim(),
        signatureImage,
        locale: "ro",
        identity: {
          partnerType,
          legalName: legalName.trim(),
          idNumber: idNumber.trim() || null,
          legalAddress: legalAddress.trim() || null,
          representativeName: representativeName.trim() || null,
        },
      });
      if (!accept.ok) {
        Alert.alert(
          "Contractul nu a putut fi semnat",
          accept.error?.message ?? "Încearcă din nou.",
        );
        return;
      }

      // 2. Create the profile.
      const res = await api.post(API_PATHS.registerArtist, {
        name: name.trim(),
        phone: phone.trim(),
        categoryId,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        packages: usableTiers.map((t) => ({
          price: Number(t.price),
          hours: t.pricingMode === "per_hour" ? Number(t.hours) : 0,
          minutes: 0,
          pricingMode: t.pricingMode,
          eventType: t.eventType,
        })),
      });

      if (!res.ok) {
        Alert.alert(
          "Înregistrarea nu a reușit",
          res.error?.message ??
            "Verifică datele și încearcă din nou. Contractul semnat rămâne salvat.",
        );
        return;
      }

      await qc.invalidateQueries();
      Alert.alert(
        "Trimis spre aprobare",
        "Profilul tău a fost trimis. Te anunțăm imediat ce e aprobat.",
        [{ text: "Bine", onPress: () => router.replace("/(partner)/(tabs)") }],
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => (step === 0 ? router.back() : setStep(step - 1))}
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text
            style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}
          >
            Devino partener
          </Text>
        </View>
        {/* Step rail — three named steps, because the last one is a contract
            and nobody should reach it without knowing it is coming. */}
        <View
          style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 12 }}
        >
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1, gap: 5 }}>
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: i <= step ? colors.gold : colors.border,
                }}
              />
              <Text
                style={{
                  fontSize: 11.5,
                  color: i <= step ? colors.gold : colors.mutedForeground,
                }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </SafeAreaView>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        // Held still while a signature is being drawn. Without this the form
        // scrolls out from under the finger a centimetre into the stroke and
        // the signature arrives in fragments — seen on a simulator, and worse
        // with a real finger, which moves more slowly than an injected drag.
        scrollEnabled={!signing}
      >
        {step === 0 && (
          <>
            <Field
              label="Numele tău artistic"
              value={name}
              onChangeText={setName}
              error={
                name.length > 0 && !nameCheck.ok
                  ? textIssueMessage("name", nameCheck.issue!)
                  : null
              }
            />

            <View style={{ gap: 8 }}>
              <Label>Categoria</Label>
              {categoriesQuery.isLoading ? (
                <ActivityIndicator color={colors.gold} />
              ) : categoriesQuery.isError ? (
                <ErrorState
                  full={false}
                  error={categoriesQuery.error}
                  onRetry={() => categoriesQuery.refetch()}
                  retrying={categoriesQuery.isFetching}
                />
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <Chip
                      key={c.id}
                      label={c.nameRo}
                      selected={categoryId === c.id}
                      onPress={() => setCategoryId(c.id)}
                    />
                  ))}
                </View>
              )}
            </View>

            <Field
              label="Descriere"
              value={description}
              onChangeText={setDescription}
              multiline
              hint="Câteva propoziții despre ce oferi — asta citesc clienții."
              error={
                description.length > 0 && !descCheck.ok
                  ? textIssueMessage("description", descCheck.issue!)
                  : null
              }
            />
            <Field label="Orașul" value={location} onChangeText={setLocation} />
            <Field
              label="Telefon"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={
                phone.length > 0 && !phoneOk ? "Numărul pare incomplet." : null
              }
            />

            <Button
              onPress={() => setStep(1)}
              disabled={!step1Ok}
              fullWidth
              size="lg"
            >
              Continuă
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={{ color: colors.mutedForeground, fontSize: 13.5, lineHeight: 20 }}>
              Adaugă cel puțin un tarif. Poți tarifa pe oră sau o sumă fixă pe
              eveniment, iar un tarif poate fi legat de un anumit tip de
              eveniment.
            </Text>

            {tiers.map((t, i) => (
              <TierCard
                key={i}
                tier={t}
                index={i}
                canRemove={tiers.length > 1}
                onChange={(next) =>
                  setTiers((prev) =>
                    prev.map((p, j) => (j === i ? next : p)),
                  )
                }
                onRemove={() =>
                  setTiers((prev) => prev.filter((_, j) => j !== i))
                }
              />
            ))}

            <Pressable
              onPress={() =>
                setTiers((prev) => [
                  ...prev,
                  {
                    price: "",
                    hours: "",
                    pricingMode: "per_hour",
                    eventType: null,
                  },
                ])
              }
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.gold, fontSize: 14, fontWeight: "600" }}>
                + Încă un tarif
              </Text>
            </Pressable>

            <Button
              onPress={() => setStep(2)}
              disabled={!step2Ok}
              fullWidth
              size="lg"
            >
              Continuă
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <View style={{ gap: 8 }}>
              <Label>Semnezi ca</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {PARTNER_TYPES.map((t) => (
                  <Chip
                    key={t.key}
                    label={t.label}
                    selected={partnerType === t.key}
                    onPress={() => setPartnerType(t.key)}
                  />
                ))}
              </View>
            </View>

            <Field
              label={
                partnerType === "company"
                  ? "Denumirea companiei"
                  : "Numele complet"
              }
              value={legalName}
              onChangeText={setLegalName}
            />
            {partnerType !== "individual" && (
              <Field
                label={partnerType === "company" ? "IDNO" : "IDNP / IDNO"}
                value={idNumber}
                onChangeText={setIdNumber}
                keyboardType="number-pad"
              />
            )}
            <Field
              label="Adresa / sediul"
              value={legalAddress}
              onChangeText={setLegalAddress}
            />
            {partnerType === "company" && (
              <Field
                label="Reprezentant legal"
                value={representativeName}
                onChangeText={setRepresentativeName}
              />
            )}

            {/* The documents themselves. Shown, not linked: this is the text
                whose hash is stored as evidence of what was signed, so it has
                to be readable in the same place the signature is given. */}
            <View style={{ gap: 8 }}>
              <Label>Documentele pe care le semnezi</Label>
              {docsQuery.isLoading ? (
                <ActivityIndicator color={colors.gold} />
              ) : docsQuery.isError ? (
                <ErrorState
                  full={false}
                  error={docsQuery.error}
                  onRetry={() => docsQuery.refetch()}
                  retrying={docsQuery.isFetching}
                />
              ) : (
                <View
                  style={{
                    maxHeight: 320,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                  }}
                >
                  <ScrollView
                    nestedScrollEnabled
                    contentContainerStyle={{ padding: 14, gap: 10 }}
                  >
                    {(docsQuery.data ?? []).map((doc) => (
                      <View key={doc.slug} style={{ gap: 6 }}>
                        <Text
                          style={{
                            color: colors.gold,
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          {doc.title}
                        </Text>
                        {doc.blocks.map((b, i) => (
                          <Text
                            key={i}
                            style={{
                              color:
                                b.type === "h2"
                                  ? colors.foreground
                                  : colors.mutedForeground,
                              fontSize: b.type === "h2" ? 13.5 : 12.5,
                              fontWeight: b.type === "h2" ? "600" : "400",
                              lineHeight: 19,
                            }}
                          >
                            {b.text}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => setReadAll((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: readAll }}
              style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: readAll ? colors.gold : colors.border,
                  backgroundColor: readAll ? colors.gold : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                {readAll && <Check size={14} color={colors.background} />}
              </View>
              <Text
                style={{
                  flex: 1,
                  color: colors.mutedForeground,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                Am citit și accept documentele de mai sus, inclusiv comisionul
                de 5% prevăzut în Acordul de Parteneriat.
              </Text>
            </Pressable>

            <Field
              label="Numele semnatarului"
              value={signatureName}
              onChangeText={setSignatureName}
              hint="Așa cum apare în actul de identitate."
            />

            <View style={{ gap: 8 }}>
              <Label>Semnătura</Label>
              <SignaturePad
                ref={padRef}
                onChange={setHasSignature}
                onDrawingChange={setSigning}
              />
            </View>

            <Button
              onPress={handleSubmit}
              disabled={!step3Ok}
              loading={submitting}
              fullWidth
              size="lg"
            >
              Semnează și trimite spre aprobare
            </Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
      {children}
    </Text>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.gold : colors.border,
        backgroundColor: selected ? colors.gold + "1A" : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: selected ? colors.gold : colors.mutedForeground,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An Input plus the one thing the kit does not carry: the reason a field is
 * refused, under the field. Without it the only feedback was a disabled
 * button, which says something is wrong but never what.
 */
function Field({
  label,
  error,
  hint,
  ...rest
}: {
  label: string;
  error?: string | null;
  hint?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <View style={{ gap: 5 }}>
      <Input label={label} {...rest} />
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12.5 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12.5 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function TierCard({
  tier,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  tier: Tier;
  index: number;
  canRemove: boolean;
  onChange: (next: Tier) => void;
  onRemove: () => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 14,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
          Tarif {index + 1}
        </Text>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={8}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>Șterge</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(
          [
            ["per_hour", "Pe oră"],
            ["per_event", "Pe eveniment"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => onChange({ ...tier, pricingMode: value })}
            accessibilityRole="radio"
            accessibilityState={{ selected: tier.pricingMode === value }}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              alignItems: "center",
              borderColor:
                tier.pricingMode === value ? colors.gold : colors.border,
              backgroundColor:
                tier.pricingMode === value ? colors.gold + "1A" : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: "600",
                color:
                  tier.pricingMode === value
                    ? colors.gold
                    : colors.mutedForeground,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Preț (€)"
            value={tier.price}
            onChangeText={(v) =>
              onChange({ ...tier, price: v.replace(/\D/g, "").slice(0, 6) })
            }
            keyboardType="number-pad"
          />
        </View>
        {tier.pricingMode === "per_hour" && (
          <View style={{ flex: 1 }}>
            <Input
              label="Ore"
              value={tier.hours}
              onChangeText={(v) =>
                onChange({ ...tier, hours: v.replace(/\D/g, "").slice(0, 2) })
              }
              keyboardType="number-pad"
            />
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Label>Pentru ce eveniment</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {[{ key: null, label: "Orice eveniment" }, ...EVENT_TYPES].map((t) => (
            <Chip
              key={t.key ?? "any"}
              label={t.label}
              selected={tier.eventType === t.key}
              onPress={() => onChange({ ...tier, eventType: t.key })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
