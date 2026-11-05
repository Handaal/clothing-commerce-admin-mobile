/**
 * The single operating currency for this deployment. Egyptian Pound (EGP) is the only currency the
 * admin app presents or submits: every currency input is locked to this value and the UI never offers a
 * currency choice. EGP uses 2 fraction digits (piastres), matching the catalog's minor-unit assumption.
 *
 * Display surfaces still render whatever currency the Commerce API returns on a record — this constant
 * governs what the client *writes*, not what the server is authoritative about on read.
 */
export const OPERATING_CURRENCY = "EGP";
