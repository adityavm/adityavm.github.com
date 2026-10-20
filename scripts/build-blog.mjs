import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writingDir = path.join(root, "writing");
const md = new MarkdownIt({ html: true, typographer: true }).use(footnote);

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

function render({ title, date, html, rel, back }) {
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
        <a href="${back}" class="home" aria-label="back">←</a>
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
  posts.push({ title, date, href: toHref(writingDir, outDir) });

  await mkdir(outDir, { recursive: true });
  await writeFile(
    out,
    render({
      title,
      date,
      html: md.render(body),
      rel: toHref(outDir, root),
      back: toHref(outDir, writingDir),
    }),
  );
  console.log(`${file} → ${path.relative(root, out)}`);
}

const list = posts
  .sort((a, b) => b.date.localeCompare(a.date))
  .map(
    (p) =>
      `<li><time datetime="${p.date}">${p.date}</time> <a href="${p.href}">${md.utils.escapeHtml(p.title)}</a></li>`,
  )
  .join("\n");

await writeFile(
  path.join(writingDir, "index.html"),
  render({
    title: "writing",
    html: `<ul class="posts">\n${list}\n</ul>`,
    rel: "../",
    back: "../",
  }),
);
console.log("writing/index.html");
