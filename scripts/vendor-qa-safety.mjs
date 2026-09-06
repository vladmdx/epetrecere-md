/** Pure guards for the four isolated vendor-lifecycle QA personas. */
const personas = new Set(['artist', 'venue', 'client', 'admin']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertQaFixture(state, persona) {
  const user = state?.users?.[persona];
  if (!personas.has(persona) || !uuid.test(state?.marker ?? '') || !user ||
      !uuid.test(user.id ?? '') || !/^user_[A-Za-z0-9]+$/.test(user.clerkId ?? '') ||
      user.email !== `qa-${persona}-${state.marker}@invalid.epetrecere.md`) {
    throw new Error('Refusing operation: invalid isolated QA identity');
  }
  return user;
}

export function assertQaAppUser(rows, user) {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== user.id ||
      rows[0].clerk_id !== user.clerkId || rows[0].email !== user.email) {
    throw new Error('Refusing operation: app identity does not exactly match QA state');
  }
  return rows[0];
}

export function assertQaClerkUser(identity, user) {
  const primary = identity?.emailAddresses?.find(email => email.id === identity.primaryEmailAddressId);
  if (identity?.id !== user.clerkId || primary?.emailAddress !== user.email) {
    throw new Error('Refusing operation: Clerk identity does not exactly match QA state');
  }
}

export function assertQaSessions(sessions, user) {
  if (!Array.isArray(sessions) || sessions.some(session => session.userId !== user.clerkId ||
      session.status !== 'active' || !/^sess_[A-Za-z0-9]+$/.test(session.id ?? ''))) {
    throw new Error('Refusing signout: a session is not active or does not belong to the QA persona');
  }
}

export function safeQaNotificationPrefs(existing) {
  const keys = new Set([
    ...Object.keys(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}),
    'booking_requests', 'booking_updates', 'messages', 'reviews', 'reminders',
    'registration_approved', 'registration_rejected', 'artist_registered', 'venue_registered',
    'booking_request_new', 'booking_request_status_changed', 'booking_status_changed',
    'booking_conflict', 'review_new', 'review_request', 'message_new', 'reminder',
    'admin_photo_pending', 'admin_review_pending', 'admin_lead_new', 'legal_signed',
  ]);
  return Object.fromEntries([...keys].map(key => [key, { email: false, push: false }]));
}
