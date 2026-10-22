export function groupArchivePosts(posts) {
  if (!Array.isArray(posts)) throw new Error('Invalid archive index');

  const years = new Map();
  for (const post of posts) {
    let year = years.get(post.year);
    if (!year) {
      year = { year: post.year, count: 0, months: new Map() };
      years.set(post.year, year);
    }
    let month = year.months.get(post.month);
    if (!month) {
      month = { month: post.month, posts: [] };
      year.months.set(post.month, month);
    }
    month.posts.push(post);
    year.count += 1;
  }

  return [...years.values()]
    .sort((left, right) => right.year - left.year)
    .map((year) => ({
      ...year,
      months: [...year.months.values()]
        .sort((left, right) => right.month - left.month)
        .map((month) => ({
          ...month,
          posts: month.posts.sort((left, right) => (
            Date.parse(right.date) - Date.parse(left.date) || left.title.localeCompare(right.title)
          )),
        })),
    }));
}

export async function initArchive(tree = document.querySelector('[data-archive-tree]')) {
  if (!tree) return;

  const yearsList = tree.querySelector('[data-archive-years]');
  const status = tree.querySelector('[data-archive-status]');
  const retry = tree.querySelector('[data-archive-retry]');
  if (!yearsList || !status || !retry) return;

  const storageKey = 'yewen.archive-tree.v1';
  let savedOpenKeys = null;
  let nodes = [];
  let yearNodes = [];
  const monthPosts = new Map();

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const state = JSON.parse(stored);
      if (Array.isArray(state.open)) savedOpenKeys = new Set(state.open);
    }
  } catch {
    // Storage can be unavailable in privacy mode; the tree remains usable.
  }

  const getToggle = (node) => node.querySelector(':scope > .archive-tree__row > [data-archive-toggle]');
  const getPanel = (node) => {
    const panelId = getToggle(node)?.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    return panel && node.contains(panel) ? panel : null;
  };
  const isOpen = (node) => getToggle(node)?.getAttribute('aria-expanded') === 'true';
  const setOpen = (node, open) => {
    const toggle = getToggle(node);
    const panel = getPanel(node);
    if (!toggle || !panel) return;

    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? '收起' : '展开'} ${toggle.dataset.archiveLabel}`);
    panel.hidden = !open;
  };
  const collapseMonths = (year) => {
    year.querySelectorAll('[data-archive-key^="month:"]').forEach((month) => setOpen(month, false));
  };

  const createBranch = (kind, key, label, url, count, archiveLabel, panelClass) => {
    const node = document.createElement('li');
    node.className = `archive-tree__node archive-tree__node--${kind}`;
    node.dataset.archiveKey = `${kind}:${key}`;

    const row = document.createElement('div');
    row.className = 'archive-tree__row';
    const toggle = document.createElement('button');
    toggle.className = 'archive-tree__toggle';
    toggle.type = 'button';
    toggle.dataset.archiveToggle = '';
    toggle.dataset.archiveLabel = archiveLabel;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `展开 ${archiveLabel}`);
    toggle.setAttribute('aria-controls', `archive-${kind}-${key}`);
    toggle.innerHTML = '<svg class="archive-tree__chevron" aria-hidden="true" focusable="false" viewBox="0 0 12 12"><path d="M3.75 1.5 8.25 6 3.75 10.5"></path></svg>';

    const link = document.createElement('a');
    link.className = 'archive-tree__link';
    link.href = url;
    link.textContent = label;
    const badge = document.createElement('span');
    badge.className = `archive-tree__count archive-tree__count--${kind}`;
    badge.title = `${count} 篇文章`;
    badge.textContent = String(count);
    row.append(toggle, link, badge);

    const panel = document.createElement('ul');
    panel.className = panelClass;
    panel.id = `archive-${kind}-${key}`;
    panel.dataset.archivePanel = '';
    panel.hidden = true;
    node.append(row, panel);
    return { node, panel };
  };

  const populateMonth = (node) => {
    const target = getPanel(node);
    if (!target || target.dataset.loaded === 'true') return;

    const posts = monthPosts.get(node.dataset.archiveKey) || [];
    const items = posts.map((post) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const dateOnly = post.date.slice(0, 10);
      link.href = post.url;
      link.title = dateOnly.replaceAll('-', '.');
      link.textContent = post.title;
      const date = document.createElement('time');
      date.dateTime = post.date;
      date.textContent = post.displayDate || dateOnly.slice(5).replace('-', '.');
      link.appendChild(date);
      item.appendChild(link);
      return item;
    });
    target.replaceChildren(...items);
    target.dataset.loaded = 'true';
  };

  const renderYears = (years) => {
    monthPosts.clear();
    const items = years.map((year) => {
      const branch = createBranch(
        'year', String(year.year), String(year.year), `${tree.dataset.archiveBase}${year.year}/`,
        year.count, `${year.year} 年归档，共 ${year.count} 篇文章`, 'archive-tree__months',
      );
      year.months.forEach((month) => {
        const monthNumber = String(month.month).padStart(2, '0');
        const key = `${year.year}-${monthNumber}`;
        const child = createBranch(
          'month', key, `${year.year}.${monthNumber}`, `${tree.dataset.archiveBase}${year.year}/${monthNumber}/`,
          month.posts.length, `${year.year} 年 ${monthNumber} 月归档，共 ${month.posts.length} 篇文章`, 'archive-tree__posts',
        );
        child.panel.dataset.archivePosts = '';
        monthPosts.set(`month:${key}`, month.posts);
        branch.panel.appendChild(child.node);
      });
      return branch.node;
    });
    yearsList.replaceChildren(...items);
    nodes = [...yearsList.querySelectorAll('[data-archive-key]')];
    yearNodes = nodes.filter((node) => node.dataset.archiveKey.startsWith('year:'));
    nodes.forEach((node) => {
      setOpen(node, savedOpenKeys ? savedOpenKeys.has(node.dataset.archiveKey) : node === yearNodes[0]);
    });
    yearNodes.filter((year) => !isOpen(year)).forEach(collapseMonths);
    nodes.filter((node) => node.dataset.archiveKey.startsWith('month:') && isOpen(node)).forEach(populateMonth);
  };

  tree.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-archive-toggle]');
    if (!toggle || !tree.contains(toggle)) return;
    const node = toggle.closest('[data-archive-key]');
    const open = !isOpen(node);
    setOpen(node, open);
    if (!open && node.dataset.archiveKey.startsWith('year:')) collapseMonths(node);
    if (open && node.dataset.archiveKey.startsWith('month:')) populateMonth(node);

    savedOpenKeys = new Set(nodes.filter(isOpen).map((item) => item.dataset.archiveKey));
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ open: [...savedOpenKeys] }));
    } catch {
      // Ignore storage failures and keep the current in-memory state.
    }
  });

  const loadIndex = async () => {
    tree.setAttribute('aria-busy', 'true');
    status.textContent = '正在加载归档…';
    status.hidden = false;
    retry.hidden = true;
    try {
      const response = await fetch(tree.dataset.archiveIndex, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Archive index request failed: ${response.status}`);
      renderYears(groupArchivePosts(await response.json()));
      status.textContent = '暂无文章归档。';
      status.hidden = nodes.length > 0;
    } catch {
      status.textContent = '归档暂时无法加载，请重试或查看全部归档。';
      retry.hidden = false;
    } finally {
      tree.removeAttribute('aria-busy');
    }
  };

  retry.addEventListener('click', loadIndex);
  await loadIndex();
}

if (typeof document !== 'undefined') initArchive();
