import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

// Run a command, ignoring its stdin, and resolve with trimmed stdout.
function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    // stdin must be "ignore": with a connected stdin, `pi --print` waits for
    // input instead of running the one-shot prompt and exiting.
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writingDir = path.join(root, "writing");
const md = new MarkdownIt({ html: true, typographer: true }).use(footnote);

const CATEGORIES = {
  longform: { slug: "longform", label: "longform" },
  "link-list": { slug: "links", label: "links" },
};
// Classify posts with claude-haiku through pi's model gateway (pi.dev).
const PI_BIN = process.env.PI_BIN ?? "pi";
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL ?? "claude-haiku-5-5";

// Ask claude-haiku (via `pi --print`) to classify a post as `longform`
// or `link-list`.
// `longform` = a substantial essay/article; `link-list` = a short post,
// typically a quick note or mostly a pointer to a link.
async function classify({ title, body }) {
  const prompt = `You are categorizing a blog post into exactly one of two categories:
- "longform": a substantial essay or article with developed prose.
- "link-list": a short post, a quick note, a brief aside, or mostly a pointer to an external link.

Respond with ONLY the category name, nothing else.

Title: ${title}

Post:
${body.slice(0, 4000)}`;

  // Print mode writes only the final assistant text to stdout; --no-session
  // keeps the call ephemeral so it does not pollute session history.
  // Strip PI_SESSION_* so a nested `pi` does not try to attach to a parent
  // pi session (relevant when the build runs from inside a pi session).
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("PI_SESSION")) delete env[key];
  }
  const stdout = await run(
    PI_BIN,
    ["--print", "--no-session", "--model", CLASSIFY_MODEL, prompt],
    env,
  );
  const text = stdout.toLowerCase();
  // Be lenient about how the model phrases its answer.
  if (text.includes("link-list") || text.includes("link list")) return "link-list";
  if (text.includes("longform") || text.includes("long form")) return "longform";
  throw new Error(`could not parse category from model output: ${stdout.trim()}`);
}

// Insert a `category:` line into existing frontmatter so we never re-query.
async function persistCategory(file, category) {
  const abs = path.join(writingDir, file);
  const src = await readFile(abs, "utf8");
  const match = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file}: cannot persist category, no frontmatter`);
  const updated =
    `---\n${match[1]}\ncategory: ${category}\n---\n` + src.slice(match[0].length);
  await writeFile(abs, updated);
}

function parseFrontmatter(src) {
  const match = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, body: src };
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const i = line.indexOf(":");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  return { meta, body: src.slice(match[0].length) };
}

function render({ title, date, html, rel, links }) {
  const t = md.utils.escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${t} / aditya mukherjee</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="${rel}css/colors.css" rel="stylesheet" />
    <link href="${rel}css/blog.css" rel="stylesheet" />
  </head>
  <body>
    <article class="post">
      <header>
        <nav>
          ${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("\n          ")}
        </nav>
        <h1>${t}</h1>
        ${date ? `<time datetime="${date}">${date}</time>` : ""}
      </header>
      <div class="content">
${html}
      </div>
    </article>
  </body>
</html>
`;
}

const toHref = (from, to) =>
  path.relative(from, to).split(path.sep).join("/") + "/";
const files = (await readdir(writingDir)).filter((f) => f.endsWith(".md"));
const posts = [];

for (const file of files) {
  const { meta, body } = parseFrontmatter(
    await readFile(path.join(writingDir, file), "utf8"),
  );
  if (!meta.slug) throw new Error(`${file}: missing slug`);

  const outDir = path.join(writingDir, meta.slug);
  const out = path.join(outDir, "index.html");
  const title = meta.title ?? file;
  const date = meta.date ?? "";

  // Classify new posts via the LLM, then cache the result in frontmatter.
  let category = meta.category;
  if (!category) {
    category = await classify({ title, body });
    await persistCategory(file, category);
    console.log(`${file} → classified as ${category}`);
  } else if (!CATEGORIES[category]) {
    throw new Error(`${file}: unknown category "${category}"`);
  }

  posts.push({ title, date, category, href: toHref(writingDir, outDir) });

  await mkdir(outDir, { recursive: true });
  await writeFile(
    out,
    render({
      title,
      date,
      html: md.render(body),
      rel: toHref(outDir, root),
      links: [
        [toHref(outDir, root), "home"],
        [toHref(outDir, writingDir), "writing"],
      ],
    }),
  );
  console.log(`${file} → ${path.relative(root, out)}`);
}

posts.sort((a, b) => b.date.localeCompare(a.date));

const listItems = (items, relPrefix = "") =>
  items
    .map((p) => {
      const mark = p.category === "link-list" ? ' <span class="ext" title="short post">\u2014</span>' : "";
      return `<li><time datetime="${p.date}">${p.date}</time> <a href="${relPrefix}${p.href}">${md.utils.escapeHtml(p.title)}${mark}</a></li>`;
    })
    .join("\n");

// Per-category list pages, one directory deeper than writing/.
for (const [category, { slug, label }] of Object.entries(CATEGORIES)) {
  const items = posts.filter((p) => p.category === category);
  const outDir = path.join(writingDir, slug);
  await mkdir(outDir, { recursive: true });
  const others = Object.entries(CATEGORIES)
    .filter(([c]) => c !== category)
    .map(([, o]) => `<a href="../${o.slug}/">${o.label}</a>`)
    .join(" · ");
  const body =
    (items.length
      ? `<ul class="posts">\n${listItems(items, "../")}\n</ul>`
      : `<p>Nothing here yet.</p>`) + `\n<p class="categories"><span class="label">also:</span> ${others}</p>`;
  await writeFile(
    path.join(outDir, "index.html"),
    render({
      title: label,
      html: body,
      rel: "../../",
      links: [
        ["../../", "home"],
        ["../", "writing"],
      ],
    }),
  );
  console.log(`writing/${slug}/index.html`);
}

// Main writing index: links to both category pages.
const nav = Object.values(CATEGORIES)
  .map(({ slug, label }) => `<a href="${slug}/">${label}</a>`)
  .join(" · ");
await writeFile(
  path.join(writingDir, "index.html"),
  render({
    title: "writing",
    html: `<p class="categories">${nav}</p>\n<ul class="posts">\n${listItems(posts)}\n</ul>`,
    rel: "../",
    links: [["../", "home"]],
  }),
);
console.log("writing/index.html");
