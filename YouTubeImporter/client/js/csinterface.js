/*
 * CSInterface.js — thin wrapper around the CEP native binding
 * (`window.__adobe_cep__`) that every CEP panel uses to talk to its host
 * application (Premiere Pro here). This is the standard glue Adobe ships
 * with the CEP SDK samples; included verbatim-equivalent so the panel can
 * call evalScript() against host/index.jsx and read system paths/OS info.
 */
/* eslint-disable no-var */
(function (global) {
  'use strict';

  var CSEventType = {
    APP_ONLINE: 'com.adobe.csxs.events.ApplicationOnline',
    THEME_COLOR_CHANGED: 'com.adobe.csxs.events.ThemeColorChanged',
  };

  var SystemPath = {
    USER_DATA: 'userData',
    COMMON_FILES: 'commonFiles',
    MY_DOCUMENTS: 'myDocuments',
    APPLICATION: 'application',
    EXTENSION: 'extension',
    HOST_APPLICATION: 'hostApplication',
  };

  function CSEvent(type, scope, appId, extensionId) {
    this.type = type;
    this.scope = scope || 'GLOBAL';
    this.appId = appId || '';
    this.extensionId = extensionId || '';
    this.data = '';
  }

  function CSInterface() {
    this.hostEnvironment = null;
    try {
      if (global.__adobe_cep__ && typeof global.__adobe_cep__.getHostEnvironment === 'function') {
        this.hostEnvironment = JSON.parse(global.__adobe_cep__.getHostEnvironment());
      }
    } catch (e) {
      this.hostEnvironment = null;
    }
  }

  CSInterface.prototype._native = function () {
    if (!global.__adobe_cep__) {
      throw new Error('CEP native bridge (__adobe_cep__) is not available. This page must run inside a CEP host panel.');
    }
    return global.__adobe_cep__;
  };

  /** Evaluates ExtendScript in the host (Premiere) and returns the result via callback(resultString). */
  CSInterface.prototype.evalScript = function (script, callback) {
    var cb = callback || function () {};
    try {
      this._native().evalScript(script, cb);
    } catch (e) {
      cb(JSON.stringify({ ok: false, code: 'BRIDGE_UNAVAILABLE', message: e.message }));
    }
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    this._native().addEventListener(type, listener, obj);
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (typeof this._native().removeEventListener === 'function') {
      this._native().removeEventListener(type, listener, obj);
    }
  };

  CSInterface.prototype.dispatchEvent = function (event) {
    if (typeof event.data === 'object') event.data = JSON.stringify(event.data);
    this._native().dispatchEvent(event);
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    var path = this._native().getSystemPath(pathType);
    return decodeURIComponent(path);
  };

  CSInterface.prototype.getOSInformation = function () {
    var ua = global.navigator.userAgent;
    if (ua.indexOf('Windows') >= 0) return 'Windows';
    if (ua.indexOf('Macintosh') >= 0 || ua.indexOf('Mac OS') >= 0) return 'Mac';
    return 'Unknown';
  };

  CSInterface.prototype.getExtensionID = function () {
    return this._native().getExtensionId();
  };

  CSInterface.prototype.closeExtension = function () {
    this._native().closeExtension();
  };

  CSInterface.prototype.resizeContent = function (width, height) {
    this._native().resizeContent(width, height);
  };

  CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    this._native().requestOpenExtension(extensionId, params || '');
  };

  global.CSEventType = CSEventType;
  global.SystemPath = SystemPath;
  global.CSEvent = CSEvent;
  global.CSInterface = CSInterface;
})(window);
