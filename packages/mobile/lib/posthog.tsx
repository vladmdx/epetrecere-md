// PostHog init + helpers.
//
// We use the same project as the web so events from both surfaces
// fall into one funnel. The screen tracker uses expo-router's
// useNavigationContainerRef + addListener to fire `$screen` on every
// route change without us having to instrument each screen by hand.
//
// Event naming follows the web: `verb_object` snake_case, e.g.
// "booking_request_created", "artist_profile_viewed".

import { useEffect } from "react";
import {
  PostHogProvider as RawPostHogProvider,
  usePostHog,
} from "posthog-react-native";
import type PostHog from "posthog-react-native";
import { usePathname } from "expo-router";
import { useUser } from "@clerk/clerk-expo";

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = "https://eu.i.posthog.com";

interface ProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app in PostHog only when EXPO_PUBLIC_POSTHOG_KEY is set.
 * Without a key we render children directly and the analytics hooks
 * below short-circuit to no-ops — keeps dev runs silent.
 */
export function PostHogProvider({ children }: ProviderProps) {
  if (!POSTHOG_KEY) return <>{children}</>;
  return (
    <RawPostHogProvider
      apiKey={POSTHOG_KEY}
      options={{
        host: POSTHOG_HOST,
        // Capture session replay only in production — too costly in
        // dev and we don't want test devices replaying.
        enableSessionReplay: !__DEV__,
        // Manually flush in flushAt/flushInterval defaults; lower
        // flushInterval on mobile because users close the app fast.
        flushInterval: 15,
        captureNativeAppLifecycleEvents: true,
      }}
      autocapture={{
        captureScreens: false, // we do this manually via the hook below
        captureLifecycleEvents: true,
        captureTouches: false,
      }}
    >
      <Identifier />
      <ScreenTracker />
      <InstanceCapture />
      {children}
    </RawPostHogProvider>
  );
}

/** Tag the user once Clerk has a session. */
function Identifier() {
  const { user, isSignedIn } = useUser();
  const posthog = usePostHog();
  useEffect(() => {
    if (!posthog) return;
    if (isSignedIn && user) {
      const props: Record<string, string> = {};
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) props.email = email;
      if (user.firstName) props.firstName = user.firstName;
      if (user.lastName) props.lastName = user.lastName;
      posthog.identify(user.id, props);
    } else {
      posthog.reset();
    }
  }, [isSignedIn, user, posthog]);
  return null;
}

// Module-level handle to the live PostHog instance, captured from React
// context by <InstanceCapture /> below. posthog-react-native exposes the
// instance ONLY through `usePostHog()` and never assigns any global, so
// non-component callers of track() read it from here.
let _posthog: PostHog | null = null;
type EventProperties = Parameters<PostHog["capture"]>[1];

/** Capture the context instance into the module-level handle for track(). */
function InstanceCapture() {
  const posthog = usePostHog();
  useEffect(() => {
    _posthog = posthog ?? null;
    return () => {
      _posthog = null;
    };
  }, [posthog]);
  return null;
}

/** Fire `$screen` whenever the pathname changes. */
function ScreenTracker() {
  const pathname = usePathname();
  const posthog = usePostHog();
  useEffect(() => {
    if (!posthog || !pathname) return;
    posthog.screen(pathname);
  }, [pathname, posthog]);
  return null;
}

/** Imperative `track` for non-component callers (mutations, push tap
 *  handlers, etc.). Safe to call without an active PostHog instance —
 *  returns a no-op when the key is missing. */
export function track(event: string, props?: EventProperties) {
  if (!POSTHOG_KEY) return;
  // posthog-react-native does NOT attach the instance to any global — it
  // lives only in React context. <InstanceCapture /> mirrors it into the
  // module-level `_posthog` handle, which we read here. Stays a no-op until
  // the provider has mounted (or when no key is configured).
  _posthog?.capture(event, props);
}

// Re-export the hook so screen-level code can call analytics
// imperatively in handlers when context is available.
export { usePostHog };
