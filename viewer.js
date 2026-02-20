'use strict';

// ============================================================
//  Constants
// ============================================================
const DB_NAME    = 'book-viewer';
const DB_VERSION = 1;
const DEMO_ID    = '__demo__';
const DEMO_TOTAL = 10;

// ============================================================
//  State
// ============================================================
let db              = null;
let currentBook     = null;   // { id, title, totalPages, direction, blankFirstPage, padding }
let currentSpread   = 0;      // spreadStart index
let jumpHistory     = { stack: [], cursor: -1 };
let pendingDeleteId = null;
let demoCache       = {};     // pageNum → ObjectURL (cached demo images)
let prevObjectURLs  = [];     // Object URLs from the previous spread (to revoke)

// ============================================================
//  IndexedDB helpers
// ============================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('books')) {
        database.createObjectStore('books', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('images')) {
        database.createObjectStore('images', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbDeleteByPrefix(prefix) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('images', 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    const req = tx.objectStore('images').openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (cursor.key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

// ============================================================
//  Demo Book
// ============================================================
function getDemoBook() {
  return {
    id:             DEMO_ID,
    title:          'Demo Book',
    totalPages:     DEMO_TOTAL,
    direction:      'ltr',
    blankFirstPage: false,
    padding:        0,
    isDemo:         true,
  };
}

function getDemoPageURL(pageNum) {
  if (demoCache[pageNum]) return Promise.resolve(demoCache[pageNum]);

  return new Promise((resolve) => {
    const canvas  = document.createElement('canvas');
    canvas.width  = 600;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 900);
    grad.addColorStop(0, '#1c2b3a');
    grad.addColorStop(1, '#0e1820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 900);

    // Border
    ctx.strokeStyle = '#3a6ea5';
    ctx.lineWidth   = 3;
    ctx.strokeRect(16, 16, 568, 868);

    // Title
    ctx.fillStyle    = '#7aaed4';
    ctx.font         = 'bold 52px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Demo Book', 300, 340);

    // Page number
    ctx.fillStyle = '#aaccee';
    ctx.font      = '36px sans-serif';
    ctx.fillText(`Page ${pageNum} / ${DEMO_TOTAL}`, 300, 430);

    // Footer
    ctx.fillStyle = '#445566';
    ctx.font      = '18px monospace';
    ctx.fillText('book-viewer', 300, 860);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      demoCache[pageNum] = url;
      resolve(url);
    }, 'image/png');
  });
}

// ============================================================
//  Utility
// ============================================================
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractLeadingNumber(filename) {
  const m = filename.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function getSpreadBounds(book) {
  const blankFirst = book.blankFirstPage;
  const total      = book.totalPages;
  const minSpread  = blankFirst ? 0 : 1;
  let   maxSpread;
  if (blankFirst) {
    // Spreads at 0, 2, 4, ...
    maxSpread = total % 2 === 0 ? total : total - 1;
  } else {
    // Spreads at 1, 3, 5, ...
    maxSpread = total % 2 === 1 ? total : total - 1;
  }
  return { minSpread, maxSpread };
}

// ============================================================
//  Library View
// ============================================================
function showLibraryView() {
  currentBook = null;
  document.body.className = 'view-library';
  history.replaceState(null, '', location.pathname);
  renderLibrary();
}

async function renderLibrary() {
  const grid  = document.getElementById('book-grid');
  grid.innerHTML = '';

  const books = await idbGetAll('books');
  for (const book of books) {
    grid.appendChild(await createBookCard(book, false));
  }

  // Demo card is always at the end
  grid.appendChild(await createBookCard(getDemoBook(), true));
}

async function createBookCard(book, isDemo) {
  const card     = document.createElement('div');
  card.className = 'book-card';

  // Cover image
  const img     = document.createElement('img');
  img.className = 'book-card-cover';
  img.alt       = book.title;
  if (isDemo) {
    img.src = await getDemoPageURL(1);
  } else {
    const imageData = await idbGet('images', `${book.id}/1`);
    if (imageData) {
      img.src = URL.createObjectURL(imageData.blob);
    }
  }

  // Info
  const info      = document.createElement('div');
  info.className  = 'book-card-info';
  const pagesText = isDemo ? '（お試し）' : `${book.totalPages} ページ`;
  info.innerHTML  = `
    <div class="book-card-title">${escapeHtml(book.title)}</div>
    <div class="book-card-pages">${pagesText}</div>
  `;

  card.appendChild(img);
  card.appendChild(info);

  // Delete button (demo is not deletable)
  if (!isDemo) {
    const btnDel      = document.createElement('button');
    btnDel.className  = 'btn-delete-book';
    btnDel.textContent = '✕';
    btnDel.title      = '削除';
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteConfirm(book.id, book.title);
    });
    card.appendChild(btnDel);
  }

  card.addEventListener('click', () => openBook(book.id, 1));
  return card;
}

// ============================================================
//  Reader View
// ============================================================
async function openBook(bookId, pageNum) {
  let book;
  if (bookId === DEMO_ID) {
    book = getDemoBook();
  } else {
    book = await idbGet('books', bookId);
    if (!book) {
      showLibraryView();
      return;
    }
  }

  currentBook = book;

  // Clamp pageNum to valid range
  pageNum = Math.max(1, Math.min(pageNum, book.totalPages));

  const spread = pageNumToSpreadStart(pageNum, book);

  // Initialise jump history
  jumpHistory = { stack: [spread], cursor: 0 };

  document.getElementById('reader-title').textContent  = book.title;
  document.getElementById('jump-range').textContent    = `1〜${book.totalPages}`;
  document.body.className = 'view-reader';

  await showSpread(spread);
}

function pageNumToSpreadStart(pageNum, book) {
  if (book.blankFirstPage) {
    // Spreads at 0, 2, 4, ...
    // odd  pageNum → spreadStart = pageNum - 1
    // even pageNum → spreadStart = pageNum
    return pageNum % 2 === 0 ? pageNum : pageNum - 1;
  } else {
    // Spreads at 1, 3, 5, ...
    // odd  pageNum → spreadStart = pageNum
    // even pageNum → spreadStart = pageNum - 1
    return pageNum % 2 === 1 ? pageNum : pageNum - 1;
  }
}

async function showSpread(spreadStart) {
  currentSpread = spreadStart;
  const book    = currentBook;

  // Revoke previous Object URLs to prevent memory leaks
  for (const url of prevObjectURLs) {
    URL.revokeObjectURL(url);
  }
  prevObjectURLs = [];

  const imgLeft   = document.getElementById('page-left');
  const imgRight  = document.getElementById('page-right');
  const slotLeft  = document.getElementById('slot-left');
  const slotRight = document.getElementById('slot-right');

  // Determine which page numbers go to each side
  let leftPageNum, rightPageNum;
  if (book.direction === 'rtl') {
    // RTL: left side of screen = later page (higher number)
    //      right side of screen = earlier page (lower number)
    leftPageNum  = spreadStart + 1;
    rightPageNum = spreadStart;
  } else {
    // LTR: left side = earlier page, right side = later page
    leftPageNum  = spreadStart;
    rightPageNum = spreadStart + 1;
  }

  // Apply padding from book.json
  imgLeft.style.padding  = book.padding + 'px';
  imgRight.style.padding = book.padding + 'px';

  async function loadPage(img, slot, pageNum) {
    const isValidPage = pageNum >= 1 && pageNum <= book.totalPages;
    if (!isValidPage) {
      img.style.display = 'none';
      img.src = '';
      slot.classList.add('empty');
      return;
    }

    img.style.display = '';
    slot.classList.remove('empty');

    let url;
    if (book.id === DEMO_ID) {
      url = await getDemoPageURL(pageNum);
      // Demo URLs are cached; don't add to prevObjectURLs
    } else {
      const imageData = await idbGet('images', `${book.id}/${pageNum}`);
      if (imageData) {
        url = URL.createObjectURL(imageData.blob);
        prevObjectURLs.push(url);
      } else {
        url = '';
      }
    }
    img.src = url;
  }

  await Promise.all([
    loadPage(imgLeft,  slotLeft,  leftPageNum),
    loadPage(imgRight, slotRight, rightPageNum),
  ]);

  // Update page info in header
  // Display in reading order
  const displayPages = [];
  if (book.direction === 'rtl') {
    if (rightPageNum >= 1 && rightPageNum <= book.totalPages) displayPages.push(rightPageNum);
    if (leftPageNum  >= 1 && leftPageNum  <= book.totalPages) displayPages.push(leftPageNum);
  } else {
    if (leftPageNum  >= 1 && leftPageNum  <= book.totalPages) displayPages.push(leftPageNum);
    if (rightPageNum >= 1 && rightPageNum <= book.totalPages) displayPages.push(rightPageNum);
  }
  let pageInfo;
  if (displayPages.length === 2) {
    pageInfo = `p.${displayPages[0]}-${displayPages[1]} / ${book.totalPages}`;
  } else if (displayPages.length === 1) {
    pageInfo = `p.${displayPages[0]} / ${book.totalPages}`;
  } else {
    pageInfo = '';
  }
  document.getElementById('reader-page-info').textContent = pageInfo;

  updateURL();
}

function updateURL() {
  if (!currentBook || currentBook.id === DEMO_ID) return;

  // Use spreadStart as the URL page (or 1 if spreadStart is 0)
  const urlPage = currentSpread > 0 ? currentSpread : 1;
  history.replaceState(
    null, '',
    `?book=${encodeURIComponent(currentBook.id)}&page=${urlPage}`
  );
}

// ============================================================
//  Navigation
// ============================================================
function navigate(delta) {
  const book = currentBook;
  if (!book) return;

  const { minSpread, maxSpread } = getSpreadBounds(book);
  const next = Math.max(minSpread, Math.min(currentSpread + delta, maxSpread));

  if (next !== currentSpread) {
    showSpread(next);
  }
}

async function navigateHistory(delta) {
  const newCursor = jumpHistory.cursor + delta;
  if (newCursor < 0 || newCursor >= jumpHistory.stack.length) return;

  jumpHistory.cursor = newCursor;
  await showSpread(jumpHistory.stack[newCursor]);
}

// ============================================================
//  Upload
// ============================================================
async function handleAddBook() {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (e) {
    // User cancelled (AbortError) — do nothing silently
    if (e.name !== 'AbortError') {
      showError('フォルダの選択に失敗しました: ' + e.message);
    }
    return;
  }

  const bookId = dirHandle.name;

  // Check for duplicate
  const existing = await idbGet('books', bookId);
  if (existing) {
    showError(`「${bookId}」は既に登録されています。削除してから追加してください。`);
    return;
  }

  // Read and parse book.json
  let meta;
  try {
    const jsonHandle = await dirHandle.getFileHandle('book.json');
    const jsonFile   = await jsonHandle.getFile();
    const jsonText   = await jsonFile.text();
    meta = JSON.parse(jsonText);
  } catch (e) {
    if (e instanceof SyntaxError) {
      showError('book.json の形式が不正です: ' + e.message);
    } else {
      showError('book.json が見つかりません。フォルダ内に book.json を配置してください。');
    }
    return;
  }

  // Validate required fields
  if (!meta.title || typeof meta.title !== 'string' || meta.title.trim() === '') {
    showError('book.json に "title" フィールド（文字列）が必要です。');
    return;
  }
  if (meta.direction !== 'rtl' && meta.direction !== 'ltr') {
    showError('book.json の "direction" は "rtl" または "ltr" を指定してください。');
    return;
  }

  // Collect image files
  const imageFiles = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const lower = name.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) continue;
    imageFiles.push({ name, handle });
  }

  if (imageFiles.length === 0) {
    showError('画像ファイルが見つかりません。.png / .jpg / .jpeg ファイルをフォルダに置いてください。');
    return;
  }

  // Sort: leading number → numeric order; otherwise alphabetical
  imageFiles.sort((a, b) => {
    const na = extractLeadingNumber(a.name);
    const nb = extractLeadingNumber(b.name);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  const totalPages = imageFiles.length;

  // Show progress bar
  const progEl      = document.getElementById('upload-progress');
  const progCurrent = document.getElementById('progress-current');
  const progTotal   = document.getElementById('progress-total');
  progTotal.textContent   = totalPages;
  progCurrent.textContent = 0;
  progEl.classList.remove('hidden');

  // Save images one by one
  try {
    for (let i = 0; i < imageFiles.length; i++) {
      const { handle } = imageFiles[i];
      const file = await handle.getFile();
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'image/png' });
      const key  = `${bookId}/${i + 1}`;
      await idbPut('images', { key, blob });
      progCurrent.textContent = i + 1;
    }
  } catch (e) {
    progEl.classList.add('hidden');
    if (e.name === 'QuotaExceededError') {
      showError('ストレージの空き容量が不足しています。不要なデータを削除してから再試行してください。');
    } else {
      showError('保存中にエラーが発生しました: ' + e.message);
    }
    return;
  }

  // Save book metadata only after all images are stored
  const book = {
    id:             bookId,
    title:          meta.title.trim(),
    totalPages,
    direction:      meta.direction,
    blankFirstPage: !!meta.blankFirstPage,
    padding:        typeof meta.padding === 'number' ? meta.padding : 0,
  };
  await idbPut('books', book);

  progEl.classList.add('hidden');
  await renderLibrary();
}

// ============================================================
//  Deletion
// ============================================================
function showDeleteConfirm(bookId, title) {
  pendingDeleteId = bookId;
  document.getElementById('delete-confirm-message').textContent =
    `「${title}」を削除しますか？この操作は元に戻せません。`;
  document.getElementById('delete-confirm-dialog').classList.remove('hidden');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;

  const id       = pendingDeleteId;
  pendingDeleteId = null;
  document.getElementById('delete-confirm-dialog').classList.add('hidden');

  await idbDelete('books', id);
  await idbDeleteByPrefix(`${id}/`);
  await renderLibrary();
}

function cancelDelete() {
  pendingDeleteId = null;
  document.getElementById('delete-confirm-dialog').classList.add('hidden');
}

// ============================================================
//  Jump Dialog
// ============================================================
function showJumpDialog() {
  const book = currentBook;
  if (!book) return;

  const input = document.getElementById('jump-input');
  input.max   = book.totalPages;
  input.value = '';
  document.getElementById('jump-dialog').classList.remove('hidden');
  input.focus();
}

function closeJumpDialog() {
  document.getElementById('jump-dialog').classList.add('hidden');
}

async function confirmJump() {
  const book = currentBook;
  if (!book) return;

  const input   = document.getElementById('jump-input');
  let   pageNum = parseInt(input.value, 10);
  if (isNaN(pageNum)) {
    closeJumpDialog();
    return;
  }

  // Clamp to valid range
  pageNum = Math.max(1, Math.min(pageNum, book.totalPages));
  const spread = pageNumToSpreadStart(pageNum, book);

  closeJumpDialog();

  // Update jump history: cut forward entries, then append
  const newStack = jumpHistory.stack.slice(0, jumpHistory.cursor + 1);
  newStack.push(spread);
  jumpHistory = { stack: newStack, cursor: newStack.length - 1 };

  await showSpread(spread);
}

// ============================================================
//  Help Dialog
// ============================================================
function showHelpDialog() {
  document.getElementById('help-dialog').classList.remove('hidden');
}

function closeHelpDialog() {
  document.getElementById('help-dialog').classList.add('hidden');
}

// ============================================================
//  Error Dialog
// ============================================================
function showError(message) {
  document.getElementById('upload-error-message').textContent = message;
  document.getElementById('upload-error-dialog').classList.remove('hidden');
}

// ============================================================
//  Keyboard Handler
// ============================================================
function handleKeyDown(e) {
  const jumpOpen = !document.getElementById('jump-dialog').classList.contains('hidden');
  const helpOpen = !document.getElementById('help-dialog').classList.contains('hidden');
  const delOpen  = !document.getElementById('delete-confirm-dialog').classList.contains('hidden');
  const errOpen  = !document.getElementById('upload-error-dialog').classList.contains('hidden');
  const anyOpen  = jumpOpen || helpOpen || delOpen || errOpen;
  const isReader = document.body.classList.contains('view-reader');

  // Escape: close the topmost open dialog
  if (e.key === 'Escape') {
    if (jumpOpen) { closeJumpDialog(); }
    else if (helpOpen) { closeHelpDialog(); }
    else if (delOpen)  { cancelDelete(); }
    else if (errOpen)  { document.getElementById('upload-error-dialog').classList.add('hidden'); }
    e.preventDefault();
    return;
  }

  // Enter inside jump dialog → confirm jump
  if (jumpOpen && e.key === 'Enter') {
    confirmJump();
    e.preventDefault();
    return;
  }

  // Block reader hotkeys if not in reader view or a dialog is open
  if (!isReader || anyOpen) return;

  if (e.ctrlKey) {
    switch (e.key) {
      case 'g':
        e.preventDefault();
        showJumpDialog();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateHistory(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateHistory(+1);
        break;
    }
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      navigate(currentBook?.direction === 'rtl' ? +2 : -2);
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigate(currentBook?.direction === 'rtl' ? -2 : +2);
      break;
    case '?':
      showHelpDialog();
      break;
  }
}

// ============================================================
//  Init
// ============================================================
async function init() {
  db = await openDB();

  // Button bindings
  document.getElementById('btn-add-book')
    .addEventListener('click', handleAddBook);

  document.getElementById('btn-back-library')
    .addEventListener('click', showLibraryView);

  document.getElementById('btn-error-close')
    .addEventListener('click', () => {
      document.getElementById('upload-error-dialog').classList.add('hidden');
    });

  document.getElementById('btn-delete-cancel')
    .addEventListener('click', cancelDelete);

  document.getElementById('btn-delete-confirm')
    .addEventListener('click', confirmDelete);

  document.getElementById('btn-jump-cancel')
    .addEventListener('click', closeJumpDialog);

  document.getElementById('btn-jump-confirm')
    .addEventListener('click', confirmJump);

  document.getElementById('btn-help-close')
    .addEventListener('click', closeHelpDialog);

  document.addEventListener('keydown', handleKeyDown);

  // Check URL query params for direct book/page link
  const params  = new URLSearchParams(location.search);
  const bookId  = params.get('book');
  const pageStr = params.get('page');

  if (bookId) {
    const pageNum = parseInt(pageStr, 10) || 1;
    await openBook(bookId, pageNum);
  } else {
    await renderLibrary();
  }
}

window.addEventListener('DOMContentLoaded', init);
