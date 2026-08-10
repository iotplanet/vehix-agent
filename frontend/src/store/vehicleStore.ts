/**
 * Vehicle state — fleet list, selected vehicle twin, telemetry.
 */
import { create } from "zustand";
import { apiFetch } from "../lib/api";

export interface VehicleSummary {
  id: number;
  vin: string;
  plate_no: string;
  oem: string;
  model: string;
  powertrain_type: string;
  protocol_type: string;
  vehicle_category: string;
  fuel_type: string;
  driver_name: string;
  online_status: string;
  twin?: VehicleTwinData;
}

export interface VehicleTwinData {
  vin: string;
  speed: number;
  mileage: number;
  soc: number;
  soh: number;
  battery_voltage: number;
  battery_current: number;
  max_cell_temp: number;
  min_cell_temp: number;
  insulation_resistance: number;
  motor_speed: number;
  motor_torque: number;
  motor_temp: number;
  gps_lng: number;
  gps_lat: number;
  alarm_level: number;
  active_dtcs: string[];
  // JT/T 808 fields
  fuel_level: number;
  fuel_consumption: number;
  engine_rpm: number;
  coolant_temp: number;
  oil_pressure: number;
  cargo_status: string;
  video_channels: number;
  driver_name: string;
  acc_status: string;
  last_report_at: string;
}

export interface TelemetryPoint {
  vin: string;
  metric: string;
  value: number;
  timestamp: string;
}

interface VehicleState {
  vehicles: VehicleSummary[];
  selectedVin: string | null;
  twin: VehicleTwinData | null;
  telemetry: { metric: string; points: TelemetryPoint[] };
  loading: boolean;
  error: string | null;

  fetchVehicles: () => Promise<void>;
  selectVehicle: (vin: string) => void;
  fetchTwin: (vin: string) => Promise<void>;
  fetchTelemetry: (vin: string, metric: string, hours?: number) => Promise<void>;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  vehicles: [],
  selectedVin: null,
  twin: null,
  telemetry: { metric: "soc", points: [] },
  loading: false,
  error: null,

  fetchVehicles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch("/api/vehicles");
      const data = await res.json();
      set({ vehicles: data.vehicles || [], loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectVehicle: (vin: string) => {
    set({ selectedVin: vin });
    get().fetchTwin(vin);
  },

  fetchTwin: async (vin: string) => {
    try {
      const res = await apiFetch(`/api/vehicles/${vin}`);
      const data = await res.json();
      set({ twin: data.twin || null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchTelemetry: async (vin: string, metric: string, hours = 24) => {
    try {
      const res = await apiFetch(
        `/api/vehicles/${vin}/telemetry?metric=${metric}&hours=${hours}`
      );
      const data = await res.json();
      set({ telemetry: { metric, points: data.points || [] } });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
