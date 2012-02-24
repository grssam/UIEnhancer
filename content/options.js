/* ***** BEGIN LICENSE BLOCK *****
 * Version: MIT/X11 License
 * 
 * Copyright (c) 2011 Girish Sharma
 * 
 * Permission is hereby granted, free of charge, to any person obtaining copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Creator:
 *   Girish Sharma <scrapmachines@gmail.com>
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
let global = this;
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

function getURIForFile2(filepath, rootDir) {
  let file = FileUtils.getFile("ProfD", rootDir?[rootDir]:["extensions"]);
  if (rootDir == null)
    file.append("UIEnhancer@girishsharma");
  return Services.io.newURI("file:///" + file.path.replace(/[\\]/g, "/") + "/" + filepath, null, null);
}

["helper", "pref"].forEach(function(fileName) {
  let fileURI = getURIForFile2("scripts/" + fileName + ".js");
  Services.scriptloader.loadSubScript(fileURI.spec, global);
});

let optionsWindow = {
  strings: null,

  STR: function OW_STR(aString) {
    return optionsWindow.strings.GetStringFromName(aString);
  },

  openFile: function OW_openFile() {
    function $(id) document.getElementById(id);
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, this.STR("openDialog.title"), Ci.nsIFilePicker.modeOpen);
    fp.defaultString = "";
    fp.appendFilter("Style Sheets","*.css;");
    if (fp.show() != Ci.nsIFilePicker.returnCancel) {
      pref("userStylePath", fp.file.path);
      $("userStyleSheetPathLabel").value = fp.file.path;
    }
  },

  onLoad: function OW_onLoad() {
    document.getElementById("userStyleSheetPathLabel").value = (pref("userStylePath").length > 0?
      pref("userStylePath"): optionsWindow.STR("nocustomstyle"));
    this.toggleBookmarksSettings(true);
    this.toggleStylesSettings(true);
    this.toggleURLBarSettings(true);
  },

  resetStyleSheet: function OW_resetStyleSheet() {
    Services.prefs.getBranch("extensions.UIEnhancer.").clearUserPref("userStylePath");
    document.getElementById("userStyleSheetPathLabel").value = optionsWindow.STR("nocustomstyle");
  },

  toggleStylesSettings: function OW_toggleStylesSettings(check) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let styleSheetEnabled = document.getElementById("useStyleSheetCheckBox").checked;
    $$(["resetStyleSheetButton", "browseStyleSheetButton"], "disabled", !styleSheetEnabled);
    if (!check)
      this.notifyChange();
  },

  toggleURLBarSettings: function OW_toggleURLBarSettings(check) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let urlBarEnabled = $("enhanceURLBarCheckBox").checked;
    $$(["removeGibberishCheckBox",
        "makeCapitalCheckBox",
        "useIdentityBoxCheckBox",
        "useDragDropCheckBox"],
      "disabled", !urlBarEnabled);
    if (!check)
      this.notifyChange();
  },

  toggleBookmarksSettings: function OW_toggleBookmarksSettings(check) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let bookmarksEnabled = $("bringBookmarksUpCheckBox").checked;
    $$(["urlBarWidthTextBox",
        "useSmallIconsCheckBox",
        "animationSpeedNormal",
        "animationSpeedFast",
        "animationSpeedNone",
        "urlBarWidthLabel"],
      "disabled", !bookmarksEnabled);
    if (!check)
      this.notifyChange();
  },

  notifyChange: function OW_notifyChange(val) {
    let nb = document.getElementById("changeNotificationBox");
    nb.removeAllNotifications(true);
    nb.appendNotification(optionsWindow.STR("notif.text"), optionsWindow.STR("notif.title"), null, nb.PRIORITY_INFO_HIGH, "", null);
  }
};

XPCOMUtils.defineLazyGetter(optionsWindow, "strings", function () {
  return Services.strings.createBundle("chrome://uienhancer/locale/optionwindow.properties");
});