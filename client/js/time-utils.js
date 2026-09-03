/* Parsing/formatting helpers for the trim fields (HH:MM:SS <-> seconds). */
(function (global) {
  'use strict';

  function pad2(n) {
    return String(Math.floor(n)).padStart(2, '0');
  }

  function formatClock(totalSeconds) {
    var s = Math.max(0, Math.round(totalSeconds || 0));
    var hh = Math.floor(s / 3600);
    var mm = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    return pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
  }

  /** Accepts "HH:MM:SS", "MM:SS" or a bare number of seconds. Returns null if unparsable. */
  function parseClock(text) {
    if (text === null || text === undefined) return null;
    var trimmed = String(text).trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

    var parts = trimmed.split(':').map(function (p) { return p.trim(); });
    if (parts.length < 2 || parts.length > 3) return null;
    if (!parts.every(function (p) { return /^\d{1,2}$/.test(p); })) return null;

    var nums = parts.map(Number);
    var seconds;
    if (nums.length === 3) {
      seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
    } else {
      seconds = nums[0] * 60 + nums[1];
    }
    if (nums.some(function (n, i) { return i > 0 && n >= 60; })) return null;
    return seconds;
  }

  function formatDuration(totalSeconds) {
    return formatClock(totalSeconds);
  }

  global.TimeUtils = { formatClock: formatClock, parseClock: parseClock, formatDuration: formatDuration };
})(window);
