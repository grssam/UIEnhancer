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

Services.scriptloader.loadSubScript("chrome://uienhancer/content/scripts/pref.js", global);

let optionsWindow = {
  shortcutTextBox: null,
  shortcutChanged: false,
  shortcutKey: pref("shortcutKey"),
  shortcutModifiers: pref("shortcutModifiers"),
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
    fp = null;
  },

  onLoad: function OW_onLoad() {
    function $(id) document.getElementById(id);
    $("userStyleSheetPathLabel").value = (pref("userStylePath").length > 0?
      pref("userStylePath"): optionsWindow.STR("nocustomstyle"));
    this.toggleStylesSettings(true);
    this.toggleURLBarSettings(true);
    this.toggleStatusSettings(true);
    this.toggleProgressSettings(false);
    this.changeColor();
    // Displaying the shortcut 
    this.shortcutTextBox = $("shortcutTextBox");
    if (window.navigator.oscpu.toLowerCase().indexOf("window") >= 0)
      optionsWindow.shortcutModifiers = optionsWindow.shortcutModifiers.replace("accel", "ctrl");
    this.shortcutTextBox.value = this.shortcutModifiers.replace(",", " +") + " + " + this.shortcutKey;
    this.shortcutTextBox.onclick = function() {
      optionsWindow.shortcutTextBox.setSelectionRange(0, optionsWindow.shortcutTextBox.value.length);
    };
    optionsWindow.shortcutTextBox.addEventListener("keydown", optionsWindow.handleShortcutChange, false);
    let win = $("UIEnhancerOptionsWindow");
    let bottom = $("shortcutContainer").getBoundingClientRect().bottom;
    let right = $("UIEnhancerStatusPrefPane").getBoundingClientRect().right;
    win.setAttribute("width", Math.min(Math.max(right, win.width), 600));
    win.setAttribute("height", Math.min(Math.max(bottom + 150, win.height), 400));
    // Setting up first run experience if required.
    if (window.arguments && window.arguments[0]) {
      let args = window.arguments[0];
      if (args instanceof Ci.nsIDialogParamBlock) {
        args = JSON.parse(args.GetString(0));
      }
      if (args === true) {
        let anchor = window.document.getAnonymousNodes($("UIEnhancerOptionsWindow"))[0]
            .firstChild.firstChild;
        window.setTimeout(function() {
          optionsWindow.openPanelWithTextAt(anchor, optionsWindow.STR("generalSettings.info"), function() {
            anchor = anchor.nextSibling;
            optionsWindow.openPanelWithTextAt(anchor, optionsWindow.STR("styleSettings.info"), function() {
              anchor = anchor.nextSibling;
              optionsWindow.openPanelWithTextAt(anchor, optionsWindow.STR("progressBarSettings.info"), function() {
                anchor = anchor.nextSibling;
                optionsWindow.openPanelWithTextAt(anchor, optionsWindow.STR("statusBarSettings.info"), null, 3500);
              }, 3500);
            }, 3500);
          }, 3500);
        }, 1000);
      }
    }
  },

  openPanelWithTextAt: function OW_openPanelWithTextAt(anchor, text, callback, delay) {
    let panel = window.document.getElementById("popupPanel");
    if (panel.state == "open") {
      panel.hidePopup();
      window.setTimeout(function() {
        optionsWindow.openPanelWithTextAt(anchor, text, callback, delay);
      }, 1000);
      return;
    }
    window.document.getElementById("arrowPanelDesc").value = text;
    panel.openPopup(anchor, "after_start", anchor.boxObject.width/2, 0);
    window.setTimeout(function() {
      callback && callback();
    }, delay);
  },

  saveChanges: function OW_saveChanges() {
    if (optionsWindow.shortcutChanged) {
      pref("shortcutKey", optionsWindow.shortcutKey);
      pref("shortcutModifiers", optionsWindow.shortcutModifiers);
    }
  },

  handleShortcutChange: function OW_handleShortcutChange(event) {
    let value = "";
    if (event.ctrlKey)
      value += "Ctrl + ";
    if (event.shiftKey)
      value += "Shift + ";
    if (event.altKey)
      value += "Alt + ";
    if (event.metaKey)
      value += "Command + ";
    if (event.keyCode > 64 && event.keyCode < 91)
      value += String.fromCharCode(event.keyCode);
    else
      value = optionsWindow.shortcutModifiers.replace(",", " +") + " + " + optionsWindow.shortcutKey;
    optionsWindow.shortcutTextBox.value = value;
  },

  resetStyleSheet: function OW_resetStyleSheet() {
    Services.prefs.getBranch("extensions.UIEnhancer.").clearUserPref("userStylePath");
    document.getElementById("userStyleSheetPathLabel").value = optionsWindow.STR("nocustomstyle");
  },

  toggleStylesSettings: function OW_toggleStylesSettings(check) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let styleSheetEnabled = $("useStyleSheetCheckBox").checked;
    $$(["resetStyleSheetButton",
        "userStyleSheetPathLabel",
        "browseStyleSheetButton",
        "usedStyleIndexListBoxLabel",
        "usedStyleIndexListBox"],
      "disabled", !styleSheetEnabled);
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
        "useDragDropCheckBox",
        "refreshOnLastPartClickCheckBox",
        "identityBoxLeftClickChangedCheckBox"],
      "disabled", !urlBarEnabled);
    if (!check)
      this.notifyChange();
  },

  toggleStatusSettings: function OW_toggleStatusSettings(check, leftoverSpaceIndicator) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let statusEnabled = $("showStatusInURLBarCheckBox").checked;
    if (!leftoverSpaceIndicator) {
      $$(["useLeftoverSpaceCheckBox",
          "statusWidthLabel"],
        "disabled", !statusEnabled);
    }
    let leftoverEnabled = $("useLeftoverSpaceCheckBox").checked || !statusEnabled;
    $$(["statusWidthLabel"], "disabled", leftoverEnabled);
    if (!check)
      this.notifyChange();
  },

  toggleProgressSettings: function OW_toggleProgressSettings(arrowIndicator) {
    function $(id) document.getElementById(id);
    function $$(idList, attr, val) idList.forEach(function(id) $(id).setAttribute(attr, val));
    let progressEnabled = $("showProgressInURLBarCheckBox").checked;
    if (!arrowIndicator)
      $("showProgressAsArrowCheckBox").disabled = !progressEnabled;
    $$(["progressColor0",
        "progressColor1",
        "progressColor2",
        "progressColor3"],
      "disabled", $("showProgressAsArrowCheckBox").checked
      && !$("showProgressAsArrowCheckBox").disabled);
    if (arrowIndicator != false)
      this.notifyChange();
  },

  changeColor: function OW_changeColor(index) {
    function $(id) document.getElementById(id);
    if (index == null) {
      $("progressColor" + pref("progressBarColorIndex")).checked = true;
      $("progressBarColorPicker").collapsed = pref("progressBarColorIndex") != 3;
      if (pref("progressBarColorIndex") == 3)
        $("progressBarColorPicker").color = pref("progressBarCustomColor");
      return;
    }
    for (let i = 0; i < 4; i++)
      if (index != i)
        $("progressColor" + i).checked = false;
    if (index < 3 && index >= 0) {
      pref("progressBarColorIndex", index)
      $("progressBarColorPicker").collapsed = true;
    }
    else {
      pref("progressBarColorIndex", 3)
      $("progressBarColorPicker").collapsed = false;
      pref("progressBarCustomColor", $("progressBarColorPicker").color);
    }
  },

  onColorChange: function OW_onColorChange() {
    function $(id) document.getElementById(id);
    pref("progressBarColorIndex", 3)
    pref("progressBarCustomColor", $("progressBarColorPicker").color);
  },

  notifyChange: function OW_notifyChange(val) {
    if (val) {
      val = val.toLowerCase().replace("ctrl", "accel").split(" + ");
      if (val.length == 1) {
        optionsWindow.shortcutModifiers = "";
        optionsWindow.shortcutKey = val[0];
        optionsWindow.shortcutChanged = true;
      }
      else if (val.length > 1 && val[val.length - 1] >= 'a' && val[val.length - 1] <= 'z') {
        optionsWindow.shortcutKey = (val.splice(val.length - 1, 1))[0].toUpperCase();
        optionsWindow.shortcutModifiers = val.join(", ").toLowerCase();
        optionsWindow.shortcutChanged = true;
      }
    }
    let nb = document.getElementById("changeNotificationBox");
    nb.removeAllNotifications(true);
    nb.appendNotification(optionsWindow.STR("notif.text"), optionsWindow.STR("notif.title"), null, nb.PRIORITY_INFO_HIGH, "", null);
  },

  onUnload: function OW_onUnload() {
    if (Services.prefs.getBranch("browser.").getBoolPref("preferences.instantApply"))
      pref("toggleToReload", !pref("toggleToReload"));
    optionsWindow.shortcutTextBox.removeEventListener("keydown", optionsWindow.handleShortcutChange, false);
    optionsWindow.shortcutTextBox = optionsWindow.shortcutChanged
      = optionsWindow.shortcutKey = optionsWindow.shortcutModifiers
      = optionsWindow.strings = optionsWindow.STR = optionsWindow.openFile
      = optionsWindow.onLoad = optionsWindow.saveChanges = optionsWindow.handleShortcutChange
      = optionsWindow.resetStyleSheet = optionsWindow.toggleStylesSettings
      = optionsWindow.toggleURLBarSettings = optionsWindow.toggleStatusSettings
      = optionsWindow.toggleProgressSettings = optionsWindow.changeColor
      = optionsWindow.onColorChange = optionsWindow.notifyChange = optionsWindow = null;
    global = null;
  },
};

XPCOMUtils.defineLazyGetter(optionsWindow, "strings", function () {
  return Services.strings.createBundle("chrome://uienhancer/locale/optionwindow.properties");
});
