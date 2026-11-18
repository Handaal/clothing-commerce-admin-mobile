import { useEffect, useRef } from "react";

import { describeCatalogWriteError } from "../catalog/write-errors";
import { useI18n } from "../i18n";
import { Notice, TextButton } from "../ui/components";
import type { Mutation, MutationState } from "../ui/useMutation";

/** Fire `onSuccess` once each time a mutation settles successfully. */
export function useOnSuccess<T>(state: MutationState<T>, onSuccess: (data: T) => void) {
  const latest = useRef(onSuccess);
  useEffect(() => {
    latest.current = onSuccess;
  });
  useEffect(() => {
    if (state.status === "success") latest.current(state.data);
  }, [state]);
}

/**
 * Shared error panel for catalog writes. `refresh` recovery re-reads the product (state drift); `retry`
 * reuses the same idempotency key (ambiguous outcome); `edit`/`none` just dismiss so the manager can
 * correct inputs and submit a genuinely new operation.
 */
export function CatalogWriteError<TArgs, TResult>({
  state,
  mutation,
  onRefresh,
  testID,
}: {
  state: Extract<MutationState<TResult>, { status: "error" }>;
  mutation: Mutation<TArgs, TResult>;
  onRefresh: () => void;
  testID?: string;
}) {
  const { t } = useI18n();
  const described = describeCatalogWriteError(state.error);
  return (
    <Notice
      tone="danger"
      title={described.heading}
      message={described.message}
      testID={testID ?? "write-error"}
      action={
        described.recovery === "retry" ? (
          <TextButton
            label={t("common.retry")}
            icon="refresh"
            testID="write-retry"
            onPress={() => mutation.retry()}
          />
        ) : described.recovery === "refresh" ? (
          <TextButton
            label={t("pm.refreshProduct")}
            icon="refresh"
            testID="write-refresh"
            onPress={() => {
              mutation.reset();
              onRefresh();
            }}
          />
        ) : (
          <TextButton label={t("common.dismiss")} icon="close" onPress={() => mutation.reset()} />
        )
      }
    />
  );
}
