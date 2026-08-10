/**
 * Fleet-level state — statistics, map viewport.
 */
import { create } from "zustand";
import { apiFetch } from "../lib/api";

export interface FleetStats {
  total_vehicles: number;
  online_vehicles: number;
  offline_vehicles: number;
  avg_soc: number;
  avg_soh: number;
  max_alarm_level: number;
}

interface FleetState {
  stats: FleetStats | null;
  loading: boolean;
  error: string | null;

  fetchStats: () => Promise<void>;
}

export const useFleetStore = create<FleetState>((set) => ({
  stats: null,
  loading: false,
  error: null,

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch("/api/vehicles");
      const data = await res.json();
      const vehicles = data.vehicles || [];
      const online = vehicles.filter((v: { online_status: string }) => v.online_status === "online");
      const twins = vehicles
        .map((v: { twin?: { soc: number; soh: number; alarm_level: number } }) => v.twin)
        .filter(Boolean);

      set({
        stats: {
          total_vehicles: vehicles.length,
          online_vehicles: online.length,
          offline_vehicles: vehicles.length - online.length,
          avg_soc: twins.length
            ? Math.round(twins.reduce((a: number, b: { soc: number }) => a + b.soc, 0) / twins.length * 100) / 100
            : 0,
          avg_soh: twins.length
            ? Math.round(twins.reduce((a: number, b: { soh: number }) => a + b.soh, 0) / twins.length * 100) / 100
            : 0,
          max_alarm_level: twins.length
            ? Math.max(...twins.map((t: { alarm_level: number }) => t.alarm_level))
            : 0,
        },
        loading: false,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
