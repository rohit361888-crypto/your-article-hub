const byId = id => document.getElementById(id);
const title = byId('title');
const description = byId('description');
const content = byId('content');
const category = byId('category');
const status = byId('publish-status');
const editorUrl = document.querySelector('#native-editor').href;
const draftKey = 'your-article-hub-editor-draft';

try {
  const draft = JSON.parse(localStorage.getItem(draftKey) || '{}') || {};
  title.value = draft.title || '';
  description.value = draft.description || '';
  content.value = draft.content || '';
  if (Array.from(category.options).some(option => option.value === draft.category)) category.value = draft.category;
} catch {}

function saveDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify({
      title:title.value, description:description.value, content:content.value, category:category.value
    }));
    return true;
  } catch {
    return false;
  }
}

byId('save-draft').addEventListener('click', () => {
  status.textContent = saveDraft() ? 'Draft saved in this browser.' : 'This browser could not save the draft.';
});

function refreshPreview() {
  byId('preview-title').textContent = title.value || 'Untitled article';
  byId('preview-description').textContent = description.value;
  byId('preview-body').textContent = content.value;
}

byId('preview-button').addEventListener('click', event => {
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

byId('article').addEventListener('submit', event => {
  event.preventDefault();
  const headline = title.value.trim();
  const article = content.value.trim();
  if (!headline || !article || !category.value) {
    status.textContent = 'Enter a title, category and article body.';
    return;
  }
  const summary = description.value.trim().replace(/\s+/g,' ').replace(/[\\*_\x60~\[\]<>#!|]/g,'\\$&');
  const body = summary ? summary+'\n\n'+article : article;
  const next = new URL(editorUrl);
  next.search = new URLSearchParams({category:category.value,title:headline,body});
  saveDraft();
  if (next.href.length > 7500) {
    status.textContent = 'This draft is too long to send in one link. Copy the body, then open GitHub and paste it in.';
    const copy = byId('copy-body');
    copy.hidden = false;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(body);
        status.textContent = 'Article body copied. Paste it into the GitHub editor.';
      } catch {
        status.textContent = 'Copy the description and body from this editor, then paste them on GitHub.';
      }
    };
    next.searchParams.delete('body');
    const link = byId('continue-link');
    link.href = next.href;
    link.hidden = false;
    return;
  }
  window.location.assign(next.href);
});

