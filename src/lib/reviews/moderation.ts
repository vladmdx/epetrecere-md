/** Resolve only after the server confirms moderation. HTTP failures must not
 * be rendered as a successful approval/deletion in the admin dashboard. */
export async function moderateReview(
  id: number,
  action: "approve" | "reject",
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(`/api/reviews/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error("Review moderation failed");
}
