import { XMLParser } from "fast-xml-parser";
import { readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";

const RSS_URL = "https://thaolaptrinh.com/feed.xml";
const README_PATH = new URL("../README.md", import.meta.url).pathname;
const START_MARKER = "<!-- ARTICLES-LIST:START -->";
const END_MARKER = "<!-- ARTICLES-LIST:END -->";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        fetchUrl(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function formatDate(pubDate) {
  const date = new Date(pubDate);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function main() {
  console.log("Fetching RSS feed...");
  const xml = await fetchUrl(RSS_URL);

  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
  });
  const result = parser.parse(xml);

  const raw = result.rss?.channel?.item;
  if (!raw) {
    console.log("No items found in feed.");
    return;
  }
  const items = [raw].flat();

  const lines = items.map((item) => {
    const title = item.title?.__cdata ?? item.title ?? "(no title)";
    const link = item.link ?? "";
    const date = item.pubDate ? formatDate(item.pubDate) : "N/A";
    return `- [${title.trim()}](${link}) — ${date}`;
  });

  const block = `${START_MARKER}\n${lines.join("\n")}\n${END_MARKER}`;

  const readme = readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found in README.md");
    process.exit(1);
  }

  const updated =
    readme.slice(0, startIdx) +
    block +
    readme.slice(endIdx + END_MARKER.length);

  if (updated === readme) {
    console.log("No changes detected.");
    return;
  }

  writeFileSync(README_PATH, updated, "utf8");
  console.log(`Updated README.md with ${lines.length} article(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
