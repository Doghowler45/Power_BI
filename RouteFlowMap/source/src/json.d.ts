// JSON assets are bundled by webpack. They are typed loosely on purpose: letting the
// compiler infer a type for a 750 KB map file makes builds very slow.
interface WorldTopology {
    type: "Topology";
    objects: { countries: TopoJSON.GeometryCollection };
    arcs: number[][][];
}

declare module "world-atlas/countries-50m.json" {
    const value: WorldTopology;
    export default value;
}

declare module "world-atlas/countries-110m.json" {
    const value: WorldTopology;
    export default value;
}

declare module "*countryIndex.json" {
    const value: unknown;
    export default value;
}
