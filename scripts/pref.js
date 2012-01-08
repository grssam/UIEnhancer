/* ***** BEGIN LICENSE BLOCK *****
 *  This is the helper file for addon UI Enhancement
 *  Copyright (C) 2011  Girish Sharma
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/
 *
 *  The original code is the pref file for addon Speak Words.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

function pref(key) {
  // Cache the prefbranch after first use
  let {branch, defaults} = pref;
  if (branch == null)
    branch = Services.prefs.getBranch(pref.root);

  // Figure out what type of pref to fetch
  switch (typeof defaults[key]) {
    case "boolean":
      return branch.getBoolPref(key);
    case "number":
      return branch.getIntPref(key);
    case "string":
      return branch.getCharPref(key);
  }
  return null;
}

// Set custom values for this add-on
pref.root = "extensions.UIEnhancer.";
pref.defaults = {
  bringBookmarksUp: true,
  urlBarWidth: "700",
  animationSpeed: "normal",
  useSmallIcons: false,
  enhanceURLBar: true,
  removeGibberish: true,
  installedVersion: "0.0"
};

pref.observe = function(prefs, callback) {
  let {root} = pref;
  function observe(subject, topic, data) {
    // Sanity check that we have the right notification
    if (topic != "nsPref:changed")
      return;

    // Only care about the prefs provided
    let pref = data.slice(root.length);
    if (prefs.indexOf(pref) == -1)
      return;

    // Trigger the callback with the changed key
    callback(pref);
  }

  // Watch for preference changes under the root and clean up when necessary
  Services.prefs.addObserver(root, observe, false);
  unload(function() Services.prefs.removeObserver(root, observe));
};

// Initialize default preferences
let (branch = Services.prefs.getDefaultBranch(pref.root)) {
  for (let [key, val] in Iterator(pref.defaults)) {
    switch (typeof val) {
      case "boolean":
        branch.setBoolPref(key, val);
        break;
      case "number":
        branch.setIntPref(key, val);
        break;
      case "string":
        branch.setCharPref(key, val);
        break;
    }
  }
}

function setPref(k, v) {
  let (branch = Services.prefs.getDefaultBranch(pref.root)) {
    switch (typeof v) {
      case "boolean":
        branch.setBoolPref(k, v);
        break;
      case "number":
        branch.setIntPref(k, v);
        break;
      case "string":
        branch.setCharPref(k, v);
        break;
    }
  }
}