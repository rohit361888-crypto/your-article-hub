import {copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY || process.argv[2];
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
  throw new Error('Set GITHUB_REPOSITORY or pass the repository as OWNER/NAME.');
}
const [owner,name] = repository.split('/');
const github = 'https://github.com/'+repository;
const token = process.env.GH_TOKEN;
const preview = process.argv.includes('--preview');
if (!token && !preview) throw new Error('GH_TOKEN is required for a production build.');

async function query(document,after) {
  const result = await fetch('https://api.github.com/graphql',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query:document,variables:{owner,name,after}})
  });
  const response = await result.json();
  if (!result.ok || response.errors) {
    throw new Error(response.errors?.map(error => error.message).join('\n') || `GitHub API status ${result.status}`);
  }
  if (!response.data.repository) throw new Error('Repository could not be accessed.');
  return response.data.repository;
}

async function readAll(field,selection) {
  const items = [];
  let after = null;
  do {
    const repo = await query(`query($owner:String!,$name:String!,$after:String) {
      repository(owner:$owner,name:$name) {
        ${field}(first:100,after:$after) {
          nodes { ${selection} }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,after);
    const connection = repo[field];
    items.push(...connection.nodes.filter(Boolean));
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while(after);
  return items;
}

const [categories,articles] = token && !preview ? await Promise.all([
  readAll('discussionCategories','name slug'),
  readAll('discussions','number title bodyText bodyHTML createdAt updatedAt url author { login } category { slug name }')
]) : [[],[]];

const discussionCategories = [...categories];
const articlePath = article => encodeURIComponent(article.slug ?? String(article.number));
const slugify = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'');

async function entries(folder) {
  try { return await readdir(folder,{withFileTypes:true}); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function renderMarkdown(markdown) {
  if (preview) return '<p>'+escape(markdown)+'</p>';
  const response = await fetch('https://api.github.com/markdown',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/vnd.github+json'},
    body:JSON.stringify({text:markdown,mode:'gfm',context:repository})
  });
  if (!response.ok) throw new Error('GitHub Markdown rendering failed with status '+response.status);
  return response.text();
}

function coverUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/'+name+'/cms-media/')) return '';
  const file = value.split('/').at(-1);
  if (!file || /[\\?#]/.test(file)) return '';
  return '/'+name+'/cms-media/'+encodeURIComponent(decodeURIComponent(file));
}

async function addCmsArticles() {
  for (const file of await entries('cms-articles')) {
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    const post = JSON.parse(await readFile('cms-articles/'+file.name,'utf8'));
    const categoryName = String(post.category || '').trim();
    const categorySlug = slugify(categoryName);
    const created = new Date(post.date);
    if (!post.title?.trim() || !post.body?.trim() || !post.description?.trim() || !categorySlug || !Number.isFinite(created.getTime())) {
      throw new Error('Missing title, description, category, date or article body in '+file.name);
    }
    let category = categories.find(item => item.slug === categorySlug || item.name.toLowerCase() === categoryName.toLowerCase());
    if (!category) {
      category = {name:categoryName,slug:categorySlug};
      categories.push(category);
    }
    articles.push({
      slug:'cms-'+file.name.slice(0,-5),
      title:post.title,
      bodyHTML:await renderMarkdown(post.body),
      description:post.description,
      createdAt:created.toISOString(),
      author:{login:post.author?.trim() || 'Your Article Hub'},
      cover:coverUrl(post.cover),
      coverAlt:post.coverAlt,
      category
    });
  }
}

const escape = value => String(value ?? '').replace(/[&<>"']/g,char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);
await addCmsArticles();
articles.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
categories.sort((a,b) => a.name.localeCompare(b.name));
const description = a => a.description || (a.bodyText.trim().split(/\n+/).find(Boolean) || '').slice(0,220);
const date = value => new Date(value).toLocaleDateString('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'});

function layout(title,content,root='./',summary='A public community journal.') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(summary)}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; media-src https:; base-uri 'none'; form-action 'none'">
  <title>${escape(title)} | Your Article Hub</title><link rel="stylesheet" href="${root}style.css"></head>
  <body><header><nav aria-label="Main navigation"><a class="brand" href="${root}"><span class="mark" aria-hidden="true">ah.</span>Your Article Hub</a>
  <div><a href="${root}#articles">Explore</a><a href="${root}#topics">Topics</a><a href="${root}admin.html">Editorial desk</a><a class="button" href="${root}write/">Write an article</a></div></nav></header>
  <main>${content}</main><footer><a href="${github}/discussions">Community on GitHub</a> · <a href="${github}/discussions/categories">Manage categories</a></footer></body></html>`;
}
function cards(items,root='./') {
  if (!items.length) return `<p class="empty">No articles published yet. <a href="${root}write/">Write an article</a>.</p>`;
  return '<div class="grid">'+items.map(a => `<article class="card"><div class="meta">${escape(a.category.name)}</div>
    <h3><a href="${root}articles/${articlePath(a)}/">${escape(a.title)}</a></h3><p>${escape(description(a))}</p>
    <div class="meta">${escape(a.author?.login || 'Community contributor')} · ${date(a.createdAt)}</div></article>`).join('')+'</div>';
}

const topicCards = categories.map(category => {
  const count = articles.filter(a => a.category.slug === category.slug).length;
  return `<a class="card topic" href="./topics/${encodeURIComponent(category.slug)}/">${escape(category.name)}
    <div class="meta">${count} ${count === 1 ? 'article' : 'articles'}</div></a>`;
}).join('');

async function save(path,html) {
  const dir = '_site/'+path;
  await mkdir(dir,{recursive:true});
  await writeFile(dir+'/index.html',html);
}

await save('',layout('Community journal',`<section class="hero"><div><div class="eyebrow">Community journal</div>
  <h1>Ideas worth sharing.<br><em>Stories worth reading.</em></h1>
  <p>Find something new to read or publish a story of your own.</p>
  <div class="actions"><a class="button" href="#articles">Explore articles</a><a class="button quiet" href="./write/">Write an article</a></div></div>
  <div class="illustration" aria-hidden="true"><div class="sheet">ah.<span></span><span></span><span></span></div></div></section>
  <section id="topics"><h2>Browse by topic</h2>${topicCards ? '<div class="grid">'+topicCards+'</div>' : '<p>Topics will appear when the journal is connected to GitHub Discussions.</p>'}</section>
  <section id="articles"><h2>Latest articles</h2>${cards(articles)}</section>`));

await save('write',layout('Write an article',`<div class="article"><div class="eyebrow">Editorial desk</div><h1>Write an article</h1>
  <p>Sign in to your GitHub account, choose a category and start a discussion. Your post appears on GitHub as soon as you publish. The journal updates after its next build.</p>
  <p>Enter a title and use the first paragraph for the description. Add images using the attachment control. Use Markdown headings, lists and links to structure the article. To link to another article on this website, paste its full URL.</p>
  <div class="actions"><a class="button" href="${github}/discussions/new/choose">Open GitHub editor</a>
  <a href="https://github.com/signup">Create a GitHub account</a></div></div>`,'../'));

for (const category of categories) {
  const topic = articles.filter(a => a.category.slug === category.slug);
  await save('topics/'+encodeURIComponent(category.slug),layout(category.name,`<section><h1>${escape(category.name)}</h1>${cards(topic,'../../')}</section>`,'../../'));
}

for (const a of articles) {
  // GitHub provides sanitized discussion HTML. The page also blocks scripts, frames and forms.
  await save('articles/'+articlePath(a),layout(a.title,`<article class="article"><div class="eyebrow">${escape(a.category.name)}</div>
    <h1>${escape(a.title)}</h1><div class="meta">${escape(a.author?.login || 'Community contributor')} · ${date(a.createdAt)}</div>
    ${a.cover ? '<img class="cover" src="'+escape(a.cover)+'" alt="'+escape(a.coverAlt)+'">' : ''}
    <div class="body">${a.bodyHTML}</div>
    ${a.url ? '<a class="button quiet" href="'+escape(a.url)+'">Open on GitHub</a>' : '<a href="../../">Back to articles</a>'}</article>`,'../../',description(a)));
}
await mkdir('_site/cms-media',{recursive:true});
for (const file of await entries('cms-media')) {
  if (file.isFile() && /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name)) {
    await copyFile('cms-media/'+file.name,'_site/cms-media/'+file.name);
  }
}
await copyFile('style.css','_site/style.css');
const admin = await readFile('admin.html','utf8');
const articleCategories = discussionCategories.sort((a,b) => a.name.localeCompare(b.name)).map(({slug,name}) =>
  '<option value="'+escape(slug)+'">'+escape(name)+'</option>').join('');
await writeFile('_site/admin.html',admin.replace('<!-- article categories -->',() => articleCategories));
await Promise.all(['admin.css','admin.js'].map(file => copyFile(file,'_site/'+file)));
await writeFile('_site/.nojekyll','');
console.log(`Built ${articles.length} articles and ${categories.length} topics for ${repository}.`);

