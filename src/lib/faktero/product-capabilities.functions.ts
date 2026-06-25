import { createServerFn } from "@tanstack/react-start";
import { getProductCapabilities } from "./product-capabilities";

export const getProductCapabilitiesFn = createServerFn({ method: "GET" }).handler(async () => {
  return getProductCapabilities();
});
