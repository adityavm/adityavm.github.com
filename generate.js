const glob = require("glob");
const marked = require("marked");
const path = require("path");
const fs = require("fs");
const filemeta = require("file-metadata");
const dayjs = require("dayjs");
const smartypants = require("smartypants");
const config = require("./config");

const cssPath = path.resolve(__dirname, "./common/style.css");
const indexPath = path.resolve(__dirname, "./index.html");
const blogroll = [];

// Create post pages
glob("./content/**/*.md", {}, (err, files) => {
  files.forEach(file => {
    const post = getPostFromFile(file);

    // For sidebar
    blogroll.push(post)
  });

  createIndex(blogroll);
  blogroll.forEach((post, index) =>
    createPostPage({ post, prev: blogroll[index - 1], next: blogroll[index + 1] })
  );

});

// //////////
// Helpers //
// //////////

// Create index
const createIndex = posts => {
  const latestPosts = posts.sort((a, b) => a.created.unix() > b.created.unix() ? 1 : -1).slice(0, config.latestPostsOnIndex);

  const outputHtml = `
    <html lang="en">
      <head>
        ${CommonHead}
      </head>
      <body>
        <div class="blog">
          <div class="blog--latest-posts">
            ${latestPosts.map(post => {
              const dateCreated = `${post.created.format("D MMM")} &lsquo;${post.created.format("YY")}`;

              return `
                <div class="blog--post">
                  <span class="date">${dateCreated}</span>
                  ${post.markdown}
                </div>
              `;
            }).join("\n\n")}
          </div>
          <div class="blog--blogroll-sidebar">
            <ul>
              ${blogroll.map(post => (
                `<li><a href="${post.path}">${post.title}</a></li>`
              )).join("")}
            </ul>
          </div>
        </div>
      </body>
    </html>
  `;

  fs.writeFileSync(indexPath, outputHtml, "utf8");
};

const createPostPage = ({ post, prev, next }) => {
  const dateCreated = `${post.created.format("D MMM")} &lsquo;${post.created.format("YY")}`;

  const outputHtml = `
    <html lang="en">
      <head>
        ${CommonHead}
      </head>
      <body>
        <div class="blog-index">
          <div class="blog--latest-posts">
            <span class="date">${dateCreated}</span>
            ${post.markdown}
            <div class="blog--navigation">
              ${prev ? `<span class="prev-post">&larr;&nbsp;<a href="${prev.path}">${prev.title}</a>&nbsp;&middot;&nbsp;</span>` : ""}
              <span class="index"><a href="${indexPath}">Index</a></span>
              ${next ? `<span class="next-post">&nbsp;&middot;&nbsp;<a href="${next.path}">${next.title}</a>&nbsp;&rarr;</span>`: ""}
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  // Create post page
  fs.writeFileSync(post.path, outputHtml, "utf8");
}

const getPostFromFile = filePath => {
  const fileContents = fs.readFileSync(filePath, "utf8");
  const fileMeta = filemeta.sync(filePath);
  const markdown = marked(smartypants.smartypants(fileContents));
  const target = path.resolve(path.dirname(filePath), "./index.html");
  const created = dayjs(fileMeta.dateAdded);

  return {
    created,
    path: target,
    body: fileContents,
    markdown,
    title: markdown.match(/\<h1 .+\>(.+)\<\/h1\>/)[1],
  };
};

// ////////////
// Constants //
// ////////////

const CommonHead = `
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css?family=Cabin|Roboto:400,400i" rel="stylesheet">
  <link rel="stylesheet" href="${cssPath}" />
`
