import { createCommerceClient } from "@shifted/clothing-commerce-sdk";

const client = createCommerceClient({
  baseUrl: process.env.EXPO_PUBLIC_COMMERCE_API_URL ?? "http://localhost:3000",
  client: { type: "admin-mobile", version: "0.1.0" },
});

console.log(JSON.stringify(await client.getHealth()));
