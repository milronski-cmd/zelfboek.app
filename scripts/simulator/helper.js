(function () {
  var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  var t = globalThis.__t || {};
  globalThis.__t = t;
  t.errors = t.errors || [];
  if (!t._hooked) {
    var oe = console.error, ow = console.warn;
    var fmt = function (args) { return Array.prototype.map.call(args, function (a) { try { return a && a.stack ? String(a.message || a).slice(0, 300) : (typeof a === "string" ? a.slice(0, 300) : JSON.stringify(a).slice(0, 300)); } catch (e) { return String(a); } }).join(" "); };
    console.error = function () { try { t.errors.push("E " + fmt(arguments)); } catch (e) {} return oe.apply(console, arguments); };
    console.warn = function () { try { t.errors.push("W " + fmt(arguments)); } catch (e) {} return ow.apply(console, arguments); };
    t._hooked = true;
  }
  t.root = function () { var id = hook.renderers.keys().next().value; var r = hook.getFiberRoots(id).values().next().value; return r.current; };
  t.all = function () { var out = []; (function go(f) { while (f) { out.push(f); if (f.child) go(f.child); f = f.sibling; } })(t.root().child); return out; };
  t.textOf = function (f) { var s = ""; (function go(x) { while (x) { if (x.tag === 6) s += x.memoizedProps; if (x.child) go(x.child); x = x.sibling; } })(f.child); return s; };
  t.textNodes = function () { return t.all().filter(function (f) { return f.tag === 5 && f.type === "RCTText"; }); };
  t.texts = function () { return t.textNodes().map(t.textOf).filter(function (s) { return s.trim(); }); };
  t.measure = function (f) { return new Promise(function (res) { var h = f; while (h && h.tag !== 5) h = h.child; if (!h || !h.stateNode || !h.stateNode.measureInWindow) return res(null); try { h.stateNode.measureInWindow(function (x, y, w, hh) { res({ x: x, y: y, w: w, h: hh }); }); } catch (e) { res(null); } }); };
  t.visible = function () {
    var nodes = t.textNodes();
    return Promise.all(nodes.map(t.measure)).then(function (ms) {
      var out = [];
      nodes.forEach(function (f, i) { var m = ms[i]; var s = t.textOf(f); if (m && m.h > 0 && m.w > 0 && m.y + m.h > 0 && m.y < 900 && m.x + m.w > 0 && m.x < 450 && s.trim()) out.push(Math.round(m.y) + "\t" + s); });
      return out.join("\n");
    });
  };
  t.find = function (label) { var exact = t.textNodes().filter(function (f) { return t.textOf(f).trim() === label; }); if (exact.length) return exact; return t.textNodes().filter(function (f) { return t.textOf(f).indexOf(label) >= 0; }); };
  t.upWith = function (f, prop) { var h = f; while (h) { if (h.memoizedProps && typeof h.memoizedProps[prop] === "function") return h; h = h.return; } return null; };
  t.ev = function () { return { nativeEvent: { text: "" }, persist: function () {}, stopPropagation: function () {}, preventDefault: function () {} }; };
  t.press = function (label, n) {
    n = n || 0;
    var hits = t.find(label).map(function (f) { return t.upWith(f, "onPress"); }).filter(Boolean);
    hits = hits.filter(function (h, i) { return hits.indexOf(h) === i; });
    if (!hits[n]) throw new Error("geen knop '" + label + "' (gevonden: " + hits.length + ")");
    if (hits[n].memoizedProps.disabled) throw new Error("knop '" + label + "' is uitgeschakeld");
    hits[n].memoizedProps.onPress(t.ev());
    return "ok: " + label + (hits.length > 1 ? " (" + (n + 1) + "/" + hits.length + ")" : "");
  };
  t.afterLabel = function (label, prop) {
    var all = t.all();
    var lab = t.find(label)[0];
    var start = lab ? all.indexOf(lab) : -1;
    for (var i = start + 1; i < all.length; i++) { var p = all[i].memoizedProps; if (p && typeof p[prop] === "function" && typeof all[i].type !== "string") return all[i]; }
    return null;
  };
  t.input = function (key) {
    var byPh = t.all().filter(function (f) { var p = f.memoizedProps; return p && typeof p.onChangeText === "function" && typeof f.type !== "string" && p.placeholder === key; });
    if (byPh[0]) return byPh[0];
    return t.afterLabel(key, "onChangeText");
  };
  t.type = function (key, value) { var f = t.input(key); if (!f) throw new Error("geen veld '" + key + "'"); f.memoizedProps.onChangeText(value); return "ok: " + key + " = " + value; };
  t.submit = function (key) { var f = t.input(key); if (!f) throw new Error("geen veld '" + key + "'"); var fn = t.upWith(f, "onSubmitEditing"); if (!fn) throw new Error("veld '" + key + "' heeft geen onSubmitEditing"); fn.memoizedProps.onSubmitEditing({ nativeEvent: { text: f.memoizedProps.value || "" } }); return "ok: submit " + key; };
  t.toggle = function (label) { var f = t.afterLabel(label, "onValueChange"); if (!f) throw new Error("geen schakelaar '" + label + "'"); var v = !f.memoizedProps.value; f.memoizedProps.onValueChange(v); return "ok: " + label + " -> " + v; };
  t.mod = function (suffix) { var ms = __r.getModules(); var it = ms instanceof Map ? ms.values() : Object.keys(ms).map(function (k) { return ms[k]; }); var arr = ms instanceof Map ? Array.from(it) : it; for (var i = 0; i < arr.length; i++) { var m = arr[i]; if (m && m.verboseName && m.verboseName.indexOf(suffix) >= 0 && m.isInitialized) return m.publicModule.exports; } return null; };
  t.router = function () { var m = t.mod("expo-router/build/imperative-api.js"); return m && m.router; };
  t.nav = function (p) { t.router().push(p); return "ok: nav " + p; };
  t.replace = function (p) { t.router().replace(p); return "ok: replace " + p; };
  t.back = function () { t.router().back(); return "ok: back"; };
  t.route = function () { var m = t.mod("expo-router/build/global-state/router-store.js"); var s = m && (m.store || m.default); try { if (s.getRouteInfo) return s.getRouteInfo().pathname; if (s.routeInfoSnapshot) return s.routeInfoSnapshot().pathname; return JSON.stringify(Object.keys(s)); } catch (e) { return "?" + e.message; } };
  t.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  t.scrollEnd = function () { var n = 0; t.all().forEach(function (f) { if (f.tag === 1 && f.stateNode && typeof f.stateNode.scrollToEnd === "function") { try { f.stateNode.scrollToEnd({ animated: false }); n++; } catch (e) {} } }); return "ok: " + n + " scrollviews"; };
  t.scrollTop = function () { var n = 0; t.all().forEach(function (f) { if (f.tag === 1 && f.stateNode && typeof f.stateNode.scrollTo === "function") { try { f.stateNode.scrollTo({ y: 0, animated: false }); n++; } catch (e) {} } }); return "ok: " + n; };
  t.alertLog = [];
  if (!t._alertHooked) { var rn = t.mod("react-native/index.js"); if (rn && rn.Alert) { var oa = rn.Alert.alert; rn.Alert.alert = function (title, msg, buttons) { t.alertLog.push({ title: title, msg: msg, buttons: (buttons || []).map(function (b) { return b.text; }) }); t.lastAlert = { buttons: buttons || [] }; }; t._alertHooked = true; } }
  t.alertPress = function (text) { var b = (t.lastAlert && t.lastAlert.buttons || []).filter(function (x) { return x.text === text; })[0]; if (!b) throw new Error("geen alert-knop " + text); t.lastAlert = null; if (b.onPress) b.onPress(); return "ok: alert " + text; };
  return "geinstalleerd";
})();
(function(){
  var t = __t;
  t.allGlobal = function(){ var out=[]; (function go(f){ while(f){ out.push(f); if(f.child) go(f.child); f=f.sibling; } })(t.root().child); return out; };
  t.curRoute = function(){ var m = t.mod("expo-router/build/global-state/navigationRef.js"); var ref = m && (m.navigationRef||m.default); return ref && ref.getCurrentRoute ? ref.getCurrentRoute() : null; };
  t.scopeRoot = function(){ var r = t.curRoute(); if (!r) return null; var hits = t.allGlobal().filter(function(f){ var p=f.memoizedProps; return p && p.route && p.route.key === r.key; }); return hits[0] || null; };
  t.all = function(){ var s = t.scopeRoot(); if (!s) return t.allGlobal(); var out=[]; (function go(f){ while(f){ out.push(f); if(f.child) go(f.child); f=f.sibling; } })(s.child); return out; };
  t.textNodesIn = function(list){ return list.filter(function(f){ return f.tag === 5 && f.type === "RCTText"; }); };
  t.textNodes = function(){ return t.textNodesIn(t.all()); };
  t.findIn = function(list, label){ var nodes = t.textNodesIn(list); var exact = nodes.filter(function(f){ return t.textOf(f).trim() === label; }); if (exact.length) return exact; return nodes.filter(function(f){ return t.textOf(f).indexOf(label) >= 0; }); };
  t.find = function(label){ var r = t.findIn(t.all(), label); return r.length ? r : t.findIn(t.allGlobal(), label); };
  t.errSince = 0;
  t.newErrors = function(){ var e = t.errors.slice(t.errSince); t.errSince = t.errors.length; return e; };
  t.sweep = function(routes){
    var out = [];
    var chain = Promise.resolve();
    routes.forEach(function(r){
      chain = chain.then(function(){ t.router().push(r); return t.wait(1600); }).then(function(){ return t.visible(); }).then(function(v){
        var lines = v.split("\n"); out.push("### " + r + "  (route=" + t.route() + ", " + lines.length + " teksten)\n" + lines.slice(0, 28).map(function(l){ return l.split("\t").slice(1).join(" "); }).join(" | ") + (lines.length > 28 ? " | …" : "") + "\nFOUTEN: " + JSON.stringify(t.newErrors()));
        try { t.router().back(); } catch (e) {}
        return t.wait(500);
      });
    });
    return t.run(function(){ return chain.then(function(){ return out.join("\n\n"); }); });
  };
  return "ok";
})();
(function(){
  var t = __t;
  t.vis = function(){ return t.visible().then(function(v){ return v.split("\n").map(function(l){ return l.split("\t").slice(1).join(" "); }).join(" | "); }); };
  t.flow = function(steps){
    var log = [];
    var chain = Promise.resolve();
    steps.forEach(function(s){
      var name = s[0], fn = s[1], ms = s[2] || 700;
      chain = chain.then(function(){
        if (name === "kijk") return t.vis().then(function(v){ log.push("KIJK: " + v); });
        try { var r = fn(); log.push(name + ": " + r); } catch (e) { log.push(name + " FOUT: " + e.message); }
        return t.wait(ms);
      });
    });
    return t.run(function(){ return chain.then(function(){ return t.vis(); }).then(function(v){ return log.join("\n") + "\nEIND (" + t.route() + "): " + v + "\nFOUTEN: " + JSON.stringify(t.newErrors()); }); });
  };
  return "ok";
})();
(function(){
  var t = __t;
  // Knoppen zoeken van boven naar beneden (altijd de actuele fiber), niet via .return (kan verouderd zijn).
  t.pressables = function(list){ return list.filter(function(f){ var p = f.memoizedProps; return p && typeof p.onPress === "function"; }); };
  t.matchKnoppen = function(list, label){
    var ps = t.pressables(list);
    var exact = ps.filter(function(p){ return t.textOf(p).trim() === label; });
    var cands = exact.length ? exact : ps.filter(function(p){ return t.textOf(p).indexOf(label) >= 0; });
    // alleen de binnenste: geen kandidaat die een andere kandidaat als voorouder heeft
    return cands.filter(function(p){ var h = p.return; while (h) { if (cands.indexOf(h) >= 0) return false; h = h.return; } return true; });
  };
  t.press = function(label, n){
    n = n || 0;
    var hits = t.matchKnoppen(t.all(), label);
    if (!hits.length) hits = t.matchKnoppen(t.allGlobal(), label);
    if (!hits[n]) throw new Error("geen knop '" + label + "' (gevonden: " + hits.length + ")");
    if (hits[n].memoizedProps.disabled) throw new Error("knop '" + label + "' is uitgeschakeld");
    hits[n].memoizedProps.onPress(t.ev());
    return "ok: " + label + (hits.length > 1 ? " (" + (n + 1) + "/" + hits.length + ")" : "");
  };
  return "ok";
})();
(function(){
  var t = __t;
  t.pressAfter = function(anchor, label){
    var all = t.all(); var a = t.find(anchor)[0]; var start = a ? all.indexOf(a) : -1;
    var hits = t.matchKnoppen(all, label).filter(function(p){ return all.indexOf(p) > start; });
    if (!hits[0]) throw new Error("geen knop '" + label + "' na '" + anchor + "'");
    if (hits[0].memoizedProps.disabled) throw new Error("knop uitgeschakeld");
    hits[0].memoizedProps.onPress(t.ev()); return "ok: " + label + " na " + anchor;
  };
  t.importeerCsv = function(naam, rijen){
    var apiMod = t.mod("src/lib/api.ts"); var fs = t.mod("expo-file-system/build/index.js");
    var kop = '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"\n';
    var csv = kop + rijen.map(function(r){ return '"' + [r[0], r[1], "NL91ABNA0417164300", r[2], r[3], r[4], r[5], r[6], r[7]].join('";"') + '"'; }).join("\n") + "\n";
    var f = new fs.File(fs.Paths.cache, naam); try { if (f.exists) f.delete(); } catch (e) {} f.create(); f.write(csv);
    var fd = new FormData(); fd.append("naam", "importeerBestand"); fd.append("bestand", apiMod.bestandVeld(f.uri, naam, "text/csv"));
    return apiMod.api("/api/mobiel/actie", { form: fd }).then(function(r){ return t.mod("src/lib/queries.ts").queryClient.invalidateQueries().then(function(){ return JSON.stringify(r); }); });
  };
  return "ok";
})();
(function(){ var t = __t;
  t.home = function(){ var r = t.router(); if (r.dismissAll) { try { r.dismissAll(); } catch(e) { return "home: " + e.message; } } return "ok: home"; };
  t.route = function(){ var m = t.mod("expo-router/build/global-state/navigationRef.js"); var ref = m && (m.navigationRef || m.default); var r = ref && ref.getCurrentRoute && ref.getCurrentRoute(); return r ? (r.path || r.name) : "?"; };
  t.measure = function(f){ return new Promise(function(res){ var h = f; while (h && h.tag !== 5) h = h.child; if (!h || !h.stateNode) return res(null); var sn = h.stateNode; var cb = function(x,y,w,hh){ res({x:x,y:y,w:w,h:hh}); }; try { if (typeof sn.measureInWindow === "function") return sn.measureInWindow(cb); var pi = sn.canonical && sn.canonical.publicInstance; if (pi && pi.measureInWindow) return pi.measureInWindow(cb); if (sn.node && typeof nativeFabricUIManager !== "undefined") return nativeFabricUIManager.measureInWindow(sn.node, cb); res(null); } catch (e) { res(null); } }); };
  if (!t._shareHooked) { var sh = t.mod("expo-sharing/build/Sharing.js"); t.shareLog = t.shareLog || []; if (sh && sh.shareAsync) { sh.shareAsync = function(uri){ t.shareLog.push(uri); return Promise.resolve(); }; t._shareHooked = true; } }
  return "geinstalleerd";
})()
;(function(){ var t = __t;
  t.run = function(fn){ t._done = false; t._r = undefined; Promise.resolve().then(fn).then(function(v){ t._r = v; t._done = true; }, function(e){ t._r = "FOUT: " + (e && e.message || e); t._done = true; }); return "__async__"; };
  return "geinstalleerd";
})()
