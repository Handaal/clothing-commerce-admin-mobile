import { useCallback } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  SurfaceRow,
  TextButton,
  Title,
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
  const load = useCallback(
    () => loadAllSupplierReceipts(adapter, supplierId),
    [adapter, supplierId],
  );
  const { state, reload } = useAsync<SupplierReceipt[]>(load);

  return (
    <>
      <Divider />
      <Eyebrow>Receiving history</Eyebrow>
      <Body>
        Stock received from this supplier. This is a read-only view of the canonical inventory
        receipts — it is not editable here.
      </Body>
      {renderBody()}
    </>
  );

  function renderBody() {
    if (state.status === "loading") {
      return <LoadingBlock label="Loading receiving history…" />;
    }

    if (state.status === "error") {
      if (state.error.kind === "forbidden") {
        return <Body>You do not have access to this supplier’s receiving history.</Body>;
      }
      return (
        <View style={{ gap: 8 }}>
          <Body>{`${errorHeading(state.error.kind)}: ${state.error.message}`}</Body>
          {isRetryable(state.error.kind) ? <TextButton label="Try again" onPress={reload} /> : null}
        </View>
      );
    }

    const receipts = state.data;
    if (receipts.length === 0) {
      return (
        <Body testID="supplier-receipts-empty">
          No stock has been received from this supplier yet.
        </Body>
      );
    }

    return (
      <View style={{ gap: 12 }}>
        {receipts.map((receipt) => (
          <SurfaceRow key={receipt.id} testID={`supplier-receipt-${receipt.id}`}>
            <Title>{receipt.receivedAt}</Title>
            {receipt.locationName || receipt.locationId ? (
              <InfoRow
                label="Destination"
                value={receipt.locationName ?? (receipt.locationId as string)}
              />
            ) : null}
            {receipt.reference ? <InfoRow label="Reference" value={receipt.reference} /> : null}
            {receipt.actor ? <InfoRow label="Received by" value={receipt.actor} /> : null}
            <InfoRow label="Lines" value={String(receipt.lines.length)} />
            {receipt.lines.map((line, index) => (
              <InfoRow
                key={`${receipt.id}-${index}`}
                label={line.productName ?? line.sku ?? line.variantId ?? `Line ${index + 1}`}
                value={`×${line.quantity}`}
              />
            ))}
          </SurfaceRow>
        ))}
      </View>
    );
  }
}
