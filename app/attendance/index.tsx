import { Redirect, useRouter } from "expo-router";

import { AttendanceScreen } from "../../src/attendance/AttendanceScreen";
import { useSession } from "../../src/session/SessionProvider";

export default function AttendanceRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  return (
    <AttendanceScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => router.back()}
      onOpenPayroll={() => router.push("/attendance/payroll")}
    />
  );
}
