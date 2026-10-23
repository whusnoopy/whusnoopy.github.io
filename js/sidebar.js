export function validateSidebarData(data) {
  const validEntry = (entry) => (
    entry && typeof entry.title === 'string'
    && typeof entry.url === 'string' && entry.url.startsWith('/') && !entry.url.startsWith('//')
    && Number.isSafeInteger(entry.count) && entry.count >= 0
  );
  const validCategory = (entry) => (
    validEntry(entry) && Array.isArray(entry.children) && entry.children.every(validCategory)
  );
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.tags)
    || !data.categories.every(validCategory) || !data.tags.every(validEntry)) {
    throw new Error('Invalid sidebar index');
  }
  return data;
}

export async function initSidebar(root = document.querySelector('[data-sidebar-index]')) {
  if (!root) return;
  const cards = [...root.querySelectorAll('[data-sidebar-kind]')].map((card) => ({
    card,
    kind: card.dataset.sidebarKind,
    items: card.querySelector('[data-sidebar-items]'),
    status: card.querySelector('[data-sidebar-status]'),
    retry: card.querySelector('[data-sidebar-retry]'),
  })).filter(({ kind, items, status, retry }) => (
    ['categories', 'tags'].includes(kind) && items && status && retry
  ));
  if (!cards.length) return;

  const createCategory = (entry, isChild = false) => {
    const item = document.createElement('li');
    item.className = `category-tree__item${isChild ? ' category-tree__item--child' : ''}`;
    const row = document.createElement('div');
    row.className = 'category-tree__row';
    const label = document.createElement('span');
    label.className = 'category-tree__label';
    const link = document.createElement('a');
    link.className = 'category-tree__name';
    link.href = entry.url;
    link.textContent = entry.title;
    const count = document.createElement('span');
    count.className = 'category-tree__count';
    count.textContent = String(entry.count);
    label.append(link, document.createTextNode(' '), count);
    row.appendChild(label);
    item.appendChild(row);
    if (entry.children.length) {
      const children = document.createElement('ul');
      children.className = 'category-tree__children';
      children.append(...entry.children.map((child) => createCategory(child, true)));
      item.appendChild(children);
    }
    return item;
  };

  const createTag = (entry) => {
    const link = document.createElement('a');
    link.href = entry.url;
    link.textContent = entry.title;
    const count = document.createElement('span');
    count.textContent = String(entry.count);
    link.append(document.createTextNode(' '), count);
    return link;
  };

  let loading = false;
  const loadIndex = async () => {
    if (loading) return;
    loading = true;
    cards.forEach(({ card, status, retry }) => {
      card.setAttribute('aria-busy', 'true');
      status.textContent = '正在加载…';
      status.hidden = false;
      retry.hidden = true;
    });
    try {
      const response = await fetch(root.dataset.sidebarIndex, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Sidebar index request failed: ${response.status}`);
      const data = validateSidebarData(await response.json());
      cards.forEach(({ kind, items, status }) => {
        const entries = data[kind];
        items.replaceChildren(...entries.map((entry) => (
          kind === 'categories' ? createCategory(entry) : createTag(entry)
        )));
        status.textContent = kind === 'categories' ? '暂无文章分类。' : '暂无常用标签。';
        status.hidden = entries.length > 0;
      });
    } catch {
      cards.forEach(({ kind, status, retry }) => {
        status.textContent = kind === 'categories' ? '分类暂时无法加载，请重试或查看全部分类。' : '标签暂时无法加载，请重试或查看全部标签。';
        status.hidden = false;
        retry.hidden = false;
      });
    } finally {
      loading = false;
      cards.forEach(({ card }) => card.removeAttribute('aria-busy'));
    }
  };
  cards.forEach(({ retry }) => retry.addEventListener('click', loadIndex));
  await loadIndex();
}

if (typeof document !== 'undefined') initSidebar();
