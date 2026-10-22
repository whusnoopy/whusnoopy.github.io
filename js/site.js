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
  initAutoToc();
})();
