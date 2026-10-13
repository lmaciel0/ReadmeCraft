import { useEffect, useState } from "react";
import { fetchHealth } from "../services/aiService";
import type { HealthStatus } from "../types/readme";

export type HealthState = { status: "loading" } | { status: "online"; health: HealthStatus } | { status: "offline" };

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then((health) => alive && setState({ status: "online", health }))
      .catch(() => alive && setState({ status: "offline" }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
