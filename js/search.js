const PAGEFIND_MODULE_URL = "/pagefind/pagefind.js";
const MAX_QUERY_LENGTH = 160;
const BLOCKED_SEGMENT_RE = /^(?:wp-(?:admin|content|includes|json)|wp-login\.php|xmlrpc\.php|wp-cron\.php|feed|comments|robots\.txt|favicon\.ico)$/i;
const FILE_EXTENSION_RE = /\.(?:php\d*|cgi|pl|asp|aspx|jsp|json|xml|txt|ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|map|woff2?|ttf|eot|zip|gz|tar|rar|7z|pdf|mp[34]|webm|mov|avi)$/i;

export function safeDecode(value) {
  let decoded = String(value ?? "");
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function normalizeRouteKey(value) {
  return safeDecode(value)
    .normalize("NFKC")
    .replace(/[?#].*$/, "")
    .replace(/\.html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("zh-CN");
}

function aliasKey(alias) {
  const parts = safeDecode(alias).split("/").filter(Boolean);
  return parts.at(-1) || "";
}

export function routeKeys(route) {
  const values = [route.title, route.slug, route.wordpressPostName];
  for (const alias of Array.isArray(route.aliases) ? route.aliases : []) {
    values.push(aliasKey(alias));
  }
  return new Set(values.map(normalizeRouteKey).filter(Boolean));
}

export function findExactRoute(routes, query) {
  const key = normalizeRouteKey(query);
  if (!key || !Array.isArray(routes)) return null;
  const matches = new Map();
  for (const route of routes) {
    if (route && typeof route.url === "string" && routeKeys(route).has(key)) {
      matches.set(route.url, route);
    }
  }
  return matches.size === 1 ? matches.values().next().value : null;
}

export function findTitleRoutes(routes, query) {
  const key = normalizeRouteKey(query);
  if (key.length < 2 || !Array.isArray(routes)) return [];
  return routes.filter((route) => (
    route
    && typeof route.url === "string"
    && normalizeRouteKey(route.title).includes(key)
  ));
}

export function queryFromPath(pathname) {
  const decodedPath = safeDecode(pathname || "/");
  const segments = decodedPath.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => BLOCKED_SEGMENT_RE.test(segment))) {
    return "";
  }
  if (/\/page\/\d+\/?$/i.test(decodedPath)) return "";
  const last = segments.at(-1).replace(/\.html?$/i, "");
  if (FILE_EXTENSION_RE.test(last)) return "";
  const query = last.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) return "";
  return query;
}

function setExternalLinks(root, query) {
  const scopedQuery = `site:www.yewen.us ${query}`;
  root.querySelector("[data-search-google]").href =
    `https://www.google.com/search?q=${encodeURIComponent(scopedQuery)}`;
  root.querySelector("[data-search-bing]").href =
    `https://www.bing.com/search?q=${encodeURIComponent(scopedQuery)}`;
  root.querySelector("[data-search-external]").hidden = false;
}

function setStatus(root, message) {
  root.querySelector("[data-search-status]").textContent = message;
}

function setFormValues(root, query) {
  for (const input of root.querySelectorAll("[data-search-input]")) {
    input.value = query;
  }
}

function renderResults(root, results) {
  const list = root.querySelector("[data-search-results]");
  list.replaceChildren();
  for (const data of results) {
    const item = document.createElement("li");
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = data.url;
    link.textContent = data.meta?.title || data.url;
    heading.append(link);
    article.append(heading);
    if (data.excerpt) {
      const excerpt = document.createElement("p");
      const excerptTemplate = document.createElement("template");
      excerptTemplate.innerHTML = data.excerpt;
      excerpt.textContent = excerptTemplate.content.textContent || "";
      article.append(excerpt);
    }
    item.append(article);
    list.append(item);
  }
}

async function loadRoutes(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`route index returned ${response.status}`);
  const routes = await response.json();
  if (!Array.isArray(routes)) throw new Error("route index is not an array");
  return routes;
}

async function searchPagefind(query) {
  const pagefind = await import(PAGEFIND_MODULE_URL);
  const search = await pagefind.search(query);
  return Promise.all(search.results.slice(0, 20).map((result) => result.data()));
}

function mergeResults(titleRoutes, pagefindResults) {
  const merged = new Map();
  for (const route of titleRoutes) {
    merged.set(safeDecode(route.url), {
      url: route.url,
      meta: { title: route.title },
      excerpt: "",
    });
  }
  for (const result of pagefindResults) {
    const key = safeDecode(result.url);
    if (!merged.has(key)) merged.set(key, result);
  }
  return [...merged.values()].slice(0, 20);
}

async function initialize(root) {
  const mode = root.dataset.searchMode;
  let query = "";
  if (mode === "404") {
    query = queryFromPath(window.location.pathname);
  } else {
    query = new URLSearchParams(window.location.search).get("q")?.trim() || "";
    if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH);
  }

  setFormValues(root, query);
  if (!query) {
    setStatus(
      root,
      mode === "404" ? "这个路径不适合作为搜索词，请手动输入关键词。" : "请输入关键词。",
    );
    return;
  }
  setExternalLinks(root, query);

  let routes = [];
  try {
    routes = await loadRoutes(root.dataset.routeIndex);
  } catch (error) {
    console.warn("Exact route index unavailable", error);
  }

  try {
    if (mode === "404" && routes.length) {
      setStatus(root, `正在查找“${query}”…`);
      const exact = findExactRoute(routes, query);
      if (exact && new URL(exact.url, window.location.origin).pathname !== window.location.pathname) {
        setStatus(root, `已找到“${exact.title}”，正在跳转…`);
        window.location.replace(exact.url);
        return;
      }
    }

    setStatus(root, `正在搜索“${query}”…`);
    const pagefindResults = await searchPagefind(query);
    const results = mergeResults(findTitleRoutes(routes, query), pagefindResults);
    renderResults(root, results);
    setStatus(
      root,
      results.length ? `找到 ${results.length} 条结果。` : `没有找到与“${query}”匹配的内容。`,
    );
  } catch (error) {
    console.error("Site search failed", error);
    setStatus(root, "本站搜索暂时不可用，请使用下方外部搜索。" );
  }
}

if (typeof document !== "undefined") {
  for (const root of document.querySelectorAll("[data-search-root]")) {
    initialize(root);
  }
}
