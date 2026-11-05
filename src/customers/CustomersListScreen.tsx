import type { CustomerSummary } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  EmptyState,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SearchField,
  SectionHeading,
  Surface,
} from "../ui/components";
import { colors } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { loadAllCustomers } from "./load";

export interface CustomersListScreenProps {
  tenantId: string;
  onOpenCustomer: (customerId: string) => void;
  onBack: () => void;
}

/**
 * Read-only customer directory. Lists customers with their order count and lifetime spend, with a
 * server-backed search (phone/name/email). There is no customer mutation surface — the Commerce API
 * exposes no create/update for customers, and this screen invents none.
 */
export function CustomersListScreen({ tenantId, onOpenCustomer, onBack }: CustomersListScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(() => loadAllCustomers(client, query), [client, query]);
  const { state, reload } = useAsync<CustomerSummary[]>(load);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("customers.eyebrow")}
        title={t("customers.title")}
        description={t("customers.headerDesc")}
        icon="account-group-outline"
        onBack={onBack}
      />
      <Surface>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder={t("customers.searchPlaceholder")}
          testID="customer-search-term"
        />
        <PrimaryButton
          label={t("customers.searchCta")}
          icon="magnify"
          testID="customer-search-submit"
          onPress={() => setQuery(term)}
        />
      </Surface>

      {state.status === "loading" ? <LoadingBlock label={t("customers.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <View testID="customer-empty">
          <EmptyState
            icon="account-search-outline"
            title={query ? t("customers.emptyFilteredTitle") : t("customers.emptyTitle")}
            message={query ? t("customers.emptyFilteredBody") : t("customers.emptyBody")}
          />
        </View>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <MetricCard
              label={t("customers.loadedMetric")}
              value={String(state.data.length)}
              icon="account-group-outline"
            />
          </View>
          <SectionHeading
            title={t("customers.directory")}
            detail={t("common.shown", { count: state.data.length })}
          />
          <View style={{ gap: 12 }}>
            {state.data.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                onOpen={() => onOpenCustomer(customer.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollScreen>
  );
}

function CustomerRow({ customer, onOpen }: { customer: CustomerSummary; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <PressableRow testID={`customer-row-${customer.id}`} onPress={onOpen}>
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <Text style={{ flex: 1, color: colors.ink, fontSize: 18, fontWeight: "800" }}>
          {customer.name}
        </Text>
        <Badge label={t("customers.orderCount", { count: customer.orderCount })} tone="brand" />
      </View>
      <InfoRow label={t("customers.phone")} value={customer.phone} />
      {customer.email ? <InfoRow label={t("customers.email")} value={customer.email} /> : null}
      {customer.currency ? (
        <InfoRow
          label={t("customers.totalSpent")}
          value={formatMoneyMinor(customer.totalSpentMinor, customer.currency)}
        />
      ) : null}
      {customer.lastOrderAt ? (
        <Body>{t("customers.lastOrder", { when: customer.lastOrderAt })}</Body>
      ) : null}
    </PressableRow>
  );
}
