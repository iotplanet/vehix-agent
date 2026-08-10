/** Type declarations for AMap (高德地图) JSAPI 2.0 */

declare namespace AMap {
  class Map {
    constructor(container: string | HTMLElement, opts: MapOptions);
    destroy(): void;
    setCenter(center: [number, number]): void;
    setZoom(zoom: number): void;
    add(overlay: Marker | Marker[]): void;
    remove(overlay: Marker | Marker[]): void;
    clearMap(): void;
    on(event: string, handler: Function): void;
    getCenter(): LngLat;
    getZoom(): number;
    plugin(plugins: string[], callback: () => void): void;
  }

  interface MapOptions {
    zoom?: number;
    center?: [number, number];
    viewMode?: "2D" | "3D";
    mapStyle?: string;
    features?: string[];
    resizeEnable?: boolean;
  }

  class Marker {
    constructor(opts: MarkerOptions);
    setPosition(position: [number, number]): void;
    setLabel(label: { content: string; offset?: { x: number; y: number } }): void;
    setContent(content: string): void;
    on(event: string, handler: Function): void;
    getPosition(): LngLat;
    setMap(map: Map | null): void;
    setTitle(title: string): void;
    remove(): void;
  }

  interface MarkerOptions {
    position: [number, number];
    title?: string;
    icon?: string;
    content?: string;
    label?: { content: string; offset?: { x: number; y: number } };
    offset?: { x: number; y: number };
    zIndex?: number;
  }

  class InfoWindow {
    constructor(opts: InfoWindowOptions);
    open(map: Map, position: [number, number]): void;
    close(): void;
    setContent(content: string): void;
  }

  interface InfoWindowOptions {
    content?: string;
    offset?: { x: number; y: number };
    size?: { width: number; height: number };
  }

  class LngLat {
    getLng(): number;
    getLat(): number;
  }

  class Pixel {
    constructor(x: number, y: number);
    getX(): number;
    getY(): number;
  }

  class event {
    static addListener(instance: any, event: string, handler: Function): void;
    static removeListener(instance: any, event: string, handler: Function): void;
  }

  function plugin(plugins: string[]): Promise<void>;
}
