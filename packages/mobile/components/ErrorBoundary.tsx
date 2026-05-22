// Top-level error boundary.
//
// Caught errors:
//   - Reported to Sentry via captureException so we know in prod
//   - Surface a recoverable "Reia" screen instead of a blank app
//
// We don't wrap individual screens — those crash to this boundary
// and lose route state, which is acceptable for the rare crash. If
// a specific screen has known-flaky bits (camera, audio recorder)
// wrap that subtree in its own boundary instead.

import { Component, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertTriangle, RefreshCw } from "lucide-react-native";
import { captureException } from "../lib/sentry";
import { colors } from "../constants/theme";

interface Props {
  children: ReactNode;
  /** Optional callback fired when the user taps "Reia". Default
   *  behaviour just clears the error state and rerenders. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureException(error, { componentStack: info.componentStack });
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen onRetry={this.reset} error={this.state.error} />;
  }
}

function ErrorScreen({ onRetry, error }: { onRetry: () => void; error: Error }) {
  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/15">
        <AlertTriangle size={36} color={colors.danger} />
      </View>
      <Text className="mt-6 text-center font-heading text-[24px] font-bold text-foreground">
        Ceva nu a mers
      </Text>
      <Text className="mt-2 max-w-[280px] text-center text-[14px] leading-5 text-muted-foreground">
        Am notificat echipa noastră. Apasă "Reia" să încerci din nou.
      </Text>
      {__DEV__ && (
        <Text className="mt-4 max-w-[300px] text-center text-[11px] text-rose-300">
          {error.message}
        </Text>
      )}
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Reia aplicația"
        className="mt-8 flex-row items-center gap-2 rounded-2xl bg-gold px-6 py-3 active:opacity-80"
      >
        <RefreshCw size={18} color={colors.background} />
        <Text className="text-[14px] font-semibold text-background">Reia</Text>
      </Pressable>
    </View>
  );
}
