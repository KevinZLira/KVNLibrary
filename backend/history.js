'use strict';

const fs = require('fs');
const path = require('path');
const { appDataDir } = require('./config');

const HISTORY_FILE = path.join(appDataDir(), 'history.json');
const MAX_HISTORY_ITEMS = 100;

function loadAll() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      return { items: data.items || [], favorites: data.favorites || [] };
    }
  } catch (_) {
    // ignore corrupted file, start fresh
  }
  return { items: [], favorites: [] };
}

function saveAll(data) {
  fs.mkdirSync(appDataDir(), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function addImport(entry) {
  const data = loadAll();
  data.items.unshift(Object.assign({ importedAt: new Date().toISOString() }, entry));
  data.items = data.items.slice(0, MAX_HISTORY_ITEMS);
  saveAll(data);
  return data.items;
}

function listImports() {
  return loadAll().items;
}

function toggleFavorite(video) {
  const data = loadAll();
  const idx = data.favorites.findIndex((f) => f.videoId === video.videoId);
  if (idx >= 0) {
    data.favorites.splice(idx, 1);
  } else {
    data.favorites.unshift(Object.assign({ savedAt: new Date().toISOString() }, video));
  }
  saveAll(data);
  return data.favorites;
}

function listFavorites() {
  return loadAll().favorites;
}

function clearHistory() {
  const data = loadAll();
  data.items = [];
  saveAll(data);
}

module.exports = { addImport, listImports, toggleFavorite, listFavorites, clearHistory };
