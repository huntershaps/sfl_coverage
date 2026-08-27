/**
 * Overflow check across viewport widths.
 *
 * Catches the class of bug where a grid's fixed columns need more room than the
 * breakpoint that switches them on — the content then spills into the next
 * column instead of wrapping, which looks broken rather than tight.
 *
 *   node scripts/check-responsive.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const token = fs.readFileSync("data/tmp.txt", "utf8").trim();
const BASE = "http://localhost:4310";

const WIDTHS = [375, 414, 768, 1024, 1180, 1280, 1440, 1728];
const PAGES = [
  "/dashboard",
  "/events",
  "/events?view=list",
  "/calendar",
  "/venues",
  "/requests",
  "/schedule",
  "/admin/events",
  "/admin/approvals",
  "/admin/backups",
  "/admin/contributors",
];

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([
  { name: "sfi_session", value: token, domain: "localhost", path: "/" },
]);
const page = await ctx.newPage();

let problems = 0;
let checks = 0;

for (const path of PAGES) {
  const bad = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(120);

    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      // Horizontal page scroll is the clearest sign something overflowed.
      const pageOverflow = doc.scrollWidth - doc.clientWidth;

      // Elements spilling outside the viewport, ignoring anything that opted
      // into its own horizontal scroll.
      const overflowing = [];
      const vw = doc.clientWidth;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
        if (cs.position === "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 2 || r.left < -2) {
          let scrollableAncestor = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const pcs = getComputedStyle(p);
            if (pcs.overflowX === "auto" || pcs.overflowX === "scroll") {
              scrollableAncestor = true;
              break;
            }
          }
          if (scrollableAncestor) continue;
          overflowing.push(
            `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`.slice(0, 70),
          );
        }
      }
      return { pageOverflow, overflowing: [...new Set(overflowing)].slice(0, 3) };
    });

    checks++;
    if (result.pageOverflow > 2 || result.overflowing.length) {
      bad.push(
        `${width}px: ${result.pageOverflow > 2 ? `page scrolls ${result.pageOverflow}px` : ""}${
          result.overflowing.length ? ` [${result.overflowing.join(", ")}]` : ""
        }`,
      );
    }
  }

  if (bad.length) {
    problems += bad.length;
    console.log(`  \x1b[31m✗\x1b[0m ${path}`);
    for (const b of bad) console.log(`      ${b}`);
  } else {
    console.log(`  \x1b[32m✓\x1b[0m ${path}  \x1b[2m${WIDTHS.length} widths clean\x1b[0m`);
  }
}

await browser.close();
console.log(
  `\n${problems === 0 ? `\x1b[32mAll ${checks} viewport checks clean.\x1b[0m` : `\x1b[31m${problems} of ${checks} checks overflowed.\x1b[0m`}\n`,
);
process.exit(problems ? 1 : 0);
