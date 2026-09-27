import type { ReactNode } from "react";
import { View } from "react-native";

import type { ClassifiedCommerceError } from "../commerce/errors";
import {
  Body,
  Divider,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  Title,
} from "../ui/components";
import type { AsyncState } from "../ui/useAsync";

export function SettingsFrame({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <ScrollScreen>
      <PageHeader eyebrow="Settings" title={title} onBack={onBack} />
      {children}
    </ScrollScreen>
  );
}

export function SettingsUnavailable({
  title,
  canRead,
  onBack,
}: {
  title: string;
  canRead: boolean;
  onBack: () => void;
}) {
  return (
    <SettingsFrame title={title} onBack={onBack}>
      <Title>{canRead ? "Settings unavailable" : "Access denied"}</Title>
      <Body testID={canRead ? "settings-unavailable" : "settings-access-denied"}>
        {canRead
          ? "Settings could not be opened. Check your connection and try again."
          : "Your current business access does not include Settings."}
      </Body>
    </SettingsFrame>
  );
}

export function ReadOnlyNotice() {
  return (
    <Body testID="settings-read-only">
      Read-only access · create, edit, lifecycle, revoke, and assignment actions are hidden.
    </Body>
  );
}

export function SettingsAsync<T>({
  state,
  reload,
  empty,
  children,
}: {
  state: AsyncState<T>;
  reload: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <LoadingBlock label="Loading settings…" />;
  if (state.status === "error") return <SettingsLoadError error={state.error} reload={reload} />;
  if (empty(state.data)) {
    return (
      <View style={{ gap: 10 }}>
        <Body testID="settings-empty">No settings records yet.</Body>
        <PrimaryButton label="Refresh" onPress={reload} />
      </View>
    );
  }
  return <>{children(state.data)}</>;
}

function SettingsLoadError({
  error,
  reload,
}: {
  error: ClassifiedCommerceError;
  reload: () => void;
}) {
  const denied = error.kind === "forbidden" || error.kind === "auth";
  return (
    <View testID="settings-error" style={{ gap: 10 }}>
      <Title>{denied ? "Access denied" : "Settings unavailable"}</Title>
      <Body>
        {denied
          ? "You do not have access to these settings."
          : error.kind === "network"
            ? "Check your connection and try again. Settings require connectivity."
            : "The settings could not be loaded. Try again."}
      </Body>
      {!denied ? <PrimaryButton label="Try again" onPress={reload} /> : null}
    </View>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Divider />
      <Title>{title}</Title>
      {children}
    </View>
  );
}
