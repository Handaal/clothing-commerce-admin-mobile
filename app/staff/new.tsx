import { Redirect, useRouter } from "expo-router";

import { useSession } from "../../src/session/SessionProvider";
import { resolveStaffAdapter } from "../../src/staff/adapter";
import { AddStaffFlow } from "../../src/staff/AddStaffFlow";

export default function AddStaffRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") {
    return <Redirect href="/" />;
  }

  const adapter = resolveStaffAdapter();

  return (
    <AddStaffFlow
      adapter={adapter}
      onCreated={(staff) => router.replace(`/staff/${staff.membershipId}`)}
      onBack={() => router.back()}
    />
  );
}
