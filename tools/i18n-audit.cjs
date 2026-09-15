// i18n key audit: find defined-but-unused and used-but-undefined keys.
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../client.js", "utf8");

const defined = new Set();
// keys are written as  "key": "value"  or  nav: "value"
for (const m of src.matchAll(/^\t{3}"([A-Za-z][\w.]*)":/gm)) defined.add(m[1]);
for (const m of src.matchAll(/^\t{3}(nav):/gm)) defined.add(m[1]);

const used = new Set();
// direct literals: t("key"), tr("key"), tRef.current("key")
for (const m of src.matchAll(/\b(?:t|tr)\(\s*"([A-Za-z][\w.]*)"/g)) used.add(m[1]);
for (const m of src.matchAll(/tRef\.current\(\s*"([A-Za-z][\w.]*)"/g)) used.add(m[1]);
// prefixed lookups: t("group." + key) / t("win." + w.key) / t("patch." + p.id)
for (const m of src.matchAll(/\b(?:t|tr)\(\s*"(group|win|patch|metric)\."\s*\+/g)) {
	used.add(m[1] + ".*");
	used.delete(m[1] + ".");
}
// keys passed as data (aria-label etc.) that are still translations
for (const m of src.matchAll(/"(win\.(?:hide|bin))"/g)) used.add(m[1]);

const unused = [...defined].filter((k) => !used.has(k) && !used.has(k.split(".")[0] + ".*"));
const missing = [...used].filter((k) => !k.endsWith(".*") && !defined.has(k));

console.log("defined:", defined.size, "| used:", used.size);
console.log("DEFINED BUT UNUSED:", unused.length ? unused.join(", ") : "(none)");
console.log("USED BUT UNDEFINED:", missing.length ? missing.join(", ") : "(none)");

// also verify zh and en have identical key sets
const zhBlock = src.slice(src.indexOf("\t\tconst zh = {"), src.indexOf("\t\tconst en = {"));
const enBlock = src.slice(src.indexOf("\t\tconst en = {"), src.indexOf("\t\tconst CSS ="));
const keySet = (b) => new Set([...b.matchAll(/^\t{3}"?([A-Za-z][\w.]*)"?:/gm)].map((m) => m[1]));
const kz = keySet(zhBlock), ke = keySet(enBlock);
const onlyZh = [...kz].filter((k) => !ke.has(k));
const onlyEn = [...ke].filter((k) => !kz.has(k));
console.log("zh keys:", kz.size, "| en keys:", ke.size);
console.log("ONLY IN ZH:", onlyZh.length ? onlyZh.join(", ") : "(none)");
console.log("ONLY IN EN:", onlyEn.length ? onlyEn.join(", ") : "(none)");
