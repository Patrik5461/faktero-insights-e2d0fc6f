/**
 * MCP server Faktera — napojenie AI asistentov na údaje firmy (viď mcp.server.ts).
 * Adresa pre klienta: https://www.faktero.sk/api/mcp, hlavička Authorization: Bearer <API kľúč>.
 */
import { createFileRoute } from "@tanstack/react-router";

const obsluz = async ({ request }: { request: Request }) => {
  const { obsluzMcp } = await import("@/lib/faktero/mcp.server");
  return obsluzMcp(request);
};

export const Route = createFileRoute("/api/mcp")({
  server: { handlers: { POST: obsluz, GET: obsluz, OPTIONS: obsluz, DELETE: obsluz } },
});
