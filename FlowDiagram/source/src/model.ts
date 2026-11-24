"use strict";

import { OTHER_LABEL } from "./common/colours";

export interface FlowRow {
    /** One name per stage, left to right. */
    stages: string[];
    value: number | null;
}

export interface FlowNode {
    stage: number;
    name: string;
    value: number;
    /** Positions, in the data as it arrived, of the rows that pass through this node. */
    rows: number[];
    /** The names pooled into it, when it is an "Other" node. */
    pooled: string[];
    // Set by the layout:
    x: number;
    y: number;
    height: number;
}

/**
 * One ribbon between two neighbouring stages. A flow between two nodes is drawn as several
 * ribbons, one for each thing it is coloured by, so a colour can be followed from one side of
 * the diagram to the other.
 */
export interface FlowLink {
    source: FlowNode;
    target: FlowNode;
    /** The name, in the colouring stage, of the rows in this ribbon. */
    colourBy: string;
    value: number;
    rows: number[];
    // Set by the layout: the top of the ribbon where it leaves the source and where it enters the target.
    sourceY: number;
    targetY: number;
    thickness: number;
}

export interface Flow {
    stageNames: string[];
    stages: FlowNode[][];
    links: FlowLink[];
    total: number;
    /** The names in the colouring stage, largest first, "Other" last. */
    colourNames: string[];
    /** Rows left out because their value was blank, zero or negative. */
    dropped: number;
}

export const nodeKey = (node: FlowNode): string => `n|${node.stage}|${node.name}`;
export const linkKey = (link: FlowLink): string => `l|${link.source.stage}|${link.source.name}|${link.target.name}|${link.colourBy}`;

/**
 * Builds the nodes and ribbons. In each stage, names beyond `maxNodes` are pooled into one
 * "Other" node (smallest first), so no stage has more nodes than can be read.
 */
export function buildFlow(stageNames: string[], rows: FlowRow[], maxNodes: number, colourStage: "first" | "last"): Flow | null {
    const stageCount = stageNames.length;
    if (stageCount < 2) return null;
    const used = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.value !== null && row.value > 0 && row.stages.length >= stageCount);
    if (used.length === 0) return null;
    const total = used.reduce((sum, { row }) => sum + (row.value as number), 0);
    const limit = Math.max(2, Math.round(maxNodes));

    // The name each row takes in each stage, after pooling.
    const pooledInto: Map<string, string>[] = [];
    const stages: FlowNode[][] = [];
    for (let stage = 0; stage < stageCount; stage++) {
        const totals = new Map<string, number>();
        used.forEach(({ row }) => totals.set(row.stages[stage], (totals.get(row.stages[stage]) || 0) + (row.value as number)));
        const ranked = [...totals.entries()].sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1])).map(([name]) => name);
        const kept = ranked.length > limit ? ranked.slice(0, limit - 1) : ranked;
        const pooled = ranked.length > limit ? ranked.slice(limit - 1) : [];
        const mapping = new Map<string, string>();
        kept.forEach((name) => mapping.set(name, name));
        pooled.forEach((name) => mapping.set(name, OTHER_LABEL));
        pooledInto.push(mapping);
        const names = pooled.length ? [...kept, OTHER_LABEL] : kept;
        stages.push(names.map((name) => ({ stage, name, value: 0, rows: [], pooled: name === OTHER_LABEL ? pooled : [], x: 0, y: 0, height: 0 })));
    }
    const nodeOf = (stage: number, rawName: string) => stages[stage].find((node) => node.name === pooledInto[stage].get(rawName)) as FlowNode;
    const colourIndex = colourStage === "last" ? stageCount - 1 : 0;

    const links = new Map<string, FlowLink>();
    used.forEach(({ row, index }) => {
        const value = row.value as number;
        const colourBy = pooledInto[colourIndex].get(row.stages[colourIndex]) as string;
        for (let stage = 0; stage < stageCount; stage++) {
            const node = nodeOf(stage, row.stages[stage]);
            node.value += value;
            node.rows.push(index);
            if (stage === stageCount - 1) continue;
            const target = nodeOf(stage + 1, row.stages[stage + 1]);
            const key = `${stage}|${node.name}|${target.name}|${colourBy}`;
            let link = links.get(key);
            if (!link) {
                link = { source: node, target, colourBy, value: 0, rows: [], sourceY: 0, targetY: 0, thickness: 0 };
                links.set(key, link);
            }
            link.value += value;
            link.rows.push(index);
        }
    });
    return { stageNames, stages, links: [...links.values()], total, colourNames: stages[colourIndex].map((node) => node.name), dropped: rows.length - used.length };
}

/**
 * Places the nodes and ribbons in a box. Stages are evenly spaced across; within a stage the
 * nodes are stacked with gaps, in an order that keeps connected nodes near each other so the
 * ribbons cross as little as possible.
 */
export function layoutFlow(flow: Flow, left: number, top: number, width: number, height: number, nodeWidth: number, nodeGap: number): void {
    const stageCount = flow.stages.length;
    const most = Math.max(...flow.stages.map((stage) => stage.length));
    const gap = Math.max(0, Math.min(nodeGap, (height * 0.5) / Math.max(1, most - 1)));
    const scale = Math.min(...flow.stages.map((stage) => (height - gap * (stage.length - 1)) / flow.total));

    const place = (stage: FlowNode[], index: number) => {
        const stackHeight = stage.reduce((sum, node) => sum + node.value * scale, 0) + gap * (stage.length - 1);
        let y = top + (height - stackHeight) / 2;
        stage.forEach((node) => {
            node.x = left + (stageCount === 1 ? 0 : (index * (width - nodeWidth)) / (stageCount - 1));
            node.height = Math.max(1, node.value * scale);
            node.y = y;
            y += node.height + gap;
        });
    };
    flow.stages.forEach(place);

    // Reorder each stage by where its neighbours sit (the value-weighted middle of the nodes it
    // connects to), sweeping right then left a few times. "Other" stays at the bottom.
    const centre = (node: FlowNode) => node.y + node.height / 2;
    const reorder = (stageIndex: number, towards: -1 | 1) => {
        const stage = flow.stages[stageIndex];
        const weight = new Map<FlowNode, { sum: number; total: number }>();
        flow.links.forEach((link) => {
            const here = towards === -1 ? link.target : link.source, there = towards === -1 ? link.source : link.target;
            if (here.stage !== stageIndex || there.stage !== stageIndex + towards) return;
            const entry = weight.get(here) || { sum: 0, total: 0 };
            entry.sum += centre(there) * link.value;
            entry.total += link.value;
            weight.set(here, entry);
        });
        const position = (node: FlowNode) => {
            const entry = weight.get(node);
            return entry && entry.total > 0 ? entry.sum / entry.total : centre(node);
        };
        stage.sort((a, b) => (a.name === OTHER_LABEL ? 1 : b.name === OTHER_LABEL ? -1 : position(a) - position(b)));
        place(stage, stageIndex);
    };
    for (let sweep = 0; sweep < 3; sweep++) {
        for (let i = 1; i < stageCount; i++) reorder(i, -1);
        for (let i = stageCount - 2; i >= 0; i--) reorder(i, 1);
    }

    // Ribbons leave and enter each node in the order of the node at their other end, then by colour.
    const colourOrder = (name: string) => flow.colourNames.indexOf(name);
    flow.stages.forEach((stage) => stage.forEach((node) => {
        let y = node.y;
        flow.links.filter((link) => link.source === node).sort((a, b) => a.target.y - b.target.y || colourOrder(a.colourBy) - colourOrder(b.colourBy)).forEach((link) => {
            link.thickness = Math.max(0.5, link.value * scale);
            link.sourceY = y;
            y += link.value * scale;
        });
        y = node.y;
        flow.links.filter((link) => link.target === node).sort((a, b) => a.source.y - b.source.y || colourOrder(a.colourBy) - colourOrder(b.colourBy)).forEach((link) => {
            link.targetY = y;
            y += link.value * scale;
        });
    }));
}
