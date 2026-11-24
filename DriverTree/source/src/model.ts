"use strict";

export type Operator = "+" | "-" | "x" | "/" | "";

export interface RawNode {
    /** Row in the data, which is also its selection key. */
    index: number;
    name: string;
    parent: string | null;
    operator: string | null;
    order: number | null;
    format: string | null;
    actual: number | null;
    plan: number | null;
    previousYear: number | null;
}

export interface TreeNode extends RawNode {
    sign: Operator;
    /** True when more of this driver is bad news: it is subtracted, or feeds something that is. */
    costLike: boolean;
    /** 0 for the driver at the top, 1 for what feeds it, and so on. */
    depth: number;
    /** Vertical position, counted in leaves: a parent sits midway between its first and last child. */
    row: number;
    children: TreeNode[];
}

export interface Tree {
    roots: TreeNode[];
    /** Every driver, parents before their children. */
    nodes: TreeNode[];
    /** How many levels deep the tree goes. */
    levels: number;
    leaves: number;
}

/** Reads an operator however it was typed: "+", "plus", "x", "*", "times", "/", "per" and so on. */
export function parseOperator(raw: string | null): Operator {
    const text = (raw || "").trim().toLowerCase();
    if (["+", "add", "plus", "sum"].indexOf(text) >= 0) return "+";
    if (["-", "−", "–", "minus", "less", "subtract"].indexOf(text) >= 0) return "-";
    if (["x", "×", "*", "times", "multiply"].indexOf(text) >= 0) return "x";
    if (["/", "÷", "divide", "divided by", "per"].indexOf(text) >= 0) return "/";
    return "";
}

const keyOf = (name: string | null): string => (name || "").trim().toLowerCase();

/**
 * Links each driver to its parent by name. A driver whose parent is blank, missing or itself
 * starts a tree of its own; a loop (A feeds B feeds A) is cut at the first driver met.
 */
export function buildTree(raw: RawNode[]): Tree {
    const nodes: TreeNode[] = raw.map((line) => ({ ...line, sign: parseOperator(line.operator), costLike: false, depth: 0, row: 0, children: [] }));
    const byName = new Map<string, TreeNode>();
    nodes.forEach((node) => {
        if (!byName.has(keyOf(node.name))) byName.set(keyOf(node.name), node);
    });
    const inOrder = (a: TreeNode, b: TreeNode) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.index - b.index;
    const roots: TreeNode[] = [];
    nodes.forEach((node) => {
        const parent = node.parent === null ? undefined : byName.get(keyOf(node.parent));
        if (parent && parent !== node) parent.children.push(node);
        else roots.push(node);
    });
    nodes.forEach((node) => node.children.sort(inOrder));
    roots.sort(inOrder);

    const tree: Tree = { roots: [], nodes: [], levels: 0, leaves: 0 };
    const seen = new Set<TreeNode>();
    const place = (node: TreeNode, depth: number, parentCostLike: boolean): void => {
        seen.add(node);
        tree.nodes.push(node);
        node.depth = depth;
        node.costLike = parentCostLike !== (node.sign === "-");
        tree.levels = Math.max(tree.levels, depth + 1);
        node.children = node.children.filter((child) => !seen.has(child));
        node.children.forEach((child) => place(child, depth + 1, node.costLike));
        if (node.children.length === 0) node.row = tree.leaves++;
        else node.row = (node.children[0].row + node.children[node.children.length - 1].row) / 2;
    };
    const start = (node: TreeNode): void => {
        tree.roots.push(node);
        node.sign = "";
        place(node, 0, false);
    };
    roots.forEach(start);
    // Whatever is left is caught in a loop, with no way in from the top.
    nodes.slice().sort(inOrder).forEach((node) => {
        if (!seen.has(node)) start(node);
    });
    return tree;
}
