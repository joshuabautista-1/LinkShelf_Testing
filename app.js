/* ══════════════════════════════════════════════════════════
   LinkShelf v3 — app.js
   No login/logout. All features unlocked.
   Features: subcategories, click tracking, bulk select,
   broken link detection, duplicate detection,
   content search, background themes, smooth transitions.
   ══════════════════════════════════════════════════════════ */

/* ── Constants ─────────────────────────────────────────── */
const DEFAULT_BG  = '#f5f4f0';
const BG_PRESETS  = [
  '#f5f4f0','#ffffff','#fdf6e3','#f0f4ff','#f0fff4',
  '#fff0f6','#1a1916','#1e293b','#2d1b69','#0f2027',
];

/* ── App state ─────────────────────────────────────────── */
let categories     = [];   // flat list from DB (each has id, name, parent)
let links          = [];   // all links
let activeCategory = 'All'; // 'All' or category id
let editingId      = null;
let editingCatId   = null;
let sortMode       = 'saved'; // 'saved' | 'clicks' | 'lastVisit' | 'alpha'
let selectedIds    = new Set();
let selectModeOn   = false;
let healthScanResults = { broken: [], dupes: [] };

/* ── Utils ─────────────────────────────────────────────── */
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getHostname(url) {
  try { return new URL(url).hostname; } catch(e) { return ''; }
}
function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  el.focus();
  let errEl = el.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.className = 'field-error';
    el.parentElement.appendChild(errEl);
  }
  errEl.textContent = msg;
  el.classList.add('field-invalid');
  el.addEventListener('input', () => {
    errEl.remove();
    el.classList.remove('field-invalid');
  }, { once: true });
}

/* ── Boot ──────────────────────────────────────────────── */
async function bootApp() {
  document.getElementById('appRoot').style.display = '';

  await reloadData();
  initColorPicker();

  document.getElementById('dbBadge').textContent = '✦ IndexedDB';
  document.getElementById('dbBadge').classList.add('ready');

  renderSidebar();
  renderLinks();
  updateStats();
}

async function reloadData() {
  [categories, links] = await Promise.all([
    dbGetCategories(),
    dbGetLinks(),
  ]);
  sortLinks();
}

function sortLinks() {
  links.sort((a, b) => {
    if (sortMode === 'clicks')    return (b.clicks||0) - (a.clicks||0);
    if (sortMode === 'lastVisit') return (b.lastVisit||0) - (a.lastVisit||0);
    if (sortMode === 'alpha')     return a.name.localeCompare(b.name);
    // default: by saved date, pinned first
    return (b.pinned?1:0) - (a.pinned?1:0) || b.saved - a.saved;
  });
}

/* ── Sidebar ────────────────────────────────────────────── */
function renderSidebar() {
  const list = document.getElementById('catList');

  // Build tree: top-level cats (no parent)
  const topLevel = categories.filter(c => !c.parent);
  const childrenOf = (id) => categories.filter(c => c.parent === id);

  let html = `<li class="cat-item ${activeCategory==='All'?'active':''}" onclick="setCategory('All')">
    <span class="cat-name-wrap"><span class="cat-name-display">All links</span></span>
    <span class="cat-count">${links.length}</span>
  </li>`;

  html += `<li class="cat-item pinned-row ${activeCategory==='pinned'?'active':''}" onclick="setCategory('pinned')">
    <span class="cat-name-wrap"><span class="cat-name-display">⭐ Pinned</span></span>
    <span class="cat-count">${links.filter(l=>l.pinned).length}</span>
  </li>`;



  for (const cat of topLevel) {
    const children = childrenOf(cat.id);
    const count = links.filter(l => {
      const lCats = l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
      return lCats.includes(cat.id) || children.some(c => lCats.includes(c.id));
    }).length;
    const isActive = cat.id === activeCategory || children.some(c => c.id === activeCategory);
    const hasChildren = children.length > 0;

    html += `<li class="cat-item ${activeCategory===cat.id?'active':''} ${hasChildren?'expanded':''}"
      onclick="setCategory('${escHtml(cat.id)}')" data-cat-id="${escHtml(cat.id)}">
      <span class="cat-name-wrap">
        ${hasChildren ? `<span class="cat-toggle always-open">▼</span>` : ''}
        <span class="cat-name-display">${escHtml(cat.name)}</span>
      </span>
      <span class="cat-count">${count}</span>
      <button class="cat-btn" onclick="event.stopPropagation();openAddSubcat('${escHtml(cat.id)}')" title="Add subfolder">+</button>
      <button class="cat-btn" onclick="event.stopPropagation();openEditCat('${escHtml(cat.id)}')" title="Rename">✎</button>
      <button class="cat-btn del" onclick="event.stopPropagation();confirmDeleteCategory('${escHtml(cat.id)}')" title="Delete">✕</button>
    </li>`;

    if (hasChildren) {
      html += `<ul class="sub-list open" id="sub-${escHtml(cat.id)}">`;
      for (const sub of children) {
        const subCount = links.filter(l => {
          const lCats = l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
          return lCats.includes(sub.id);
        }).length;
        html += `<li class="sub-item ${activeCategory===sub.id?'active':''}" onclick="setCategory('${escHtml(sub.id)}')">
          <span class="cat-name-wrap"><span class="cat-name-display">↳ ${escHtml(sub.name)}</span></span>
          <span class="cat-count">${subCount}</span>
          <button class="cat-btn" onclick="event.stopPropagation();openEditCat('${escHtml(sub.id)}')" title="Rename">✎</button>
          <button class="cat-btn del" onclick="event.stopPropagation();confirmDeleteCategory('${escHtml(sub.id)}')" title="Delete">✕</button>
        </li>`;
      }
      html += '</ul>';
    }
  }

  list.innerHTML = html;

  // Mobile pills
  const bar = document.getElementById('mobileCatBar');
  const allCats = ['All', ...topLevel.map(c=>c.name)];
  bar.innerHTML = allCats.map((name, i) => {
    const id = i === 0 ? 'All' : topLevel[i-1].id;
    return `<button class="mobile-cat-pill ${id===activeCategory?'active':''}" onclick="setCategory('${escHtml(id)}')">${escHtml(name)}</button>`;
  }).join('');
}

function toggleCatExpand(catId) {
  const subList = document.getElementById(`sub-${catId}`);
  const catItem = document.querySelector(`[data-cat-id="${catId}"]`);
  if (subList) subList.classList.toggle('open');
  if (catItem) catItem.classList.toggle('expanded');
}

/* ── Category switching ─────────────────────────────────── */
function setCategory(id) {
  if (id === activeCategory) return;
  const content = document.getElementById('mainContent');
  content.classList.add('cat-leave');

  setTimeout(() => {
    activeCategory = id;

    let label = 'All';
    if (id === 'All') label = 'All';
    else if (id === 'pinned') label = '⭐ Pinned';
    else {
      const cat = categories.find(c => c.id === id);
      label = cat ? cat.name : id;
    }
    document.getElementById('viewLabel').textContent = label;

    renderSidebar();
    _renderLinksInner();
    content.classList.remove('cat-leave');
    content.classList.add('cat-enter');
    content.offsetHeight;
    content.classList.remove('cat-enter');
  }, 160);
}

/* ── Render links ───────────────────────────────────────── */
function renderLinks() { _renderLinksInner(); }

function getActiveLinks() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  let view;

  if (activeCategory === 'All') {
    view = [...links];
  } else if (activeCategory === 'pinned') {
    view = links.filter(l => l.pinned);
  } else {
    // include children of this category; also match multi-cat links
    const children = categories.filter(c => c.parent === activeCategory).map(c=>c.id);
    const allIds = [activeCategory, ...children];
    view = links.filter(l => {
      const lCats = l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
      return lCats.some(c => allIds.includes(c));
    });
  }

  if (q) {
    view = view.filter(l => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.url.toLowerCase().includes(q)) return true;
      if (l.notes && l.notes.toLowerCase().includes(q)) return true;
      return false;
    });
  }
  return view;
}

function _renderLinksInner() {
  const view = getActiveLinks();
  document.getElementById('viewCount').textContent = `— ${view.length}`;

  const pinned   = view.filter(l => l.pinned && activeCategory !== 'pinned');
  const unpinned = view.filter(l => !l.pinned || activeCategory === 'pinned');
  const content  = document.getElementById('mainContent');

  if (!view.length) {
    const q = document.getElementById('searchInput').value;
    content.innerHTML = `<div class="links-grid"><div class="empty">
      <div class="empty-icon">◯</div>
      <div class="empty-text">${q ? `No results for "${escHtml(q)}"` : 'No links here yet.<br>Click <strong>+ Add link</strong> to get started.'}</div>
    </div></div>`;
    return;
  }

  // Check if we're viewing a parent category that has children — if so, group by subcat
  const isParentView = activeCategory !== 'All' && activeCategory !== 'pinned' &&
    categories.some(c => c.parent === activeCategory);

  let html = '';
  if (pinned.length) {
    html += `<div class="pinned-section">
      <div class="section-label">⭐ Pinned</div>
      <div class="links-grid">${pinned.map(cardHTML).join('')}</div>
    </div>`;
  }

  if (isParentView && !document.getElementById('searchInput').value) {
    // Group unpinned links by subcategory
    const children = categories.filter(c => c.parent === activeCategory);
    // Direct links (in the parent category itself, not a subcat)
    const directLinks = unpinned.filter(l => {
      const lCats = l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
      return lCats.includes(activeCategory);
    });
    // Links in each subcategory
    for (const sub of children) {
      const subLinks = unpinned.filter(l => {
        const lCats = l.cats && l.cats.length ? l.cats : (l.cat ? [l.cat] : []);
        return lCats.includes(sub.id);
      });
      if (!subLinks.length) continue;
      html += `<div class="subcat-group">
        <div class="section-label subcat-label">
          <button class="subcat-pill" onclick="setCategory('${escHtml(sub.id)}')">${escHtml(sub.name)}</button>
        </div>
        <div class="links-grid">${subLinks.map(cardHTML).join('')}</div>
      </div>`;
    }
    if (directLinks.length) {
      if (children.length) html += `<div class="section-label" style="margin-bottom:12px">Other</div>`;
      html += `<div class="links-grid">${directLinks.map(cardHTML).join('')}</div>`;
    }
  } else {
    if (unpinned.length) {
      if (pinned.length) html += `<div class="section-label" style="margin-bottom:12px">Links</div>`;
      html += `<div class="links-grid">${unpinned.map(cardHTML).join('')}</div>`;
    }
  }
  content.innerHTML = html;
}

function getCatLabel(catId) {
  if (!catId) return '';
  const cat = categories.find(c => c.id === catId);
  if (!cat) return '';
  if (cat.parent) {
    const parent = categories.find(c => c.id === cat.parent);
    return parent ? `${parent.name} / ${cat.name}` : cat.name;
  }
  return cat.name;
}
function getCatLabels(link) {
  const ids = link.cats && link.cats.length ? link.cats : (link.cat ? [link.cat] : []);
  return ids.map(id => getCatLabel(id)).filter(Boolean);
}

function cardHTML(l) {
  const domain     = getHostname(l.url);
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?sz=32&domain=${domain}` : '';
  const dateStr    = new Date(l.saved).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  const pinnedCls  = l.pinned ? 'pinned' : '';
  const selCls     = selectedIds.has(l.id) ? 'selected' : '';
  const checkedCls = selectedIds.has(l.id) ? 'checked' : '';
  const catLabels  = getCatLabels(l);
  const isBroken   = healthScanResults.broken.includes(l.id);
  const isDupe     = healthScanResults.dupes.includes(l.id);
  const brokenCls  = isBroken ? 'broken' : '';
  const dupeCls    = isDupe ? 'duplicate' : '';
  const clicks     = l.clicks || 0;
  const clickCls   = clicks >= 10 ? 'popular' : '';

  return `<div class="link-card ${pinnedCls} ${selCls} ${brokenCls} ${dupeCls}"
    onclick="handleCardClick(event,'${escHtml(l.id)}','${escHtml(l.url)}')">
    <div class="card-checkbox ${checkedCls}" onclick="event.stopPropagation();toggleSelect('${l.id}')">${selectedIds.has(l.id)?'✓':''}</div>
    <div class="card-name-row">
      <span class="card-title">${escHtml(l.name)}</span>
      <div class="card-actions">
        <button class="btn-icon star ${l.pinned?'pinned-active':''}"
          onclick="event.stopPropagation();togglePin('${l.id}')"
          title="${l.pinned?'Unpin':'Pin'}">★</button>
        <button class="btn-icon" onclick="event.stopPropagation();openEdit('${l.id}')" title="Edit">✎</button>
        <button class="btn-icon del" onclick="event.stopPropagation();confirmDeleteLink('${l.id}')" title="Delete">✕</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-domain-row">
        <div class="favicon">${faviconUrl
          ? `<img src="${faviconUrl}" onerror="this.parentElement.textContent='🔗'">`
          : '🔗'}</div>
        <span class="card-url">${escHtml(domain || l.url)}</span>
      </div>
      ${catLabels.length ? `<div class="card-cats">${catLabels.map(cl => `<span class="card-cat">${escHtml(cl)}</span>`).join('')}</div>` : ''}
      ${isBroken ? `<span class="status-chip chip-broken">⚠ Broken link</span>` : ''}
      ${isDupe   ? `<span class="status-chip chip-duplicate">⊕ Duplicate</span>` : ''}
      <div class="card-meta">
        ${clicks > 0 ? `<span class="card-clicks ${clickCls}">↗ ${clicks} visit${clicks!==1?'s':''}</span>` : ''}
        <span class="card-date">${dateStr}</span>
      </div>
    </div>
  </div>`;
}

async function handleCardClick(e, id, url) {
  if (e.target.closest('.card-actions') || e.target.closest('.card-checkbox')) return;
  if (selectModeOn) { toggleSelect(id); return; }
  // Track click
  const updated = await dbIncrementClick(id);
  if (updated) {
    const link = links.find(l => l.id === id);
    if (link) { link.clicks = updated.clicks; link.lastVisit = updated.lastVisit; }
  }
  window.open(url, '_blank', 'noopener');
}

/* ── Pin ────────────────────────────────────────────────── */
async function togglePin(id) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  link.pinned = !link.pinned;
  await dbPutLink(link);
  sortLinks();
  renderLinks();
  toast(link.pinned ? '⭐ Pinned' : 'Unpinned');
}

/* ── Sort ───────────────────────────────────────────────── */
function setSort(mode) {
  sortMode = mode;
  sortLinks();
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === mode)
  );
  renderLinks();
}

/* ── Bulk selection ─────────────────────────────────────── */
function toggleSelectMode() {
  selectModeOn = !selectModeOn;
  if (!selectModeOn) { selectedIds.clear(); }
  document.body.classList.toggle('select-mode', selectModeOn);
  updateBulkBar();
  renderLinks();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
  // Update just this card cheaply
  const cards = document.querySelectorAll('.link-card');
  renderLinks(); // re-render to update checkboxes
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const n   = selectedIds.size;
  if (n > 0 && selectModeOn) {
    bar.classList.add('visible');
    document.getElementById('bulkCount').textContent = `${n} link${n!==1?'s':''} selected`;
  } else {
    bar.classList.remove('visible');
  }
}

function selectAll() {
  const view = getActiveLinks();
  view.forEach(l => selectedIds.add(l.id));
  updateBulkBar();
  renderLinks();
}

function deselectAll() {
  selectedIds.clear();
  updateBulkBar();
  renderLinks();
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  showConfirm(
    `Delete ${selectedIds.size} link${selectedIds.size!==1?'s':''}?`,
    'This cannot be undone.',
    async () => {
      for (const id of selectedIds) await dbDeleteLink(id);
      links = links.filter(l => !selectedIds.has(l.id));
      selectedIds.clear();
      toggleSelectMode();
      renderSidebar();
      renderLinks();
      updateStats();
      toast(`Deleted links`);
    }
  );
}

function bulkMove() {
  if (!selectedIds.size) return;
  openMoveModal();
}

async function bulkExport() {
  if (!selectedIds.size) return;
  const toExport = links.filter(l => selectedIds.has(l.id));
  const data = {
    exported:   new Date().toISOString(),
    categories: categories.map(c => ({ id: c.id, name: c.name, parent: c.parent })),
    links:      toExport,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `linkshelf-export-${Date.now()}.json`;
  a.click();
  toast(`Exported ${toExport.length} links`);
}

/* ── Move modal ─────────────────────────────────────────── */
function openMoveModal() {
  const list = document.getElementById('moveCatList');
  list.innerHTML = categories.map(c => {
    const label = c.parent ? getCatLabel(c.id) : c.name;
    return `<li class="move-cat-item" onclick="executeBulkMove('${escHtml(c.id)}')">${escHtml(label)}</li>`;
  }).join('');
  document.getElementById('moveOverlay').classList.add('open');
}
function closeMoveModal() {
  document.getElementById('moveOverlay').classList.remove('open');
}
async function executeBulkMove(catId) {
  for (const id of selectedIds) {
    const link = links.find(l => l.id === id);
    if (link) { link.cat = catId; await dbPutLink(link); }
  }
  selectedIds.clear();
  toggleSelectMode();
  closeMoveModal();
  renderSidebar();
  renderLinks();
  toast('Links moved');
}

/* ── Stats ──────────────────────────────────────────────── */
function updateStats() {
  document.getElementById('statLinks').textContent = links.length;
  document.getElementById('statCats').textContent  = categories.length;
  document.getElementById('statClicks').textContent = links.reduce((s,l) => s + (l.clicks||0), 0);
}

/* ── CRUD — Categories ──────────────────────────────────── */
async function addCategory(parentId = null) {
  const inputId = parentId ? 'newSubcatInput' : 'newCatInput';
  const input   = document.getElementById(inputId);
  const name    = input.value.trim();
  if (!name) return;
  if (categories.some(c => c.name === name && c.parent === parentId)) {
    toast('Category already exists'); return;
  }
  const id  = uid();
  const cat = { id, name, parent: parentId };
  await dbPutCategory(cat);
  categories.push(cat);
  categories.sort((a, b) => a.name.localeCompare(b.name));
  input.value = '';
  renderSidebar();
  toast('Category added');
}

async function deleteCategory(id) {
  const children = categories.filter(c => c.parent === id);
  // Delete children first
  for (const child of children) {
    const affectedLinks = links.filter(l => l.cat === child.id);
    for (const l of affectedLinks) { l.cat = ''; await dbPutLink(l); }
    await dbDeleteCategory(child.id);
  }
  // Move links from this cat to uncategorised
  const affected = links.filter(l => l.cat === id);
  for (const l of affected) { l.cat = ''; await dbPutLink(l); }
  await dbDeleteCategory(id);
  categories = categories.filter(c => c.id !== id && c.parent !== id);
  if (activeCategory === id) { activeCategory = 'All'; document.getElementById('viewLabel').textContent = 'All'; }
  renderSidebar();
  renderLinks();
  updateStats();
  toast('Category deleted');
}

function openEditCat(id) {
  editingCatId = id;
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('editCatInput').value = cat.name;
  document.getElementById('editCatOverlay').classList.add('open');
  setTimeout(() => document.getElementById('editCatInput').select(), 60);
}
function closeEditCat() {
  document.getElementById('editCatOverlay').classList.remove('open');
  editingCatId = null;
}
async function saveEditCat() {
  const newName = document.getElementById('editCatInput').value.trim();
  if (!newName || !editingCatId) { closeEditCat(); return; }
  const cat = categories.find(c => c.id === editingCatId);
  if (!cat || cat.name === newName) { closeEditCat(); return; }
  if (categories.some(c => c.name === newName && c.parent === cat.parent && c.id !== editingCatId)) {
    toast('Name already exists'); return;
  }
  cat.name = newName;
  await dbPutCategory(cat);
  if (activeCategory === editingCatId) document.getElementById('viewLabel').textContent = newName;
  categories.sort((a, b) => a.name.localeCompare(b.name));
  closeEditCat();
  renderSidebar();
  renderLinks();
  toast('Category renamed');
}

/* Subfolder dialog */
let addSubcatParent = null;
function openAddSubcat(parentId) {
  addSubcatParent = parentId;
  const parent = categories.find(c => c.id === parentId);
  document.getElementById('subcatParentName').textContent = parent ? parent.name : '';
  document.getElementById('newSubcatInput').value = '';
  document.getElementById('addSubcatOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newSubcatInput').focus(), 60);
}
function closeAddSubcat() {
  document.getElementById('addSubcatOverlay').classList.remove('open');
  addSubcatParent = null;
}
async function saveAddSubcat() {
  if (addSubcatParent) await addCategory(addSubcatParent);
  closeAddSubcat();
}

/* ── CRUD — Links ───────────────────────────────────────── */
async function deleteLink(id) {
  await dbDeleteLink(id);
  links = links.filter(l => l.id !== id);
  renderSidebar();
  renderLinks();
  updateStats();
  toast('Link removed');
}

function populateCatSelect(selectedIds_) {
  const sel = document.getElementById('fCat');
  const selected = Array.isArray(selectedIds_) ? selectedIds_ : (selectedIds_ ? [selectedIds_] : []);
  const topLevel = categories.filter(c => !c.parent);
  if (!topLevel.length) {
    sel.innerHTML = '<div class="cat-check-empty">No categories yet</div>';
    return;
  }
  let html = '';
  for (const cat of topLevel) {
    const children = categories.filter(c => c.parent === cat.id);
    const chk = selected.includes(cat.id) ? 'checked' : '';
    html += `<label class="cat-check-item"><input type="checkbox" value="${escHtml(cat.id)}" ${chk}><span>${escHtml(cat.name)}</span></label>`;
    for (const sub of children) {
      const subChk = selected.includes(sub.id) ? 'checked' : '';
      html += `<label class="cat-check-item sub"><input type="checkbox" value="${escHtml(sub.id)}" ${subChk}><span>↳ ${escHtml(sub.name)}</span></label>`;
    }
  }
  sel.innerHTML = html;
}
function getSelectedCats() {
  const sel = document.getElementById('fCat');
  return [...sel.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
}

function openModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add link';
  document.getElementById('fName').value  = '';
  document.getElementById('fUrl').value   = '';
  document.getElementById('fNotes').value = '';
  const defaultCat = (activeCategory !== 'All' && activeCategory !== 'pinned')
    ? [activeCategory] : [];
  populateCatSelect(defaultCat);
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('fUrl').focus(), 50);
}

function openEdit(id) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit link';
  document.getElementById('fName').value  = link.name;
  document.getElementById('fUrl').value   = link.url;
  document.getElementById('fNotes').value = link.notes || '';
  populateCatSelect(link.cats || (link.cat ? [link.cat] : []));
  document.getElementById('overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
}

async function saveLink() {
  const name  = document.getElementById('fName').value.trim();
  let   url   = document.getElementById('fUrl').value.trim();
  const cats  = getSelectedCats();
  const notes = document.getElementById('fNotes').value.trim();

  if (!url) {
    showFieldError('fUrl', 'Please enter a URL.');
    return;
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch(e) {
    showFieldError('fUrl', 'Please enter a valid URL (e.g. https://example.com).');
    return;
  }

  const displayName = name || (() => { try { return new URL(url).hostname; } catch(e) { return url; } })();
  const isEdit = !!editingId;

  if (isEdit) {
    const existing = links.find(l => l.id === editingId);
    if (existing) {
      existing.name  = displayName;
      existing.url   = url;
      existing.cats  = cats;
      existing.cat   = cats[0] || '';   // backward compat
      existing.notes = notes;
      await dbPutLink(existing);
    }
  } else {
    const newLink = {
      id: uid(), name: displayName, url, cats, cat: cats[0] || '', notes,
      saved: Date.now(), pinned: false,
      clicks: 0, lastVisit: null,
    };
    await dbPutLink(newLink);
    links.unshift(newLink);
  }

  sortLinks();
  closeModal();
  renderSidebar();
  renderLinks();
  updateStats();
  toast(isEdit ? 'Link updated' : 'Link saved ✓');
}

/* ── Export all ─────────────────────────────────────────── */
function exportData() {
  const data = {
    exported:   new Date().toISOString(),
    categories: categories.map(c => ({ id: c.id, name: c.name, parent: c.parent })),
    links,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `linkshelf-${Date.now()}.json`;
  a.click();
  toast('Exported!');
}

/* ── Import ─────────────────────────────────────────────── */
async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    let added = 0;
    if (data.categories) {
      for (const c of data.categories) {
        if (!categories.find(x => x.id === c.id)) {
          await dbPutCategory(c);
          categories.push(c);
          added++;
        }
      }
    }
    if (data.links) {
      for (const l of data.links) {
        if (!links.find(x => x.id === l.id)) {
          await dbPutLink(l);
          links.push(l);
          added++;
        }
      }
    }
    sortLinks();
    renderSidebar();
    renderLinks();
    updateStats();
    toast(`Imported ${added} items`);
  } catch(e) {
    toast('Import failed — invalid file');
  }
}

/* ── Settings modal ─────────────────────────────────────── */
function openSettings()  { document.getElementById('settingsOverlay').classList.add('open'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('open'); }

/* ── Confirm dialog ─────────────────────────────────────── */
function showConfirm(msg, sub, cb) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmSub').textContent = sub;
  document.getElementById('confirmBtn').onclick = () => { closeConfirm(); cb(); };
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

function confirmDeleteLink(id) {
  const link = links.find(l => l.id === id);
  if (!link) return;
  showConfirm(`Delete "${link.name}"?`, 'This link will be permanently removed.', () => deleteLink(id));
}
function confirmDeleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  showConfirm(`Delete category "${cat.name}"?`, 'Links in this category will become uncategorised. Subfolders will also be removed.', () => deleteCategory(id));
}
async function confirmClearAll() {
  closeSettings();
  showConfirm('Clear all data?', 'This permanently erases all links and categories. Cannot be undone.', async () => {
    await dbDeleteAllLinks();
    await dbDeleteAllCategories();
    links = []; categories = [];
    renderSidebar();
    renderLinks();
    updateStats();
    toast('All data cleared');
  });
}

/* ── Health scan ────────────────────────────────────────── */
let scanAbort = false;

async function runHealthScan() {
  document.getElementById('healthOverlay').classList.add('open');
  scanAbort = false;
  healthScanResults = { broken: [], dupes: [] };

  const prog    = document.getElementById('scanProgress');
  const progBar = document.getElementById('scanProgressBar');
  const results = document.getElementById('scanResults');
  results.innerHTML = '';
  prog.style.display = '';

  const total = links.length;
  let checked = 0;

  // Duplicate detection (same URL)
  const urlMap = {};
  for (const l of links) {
    const key = l.url.toLowerCase().trim();
    if (!urlMap[key]) urlMap[key] = [];
    urlMap[key].push(l.id);
  }
  const dupeGroups = Object.values(urlMap).filter(g => g.length > 1);
  for (const group of dupeGroups) {
    group.slice(1).forEach(id => healthScanResults.dupes.push(id)); // mark all but first
  }

  // Broken link detection via fetch with no-cors
  const broken = [];
  for (let i = 0; i < links.length; i++) {
    if (scanAbort) break;
    const l = links[i];
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(l.url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
      clearTimeout(timeoutId);
      // no-cors always succeeds if server responds; only AbortError or TypeError = dead
    } catch(e) {
      if (e.name === 'AbortError') {
        broken.push(l.id); // timed out — likely broken
      }
      // TypeError: network error or CORS — we treat as possibly broken
      if (e.name === 'TypeError') {
        broken.push(l.id);
      }
    }
    checked++;
    const pct = Math.round((checked / total) * 100);
    progBar.style.width = pct + '%';
    document.getElementById('scanStatus').textContent = `Checking ${checked} / ${total}…`;
  }

  healthScanResults.broken = broken;
  prog.style.display = 'none';

  // Render results
  let html = '';
  if (dupeGroups.length > 0) {
    html += `<div class="health-section-title">⊕ Duplicates (${dupeGroups.length} groups)</div>`;
    for (const group of dupeGroups) {
      const items = group.map(id => links.find(l => l.id === id)).filter(Boolean);
      for (const item of items) {
        html += `<div class="health-item">
          <div>
            <div class="hi-title">${escHtml(item.name)}</div>
            <div class="hi-url">${escHtml(item.url)}</div>
          </div>
          <span class="health-status hs-dupe">Duplicate</span>
          <button class="btn-danger-sm hi-action" onclick="deleteLink('${item.id}');document.getElementById('healthOverlay').classList.remove('open')">Remove</button>
        </div>`;
      }
    }
  }

  if (broken.length > 0) {
    html += `<div class="health-section-title">⚠ Possibly broken (${broken.length})</div>`;
    for (const id of broken) {
      const item = links.find(l => l.id === id);
      if (!item) continue;
      html += `<div class="health-item">
        <div>
          <div class="hi-title">${escHtml(item.name)}</div>
          <div class="hi-url">${escHtml(item.url)}</div>
        </div>
        <span class="health-status hs-broken">Unreachable</span>
        <button class="btn-danger-sm hi-action" onclick="deleteLink('${item.id}');document.getElementById('healthOverlay').classList.remove('open')">Remove</button>
      </div>`;
    }
  }

  if (!broken.length && !dupeGroups.length) {
    html = `<div style="text-align:center;padding:40px 20px;color:var(--muted)">
      <div style="font-size:32px;margin-bottom:12px">✓</div>
      <div style="font-size:13px">All links look healthy!</div>
    </div>`;
  }

  results.innerHTML = html;
  renderLinks(); // update cards with status chips
}

function closeHealthScan() {
  scanAbort = true;
  document.getElementById('healthOverlay').classList.remove('open');
}

/* ── Background color ───────────────────────────────────── */
function bgKey() { return 'lv_bg_v3'; }

function initColorPicker() {
  const saved = localStorage.getItem(bgKey()) || DEFAULT_BG;
  applyBg(saved, false);
  document.getElementById('customColorInput').value = saved;

  const grid = document.getElementById('presetSwatches');
  grid.innerHTML = '';
  BG_PRESETS.forEach(color => {
    const sw     = document.createElement('div');
    sw.className = 'preset-swatch' + (color === saved ? ' active' : '');
    sw.style.background = color;
    sw.style.border     = color === '#ffffff' ? '2px solid #e2e0d8' : '2px solid transparent';
    sw.title   = color;
    sw.onclick = () => { applyBg(color); closeColorPopover(); };
    grid.appendChild(sw);
  });
}

function applyBg(color, save = true) {
  const r    = parseInt(color.slice(1,3)||'f5', 16);
  const g    = parseInt(color.slice(3,5)||'f4', 16);
  const b    = parseInt(color.slice(5,7)||'f0', 16);
  const luma = 0.299*r + 0.587*g + 0.114*b;
  const dark = luma < 128;

  // Pinned card = same hue as bg, darkened (light) or lightened (dark) by ~12%
  const df = dark ? 1.18 : 0.87;
  const pinnedR = Math.min(255, Math.max(0, Math.round(r * df)));
  const pinnedG = Math.min(255, Math.max(0, Math.round(g * df)));
  const pinnedB = Math.min(255, Math.max(0, Math.round(b * df)));
  const pinnedBg = `rgb(${pinnedR},${pinnedG},${pinnedB})`;
  // Border: a bit more contrast than the fill
  const bf = dark ? 1.38 : 0.70;
  const pinnedBorder = `rgb(${Math.min(255,Math.max(0,Math.round(r*bf)))},${Math.min(255,Math.max(0,Math.round(g*bf)))},${Math.min(255,Math.max(0,Math.round(b*bf)))})`;

  // Text: ensure high contrast against bg
  const textColor  = dark ? '#f0efeb' : '#1a1916';
  const mutedColor = dark ? 'rgba(240,239,235,0.5)' : '#8c8a84';

  const root = document.documentElement;
  root.style.setProperty('--bg',           color);
  root.style.setProperty('--surface',      dark ? 'rgba(255,255,255,0.08)' : '#ffffff');
  root.style.setProperty('--border',       dark ? 'rgba(255,255,255,0.13)' : '#e2e0d8');
  root.style.setProperty('--text',         textColor);
  root.style.setProperty('--muted',        mutedColor);
  root.style.setProperty('--tag-bg',       dark ? 'rgba(255,255,255,0.1)'  : '#eeede8');
  root.style.setProperty('--accent',       dark ? '#d4d0c8'                : '#2d2d2b');
  root.style.setProperty('--text-inv',     dark ? '#1a1916'                : '#ffffff');
  root.style.setProperty('--pinned-bg',    pinnedBg);
  root.style.setProperty('--pinned-border',pinnedBorder);
  // Sidebar pinned item: slightly less intense tint than card
  const sf = dark ? 1.10 : 0.93;
  const sidePinnedBg = `rgb(${Math.min(255,Math.max(0,Math.round(r*sf)))},${Math.min(255,Math.max(0,Math.round(g*sf)))},${Math.min(255,Math.max(0,Math.round(b*sf)))})`;
  root.style.setProperty('--pinned-sidebar-bg', sidePinnedBg);

  document.querySelectorAll('.preset-swatch').forEach(sw =>
    sw.classList.toggle('active', sw.title === color)
  );
  document.getElementById('customColorInput').value = '#' +
    [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');

  if (save) localStorage.setItem(bgKey(), color);
}

function resetBg() {
  localStorage.removeItem(bgKey());
  const root = document.documentElement;
  ['--bg','--surface','--border','--text','--muted','--tag-bg','--accent','--text-inv','--pinned-bg','--pinned-border','--pinned-sidebar-bg']
    .forEach(v => root.style.removeProperty(v));
  document.querySelectorAll('.preset-swatch').forEach(sw =>
    sw.classList.toggle('active', sw.title === DEFAULT_BG)
  );
  document.getElementById('customColorInput').value = DEFAULT_BG;
  closeColorPopover();
  toast('Background reset');
}

function toggleColorPopover(e) {
  e.stopPropagation();
  document.getElementById('colorPopover').classList.toggle('open');
}
function closeColorPopover() {
  document.getElementById('colorPopover').classList.remove('open');
}

/* ── Toast ──────────────────────────────────────────────── */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ── Link Preview ───────────────────────────────────────── */
// Sites known to block iframes — show screenshot immediately
const BLOCKED_DOMAINS = [
  'youtube.com','youtu.be','google.com','facebook.com','instagram.com',
  'twitter.com','x.com','linkedin.com','tiktok.com','netflix.com',
  'reddit.com','amazon.com','apple.com','microsoft.com','github.com',
  'twitch.tv','discord.com','whatsapp.com','telegram.org','notion.so',
  'figma.com','canva.com','dropbox.com','drive.google.com','docs.google.com',
];

function isBlockedDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return BLOCKED_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

function openPreview(id, url, name) {
  const overlay = document.getElementById('previewOverlay');
  const titleEl = document.getElementById('previewTitle');
  const urlEl   = document.getElementById('previewUrl');
  const frame   = document.getElementById('previewFrame');
  const status  = document.getElementById('previewStatus');

  titleEl.textContent = decodeURIComponent(name);
  urlEl.textContent   = url;
  frame.src = '';
  frame.style.display = 'none';
  status.style.display = '';
  overlay.classList.add('open');

  document.getElementById('previewOpenBtn').onclick = () => window.open(url, '_blank', 'noopener');

  if (isBlockedDomain(url)) {
    showPreviewFallback(url, status, frame);
    return;
  }

  // Try iframe, bail out quickly if blocked
  status.innerHTML = `<span style="color:var(--muted);font-size:13px">⏳ Loading preview…</span>`;

  let loaded = false;
  frame.onload = () => {
    loaded = true;
    // Check if the iframe actually loaded content or got blocked (blank doc)
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc || doc.body === null || doc.title === '' && doc.body.innerHTML.trim() === '') {
        showPreviewFallback(url, status, frame);
        return;
      }
    } catch(e) {
      // Cross-origin — probably loaded fine
    }
    status.style.display = 'none';
    frame.style.display = '';
  };

  frame.onerror = () => showPreviewFallback(url, status, frame);

  setTimeout(() => { frame.src = url; }, 80);

  // If still loading after 4s, assume blocked
  setTimeout(() => {
    if (!loaded) showPreviewFallback(url, status, frame);
  }, 4000);
}

function showPreviewFallback(url, status, frame) {
  frame.src = '';
  frame.style.display = 'none';
  // Use a free screenshot/thumbnail service
  const screenshotUrl = `https://image.thum.io/get/width/900/crop/600/noanimate/${encodeURIComponent(url)}`;
  status.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 20px">
      <div style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:4px">
        🖼 Site preview (live embedding blocked by this site)
      </div>
      <img src="${escHtml(screenshotUrl)}"
        style="width:100%;max-width:820px;border-radius:10px;border:1px solid var(--border);box-shadow:0 4px 24px rgba(0,0,0,0.10);display:block"
        onerror="this.parentElement.innerHTML='<div style=\'color:var(--muted);font-size:13px;text-align:center;padding:40px 0\'>🚫 Preview unavailable for this site.<br><br><a href=&quot;${escHtml(url)}&quot; target=\'_blank\' rel=\'noopener\' style=\'color:var(--accent);text-decoration:none;border:1px solid var(--border);border-radius:8px;padding:8px 18px;display:inline-block;margin-top:8px\'>↗ Open in new tab</a></div>'"
        alt="Page preview">
      <a href="${escHtml(url)}" target="_blank" rel="noopener"
        style="color:var(--accent);font-size:12px;text-decoration:none;opacity:0.7">
        ↗ Open ${escHtml(getHostname(url))} in new tab
      </a>
    </div>`;
}

function closePreview() {
  const overlay = document.getElementById('previewOverlay');
  const frame   = document.getElementById('previewFrame');
  overlay.classList.remove('open');
  frame.src = ''; // stop loading
}


document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); closeEditCat(); closeConfirm(); closeSettings();
    closeColorPopover(); closeMoveModal(); closeHealthScan(); closeAddSubcat();
    if (selectModeOn) { selectModeOn = false; selectedIds.clear(); document.body.classList.remove('select-mode'); updateBulkBar(); renderLinks(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openModal(); }
});

document.addEventListener('click', e => {
  if (!document.getElementById('colorWrap').contains(e.target)) closeColorPopover();
});

/* ── Entry point ────────────────────────────────────────── */
(async () => {
  try {
    await openDB();
    await bootApp();
  } catch(err) {
    console.error('Boot error:', err);
  }
})();
