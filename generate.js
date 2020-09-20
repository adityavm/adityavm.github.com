const glob = require("glob");
const marked = require("marked");
const path = require("path");
const fs = require("fs");
const filemeta = require("file-metadata");
const dayjs = require("dayjs");
const _  = require("lodash");
const config = require("./config");

const cssPath = path.resolve(__dirname, "./common/common.css");
const indexPath = path.resolve(__dirname, "./index.html");
const blogroll = [];

// Create post pages
glob("./content/**/*.md", {}, (err, files) => {
  files.forEach(file => {
    const post = getPostFromFile(file);

    // For sidebar
    blogroll.push(post)
  });

  createIndexes(blogroll);
  blogroll.forEach((post, index) =>
    createLongformPage({ post, prev: blogroll[index - 1], next: blogroll[index + 1] })
  );
});

// //////////
// Helpers //
// //////////

// Create index
const createIndexes = posts => {
  const postsAsPages = posts.filter(p => !p.isShort).sort(sortByTime("desc")).reduce((acc, next) => {
    if (acc[acc.length - 1].length < config.latestPostsOnIndex) {
      acc[acc.length - 1].push(next);
    } else {
      acc.push([]);
    }
    return acc;
  }, [[]]);

  const shortFormList = posts.filter(p => p.isShort);
  const shortFormParents = _.uniq(shortFormList.map(p => p.parent));

  postsAsPages.forEach((page, pageNo) => {
    const outputHtml = `
      <html lang="en">
        <head>
          ${CommonHead}
        </head>
        <body>
          <div class="blog">
            <div class="blog--latest-posts">
              ${page.map(LongformTemplate).join("\n\n")}
            </div>
            ${shortFormList.length > 0
              ? (`
                <div class="blog--blogroll-sidebar">
                  <h2>Shortform</h2>
                  ${shortFormParents.map(post => (`
                    <div class="blog--blogroll-sidebar--segment">
                      <h3>${post}</h3>
                      <ul>
                        ${shortFormList.filter(p => p.parent === post).sort(sortByTime("desc")).slice(0, 3).map(short => `
                          <li class="shortform-post"><a href="${short.path}">${short.body.substr(0, 150)}</a></li>
                        `).join("")}
                      </ul>
                    </div>
                  `)).join("")}
                </div>
              `)
            : ""}
          </div>
        </body>
      </html>
    `;

    const outputPath = pageNo === 0 ? indexPath : path.resolve(path.resolve(__dirname, `page/${pageNo + 1}`), "index.html");
    fs.writeFileSync(outputPath, outputHtml, "utf8");
  });
};

const createLongformPage = ({ post, prev, next }) => {
  const outputHtml = `
    <html lang="en">
      <head>
        ${CommonHead}
      </head>
      <body>
        <div class="blog">
          <div class="blog--latest-posts">
            ${LongformTemplate(post)}
            <div class="blog--navigation">
              ${prev ? `<span class="prev-post">&larr;&nbsp;<a href="${prev.path}">${prev.title}</a>&nbsp;-&middot;-&nbsp;</span>` : ""}
              <span class="index"><a href="${indexPath}">Index</a></span>
              ${next ? `<span class="next-post">&nbsp;-&middot;-&nbsp;<a href="${next.path}">${next.title}</a>&nbsp;&rarr;</span>`: ""}
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  // Create post page
  fs.writeFileSync(post.path, outputHtml, "utf8");
}

const createShortformPage = ({ }) => {

};

const getPostFromFile = filePath => {
  const fileContents = fs.readFileSync(filePath, "utf8").trim();
  const fileMeta = filemeta.sync(filePath);
  const markdown = marked(fileContents, { gfm: true, smartypants: true });
  const target = path.resolve(path.dirname(filePath), "./index.html");
  const created = dayjs(fileMeta.dateAdded);
  const [, colours] = fileContents.match(/<meta name="colours" keywords="(.+)"\s?\/>/) || [];

  return {
    created,
    path: target,
    parent: path.dirname(filePath).split(path.sep).pop(),
    isShort: filePath.match(/shortform/) !== null,
    body: fileContents,
    markdown,
    title: (markdown.match(/\<h1 .+\>(.+)\<\/h1\>/) || [])[1],
    colours: colours ? colours.split(",").map(c => `#${c}`) : [],
  };
};

// //////////
// Helpers //
// //////////

const sortByTime = (type = "asc") => (a, b) => (
  a.created.unix() < b.created.unix()
    ? type === "asc" ? -1 : 1
    : type === "asc" ? 1 : -1
);

const hexToRgb = hex => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    }
    : null;
}

// ////////////
// Constants //
// ////////////

const CommonHead = `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
  <link href="https://fonts.googleapis.com/css?family=Roboto:400,400i|PT+Serif" rel="stylesheet">
  <link rel="stylesheet" href="${cssPath}" />
`;

const LongformTemplate = post => {
  const dateCreated = `${post.created.format("D MMM")} &lsquo;${post.created.format("YY")}`;
  const hasColours = post.colours.length > 0;

  return `
    <div
      class="blog--post ${hasColours ? "has-colours" : ""}"
      style="${post.colours.map((c, i) => `--accent-${i}: ${c}; --accent-${i}-rgb: ${Object.values(hexToRgb(c))};`)}"
    >
      <div class="post-colours">${post.colours.map(c => `<span style="background-color: ${c}"></span>`).join("")}</div>
      <a class="date" href="${post.path}">${dateCreated}</a>
      <div class="blog--post--body" lang="en">
        ${post.markdown}
      </div>
    </div>
  `;
};
