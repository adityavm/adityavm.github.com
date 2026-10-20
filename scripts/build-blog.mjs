import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blogDir = path.join(root, "blog");
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

function render({ title, date, html, rel }) {
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
        <a href="${rel}" class="home" aria-label="home">←</a>
        <h1>${t}</h1>
        <time datetime="${date}">${date}</time>
      </header>
      <div class="content">
${html}
      </div>
    </article>
  </body>
</html>
`;
}

const files = (await readdir(blogDir)).filter((f) => f.endsWith(".md"));

for (const file of files) {
  const { meta, body } = parseFrontmatter(
    await readFile(path.join(blogDir, file), "utf8"),
  );
  if (!meta.slug) throw new Error(`${file}: missing slug`);

  const outDir = path.join(blogDir, meta.slug);
  const rel = path.relative(outDir, root).split(path.sep).join("/") + "/";
  const out = path.join(outDir, "index.html");

  await mkdir(outDir, { recursive: true });
  await writeFile(
    out,
    render({
      title: meta.title ?? file,
      date: meta.date ?? "",
      html: md.render(body),
      rel,
    }),
  );
  console.log(`${file} → ${path.relative(root, out)}`);
}
