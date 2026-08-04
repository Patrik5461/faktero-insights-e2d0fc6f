import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyStockRole } from "@/lib/faktero/stock.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export type StockRole = "owner" | "admin" | "accountant" | "employee" | "viewer" | null;

export function useStockPermissions() {
  const fetchRole = useServerFn(getMyStockRole);
  const [role, setRole] = useState<StockRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetchRole({ data: { company_id: cid } })
      .then((r) => setRole((r?.role ?? null) as StockRole))
      .finally(() => setLoading(false));
  }, [fetchRole]);

  const isAdmin = role === "owner" || role === "admin";
  const canMutate = isAdmin || role === "employee";
  const canManage = isAdmin;
  const canExport = role !== null;
  return { role, loading, isAdmin, canMutate, canManage, canExport };
}
