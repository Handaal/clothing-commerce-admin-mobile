import type { ReactNode } from "react";
import { View } from "react-native";

import type { ClassifiedCommerceError } from "../commerce/errors";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("set.eyebrow")} title={title} onBack={onBack} />
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
  const { t } = useI18n();
  return (
    <SettingsFrame title={title} onBack={onBack}>
      <Title>{canRead ? t("set.unavailable") : t("errorHead.forbidden")}</Title>
      <Body testID={canRead ? "settings-unavailable" : "settings-access-denied"}>
        {canRead ? t("set.unavailableBody") : t("set.accessDeniedBody")}
      </Body>
    </SettingsFrame>
  );
}

export function ReadOnlyNotice() {
  const { t } = useI18n();
  return <Body testID="settings-read-only">{t("set.readOnly")}</Body>;
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
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={t("set.loading")} />;
  if (state.status === "error") return <SettingsLoadError error={state.error} reload={reload} />;
  if (empty(state.data)) {
    return (
      <View style={{ gap: 10 }}>
        <Body testID="settings-empty">{t("set.empty")}</Body>
        <PrimaryButton label={t("set.refresh")} onPress={reload} />
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
  const { t } = useI18n();
  const denied = error.kind === "forbidden" || error.kind === "auth";
  return (
    <View testID="settings-error" style={{ gap: 10 }}>
      <Title>{denied ? t("errorHead.forbidden") : t("set.unavailable")}</Title>
      <Body>
        {denied
          ? t("set.loadDenied")
          : error.kind === "network"
            ? t("set.loadNetwork")
            : t("set.loadGeneric")}
      </Body>
      {!denied ? <PrimaryButton label={t("common.tryAgain")} onPress={reload} /> : null}
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
