"use client";

// Shared hook to fetch the current user's role from /api/auth/check-role.
// Used by Header components to conditionally show/hide UI based on role.

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

export interface UserRoleInfo {
  role: string;
  hasVenue: boolean;
  isNewUser: boolean;
}

export function useUserRole(): {
  userRole: UserRoleInfo | null;
  isLoaded: boolean;
} {
  const { isSignedIn, isLoaded: clerkLoaded } = useUser();
  const [userRole, setUserRole] = useState<UserRoleInfo | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!isSignedIn) {
      setUserRole(null);
      setFetched(true);
      return;
    }
    fetch("/api/auth/check-role")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUserRole(data);
      })
      .catch(() => {})
      .finally(() => setFetched(true));
  }, [isSignedIn, clerkLoaded]);

  return { userRole, isLoaded: clerkLoaded && fetched };
}

/** True for guests + clients (everyone who isn't an artist/venue/admin). */
export function isClientOrGuest(userRole: UserRoleInfo | null): boolean {
  if (!userRole) return true; // guest
  if (userRole.role === "artist") return false;
  if (userRole.hasVenue) return false;
  if (userRole.role === "admin" || userRole.role === "super_admin") return false;
  return true;
}
