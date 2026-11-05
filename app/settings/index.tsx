import { Redirect, useRouter } from "expo-router";
import { useSession } from "../../src/session/SessionProvider";
import { settingsCapabilities } from "../../src/settings/capabilities";
import { SettingsHomeScreen, type SettingsSectionKey } from "../../src/settings/SettingsScreens";

export default function SettingsRoute() {
  const router = useRouter();
  const { state } = useSession();
  if (state.phase !== "ready") return <Redirect href="/" />;
  const access = settingsCapabilities(state.context);
  const open = (section: SettingsSectionKey) =>
    router.push(section === "devices" ? "/settings/devices" : `/settings/${section}`);
  return (
    <SettingsHomeScreen
      {...access}
      context={state.context}
      onOpen={open}
      onBack={() => router.back()}
    />
  );
}
