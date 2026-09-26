/** Describe this decision, not an assumed first hall or nonexistent pending halls. */
export function venueApprovalNotice(activated: boolean, approvedCount: number, pendingCount: number) {
  const approved = approvedCount === 1
    ? "O sală a fost aprobată și este vizibilă."
    : `${approvedCount} săli au fost aprobate și sunt vizibile.`;
  const pending = pendingCount === 1
    ? " O altă sală rămâne în verificare."
    : pendingCount > 1 ? ` Alte ${pendingCount} săli rămân în verificare.` : "";
  return {
    title: activated ? "Localul a fost aprobat! 🎉" : approvedCount === 1 ? "Sală nouă aprobată! 🎉" : "Săli noi aprobate! 🎉",
    message: `${activated ? "Localul este acum vizibil. " : ""}${approved}${pending}`,
  };
}
