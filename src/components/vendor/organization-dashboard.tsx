"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "@/components/shared/locale-link";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { legalEvidenceMatchesManifest } from "@/lib/legal/pack-manifest";
import {
  clearPendingOrganizationCreateRequest,
  discardPendingOrganizationCreateRequest,
  hasPendingOrganizationCreateRequestSlot,
  newPendingOrganizationCreateRequest,
  organizationCreateRequestPayload,
  persistPendingOrganizationCreateRequest,
  readPendingOrganizationCreateRequest,
  type PendingOrganizationCreateRequest,
} from "@/lib/partner/onboarding-create-request";

type Org = {
  id: number;
  displayName: string;
  type: string;
  status: string;
  hasValidContract?: boolean;
  legalName?: string | null;
  billingEmail?: string | null;
  capabilities?: {
    manageVenues: boolean;
    manageBilling: boolean;
    manageLegal: boolean;
    manageMembers: boolean;
  };
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
  const { isLoaded: userLoaded, user } = useUser();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<number | null>(organizationId ?? null);
  const [detail, setDetail] = useState<{ organization: Org; venues: VenueRow[]; contracts: Contract[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [hasPendingOrganizationCreate, setHasPendingOrganizationCreate] = useState(false);
  const [organizationCreateRecoveryOnly, setOrganizationCreateRecoveryOnly] = useState(false);
  const [resolvedActorId, setResolvedActorId] = useState<string | null>(null);
  const organizationCreateRequest = useRef<PendingOrganizationCreateRequest | null>(null);
  const actorRef = useRef<string | null>(null);
  const selectedRef = useRef<number | null>(organizationId ?? null);
  const detailRequestRef = useRef<string | null>(null);
  const detailRequestGenerationRef = useRef(0);

  const contractSessions = new Map<string, Contract[]>();
  for (const contract of detail?.contracts ?? []) {
    const existing = contractSessions.get(contract.acceptanceSessionId);
    if (existing) existing.push(contract);
    else contractSessions.set(contract.acceptanceSessionId, [contract]);
  }

  const selectOrganization = useCallback((nextOrganizationId: number | null) => {
    selectedRef.current = nextOrganizationId;
    detailRequestGenerationRef.current += 1;
    detailRequestRef.current = null;
    setSelected(nextOrganizationId);
    setDetail(null);
    setMembers([]);
  }, []);

  const loadList = useCallback(async (actorId: string) => {
    const res = await fetch("/api/organizations");
    if (!res.ok) throw new Error("Organization list refresh failed");
    const data = await res.json();
    if (actorRef.current !== actorId) return;
    const organizations = Array.isArray(data.organizations)
      ? data.organizations as Org[]
      : [];
    setOrgs(organizations);
    const current = selectedRef.current;
    const next = current != null && organizations.some((organization) => organization.id === current)
      ? current
      : organizations[0]?.id ?? null;
    if (next !== current) selectOrganization(next);
  }, [selectOrganization]);

  const loadDetail = useCallback(async (id: number, actorId: string) => {
    if (selectedRef.current !== id) return;
    const requestGeneration = ++detailRequestGenerationRef.current;
    const requestKey = `${actorId}:${id}`;
    detailRequestRef.current = requestKey;
    const [orgRes, memRes] = await Promise.all([
      fetch(`/api/organizations/${id}`),
      fetch(`/api/organizations/${id}/members`),
    ]);
    if (!orgRes.ok || !memRes.ok) throw new Error("Organization detail refresh failed");
    const orgData = await orgRes.json();
    const memData = await memRes.json();
    if (
      actorRef.current !== actorId
      || selectedRef.current !== id
      || detailRequestGenerationRef.current !== requestGeneration
      || detailRequestRef.current !== requestKey
    ) return;
    if (orgData?.organization?.id !== id) {
      throw new Error("Organization detail response does not match its request");
    }
    setDetail(orgData);
    setMembers(memData.members ?? []);
  }, []);

  useEffect(() => {
    const actorId = userLoaded ? user?.id ?? null : null;
    actorRef.current = actorId;
    detailRequestRef.current = null;
    setResolvedActorId(actorId);
    setLoading(true);
    setOrgs([]);
    selectOrganization(organizationId ?? null);
    setInviteUserId("");
    setTransferTo("");
    setCreatingOrganization(false);
    if (!actorId) return;
    void loadList(actorId)
      .catch(() => {
        if (actorRef.current === actorId) {
          toast.error("Lista organizațiilor nu a putut fi încărcată.");
        }
      })
      .finally(() => {
        if (actorRef.current === actorId) setLoading(false);
      });
  }, [loadList, organizationId, selectOrganization, user?.id, userLoaded]);

  useEffect(() => {
    // sessionStorage survives refresh/back within this browser tab. Restore
    // the frozen payload as well as its key: changing only the key would make
    // a lost-response recovery create a second organization.
    // Reset first because Clerk can switch accounts without remounting this
    // component. Request state from actor A must never be replayed as actor B.
    organizationCreateRequest.current = null;
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
    setDisplayName("");
    if (!userLoaded || !user?.id) return;
    const pending = readPendingOrganizationCreateRequest(window.sessionStorage, user.id);
    if (!pending) {
      setOrganizationCreateRecoveryOnly(
        hasPendingOrganizationCreateRequestSlot(window.sessionStorage, user.id),
      );
      return;
    }
    organizationCreateRequest.current = pending;
    setDisplayName(pending.displayName);
    setHasPendingOrganizationCreate(true);
  }, [user?.id, userLoaded]);

  useEffect(() => {
    const actorId = user?.id;
    if (!actorId || resolvedActorId !== actorId || !selected) return;
    void loadDetail(selected, actorId).catch(() => {
      if (actorRef.current === actorId && selectedRef.current === selected) {
        toast.error("Detaliile organizației nu au putut fi încărcate.");
      }
    });
  }, [selected, loadDetail, resolvedActorId, user?.id]);

  const actorReady = userLoaded && Boolean(user?.id) && resolvedActorId === user?.id;

  async function createOrg() {
    if (creatingOrganization) return;
    const actorId = user?.id;
    if (!actorReady || !actorId) {
      toast.error("Sesiunea utilizatorului nu este încă disponibilă.");
      return;
    }
    const currentRequest = organizationCreateRequest.current;
    const storedRequest = readPendingOrganizationCreateRequest(
      window.sessionStorage,
      actorId,
    );
    if (
      !currentRequest
      && !storedRequest
      && hasPendingOrganizationCreateRequestSlot(window.sessionStorage, actorId)
    ) {
      setOrganizationCreateRecoveryOnly(true);
      toast.error("Slotul de recuperare este ocupat. Renunță explicit înainte de o cerere nouă.");
      return;
    }
    const request = (currentRequest?.actorId === actorId ? currentRequest : null)
      ?? storedRequest
      ?? newPendingOrganizationCreateRequest(displayName, crypto.randomUUID(), actorId);
    if (!request) {
      toast.error("Numele organizației trebuie să conțină între 2 și 200 de caractere.");
      return;
    }
    // Do not issue a create request unless the exact key and normalized
    // payload are durable first. This makes refresh/back/network retries safe.
    if (!persistPendingOrganizationCreateRequest(window.sessionStorage, request)) {
      toast.error("Browserul nu poate salva cererea. Activează stocarea și reîncearcă.");
      return;
    }
    organizationCreateRequest.current = request;
    setHasPendingOrganizationCreate(true);
    setCreatingOrganization(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organizationCreateRequestPayload(request)),
      });
      const data = await res.json().catch(() => ({}));
      if (actorRef.current !== actorId) return;
      if (!res.ok) {
        // Never retire an operation key from an error response. The same key
        // may already have committed in a request whose response was lost.
        toast.error(data.error || "Nu am putut crea organizația");
        return;
      }
      // Only a confirmed response retires the key. A timeout/network retry
      // therefore replays the exact same create operation instead of adding a
      // duplicate organization.
      const createdOrganizationId = data?.organization?.id;
      if (!Number.isInteger(createdOrganizationId) || createdOrganizationId <= 0) {
        throw new Error("Organization create response is missing its id");
      }
      if (!clearPendingOrganizationCreateRequest(
        window.sessionStorage,
        actorId,
        request.requestId,
      )) {
        setOrganizationCreateRecoveryOnly(true);
        toast.error("Organizația există, dar cererea salvată nu a putut fi curățată. Verifică din nou înainte de a crea alta.");
        return;
      }
      organizationCreateRequest.current = null;
      setHasPendingOrganizationCreate(false);
      setOrganizationCreateRecoveryOnly(false);
      setDisplayName("");
      selectOrganization(createdOrganizationId);
      if (data.organization) {
        setOrgs((current) => {
          const withoutCreated = current.filter((item) => item.id !== createdOrganizationId);
          return [...withoutCreated, data.organization as Org].sort((a, b) => a.id - b.id);
        });
      }
      void loadList(actorId).catch(() => {
        if (actorRef.current === actorId) {
          toast.error("Organizația a fost creată, dar lista nu s-a putut actualiza. Reîncarcă pagina.");
        }
      });
    } catch {
      if (actorRef.current === actorId) {
        toast.error("Conexiunea s-a întrerupt. Reîncearcă: organizația nu va fi duplicată.");
      }
    } finally {
      if (actorRef.current === actorId) setCreatingOrganization(false);
    }
  }

  function discardPendingCreate() {
    const actorId = user?.id;
    if (!actorReady || !actorId) return;
    const pending = organizationCreateRequest.current
      ?? readPendingOrganizationCreateRequest(window.sessionStorage, actorId);
    if (
      (!pending || pending.actorId !== actorId)
      && !organizationCreateRecoveryOnly
    ) return;
    if (!window.confirm(
      "Renunță la această cerere numai dacă ești sigur că organizația nu a fost creată. Continuarea poate crea o organizație nouă.",
    )) return;
    if (!discardPendingOrganizationCreateRequest(
      window.sessionStorage,
      actorId,
    )) {
      toast.error("Cererea salvată nu a putut fi eliminată din browser.");
      return;
    }
    organizationCreateRequest.current = null;
    setHasPendingOrganizationCreate(false);
    setOrganizationCreateRecoveryOnly(false);
  }

  async function addMember() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !selected || !inviteUserId) return;
    const targetOrganizationId = selected;
    const res = await fetch(`/api/organizations/${targetOrganizationId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: inviteUserId, role: "staff" }),
    });
    if (actorRef.current !== actorId || selectedRef.current !== targetOrganizationId) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Membru respins");
      return;
    }
    setInviteUserId("");
    void loadDetail(targetOrganizationId, actorId);
  }

  async function deactivate(member: Member) {
    const actorId = user?.id;
    if (!actorReady || !actorId || !selected) return;
    const targetOrganizationId = selected;
    const res = await fetch(`/api/organizations/${targetOrganizationId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id, isActive: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (actorRef.current !== actorId || selectedRef.current !== targetOrganizationId) return;
    if (!res.ok) {
      toast.error(data.code === "LAST_ORG_OWNER_TRANSFER_REQUIRED" ? "Transferă proprietatea înainte" : data.error);
      return;
    }
    void loadDetail(targetOrganizationId, actorId);
  }

  async function transfer() {
    const actorId = user?.id;
    if (!actorReady || !actorId || !selected || !transferTo) return;
    const targetOrganizationId = selected;
    const res = await fetch(`/api/organizations/${targetOrganizationId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: transferTo }),
    });
    const data = await res.json().catch(() => ({}));
    if (actorRef.current !== actorId || selectedRef.current !== targetOrganizationId) return;
    if (!res.ok) {
      toast.error(data.error || "Transfer eșuat");
      return;
    }
    toast.success("Proprietatea a fost transferată");
    void loadDetail(targetOrganizationId, actorId);
  }

  if (!actorReady || loading) {
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
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nume organizație" className="w-52" disabled={creatingOrganization || hasPendingOrganizationCreate || organizationCreateRecoveryOnly} />
          <Button type="button" onClick={() => void createOrg()} disabled={creatingOrganization || organizationCreateRecoveryOnly}>
            {creatingOrganization ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            {hasPendingOrganizationCreate ? "Reîncearcă" : "Creează"}
          </Button>
          {(hasPendingOrganizationCreate || organizationCreateRecoveryOnly) && (
            <Button type="button" variant="outline" onClick={discardPendingCreate} disabled={creatingOrganization}>
              {organizationCreateRecoveryOnly ? "Elimină slotul corupt" : "Renunță și corectează"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {orgs.map((org) => (
          <Button key={org.id} type="button" variant={selected === org.id ? "default" : "outline"} size="sm" onClick={() => selectOrganization(org.id)}>
            {org.displayName}
          </Button>
        ))}
      </div>

      {detail?.organization.id === selected && (
        <>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <p><strong>{detail.organization.displayName}</strong> · {detail.organization.type} · {detail.organization.status}</p>
              <p>Contract valabil: {detail.organization.hasValidContract ? "da" : "nu"}</p>
              <p>Un local nou pe o organizație cu contract nu cere re-semnare.</p>
              {detail.organization.capabilities?.manageVenues === true && (
                <Link href={`/dashboard/venue-onboarding?organizationId=${detail.organization.id}&intent=create`} className="inline-flex h-7 items-center rounded-lg bg-gold px-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark">
                  Adaugă local
                </Link>
              )}
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
                  {member.isActive && detail.organization.capabilities?.manageMembers === true && (
                    <Button type="button" size="sm" variant="outline" onClick={() => void deactivate(member)}>Dezactivează</Button>
                  )}
                </div>
              ))}
              {detail.organization.capabilities?.manageMembers === true && (
                <>
                  <div className="flex gap-2">
                    <Input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="user UUID" />
                    <Button type="button" variant="outline" onClick={() => void addMember()}>Adaugă</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="UUID noul owner" />
                    <Button type="button" variant="outline" onClick={() => void transfer()}>Transferă proprietatea</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
