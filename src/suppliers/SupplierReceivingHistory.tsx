import { useCallback } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import {
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  SectionHeading,
  SurfaceRow,
  TextButton,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { SupplierAdapter } from "./adapter";
import { loadAllSupplierReceipts } from "./load";
import type { SupplierReceipt } from "./model";

export interface SupplierReceivingHistoryProps {
  adapter: SupplierAdapter;
  supplierId: string;
}

/**
 * Supplier-linked receiving-history section shell. It reads the canonical Supplier receipt history
 * through the adapter — it is NOT a second inventory ledger and never reconstructs receipts locally.
 * It loads independently of the supplier body: a scope denial or transient failure here is surfaced
 * distinctly and doesn't break the rest of the detail screen. Rows are read-only history, clearly
 * separated from the editable supplier record above them.
 */
export function SupplierReceivingHistory({ adapter, supplierId }: SupplierReceivingHistoryProps) {
  const { t } = useI18n();
  const load = useCallback(
    () => loadAllSupplierReceipts(adapter, supplierId),
    [adapter, supplierId],
  );
  const { state, reload } = useAsync<SupplierReceipt[]>(load);

  return (
    <FormSection
      title={t("supReceiving.section")}
      description={t("supReceiving.sectionDesc")}
      icon="package-variant-closed-check"
    >
      {renderBody()}
    </FormSection>
  );

  function renderBody() {
    if (state.status === "loading") {
      return <LoadingBlock label={t("supReceiving.loading")} />;
    }

    if (state.status === "error") {
      if (state.error.kind === "forbidden") {
        return <Notice tone="warning" message={t("supReceiving.forbidden")} />;
      }
      return (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      );
    }

    const receipts = state.data;
    if (receipts.length === 0) {
      return <Notice testID="supplier-receipts-empty" message={t("supReceiving.empty")} />;
    }

    return (
      <View style={{ gap: 12 }}>
        {receipts.map((receipt) => (
          <SurfaceRow key={receipt.id} testID={`supplier-receipt-${receipt.id}`}>
            <SectionHeading
              title={formatReceiptDate(receipt.receivedAt)}
              detail={t("supReceiving.stockReceipt")}
            />
            {receipt.locationName || receipt.locationId ? (
              <InfoRow
                label={t("supReceiving.destination")}
                value={receipt.locationName ?? (receipt.locationId as string)}
              />
            ) : null}
            {receipt.reference ? (
              <InfoRow label={t("suppliers.reference")} value={receipt.reference} />
            ) : null}
            {receipt.actor ? (
              <InfoRow label={t("supReceiving.receivedBy")} value={receipt.actor} />
            ) : null}
            <InfoRow label={t("supReceiving.lines")} value={String(receipt.lines.length)} />
            {receipt.lines.map((line, index) => (
              <InfoRow
                key={`${receipt.id}-${index}`}
                label={
                  line.productName ??
                  line.sku ??
                  line.variantId ??
                  t("supReceiving.lineN", { n: index + 1 })
                }
                value={`×${line.quantity}`}
              />
            ))}
          </SurfaceRow>
        ))}
      </View>
    );
  }
}

function formatReceiptDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
