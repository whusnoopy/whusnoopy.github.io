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

  const initTocLabelPreview = (card) => {
    const preview = document.createElement('span');
    // Older browsers retain the native title tooltip.
    if (typeof preview.showPopover !== 'function') return { show: () => {}, hide: () => {} };
    preview.className = 'toc-full-label';
    preview.setAttribute('popover', 'manual');
    preview.setAttribute('aria-hidden', 'true');
    card.querySelectorAll('.toc-link').forEach((link) => link.removeAttribute('title'));

    let currentLink = null;
    let frameId = 0;
    let animationUntil = 0;
    let previewWidth = 0;
    let previewRightInset = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const getSelectedLink = () => card.querySelector('.toc-link.is-hovered') || card.querySelector('.toc-link:focus-visible');
    const needsFullLabel = (link, label) => {
      const range = document.createRange();
      range.selectNodeContents(label);
      const textWidth = range.getBoundingClientRect().width;
      const currentSize = parseFloat(window.getComputedStyle(label).fontSize);
      const enlargedSize = parseFloat(window.getComputedStyle(link).fontSize) * 1.1;
      return textWidth * enlargedSize / currentSize > label.clientWidth;
    };
    const hide = () => {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
      animationUntil = 0;
      currentLink?.classList.remove('needs-full-label');
      if (preview.matches(':popover-open')) preview.hidePopover();
      preview.remove();
      currentLink = null;
    };
    const update = () => {
      if (card.dataset.tocOpen !== 'true') return hide();
      // Top-layer popovers do not propagate :hover to their DOM ancestors in Chrome.
      const link = getSelectedLink();
      const label = link?.querySelector('.toc-label');
      if (!label || !needsFullLabel(link, label)) return hide();
      if (currentLink !== link) return show();

      const linkRect = link.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (linkRect.bottom <= cardRect.top || linkRect.top >= cardRect.bottom) return hide();
      const labelRect = label.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const viewport = document.documentElement;
      // Anchor the final width so the text's right edge stays fixed throughout zoom.
      const right = Math.min(viewport.clientWidth - 16, Math.max(labelRect.right + previewRightInset, 16 + previewWidth));
      const top = Math.max(16, Math.min((linkRect.top + linkRect.bottom - previewRect.height) / 2, viewport.clientHeight - previewRect.height - 16));
      preview.style.right = `${viewport.clientWidth - right}px`;
      preview.style.top = `${top}px`;
      if (performance.now() < animationUntil) scheduleUpdate();
    };
    const scheduleUpdate = () => {
      if (frameId || card.dataset.tocOpen !== 'true') return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        update();
      });
    };
    const show = () => {
      const link = getSelectedLink();
      const label = link?.querySelector('.toc-label');
      if (!label || !needsFullLabel(link, label)) return hide();
      if (currentLink === link) {
        scheduleUpdate();
        return;
      }
      const labelStyle = window.getComputedStyle(label);
      const startSize = labelStyle.fontSize;
      const startOpacity = labelStyle.opacity;
      hide();
      currentLink = link;
      preview.textContent = label.textContent;
      preview.style.transition = 'none';
      preview.style.width = 'max-content';
      preview.style.fontSize = '';
      preview.style.opacity = '0';
      // Keep the full text in its link so hovering and clicking it still work.
      link.appendChild(preview);
      preview.showPopover();
      previewWidth = preview.getBoundingClientRect().width;
      const previewStyle = window.getComputedStyle(preview);
      previewRightInset = parseFloat(previewStyle.paddingRight) + parseFloat(previewStyle.borderRightWidth);
      preview.style.width = `${previewWidth}px`;
      preview.style.fontSize = startSize;
      preview.style.opacity = startOpacity;
      link.classList.add('needs-full-label');
      update();
      // Commit the original size and position before starting the same zoom as other rows.
      preview.getBoundingClientRect();
      preview.style.transition = '';
      preview.style.fontSize = '';
      preview.style.opacity = '';
      animationUntil = reducedMotion.matches ? 0 : performance.now() + 220;
      scheduleUpdate();
    };
    card.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return { show, hide };
  };

  const initTocDisclosure = (card) => {
    const labelPreview = initTocLabelPreview(card);
    let openTimer = 0;
    let closeTimer = 0;
    let pointerInside = false;
    let touchToExpand = false;
    let hoveredLink = null;
    const setHoveredLink = (link) => {
      if (hoveredLink === link) return;
      hoveredLink?.classList.remove('is-hovered');
      hoveredLink = link;
      hoveredLink?.classList.add('is-hovered');
      labelPreview.hide();
      if (link && card.dataset.tocOpen === 'true') labelPreview.show();
    };
    const getLink = (target) => target instanceof Element ? target.closest('.toc-link') : null;
    const setOpen = (isOpen) => {
      card.dataset.tocOpen = String(isOpen);
      if (isOpen) labelPreview.show();
      else labelPreview.hide();
    };
    const clearTimers = () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
    const close = () => {
      clearTimers();
      setOpen(false);
      setHoveredLink(null);
    };
    const scheduleClose = () => {
      pointerInside = false;
      clearTimers();
      closeTimer = window.setTimeout(() => {
        if (!pointerInside && !card.querySelector(':focus-visible')) close();
      }, 180);
    };

    card.dataset.tocEnhanced = 'true';
    setOpen(false);

    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      pointerInside = true;
      clearTimers();
      openTimer = window.setTimeout(() => setOpen(true), 120);
    });
    card.addEventListener('pointerover', (event) => {
      if (event.pointerType === 'touch') return;
      pointerInside = true;
      window.clearTimeout(closeTimer);
      setHoveredLink(getLink(event.target));
    });
    card.addEventListener('pointerout', (event) => {
      if (event.pointerType === 'touch') return;
      if (card.contains(event.relatedTarget)) {
        setHoveredLink(getLink(event.relatedTarget));
      } else {
        scheduleClose();
      }
    });
    card.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'touch') return;
      if (card.contains(event.relatedTarget)) return;
      scheduleClose();
    });
    card.addEventListener('focusin', () => {
      clearTimers();
      setOpen(true);
    });
    card.addEventListener('focusout', () => {
      clearTimers();
      closeTimer = window.setTimeout(() => {
        if (!pointerInside && !card.contains(document.activeElement)) setOpen(false);
      }, 180);
    });
    card.addEventListener('pointerdown', (event) => {
      touchToExpand = event.pointerType === 'touch' && card.dataset.tocOpen !== 'true';
      if (touchToExpand) {
        clearTimers();
        setOpen(true);
      }
    });
    card.addEventListener('click', (event) => {
      if (!touchToExpand || !event.target.closest('.toc-link')) return;
      event.preventDefault();
      touchToExpand = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && card.dataset.tocOpen === 'true') close();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!card.contains(event.target)) close();
    });
    window.matchMedia('(min-width: 1560px)').addEventListener('change', () => {
      pointerInside = false;
      close();
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
      link.title = heading.dataset.tocLabel;
      const label = document.createElement('span');
      label.className = 'toc-label';
      label.textContent = heading.dataset.tocLabel;
      link.appendChild(label);
      item.appendChild(link);
      list.appendChild(item);
      links.push({ heading, item, link });
    });

    nav.appendChild(list);
    target.replaceChildren(nav);
    card.hidden = false;
    if (slot) slot.hidden = false;
    initTocDisclosure(card);

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
