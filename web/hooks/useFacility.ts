import { useCallback, useEffect, useState } from "react";
import { loadFacility, type FacilityRecord } from "../data/verd";

export function useFacility(id?: string) {
  const [data, setData] = useState<FacilityRecord>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setData(await loadFacility(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Facility state is unavailable."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}
