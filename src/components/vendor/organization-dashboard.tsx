"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/shared/locale-link";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { legalEvidenceMatchesManifest } from "@/lib/legal/pack-manifest";

type Org = {
  id: number;
  displayName: string;
  type: string;
  status: string;
  hasValidContract?: boolean;
  legalName?: string | null;
  billingEmail?: string | null;
};

type Member = { id: number; userId: string; role: string; isActive: boolean; email: string | null; name: string | null };
type Contract = {
  id: number;
  acceptanceSessionId: string;
  subjectType: string;
  documentSlug: string;
  documentVersion: string;
  packVersion: string;
  acceptedAt: string;
  pdfUrl: string;
  copyUrl: string;
};
type VenueRow = { id: number; nameRo: string; isActive: boolean; slug: string };

export function OrganizationDashboard({ organizationId }: { organizationId?: number }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<number | null>(organizationId ?? null);
  const [detail, setDetail] = useState<{ organization: Org; venues: VenueRow[]; contracts: Contract[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const contractSessions = new Map<string, Contract[]>();
  for (const contract of detail?.contracts ?? []) {
    const existing = contractSessions.get(contract.acceptanceSessionId);
    if (existing) existing.push(contract);
    else contractSessions.set(contract.acceptanceSessionId, [contract]);
  }

  const loadList = useCallback(async () => {
    const res = await fetch("/api/organizations");
    const data = await res.json();
    setOrgs(data.organizations ?? []);
    if (data.organizations?.[0]) {
      setSelected((current) => current ?? data.organizations[0].id);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const [orgRes, memRes] = await Promise.all([
      fetch(`/api/organizations/${id}`),
      fetch(`/api/organizations/${id}/members`),
    ]);
    const orgData = await orgRes.json();
    const memData = await memRes.json();
    if (orgRes.ok) setDetail(orgData);
    setMembers(memData.members ?? []);
  }, []);

  useEffect(() => {
    void loadList().finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  async function createOrg() {
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName || "Organizație nouă", type: "company" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Nu am putut crea organizația");
      return;
    }
    setDisplayName("");
    await loadList();
    setSelected(data.organization.id);
  }

  async function addMember() {
    if (!selected || !inviteUserId) return;
    const res = await fetch(`/api/organizations/${selected}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: inviteUserId, role: "staff" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Membru respins");
      return;
    }
    setInviteUserId("");
    void loadDetail(selected);
  }

  async function deactivate(member: Member) {
    if (!selected) return;
    const res = await fetch(`/api/organizations/${selected}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id, isActive: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.code === "LAST_ORG_OWNER_TRANSFER_REQUIRED" ? "Transferă proprietatea înainte" : data.error);
      return;
    }
    void loadDetail(selected);
  }

  async function transfer() {
    if (!selected || !transferTo) return;
    const res = await fetch(`/api/organizations/${selected}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: transferTo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Transfer eșuat");
      return;
    }
    toast.success("Proprietatea a fost transferată");
    void loadDetail(selected);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Organizație</h1>
        <div className="flex gap-2">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nume organizație" className="w-52" />
          <Button type="button" onClick={() => void createOrg()}>
            <Plus className="mr-1 h-4 w-4" /> Creează
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {orgs.map((org) => (
          <Button key={org.id} type="button" variant={selected === org.id ? "default" : "outline"} size="sm" onClick={() => setSelected(org.id)}>
            {org.displayName}
          </Button>
        ))}
      </div>

      {detail && (
        <>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <p><strong>{detail.organization.displayName}</strong> · {detail.organization.type} · {detail.organization.status}</p>
              <p>Contract valabil: {detail.organization.hasValidContract ? "da" : "nu"}</p>
              <p>Un local nou pe o organizație cu contract nu cere re-semnare.</p>
              <Link href={`/dashboard/venue-onboarding?organizationId=${detail.organization.id}&intent=create`} className="inline-flex h-7 items-center rounded-lg bg-gold px-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark">
                Adaugă local
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-heading text-lg font-semibold">Contract PDF</h2>
              {contractSessions.size === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun contract atașat organizației.</p>
              ) : (
                [...contractSessions.values()].map((session) => {
                  const anchor = session[0]!;
                  const complete = legalEvidenceMatchesManifest(
                    anchor.packVersion,
                    anchor.subjectType,
                    session.map((row) => ({
                      documentSlug: row.documentSlug,
                      documentVersion: row.documentVersion,
                    })),
                  );
                  return (
                    <div key={anchor.acceptanceSessionId} className="space-y-2 rounded-lg border p-3 text-sm">
                      <p>v{anchor.packVersion} · {new Date(anchor.acceptedAt).toLocaleString("ro-RO")}</p>
                      {complete ? (
                        <>
                          <a className="font-medium text-gold" href={anchor.pdfUrl} target="_blank" rel="noreferrer">Descarcă PDF complet</a>
                          <ul className="space-y-1">
                            {session.map((row) => <li key={row.id}>
                              {row.documentSlug}{" · "}
                              <a className="text-gold" href={row.copyUrl} target="_blank" rel="noreferrer">copie</a>
                            </li>)}
                          </ul>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Încercare incompletă păstrată ca dovadă tehnică; PDF-ul contractual nu este disponibil.</p>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-heading text-lg font-semibold">Localuri</h2>
              {detail.venues.map((venue) => (
                <Link key={venue.id} href={`/dashboard/locatii/${venue.id}`} className="block text-sm hover:text-gold">
                  {venue.nameRo} {venue.isActive ? "" : "(draft)"}
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="font-heading text-lg font-semibold">Membri</h2>
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between text-sm">
                  <span>{member.name || member.email} · {member.role} {member.isActive ? "" : "(inactiv)"}</span>
                  {member.isActive && (
                    <Button type="button" size="sm" variant="outline" onClick={() => void deactivate(member)}>Dezactivează</Button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="user UUID" />
                <Button type="button" variant="outline" onClick={() => void addMember()}>Adaugă</Button>
              </div>
              <div className="flex gap-2">
                <Input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="UUID noul owner" />
                <Button type="button" variant="outline" onClick={() => void transfer()}>Transferă proprietatea</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
