// Partner profile editor.
//
// Sections (selectable from sidebar/scroll-tabs):
//   General  name, description, location, base city
//   Contact  phone, email, instagram, facebook
//   Pricing  priceFrom + currency + priceHidden toggle
//   Tarife   pricing packages CRUD
//   Notifications  push prefs
//
// All saves go through PUT /api/me/artist (we'll add the v1 alias
// + this endpoint when needed). For M4 we ship the form skeleton
// with sections; deep wiring of every field lives in M5.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Save } from "lucide-react-native";
import { Button, Input, Card } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface ArtistDetail {
  id: number;
  nameRo: string;
  descriptionRo: string | null;
  location: string | null;
  baseCity: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  priceFrom: number | null;
  priceCurrency: string | null;
  priceHidden: boolean;
}

type Section = "general" | "contact" | "pricing" | "tarife" | "notifications";

export default function ProfileEditScreen() {
  const params = useLocalSearchParams<{ section?: Section }>();
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>(
    params.section ?? "general",
  );

  const artistQuery = useQuery({
    queryKey: ["my-artist-detail"],
    queryFn: async () => {
      const res = await api.get<{ artist: ArtistDetail | null }>(
        API_PATHS.myArtist,
      );
      return res.data?.artist ?? null;
    },
  });

  if (artistQuery.isLoading || !artistQuery.data) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const artist = artistQuery.data;

  return (
    <View
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center gap-2 border-b border-border px-3 py-2"
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
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text
            className="font-heading text-[18px] font-bold text-foreground"
            style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
          >
            Editează profilul
          </Text>
        </View>

        {/* Section tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            gap: 6,
            paddingVertical: 10,
          }}
        >
          {(["general", "contact", "pricing", "tarife", "notifications"] as Section[]).map((s) => (
            <SectionChip
              key={s}
              label={sectionLabel(s)}
              active={activeSection === s}
              onPress={() => setActiveSection(s)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {activeSection === "general" && <GeneralSection artist={artist} api={api} qc={qc} />}
        {activeSection === "contact" && <ContactSection artist={artist} api={api} qc={qc} />}
        {activeSection === "pricing" && <PricingSection artist={artist} api={api} qc={qc} />}
        {activeSection === "tarife" && <TarifeSection artist={artist} />}
        {activeSection === "notifications" && <NotificationsSection />}
      </ScrollView>
    </View>
  );
}

function sectionLabel(s: Section): string {
  return {
    general: "General",
    contact: "Contact",
    pricing: "Prețuri",
    tarife: "Pachete",
    notifications: "Notificări",
  }[s];
}

function SectionChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className={`rounded-full border px-3 py-1.5 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card"
      }`}
      style={{
        borderRadius: 9999,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? "rgba(201,168,76,0.15)" : colors.card,
      }}
    >
      <Text
        className={`text-[13px] font-semibold ${active ? "text-gold" : "text-foreground/70"}`}
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? colors.gold : "rgba(247,245,238,0.7)",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── General ─────────────────────────────────────────────

function GeneralSection({
  artist,
  api,
  qc,
}: {
  artist: ArtistDetail;
  api: ReturnType<typeof useApi>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState(artist.nameRo);
  const [description, setDescription] = useState(artist.descriptionRo ?? "");
  const [location, setLocation] = useState(artist.location ?? "");
  const [baseCity, setBaseCity] = useState(artist.baseCity ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/artists/crud", {
        id: artist.id,
        nameRo: name,
        descriptionRo: description,
        location,
        baseCity,
      });
      if (!res.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-artist"] });
      void qc.invalidateQueries({ queryKey: ["my-artist-detail"] });
      void qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
    },
  });

  return (
    <View className="gap-3" style={{ gap: 12 }}>
      <Input label="Nume artistic" value={name} onChangeText={setName} />
      <Input
        label="Descriere"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={6}
      />
      <Input
        label="Locație (preferințe / detalii)"
        value={location}
        onChangeText={setLocation}
      />
      <Input
        label="Oraș de bază"
        value={baseCity}
        onChangeText={setBaseCity}
        hint="De aici se calculează raza ta de deplasare."
      />
      <Button
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
        fullWidth
        size="lg"
        leftIcon={<Save size={18} color={colors.background} />}
      >
        Salvează
      </Button>
    </View>
  );
}

// ─── Contact ─────────────────────────────────────────────

function ContactSection({
  artist,
  api,
  qc,
}: {
  artist: ArtistDetail;
  api: ReturnType<typeof useApi>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [phone, setPhone] = useState(artist.phone ?? "");
  const [email, setEmail] = useState(artist.email ?? "");
  const [instagram, setInstagram] = useState(artist.instagram ?? "");
  const [facebook, setFacebook] = useState(artist.facebook ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/artists/crud", {
        id: artist.id,
        phone,
        email,
        instagram,
        facebook,
      });
      if (!res.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-artist-detail"] });
    },
  });

  return (
    <View className="gap-3" style={{ gap: 12 }}>
      <Input label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Instagram (handle)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />
      <Input label="Facebook (handle)" value={facebook} onChangeText={setFacebook} autoCapitalize="none" />
      <Button
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
        fullWidth
        size="lg"
        leftIcon={<Save size={18} color={colors.background} />}
      >
        Salvează
      </Button>
    </View>
  );
}

// ─── Pricing ─────────────────────────────────────────────

function PricingSection({
  artist,
  api,
  qc,
}: {
  artist: ArtistDetail;
  api: ReturnType<typeof useApi>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [priceFrom, setPriceFrom] = useState(
    artist.priceFrom != null ? String(artist.priceFrom) : "",
  );
  const [priceHidden, setPriceHidden] = useState(artist.priceHidden);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/artists/crud", {
        id: artist.id,
        priceFrom: priceFrom ? Number(priceFrom) : null,
        priceHidden,
      });
      if (!res.ok) throw new Error("save_failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-artist-detail"] });
    },
  });

  return (
    <View className="gap-3" style={{ gap: 12 }}>
      <Input
        label="Preț de la (€)"
        value={priceFrom}
        onChangeText={(v) => setPriceFrom(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        hint="Afișat pe profilul public ca punct de plecare al negocierii."
      />
      <Card
        className="flex-row items-center justify-between"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View className="flex-1" style={{ flex: 1 }}>
          <Text
            className="text-[14px] font-semibold text-foreground"
            style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
          >
            Ascunde prețul
          </Text>
          <Text
            className="text-[12px] text-muted-foreground"
            style={{ fontSize: 12, color: colors.mutedForeground }}
          >
            Clienții văd "La cerere" în loc de suma — pentru negociere de la zero.
          </Text>
        </View>
        <Switch
          value={priceHidden}
          onValueChange={setPriceHidden}
          thumbColor={priceHidden ? colors.gold : colors.foreground}
          trackColor={{ false: colors.muted, true: colors.gold + "55" }}
        />
      </Card>
      <Button
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
        fullWidth
        size="lg"
        leftIcon={<Save size={18} color={colors.background} />}
      >
        Salvează
      </Button>
    </View>
  );
}

// ─── Tarife (packages list) ──────────────────────────────

function TarifeSection({ artist }: { artist: ArtistDetail }) {
  // Full CRUD ships next. For M4 we link to the dedicated tarife screen.
  const router = useRouter();
  return (
    <Card
      className="gap-3 items-center p-8"
      style={{ gap: 12, alignItems: "center", padding: 32 }}
    >
      <Text
        className="font-heading text-[18px] font-bold text-foreground"
        style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
      >
        Pachete & Tarife
      </Text>
      <Text
        className="text-center text-[13px] text-muted-foreground"
        style={{ textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
      >
        Gestionează listele de prețuri pe pachete (set de 2h, format complet,
        adăugări speciale).
      </Text>
      <Button
        variant="outline"
        size="md"
        onPress={() => router.push(`/(partner)/tarife/${artist.id}` as never)}
      >
        Deschide
      </Button>
    </Card>
  );
}

// ─── Notifications ───────────────────────────────────────

function NotificationsSection() {
  const [bookingPush, setBookingPush] = useState(true);
  const [chatPush, setChatPush] = useState(true);
  const [reviewPush, setReviewPush] = useState(true);

  return (
    <View className="gap-3" style={{ gap: 12 }}>
      <ToggleCard
        label="Cereri noi"
        description="Notificare imediat ce un client trimite o cerere."
        value={bookingPush}
        onChange={setBookingPush}
      />
      <ToggleCard
        label="Mesaje noi"
        description="Notificare la fiecare mesaj de la client."
        value={chatPush}
        onChange={setChatPush}
      />
      <ToggleCard
        label="Recenzii"
        description="Notificare când primești o recenzie nouă."
        value={reviewPush}
        onChange={setReviewPush}
      />
      <Text
        className="text-center text-[11px] text-muted-foreground"
        style={{ textAlign: "center", fontSize: 11, color: colors.mutedForeground }}
      >
        Preferințele se sincronizează cu serverul în M5.
      </Text>
    </View>
  );
}

function ToggleCard({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card
      className="flex-row items-center justify-between"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
    >
      <View className="flex-1" style={{ flex: 1 }}>
        <Text
          className="text-[14px] font-semibold text-foreground"
          style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
        >
          {label}
        </Text>
        <Text
          className="text-[12px] text-muted-foreground"
          style={{ fontSize: 12, color: colors.mutedForeground }}
        >
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={value ? colors.gold : colors.foreground}
        trackColor={{ false: colors.muted, true: colors.gold + "55" }}
      />
    </Card>
  );
}
