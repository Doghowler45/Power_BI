"use strict";

import { select, Selection } from "d3-selection";
import { geoDistance, geoGraticule10, geoNaturalEarth1, geoPath, geoProjection, GeoProjection } from "d3-geo";
import { zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from "d3-zoom";
import { drag, DragBehavior } from "d3-drag";
import { ticks } from "d3-array";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json";
import worldTopologyLow from "world-atlas/countries-110m.json";
import { Country } from "./countries";

export interface Route {
    key: string;
    origin: Country;
    destination: Country;
    /** Null when no measure is supplied; such routes are drawn at the minimum width. */
    value: number | null;
    rowIndexes: number[];
}

export type ProjectionMode = "globe" | "flat";

export interface FlowMapOptions {
    width: number;
    height: number;
    /**
     * "globe": a globe when zoomed out that flattens into a Mercator-style map as you zoom in.
     * "flat": a flat world map that shows every route at once.
     */
    projection: ProjectionMode;
    routeColor: string;
    minWidth: number;
    maxWidth: number;
    /** Value drawn at the maximum width. 0 means "the largest route currently shown". */
    scaleMax: number;
    /** 0..1 */
    routeOpacity: number;
    /** 0..1, how far the arc bows away from the direct line. */
    curvature: number;
    fadeFromOrigin: boolean;
    landColor: string;
    activeLandColor: string;
    borderColor: string;
    /** Sea colour, drawn in globe mode only. */
    oceanColor: string;
    markerColor: string;
    zoomToRoutes: boolean;
    allowZoom: boolean;
    showZoomButtons: boolean;
    /** Dim the other routes while one is hovered. */
    hoverHighlight: boolean;
    /** Show a details card in the corner while a route or country is hovered. */
    hoverCard: boolean;
    showLabels: boolean;
    labelSize: number;
    labelColor: string;
    showLegend: boolean;
    valueLabel: string;
    formatValue: (value: number) => string;
    /** Returns a short formatter (for example "$300M") suited to the given legend values. */
    makeCompactFormatter: (values: number[]) => (value: number) => string;
}

/** Maps a route's value to a line width. Shared by the routes and the legend so they always agree. */
export interface WidthScale {
    minWidth: number;
    maxWidth: number;
    /** Value drawn at maxWidth. */
    domainMax: number;
    widthFor(value: number | null): number;
}

/**
 * Width is proportional to value (half the value, half the width), from zero up to
 * `domainMax` at the maximum width. The minimum width is only a floor that keeps small
 * routes visible; values above `domainMax` are capped at the maximum width.
 */
export function createWidthScale(minWidth: number, maxWidth: number, domainMax: number): WidthScale {
    const lo = Math.max(0.25, Math.min(minWidth, maxWidth));
    const hi = Math.max(lo, Math.max(minWidth, maxWidth));
    return {
        minWidth: lo,
        maxWidth: hi,
        domainMax,
        widthFor: (value) => {
            if (value === null || !(domainMax > 0)) return lo;
            return Math.min(hi, Math.max(lo, (hi * Math.abs(value)) / domainMax));
        },
    };
}

/** Up to three round values (for example 300M, 200M, 100M) spanning zero to `domainMax`, largest first. */
export function legendValues(domainMax: number): number[] {
    if (!(domainMax > 0)) return [];
    const marks = ticks(0, domainMax, 4).filter((t) => t > 0);
    if (marks.length === 0) return [domainMax];
    if (marks.length <= 3) return marks.reverse();
    return [marks[marks.length - 1], marks[Math.floor((marks.length - 1) / 2)], marks[0]];
}

export interface TooltipItem {
    displayName: string;
    value: string;
}

export interface FlowMapHandlers {
    onRouteClick(route: Route, event: MouseEvent): void;
    /** A country was selected (its routes are passed) or its selection was cleared (empty list). */
    onCountryClick(routes: Route[], event: MouseEvent): void;
    onBackgroundClick(): void;
    onContextMenu(route: Route | null, event: MouseEvent): void;
    showTooltip(items: TooltipItem[], event: MouseEvent, route: Route | null): void;
    hideTooltip(): void;
}

interface MapNode {
    country: Country;
    /** Position on the flat map before any zoom; unused in globe mode. */
    x: number;
    y: number;
    outbound: number;
    inbound: number;
    isOrigin: boolean;
    isDestination: boolean;
}

interface DrawnRoute {
    route: Route;
    width: number;
    from: MapNode;
    to: MapNode;
}

interface CardRow {
    left: string;
    right: string;
    strong?: boolean;
    /** Draw a thin rule above this row. */
    divider?: boolean;
}

interface CardContent {
    title: string;
    rows: CardRow[];
    note?: string;
}

interface Placed {
    x: number;
    y: number;
    visible: boolean;
}

interface GlobeView {
    /** Longitude and latitude at the centre of the view, in degrees. */
    lon: number;
    lat: number;
    /** Zoom: 1 shows the whole globe. */
    k: number;
}

type Group = Selection<SVGGElement, unknown, null, undefined>;
type Vec = [number, number, number];

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_AUTO_ZOOM = 8;
const MAX_USER_ZOOM = 14;
const MAX_GLOBE_ZOOM = 20;
const MAX_GLOBE_AUTO_ZOOM = 6;
/** Zoom range over which the globe flattens: a pure globe below the first, fully flat above the second. */
const FLATTEN_FROM = 1.25;
const FLATTEN_TO = 3;
const RAD = Math.PI / 180;
/** Only the near side of the globe is drawn; this is just inside the horizon. */
const HORIZON = Math.PI / 2 - 0.035;
const MERCATOR_LIMIT = 85 * RAD;

interface CountryFeature {
    type: "Feature";
    id?: string | number;
    geometry: GeoJSON.Geometry;
    properties: { name?: string };
}

const withoutAntarctica = (topology: WorldTopology): CountryFeature[] =>
    (feature(topology, topology.objects.countries) as unknown as { features: CountryFeature[] }).features
        // Antarctica (ISO 010) only adds empty space under a trade map.
        .filter((f) => String(f.id) !== "010");

const countryFeatures = withoutAntarctica(worldTopology);
/** Coarser shapes, used while the globe is being dragged or zoomed so it stays responsive. */
const countryFeaturesLow = withoutAntarctica(worldTopologyLow);
const graticule = geoGraticule10();

let instanceCounter = 0;

/**
 * Chooses the longitude to centre the flat map on. A flat world map has to be split somewhere;
 * this puts the split where the least value has to cross it, assuming each route takes the
 * shorter way round the globe. For a New Zealand exporter that usually means splitting the
 * Atlantic, so trans-Pacific routes are drawn across the Pacific instead of the long way.
 */
export function chooseCentreLongitude(legs: { from: number; to: number; weight: number }[]): number {
    const unique = Array.from(new Set(legs.flatMap((l) => [Math.round(l.from), Math.round(l.to)]))).sort((a, b) => a - b);
    if (unique.length === 0) return 0;
    if (unique.length === 1) return unique[0];
    const mod = (v: number) => ((v % 360) + 360) % 360;
    const crossingCost = (cutAt: number) => legs.reduce((sum, leg) => {
        const delta = mod(leg.to - leg.from + 180) - 180; // signed shorter way round, -180..180
        const crosses = delta >= 0 ? mod(cutAt - leg.from) < delta : mod(leg.from - cutAt) < -delta;
        return crosses ? sum + leg.weight : sum;
    }, 0);
    let best = { cost: Infinity, gap: -1 };
    let cut = 180;
    for (let i = 0; i < unique.length; i++) {
        const a = unique[i];
        const b = i === unique.length - 1 ? unique[0] + 360 : unique[i + 1];
        const candidate = a + (b - a) / 2;
        const cost = crossingCost(candidate);
        if (cost < best.cost || (cost === best.cost && b - a > best.gap)) {
            best = { cost, gap: b - a };
            cut = candidate;
        }
    }
    let centre = cut + 180;
    while (centre > 180) centre -= 360;
    while (centre < -180) centre += 360;
    return Math.round(centre);
}

/** How far the globe has flattened at a given zoom: 0 is a globe, 1 is a flat Mercator-style map. */
export function flattening(k: number): number {
    const t = Math.min(1, Math.max(0, (k - FLATTEN_FROM) / (FLATTEN_TO - FLATTEN_FROM)));
    return t * t * (3 - 2 * t);
}

const toVector = (lon: number, lat: number): Vec => {
    const l = lon * RAD, p = lat * RAD;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

/**
 * Points along the route between two places on the globe. The path follows the direct
 * (great-circle) line, bowed to one side by `bow` so that A to B and B to A do not overlap.
 */
export function bowedArc(from: [number, number], to: [number, number], bow: number, steps = 48): [number, number][] {
    const a = toVector(from[0], from[1]);
    const b = toVector(to[0], to[1]);
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const omega = Math.acos(dot);
    if (omega < 1e-6) return [from, to];
    let normal = cross(a, b);
    if (length(normal) < 1e-6) {
        // Exactly opposite sides of the globe: any direction is as short as any other.
        normal = cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    }
    const nl = length(normal);
    normal = [normal[0] / nl, normal[1] / nl, normal[2] / nl];
    const along = cross(normal, a); // unit vector at right angles to `a`, pointing towards `b`
    const lift = Math.tan(Math.min(30 * RAD, bow * omega * 0.5));
    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const c = Math.cos(s * omega), sn = Math.sin(s * omega);
        const side = lift * Math.sin(Math.PI * s);
        const p: Vec = [
            a[0] * c + along[0] * sn + normal[0] * side,
            a[1] * c + along[1] * sn + normal[1] * side,
            a[2] * c + along[2] * sn + normal[2] * side,
        ];
        const pl = length(p);
        points.push([Math.atan2(p[1], p[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, p[2] / pl))) / RAD]);
    }
    return points;
}

/**
 * The globe projection at flattening `t`: a blend of an orthographic globe (t = 0) and a
 * Mercator map (t = 1), both centred on the view. Their scales match at the centre, so the
 * blend is smooth.
 */
function blendedProjection(t: number): GeoProjection {
    return geoProjection((lambda: number, phi: number): [number, number] => {
        const cosPhi = Math.cos(phi);
        const limited = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, phi));
        const globeX = cosPhi * Math.sin(lambda), globeY = Math.sin(phi);
        const flatX = lambda, flatY = Math.log(Math.tan(Math.PI / 4 + limited / 2));
        return [(1 - t) * globeX + t * flatX, (1 - t) * globeY + t * flatY];
    });
}

export class FlowMap {
    private readonly uid: string;
    private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly defs: Selection<SVGDefsElement, unknown, null, undefined>;
    private readonly sphereLayer: Group;
    private readonly mapLayer: Group;
    private readonly shadeLayer: Group;
    private readonly routeLayer: Group;
    private readonly markerLayer: Group;
    private readonly labelLayer: Group;
    private readonly legendLayer: Group;
    private readonly cardLayer: Group;
    private readonly controlLayer: Group;
    private readonly messageLayer: Group;
    private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
    private readonly dragBehavior: DragBehavior<SVGSVGElement, unknown, unknown>;

    // flat map state
    private projection: GeoProjection | null = null;
    private projectionKey = "";
    private transform: ZoomTransform = zoomIdentity;
    // globe state
    private view: GlobeView = { lon: 0, lat: 0, k: 1 };
    private globeProjection: GeoProjection | null = null;
    private interacting = false;
    private idleTimer: number | null = null;
    private frameRequested = false;

    private viewKey = "";
    private activeIds: Set<string> = new Set();
    private nodes: MapNode[] = [];
    private routes: DrawnRoute[] = [];
    private options: FlowMapOptions | null = null;
    private handlers: FlowMapHandlers | null = null;
    private selectedKeys: Set<string> = new Set();
    private hoveredKey: string | null = null;
    /** Country under the pointer, and the country that has been clicked (by name). */
    private hoveredNode: string | null = null;
    private selectedNode: string | null = null;

    constructor(container: HTMLElement) {
        // Each visual runs in its own frame, so a per-frame counter keeps gradient ids unique.
        this.uid = "rfm" + ++instanceCounter;
        const svgElement = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
        container.appendChild(svgElement);
        this.svg = select<SVGSVGElement, unknown>(svgElement).attr("class", "routeFlowMap");
        this.defs = this.svg.append("defs");
        const shade = this.defs.append("radialGradient").attr("id", `${this.uid}_shade`).attr("gradientUnits", "userSpaceOnUse");
        shade.append("stop").attr("offset", "0%").attr("stop-color", "#FFFFFF").attr("stop-opacity", 0.28);
        shade.append("stop").attr("offset", "55%").attr("stop-color", "#FFFFFF").attr("stop-opacity", 0);
        shade.append("stop").attr("offset", "100%").attr("stop-color", "#000000").attr("stop-opacity", 0.16);
        this.sphereLayer = this.svg.append("g").attr("class", "sphere");
        this.mapLayer = this.svg.append("g").attr("class", "countries");
        this.shadeLayer = this.svg.append("g").attr("class", "shade");
        this.routeLayer = this.svg.append("g").attr("class", "routes");
        this.markerLayer = this.svg.append("g").attr("class", "markers");
        this.labelLayer = this.svg.append("g").attr("class", "labels");
        this.legendLayer = this.svg.append("g").attr("class", "legend");
        this.cardLayer = this.svg.append("g").attr("class", "card");
        this.controlLayer = this.svg.append("g").attr("class", "controls");
        this.messageLayer = this.svg.append("g").attr("class", "messages");

        this.zoomBehavior = zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
            if (this.options && this.options.projection === "globe") {
                // Only the zoom level is used on the globe; dragging rotates it instead.
                if (event.transform.k === this.view.k) return;
                this.view = { ...this.view, k: event.transform.k };
                this.globeChanged();
            } else {
                this.transform = event.transform;
                this.redraw();
            }
        });

        this.dragBehavior = drag<SVGSVGElement, unknown>().on("drag", (event) => {
            if (!this.options || this.options.projection !== "globe") return;
            // One radian of rotation moves the centre of the globe by one radius.
            const radius = this.globeRadius() * this.view.k;
            const lon = this.view.lon - (event.dx / radius) / RAD;
            const lat = Math.max(-80, Math.min(80, this.view.lat + (event.dy / radius) / RAD));
            this.view = { lon: ((lon + 540) % 360) - 180, lat, k: this.view.k };
            this.globeChanged();
        });

        this.svg.on("click", (event: MouseEvent) => {
            if (event.defaultPrevented) return;
            this.clearCountry();
            this.handlers?.onBackgroundClick();
        });
        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            this.handlers?.onContextMenu(null, event);
        });
    }

    public setSelection(keys: Set<string>): void {
        this.selectedKeys = keys;
        this.applyRouteEmphasis();
    }

    /** Zooms in (factor above 1) or out (below 1) about the centre of the view. */
    public zoomBy(factor: number): void {
        if (!this.options) return;
        this.svg.call(this.zoomBehavior.scaleBy, factor);
    }

    /** Returns to the automatic view for the current data. */
    public resetView(): void {
        const options = this.options;
        if (!options) return;
        if (options.projection === "globe") {
            this.view = this.autoGlobeView();
            this.svg.call(this.zoomBehavior.transform, zoomIdentity.scale(this.view.k));
            this.globeChanged();
        } else {
            this.transform = this.autoTransform(options.width, options.height);
            this.svg.call(this.zoomBehavior.transform, this.transform);
        }
    }

    public render(routes: Route[], unmatched: string[], options: FlowMapOptions, handlers: FlowMapHandlers): void {
        this.options = options;
        this.handlers = handlers;
        const width = Math.max(1, options.width);
        const height = Math.max(1, options.height);
        const globe = options.projection === "globe";
        this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

        const involved = new Map<string, Country>();
        routes.forEach((r) => {
            involved.set(r.origin.name, r.origin);
            involved.set(r.destination.name, r.destination);
        });
        this.activeIds = new Set(Array.from(involved.values()).map((c) => c.id).filter((id) => id));

        // --- flat map: projection and country shapes (rebuilt only when size or centring changes)
        let projectionKey = "globe";
        if (!globe) {
            const centre = chooseCentreLongitude(
                routes.map((r) => ({ from: r.origin.lon, to: r.destination.lon, weight: Math.abs(r.value ?? 1) || 1 })),
            );
            projectionKey = `${width}x${height}@${centre}`;
            if (projectionKey !== this.projectionKey || !this.projection) {
                const pad = 6;
                this.projection = geoNaturalEarth1()
                    .rotate([-centre, 0])
                    .fitExtent([[pad, pad], [width - pad, height - pad]], { type: "Sphere" });
                const path = geoPath(this.projection);
                this.mapLayer
                    .selectAll<SVGPathElement, CountryFeature>("path")
                    .data(countryFeatures)
                    .join("path")
                    .attr("d", (d) => path(d) || "")
                    .attr("vector-effect", "non-scaling-stroke");
                this.projectionKey = projectionKey;
            }
        } else {
            // The globe re-draws the shapes itself; make sure the flat map is rebuilt if we switch back.
            this.projectionKey = "";
        }

        // --- nodes and routes
        const nodeByName = new Map<string, MapNode>();
        const nodeFor = (country: Country): MapNode => {
            let node = nodeByName.get(country.name);
            if (!node) {
                const point = (!globe && this.projection && this.projection([country.lon, country.lat])) || [0, 0];
                node = { country, x: point[0], y: point[1], outbound: 0, inbound: 0, isOrigin: false, isDestination: false };
                nodeByName.set(country.name, node);
            }
            return node;
        };
        const maxAbs = routes.reduce((m, r) => Math.max(m, Math.abs(r.value ?? 0)), 0);
        const scale = createWidthScale(options.minWidth, options.maxWidth, options.scaleMax > 0 ? options.scaleMax : maxAbs);
        this.routes = routes.map((route) => {
            const from = nodeFor(route.origin);
            const to = nodeFor(route.destination);
            from.isOrigin = true;
            to.isDestination = true;
            from.outbound += route.value ?? 0;
            to.inbound += route.value ?? 0;
            return { route, from, to, width: scale.widthFor(route.value) };
        });
        // Widest first, so thin routes stay visible on top.
        this.routes.sort((a, b) => b.width - a.width);
        this.nodes = Array.from(nodeByName.values());
        if (this.hoveredKey && !this.routes.some((r) => r.route.key === this.hoveredKey)) this.hoveredKey = null;
        // Filtering can remove a country from the data; drop any hover or selection that pointed at it.
        if (this.hoveredNode && !nodeByName.has(this.hoveredNode)) this.hoveredNode = null;
        if (this.selectedNode && !nodeByName.has(this.selectedNode)) this.selectedNode = null;

        // --- view: keep the user's zoom and position while the data, size and mode are unchanged
        const viewKey = [options.projection, `${width}x${height}`, projectionKey, options.zoomToRoutes, routes.map((r) => r.key).sort().join("|")].join("#");
        const fresh = viewKey !== this.viewKey;
        this.viewKey = viewKey;
        if (globe) {
            if (fresh) this.view = this.autoGlobeView();
            this.zoomBehavior
                .scaleExtent([1, MAX_GLOBE_ZOOM])
                .extent([[0, 0], [width, height]])
                .translateExtent([[-Infinity, -Infinity], [Infinity, Infinity]])
                // Wheel only: dragging is handled separately, as rotation.
                .filter((event: Event) => event.type === "wheel");
        } else {
            if (fresh) this.transform = this.autoTransform(width, height);
            const extent: [[number, number], [number, number]] = [[0, 0], [width, height]];
            this.zoomBehavior
                .scaleExtent([1, MAX_USER_ZOOM])
                .extent(extent)
                .translateExtent(extent)
                .filter((event: MouseEvent) => (!event.ctrlKey || event.type === "wheel") && !event.button);
        }

        this.svg.on(".zoom", null).on(".drag", null);
        if (options.allowZoom) {
            this.svg.call(this.zoomBehavior).on("dblclick.zoom", null);
            if (globe) this.svg.call(this.dragBehavior);
            // Setting the transform raises a zoom event, which redraws in flat mode.
            this.svg.call(this.zoomBehavior.transform, globe ? zoomIdentity.scale(this.view.k) : this.transform);
            if (globe) this.redraw();
        } else {
            this.redraw();
        }

        this.drawLegend(scale, maxAbs > 0);
        this.drawControls();
        this.drawMessages(routes.length === 0, unmatched);
        this.drawCard();
    }

    // ------------------------------------------------------------------ flat map view

    /** Frames the countries in the data, leaving room for labels. */
    private autoTransform(width: number, height: number): ZoomTransform {
        const options = this.options!;
        if (!options.zoomToRoutes || this.nodes.length === 0) return zoomIdentity;
        const xs = this.nodes.map((n) => n.x);
        const ys = this.nodes.map((n) => n.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const margin = { left: 48, right: 96, top: 34, bottom: 44 };
        const availW = Math.max(40, width - margin.left - margin.right);
        const availH = Math.max(40, height - margin.top - margin.bottom);
        const limit = this.nodes.length === 1 ? 4 : MAX_AUTO_ZOOM;
        let k = Math.min(limit, availW / Math.max(1, x1 - x0), availH / Math.max(1, y1 - y0));
        k = Math.max(1, k);
        let tx = margin.left + availW / 2 - k * (x0 + x1) / 2;
        let ty = margin.top + availH / 2 - k * (y0 + y1) / 2;
        tx = Math.min(0, Math.max(width - k * width, tx));
        ty = Math.min(0, Math.max(height - k * height, ty));
        return zoomIdentity.translate(tx, ty).scale(k);
    }

    // ------------------------------------------------------------------ globe view

    /** Radius of the globe in pixels when it is fully zoomed out. */
    private globeRadius(): number {
        const options = this.options!;
        return Math.max(20, Math.min(options.width, options.height) / 2 - 10);
    }

    private buildGlobeProjection(view: GlobeView): GeoProjection {
        const options = this.options!;
        return blendedProjection(flattening(view.k))
            .scale(this.globeRadius() * view.k)
            .translate([options.width / 2, options.height / 2])
            .rotate([-view.lon, -view.lat])
            .clipAngle(90 - 1e-3)
            .clipExtent([[-2, -2], [options.width + 2, options.height + 2]]);
    }

    /**
     * Centres the globe on the middle of the trade (weighted by value) and, when "zoom to
     * routes" is on and every country fits on the near side, zooms in as far as they all stay in view.
     */
    private autoGlobeView(): GlobeView {
        const options = this.options!;
        if (this.nodes.length === 0) return { lon: 0, lat: 15, k: 1 };
        const sum: Vec = [0, 0, 0];
        this.nodes.forEach((n) => {
            const weight = Math.abs(n.inbound) + Math.abs(n.outbound) || 1;
            const v = toVector(n.country.lon, n.country.lat);
            sum[0] += v[0] * weight; sum[1] += v[1] * weight; sum[2] += v[2] * weight;
        });
        // Countries spread evenly round the globe cancel out; fall back to the busiest one.
        const busiest = this.nodes.reduce((a, b) => (Math.abs(b.inbound) + Math.abs(b.outbound) > Math.abs(a.inbound) + Math.abs(a.outbound) ? b : a));
        const len = length(sum);
        const lon = len > 1e-6 ? Math.atan2(sum[1], sum[0]) / RAD : busiest.country.lon;
        const lat = len > 1e-6 ? Math.max(-80, Math.min(80, Math.asin(sum[2] / len) / RAD)) : busiest.country.lat;
        if (!options.zoomToRoutes) return { lon, lat, k: 1 };

        const allInView = (k: number): boolean => {
            const projection = this.buildGlobeProjection({ lon, lat, k });
            const margin = { left: 40, right: 90, top: 30, bottom: 40 };
            return this.nodes.every((n) => {
                if (geoDistance([n.country.lon, n.country.lat], [lon, lat]) > HORIZON) return false;
                const p = projection([n.country.lon, n.country.lat]);
                return !!p && p[0] >= margin.left && p[0] <= options.width - margin.right && p[1] >= margin.top && p[1] <= options.height - margin.bottom;
            });
        };
        if (!allInView(1)) return { lon, lat, k: 1 };
        let low = 1, high = this.nodes.length === 1 ? 3 : MAX_GLOBE_AUTO_ZOOM;
        for (let i = 0; i < 12; i++) {
            const mid = (low + high) / 2;
            if (allInView(mid)) low = mid; else high = mid;
        }
        return { lon, lat, k: low };
    }

    /** Called while the globe is being dragged or zoomed: redraw promptly with coarse shapes, then refine. */
    private globeChanged(): void {
        this.interacting = true;
        if (!this.frameRequested) {
            this.frameRequested = true;
            window.requestAnimationFrame(() => {
                this.frameRequested = false;
                this.redraw();
            });
        }
        if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => {
            this.idleTimer = null;
            this.interacting = false;
            this.redraw();
        }, 220);
    }

    // ------------------------------------------------------------------ drawing

    private redraw(): void {
        const options = this.options;
        if (!options) return;
        if (options.projection === "globe") this.drawGlobeBase(); else this.drawFlatBase();
        this.drawRoutes();
        this.drawMarkersAndLabels();
    }

    private paintCountries(): void {
        const options = this.options!;
        this.mapLayer
            .selectAll<SVGPathElement, CountryFeature>("path")
            .attr("fill", (d) => (d.id !== undefined && this.activeIds.has(String(d.id)) ? options.activeLandColor : options.landColor))
            .attr("stroke", options.borderColor)
            .attr("stroke-width", 0.5)
            // Countries in the data can be clicked, the same as their markers.
            .style("cursor", (d) => (d.id !== undefined && this.activeIds.has(String(d.id)) ? "pointer" : null))
            .on("click", (event: MouseEvent, d) => {
                const node = d.id === undefined ? undefined : this.nodes.find((n) => n.country.id === String(d.id));
                if (!node || event.defaultPrevented) return;
                event.stopPropagation();
                this.toggleCountry(node.country.name, event);
            });
    }

    private drawFlatBase(): void {
        this.globeProjection = null;
        this.sphereLayer.selectAll("*").remove();
        this.shadeLayer.selectAll("*").remove();
        this.mapLayer.attr("transform", this.transform.toString());
        this.paintCountries();
    }

    private drawGlobeBase(): void {
        const options = this.options!;
        const projection = this.buildGlobeProjection(this.view);
        this.globeProjection = projection;
        const path = geoPath(projection);
        const t = flattening(this.view.k);
        const outline = path({ type: "Sphere" }) || "";

        this.sphereLayer
            .selectAll<SVGPathElement, string>("path.ocean")
            .data([outline])
            .join("path")
            .attr("class", "ocean")
            .attr("d", (d) => d)
            .attr("fill", options.oceanColor)
            .attr("stroke", "#C9CFCB")
            .attr("stroke-width", 0.75);
        this.sphereLayer
            .selectAll<SVGPathElement, number>("path.graticule")
            .data([0])
            .join("path")
            .attr("class", "graticule")
            .attr("d", path(graticule) || "")
            .attr("fill", "none")
            .attr("stroke", "#9AA5A0")
            .attr("stroke-opacity", 0.28)
            .attr("stroke-width", 0.5);

        this.mapLayer.attr("transform", null);
        this.mapLayer
            .selectAll<SVGPathElement, CountryFeature>("path")
            .data(this.interacting ? countryFeaturesLow : countryFeatures)
            .join("path")
            .attr("vector-effect", null)
            .attr("d", (d) => path(d) || "");
        this.paintCountries();

        // Soft light-and-shadow over the globe, fading out as it flattens.
        const radius = this.globeRadius() * this.view.k;
        const cx = options.width / 2, cy = options.height / 2;
        this.defs.select(`#${this.uid}_shade`)
            .attr("cx", cx - radius * 0.35)
            .attr("cy", cy - radius * 0.4)
            .attr("r", radius * 1.45);
        this.shadeLayer
            .selectAll<SVGPathElement, string>("path")
            .data(t < 1 ? [outline] : [])
            .join("path")
            .attr("d", (d) => d)
            .attr("fill", `url(#${this.uid}_shade)`)
            .attr("opacity", 1 - t)
            .attr("pointer-events", "none");
    }

    /** Where a country's marker sits on screen, and whether it is on the visible side. */
    private place(node: MapNode): Placed {
        const options = this.options!;
        if (options.projection === "globe") {
            const projection = this.globeProjection;
            const point = projection ? projection([node.country.lon, node.country.lat]) : null;
            if (!point) return { x: 0, y: 0, visible: false };
            const onNearSide = geoDistance([node.country.lon, node.country.lat], [this.view.lon, this.view.lat]) < HORIZON;
            const inFrame = point[0] >= -20 && point[0] <= options.width + 20 && point[1] >= -20 && point[1] <= options.height + 20;
            return { x: point[0], y: point[1], visible: onNearSide && inFrame };
        }
        const [x, y] = this.transform.apply([node.x, node.y]);
        return { x, y, visible: true };
    }

    private markerRadius(node: MapNode, maxInbound: number): number {
        if (!node.isDestination) return 3.5;
        const share = maxInbound > 0 ? Math.sqrt(Math.abs(node.inbound) / maxInbound) : 0;
        return 3.5 + 4.5 * share;
    }

    private routeOpacity(d: DrawnRoute): number {
        const options = this.options!;
        const key = d.route.key;
        const dimmed = options.routeOpacity * 0.2;
        const touches = (country: string) => d.route.origin.name === country || d.route.destination.name === country;
        // Hover wins while the pointer is over something; otherwise a selected country, then selected routes.
        if (options.hoverHighlight && this.hoveredKey) return key === this.hoveredKey ? 1 : dimmed;
        if (options.hoverHighlight && this.hoveredNode) return touches(this.hoveredNode) ? 1 : dimmed;
        if (this.selectedNode) return touches(this.selectedNode) ? 1 : dimmed;
        if (this.selectedKeys.size > 0 && !this.selectedKeys.has(key)) return dimmed;
        return options.routeOpacity;
    }

    /** Every route that starts or ends in the given country. */
    private routesOf(country: string): DrawnRoute[] {
        return this.routes.filter((r) => r.route.origin.name === country || r.route.destination.name === country);
    }

    private setNodeHover(country: string | null): void {
        if (this.hoveredNode === country) return;
        this.hoveredNode = country;
        this.applyRouteEmphasis();
        this.drawCard();
    }

    /** Selects a country (pinning its routes in the card), or clears the selection if it is already selected. */
    private toggleCountry(country: string, event: MouseEvent): void {
        this.selectedNode = this.selectedNode === country ? null : country;
        this.applyRouteEmphasis();
        this.drawMarkersAndLabels();
        this.drawCard();
        this.handlers?.onCountryClick(this.selectedNode ? this.routesOf(this.selectedNode).map((r) => r.route) : [], event);
    }

    private clearCountry(): void {
        if (!this.selectedNode) return;
        this.selectedNode = null;
        this.applyRouteEmphasis();
        this.drawMarkersAndLabels();
        this.drawCard();
    }

    /** Updates only the dimming of routes, for hover and selection changes. */
    private applyRouteEmphasis(): void {
        if (!this.options) return;
        this.routeLayer.selectAll<SVGGElement, DrawnRoute>("g.route").attr("opacity", (d) => this.routeOpacity(d));
    }

    private setHover(key: string | null): void {
        if (this.hoveredKey === key) return;
        this.hoveredKey = key;
        this.applyRouteEmphasis();
        this.drawCard();
    }

    private drawRoutes(): void {
        const options = this.options;
        const handlers = this.handlers;
        if (!options || !handlers) return;
        const globe = options.projection === "globe";
        const geoLine = globe && this.globeProjection ? geoPath(this.globeProjection) : null;
        const gradientId = (d: DrawnRoute, i: number) => `${this.uid}_g${i}`;

        const geometry = this.routes.map((d) => {
            const a = this.place(d.from);
            const b = this.place(d.to);
            const ends = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            if (d.from === d.to) {
                // Domestic route: a ring around the country marker.
                const r = 11 + d.width;
                const path = a.visible ? `M${a.x - r},${a.y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0` : "";
                return { ...ends, loop: true, fade: false, path };
            }
            if (geoLine) {
                // On the globe the route follows the surface, and the far side is cut off at the horizon.
                const coordinates = bowedArc([d.from.country.lon, d.from.country.lat], [d.to.country.lon, d.to.country.lat], options.curvature);
                return { ...ends, loop: false, fade: a.visible && b.visible, path: geoLine({ type: "LineString", coordinates }) || "" };
            }
            const dx = b.x - a.x, dy = b.y - a.y;
            const cx = (a.x + b.x) / 2 - dy * options.curvature;
            const cy = (a.y + b.y) / 2 + dx * options.curvature;
            return { ...ends, loop: false, fade: true, path: `M${a.x},${a.y}Q${cx},${cy} ${b.x},${b.y}` };
        });

        const useGradient = (i: number) => options.fadeFromOrigin && geometry[i].fade;

        const gradients = this.defs
            .selectAll<SVGLinearGradientElement, DrawnRoute>("linearGradient")
            .data(this.routes)
            .join((enter) => {
                const g = enter.append("linearGradient").attr("gradientUnits", "userSpaceOnUse");
                g.append("stop").attr("offset", "0%").attr("stop-opacity", 0.18);
                g.append("stop").attr("offset", "100%").attr("stop-opacity", 1);
                return g;
            })
            .attr("id", gradientId)
            .attr("x1", (d, i) => geometry[i].x1)
            .attr("y1", (d, i) => geometry[i].y1)
            .attr("x2", (d, i) => geometry[i].x2)
            .attr("y2", (d, i) => geometry[i].y2);
        gradients.selectAll("stop").attr("stop-color", options.routeColor);

        const tooltipFor = (d: DrawnRoute): TooltipItem[] => {
            const items: TooltipItem[] = [
                { displayName: "Origin", value: d.route.origin.name },
                { displayName: "Destination", value: d.route.destination.name },
            ];
            if (d.route.value !== null) items.push({ displayName: options.valueLabel, value: options.formatValue(d.route.value) });
            return items;
        };

        const groups = this.routeLayer
            .selectAll<SVGGElement, DrawnRoute>("g.route")
            .data(this.routes)
            .join((enter) => {
                const g = enter.append("g").attr("class", "route");
                g.append("path").attr("class", "line").attr("fill", "none").attr("stroke-linecap", "round");
                g.append("path").attr("class", "hit").attr("fill", "none").attr("stroke", "transparent").attr("pointer-events", "stroke");
                return g;
            })
            .attr("opacity", (d) => this.routeOpacity(d));

        groups
            .select<SVGPathElement>("path.line")
            .attr("d", (d, i) => geometry[i].path)
            .attr("stroke", (d, i) => (useGradient(i) ? `url(#${gradientId(d, i)})` : options.routeColor))
            .attr("stroke-width", (d) => d.width);

        groups
            .select<SVGPathElement>("path.hit")
            .attr("d", (d, i) => geometry[i].path)
            // A little wider than the line so thin routes are easy to point at, but not so wide
            // that a thin route's hover zone covers the thick route next to it.
            .attr("stroke-width", (d) => Math.max(d.width + 4, 9))
            .style("cursor", "pointer")
            .on("click", (event: MouseEvent, d) => {
                event.stopPropagation();
                this.clearCountry();
                handlers.onRouteClick(d.route, event);
            })
            .on("contextmenu", (event: MouseEvent, d) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(d.route, event);
            })
            .on("mouseenter", (event: MouseEvent, d) => this.setHover(d.route.key))
            .on("mousemove", (event: MouseEvent, d) => handlers.showTooltip(tooltipFor(d), event, d.route))
            .on("mouseleave", () => {
                this.setHover(null);
                handlers.hideTooltip();
            });
    }

    private drawMarkersAndLabels(): void {
        const options = this.options;
        const handlers = this.handlers;
        if (!options || !handlers) return;
        const width = options.width, height = options.height;
        const maxInbound = this.nodes.reduce((m, n) => Math.max(m, Math.abs(n.inbound)), 0);
        const hasValues = this.routes.some((r) => r.route.value !== null);

        const placed = this.nodes
            .map((node) => ({ node, ...this.place(node), r: this.markerRadius(node, maxInbound) }))
            .filter((p) => p.visible)
            .sort((a, b) => Math.abs(b.node.inbound) + Math.abs(b.node.outbound) - (Math.abs(a.node.inbound) + Math.abs(a.node.outbound)));

        const detailsFor = (node: MapNode): TooltipItem[] => {
            const items: TooltipItem[] = [{ displayName: "Country", value: node.country.name }];
            if (hasValues && node.isOrigin) items.push({ displayName: `${options.valueLabel} out`, value: options.formatValue(node.outbound) });
            if (hasValues && node.isDestination) items.push({ displayName: `${options.valueLabel} in`, value: options.formatValue(node.inbound) });
            return items;
        };

        // The visible dot. A selected country gets a halo so it is clear which one the card describes.
        this.markerLayer
            .selectAll<SVGCircleElement, (typeof placed)[number]>("circle.dot")
            .data(placed)
            .join("circle")
            .attr("class", "dot")
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y)
            .attr("r", (d) => d.r)
            .attr("fill", (d) => (d.node.isDestination ? options.routeColor : "#FFFFFF"))
            .attr("stroke", (d) => (d.node.isOrigin || d.node.country.name === this.selectedNode ? options.markerColor : "#FFFFFF"))
            .attr("stroke-width", (d) => (d.node.country.name === this.selectedNode ? 3.5 : d.node.isOrigin ? 2 : 1))
            .attr("pointer-events", "none");

        // A larger invisible target on top, so small markers are easy to point at and click.
        this.markerLayer
            .selectAll<SVGCircleElement, (typeof placed)[number]>("circle.target")
            .data(placed)
            .join("circle")
            .attr("class", "target")
            .attr("cx", (d) => d.x)
            .attr("cy", (d) => d.y)
            .attr("r", (d) => Math.max(d.r + 4, 9))
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .on("mouseenter", (event: MouseEvent, d) => this.setNodeHover(d.node.country.name))
            .on("mousemove", (event: MouseEvent, d) => handlers.showTooltip(detailsFor(d.node), event, null))
            .on("mouseleave", () => {
                this.setNodeHover(null);
                handlers.hideTooltip();
            })
            .on("click", (event: MouseEvent, d) => {
                event.stopPropagation();
                this.toggleCountry(d.node.country.name, event);
            });
        this.markerLayer.selectAll("circle.target").raise();

        // Labels: biggest countries first; skip any that would collide or fall off the edge.
        const fontSize = options.labelSize;
        const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
        const labels = !options.showLabels ? [] : placed
            .map((d) => {
                const textWidth = d.node.country.name.length * fontSize * 0.56;
                let anchor: "start" | "end" = "start";
                let x = d.x + d.r + 4;
                if (x + textWidth > width - 2) {
                    anchor = "end";
                    x = d.x - d.r - 4;
                }
                const y = d.y + fontSize * 0.35;
                const box = {
                    x0: anchor === "start" ? x : x - textWidth,
                    x1: anchor === "start" ? x + textWidth : x,
                    y0: y - fontSize,
                    y1: y + fontSize * 0.3,
                };
                return { d, x, y, anchor, box };
            })
            .filter((label) => {
                const b = label.box;
                if (b.x0 < 0 || b.x1 > width || b.y0 < 0 || b.y1 > height) return false;
                if (boxes.some((o) => b.x0 < o.x1 + 2 && b.x1 > o.x0 - 2 && b.y0 < o.y1 + 1 && b.y1 > o.y0 - 1)) return false;
                boxes.push(b);
                return true;
            });

        this.labelLayer
            .selectAll<SVGTextElement, (typeof labels)[number]>("text")
            .data(labels)
            .join("text")
            .attr("x", (l) => l.x)
            .attr("y", (l) => l.y)
            .attr("text-anchor", (l) => l.anchor)
            .attr("font-size", fontSize)
            .attr("fill", options.labelColor)
            .text((l) => l.d.node.country.name);
    }

    /** What the card shows for one route. */
    private routeCard(route: Route): CardContent {
        const options = this.options!;
        const rows: CardRow[] = [];
        if (route.value !== null) {
            const valued = this.routes.filter((r) => r.route.value !== null);
            const total = valued.reduce((sum, r) => sum + Math.abs(r.route.value ?? 0), 0);
            const rank = valued.filter((r) => Math.abs(r.route.value ?? 0) > Math.abs(route.value ?? 0)).length + 1;
            rows.push({ left: options.valueLabel, right: options.formatValue(route.value) });
            if (total > 0) rows.push({ left: "Share of total", right: `${((Math.abs(route.value) / total) * 100).toFixed(1)}%` });
            rows.push({ left: "Rank", right: `${rank} of ${valued.length}` });
        }
        const title = route.origin.name === route.destination.name
            ? `${route.origin.name} (domestic)`
            : `${route.origin.name} \u2192 ${route.destination.name}`;
        return { title, rows };
    }

    /** What the card shows for a country: its totals, then every route it is part of, largest first. */
    private countryCard(country: string, pinned: boolean): CardContent {
        const options = this.options!;
        const routes = this.routesOf(country).map((r) => r.route);
        const hasValues = routes.some((r) => r.value !== null);
        const outbound = routes.filter((r) => r.origin.name === country && r.destination.name !== country);
        const inbound = routes.filter((r) => r.destination.name === country && r.origin.name !== country);
        const domestic = routes.filter((r) => r.origin.name === country && r.destination.name === country);
        const sum = (list: Route[]) => list.reduce((s, r) => s + (r.value ?? 0), 0);
        const count = (n: number) => `${n} route${n === 1 ? "" : "s"}`;
        const rows: CardRow[] = [];
        if (outbound.length) rows.push({ left: `Out, ${count(outbound.length)}`, right: hasValues ? options.formatValue(sum(outbound)) : "", strong: true });
        if (inbound.length) rows.push({ left: `In, ${count(inbound.length)}`, right: hasValues ? options.formatValue(sum(inbound)) : "", strong: true });
        if (domestic.length) rows.push({ left: "Domestic", right: hasValues ? options.formatValue(sum(domestic)) : "", strong: true });
        const listed = [...outbound, ...inbound].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));
        listed.forEach((r) => {
            const isOut = r.origin.name === country;
            rows.push({
                left: isOut ? `\u2192 ${r.destination.name}` : `\u2190 ${r.origin.name}`,
                right: r.value !== null ? options.formatValue(r.value) : "",
                divider: r === listed[0],
            });
        });
        return { title: country, rows, note: pinned ? "Click the country again to clear" : "Click to keep this list open" };
    }

    /**
     * Details card in the top-right corner. Shows, in order of priority: the route under the
     * pointer, the country under the pointer, or the country that has been clicked.
     */
    private drawCard(): void {
        const options = this.options;
        this.cardLayer.selectAll("*").remove();
        if (!options || !options.hoverCard) return;

        let card: CardContent | null = null;
        const hovered = this.hoveredKey ? this.routes.find((r) => r.route.key === this.hoveredKey) : undefined;
        if (hovered) card = this.routeCard(hovered.route);
        else if (this.hoveredNode) card = this.countryCard(this.hoveredNode, this.hoveredNode === this.selectedNode);
        else if (this.selectedNode) card = this.countryCard(this.selectedNode, true);
        if (!card) return;

        const padding = 9, lineHeight = 15, titleHeight = 14, noteHeight = card.note ? 15 : 0;
        // Keep the card inside the visual: if there are more rows than fit, say how many were left out.
        const maxRows = Math.max(3, Math.floor((options.height - 20 - padding * 2 - titleHeight - noteHeight) / lineHeight));
        let rows = card.rows;
        if (rows.length > maxRows) {
            const hidden = rows.length - (maxRows - 1);
            rows = [...rows.slice(0, maxRows - 1), { left: `and ${hidden} more`, right: "" }];
        }
        const leftWidth = Math.max(0, ...rows.map((r) => r.left.length * 5.8));
        const rightWidth = Math.max(0, ...rows.map((r) => r.right.length * 6));
        const bodyWidth = leftWidth + (rightWidth > 0 ? 16 + rightWidth : 0);
        const noteWidth = card.note ? card.note.length * 5 : 0;
        const cardWidth = Math.min(options.width - 16, Math.max(card.title.length * 6.6, bodyWidth, noteWidth) + padding * 2);
        const cardHeight = padding * 2 + titleHeight + rows.length * lineHeight + noteHeight;
        const x = Math.max(8, options.width - cardWidth - 10);
        const y = 10;
        this.cardLayer
            .append("rect")
            .attr("x", x)
            .attr("y", y)
            .attr("width", cardWidth)
            .attr("height", cardHeight)
            .attr("rx", 4)
            .attr("fill", "#FFFFFF")
            .attr("fill-opacity", 0.97)
            .attr("stroke", "#C9C9C5")
            .attr("stroke-width", 1);
        this.cardLayer
            .append("text")
            .attr("class", "title")
            .attr("x", x + padding)
            .attr("y", y + padding + 10)
            .attr("font-size", 11.5)
            .attr("font-weight", 600)
            .attr("fill", "#1C1C1B")
            .text(card.title);
        rows.forEach((row, i) => {
            const baseline = y + padding + 10 + (i + 1) * lineHeight;
            if (row.divider) {
                this.cardLayer
                    .append("line")
                    .attr("x1", x + padding)
                    .attr("x2", x + cardWidth - padding)
                    .attr("y1", baseline - 11.5)
                    .attr("y2", baseline - 11.5)
                    .attr("stroke", "#DADAD6")
                    .attr("stroke-width", 1);
            }
            this.cardLayer
                .append("text")
                .attr("class", "row-left")
                .attr("x", x + padding)
                .attr("y", baseline)
                .attr("font-size", 10.5)
                .attr("font-weight", row.strong ? 600 : 400)
                .attr("fill", "#3A3A38")
                .text(row.left);
            if (row.right) {
                this.cardLayer
                    .append("text")
                    .attr("class", "row-right")
                    .attr("x", x + cardWidth - padding)
                    .attr("y", baseline)
                    .attr("text-anchor", "end")
                    .attr("font-size", 10.5)
                    .attr("font-weight", row.strong ? 600 : 400)
                    .attr("fill", "#3A3A38")
                    .text(row.right);
            }
        });
        if (card.note) {
            this.cardLayer
                .append("text")
                .attr("class", "note")
                .attr("x", x + padding)
                .attr("y", y + cardHeight - padding + 1)
                .attr("font-size", 9)
                .attr("fill", "#8A8A86")
                .text(card.note);
        }
    }
    /** Zoom in, zoom out and reset buttons in the bottom-right corner. */
    private drawControls(): void {
        const options = this.options!;
        this.controlLayer.selectAll("*").remove();
        if (!options.allowZoom || !options.showZoomButtons) return;
        const size = 24, gap = 4;
        const buttons: { label: string; title: string; action: () => void }[] = [
            { label: "+", title: "Zoom in", action: () => this.zoomBy(1.6) },
            { label: "−", title: "Zoom out", action: () => this.zoomBy(1 / 1.6) },
            { label: "↺", title: "Reset view", action: () => this.resetView() },
        ];
        const x = options.width - size - 10;
        const top = options.height - 10 - buttons.length * size - (buttons.length - 1) * gap;
        buttons.forEach((button, i) => {
            const g = this.controlLayer
                .append("g")
                .attr("class", "button")
                .attr("transform", `translate(${x},${top + i * (size + gap)})`)
                .style("cursor", "pointer")
                // Keep presses on a button from starting a drag or clearing the selection.
                .on("mousedown touchstart pointerdown dblclick", (event: Event) => event.stopPropagation())
                .on("click", (event: MouseEvent) => {
                    event.stopPropagation();
                    button.action();
                });
            g.append("title").text(button.title);
            g.append("rect")
                .attr("width", size)
                .attr("height", size)
                .attr("rx", 4)
                .attr("fill", "#FFFFFF")
                .attr("fill-opacity", 0.95)
                .attr("stroke", "#C9C9C5")
                .attr("stroke-width", 1);
            g.append("text")
                .attr("x", size / 2)
                .attr("y", size / 2 + 5)
                .attr("text-anchor", "middle")
                .attr("font-size", 15)
                .attr("fill", "#1C1C1B")
                .text(button.label);
        });
    }

    /**
     * Width legend: round values with a bar drawn at exactly the width a route of that value
     * gets on the map. Bars have square ends so their thickness is easy to compare.
     */
    private drawLegend(scale: WidthScale, hasValues: boolean): void {
        const options = this.options!;
        this.legendLayer.selectAll("*").remove();
        if (!options.showLegend || !hasValues) return;
        const values = legendValues(scale.domainMax);
        if (values.length === 0) return;
        const format = options.makeCompactFormatter(values);
        const samples = values.map((value) => ({ value, width: scale.widthFor(value) }));
        const barLength = 36;
        const gap = 5;
        const x = 12;
        const totalHeight = samples.reduce((sum, s) => sum + Math.max(13, s.width) + gap, 0);
        let y = options.height - 10 - totalHeight;
        this.legendLayer
            .append("text")
            .attr("x", x)
            .attr("y", y - 5)
            .attr("font-size", 10)
            .attr("font-weight", 600)
            .attr("fill", options.labelColor)
            .text(options.valueLabel);
        samples.forEach((sample) => {
            const rowHeight = Math.max(13, sample.width);
            const cy = y + rowHeight / 2;
            this.legendLayer
                .append("rect")
                .attr("class", "sample")
                .attr("x", x)
                .attr("y", cy - sample.width / 2)
                .attr("width", barLength)
                .attr("height", sample.width)
                .attr("fill", options.routeColor)
                .attr("fill-opacity", options.routeOpacity);
            this.legendLayer
                .append("text")
                .attr("x", x + barLength + 8)
                .attr("y", cy + 3.5)
                .attr("font-size", 10)
                .attr("fill", options.labelColor)
                .text(format(sample.value));
            y += rowHeight + gap;
        });
    }

    private drawMessages(empty: boolean, unmatched: string[]): void {
        const options = this.options!;
        this.messageLayer.selectAll("*").remove();
        if (unmatched.length > 0) {
            const shown = unmatched.slice(0, 4).join(", ");
            const more = unmatched.length > 4 ? ` and ${unmatched.length - 4} more` : "";
            this.messageLayer
                .append("text")
                .attr("class", "notice")
                .attr("x", 12)
                .attr("y", 16)
                .attr("font-size", 10)
                .attr("fill", "#8A8A86")
                .text(`Not recognised as a country: ${shown}${more}`);
        }
        if (empty && unmatched.length === 0) {
            this.messageLayer
                .append("text")
                .attr("class", "hint")
                .attr("x", options.width / 2)
                .attr("y", options.height / 2)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("fill", "#6B6B68")
                .text("Add an origin country, a destination country and a value such as revenue");
        }
    }
}
