(() => {
  const initSiteNavigation = () => {
    const header = document.querySelector('.site-header');
    const toggle = header?.querySelector('[data-nav-toggle]');
    const navId = toggle?.getAttribute('aria-controls');
    const nav = navId ? document.getElementById(navId) : null;
    if (!header || !toggle || !nav || !header.contains(nav)) return;

    const label = toggle.querySelector('[data-nav-toggle-label]');
    const narrowViewport = window.matchMedia('(max-width: 680px)');
    const setOpen = (isOpen) => {
      header.dataset.navOpen = String(isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? '收起主导航' : '展开主导航');
      if (label) label.textContent = isOpen ? '收起' : '菜单';
    };

    header.dataset.navEnhanced = 'true';
    setOpen(false);

    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      toggle.focus();
    });

    narrowViewport.addEventListener('change', (event) => {
      if (event.matches) setOpen(false);
    });
  };

  const initArchive = () => {
    const tree = document.querySelector('[data-archive-tree]');
    if (!tree) return;

    const nodes = [...tree.querySelectorAll('[data-archive-key]')];
    const yearNodes = nodes.filter((node) => node.dataset.archiveKey.startsWith('year:'));
    const monthNodes = nodes.filter((node) => node.dataset.archiveKey.startsWith('month:'));
    const storageKey = 'yewen.archive-tree.v1';
    let savedOpenKeys = null;

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

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        if (Array.isArray(state.open)) savedOpenKeys = new Set(state.open);
      }
    } catch (error) {
      // Storage can be unavailable in privacy mode; the tree remains usable.
    }

    const collapseMonthsInClosedYears = () => {
      yearNodes.filter((year) => !isOpen(year)).forEach((year) => {
        year.querySelectorAll('[data-archive-key^="month:"]').forEach((month) => {
          setOpen(month, false);
        });
      });
    };

    if (savedOpenKeys) {
      nodes.forEach((node) => {
        setOpen(node, savedOpenKeys.has(node.dataset.archiveKey));
      });
    } else {
      monthNodes.forEach((month) => {
        setOpen(month, false);
      });
    }

    collapseMonthsInClosedYears();

    const saveState = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({
          open: nodes.filter(isOpen).map((node) => node.dataset.archiveKey),
        }));
      } catch (error) {
        // Ignore storage failures and keep the current in-memory state.
      }
    };

    let archiveIndexPromise;
    const getArchiveIndex = () => {
      if (!archiveIndexPromise) {
        archiveIndexPromise = fetch(tree.dataset.archiveIndex, { credentials: 'same-origin' })
          .then((response) => {
            if (!response.ok) throw new Error(`Archive index request failed: ${response.status}`);
            return response.json();
          })
          .then((posts) => (Array.isArray(posts) ? posts : []));
      }
      return archiveIndexPromise;
    };

    const populateMonth = (node) => {
      const target = getPanel(node);
      if (!target || target.dataset.loaded === 'true' || target.dataset.loading === 'true') return;

      target.dataset.loading = 'true';
      target.setAttribute('aria-busy', 'true');
      const monthKey = node.dataset.archiveKey.slice('month:'.length);

      getArchiveIndex()
        .then((posts) => {
          const monthPosts = posts
            .filter((post) => `${post.year}-${String(post.month).padStart(2, '0')}` === monthKey)
            .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title));

          target.replaceChildren();
          monthPosts.forEach((post) => {
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
            target.appendChild(item);
          });
          target.dataset.loaded = 'true';
        })
        .catch(() => {
          target.replaceChildren();
          const message = document.createElement('li');
          message.className = 'archive-tree__load-error';
          message.textContent = '文章列表暂时无法加载，请点击月份查看。';
          target.appendChild(message);
        })
        .finally(() => {
          delete target.dataset.loading;
          target.removeAttribute('aria-busy');
        });
    };

    nodes.forEach((node) => {
      const toggle = getToggle(node);
      if (!toggle) return;

      toggle.addEventListener('click', () => {
        const open = !isOpen(node);
        setOpen(node, open);
        if (!open && node.dataset.archiveKey.startsWith('year:')) {
          node.querySelectorAll('[data-archive-key^="month:"]').forEach((month) => {
            setOpen(month, false);
          });
        }
        saveState();
        if (open && node.dataset.archiveKey.startsWith('month:')) populateMonth(node);
      });
    });
    monthNodes.filter(isOpen).forEach(populateMonth);
  };

  const initAutoToc = () => {
    const content = document.querySelector('.article--single .article-content');
    const card = document.querySelector('[data-auto-toc]');
    if (!content || !card) return;

    const slot = card.closest('[data-toc-slot]');
    const layout = document.querySelector('.site-layout');
    const headings = [...content.querySelectorAll('h2, h3, h4')]
      .filter((heading) => heading.textContent.trim());
    if (layout) layout.classList.toggle('site-layout--with-toc', headings.length > 0);
    document.body.classList.toggle('page-with-toc', headings.length > 0);
    if (!headings.length) {
      card.hidden = true;
      if (slot) slot.hidden = true;
      return;
    }

    const usedIds = new Set([...document.querySelectorAll('[id]')].map((node) => node.id));
    headings.forEach((heading, index) => {
      const label = heading.dataset.tocLabel || heading.textContent.trim();
      heading.dataset.tocLabel = label;
      if (!heading.id) {
        let id = `section-${index + 1}`;
        while (usedIds.has(id)) id += '-section';
        heading.id = id;
        usedIds.add(id);
      }
      if (!heading.querySelector(':scope > .heading-anchor')) {
        const anchor = document.createElement('a');
        anchor.className = 'heading-anchor';
        anchor.href = `#${encodeURIComponent(heading.id)}`;
        anchor.textContent = '#';
        anchor.setAttribute('aria-label', `链接到“${label}”`);
        heading.prepend(anchor);
      }
    });

    const target = card.querySelector('[data-toc-content]');
    if (!target) return;

    const baseLevel = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))));
    const nav = document.createElement('nav');
    nav.className = 'toc-nav';
    nav.setAttribute('aria-label', '本页目录');
    const list = document.createElement('ul');
    list.className = 'toc-list';
    const links = [];

    headings.forEach((heading) => {
      const item = document.createElement('li');
      const level = Number(heading.tagName.slice(1)) - baseLevel + 1;
      item.className = `toc-item toc-level-${level}`;
      item.dataset.tocLevel = String(level);
      const link = document.createElement('a');
      link.className = 'toc-link';
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.dataset.tocHeadingId = heading.id;
      link.textContent = heading.dataset.tocLabel;
      item.appendChild(link);
      list.appendChild(item);
      links.push({ heading, item, link });
    });

    nav.appendChild(list);
    target.replaceChildren(nav);
    card.hidden = false;
    if (slot) slot.hidden = false;

    let activeIndex = -1;
    let frameId = 0;
    const updateActive = () => {
      const activationLine = Math.min(Math.max(window.innerHeight * 0.08, 48), 80);
      let nextIndex = -1;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= activationLine) nextIndex = index;
      });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        nextIndex = headings.length - 1;
      }
      if (nextIndex === activeIndex) return;

      if (activeIndex >= 0) {
        links[activeIndex].item.classList.remove('is-active');
        links[activeIndex].link.removeAttribute('aria-current');
      }
      activeIndex = nextIndex;
      if (activeIndex < 0) return;

      const activeLink = links[activeIndex];
      activeLink.item.classList.add('is-active');
      activeLink.link.setAttribute('aria-current', 'location');
      const cardRect = card.getBoundingClientRect();
      const linkRect = activeLink.link.getBoundingClientRect();
      if (linkRect.top < cardRect.top) {
        card.scrollTop -= cardRect.top - linkRect.top;
      } else if (linkRect.bottom > cardRect.bottom) {
        card.scrollTop += linkRect.bottom - cardRect.bottom;
      }
    };

    const scheduleActiveUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateActive();
      });
    };

    window.addEventListener('scroll', scheduleActiveUpdate, { passive: true });
    window.addEventListener('resize', scheduleActiveUpdate);
    window.addEventListener('hashchange', scheduleActiveUpdate);
    updateActive();

    const hashId = window.location.hash.slice(1);
    if (hashId) {
      let decodedHashId = hashId;
      try {
        decodedHashId = decodeURIComponent(hashId);
      } catch (error) {
        // Keep the raw hash when a malformed URL-encoded fragment is used.
      }
      const hashHeading = headings.find((heading) => heading.id === decodedHashId);
      if (hashHeading && hashHeading.getBoundingClientRect().top > window.innerHeight) {
        window.setTimeout(() => hashHeading.scrollIntoView({ block: 'start' }), 0);
      }
    }
  };

  initSiteNavigation();
  initArchive();
  initAutoToc();
})();
