import { Redirect, useRouter } from "expo-router";

import { PayrollScreen } from "../../src/attendance/PayrollScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function PayrollRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <PayrollScreen tenantId={state.tenantId} context={state.context} onBack={() => router.back()} />
  );
}
