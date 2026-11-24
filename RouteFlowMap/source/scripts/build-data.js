// Builds src/data/countryIndex.json: a slim country lookup (names, codes, aliases, centre point)
// derived from the world-countries package. Run with: node scripts/build-data.js
const fs = require("fs");
const path = require("path");

const source = require(path.join(__dirname, "..", "node_modules", "world-countries", "countries.json"));

// Extra spellings people commonly use in finance and trade data, keyed by ISO alpha-3 code.
const manualAliases = {
    USA: ["USA", "US", "U.S.", "U.S.A.", "United States of America", "America"],
    GBR: ["UK", "U.K.", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland"],
    KOR: ["Korea", "Republic of Korea", "Korea, Republic of", "Korea South", "S. Korea", "Korea (South)"],
    PRK: ["Korea, Democratic People's Republic of", "DPRK", "Korea North", "Korea (North)"],
    RUS: ["Russian Federation"],
    VNM: ["Viet Nam"],
    CZE: ["Czech Republic", "Czechia"],
    CIV: ["Ivory Coast", "Cote d'Ivoire"],
    MMR: ["Burma", "Myanmar"],
    NLD: ["Holland", "The Netherlands"],
    MAC: ["Macau", "Macao", "Macao SAR", "Macau SAR"],
    HKG: ["Hong Kong SAR", "Hong Kong SAR China", "Hong Kong, China"],
    TWN: ["Chinese Taipei", "Taiwan, Province of China", "Taiwan, China"],
    CHN: ["PRC", "Mainland China", "People's Republic of China", "China Mainland"],
    TUR: ["Turkey", "Turkiye"],
    SWZ: ["Swaziland", "Eswatini"],
    CPV: ["Cape Verde", "Cabo Verde"],
    TLS: ["East Timor", "Timor Leste"],
    LAO: ["Laos", "Lao PDR", "Lao People's Democratic Republic"],
    BRN: ["Brunei Darussalam"],
    SYR: ["Syrian Arab Republic"],
    IRN: ["Iran, Islamic Republic of"],
    TZA: ["Tanzania, United Republic of"],
    BOL: ["Bolivia, Plurinational State of"],
    VEN: ["Venezuela, Bolivarian Republic of"],
    MDA: ["Moldova, Republic of"],
    FSM: ["Micronesia, Federated States of", "Federated States of Micronesia"],
    COD: ["DRC", "DR Congo", "Democratic Republic of the Congo", "Congo, Democratic Republic of the", "Congo (Kinshasa)", "Congo-Kinshasa"],
    COG: ["Congo", "Republic of the Congo", "Congo (Brazzaville)", "Congo-Brazzaville"],
    ARE: ["UAE", "U.A.E.", "Emirates"],
    SAU: ["KSA", "Kingdom of Saudi Arabia"],
    MKD: ["Macedonia", "FYROM"],
    PSE: ["Palestinian Territories", "West Bank and Gaza", "State of Palestine", "Palestine, State of"],
    BHS: ["The Bahamas"],
    GMB: ["The Gambia"],
    VAT: ["Vatican", "Holy See"],
    NZL: ["Aotearoa", "Aotearoa New Zealand"],
};

const index = source
    .filter((c) => Array.isArray(c.latlng) && c.latlng.length === 2)
    .map((c) => ({
        n: c.name.common,
        o: c.name.official,
        i: c.ccn3 || "",
        c2: c.cca2 || "",
        c3: c.cca3 || "",
        ll: [Math.round(c.latlng[1] * 100) / 100, Math.round(c.latlng[0] * 100) / 100],
        m: manualAliases[c.cca3] || [],
        a: (c.altSpellings || []).filter((s) => s && s.length > 3),
    }))
    .sort((a, b) => a.n.localeCompare(b.n));

const missing = Object.keys(manualAliases).filter((code) => !index.some((c) => c.c3 === code));
if (missing.length) throw new Error("Manual aliases reference unknown codes: " + missing.join(", "));

const outDir = path.join(__dirname, "..", "src", "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "countryIndex.json"), JSON.stringify(index), "utf8");
console.log(`countryIndex.json: ${index.length} countries`);
