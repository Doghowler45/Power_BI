"use strict";

import countryIndex from "./data/countryIndex.json";

export interface Country {
    /** Display name, e.g. "New Zealand". */
    name: string;
    /** ISO 3166-1 numeric code as a zero-padded string; matches the map shapes. May be empty. */
    id: string;
    lon: number;
    lat: number;
}

interface IndexEntry {
    n: string;
    o: string;
    i: string;
    c2: string;
    c3: string;
    ll: [number, number];
    m: string[];
    a: string[];
}

/** Lower-cases, strips accents and punctuation so "Côte d'Ivoire" and "cote d ivoire" match. */
export function normalise(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/^the /, "");
}

function buildLookup(): Map<string, Country> {
    const entries = countryIndex as IndexEntry[];
    const countries: Country[] = entries.map((e) => ({ name: e.n, id: e.i, lon: e.ll[0], lat: e.ll[1] }));
    const lookup = new Map<string, Country>();
    const add = (key: string, country: Country) => {
        const k = normalise(key);
        if (k && !lookup.has(k)) lookup.set(k, country);
    };
    // Earlier passes win, so a common name is never displaced by another country's alias.
    entries.forEach((e, i) => add(e.n, countries[i]));
    entries.forEach((e, i) => e.m.forEach((alias) => add(alias, countries[i])));
    entries.forEach((e, i) => add(e.o, countries[i]));
    entries.forEach((e, i) => add(e.c3, countries[i]));
    entries.forEach((e, i) => add(e.c2, countries[i]));
    entries.forEach((e, i) => e.a.forEach((alias) => add(alias, countries[i])));
    return lookup;
}

const lookup = buildLookup();

/** Resolves a country name, common alias or ISO alpha-2 / alpha-3 code. */
export function findCountry(text: string): Country | undefined {
    return lookup.get(normalise(text));
}
