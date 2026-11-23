const owner = 'rohit361888-crypto';
const repository = 'your-article-hub';
const repoUrl = 'https://github.com/' + owner + '/' + repository;
const endpoint = 'https://api.github.com/graphql';
const draftKey = 'your-article-hub-editor-draft';
const marker = '<!-- article-hub-description -->\n';
const byId = id => document.getElementById(id);
const title = byId('title');
const description = byId('description');
const content = byId('content');
const category = byId('category');
const publish = byId('publish');
const status = byId('publish-status');
const resultLink = byId('result-link');
const connection = byId('connection-status');
const connect = byId('connect');
const disconnect = byId('disconnect');
const older = byId('older');
const list = byId('article-list');
let token = '';
let repoId = '';
let cursor = null;
let editing = null;
let busy = false;
let draftCategory = '';

byId('categories-link').href = repoUrl + '/discussions/categories';
byId('native-editor').href = repoUrl + '/discussions/new/choose';

async function github(query, variables = {}) {
  const response = await fetch(endpoint,{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query,variables})
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.map(error => error.message).join(' ') ||
      result.message || 'GitHub returned HTTP '+response.status+'.');
  }
  return result.data;
}

function draft() {
  try { return JSON.parse(localStorage.getItem(draftKey) || '{}') || {}; }
  catch { return {}; }
}

function setStory(story = {}) {
  title.value = story.title || '';
  description.value = story.description || '';
  content.value = story.content || '';
  draftCategory = story.category || '';
  if (category.querySelector('option[value="'+CSS.escape(draftCategory)+'"]')) category.value = draftCategory;
  else category.selectedIndex = 0;
  status.textContent = '';
  resultLink.hidden = true;
  refreshPreview();
}
setStory(draft());

function resetConnection() {
  token = '';
  repoId = '';
  editing = null;
  cursor = null;
  category.replaceChildren(new Option('Connect to load categories',''));
  category.disabled = true;
  publish.disabled = true;
  publish.textContent = 'Publish article';
  byId('editor-heading').textContent = 'Start a new story.';
  byId('new-story').hidden = true;
  connect.hidden = false;
  disconnect.hidden = true;
  older.hidden = true;
  list.replaceChildren();
  byId('article-status').textContent = 'Connect to GitHub to load articles.';
  setStory(draft());
}

connect.addEventListener('submit',async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const input = byId('token');
  token = input.value.trim();
  input.value = '';
  connect.querySelector('button').disabled = true;
  connection.textContent = 'Connecting to GitHub…';
  try {
    const data = await github(
      'query($owner:String!,$name:String!){viewer{login} repository(owner:$owner,name:$name){id discussionCategories(first:100){nodes{id name}}}}',
      {owner,name:repository}
    );
    if (data.viewer.login.toLowerCase() !== owner) {
      throw new Error('This token belongs to '+data.viewer.login+'. Use a token from '+owner+'.');
    }
    if (!data.repository) throw new Error('This token cannot access '+repository+'.');
    repoId = data.repository.id;
    const options = data.repository.discussionCategories.nodes.map(item => new Option(item.name,item.id));
    category.replaceChildren(new Option('Choose a category',''),...options);
    if (options.some(option => option.value === draftCategory)) category.value = draftCategory;
    category.disabled = false;
    publish.disabled = false;
    connect.hidden = true;
    disconnect.hidden = false;
    connection.textContent = 'Connected as '+data.viewer.login+'.';
    await loadArticles(true);
  } catch(error) {
    resetConnection();
    connection.textContent = error.message;
  } finally {
    busy = false;
    connect.querySelector('button').disabled = false;
  }
});

disconnect.addEventListener('click',() => {
  if (busy) return;
  resetConnection();
  connection.textContent = 'Disconnected.';
});

async function loadArticles(reset = false) {
  const articleStatus = byId('article-status');
  older.disabled = true;
  try {
    const data = await github(
      'query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){discussions(first:25,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){nodes{id title body url category{id}} pageInfo{hasNextPage endCursor}}}}',
      {owner,name:repository,after:reset ? null : cursor}
    );
    const {nodes,pageInfo} = data.repository.discussions;
    if (reset) list.replaceChildren();
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    older.hidden = !cursor;
    for (const story of nodes) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = story.url;
      link.textContent = story.title;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet';
      button.textContent = 'Edit';
      button.addEventListener('click',() => {
        if (busy) return;
        editing = story.id;
        const parts = story.body.startsWith(marker) ? story.body.slice(marker.length).split(/\n\n(.*)/s) : [];
        setStory({
          title:story.title,
          description:parts[0]?.replace(/\\([\\*_\x60~\[\]<>#!|])/g,'$1'),
          content:parts.length ? parts[1] : story.body,
          category:story.category.id
        });
        publish.textContent = 'Save changes';
        byId('editor-heading').textContent = 'Edit article.';
        byId('new-story').hidden = false;
        title.focus();
      });
      row.append(link,button);
      list.append(row);
    }
    articleStatus.textContent = list.children.length ? '' : 'No articles published yet.';
  } catch(error) {
    articleStatus.textContent = 'Could not load articles. '+error.message;
  } finally { older.disabled = false; }
}

older.addEventListener('click',async () => {
  if (busy) return;
  busy = true;
  try { await loadArticles(); }
  finally { busy = false; }
});

byId('new-story').addEventListener('click',() => {
  if (busy) return;
  editing = null;
  setStory(draft());
  byId('editor-heading').textContent = 'Start a new story.';
  publish.textContent = 'Publish article';
  byId('new-story').hidden = true;
  title.focus();
});

byId('save-draft').addEventListener('click',() => {
  if (editing) {
    status.textContent = 'Editing a published article. Use Save changes to update it.';
    return;
  }
  try {
    localStorage.setItem(draftKey,JSON.stringify({
      title:title.value,description:description.value,content:content.value,category:category.value || draftCategory
    }));
    status.textContent = 'Draft saved in this browser.';
  } catch { status.textContent = 'This browser could not save the draft.'; }
});

function refreshPreview() {
  byId('preview-title').textContent = title.value || 'Untitled article';
  byId('preview-description').textContent = description.value;
  byId('preview-body').textContent = content.value;
}

byId('preview-button').addEventListener('click',event => {
  const preview = byId('preview');
  preview.hidden = !preview.hidden;
  event.target.setAttribute('aria-expanded',String(!preview.hidden));
  refreshPreview();
});
byId('article').addEventListener('input',refreshPreview);

for (const button of document.querySelectorAll('[data-format]')) {
  button.addEventListener('click',() => {
    const start = content.selectionStart;
    const end = content.selectionEnd;
    const selected = content.value.slice(start,end);
    const formats = {
      heading:'\n## '+(selected || 'Heading')+'\n',
      bold:'**'+(selected || 'bold text')+'**',
      italic:'*'+(selected || 'italic text')+'*',
      list:'\n- '+(selected || 'List item').replaceAll('\n','\n- ')+'\n',
      link:'['+(selected || 'Link text')+'](https://example.com)',
      image:'!['+(selected || 'Image description')+'](https://example.com/image.jpg)'
    };
    content.setRangeText(formats[button.dataset.format],start,end,'select');
    content.focus();
    refreshPreview();
  });
}

byId('article').addEventListener('submit',async event => {
  event.preventDefault();
  if (!repoId || busy) return;
  const headline = title.value.trim();
  const article = content.value.trim();
  const summary = description.value.trim().replace(/\s+/g,' ').replace(/[\\*_\x60~\[\]<>#!|]/g,'\\$&');
  if (!headline || !article || !category.value) {
    status.textContent = 'Enter a title, category and article body.';
    return;
  }
  const body = summary ? marker+summary+'\n\n'+article : article;
  const fields = {title:headline,body,categoryId:category.value};
  busy = true;
  publish.disabled = true;
  resultLink.hidden = true;
  status.textContent = editing ? 'Saving changes…' : 'Publishing to GitHub…';
  const updating = Boolean(editing);
  try {
    const data = updating
      ? await github('mutation($input:UpdateDiscussionInput!){updateDiscussion(input:$input){discussion{id url}}}',
        {input:{...fields,discussionId:editing}})
      : await github('mutation($input:CreateDiscussionInput!){createDiscussion(input:$input){discussion{id url}}}',
        {input:{...fields,repositoryId:repoId}});
    const saved = data[updating ? 'updateDiscussion' : 'createDiscussion'].discussion;
    editing = saved.id;
    publish.textContent = 'Save changes';
    byId('editor-heading').textContent = 'Edit article.';
    byId('new-story').hidden = false;
    if (!updating) {
      try { localStorage.removeItem(draftKey); } catch {}
    }
    resultLink.href = saved.url;
    resultLink.hidden = false;
    status.textContent = updating ? 'Changes saved.' : 'Published on GitHub. The public journal updates after its next build.';
    await loadArticles(true);
  } catch(error) {
    status.textContent = 'GitHub could not confirm the save. '+error.message+' Check Discussions before retrying.';
  } finally {
    busy = false;
    publish.disabled = false;
  }
});

