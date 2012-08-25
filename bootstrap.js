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
 * Contributor:
 *   Girish Sharma <scrapmachines@gmail.com> (Creator)
 *   Fabrizio La Rosa (Mac fixes)
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const global = this;
const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let gAddon;
let firstRunAfterInstall = false;
let normalStartup = false;
let reload = function() {};
let recheckOnTabChange = false;
let openSite = false;
// Array of progress colors
let progressColorList = [
  "rgba(15,215,245, 0.6)", // Azure Blue
  "rgba(15, 250, 110, .6)", // Parrot Green
  "rgba(150, 150, 150, .6)", // Grey
  "" // Custom
];
// global variable to store whether user has Status-4-Ever installed
// and its setting is to show status or/and link in Location Bar
let S4E_statusInURLBar = false;
const keysetID = "UIEnhancerKeyset";
const keyID = "UIEnhancerKeyID";
const toolbarButtonID = "UIEnhancerToolbarButton";
const styleSheetList = [
  "defaultThemeLight",
  "defaultThemeDark",
  "DannehsLight",
  "DevtoolsLight",
];
let usedStyleIndex = 0;
// variable to store localized strings
let strings = {str:null};
XPCOMUtils.defineLazyGetter(strings, "str", function () {
  return Services.strings.createBundle("chrome://uienhancer/locale/main.properties");
});
function l10n(aString) {
  return strings.str.GetStringFromName(aString);
}
// Class for handling the changing and revertign of various DOM elements
function handleDOM(object, newParent, insertFirst) {
  this.parent = object.parentNode;
  this.sibling = object.nextSibling;
  this.obj = object;
  this.newParent = newParent;
  this.insertFirst = insertFirst;
  this.hidden;

  if (this.obj != null && this.insertFirst != null) {
    if (this.insertFirst == true)
      this.newParent.insertBefore(this.obj, this.newParent.firstChild);
    else if (this.insertFirst == false)
      this.newParent.appendChild(this.obj);
    else
      this.newParent.insertBefore(this.obj, this.insertFirst.nextSibling);
  }
  else if (this.obj != null && this.newParent == null) {
    this.hidden = this.obj.hidden;
    this.obj.hidden = true;
  }

  this.unloader = function() {
    if (this.newParent == null)
      this.obj.hidden = this.hidden;
    if (this.sibling)
      this.parent.insertBefore(this.obj, this.sibling);
    else
      this.parent.appendChild(this.obj);
  };

  this.hasClass = function(cls) {
    return this.obj.className.match(new RegExp('(\\s|^)'+cls+'(\\s|$)'));
  }

  this.addClass = function(cls) {
    if (!this.hasClass(cls)) this.obj.className += " "+cls;
  };

  this.removeClass = function(cls) {
    if (this.hasClass(cls))
      this.obj.className = this.obj.className.replace(new RegExp('(\\s|^)'+cls+'(\\s|$)'),' ');
  };

  this.transferTo = function(newP, newSib) {
    if (newSib == null)
      newP.appendChild(this.obj);
    else
      newP.insertBefore(this.obj, newSib);
  }

  if (this.obj == null) {
    this.unloader = function() {};
    this.hasClass = function() {};
    this.addClass = function() {};
    this.removeClass = function() {};
    this.transferTo = function() {};
  }
}

function openOptions() {
  Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher)
    .openWindow(null, "chrome://uienhancer/content/options.xul",
                "Location Bar Enhancer Options",
                "chrome,resizable,centerscreen,toolbar", null);
}

function changeUI(window) {

  let {gURLBar, gBrowser, document} = window;
  function $(id) document.getElementById(id);
  let async = makeWindowHelpers(window).async;
  let fx15Plus = Services.appinfo.platformVersion.split(".")[0]*1 > 14;
  if (gURLBar.parentNode.parentNode.id != "personal-titlebar")
    async(function () {
      if (gURLBar.parentNode.parentNode.id == "personal-titlebar")
        reload();
    },2500);
  // Disable the add-on when customizing
  listen(window, window, "beforecustomization", function() {
    if (gAddon.userDisabled)
      return;
    unload();

    // Listen for one customization finish to re-enable the addon
    listen(window, window, "aftercustomization", function() {
      firstRunAfterInstall = true;
      normalStartup = false;
      reload();
    }, false);
  });

  // Get the current browser's URI even if loading
  function getURI() {
    let channel = gBrowser.selectedBrowser.webNavigation.documentChannel;
    if (channel != null)
      return channel.originalURI;

    // Just return the finished loading uri
    return gBrowser.selectedBrowser.currentURI;
  }

  /*
  * URLBar Look Enhancer Code Begins
  */
  // Global Variables to this part of addon
  let urlPartArray = [];
  let partPointer = null;
  let arrowMouseDown = false;
  let textMouseDown = false;
  let editing = false;
  let partsWidth = 0;
  let newDocumentLoaded = false;
  let titleChanged = false;
  let refreshRelatedArray = false;
  let tabChanged = false;
  let showingHidden = false;
  let hiddenStartingIndex = 0;
  let locationBarEnterPressed = false;
  unload(function() {
    urlPartArray = partPointer = arrowMouseDown = tabChanged = titleChanged
      = textMouseDown = partsWidth = newDocumentLoaded = hiddenStartingIndex
      = refreshRelatedArray = editing = showingHidden = null;
  }, window);

  let mainPopup = document.createElementNS(XUL, "menupopup");
  mainPopup.setAttribute("id", "UIEnhancer_Main_Popup");
  $("mainPopupSet").appendChild(mainPopup);
  unload(function() {
    mainPopup.parentNode.removeChild(mainPopup);
    mainPopup = null;
    try {
      mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
    } catch (ex) {}
    hideMainPopup = null;
  }, window);
  let hideMainPopup = function() {};

  let popupStack = null;
  let settingsStartIndex = null;
  let redRemoved = 0;
  let lastScrolledTime = 0;
  let lastUsefulPart = null;
  let ctrlMouseHover = false;
  let mouseScrolled = null;
  let scrolledStack = null;
  let indexB4Scrolling = null;
  let currentScrolledIndex = null;
  let relatedScrolledArray = [];
  let lastScrolledUrl = "";
  let restyleEnhancedURLBarOnTabChange = false;
  let siblingsShown = false;
  let urlBarHeight = null;
  let origIdentity;
  let origILabel;
  let origICountryLabel;
  let origInput;
  let identityLabel;
  let identityCountryLabel;
  let enhancedURLBar;
  let setupEnhancedURLBarUI = function() {};
  let setOpacity = function() {};

  let {DBConnection} = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  unload(function() {
    popupStack = settingsStartIndex = relatedScrolledArray
      = lastScrolledTime = lastUsefulPart = ctrlMouseHover = mouseScrolled
      = scrolledStack = indexB4Scrolling = currentScrolledIndex = redRemoved
      = lastScrolledUrl = restyleEnhancedURLBarOnTabChange = siblingsShown
      = urlBarHeight = DBConnection = null;
  }, window);
  // Get references to existing UI elements
  origInput = gURLBar.mInputField;
  origIdentity = $("identity-icon-labels");
  if (pref("enhanceURLBar")) {
    // Get references to existing UI elements
    if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) {
      origILabel = $("identity-icon-label");
      origICountryLabel = $("identity-icon-country-label");
      origIdentity.collapsed = !pref("useIdentityBox");

      identityLabel = document.createElementNS(XUL, "label");
      identityLabel.setAttribute("id","UIEnhancer_Identity_Label");
      identityLabel.setAttribute("collapsed",false);
      identityLabel.setAttribute("flex", 1);
      identityLabel.setAttribute("style",origILabel.style);
      identityLabel.style.padding = "0px";
      identityLabel.style.margin = "0px";

      identityCountryLabel = document.createElementNS(XUL, "label");
      identityCountryLabel.setAttribute("id", "UIEnhancer_Identity_Country_Label");
      identityCountryLabel.setAttribute("collapsed", false);
      identityCountryLabel.setAttribute("flex", 1);
      identityCountryLabel.setAttribute("style", origICountryLabel.style);
      identityCountryLabel.style.padding = "0px";
      identityCountryLabel.style.margin = "0px";

      origIdentity.insertBefore(identityCountryLabel, origICountryLabel.nextSibling);
      origIdentity.insertBefore(identityLabel, origICountryLabel.nextSibling);
      origILabel.collapsed = true;
      origICountryLabel.collapsed = true;
    }

    setOpacity = function(opacity) {
      origInput.style.opacity = opacity;
      let d = origInput.firstChild;
      while (d != null) {
        d.style.opacity = opacity;
        d = d.nextSibling;
      }
      let d = origInput.nextSibling;
      while (d != null) {
        if (d.id == "UIEnhancer_StatusBar") {
          d = d.nextSibling;
          continue;
        }
        d.style.opacity = opacity;
        d = d.nextSibling;
      }
    }

    unload(function() {
      setOpacity(1);
      try {
        origILabel.collapsed = false;
        origICountryLabel.collapsed = false;
      } catch (ex) {}
      try {
        origIdentity.removeChild($("identity-icon-country-label").nextSibling);
        origIdentity.removeChild($("identity-icon-country-label").nextSibling);
      } catch(ex) {}
      identityLabel = identityCountryLabel = origICountryLabel = origILabel = origIdentity = null;
    }, window);

    // Add stuff around the original urlbar input box
    enhancedURLBar = document.createElementNS(XUL, "hbox");
    origInput.parentNode.insertBefore(enhancedURLBar, origInput);
    setupEnhancedURLBarUI = function() {
      let origParentStyle = gURLBar.parentNode.style;
      let isWindows = window.navigator.oscpu.toLowerCase().indexOf("window") >= 0;
      let isLinux = window.navigator.oscpu.toLowerCase().indexOf("linux") >= 0;
      let isMac = window.navigator.oscpu.toLowerCase().indexOf("mac") >= 0;
      enhancedURLBar.setAttribute("id", "UIEnhancer_URLBar");
      enhancedURLBar.setAttribute("flex", 0);
      enhancedURLBar.setAttribute("style", "width:" + getMaxWidth() + "px;");
      enhancedURLBar.style.overflow = "hidden";
      enhancedURLBar.style.display = "-moz-box";
      enhancedURLBar.style.padding = "0px";
      urlBarHeight = window.getComputedStyle(gURLBar).height.replace("px", '')*1
        + window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1
        + window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1;
      if (isLinux)
        urlBarHeight += 2;
      if (isWindows)
        enhancedURLBar.style.margin = "-" + window.getComputedStyle(gURLBar).paddingTop + " 0px -"
          + window.getComputedStyle(gURLBar).paddingBottom + " -"
          + (window.getComputedStyle(origIdentity).marginRight.replace("px", '')*1 + (fx15Plus?1:0)) + "px";
      else if (isLinux)
        enhancedURLBar.style.margin = "-"
          + (window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1 + 1)
          + "px 0px -"
          + (window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1 + 1)
          + "px -"
          + Math.max(window.getComputedStyle(origIdentity).marginRight.replace("px", '')*1
          + window.getComputedStyle(gURLBar).paddingLeft.replace("px", '')*1, 3) + "px";
      else if (isMac)
        enhancedURLBar.style.margin = "-"
          + (window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1 + 3)
          + "px 0px -"
          + (window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1 + 2)
          + "px -"
          + Math.max(window.getComputedStyle(origIdentity).marginRight.replace("px", '')*1
          + window.getComputedStyle(gURLBar).paddingLeft.replace("px", '')*1, 3) + "px";
    }

    if (window.getComputedStyle(gURLBar).visibility != "collapse")
      setupEnhancedURLBarUI();
    else
      restyleEnhancedURLBarOnTabChange = true;

    // Listening for right click on identity box if Firefox 14 and below
    // or the user has enabled hidden pref for securedIdentityBox
    if (pref("useIdentityBox") && (!fx15Plus || pref("useIdentityEverytime")))
      listen(window, origIdentity, "click", function(e) {
        if (pref("identityBoxLeftClickChanged") && e.button <= 1
          && enhancedURLBar.firstChild.getAttribute("isDomain") == "true") {
            e.preventDefault();
            e.stopPropagation();
            let url = urlValue.slice(0, urlPartArray[0]);
            handleTextClick(url, null, null, e.ctrlKey || (e.button == 1));
        }
        else if (e.button == 2 && enhancedURLBar.firstChild.getAttribute("isDomain") == "true") {
          e.preventDefault();
          clearPopup();
          siblingsShown = true;
          arrowMouseDown = true;
          popupStack = enhancedURLBar.firstChild;
          highlightPart(popupStack, true, true);
          mainPopup.appendChild(getMenuItems(popupStack));
          // Displaying the domain along with these buttons
          mainPopup.appendChild(window.document.createElementNS(XUL, "menuseparator"));
          let (part = document.createElementNS(XUL, "menuitem")) {
            part.setAttribute("id", "UIEnhancer_Popup_Link_0");
            part.setAttribute("class", "menuitem-iconic");
            let url = urlValue.slice(0, urlPartArray[0]);
            part.setAttribute("label", url);
            listen(window, part, "click", function(ee) {
              if (ee.button == 2)
                return;
              try {
                mainPopup.hidePopup();
              } catch(ex) {}
              siblingsShown = arrowMouseDown = false;
              highlightPart(enhancedURLBar.firstChild, false, false, '>');
              handleTextClick(url, null, null, ee.ctrlKey || (ee.button == 1));
            }, false);
            mainPopup.appendChild(part);
          }

          // Show the popup below the arrows
          mainPopup.openPopup(origIdentity, "after_start", -30, 0);
          mainPopup.addEventListener("popuphidden", hideMainPopup = function() {
            mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
            try {
              mainPopup.hidePopup();
            } catch(ex) {}
            arrowMouseDown = false;
            siblingsShown = false;
            highlightPart(popupStack, false, false, '>');
          });
        }
      });

    unload(function() {
      try {
        window.gURLBar.mInputField.parentNode.removeChild(gURLBar.mInputField.previousSibling);
        urlBarHeight = enhancedURLBar = origInput = null;
      } catch(e){}
    }, window);
    setOpacity(0);
  }

  let MAXWIDTH = 0;
  function getMaxWidth() {
    let whiteListAddons = ["mafArchiveInfoUrlbarBox", "omnibar-in-urlbar"];
    let showStatusInURLBar = pref("showStatusInURLBar");
    let useLeftoverSpace = pref("useLeftoverSpace");
    let statusWidth = pref("statusWidth");
    if (showStatusInURLBar && useLeftoverSpace && newStatusCon && newStatus
      && newStatusCon.style.maxWidth.replace("px","")*1 > 0.5*pref("urlBarWidth")) {
        newStatusCon.style.maxWidth = newStatus.style.maxWidth = 0.45*pref("urlBarWidth") + "px";
        return 0.5*pref("urlBarWidth");
    }
    let origBoxObject = origIdentity.boxObject;
    let (udb = $("urlbar-display-box")) {
      while (whiteListAddons.indexOf(udb.nextSibling.id) >= 0)
        udb = udb.nextSibling;
      if (udb == null) {
        // case when internal status pref'd on
        if (showStatusInURLBar && !S4E_statusInURLBar)
          return pref("urlBarWidth")*1 - origBoxObject.width - 100 - (useLeftoverSpace? 250: statusWidth);
        // case otherwise
        else
          return pref("urlBarWidth")*1 - origBoxObject.width - 250 - (S4E_statusInURLBar? 100: 0);
      }
      let maxWidth = Math.max(udb.nextSibling.boxObject.x, 0.3*gURLBar.boxObject.width)
        - origBoxObject.x - origBoxObject.width;
      if (showStatusInURLBar && !S4E_statusInURLBar)
        maxWidth -= (useLeftoverSpace? 250: Math.max(statusWidth, 60));
      else
        maxWidth -= (S4E_statusInURLBar? Math.max(udb.nextSibling.boxObject.x,
          0.3*gURLBar.boxObject.width)*0.33: 60);
      if (pref("bringBookmarksUp") && maxWidth > pref("urlBarWidth")*1 - 100) {
        let someWidth = udb.parentNode.lastChild.boxObject.x
          - udb.nextSibling.boxObject.x + udb.parentNode.lastChild.boxObject.width;
        if (showStatusInURLBar && !S4E_statusInURLBar)
          maxWidth = pref("urlBarWidth")*1 - origBoxObject.width
            - (useLeftoverSpace? 250: Math.max(statusWidth, 160));
        else
          maxWidth = pref("urlBarWidth")*1 - origBoxObject.width
            - (S4E_statusInURLBar? Math.max(pref("urlBarWidth")*0.33, 160 + someWidth)
            : 160 + someWidth);
      }
      MAXWIDTH = Math.max(Math.min(maxWidth, pref("urlBarWidth")*1 - origBoxObject.width - 100), 0);
      return MAXWIDTH;
    }
  }

  // Function to use gibberish and remove redundant text
  function replaceGibberishText(gibberVal, urlArray, index) {
    let isSetting = false;
    if (settingsStartIndex != null && index >= settingsStartIndex)
      isSetting = (index >= anchorTagIndex && anchorTagIndex)? "anchor": true;
    if (index > 0) {
      let gibberResult = gibberish(gibberVal.replace("www.", "").replace(/\.[a-zA-Z\u0400-\u04FF\u0500-\u052F]{2,4}$/, ""));
      let partsLength = gibberVal.split(/[ _=]+/g).length;
      if (gibberResult.toString() != "false" && redRemoved == 0
        && (gibberResult.toString() == "true"
        || (gibberResult.length >= 0.5*partsLength && partsLength < 5)
        || (gibberResult.length >= 0.75*partsLength && partsLength >= 5))) {
          let baseString = urlArray[0].split(".").slice(0,urlArray[0].split(".").length - 1);
          urlArray.slice(1).forEach(function(gibberVal, i) {
            if (i != index - 1)
              baseString.push(gibberVal);
          });
          let title = gBrowser.contentDocument.title;
          if (title.split(/[\/]/g).length > 3)
            return [gibberVal, isSetting];
          let tempVal = removeRedundantText(baseString, title);
          if (tempVal != " " && tempVal != "" && tempVal.toLowerCase() != "problem loading page") {
            gibberVal = tempVal;
            isSetting = false;
            tempVal = null;
          }
          redRemoved++;
      }
      else if (gibberResult.toString() != "false" && gibberResult.toString() != "true"
        && (((gibberResult.length < 0.3*partsLength
        || (gibberVal.indexOf("=") < 0 && gibberResult.length <= 0.5*partsLength))
        && partsLength < 5) || (gibberResult.length < 0.25*partsLength && partsLength >= 5))) {
          let valParts = gibberVal.split(/[ _]/g);
          valParts = valParts.filter(function (part, i) {
            if (gibberResult.indexOf(i) >= 0)
              return false;
            else
              return true;
          });
          gibberVal = valParts.join(" ");
          valParts = null;
      }
    }
    return [gibberVal, isSetting];
  }

  let forcedFlushing = false;
  function clearPopup() {
    if (arrowMouseDown) {
      try {
        mainPopup.hidePopup();
      } catch(ex) {}
    }
    if (popupStack != null) {
      mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
      forcedFlushing = true;
      highlightPart(popupStack, false, false);
      forcedFlushing = false;
      if (!pref("useStyleSheet")) {
        if (popupStack.getAttribute("isHiddenArrow") == "true")
          popupStack.lastChild.style.padding = "2px 2px 1px 1px";
        else
          popupStack.lastChild.value = ">";
      }
    }
    popupStack = null;
    while (mainPopup.firstChild)
      mainPopup.removeChild(mainPopup.firstChild);
  }

  function showHidden(hiddenStack, mouseDown, startingIndex) {
    if (arrowMouseDown && popupStack == hiddenStack && mouseDown) {
      highlightPart(hiddenStack, false, false);
      if (!pref("useStyleSheet"))
        hiddenStack.lastChild.style.padding = "2px 2px 1px 2px";
      return;
    }
    arrowMouseDown = true;
    highlightPart(hiddenStack, "partial", true);
    startingIndex = startingIndex*1;
    hiddenStartingIndex += startingIndex;
    if (hiddenStartingIndex < 0)
      hiddenStartingIndex = 0;

    if (hiddenStartingIndex > 0 && enhancedURLBar.firstChild.getAttribute("isHiddenArrow") == "true")
      enhancedURLBar.firstChild.setAttribute("url", urlValue.slice(0, urlPartArray[hiddenStartingIndex - 1]));
    else if (enhancedURLBar.firstChild.getAttribute("isHiddenArrow") == "true")
      enhancedURLBar.firstChild.setAttribute("url", "");
    if (hiddenStartingIndex == 0) {
      async(function() {
        try {
          enhancedURLBar.removeChild(enhancedURLBar.firstChild);
          enhancedURLBar.setAttribute("domainVisible", true);
          enhancedURLBar.setAttribute("condition", "normal");
        } catch (ex) {}
      }, 1500);
    }
    else if (enhancedURLBar.firstChild.getAttribute("isHiddenArrow") != "true") {
      enhancedURLBar.insertBefore(createStack("", "", "null", true), enhancedURLBar.firstChild);
      enhancedURLBar.removeAttribute("domainVisible");
    }
    showingHidden = true;
    redRemoved = 0;
    partsWidth = 0;
    partPointer = enhancedURLBar.firstChild.nextSibling;
    for (let index = hiddenStartingIndex; index < urlArray_updateURL.length; index++) {
      urlVal_updateURL = urlArray_updateURL[index];
      isSetting_updateURL = false;
      // Test Case to check gibberish function
      [urlVal_updateURL, isSetting_updateURL] = replaceGibberishText(urlVal_updateURL, urlArray_updateURL, index);
      addPart(urlVal_updateURL, urlValue.slice(0, urlPartArray[index]), false,
        isSetting_updateURL, index == urlArray_updateURL.length - 1);
    }
    if (partsWidth > getMaxWidth() && !enhancedURLBar.nextSibling.hasAttribute("isHiddenArrow")) {
      let tStack = createStack("", "", "null", "after");
      tStack.addEventListener("mouseover", function(e) {
        globalEventHandler("mouseoverOnLastChild", e.originalTarget.parentNode, e);
      });
      tStack.addEventListener("mousedown", function(e) {
        globalEventHandler("mousedownOnLastChild", e.originalTarget.parentNode, e);
      });
      tStack.addEventListener("mouseup", function(e) {
        globalEventHandler("mouseupOnLastChild", e.originalTarget.parentNode, e);
      });
      tStack.addEventListener("mouseout", function(e) {
        globalEventHandler("mouseout", e.originalTarget.parentNode, e);
      });
      let isMac = window.navigator.oscpu.toLowerCase().indexOf("mac") >= 0;
      if (isMac)
        tStack.style.margin = "-"
          + (window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1 + 3)
          + "px 0px -"
          + (window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1 + 2)
          + "px -"
          + Math.max(window.getComputedStyle(origIdentity).marginRight.replace("px", '')*1
          + window.getComputedStyle(gURLBar).paddingLeft.replace("px", '')*1, 3) + "px";
      enhancedURLBar.parentNode.insertBefore(tStack, enhancedURLBar.nextSibling);
      isMac = null;
    }
    else if (partsWidth < (MAXWIDTH - 10) && enhancedURLBar.nextSibling.hasAttribute("isHiddenArrow")) {
      partPointer = enhancedURLBar.firstChild;
      arrowMouseDown = false;
      updateURL();
      return;
    }
    updateLook();
  }

  // Function to update the look of the enhancedURLBar
  function updateLook() {
    if (gURLBar.focused) {
      reset(1);
      return;
    }
    // compute the width of enhancedURLBar first
    partsWidth = 0;
    Array.forEach(enhancedURLBar.childNodes, function(child) partsWidth += child.boxObject.width);

    if (fx15Plus && enhancedURLBar.hasAttribute("domainVisible"))
      partsWidth += 7;
    if (partsWidth > getMaxWidth() || showingHidden)
      enhancedURLBar.style.width = MAXWIDTH + "px";
    else
      enhancedURLBar.style.width = partsWidth + "px";
  }

  // Hides the enhanced urlbar when hover with CTRL key pressed
  function hideEnhancedURLBar() {
    if (ctrlMouseHover)
      return;
    async(function() {
      ctrlMouseHover = true;
    }, 200);
    setOpacity(1);
    enhancedURLBar.style.display = "none";
  }

  // Handles the scrolling event on a part
  // All functions to be called Async. have arguments in square brackets
  function handleScroll([detail]) {
    // Basically, delta is now positive if wheel was scrolled up,
    // and negative, if wheel was scrolled down.
    let delta = 0;
    if (detail)
      delta = -detail;
    if (delta > 0 && currentScrolledIndex > 0)
      currentScrolledIndex--;
    else if (delta < 0 && currentScrolledIndex < relatedScrolledArray.length - 1)
      currentScrolledIndex++;
    else {
      delta = null;
      return;
    }
    if (currentScrolledIndex != indexB4Scrolling) {
      partPointer = scrolledStack;
      let (tempPart = enhancedURLBar.firstChild) {
        partsWidth = 0;
        while (tempPart != partPointer) {
          partsWidth += tempPart.boxObject.width;
          tempPart = tempPart.nextSibling;
        }
      }
      mouseScrolled = true;
      let scrollVal = relatedScrolledArray[currentScrolledIndex][0].split(" > ");
      for (let i = 0; i < scrollVal.length; i++) {
        addPart(scrollVal[i], relatedScrolledArray[currentScrolledIndex][1], false, false,
          i == relatedScrolledArray[currentScrolledIndex][0].split(" > ").length - 1);
        if (partPointer != null) {
          highlightPart(partPointer.previousSibling, true, true);
          if (i == 0)
            scrolledStack = partPointer.previousSibling;
        }
        else {
          highlightPart(enhancedURLBar.lastChild, true, true);
          if (i == 0)
            scrolledStack = enhancedURLBar.lastChild;
        }
      }
    }
    else if (currentScrolledIndex == indexB4Scrolling){
      mouseScrolled = false;
      partPointer = scrolledStack.nextSibling;
      updateURL();
      while (partPointer != null) {
        highlightPart(partPointer, false, false);
        partPointer = partPointer.nextSibling;
      }
      highlightPart(scrolledStack, true, true);
      partPointer = enhancedURLBar.firstChild;
    }
    delta = null;
    updateLook();
  }

  function globalEventHandler(type, node, e) {
    switch(type) {
      case "clickOnFirstChild":
        // Handling the click on the first part of any breadcrumb
        // node == breadcrumb
        if (e.button == 2) {
          e.preventDefault();
          return;
        }
        if (node.getAttribute("isHiddenArrow") != "false")
          return;
        if (arrowMouseDown ) {
          clearPopup();
          siblingsShown = arrowMouseDown = false;
          highlightPart(node, false, false, '>');
          return;
        }
        if (e.button == 0 && !e.ctrlKey)
          handleTextClick("", node, false);
        else if (e.button == 1 || e.ctrlKey)
          handleTextClick("", node, false, true);
        break;

      case "scroll":
        // Handling scroll on the breadcrumb
        // node == breadcrumb
        if (node.getAttribute("isHiddenArrow") != "false")
          return;
        if (arrowMouseDown || siblingsShown)
          return;
        let currentTime = new Date();
        if (currentTime.getTime() - lastScrolledTime < 75)
          return;
        else
          lastScrolledTime = currentTime.getTime();
        currentTime = null;
        scrolledStack = node;
        if (scrolledStack.previousSibling != null &&
          (scrolledStack.previousSibling.getAttribute("url") != lastScrolledUrl || refreshRelatedArray)) {
          refreshRelatedArray = false;
          lastScrolledUrl = scrolledStack.previousSibling.getAttribute("url");
          if (scrolledStack.previousSibling == null)
            return;
          // Making getAsyncRelatedArray to call a pseudo function first which sets
          // currentScrolledIndex and indexB4Scrolling and then calls handleScroll
          getAsyncRelatedArray(scrolledStack.previousSibling, function([detail, returnedArray]) {
            relatedScrolledArray = returnedArray;
            currentScrolledIndex = null;
            Array.some(relatedScrolledArray, function(relatedPart, index) {
              if (enhancedURLBar.lastChild.getAttribute("url").replace(/^(https?:\/\/)/,"")
                .replace(/[\/]$/, "") == relatedPart[1].replace(/[\/]$/, "")) {
                  currentScrolledIndex = index;
                  return true;
              }
            });
            if (currentScrolledIndex == null)
              return;
            if (!mouseScrolled)
              indexB4Scrolling = currentScrolledIndex;
            handleScroll([detail]);
          }, [e.detail]);
        }
        else if (scrolledStack.previousSibling != null) {
          currentScrolledIndex = null;
          Array.some(relatedScrolledArray, function(relatedPart, index) {
            if (enhancedURLBar.lastChild.getAttribute("url").replace(/^(https?:\/\/)/,"")
              .replace(/[\/]$/, "") == relatedPart[1].replace(/[\/]$/, "")) {
                currentScrolledIndex = index;
                return true;
            }
          });
          if (currentScrolledIndex == null)
            return;
          if (!mouseScrolled)
            indexB4Scrolling = currentScrolledIndex;
          handleScroll([e.detail]);
        }
        break;

      case "mouseoverOnFirstChild":
        // Mouseover Handling Function for the first child of breadcrumb
        // node == breadcrumb
        if (node.getAttribute("isHiddenArrow") != "false"
          || (node.getAttribute("lastArrowHidden") == "true"
          && arrowMouseDown) || siblingsShown || mouseScrolled)
            return;
        if (e.ctrlKey) {
          hideEnhancedURLBar();
          return;
        }
        if (arrowMouseDown) {
          if (!pref("useStyleSheet"))
            node.lastChild.value = "v";
          getAsyncRelatedArray(node, handleArrowClick,
            [node, false]);
        }
        else
          highlightPart(node, true, true);
        break;

      case "mouseoverOnLastChild":
        // Mouseover Handling Function for the last child of breadcrumb
        // node == breadcrumb
        if (e.ctrlKey) {
          hideEnhancedURLBar();
          return;
        }
        if (mouseScrolled)
          return;
        if (node.getAttribute("lastArrowHidden") == "true" || siblingsShown)
          return;
        if (arrowMouseDown && node.getAttribute("isHiddenArrow") == "false") {
          if (!pref("useStyleSheet"))
            node.lastChild.value = "v";
          getAsyncRelatedArray(node, handleArrowClick, [node, false]);
        }
        else if (!arrowMouseDown)
          highlightPart(node, "partial", true);
        if (node.getAttribute("isHiddenArrow") != "false" && !pref("useStyleSheet"))
          node.lastChild.style.padding = "2px 2px 1px 2px";
        break;

      case "mousedownOnFirstChild":
        // Mousedown Handling Function for the first child of breadcrumb
        // node == breadcrumb
        if (e.button == 2)
          e.preventDefault();
        if (node.getAttribute("isHiddenArrow") != "false")
          return;
        if (arrowMouseDown || siblingsShown)
          return;

        if (e.button == 0 && !e.ctrlKey) {
          if (mouseScrolled) {
            partPointer = enhancedURLBar.lastChild;
            mouseScrolled = false;
            currentScrolledIndex = indexB4Scrolling;
            while (partPointer) {
              highlightPart(partPointer, false, false);
              partPointer = partPointer.previousSibling;
            }
            partPointer = enhancedURLBar.firstChild;
            mouseScrolled = true;
          }
          handleTextClick("", node, true);
        }
        else if (e.button == 2 && node.previousSibling != null && !arrowMouseDown) {
          siblingsShown = true;
          getAsyncRelatedArray(node.previousSibling, handleArrowClick, [node, true]);
        }
        else if (e.button == 2) {
          clearPopup();
          siblingsShown = true;
          arrowMouseDown = true;
          popupStack = node;
          highlightPart(popupStack, true, true);
          mainPopup.appendChild(getMenuItems(popupStack));

          // Show the popup below the arrows
          mainPopup.openPopup(popupStack, "after_start", -30, 0);
          listen(window, mainPopup, "popuphidden", hideMainPopup = function() {
            mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
            try {
              mainPopup.hidePopup();
            } catch(ex) {}
            arrowMouseDown = false;
            siblingsShown = false;
            highlightPart(popupStack, false, false, '>');
          });
        }
        else if (e.button == 1 || e.ctrlKey)
          handleTextClick("", node, true, true);
        break;

      case "mousedownOnLastChild":
        // Mousedown Handling Function for the last child of breadcrumb
        // node == breadcrumb
        if (e.button == 2)
          e.preventDefault();
        if (node.getAttribute("lastArrowHidden") == "true")
          return;
        if (arrowMouseDown || siblingsShown) {
          clearPopup();
          siblingsShown = arrowMouseDown = false;
          return;
        }
        if (e.button == 0) {
          if (node.getAttribute("isHiddenArrow") == "false")
            getAsyncRelatedArray(node, handleArrowClick, [node, true]);
          else
            showHidden(node, true, node.getAttribute("isHiddenArrow") == "true"? -1:1);
        }
        break;

      case "mouseupOnFirstChild":
        // Mouseup Handling Function for the first child of breadcrumb
        // node == breadcrumb
        if (e.button == 2)
          e.preventDefault();
        if (node.getAttribute("isHiddenArrow") != "false")
          return;
        textMouseDown = false;
        if (!arrowMouseDown)
          highlightPart(node, false, false, '>');
        break;

      case "mouseupOnLastChild":
        // Mouseup Handling Function for the last child of breadcrumb
        // node == breadcrumb
        if (e.button == 2)
          e.preventDefault();
        if (node.getAttribute("isHiddenArrow") == "false")
          return;
        arrowMouseDown = false;
        highlightPart(node, false, false);
        break;

      case "mouseout":
        // Mouseout Handling Function for the breadcrumb
        // node == breadcrumb
        if (node.getAttribute("isHiddenArrow") != "false" && !arrowMouseDown) {
          highlightPart(node, false, false);
          if (!pref("useStyleSheet"))
            node.lastChild.style.padding = "2px 2px 1px 2px";
          return;
        }
        else if (arrowMouseDown)
          return;
        if ((arrowMouseDown && node.getAttribute("lastArrowHidden") == "true") || siblingsShown)
          return;
        textMouseDown = false;
        if (mouseScrolled) {
          async(function() {
            partPointer = scrolledStack;
            mouseScrolled = false;
            currentScrolledIndex = indexB4Scrolling;
            while (partPointer) {
              highlightPart(partPointer, false, false);
              partPointer = partPointer.nextSibling;
            }
            partPointer = enhancedURLBar.firstChild;
            updateURL();
          }, 250);
          return;
        }
        highlightPart(node, false, false, '>');
        break;
    }
  }

  function addEventListenersOnEnhancedURLBar() {
    listen(window, enhancedURLBar, "click", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar
        && e.originalTarget.nextSibling)
          globalEventHandler("clickOnFirstChild", e.originalTarget.parentNode, e);
    });
    listen(window, enhancedURLBar, "DOMMouseScroll", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar)
        globalEventHandler("scroll", e.originalTarget.parentNode, e);
    });
    listen(window, enhancedURLBar, "mouseover", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar) {
        if (e.originalTarget.nextSibling)
          globalEventHandler("mouseoverOnFirstChild", e.originalTarget.parentNode, e);
        else
          globalEventHandler("mouseoverOnLastChild", e.originalTarget.parentNode, e);
      }
    });
    listen(window, enhancedURLBar, "mousedown", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar) {
        if (e.originalTarget.nextSibling)
          globalEventHandler("mousedownOnFirstChild", e.originalTarget.parentNode, e);
        else
          globalEventHandler("mousedownOnLastChild", e.originalTarget.parentNode, e);
      }
    });
    listen(window, enhancedURLBar, "mouseup", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar) {
        if (e.originalTarget.nextSibling)
          globalEventHandler("mouseupOnFirstChild", e.originalTarget.parentNode, e);
        else
          globalEventHandler("mouseupOnLastChild", e.originalTarget.parentNode, e);
      }
    });
    listen(window, enhancedURLBar, "mouseout", function(e) {
      if (e.originalTarget.parentNode.parentNode == enhancedURLBar)
        globalEventHandler("mouseout", e.originalTarget.parentNode, e);
    });
  }

  function highlightPart(highlightedObj, text, arrow, arrowVal) {
    if (highlightedObj == null)
      return;
    let gradient = "";
    if (!mouseScrolled)
      gradient = "-moz-linear-gradient(top, rgba(228,245,252,0.15) " +
        "0%, rgba(191,232,249,0.25) 50%, rgba(159,216,239,0.25) 51%, rgba(42,176,237,0.35) 100%)"
    else
      gradient = "-moz-linear-gradient(top, rgba(249,228,187,0.5) 0%, rgba(249,164,67,0.5) 100%)";

    if (text == true) {
      highlightedObj.firstChild.style.backgroundImage = gradient;
      highlightedObj.firstChild.style.border = "1px solid rgba(150,150,175,0.75)";
      highlightedObj.firstChild.style.boxShadow = "inset -1px -1px 1px 1px rgba(200,210,225,0.75)";
    }
    else if (text == false) {
      highlightedObj.firstChild.style.backgroundImage = "";
      highlightedObj.firstChild.style.border = "1px solid rgba(255,255,255,0)";
      highlightedObj.firstChild.style.boxShadow = "";
    }
    else {
      highlightedObj.firstChild.style.backgroundImage = "-moz-linear-gradient(top, rgba(200,220,250,0.05) " +
        "0%, rgba(150,175,200,0.2) 50%, rgba(75,85,120,0.2) 51%, rgba(75,75,125,0.25) 100%)";
      highlightedObj.firstChild.style.border = "1px solid rgba(150,150,150,0.75)";
      highlightedObj.firstChild.style.boxShadow = "inset -1px -1px 1px 1px rgba(200,210,225,0.75)";
    }

    if (arrow) {
      highlightedObj.lastChild.style.backgroundImage = gradient;
      highlightedObj.lastChild.style.border = "1px solid rgba(150,150,175,0.75)";
      highlightedObj.lastChild.style.boxShadow = "inset -1px -1px 1px 1px rgba(200,210,225,0.75)";
    }
    else {
      highlightedObj.lastChild.style.backgroundImage = "";
      highlightedObj.lastChild.style.border = "1px solid rgba(255,255,255,0)";
      highlightedObj.lastChild.style.boxShadow = "";
    }
    // Apply the mouseDown effect (shadow , padding etc)
    if (arrowVal == '>' && !arrowMouseDown)
      highlightedObj.lastChild.value = arrowVal;
    else if (arrowVal != null && arrowVal != '>')
      highlightedObj.lastChild.value = arrowVal;
    if ((arrowMouseDown || textMouseDown) && forcedFlushing != true) {
      highlightedObj.firstChild.style.backgroundImage = highlightedObj.lastChild.style.backgroundImage =
        "-moz-linear-gradient(top, rgba(228,245,252,0.35) " +
        "0%, rgba(191,232,249,0.5) 50%, rgba(159,216,239,0.5) 51%, rgba(42,176,237,0.75) 100%)";
      highlightedObj.firstChild.style.border =
        highlightedObj.lastChild.style.border = "1px solid rgba(100,110,150,0.75)";
      highlightedObj.lastChild.style.boxShadow = highlightedObj.firstChild.style.boxShadow =
        "inset 1px 2px 1px rgba(120,130,160,0.8)";
      if (highlightedObj == enhancedURLBar.firstChild)
        highlightedObj.firstChild.style.padding = "3px 0px 0px 4px";
      else
        highlightedObj.firstChild.style.padding = "3px 0px 0px 3px";
      if (siblingsShown)
        highlightedObj.lastChild.style.padding = "2px 1px 1px 2px";
      else
        highlightedObj.lastChild.style.padding = "2px 3px 1px 2px";
    }
    else {
      highlightedObj.lastChild.style.boxShadow = highlightedObj.firstChild.style.boxShadow = "";
      if (highlightedObj == enhancedURLBar.firstChild)
        highlightedObj.firstChild.style.padding = "2px 1px 1px 3px";
      else
        highlightedObj.firstChild.style.padding = "2px 1px 1px 2px";
      highlightedObj.lastChild.style.padding = "2px 1px 1px 2px";
    }
    gradient = null;
  }

  if (pref("useStyleSheet")) {
    highlightPart = function(highlightedObj, text, arrow, arrowVal) {
      if (highlightedObj == null)
        return;

      function applyClass(c) {
        let bC = "", nD = "";
        if (highlightedObj.getAttribute("isAnchorTag") == "true") {
          c = "anchor-" + c;
          bC += "-anchor";
        }
        else if (highlightedObj.getAttribute("isSetting") == "true") {
          c = "queryString-" + c;
          bC += "-queryString";
        }
        if (highlightedObj.getAttribute("isHiddenArrow") == "true") {
          c = "backChevron-" + c;
          bC = "-backChevron";
        }
        else if (highlightedObj.getAttribute("isHiddenArrow") != "false") {
          c = "frontChevron-" + c;
          bC = "-frontChevron";
        }
        else if (highlightedObj.getAttribute("lastArrowHidden") == "true") {
          c = "noArrow-" + c;
          bC = "-noArrow" + bC;
        }
        if (enhancedURLBar.firstChild && ((highlightedObj != enhancedURLBar.firstChild
          && !showingHidden) || (showingHidden
          && (highlightedObj != enhancedURLBar.firstChild.nextSibling
          || hiddenStartingIndex != 0))) && c.search("normal") >= 0
          && highlightedObj.getAttribute("isSetting") == "false"
          && highlightedObj.getAttribute("isHiddenArrow") == "false")
            nD += " enhanced-nonDomainPart";
        highlightedObj.firstChild.setAttribute("class", "enhanced-text" + bC + " enhanced-text-" + c + nD);
        highlightedObj.lastChild.setAttribute("class", "enhanced-arrow" + bC + " enhanced-arrow-" + c + nD);
        if (highlightedObj.previousSibling && c.search("normal") < 0 &&
          highlightedObj.previousSibling.getAttribute("isHiddenArrow") == "false") {
            let (d = "-left") {
              if (mouseScrolled && highlightedObj != scrolledStack)
                d += "Scrolled";
              highlightedObj.previousSibling.lastChild.setAttribute("class",
                highlightedObj.previousSibling.lastChild.getAttribute("class")
                .split(" ")[0] + " enhanced-arrow-" + c + d);
            }
        }
        else if (highlightedObj.previousSibling && c.search("normal") >= 0 &&
          highlightedObj.previousSibling.getAttribute("isHiddenArrow") == "false") {
            if (highlightedObj.previousSibling == enhancedURLBar.firstChild)
              nD = "";
            c = "normal";
            bC = "";
            if (highlightedObj.previousSibling.getAttribute("isAnchorTag") == "true") {
              c = "anchor-" + c;
              bC += "-anchor";
            }
            else if (highlightedObj.previousSibling.getAttribute("isSetting") == "true") {
              c = "queryString-" + c;
              bC += "-queryString";
            }
            highlightedObj.previousSibling.lastChild.setAttribute("class",
              "enhanced-arrow" + bC + " enhanced-arrow-" + c + nD);
        }
        bC = null;
        if (enhancedURLBar.hasAttribute("domainVisible") && highlightedObj == enhancedURLBar.firstChild)
          enhancedURLBar.setAttribute("condition", c);
      }

      if (mouseScrolled) {
        applyClass("mouseScroll");
        return;
      }

      if ((arrowMouseDown || textMouseDown) && forcedFlushing != true) {
        if (text == true)
          applyClass("textMouseDown");
        else if (text == "partial")
          applyClass("arrowMouseDown");
        else
          applyClass("normal");
      }
      else {
        if (text == true)
          applyClass("textHovered");
        else if (text == "partial")
          applyClass("arrowHovered");
        else
          applyClass("normal");
      }
    };
  }

  function createStack(createVal, partURL, partType, hiddenArrow) {
    if (urlBarHeight == null || urlBarHeight <= 0)
      urlBarHeight = gURLBar.boxObject.height;

    let createdStack = document.createElementNS(XUL, "hbox");
    createdStack.style.height = urlBarHeight + "px";
    createdStack.style.display = "-moz-box";
    createdStack.setAttribute("flex", 0);
    createdStack.setAttribute("url", partURL);
    createdStack.setAttribute("lastArrowHidden", false);
    if (partType == "setting" || partType == "anchor")
      createdStack.setAttribute("isSetting", true);
    else
      createdStack.setAttribute("isSetting", false);
    if (partType == "anchor")
      createdStack.setAttribute("isAnchorTag", true);
    else
      createdStack.setAttribute("isAnchorTag", false);
    if (partType == "domain") {
      createdStack.setAttribute("isDomain", true);
      if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
        $("identity-box").setAttribute("isDomain", true);
    }
    else {
      createdStack.setAttribute("isDomain", false);
      try {
        $("identity-box").removeAttribute("isDomain");
      } catch (ex) {}
    }

    // Adding the Text Stack
    let tempS = document.createElementNS(XUL, "label");
    let trimmedVal = trimWord(createVal);
    tempS.setAttribute("value", trimmedVal);
    tempS.setAttribute("id", "UIEnhancer_URLBar_Stack_Text");
    //tempS.style.minHeight = (urlBarHeight - (pref("useStyleSheet")? 0: 4)) + "px";
    // Adding tooltip texts
    if (trimmedVal == createVal) {
      tempS.setAttribute("tooltiptext", l10n("rightClick.tooltip")
        + (!enhancedURLBar.firstChild? ".": " " + l10n("sibling.tooltip"))
        + l10n("dragDrop.tooltip"));
    }
    else {
      tempS.setAttribute("tooltiptext", createVal);
    }
    if ((partType == "domain" && (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))) || hiddenArrow)
      tempS.style.display = "none";
    else
      tempS.style.display = "-moz-box";
    tempS.setAttribute("flex", 0);

    // Adding the Arrow Stack
    let tempArrow = document.createElementNS(XUL, "label");
    tempArrow.setAttribute("id", "UIEnhancer_URLBar_Stack_Arrow");
    //tempArrow.style.minHeight = (urlBarHeight - (pref("useStyleSheet")? 0: 4)) + "px";
    tempArrow.style.display = "-moz-box";
    tempArrow.setAttribute("flex", 0);
    if (!hiddenArrow)
      tempArrow.setAttribute("tooltiptext", l10n("click.tooltip"));
    if (hiddenArrow)
      createdStack.setAttribute("isHiddenArrow", hiddenArrow);
    else
      createdStack.setAttribute("isHiddenArrow", false);

    // Applying styles to various parts if pref is off
    if (!pref("useStyleSheet")) {
      // Aplpying style to parent stack
      createdStack.style.padding = "0px";
      createdStack.style.margin = "0px";
      // Applying style to text part
      if (!enhancedURLBar.firstChild)
        tempS.style.padding = "2px 1px 1px 3px";
      else
        tempS.style.padding = "2px 1px 1px 2px";
      tempS.style.margin = "0px";
      tempS.style.backgroundImage = "rgba(255,255,255,0)";
      tempS.style.border = "1px solid rgba(255,255,255,0)";
      if (partType == "setting" || partType == "anchor")
        tempArrow.style.color = tempS.style.color = "rgb(100,100,100)";
      else
        tempArrow.style.color = tempS.style.color = "rgb(30,30,30)";
      // Applying style to arrow part
      tempArrow.style.margin = "0px";
      if (partType != "domain" && !hiddenArrow)
        tempArrow.style.padding = "2px 1px 1px 2px";
      else if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
        tempArrow.style.padding = "2px 2px 1px 2px";
      tempArrow.style.backgroundImage = "rgba(255,255,255,0)";
      tempArrow.style.border = "1px solid rgba(255,255,255,0)";
      if (hiddenArrow == true)
        tempArrow.setAttribute("value", "«");
      else if (hiddenArrow)
        tempArrow.setAttribute("value", "»");
      else
        tempArrow.setAttribute("value", ">");
    }
    else
      createdStack.setAttribute("class", "enhanced-stack");

    createdStack.appendChild(tempS);
    createdStack.appendChild(tempArrow);
    if (pref("useStyleSheet"))
      highlightPart(createdStack, false, false);
    tempS = tempArrow = null;
    return createdStack;
  }

  // Function to add parts to the enhancedURLBar
  function addPart(partVal, partURL, domain, isSetting, lastPart) {
    partVal = makeCapital(partVal);
    // Deciding if the part is domain or setting
    let partType;
    if (domain)
      partType = "domain";
    else if (isSetting == true)
      partType = "setting";
    else if (isSetting == "anchor")
      partType = "anchor";
    else
      partType = "null";
    if (partType != "domain" && partType != "setting"
      && partType != "anchor" && partVal.length > 20)
        lastUsefulPart = partVal;
    if (partPointer != null) {
      if (domain == false) {
        partPointer.firstChild.style.display = "-moz-box";
        partPointer.setAttribute("isDomain", false);
        try {
          $("identity-box").removeAttribute("isDomain");
        } catch (ex) {}
      }
      else if (domain == true) {
        partPointer.setAttribute("isDomain", true);
        if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) {
          $("identity-box").setAttribute("isDomain", true);
          partPointer.firstChild.style.display = "none";
        }
        else
          partPointer.firstChild.style.display = "-moz-box";
      }
      if (isSetting == false) {
        if (!pref("useStyleSheet")) {
          partPointer.firstChild.style.color = "rgb(30,30,30)";
          partPointer.lastChild.style.color = "rgb(50,50,50)";
        }
        partPointer.setAttribute("isSetting", false);
      }
      else {
        if (!pref("useStyleSheet")) {
          partPointer.firstChild.style.color = "rgb(100,100,100)";
          partPointer.lastChild.style.color = "rgb(125,125,125)";
        }
        partPointer.setAttribute("isSetting", true);
      }
      if (isSetting == "anchor")
        partPointer.setAttribute("isAnchorTag", true);
      else
        partPointer.setAttribute("isAnchorTag", false);
      if (partPointer.firstChild.value != trimWord(partVal))
        partPointer.firstChild.setAttribute("value", trimWord(partVal));
      partPointer.setAttribute("url", partURL);
      partPointer.setAttribute("isHiddenArrow", false);
      partPointer.firstChild.setAttribute("tooltiptext", l10n("rightClick.tooltip")
        + (partPointer == enhancedURLBar.firstChild? ".": " " +l10n("sibling.tooltip"))
        + l10n("dragDrop.tooltip"));
      partPointer.lastChild.setAttribute("tooltiptext", l10n("click.tooltip"));
      if (!lastPart) {
        partPointer.lastChild.style.display = "-moz-box";
        partPointer.setAttribute("lastArrowHidden", false);
      }
      if (!pref("useStyleSheet")) {
        partPointer.lastChild.setAttribute("value",">");
        partPointer.lastChild.style.padding = "2px 2px 1px 2px";
      }
      else
        highlightPart(partPointer, false, false);
      partsWidth += partPointer.boxObject.width;
      partPointer = partPointer.nextSibling;
    }
    else {
      let addedStack = createStack(partVal, partURL, partType, false);
      enhancedURLBar.appendChild(addedStack);
      partsWidth += addedStack.boxObject.width;
      addedStack = null;
    }
    // Clearing rest of the parts if lastPart
    if (lastPart)
      clearRest();
    let tStack = null;
    let tempPart = null;
    // Hiding the first parts on overflow if not mouseScrolled
    // else trimming the last parts further more
    if (partsWidth > MAXWIDTH && !mouseScrolled && !showingHidden) {
      let isDomainHidden = enhancedURLBar.firstChild.getAttribute("isDomain") == "true";
      while (partsWidth > MAXWIDTH -
        (isDomainHidden || (hiddenStartingIndex > 0)? 15: 0)) {
          if (enhancedURLBar.firstChild == null)
            break;
          tempPart = enhancedURLBar.firstChild;
          if (tempPart.getAttribute("isHiddenArrow") == "true")
            tempPart = tempPart.nextSibling;
          partsWidth -= tempPart.boxObject.width;
          hiddenStartingIndex++;
          enhancedURLBar.removeChild(tempPart);
          tempPart = null;
      }
      // If hiddenStartingIndex is 1 , bring it back if iLabel is same
      if ((!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) && lastPart && hiddenStartingIndex == 1 && enhancedURLBar.firstChild
        && urlArray_updateURL[0].replace("www.", "") == identityLabel.value.toLowerCase()) {
          if (enhancedURLBar.firstChild.getAttribute("isHiddenArrow") == "true") {
            enhancedURLBar.firstChild.firstChild.style.display = "none";
            enhancedURLBar.firstChild.setAttribute("isDomain", true);
            enhancedURLBar.firstChild.setAttribute("isSetting", false);
            enhancedURLBar.firstChild.setAttribute("isAnchorTag", false);
            enhancedURLBar.firstChild.firstChild.setAttribute("value", trimWord(urlArray_updateURL[0]));
            enhancedURLBar.firstChild.firstChild.setAttribute("tooltiptext"
              , l10n("rightClick.tooltip") + l10n("dragDrop.tooltip"));
            if (!pref("useStyleSheet")) {
              enhancedURLBar.firstChild.lastChild.setAttribute("value",">");
              enhancedURLBar.firstChild.firstChild.style.color = "rgb(30,30,30)";
              enhancedURLBar.firstChild.lastChild.style.color = "rgb(50,50,50)";
            }
            else {
              enhancedURLBar.firstChild.firstChild.setAttribute
                ("class", "enhanced-text enhanced-text-normal");
              enhancedURLBar.firstChild.lastChild.setAttribute
                ("class", "enhanced-arrow enhanced-arrow-normal");
            }
            enhancedURLBar.firstChild.setAttribute("isHiddenArrow", false);
            enhancedURLBar.firstChild.setAttribute("url", urlValue.slice(0, urlPartArray[0]));
          }
          else {
            tStack = createStack(urlArray_updateURL[0],
              urlValue.slice(0, urlPartArray[0]), "domain", false);
            partsWidth += tStack.boxObject.width;
            enhancedURLBar.insertBefore(tStack, enhancedURLBar.firstChild);
            tStack = null;
          }
          hiddenStartingIndex = 0;
      }
      else if ((!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) && lastPart && hiddenStartingIndex == 1 && !enhancedURLBar.firstChild
        && urlArray_updateURL[0].replace("www.", "") == identityLabel.value.toLowerCase()) {
          tStack = createStack(urlArray_updateURL[0], urlValue.slice(0,
            urlPartArray[0]), "domain", false);
          partsWidth += tStack.boxObject.width;
          hiddenStartingIndex = 0;
          enhancedURLBar.appendChild(tStack);
          tStack = null;
      }
      else if (lastPart && hiddenStartingIndex > 0 && enhancedURLBar.firstChild
        && enhancedURLBar.firstChild.getAttribute("isHiddenArrow") != "true") {
          tStack = createStack(partVal, urlValue.slice
            (0, urlPartArray[hiddenStartingIndex - 1]), "null", true);
          partsWidth += tStack.boxObject.width;
          enhancedURLBar.insertBefore(tStack, enhancedURLBar.firstChild);
          tStack = null;
      }
      if (lastPart && hiddenStartingIndex > 0 && enhancedURLBar.firstChild == null) {
        setOpacity(1);
        enhancedURLBar.style.display = "none";
      }
      else {
        setOpacity(0);
        enhancedURLBar.style.display = "-moz-box";
      }
    }
    // else if statement to handle the condition when we scroll on a part
    // and the total url overflows
    else if (partsWidth > MAXWIDTH && mouseScrolled && !showingHidden) {
      let pixelPerWord = scrolledStack.firstChild.boxObject.width/
        scrolledStack.firstChild.getAttribute("value").length;
      if (scrolledStack == enhancedURLBar.lastChild)
        scrolledStack.firstChild.setAttribute("value",
          trimWord(scrolledStack.firstChild.getAttribute("value"),
          (MAXWIDTH - partsWidth + scrolledStack.firstChild.boxObject.width)
          /pixelPerWord));
      else {
        tempPart = enhancedURLBar.lastChild;
        while (partsWidth > MAXWIDTH && !tempPart && tempPart != scrolledStack) {
          partsWidth -= tempPart.boxObject.width;
          if (MAXWIDTH - partsWidth >= 30) {
            tempPart.firstChild.setAttribute("value", trimWord(
              tempPart.firstChild.getAttribute("value"), (MAXWIDTH
              - partsWidth)/pixelPerWord));
            partsWidth += tempPart.boxObject.width;
            tempPart = tempPart.previousSibling;
          }
          else {
            enhancedURLBar.removeChild(tempPart);
            tempPart = enhancedURLBar.lastChild;
          }
        }
        tempPart = null;
      }
      pixelPerWord = null;
    }
    else if (lastPart && hiddenStartingIndex > 0 && enhancedURLBar.firstChild
      && enhancedURLBar.firstChild.getAttribute("isHiddenArrow") != "true" && !showingHidden) {
        tStack = createStack(partVal, urlValue.slice
          (0, urlPartArray[hiddenStartingIndex - 1]), "null", true);
        partsWidth += tStack.boxObject.width;
        enhancedURLBar.insertBefore(tStack, enhancedURLBar.firstChild);
        tStack = null;
    }
    else if (lastPart && hiddenStartingIndex > 0 && !enhancedURLBar.firstChild && !showingHidden) {
      tStack = createStack(partVal, urlValue.slice
        (0, urlPartArray[hiddenStartingIndex - 1]), "null", true);
      partsWidth += tStack.boxObject.width;
      enhancedURLBar.appendChild(tStack);
      tStack = null;
    }
    // If space is available, utilize it by completely showing the last useful part
    if (lastPart && lastUsefulPart != null) {
      if (mouseScrolled)
        return;
      let tempP = enhancedURLBar.lastChild;
      while (tempP != null && (tempP.getAttribute("isSetting") == "true"
        || (tempP.getAttribute("isSetting") == "false"
        && tempP.firstChild.getAttribute("value").length <= 20))) {
        tempP = tempP.previousSibling;
      }
      if (tempP == null || tempP.getAttribute("isDomain") == "true")
        return;
      let width = tempP.firstChild.boxObject.width;
      let chars = (MAXWIDTH - partsWidth + width - 20)/
        (width/tempP.firstChild.getAttribute("value").length);
      if (chars > tempP.firstChild.getAttribute("value").length) {
        tempP.firstChild.setAttribute("value", trimWord(lastUsefulPart, chars));
        // Updating the part to get real width and repeating for further accuracy
        partsWidth += tempP.firstChild.boxObject.width - width;
        width = tempP.firstChild.boxObject.width;
        tempP.firstChild.setAttribute("value", trimWord(lastUsefulPart,
          (MAXWIDTH - partsWidth + width - 20)/
          (width/tempP.firstChild.getAttribute("value").length)));
        partsWidth += tempP.firstChild.boxObject.width - width;
      }
      lastUsefulPart = null;
    }
  }

  // Function to reset the enhancedURLBar
  function reset(opacity) {
    if (enhancedURLBar.firstChild)
      partPointer = enhancedURLBar.firstChild;
    setOpacity(opacity);
    partsWidth = 0;
    hiddenStartingIndex = 0;
    // opacity 1 means we are hiding the enhancedURLBar
    if (opacity == 1) {
      if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
        identityLabel.collapsed = identityCountryLabel.collapsed = true;
      enhancedURLBar.style.width = "0px";
      enhancedURLBar.style.display = "none";
    }
    else if (opacity == 0) {
      enhancedURLBar.style.display = "-moz-box";
    }
  }

  function clearRest() {
    let tempPointer;
    while (partPointer) {
      tempPointer = partPointer;
      partPointer = partPointer.nextSibling;
      enhancedURLBar.removeChild(tempPointer);
      tempPointer = null;
    }
    tempPointer = null;
  }

  // Function to handle mouse clicks
  function handleTextClick(partText, clickedStack, mouseDown, centerClick) {
    if (mouseDown && clickedStack != null) {
      if (arrowMouseDown && popupStack == clickedStack) {
        clearPopup();
        arrowMouseDown = false;
        highlightPart(clickedStack, false, false, '>');
        return;
      }
      textMouseDown = true;
      highlightPart(clickedStack, true, true, 'v');
      return;
    }
    // Open in new tab if center clicked
    let tab = "current";
    if (centerClick == true)
      tab = "tab";
    if (partText != "") {
      mouseScrolled = false;
      if (partText == "about")
        partText += ":";
      window.openUILinkIn(partText, tab);
    }
    else if (clickedStack != enhancedURLBar.lastChild || mouseScrolled || tab == "tab") {
      mouseScrolled = false;
      let url = clickedStack.getAttribute("url");
      if (url == "about")
        url += ":";
      window.openUILinkIn(url, tab);
    }
  }

  // Helper function used to fill missing entries in the relatedArray
  // only if the relatedArray is full of similar pattern
  function fillMissingEntries(resultArray, preURL, delta, currentI, callback, args) {
    let {length} = resultArray;
    if (length == 0) {
      args[args.length] = resultArray;
      callback(args);
    }
    let url1,url2,part1,part2,urlmatch,p1,itemsB4 = min(currentI,3);
    let i = (currentI != null?currentI:0);
    let fileNamePattern = false;
    while (itemsB4 < 7 && i >= 0 && resultArray[0][0].replace(/[^0-9]/g,"")*1 > delta) {
      url1 = resultArray[i][1].replace(preURL, "");
      part1 = resultArray[i][0];
      url2 = i != 0?resultArray[i - 1][1]:url1;
      part2 = i != 0?resultArray[i - 1][0]:part1;
      p1 = part1.replace(/[^0-9]/g,"")*1;
      if (i == length || part1 == part2 || p1 - part2.replace(/[^0-9]/g,"")*1 > delta) {
        part2 = part1.replace(/[0-9]/g,"") + (p1 - delta)*1;
        fileNamePattern = false;
        if (url1.match(/^[\/&#?]?[^.0-9]{0,}[0-9]+\.[^.0-9]{1,4}$/)) {
          urlmatch = url1.match(/([\/#&?]?[^.0-9]{0,})([0-9]+)(\.[^.0-9]{1,4})$/);
          if (urlmatch)
            fileNamePattern = true;
        }
        if (!fileNamePattern && part1.replace(/[0-9 ]/g,"").length > 0)
          urlmatch = url1.match(new RegExp("("+part1.replace(/[0-9 ]/g,"").toLowerCase()
            +")([_= ])?([0-9]{1,})"));
        else if (!fileNamePattern)
          urlmatch = url1.match(/([\/&?#]?)([_= ])?([0-9]{1,})/);
        if (urlmatch == null)
          break;
        if (urlmatch.length != 4)
          break;
        if (fileNamePattern) {
          let Y = ((p1 - delta)*1).toString();
          url2 = preURL + url1.replace(urlmatch[0],(urlmatch[1]||"")
            .concat(urlmatch[2].length > Y.length?
                    ("000000000000000000".slice(0, urlmatch[2].length - Y.length) + Y):
                    Y,(urlmatch[3]||"")));
          part2 = (urlmatch[1]||"1").slice(1).concat((urlmatch[2].length > Y.length?
                    ("000000000000000000".slice(0, urlmatch[2].length - Y.length) + Y):
                    Y) + (urlmatch[3]?urlmatch[3]:""));
          Y = null;
        }
        else
          url2 = preURL + url1.replace(urlmatch[0],(urlmatch[1]||"").concat((urlmatch[2]||""),(p1 - delta)*1));
        resultArray.splice(i,0,[part2,url2,true]);
        currentI++;
      }
      else if (i > 0) i--;
      itemsB4++;
    }
    if (itemsB4 < currentI) {
      resultArray.splice(0,currentI - itemsB4);
      currentI = itemsB4;
    }
    i = currentI + 1 || 1;
    length = resultArray.length;
    while ((currentI != null && i - currentI <= 7) || length <= 15) {
      url1 = resultArray[i - 1][1].replace(preURL, "");
      part1 = resultArray[i - 1][0];
      url2 = i != length?resultArray[i][1]:url1;
      part2 = i != length?resultArray[i][0]:part1;
      p1 = part1.replace(/[^0-9]/g,"")*1;
      if (i == length || part2.replace(/[^0-9]/g,"")*1 - p1 > delta) {
        part2 = part1.replace(/[0-9]/g,"") + (p1 + delta)*1;
        fileNamePattern = false;
        if (url1.match(/^[\/&#?]?[^.0-9]{0,}[0-9]+\.[^.0-9]{1,4}$/)) {
          urlmatch = url1.match(/^([\/#&?]?[^.0-9]{0,})([0-9]+)(\.[^.0-9]{1,4})$/);
          if (urlmatch)
            fileNamePattern = true;
        }
        if (!fileNamePattern && part1.replace(/[0-9 ]/g,"").length > 0)
          urlmatch = url1.match(new RegExp("("+part1.replace(/[0-9 ]/g,"").toLowerCase()
            +")([_= ])?([0-9]{1,})"));
        else if (!fileNamePattern)
          urlmatch = url1.match(/([\/&?#])([_= ])?([0-9]{1,})/);
        if (urlmatch == null)
          break;
        if (urlmatch.length != 4)
          continue;
        if (fileNamePattern) {
          let Y = ((p1 + delta)*1).toString();
          url2 = preURL + url1.replace(urlmatch[0],(urlmatch[1]||"")
            .concat(urlmatch[2].length > Y.length?
                    ("000000000000000000".slice(0, urlmatch[2].length - Y.length) + Y):
                    Y,(urlmatch[3]||"")));
          part2 = (urlmatch[1]||"1").slice(1).concat((urlmatch[2].length > Y.length?
                    ("000000000000000000".slice(0, urlmatch[2].length - Y.length) + Y):
                    Y) + (urlmatch[3]?urlmatch[3]:""));
          Y = null;
        }
        else
          url2 = preURL + url1.replace(urlmatch[0],(urlmatch[1]||"").concat((urlmatch[2]||""),(p1 + delta)*1));
        resultArray.splice(i,0,[part2,url2,true]);
        length++;
      }
      i++;
    }
    p1 = part1 = part2 = url1 = url2 = null;
    args[args.length] = resultArray;
    callback(args);
  }

  // Helper function used to get related history items
  function getAsyncRelatedArray(concernedStack, aCallback, aArgs) {
    spinQueryAsync(DBConnection, {
      names: ["url","title"],
      query: "SELECT * " +
             "FROM moz_places " +
             "WHERE url LIKE '%" + concernedStack.getAttribute("url")
             .replace(/^(https?:\/\/)?(www\.)?/,"") + "%' " +
             "ORDER BY frecency DESC " +
             "LIMIT 15",
    }, {
      callback: function([concernedStack, aCallback, aArgs, resultArray]) {
        let similarPattern = true;
        let delta = 9999;
        let tmpDelta = null;
        // Sorting the array based on the fact that if the text contains number
        // then sort taking into account the number as number and not string
        resultArray.sort(function(a, b) {
          let partURL = concernedStack.getAttribute("url").replace(/^(https?:\/\/)/,"");
          let valA = a.url.replace(/^(https?:\/\/)/,"");
          let valB = b.url.replace(/^(https?:\/\/)/,"");
          valA = valA.slice(partURL.length, valA.length);
          valB = valB.slice(partURL.length, valB.length);
          valA = valA.replace(/[\-_=]/g," ").replace(/[\/\\?&]/g, "").replace(/\.[^.]+$/, "");
          let aa = valA.split(/[0-9]+/g);
          valB = valB.replace(/[\-_=]/g," ").replace(/[\/\\?&]/g, "").replace(/\.[^.]+$/, "");
          let bb = valB.split(/[0-9]+/g);
          // Case when one is in number form and other is not
          if (aa.length != 2 && bb.length == 2 && bb[1] == "") {
            if (aa != "")
              similarPattern = false;
            return -1;
          }
          else if (bb.length != 2 && aa.length == 2 && aa[1] == "") {
            if (bb != "")
              similarPattern = false;
            return 1;
          }
          // Case when both are not in number form
          else if (aa.length != 2 || bb.length != 2
            || aa[aa.length - 1] != "" || bb[bb.length - 1] != "") {
              if (aa != "" || bb != "")
                similarPattern = false;
              return 0;
          }
          // Case when both in number form
          else if (aa[0].replace(/[\\\/?\-=+_]/g, "").toLowerCase()
            == bb[0].replace(/[\\\/?\-=+_]/g, "").toLowerCase()) {
              tmpDelta = valA.match(/[0-9]+/g)*1 - valB.match(/[0-9]+/g)*1;
              if (tmpDelta != 0 && delta > Math.abs(tmpDelta))
                delta = Math.abs(tmpDelta);
              return tmpDelta;
          }
        });
        let returnArray = [];
        let hasCurrentUrl = false;
        let currentUrlIndex = null;
        let reduceIndex = 0;
        let currentURL = enhancedURLBar.lastChild.getAttribute("url")
          .replace(/^(https?:\/\/)/,"").replace(/(\/)$/, "");
        let matching = false;
        let partURL,relatedVal,tempVal;
        partURL = concernedStack.getAttribute("url").replace(/^(https?:\/\/)/,"");
        for (let i = 0; i < resultArray.length; i++) {
          let url = resultArray[i].url;
          let title = resultArray[i].title;
          relatedVal = "";
          url = url.replace(/^(https?:\/\/)/,"").replace(/(\/)$/, "");
          relatedVal = url.slice(partURL.length, url.length).replace(/[\-_+]/g," ").replace("=", " =");
          if (relatedVal.match(/^[[\/?#&: ]{1}[[\/?#&: ]{0,1}$/) != null
            || !(relatedVal.length > 0 && relatedVal[0].match(/[\/?#&:]/))) {
              reduceIndex++;
              continue;
          }
          // Correcting the value to match the global styling
          relatedVal = relatedVal.slice(1).replace(/[\-_+]/g, " ").replace("=", "= ")
            .split(/[&\/?#]+/g).filter(function(v) { return v.length > 0;});
          Array.some(relatedVal, function(v, index) {
            if (gibberish(v) != false) {
              if (title != null && title.length > 0) {
                tempVal = trimWord(removeRedundantText(url.split(/[\/?&#]/)
                  .filter(function(v) { return v.length > 0;}), title), 75);
                if (tempVal.length == 0 || tempVal == " ")
                  relatedVal[index] = title;
                else
                  relatedVal[index] = tempVal;
              }
              return true;
            }
          });
          relatedVal = makeCapital(relatedVal.join(" > ").replace(/^(\s<\s)/,""));
          matching = false;
          Array.some(returnArray, function(tempP, index) {
            if (tempP[0].toLowerCase() == relatedVal.toLowerCase()
              && (tempP[1].toLowerCase() == url.toLowerCase()
              || tempP[1].toLowerCase() == currentURL.toLowerCase())) {
                  matching = true;
                  return true;
            }
            else if (tempP[0].toLowerCase() == relatedVal.toLowerCase()
              && tempP[1].toLowerCase() != currentURL.toLowerCase()){
                  returnArray.splice(index, 1);
                  if (currentUrlIndex != null && index < currentUrlIndex)
                    currentUrlIndex--;
                  else (currentUrlIndex == null)
                    reduceIndex++;
            }
          });
          if (matching) {
            reduceIndex++;
            continue;
          }
          else {
            if (url.toLowerCase() == currentURL.toLowerCase()) {
              hasCurrentUrl = true;
              currentUrlIndex = i - reduceIndex;
            }
            returnArray.push([relatedVal,url,title]);
          }
        }
        if (!hasCurrentUrl && concernedStack != enhancedURLBar.lastChild) {
          relatedVal = "";
          let tempS = concernedStack.nextSibling;
          while (tempS != null) {
            relatedVal += trimWord(tempS.firstChild.getAttribute("value"));
            tempS = tempS.nextSibling;
            if (tempS != null)
              relatedVal += " > ";
          }
          if (returnArray.length >= 15)
            returnArray.pop();
          returnArray.push([relatedVal,currentURL,""]);
          currentUrlIndex = returnArray.length - 1;
        }
        resultArray = null;
        if (similarPattern && delta != 9999)
          fillMissingEntries(returnArray, partURL, delta, currentUrlIndex, aCallback, aArgs);
        else if (similarPattern && returnArray.length == 1)
          fillMissingEntries(returnArray, partURL, 1, currentUrlIndex, aCallback, aArgs);
        else {
          // Calling the callback function for Async operations
          aArgs[aArgs.length] = returnArray;
          returnArray = null;
          aCallback(aArgs);
        }
      },
      args : [concernedStack, aCallback, aArgs]
    });
  }

  /* Context Menu helper functions
     Copy, Edit, Add */
  function copyToClipboard(copyURL) {
    // make a copy of the Unicode
    let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    if (!str) return;
    str.data = copyURL;
    // make a copy of the HTML
    let htmlstring = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    if (!htmlstring) return;
    htmlstring.data = "<a href=\"" + copyURL + "\">" + copyURL + "</a>";
    // add Unicode & HTML flavors to the transferable widget
    let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    if (!trans) return;
    trans.addDataFlavor("text/unicode");
    trans.setTransferData("text/unicode", str, copyURL.length * 2);
    trans.addDataFlavor("text/html");
    trans.setTransferData("text/html", htmlstring, htmlstring.data.length * 2);
    // copy the transferable widget!
    let clipboard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
    if (!clipboard) return;
    clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
  }

  function editPart(editingPart, nextPart) {
    // Trying to close the popup
    try {
      mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
    } catch (ex) {}
    editing = true;
    arrowMouseDown = siblingsShown = false;
    if (editingPart == enhancedURLBar.firstChild) {
      if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
        try {
          identityCountryLabel.collapsed = identityLabel.collapsed = true;
        } catch (ex) {}
      editingPart.setAttribute("isDomain", "false");
      editingPart.firstChild.style.display = "-moz-box";
    }
    highlightPart(editingPart, false, false, '>');

    let createdStack = document.createElementNS(XUL, "stack");
    createdStack.setAttribute("id", "UIEnhancer_URLBar_Editing_Stack");
    createdStack.style.height = urlBarHeight + "px";
    createdStack.style.display = "-moz-box";
    createdStack.setAttribute("flex", 0);
    createdStack.setAttribute("url", editingPart.getAttribute("url"));
    if (!nextPart) {
      createdStack.setAttribute("isSetting", editingPart.getAttribute("isSetting"));
      createdStack.setAttribute("isAnchorTag", editingPart.getAttribute("isAnchorTag"));
    }

    // Adding the Text Stack
    let tempS = document.createElementNS(XUL, "textbox");
    if (!nextPart)
      tempS.setAttribute("value", editingPart.getAttribute("url")
        .slice(((editingPart.previousSibling)?
        editingPart.previousSibling.getAttribute("url"): "").length));
    else {
      editingPart.setAttribute("lastArrowHidden", "false");
      if (!pref("useStyleSheet"))
        editingPart.lastChild.style.display = "-moz-box";
      highlightPart(editingPart, false, false);
    }
    tempS.setAttribute("id", "UIEnhancer_URLBar_Editing_Stack_Text");
    tempS.setAttribute("type", "autocomplete");
    tempS.setAttribute("autocompletesearch", "search-autocomplete");
    tempS.setAttribute("maxrows", 5);
    tempS.style.display = "-moz-box";
    tempS.style.maxWidth = tempS.style.minWidth = Math.max((nextPart?
      100: (editingPart.firstChild.boxObject.width +
      (editingPart == enhancedURLBar.firstChild? 75: 25))), 100) + "px";
    tempS.setAttribute("flex", 0);

    // Adding the Arrow Stack
    let tempArrow = document.createElementNS(XUL, "label");
    tempArrow.setAttribute("id", "UIEnhancer_URLBar_Editing_Stack_Arrow");
    tempArrow.style.display = "-moz-box";
    tempArrow.setAttribute("flex", 0);
    createdStack.setAttribute("isHiddenArrow", false);

    // Applying styles to various parts if pref is off
    if (!pref("useStyleSheet")) {
      // Aplpying style to parent stack
      createdStack.style.padding = "0px";
      createdStack.style.margin = "0px";
      // Applying style to text part
      tempS.style.padding = "2px 1px 1px 1px";
      tempS.style.margin = "0px";
      tempS.style.backgroundImage = "rgba(255,255,255,0)";
      tempS.style.border = "1px solid rgba(255,255,255,0)";
      tempArrow.style.color = tempS.style.color = "rgb(30,30,30)";
      // Applying style to arrow part
      tempArrow.style.margin = "0px";
      tempArrow.style.padding = "2px 1px 1px 2px";
      tempArrow.style.backgroundImage = "rgba(255,255,255,0)";
      tempArrow.style.border = "1px solid rgba(255,255,255,0)";
      tempArrow.setAttribute("value", ">");
    }
    else {
      createdStack.setAttribute("class", "enhanced-stack");
      tempS.setAttribute("class", "enhanced-text enhanced-text-normal");
      tempArrow.setAttribute("class", "enhanced-arrow enhanced-arrow-normal");
    }

    createdStack.appendChild(tempS);
    createdStack.appendChild(tempArrow);
    tempS = tempArrow = null;

    // Stopping the focus event to propagate
    listen(window, createdStack.firstChild, "focus", function(e) {
      e.target.setSelectionRange(0, e.target.value.length);
      e.preventDefault();
    });
    listen(window, createdStack.firstChild, "blur", function(e) {
      editing = false;
      if (e.target.parentNode == enhancedURLBar.firstChild) {
        if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
          try {
            identityCountryLabel.collapsed = identityLabel.collapsed = !pref("useIdentityBox");
          } catch (ex) {}
        partPointer = enhancedURLBar.firstChild.nextSibling;
      }
      enhancedURLBar.removeChild(e.target.parentNode);
      updateURL(true);
    });
    listen(window, createdStack.firstChild, "keypress", function(e) {
      switch (e.keyCode) {
        case e.DOM_VK_CANCEL:
        case e.DOM_VK_ESCAPE:
        case e.DOM_VK_TAB:
          e.target.blur();
          break;
        case e.DOM_VK_ENTER:
        case e.DOM_VK_RETURN:
          editing = false;
          let prevURL, curURLLen = 0;
          if (e.target.parentNode.previousSibling)
            prevURL = e.target.parentNode.previousSibling.getAttribute("url");
          else
            prevURL = "";
          if (!nextPart)
            curURLLen = e.target.parentNode.getAttribute("url").length;
          else
            curURLLen = prevURL.length;
          let nextURL= enhancedURLBar.lastChild.getAttribute("url");
          if (!e.target.value.match(/^[\/?#&]{1,2}/)
            && e.target.parentNode != enhancedURLBar.firstChild) {
              // If the user did not enter a value starting with /, ?/& or #
              let (curNode = e.target.parentNode) {
                if (curNode.previousSibling == enhancedURLBar.firstChild
                  && enhancedURLBar.firstChild.firstChild.getAttribute("value")
                  .toLowerCase() == "about" && e.target.value.indexOf(":") < 0)
                    prevURL += ":";
                else if ((curNode.hasAttribute("isSetting") && curNode.getAttribute("isSetting") == "false")
                  || (!curNode.hasAttribute("isSetting") && curNode.previousSibling.getAttribute("isSetting") == "false"))
                    prevURL += "/";
                else if (curNode.hasAttribute("isAnchorTag") && curNode.getAttribute("isAnchorTag") != "true") {
                  if (curNode.previousSibling.getAttribute("isSetting") == "true"
                    && curNode.previousSibling.getAttribute("isAnchorTag") != "true")
                      prevURL += "&";
                  else
                    prevURL += "?";
                }
                else if (!curNode.hasAttribute("isAnchorTag")) {
                  if (curNode.previousSibling.getAttribute("isAnchorTag") != "true")
                    prevURL += "&";
                  else
                    prevURL += "/";
                }
                else
                  prevURL += "#";
              }
          }
          prevURL += e.target.value + nextURL.slice(curURLLen);
          try {
            enhancedURLBar.removeChild(e.target.parentNode);
          } catch (ex) {}
          window.openUILinkIn(prevURL, "current");
          updateURL();
          break;
      }
    });
    if (editingPart == enhancedURLBar.lastChild && nextPart)
      enhancedURLBar.appendChild(createdStack);
    else if (nextPart)
      enhancedURLBar.insertBefore(createdStack, editingPart.nextSibling);
    else
      enhancedURLBar.replaceChild(createdStack, editingPart);
    updateLook();
    createdStack.firstChild.focus();
    createdStack = null;
  }

  function getAboutUrls() {
    let sub="@mozilla.org/network/protocol/about;1?what=", ans=[];
    for (let url in Cc)
      if (url.indexOf(sub) == 0) {
        let name = url.substr(sub.length);
        if (name.length > 0)
          ans.push([makeCapital(name),'about:'+ name]);
      }
    return ans.sort();
  }

  function getMenuItems(arrowedStack) {
    function createToolbarButton(tooltip, image, label) {
      let button = document.createElementNS(XUL, "menuitem");
      button.setAttribute("id", "UIEnhancer_" + label.replace(/[ ]/g, "_") + "_Button");
      button.setAttribute("flex", 0);
      button.setAttribute("align", "center");
      button.setAttribute("orient", "vertical");
      button.setAttribute("closemenu", "auto");
      button.setAttribute("tooltiptext", tooltip);
      button.style.margin = "1px 4px";
      button.style.padding = "1px";

      if (label)
        button.setAttribute("label", label);
      if (image) {
        button.setAttribute("class", "menuitem-iconic");
        button.setAttribute("image", image);
      }
      return button;
    }

    let menuGroup = document.createElementNS(XUL, "hbox");
    menuGroup.setAttribute("id", "UIEnhancer_Menu");
    menuGroup.setAttribute("flex", 0);
    menuGroup.style.margin = "1px 0px 1px 25px";
    menuGroup.style.padding = "2px";
    // Edit Part
    let editPartButton = createToolbarButton(l10n("edit.tooltip"), EDIT_IMAGE, l10n("edit.label"));
    editPartButton.onclick = function() {
      editPart(arrowedStack);
    };
    menuGroup.appendChild(editPartButton);
    // Add Part
    let addPartButton = createToolbarButton(l10n("add.tooltip"), ADD_IMAGE, l10n("add.label"));
    addPartButton.onclick = function() {
      editPart(arrowedStack, true);
    };
    menuGroup.appendChild(addPartButton);
    // Copy Part
    if (enhancedURLBar.lastChild != arrowedStack) {
      let copyPartButton = createToolbarButton(l10n("copy.tooltip"), COPY_IMAGE, l10n("copy.label"));
      copyPartButton.onclick = function() {
        try {
          mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
        } catch (ex) {}
        copyToClipboard(arrowedStack.getAttribute("url"));
        arrowMouseDown = siblingsShown = false;
        highlightPart(arrowedStack, false, false);
      };
      menuGroup.appendChild(copyPartButton);
    }
    // Copy All Part
    let copyAllPartButton = createToolbarButton(l10n("copyAll.tooltip"), COPY_ALL_IMAGE, l10n("copyAll.label"));
    copyAllPartButton.onclick = function() {
      try {
        mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
      } catch (ex) {}
      copyToClipboard(decodeURI(getURI().spec));
      arrowMouseDown = siblingsShown = false;
      highlightPart(arrowedStack, false, false);
    };
    menuGroup.appendChild(copyAllPartButton);
    // Delete Part
    if (arrowedStack != enhancedURLBar.firstChild) {
      let deletePartButton = createToolbarButton(l10n("delete.tooltip"), DELETE_IMAGE, l10n("delete.label"));
      deletePartButton.onclick = function() {
        try {
          mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
        } catch (ex) {}
        let prevURL;
        if (arrowedStack.previousSibling)
          prevURL = arrowedStack.previousSibling.getAttribute("url");
        else
          prevURL = "";
        prevURL += enhancedURLBar.lastChild.getAttribute("url")
          .slice(arrowedStack.getAttribute("url").length);
        window.openUILinkIn(prevURL, "current");
        prevURL = null;
        arrowMouseDown = siblingsShown = false;
        highlightPart(arrowedStack, false, false);
      };
      menuGroup.appendChild(deletePartButton);
    }
    return menuGroup;
  }

  // All Async functions should have arguments in []
  function handleArrowClick([arrowedStack, mouseDown, resultArray]) {
    if (arrowMouseDown && popupStack == arrowedStack && mouseDown) {
      clearPopup();
      arrowMouseDown = false;
      highlightPart(arrowedStack, false, false, '>');
      return;
    }
    else if (arrowMouseDown && popupStack == arrowedStack)
      return;
    clearPopup();
    arrowMouseDown = true;
    if (siblingsShown)
      highlightPart(arrowedStack, true, true, '>');
    else
      highlightPart(arrowedStack, "partial", true, 'v');
    if (arrowedStack.getAttribute("url") == "about") {
      let last = resultArray.pop();
      let total = getAboutUrls();
      let found = false;
      total.forEach(function([name,url]) {
        if (name == last[0])
          found = true;
      });
      if (!found)
        total.push(last);
      resultArray = total;
    }
    // Adding the base domain if domain in Identity Box
    if (arrowedStack.getAttribute("isDomain") == "true")
      resultArray.push([arrowedStack.firstChild.getAttribute("value"),
        arrowedStack.getAttribute("url"),""]);
    // Show the diff history results for that part
    for (let i = 0; i < resultArray.length; i++) {
      let arrowVal = resultArray[i][0];
      let url = resultArray[i][1];
      let part = document.createElementNS(XUL, "menuitem");
      part.setAttribute("id", "UIEnhancer_Popup_Link_" + i);
      part.setAttribute("class", "menuitem-iconic");
      // Applying Bold style to current url
      // Thus traversing to the last sibling of arrowedStack
      part.style.fontWeight = "normal";
      // If this part is auto generate, deemphasize it
      // to indicate that is has not been visited yet
      if (resultArray[i][2] && resultArray[i][2] == true) {
        part.style.color = "rgb(75,75,75)";
        part.setAttribute("tooltiptext", l10n("auto.tooltip"));
      }
      let isCurrent = false;
      let tempS = enhancedURLBar.lastChild;
      if (tempS && tempS.getAttribute("url").replace(/^(https?:\/\/)/,"")
        .replace(/[\/]$/, "") == url.replace(/[\/]$/, "")) {
          part.style.fontWeight = "bold";
          isCurrent = true;
      }
      part.setAttribute("label", arrowVal);
      listen(window, part, "click", function(e) {
        if (e.button == 2)
          return;
        try {
          mainPopup.hidePopup();
        } catch(ex) {}
        siblingsShown = arrowMouseDown = false;
        highlightPart(arrowedStack, false, false, '>');
        if (!isCurrent)
          handleTextClick(url, null, null, e.ctrlKey || (e.button == 1));
      }, false);
      mainPopup.appendChild(part);
    }
    if (arrowedStack.getAttribute("isDomain") == "true") {
      mainPopup.insertBefore(document.createElementNS(XUL, "menuseparator"),
        mainPopup.lastChild);
    }

    // Adding text when showing siblingsShown or children
    if (mainPopup.firstChild != null) {
      let part = document.createElementNS(XUL, "menuitem");
      part.setAttribute("id", "UIEnhancer_Popup_Info");
      part.setAttribute("class", "menuitem-iconic");
      if (siblingsShown)
        part.setAttribute("label", l10n("sibling.label"));
      else
        part.setAttribute("label", l10n("children.label"));
      part.setAttribute("disabled", true);
      mainPopup.insertBefore(part, mainPopup.firstChild);
      mainPopup.insertBefore(document.createElementNS(XUL, "menuseparator"),
        mainPopup.firstChild.nextSibling);
    }
    else {
      let part = document.createElementNS(XUL, "menuitem");
      part.setAttribute("id", "UIEnhancer_No_Suggestion");
      part.setAttribute("class", "menuitem-iconic");
      part.setAttribute("label", l10n("noSuggestion.label"));
      listen(window, part, "command", function() {
        try {
          mainPopup.hidePopup();
        } catch(ex) {}
        arrowMouseDown = false;
        highlightPart(arrowedStack, false, false, '>');
      }, false);
      mainPopup.appendChild(part);
    }

    // Insert the popupMenu before the first child of the mainPopup
    if (arrowMouseDown) {
      mainPopup.insertBefore(document.createElementNS(XUL, "menuseparator"),
        mainPopup.firstChild);
      mainPopup.insertBefore(getMenuItems(arrowedStack), mainPopup.firstChild);
    }

    // Show the popup below the arrows
    if (siblingsShown)
      mainPopup.openPopup(arrowedStack.previousSibling.lastChild, "after_start",
      -30 + arrowedStack.previousSibling.lastChild.boxObject.width, 0);
    else
      mainPopup.openPopup(arrowedStack.lastChild, "after_start", -15, 0);
    popupStack = arrowedStack;
    listen(window, mainPopup, "popuphidden", hideMainPopup = function() {
      mainPopup.removeEventListener("popuphidden", hideMainPopup, false);
      try {
        mainPopup.hidePopup();
      } catch(ex) {}
      arrowMouseDown = false;
      siblingsShown = false;
      highlightPart(arrowedStack, false, false, '>');
    });
  }

  // Global functions used in updateURL
  let urlValue, urlPostSetting;
  let urlArray_updateURL;
  let counter = 0;
  let initial = 0;
  let isSetting_updateURL = null;
  let iCountry, iLabel = "";
  let anchorTagIndex= null;
  let index = 0;
  let urlVal_updateURL;
  let URLDisplayed = "";
  unload(function() {
    initial = urlValue = urlArray_updateURL = counter = iLabel
      = anchorTagIndex = isSetting_updateURL = iCountry
      = urlPostSetting = index = urlVal_updateURL = URLDisplayed = null;
  }, window);

  // Function to change urlBar's UI
  function updateURL(forcedUpdate) {
    if (gURLBar.focused || editing || mouseScrolled
      || window.getComputedStyle(gURLBar).visibility == "collapse")
        return;
    try {
      if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
        origIdentity.collapsed = !pref("useIdentityBox");
    } catch (ex) {}
    if (locationBarEnterPressed) {
      urlValue = gURLBar.value;
      locationBarEnterPressed = false;
    }
    else {
      try {
        urlValue = decodeURI(getURI().spec);
      }
      catch (ex) {
        urlValue = getURI().spec;
      }
    }
    try {
      URLDisplayed = enhancedURLBar.lastChild.getAttribute("url");
    } catch (ex) {
      URLDisplayed = "";
    }
    if (URLDisplayed == urlValue && !showingHidden && !titleChanged && !mouseScrolled && !forcedUpdate) {
      try {
        if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) {
          identityLabel.value = makeCapital(iLabel.replace("www.", ""));
          identityCountryLabel.value = iCountry;
          if (!pref("useIdentityBox"))
            origIdentity.collapsed = identityLabel.collapsed = iLabel.length == 0;
          else
            origIdentity.collapsed = identityLabel.collapsed = false;
          identityCountryLabel.collapsed = iCountry.length == 0;
        }
      } catch (ex) {}
      updateLook();
      return;
    }
    if (window.InstantFox && window.InstantFox.removeShadowNodes)
      window.InstantFox.removeShadowNodes();
    counter = 0;
    initial = 0;
    hiddenStartingIndex = 0;
    urlPartArray = [];
    anchorTagIndex = settingsStartIndex = null;
    isSetting_updateURL = null;
    if (showingHidden)
      try {
        enhancedURLBar.firstChild.collapsed = false;
      } catch(ex) {};
    titleChanged = showingHidden = false;
    try {
      if (enhancedURLBar.nextSibling.hasAttribute("isHiddenArrow"))
        enhancedURLBar.parentNode.removeChild(enhancedURLBar.nextSibling);
    } catch (ex) {}
    // Splitting the url/gURLBar urlValue by "/" or "?" or "&" or "#"
    if (urlValue.search("about") == 0) {
      urlArray_updateURL = urlValue.split(":");
      urlPartArray[0] = urlValue.indexOf(":");
      urlPartArray[1] = urlValue.length;
    }
    else {
      urlPostSetting = "";
      urlPostSetting = urlValue.indexOf("?");
      if ((urlPostSetting < 0 || urlPostSetting > urlValue.indexOf("&"))
        && urlValue.indexOf("&") > 0)
          urlPostSetting = urlValue.indexOf("&");
      if (urlPostSetting > 0) {
        urlPostSetting = urlValue.slice(urlPostSetting + 1);
        urlValue = urlValue.slice(0, urlValue.length - urlPostSetting.length - 1);
      }
      else
        urlPostSetting = "";
      initial = urlValue.indexOf("://") > 0 ? urlValue.indexOf("://") + 3: 0;
      urlArray_updateURL = urlValue.split(/[\/#]/).filter(function(valueVal) {
        if (valueVal.match(/(https?:)/))
          return false;
        else if (valueVal == "") {
          counter++;
          return false;
        }
        let {length} = urlPartArray;
        if (length == 0)
          urlPartArray.push(initial + valueVal.length);
        else
          urlPartArray.push(counter + valueVal.length + urlPartArray[length - 1] + 1);
        counter = 0;
        if (anchorTagIndex == null && urlValue.slice(0, urlPartArray[length]).split(/[#]{1}/).length > 1) {
          anchorTagIndex = length;
          if (!settingsStartIndex)
            settingsStartIndex = length;
        }
        length = null;
        return true;
      });
      try {
        urlValue = decodeURI(getURI().spec);
      }
      catch (ex) {
        urlValue = getURI().spec;
      }
      if (settingsStartIndex == null)
        settingsStartIndex = (urlPostSetting.length > 0? urlPartArray.length: null);
      urlPostSetting.split(/[?&#]/).forEach(function(valueVal) {
        if (valueVal == "") {
          counter++;
          return;
        }
        let {length} = urlPartArray;
        if (urlValue.slice(0, counter + valueVal.length + urlPartArray[length - 1] + 1).match(/[#]{1}[^&?]+$/))
          valueVal.split("/").forEach(function (valueValPart) {
            if (valueValPart == "") {
              counter++;
              return;
            }
            let {length} = urlPartArray;
            urlPartArray.push(counter + valueValPart.length + urlPartArray[length - 1] + 1);
            urlArray_updateURL.push(valueValPart);
            counter = 0;
            if (settingsStartIndex == null && urlValue.slice(0, urlPartArray[length]).split(/[?#&]/).length > 1)
              settingsStartIndex = length;
            if (anchorTagIndex == null && urlValue.slice(0, urlPartArray[length]).split(/[#]{1}/).length > 1)
              anchorTagIndex = length;
          });
        else {
          urlPartArray.push(counter + valueVal.length + urlPartArray[length - 1] + 1);
          urlArray_updateURL.push(valueVal);
          counter = 0;
          if (settingsStartIndex == null && urlValue.slice(0, urlPartArray[length]).split(/[?#&]/).length > 1)
            settingsStartIndex = length;
          if (anchorTagIndex == null && urlValue.slice(0, urlPartArray[length]).split(/[#]{1}/).length > 1)
            anchorTagIndex = length;
        }
        length = null;
      });
    }
    urlPostSetting = null;

    for (index = 0; index < urlArray_updateURL.length; index++) {
      urlArray_updateURL[index] = unescape(urlArray_updateURL[index].replace(/[_+]/g, " "));
      if (urlArray_updateURL[index].split("-").length > 2 && urlArray_updateURL[index].indexOf("/") < 0)
        urlArray_updateURL[index] = urlArray_updateURL[index].replace(/[\-]/g, " ");
      urlArray_updateURL[index] = urlArray_updateURL[index].replace("=", " = ");
    }
    if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))) {
      iCountry = iLabel = "";
      if ((!origILabel || origILabel.value.search(" ") < 0 || pref("useIdentityEverytime")) && pref("useIdentityBox"))
        iLabel = urlArray_updateURL[0];
      else
        iLabel = origILabel? origILabel.value: "";
      iCountry = (pref("useIdentityBox") && pref("useIdentityEverytime"))?"":
        (origICountryLabel? origICountryLabel.value: "");

      //trimming the iLabel to 50 characters
      iLabel = trimWord(iLabel, 54);
      identityLabel.value = makeCapital(iLabel.replace("www.", ""));
      identityCountryLabel.value = iCountry;
      if (!pref("useIdentityBox"))
        origIdentity.collapsed = identityLabel.collapsed = (iLabel.length == 0);
      else
        origIdentity.collapsed = identityLabel.collapsed = false;
      identityCountryLabel.collapsed = (iCountry.length == 0);
    }
    // resetting the enhancedURLBar
    reset(0);
    redRemoved = 0;
    getMaxWidth();
    for (index = 0; index < urlArray_updateURL.length; index++) {
      urlVal_updateURL = urlArray_updateURL[index];
      isSetting_updateURL = false;
      [urlVal_updateURL, isSetting_updateURL] = replaceGibberishText(urlVal_updateURL, urlArray_updateURL, index);
      if ((index == 0 && fx15Plus) || (index == 0 && iLabel == urlVal_updateURL && urlArray_updateURL[1] != null))
        addPart(urlVal_updateURL, urlValue.slice(0, urlPartArray[index]), fx15Plus || (pref("useIdentityBox")
          && ($("identity-box").boxObject.width > 0)), isSetting_updateURL, index == urlArray_updateURL.length - 1);
      else
        addPart(urlVal_updateURL, urlValue.slice(0, urlPartArray[index]), false,
          isSetting_updateURL, index == urlArray_updateURL.length - 1);
    }
    if (fx15Plus && !(pref("useIdentityBox") && pref("useIdentityEverytime"))) {
      if (enhancedURLBar.firstChild && enhancedURLBar.firstChild.getAttribute("isDomain") == "true") {
        enhancedURLBar.setAttribute("domainVisible", true);}
      else
        try {
          enhancedURLBar.removeAttribute("domainVisible");
        } catch (e) {}
    }
    updateLook();
    // Removing last arrow if no suggestion possible
    if (enhancedURLBar.lastChild && enhancedURLBar.firstChild)
      spinQueryAsync(DBConnection, {
        names: ["url","title"],
        query: "SELECT * " +
               "FROM moz_places " +
               "WHERE url LIKE '%" + enhancedURLBar.lastChild.getAttribute("url")
               .replace(/^(https?:\/\/)?(www\.)?/,"") + "%' " +
               "ORDER BY frecency DESC " +
               "LIMIT 3",
      }, {
        callback: function([urlPart, resultArray]) {
          if (!enhancedURLBar.lastChild)
            return;
          if (!enhancedURLBar || enhancedURLBar.lastChild.getAttribute("url").slice(-1*urlPart.length)
            .replace(/^(https?:\/\/)?(www\.)?/, "") != urlPart
            .replace(/^(https?:\/\/)?(www\.)?/, ""))
              return;
          resultArray = resultArray.filter(function({url, title}) {
            if (url.replace(/^(https?:\/\/)?(www\.)?/, "")
              .slice(urlPart.replace(/^(https?:\/\/)?(www\.)?/, "").length).search(/[\/?&#]/) != 0)
                return false;
            else
              return true;
          });
          if (resultArray.length == 0) {
            enhancedURLBar.lastChild.setAttribute("lastArrowHidden", true);
            enhancedURLBar.lastChild.lastChild.removeAttribute("tooltiptext");
            if (!pref("useStyleSheet"))
              enhancedURLBar.lastChild.lastChild.style.display = "none";
            else
              highlightPart(enhancedURLBar.lastChild, false, false);
          }
          else {
            enhancedURLBar.lastChild.setAttribute("lastArrowHidden", false);
            if (!pref("useStyleSheet"))
              enhancedURLBar.lastChild.lastChild.style.display = "-moz-box";
            else
              highlightPart(enhancedURLBar.lastChild, false, false)
          }
          // Updating look again
          updateLook();
        },
        args : [urlValue.slice(0, urlPartArray[urlPartArray.length - 1])]
      });
  }

  function enhanceURLBar() {
    // Function to add listeners for urlbar enhancement
    function handleURLBarEvents() {
      // add the interaction events on the breadcrumbs
      addEventListenersOnEnhancedURLBar();
      // Watch for urlbar value change
      let changeListener = {
        onLocationChange: function(aProgress, aRequest, aURI) {
          newDocumentLoaded = true;
          refreshRelatedArray = true;
          if (!tabChanged && (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))))
            origIdentity.collapsed = identityLabel.collapsed
              = identityCountryLabel.collapsed = !pref("useIdentityBox");
          async(function() {
            if (!tabChanged)
              updateURL();
            else
              tabChanged = false;
          }, 10);
        }
      };
      gBrowser.addProgressListener(changeListener);
      unload(function() {
        gBrowser.removeProgressListener(changeListener);
      }, window);
      listen(window, gBrowser.tabContainer, "TabSelect", function() {
        if (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))
          origIdentity.collapsed = identityLabel.collapsed
            = identityCountryLabel.collapsed = !pref("useIdentityBox");
        tabChanged = true;
        try {
          if (showingHidden && enhancedURLBar.firstChild && (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime"))))
            enhancedURLBar.firstChild.collapsed = false;
        } catch (ex) {}
        showingHidden = false;
        try {
          if (enhancedURLBar.nextSibling.hasAttribute("isHiddenArrow"))
            enhancedURLBar.parentNode.removeChild(enhancedURLBar.nextSibling);
        } catch (ex) {}
        if (restyleEnhancedURLBarOnTabChange) {
          restyleEnhancedURLBarOnTabChange = false;
          setupEnhancedURLBarUI();
        }
        async(updateURL);
      });
      listen(window, gBrowser, "load", function(e) {
        try {
          if (!e.originalTarget.hasFocus())
            return;
        } catch (ex) {}
        async(function() {
          if (!tabChanged)
            updateURL();
          else
            tabChanged = false;
        }, 50);
      });
      listen(window, gURLBar, "focus", function() {
        if (editing)
          return;
        reset(1);
        gURLBar.selectTextRange(0, gURLBar.value.length);
      });
      listen(window, gURLBar, "blur", function(e) {
        reset(0);
        async(function() {
          if (window.InstantFox && window.InstantFox.removeShadowNodes)
            window.InstantFox.removeShadowNodes();
        },250);
        if (!tabChanged)
          async(updateURL, pref("animationSpeed") != "none"? 210: 10);
      });
      listen(window, gURLBar, "keydown", function(e) {
        switch (e.keyCode) {
          case e.DOM_VK_ENTER:
          case e.DOM_VK_RETURN:
            locationBarEnterPressed = true;
        }
      });
      listen(window, gURLBar, "mouseout", function() {
        if (ctrlMouseHover && !gURLBar.focused) {
          async(function() {
            if (!ctrlMouseHover)
              return;
            ctrlMouseHover = false;
            setOpacity(0);
            enhancedURLBar.style.display = "-moz-box";
          }, 100);
        }
      });
      listen(window, gBrowser, "DOMTitleChanged", function(e) {
        if (e.originalTarget != gBrowser.contentWindow.document)
          return;
        async(function() {
          if (!gURLBar.focused && newDocumentLoaded && (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")))) {
            origIdentity.collapsed = identityLabel.collapsed
              = identityCountryLabel.collapsed = !pref("useIdentityBox");
            titleChanged = true;
            updateURL();
            newDocumentLoaded = false;
          }
        }, 10);
      });
      let lastInnerWidth = 0;
      listen(window, window, "resize", function() {
        if (Math.abs(lastInnerWidth - window.innerWidth) > 5) {
          lastInnerWidth = window.innerWidth;
          async(function() {
            updateURL(true);
          });
        }
      }, false);
      // Mouse dragging event listeners
      let dragStarted = false;
      let firstHidden = false;
      listen(window, enhancedURLBar, "dragstart", function(event) {
        if (!pref("useDragDrop"))
          return;
        dragStarted = true;
        let url = enhancedURLBar.lastChild.getAttribute("url");
        let (dt = event.dataTransfer) {
          let title = enhancedURLBar.lastChild.firstChild.getAttribute("value");
          if (event.originalTarget.parentNode.parentNode == enhancedURLBar)
            title = event.originalTarget.getAttribute("value");
          dt.setData("text/x-moz-url", url+"\n" + title);
          dt.setData("text/uri-list", url);
          dt.setData("text/html", "<a href='" + url + "'>" + url + "</a>");
          dt.setData("text/plain", url);
          firstHidden = enhancedURLBar.firstChild.getAttribute("isDomain") == "true"
            && enhancedURLBar.firstChild.getAttribute("isHiddenArrow") == "false"
            && (!fx15Plus || (pref("useIdentityBox") && pref("useIdentityEverytime")));
          if (firstHidden)
            enhancedURLBar.firstChild.firstChild.style.display = "-moz-box";
          updateLook();
          dt.setDragImage(enhancedURLBar, event.clientX - enhancedURLBar.boxObject.x
            + (firstHidden?enhancedURLBar.firstChild.firstChild.boxObject.width: 0), 10);
        }
        async(dragUpdate, 25);
      });
      function dragUpdate() {
        if (!pref("useDragDrop"))
          return;
        if (firstHidden)
          enhancedURLBar.firstChild.firstChild.style.display = "none";
      }
      listen(window, enhancedURLBar, "dragenter", dragUpdate);
      listen(window, enhancedURLBar, "dragleave", dragUpdate);
      listen(window, enhancedURLBar, "dragend", function() {
        dragUpdate()
        updateLook();
        dragStarted = false;
      });
    }

    function createHelperKeys() {
      function $(id) window.document.getElementById(id);
      function removeKey() {
        let keyset = $(keysetID + "Helpers");
        keyset && keyset.parentNode.removeChild(keyset);
      }
      function getNext(delta) {
        if (enhancedURLBar.lastChild && enhancedURLBar.lastChild.previousSibling) {
          getAsyncRelatedArray(enhancedURLBar.lastChild.previousSibling,
            function([aDelta, returnedArray]) {
              if (returnedArray.length == 1)
                return;
              relatedScrolledArray = returnedArray;
              currentScrolledIndex = null;
              Array.some(relatedScrolledArray, function(relatedPart, index) {
                if (enhancedURLBar.lastChild.getAttribute("url").replace(/^(https?:\/\/)/,"")
                  .replace(/[\/]$/, "") == relatedPart[1].replace(/[\/]$/, "")) {
                    currentScrolledIndex = index;
                    return true;
                }
              });
              if (currentScrolledIndex == null || currentScrolledIndex < 0)
                return;
              currentScrolledIndex+=aDelta;
              try {
                let url = returnedArray[currentScrolledIndex][1];
                window.openUILinkIn(url, "current");
              } catch (ex) {}
            }, [delta]);
        }
      }
      removeKey();
      let UIEnhancerKeyset = window.document.createElementNS(XUL, "keyset");
      UIEnhancerKeyset.setAttribute("id", keysetID + "Helpers");
      // add shortcut key for going one level up
      let (upKey = window.document.createElementNS(XUL, "key")) {
        upKey.setAttribute("id", keyID + "LevelUP");
        upKey.setAttribute("keycode", pref("levelUpKey"));
        upKey.setAttribute("modifiers", pref("levelUpModifiers"));
        upKey.setAttribute("oncommand", "void(0);");
        listen(window, upKey, "command", function() {
          if (enhancedURLBar.lastChild && enhancedURLBar.lastChild.previousSibling) {
            let url = enhancedURLBar.lastChild.previousSibling.getAttribute("url");
            window.openUILinkIn(url, "current");
          }
        });
        $("mainKeyset").parentNode.appendChild(UIEnhancerKeyset).appendChild(upKey);
      }
      // add shortcut key for going to next sibling
      let (nextKey = window.document.createElementNS(XUL, "key")) {
        nextKey.setAttribute("id", keyID + "SiblingNext");
        nextKey.setAttribute("keycode", pref("levelNextKey"));
        nextKey.setAttribute("modifiers", pref("levelNextModifiers"));
        nextKey.setAttribute("oncommand", "void(0);");
        listen(window, nextKey, "command", function(){
          getNext(1);
        });
        $("mainKeyset").parentNode.appendChild(UIEnhancerKeyset).appendChild(nextKey);
      }
      // add shortcut key for going to previous sibling
      let (previousKey = window.document.createElementNS(XUL, "key")) {
        previousKey.setAttribute("id", keyID + "SiblingPrevious");
        previousKey.setAttribute("keycode", pref("levelPreviousKey"));
        previousKey.setAttribute("modifiers", pref("levelPreviousModifiers"));
        previousKey.setAttribute("oncommand", "void(0);");
        listen(window, previousKey, "command", function(){
          getNext(-1);
        });
        $("mainKeyset").parentNode.appendChild(UIEnhancerKeyset).appendChild(previousKey);
      }
      unload(removeKey, window);
    }

    handleURLBarEvents();
    createHelperKeys();
    updateURL();
    let runOnce = false;
    listen(window, window, "DOMContentLoaded", function() {
      if (runOnce)
        return;
      runOnce = true;
      updateURL();
    });
  }

  if (!pref("enhanceURLBar"))
    enhanceURLBar = function() {};
  else if (!pref("removeGibberish")) {
    replaceGibberishText = function(gibberVal, urlArray, index) {
      if (settingsStartIndex != null && index >= settingsStartIndex)
        return [gibberVal, (index >= anchorTagIndex && anchorTagIndex)? "anchor": true];
      return [gibberVal, false];
    };
  }
  /*
  * URLBar Look Enhancer Code Ends
  */

  /*
  * Bookmarks UI Enhancer Code Begins
  */
  // Global Variables to this part of Addon
  let urlBar;
  let bookmarksToolbar;
  let bookmarkStyle;
  let hovered = false;
  let onBookmarks = false;
  let newMargin;
  let origBTStyle;
  let origURLStyle;
  let limitX;
  let limitXBig;
  let temp;
  let afterURLBar = [];
  let origCollapsedState;
  let timeInterval = 0;
  let enoughSpace = true;
  let firstRun = false;
  let isAfterUrl = false;
  let spaceAfterBookmarks = 0;
  let bookmarksWidth = 0;
  let currentTabsOnTop = true;
  unload(function() {
    hovered = onBookmarks = newMargin = limitX = limitXBig = temp = bookmarksWidth
      = origURLStyle = origBTStyle = isAfterUrl = currentTabsOnTop = spaceAfterBookmarks
      = timeInterval = enoughSpace = firstRun = recheckOnTabChange = null;
  }, window);
  // Handle the rest of the user customized icons on the nav-bar
  function handleRest() {
    let d = $("urlbar-container").nextSibling;
    let someThingB4 = false;
    while (d != null) {
      if (((d.id == "reload-button" && d.nextSibling.id == "stop-button")
        || (d.id == "stop-button" && d.previousSibling.id == "reload-button"))
        && !someThingB4) {
          d = d.nextSibling;
          continue;
      }
      if (d.id == "search-container")
        d.style.minWidth = d.style.maxWidth = d.style.width = 250 + "px";
      someThingB4 = true;
      let b = d;
      d = d.nextSibling;
      afterURLBar.push(new handleDOM(b, bookmarksToolbar, false));
    }
    unload(function() {
      afterURLBar.reverse().forEach(function(d) {
        d.unloader();
      });
      afterURLBar = null;
    }, window);
  }

  function enableBookmarksToolbar() {
    try {
      $("toolbar-context-menu").openPopup();
      $("toolbar-context-menu").hidePopup();
      let (tabsOnTop = $("toolbar-context-menu").firstChild) {
        while (tabsOnTop != null) {
          if (tabsOnTop.getAttribute("label") == "Tabs on Top")
            break;
          else
            tabsOnTop = tabsOnTop.nextSibling;
        }
        if (tabsOnTop != null)
          currentTabsOnTop = tabsOnTop.getAttribute("checked");
      }
      $("toggle_PersonalToolbar").setAttribute("checked",true);
      $("toggle_PersonalToolbar").doCommand();
    } catch (ex) {}
  }

  function setupBookmarksUI() {
    let isMac = window.navigator.oscpu.toLowerCase().indexOf("mac") >= 0;
    urlBar = $("urlbar");
    origURLStyle = urlBar.style;
    bookmarksToolbar = $("PersonalToolbar");
    origBTStyle = bookmarksToolbar.style;
    // Setting paddings, widths and heights used for bookmarks toolbar
    let paddingBottom = 0;
    let pHeight = $("PersonalToolbar").boxObject.height;
    let nHeight = $("nav-bar").boxObject.height;
    if (pHeight == 0)
      pHeight = 26;
    if (nHeight == 0) {
      // Most probably we are on a In-content UI Page
      recheckOnTabChange = normalStartup = true;
      return;
    }
    // Dont do anything until page changed
    // if we are on about:addons page and changing values
    if (recheckOnTabChange)
      return;
    origCollapsedState = bookmarksToolbar.collapsed;
    enableBookmarksToolbar();

    $("TabsToolbar").style.background = "rgba(255,255,255,0)";
    try {
      if ($("bookmarks-menu-button").parentNode.id != "personal-bookmarks") {
        let bookmarkButton = new handleDOM($("bookmarks-menu-button"), $("personal-bookmarks"), false);
        if (bookmarkButton.hasClass("toolbarbutton-1")) {
          bookmarkButton.removeClass("toolbarbutton-1");
          bookmarkButton.addClass("bookmark-item");
        }
        unload(function() {
          bookmarkButton.unloader();
          if ($("bookmarks-menu-button").parentNode.id != "personal-bookmarks") {
            bookmarkButton.removeClass("bookmark-item");
            bookmarkButton.addClass("toolbarbutton-1");
          }
        }, window);
      }
    }
    // Exception occurs if there is no bookmarks menu button to begin with
    // ie, the user has removed it by customizing.
    catch (ex) {}

    if ($("personal-bookmarks").parentNode == $("nav-bar")) {
      let (urlContainer = $("urlbar-container")) {
        let temp = urlContainer;
        while (temp != null) {
          if (temp == $("personal-bookmarks")) {
            isAfterUrl = true;
            break;
          }
          temp = temp.nextSibling;
        }
      }
    }
    if ($("personal-bookmarks").parentNode != bookmarksToolbar &&
      ($("personal-bookmarks").parentNode != $("nav-bar") || isAfterUrl)) {
        let bookmarkItems = new handleDOM($("personal-bookmarks"), bookmarksToolbar, true);
        unload(function() {
          bookmarkItems.unloader();
        }, window);
    }

    // Checking if we even have space to bring bookmarks toolbar up
    if (window.innerWidth - urlBar.boxObject.x - 100*(isAfterUrl?1:0) < pref("urlBarWidth")*1)
      enoughSpace = false;

    if (enoughSpace) {
      if (pref("useSmallIcons"))
        handleRest();
      try {
        if ($("search-container").parentNode == bookmarksToolbar && pref("useSmallIcons"))
          $("search-container").style.minWidth = $("search-container").style.maxWidth
            = $("search-container").style.width = 250 + "px";
      } catch(ex) {}
    }
    // Calculating widths for various elements
    bookmarksWidth = 0;
    try {
      if ($("personal-bookmarks").nextSibling != null && pref("useSmallIcons"))
        bookmarksWidth += 20 + window.innerWidth - $("personal-bookmarks").nextSibling.boxObject.x;
      if ($("bookmarks-menu-button") != null)
        bookmarksWidth += $("bookmarks-menu-button").boxObject.width;
      spaceAfterBookmarks = bookmarksWidth;
      if (!pref("useSmallIcons")) {
        bookmarksWidth += 15;
        let d = $("urlbar-container").nextSibling;
        let someThingB4 = false;
        while (d != null) {
          if (((d.id == "reload-button" && d.nextSibling.id == "stop-button")
            || (d.id == "stop-button" && d.previousSibling.id == "reload-button"))
            && !someThingB4) {
              d = d.nextSibling;
              continue;
          }
          if (d.id == "search-container") {
            d.style.minWidth = d.style.maxWidth = d.style.width = 250 + "px";
            spaceAfterBookmarks += 260;
          }
          else
            spaceAfterBookmarks += (d.boxObject.width +
              1*window.getComputedStyle(d).marginLeft.replace("px", "") +
              1*window.getComputedStyle(d).marginRight.replace("px", ""));
          d = d.nextSibling;
        }
      }
      if ($("PlacesToolbarItems").lastChild != null) {
        bookmarksWidth += $("PlacesToolbarItems").lastChild.boxObject.x +
          $("PlacesToolbarItems").lastChild.boxObject.width;
        if ($("PlacesToolbarItems").firstChild != null)
          bookmarksWidth -= $("PlacesToolbarItems").firstChild.boxObject.x;
      }
      else
        bookmarksWidth += 200;
      if (firstRunAfterInstall) {
        firstRunAfterInstall = false;
        if (urlBar.boxObject.width - bookmarksWidth > pref("urlBarWidth")*1)
          Services.prefs.setCharPref("extensions.UIEnhancer.urlBarWidth", "" +
            10*Math.floor((urlBar.boxObject.width - bookmarksWidth)/10));
        else
          Services.prefs.setCharPref("extensions.UIEnhancer.urlBarWidth", "" +
            10*Math.floor(max(urlBar.boxObject.width - bookmarksWidth, 500 +
            (window.screen.width - 1200)/4)/10));
      }
      else if (normalStartup) {
        normalStartup = false;
        if (urlBar.boxObject.width - bookmarksWidth > pref("urlBarWidth")*1)
          Services.prefs.setCharPref("extensions.UIEnhancer.urlBarWidth", "" +
            10*Math.floor((urlBar.boxObject.width - bookmarksWidth)/10));
      }
    } catch (ex) {}
    urlBar.removeAttribute("max-width");
    urlBar.style.maxWidth = pref("urlBarWidth") + "px";
    if (!isMac) paddingBottom = (nHeight - (pHeight>=26?24:pHeight))/2;
    newMargin = "" + (-nHeight) + "px " + (pref("useSmallIcons")?0:
      $("bookmarks-menu-button") != null? spaceAfterBookmarks -
      $("bookmarks-menu-button").boxObject.width: spaceAfterBookmarks)
      + "px 0px " + (pref("urlBarWidth")*1 + max(gURLBar.boxObject.x*1, 70) + 10) +
      "px; min-height: " + (nHeight - 2*paddingBottom) + "px; padding: " +
      paddingBottom + "px 0px; max-height: " + nHeight + "px;";
    if (enoughSpace)
      bookmarksToolbar.setAttribute("style","background:rgba(255,255,255,0) !important;"
        + " margin: " + newMargin + " border: none !important;"
        + (pref("useSmallIcons")? "": " max-width: " + bookmarksWidth + "px !important;"));

    bookmarkStyle = bookmarksToolbar.style;
    limitXBig = limitX = max($("urlbar-display-box").nextSibling.boxObject.x - 40, pref("urlBarWidth")*1);
    // Setting the collapse state according to nav-bar's
    bookmarksToolbar.collapsed = $("nav-bar").collapsed;
    unload(function() {
      urlBar.setAttribute("style", origURLStyle);
      $("PersonalToolbar").setAttribute("style", origBTStyle);
      $("PersonalToolbar").collapsed = origCollapsedState;
    }, window);

    // Decide the animation transition interval timeInterval
    if (pref("animationSpeed") == "fast")
      timeInterval = 125;
    else if (pref("animationSpeed") == "none") {
      // User wants static thingy so
      animateHide = animateShow = onBookmarksMouseOut = function() {};
      onBookmarksMouseOver = onBlur = onFocus = onMouseMove = function() {};
      onMouseOut = onMouseOver = function() {};
      timeInterval = 0;
    }
    else
      timeInterval = 300;
    if (enoughSpace)
      firstRun = true;
  }

  function animateShow() {
    async(function() {
      if (recheckOnTabChange)
        return;
      if ((gURLBar.focused && !onBookmarks) || (hovered && !gURLBar.focused)) {
        urlBar.setAttribute("style","-moz-transition-property: max-width, -moz-box-shadow; "
          + "-moz-transition-duration: " + timeInterval + "ms;-moz-transition-delay: "
          + timeInterval > 0? 100: 0 + "ms; "
          + "-moz-box-shadow: 0px 0px 2px 2px highlight !important;");
        urlBar.style.maxWidth = 2000 + "px";
        if (enoughSpace) {
          bookmarksToolbar.setAttribute("style", "margin: " + newMargin
            + "; background: " + bookmarkStyle.background
            + "; border: " + bookmarkStyle.border
            + (pref("useSmallIcons")?"":"; max-width: " + bookmarksWidth + "px !important")
            + "; opacity:0;-moz-transition-property: opacity; "
            + "-moz-transition-duration: " + max(timeInterval - 100, 0)
            + "ms;-moz-transition-delay: 0ms;");
          if (pref("useSmallIcons"))
            afterURLBar.forEach(function(d) {
              d.transferTo($("nav-bar"));
            });
        }
        async(function() {
          if ($("urlbar-display-box").nextSibling.boxObject.x > limitXBig)
            limitXBig = $("urlbar-display-box").nextSibling.boxObject.x;
        }, timeInterval + 50);
      }
    },400);
  }

  function animateHide() {
    async(function() {
      if (!hovered && !recheckOnTabChange) {
        urlBar.setAttribute("style","max-width: " + min(pref("urlBarWidth")*1,
          window.innerWidth - urlBar.boxObject.x)
          + "px !important; -moz-transition-property: max-width; "
          + "-moz-transition-duration: " + max(timeInterval - 50, 0)
          + "ms;-moz-transition-delay: 0ms;");
        if (gURLBar.focused)
          urlBar.setAttribute("style",urlBar.getAttribute("style")
            + "-moz-box-shadow: 0px 0px 2px 2px highlight !important;");
        if (enoughSpace) {
          bookmarksToolbar.setAttribute("style", "margin: " + newMargin
            + "; background: " + bookmarkStyle.background
            + "; border: " + bookmarkStyle.border
            + (pref("useSmallIcons")?"":"; max-width: " + bookmarksWidth + "px !important")
            + "; opacity:1;-moz-transition-property: opacity; "
            + "-moz-transition-duration: " + max(timeInterval - 150, 0)
            + "ms;-moz-transition-delay: " + max(timeInterval - 75, 0) + "ms;");
          if (pref("useSmallIcons"))
            afterURLBar.forEach(function(d) {
              d.transferTo(bookmarksToolbar);
            });
        }
      }
    }, 200);
  }

  let lastResizeTime = 0, currentResizeTime = 0;
  function windowResized() {
    currentResizeTime = (new Date()).getTime();
    if (currentResizeTime - lastResizeTime > 200 && !firstRunAfterInstall)
      lastResizeTime = currentResizeTime;
    else
      return;
    if (pref("urlBarWidth")*1 + spaceAfterBookmarks > window.innerWidth -
      urlBar.boxObject.x - 100*(isAfterUrl?1:0) && enoughSpace) {
        enoughSpace = false;
        if (pref("useSmallIcons"))
          afterURLBar.forEach(function(d) {
            d.transferTo($("nav-bar"));
          });
        try {
          bookmarksToolbar.setAttribute("style", origBTStyle);
        } catch (ex) {}
    }
    else if (pref("urlBarWidth")*1 + spaceAfterBookmarks < window.innerWidth -
      urlBar.boxObject.x - 100*(isAfterUrl?1:0) && !enoughSpace) {
        enoughSpace = true;
        if (!firstRun) {
          bookmarksToolbar.setAttribute("style","background:rgba(255,255,255,0) !important;"
            + " margin: " + newMargin + "border : none !important;"
            + (pref("useSmallIcons")? "": " max-width: " + bookmarksWidth + "px !important;"));
          if (afterURLBar.length == 0 && pref("useSmallIcons"))
            handleRest();
          firstRun = true;
        }
        bookmarksToolbar.setAttribute("style","background:rgba(255,255,255,0) !important;"
          + " margin: " + newMargin + "border : none !important;"
          + (pref("useSmallIcons")? "": " max-width: " + bookmarksWidth + "px !important;"));
        if (pref("useSmallIcons"))
          afterURLBar.forEach(function(d) {
            d.transferTo(bookmarksToolbar);
          });
    }
  }

  unload(function() {
    animateShow = function() {};
    animateHide = function() {};
  }, window);

  function onBookmarksMouseOver(e) {
    onBookmarks = true;
    if (!gURLBar.focused || recheckOnTabChange)
      return;
    if (e.pageX >= limitXBig) {
      bookmarksToolbar.collapsed = true;
      let tempMove, tempOut;
      gURLBar.addEventListener("mousemove", tempMove = function(event) {
        if (event.pageX <= limitXBig) {
          gURLBar.removeEventListener("mousemove", tempMove, false);
          bookmarksToolbar.collapsed = false;
        }
      });
      gURLBar.addEventListener("mouseout", tempOut = function() {
        gURLBar.removeEventListener("mouseout", tempOut, false);
        gURLBar.removeEventListener("mousemove", tempMove, false);
        bookmarksToolbar.collapsed = false;
      });
      return;
    }
    animateHide();
  }

  function onBookmarksMouseOut() {
    onBookmarks = false;
    if (!gURLBar.focused || recheckOnTabChange)
      return;
    animateShow();
  }

  unload(function() {
    onBookmarksMouseOver = function() {};
    onBookmarksMouseOut = function() {};
  }, window);

  function onFocus() {
    if (recheckOnTabChange)
      return;
    animateShow();
    gURLBar.removeEventListener("focus", onFocus, false);
    gURLBar.addEventListener("blur", onBlur);
    async(function() {
      if (hovered && !gURLBar.focused && enoughSpace)
        bookmarksToolbar.collapsed = true;
    },500);
  }

  function onBlur() {
    if (recheckOnTabChange)
      return;
    animateHide();
    gURLBar.removeEventListener("blur", onBlur, false);
    gURLBar.addEventListener("focus", onFocus);
    if (bookmarksToolbar.collapsed)
      bookmarksToolbar.collapsed = false;
  }

  function onMouseMove(event) {
    if (recheckOnTabChange)
      return;
    if (event.pageX < limitX && hovered) {
      gURLBar.removeEventListener("mousemove", temp, false);
      animateShow();
    }
    else if (!hovered)
      gURLBar.removeEventListener("mousemove", temp, false);
  }

  function onMouseOver(e) {
    if (recheckOnTabChange)
      return;
    hovered = true;
    if (e.pageX >= limitX) {
      gURLBar.addEventListener("mousemove", temp = function(event) {onMouseMove(event)});
      return;
    }
    animateShow();
    async(function() {
      if (hovered && !gURLBar.focused && enoughSpace)
        bookmarksToolbar.collapsed = true;
    },500);
  }

  function onMouseOut() {
    hovered = false;
    if (!gURLBar.focused || recheckOnTabChange)
      animateHide();
    try {
      gURLBar.removeEventListener("mousemove", temp, false);
    } catch(ex) {}
    if (bookmarksToolbar.collapsed)
      bookmarksToolbar.collapsed = false;
  }

  unload(function() {
    onFocus = function() {};
    onBlur = function() {};
    onMouseOver = function() {};
    onMouseOut = function() {};
  }, window);

  function addBookmarkListeners() {
    listen(window, gURLBar, "blur", onBlur);
    listen(window, gURLBar, "focus", onFocus);
    listen(window, gURLBar, "mouseover", function(event) {onMouseOver(event)});
    listen(window, gURLBar, "mouseout", onMouseOut);
    listen(window, bookmarksToolbar, "mouseout", onBookmarksMouseOut);
    listen(window, bookmarksToolbar, "mouseover", function(event) {onBookmarksMouseOver(event)});
    listen(window, gBrowser.tabContainer, "TabSelect", function() {
      if (recheckOnTabChange) {
        recheckOnTabChange = false;
        async(setupBookmarksUI);
      }
      async(function() {
        bookmarksToolbar.collapsed = $("nav-bar").collapsed;
      });
    });
    // Event listener to detect window's dimension change
    listen(window, window, "resize", windowResized);
    // Mutation Observer to observe any dynamic addition to the nav-bar.
    if (window.MutationObserver || window.MozMutationObserver) {
      let observer = new (window.MutationObserver || window.MozMutationObserver)(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList') {
            async(setupBookmarksUI,10);
            return;
          }
        });
      });
      observer.observe($("nav-bar"), {childList: true});
      unload(function() {
        observer.disconnect();
        observer = null;
        addBookmarkListeners = function() {};
        try {
          gURLBar.removeEventListener("mousemove", temp, false);
        } catch(ex) {}
      }, window);
    }
    listen(window, $("toolbar-context-menu"), "click", function() {
      async(function() {
        bookmarksToolbar.collapsed = $("nav-bar").collapsed;
      });
      async(function() {
        let tabsOnTop = $("toolbar-context-menu").firstChild;
        while (tabsOnTop != null) {
          if (tabsOnTop.getAttribute("accesskey") == "T")
            break;
          else
            tabsOnTop = tabsOnTop.nextSibling;
        }
        if (tabsOnTop && tabsOnTop.getAttribute("checked") != currentTabsOnTop)
          reload();
      }, 50);
    });
  }
  /*
  * Bookmarks UI Enhancer Code Ends
  */
  /*
  * Code to put status bar in location bar starts here
  */
  let newStatus = null, newStatusCon = null;
  function setupStatusBar() {
    let statusBar = $("statusbar-display");
    let (origSetter = statusBar.__lookupSetter__("label")) {
      statusBar.__defineSetter__("label", function (x) {
        origSetter.apply(this, [x]);
        updateStatus(statusBar.getAttribute("label"), statusBar.getAttribute("inactive"));
      });
      unload(function() {
        statusBar.__defineSetter__("label", origSetter);
      }, window);
    }
    statusBar.collapsed = true;
    let isWindows = window.navigator.oscpu.toLowerCase().indexOf("window") >= 0;
    let isLinux = window.navigator.oscpu.toLowerCase().indexOf("linux") >= 0;
    let isMac = window.navigator.oscpu.toLowerCase().indexOf("mac") >= 0;
    let height = window.getComputedStyle(gURLBar).height.replace("px", '')*1
      + window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1
      + window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1;
    if (isLinux)
      height += 2;
    newStatusCon = window.document.createElementNS(XUL, "hbox");
    newStatusCon.setAttribute("id", "UIEnhancer_StatusBar");
    newStatusCon.setAttribute("pack", "end");
    newStatusCon.style.display = "-moz-box";
    let newStatusIcon = window.document.createElementNS(XUL, "label");
    if (isMac)
      newStatusIcon.setAttribute("style", "min-width:15px !important; max-width: 15px !important;"
        + "opacity: 0.4; display:-moz-box; background-image: url('"
        + STATUS + "'); background-size: 110% 100%; padding: 0px; margin:-3px 0px -2px 4px;");
    else
      newStatusIcon.setAttribute("style", "min-width:15px !important; max-width: 15px !important;"
        + "opacity: 0.4; display:-moz-box; background-image: url('"
        + STATUS + "'); background-size: 110% 100%; padding: 0px; margin: 0px;");
    newStatusIcon.setAttribute("flex", 0);
    newStatusCon.appendChild(newStatusIcon);
    newStatus = window.document.createElementNS(XUL, "label");
    newStatus.setAttribute("flex", 0);
    newStatus.setAttribute("crop", "center");
    if (isMac)
      newStatus.setAttribute("style", "min-width: 50px !important; background: -moz-linear-gradient"
        + "(left, rgba(240,240,240,0.4) 0%, rgba(250,250,250,0.25) 65%, rgba(255,255,255,0) 100%);"
        + "height: " + height + "px; text-align: right; display:-moz-box; color: #555; padding:3px 0px 1px 4px;");
    else
      newStatus.setAttribute("style", "min-width: 50px !important; background: -moz-linear-gradient"
        + "(left, rgba(240,240,240,0.4) 0%, rgba(250,250,250,0.25) 65%, rgba(255,255,255,0) 100%);"
        + "height: " + height + "px; text-align: right; display:-moz-box; color: #555; padding:2px 0px 2px 4px;");
    newStatusCon.appendChild(newStatus);
    newStatusCon.collapsed = true;
    if (isWindows) {
      newStatus.style.margin = "-" + window.getComputedStyle(gURLBar).paddingTop + " 0px -"
        + window.getComputedStyle(gURLBar).paddingBottom + " 0px";
      newStatus.style.padding = (window.getComputedStyle(gURLBar).paddingTop.replace("px", "")*1 + 3)
        + "px 0px 1px 0px";
    }
    else if (isLinux) {
      newStatus.style.margin = "-"
        + (window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1 + 1)
        + "px 0px -"
        + (window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1 + 1)
        + "px 0px";
    }
    else if (isMac) {
      newStatus.style.margin = "-"
        + (window.getComputedStyle(gURLBar).paddingTop.replace("px", '')*1 + 3)
        + "px 0px -"
        + (window.getComputedStyle(gURLBar).paddingBottom.replace("px", '')*1 + 2)
        + "px 0px";
    }
    origInput.parentNode.insertBefore(newStatusCon, origInput.nextSibling);
    function animateToggleEnhancedURLBar(hiding) {
      if (!pref("enhanceURLBar"))
        return;
      if (hiding) {
        enhancedURLBar.style.MozTransition = "opacity 200ms ease 0s";
        enhancedURLBar.style.opacity = 0.6;
      }
      else {
        enhancedURLBar.style.MozTransition = "";
        enhancedURLBar.style.opacity = 1;
      }
    }
    function updateStatus(value, inactive) {
      if (inactive) {
        animateToggleEnhancedURLBar();
        newStatusCon.collapsed = true;
        origInput.setAttribute("flex", 1);
      }
      else {
        getMaxWidth();
        animateToggleEnhancedURLBar(true);
        newStatus.setAttribute("flex", 0);
        if ((pref("useLeftoverSpace")? (MAXWIDTH + 225 - partsWidth):
          pref("statusWidth"))/value.length < 8)
            newStatus.setAttribute("flex", 1);
        newStatusCon.style.maxWidth = newStatus.style.maxWidth = (pref("useLeftoverSpace")? MAXWIDTH
          + 225 - partsWidth: pref("statusWidth"))+ "px";
        newStatus.value = value;
        origInput.setAttribute("flex", 0);
        newStatusCon.collapsed = false;
        async(function() {
          if (gURLBar.boxObject.x + newStatusCon.boxObject.width
            + enhancedURLBar.boxObject.width > Math.min(gURLBar.boxObject.x
            + gURLBar.boxObject.width, window.screen.width))
              newStatusCon.style.maxWidth = newStatus.style.maxWidth = (pref("useLeftoverSpace")? getMaxWidth()
                + 200 - partsWidth: pref("statusWidth"))+ "px";
        }, 20);
      }
    }
    unload(function() {
      statusBar.collapsed = false;
      newStatusCon.parentNode.removeChild(newStatusCon);
      newStatusIcon = newStatusCon = newStatus = null;
    }, window);
  }
  /*
  * Code to put status bar in location bar Ends
  */
  /*
  * Code to put progress meter in url bar starts here
  */
  let pageProgress = 0;
  function setupProgressMeter() {
    function $(id) document.getElementById(id);

    let progressListener = {
      onChangeTab: function(e) {
        $("urlbar").style.backgroundPosition = '0px 0px';
        $("urlbar").style.backgroundSize = '0% 100%';
        pageProgress = 0;
      },
      onProgressChange: function(aBrowser,webProgress,request,curSelfProgress,maxSelfProgress,curTotalProgress,maxTotalProgress) {
        if (gBrowser.contentDocument === aBrowser.contentDocument) {
          let val = (curTotalProgress-1)/(maxTotalProgress-1);
          pageProgress = val;
          let width = $("urlbar").boxObject.width;
          if (pref("showProgressAsArrow")) {
            $("urlbar").style.backgroundSize = '40px 100%';
            $("urlbar").style.backgroundPosition = (val==1? 0: width*val - 25) + 'px 0px';
            $("urlbar").style.backgroundImage = "url(" + PROGRESS + ")";
            $("urlbar").style.MozTransition = "background-position 250ms ease 0s";
          }
          else {
            $("urlbar").style.backgroundSize = (100*val) + '% 100%';
            if (val > .9)
              async(function() {
                if (pageProgress > 0.95)
                  $("urlbar").style.backgroundSize = "100% 100%";
              }, 500);
            $("urlbar").style.backgroundImage = "-moz-linear-gradient(left, rgba(255,255,255,0.1) 0%"
              + ", " + progressColorList[pref("progressBarColorIndex")] + " 100%)";
            $("urlbar").style.MozTransition = "background-size 250ms ease 0s";
          }
          $("urlbar").style.backgroundRepeat = "no-repeat";
        }
      },
      onStateChange: function() {
        if (pageProgress > 0.95)
          async(function() {
            $("urlbar").style.backgroundSize = "0% 100%";
            $("urlbar").style.backgroundPosition = '0px 0px';
            pageProgress = 0;
          }, 500);
        else {
          $("urlbar").style.backgroundSize = "0% 100%";
          $("urlbar").style.backgroundPosition = '0px 0px';
        }
      }
    };

    listen(window, gBrowser.tabContainer, 'TabSelect', progressListener.onChangeTab, false);
    gBrowser.addTabsProgressListener(progressListener);

    unload(function() {
      gBrowser.removeTabsProgressListener(progressListener);
      $("urlbar").style.backgroundSize = '';
      $("urlbar").style.backgroundPosition = '';
      $("urlbar").style.backgroundImage = "";
      $("urlbar").style.backgroundRepeat = "";
      $("urlbar").style.MozTransition = "";
    }, window);
  }
  /*
  * Code to put progress meter in urll bar ends here
  */
  // Function Callings
  if(pref("bringBookmarksUp")) {
    if (pref("useSmallIcons"))
      async(function() {
        setupBookmarksUI();
        addBookmarkListeners();
      }, 5);
    else
      async(function() {
        setupBookmarksUI();
        addBookmarkListeners();
      }, 200);
  }
  if (pref("enhanceURLBar"))
    enhanceURLBar();
  if (pref("showStatusInURLBar") && !S4E_statusInURLBar)
    setupStatusBar();
  if (pref("showProgressInURLBar"))
    setupProgressMeter();
}

function addToolbarButton(window) {
  function $(id) window.document.getElementById(id);

  function saveToolbarButtonInfo(event) {
    if ($(toolbarButtonID) && toolbarButton.parentNode) {
      pref("buttonParentID", toolbarButton.parentNode.getAttribute("id") || "");
      pref("buttonNextSiblingID", (toolbarButton.nextSibling || "")
        && toolbarButton.nextSibling.getAttribute("id").replace(/^wrapper-/i, ""));
    }
    else
      pref("buttonParentID", "");
  }

  // add toolbar button
  let toolbarButton = window.document.createElementNS(XUL, "toolbarbutton");
  toolbarButton.setAttribute("id", toolbarButtonID);
  toolbarButton.setAttribute("type", "button");
  toolbarButton.setAttribute("image", LOGO);
  toolbarButton.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
  toolbarButton.setAttribute("label", l10n("UIE.label"));
  toolbarButton.setAttribute("tooltiptext", l10n("UIE.tooltip"));
  toolbarButton.addEventListener("command", openOptions);
  $("navigator-toolbox").palette.appendChild(toolbarButton);
  let buttonParentID = pref("buttonParentID");
  if (buttonParentID.length > 0) {
    let parent = $(buttonParentID);
    if (parent) {
      let nextSiblingID = pref("buttonNextSiblingID");
      let nextSibling = $(nextSiblingID);
      if (!nextSibling) {
        let currentset = parent.getAttribute("currentset").split(",");
        let i = currentset.indexOf(toolbarButtonID) + 1;
        if (i > 0) {
          let len = currentset.length;
          for (; i < len; i++) {
            nextSibling = $(currentset[i]);
            if (nextSibling)
              break;
          }
        }
      }
      parent.insertItem(toolbarButtonID, nextSibling, null, false);
    }
  }

  let unloadButton = function() {
    window.removeEventListener("aftercustomization", saveToolbarButtonInfo);
    toolbarButton.removeEventListener("command", openOptions);
    toolbarButton.parentNode.removeChild(toolbarButton);
  };
  window.addEventListener("aftercustomization", saveToolbarButtonInfo, false);
  unload2(unloadButton);
}

function createHotKey(window) {
  function $(id) window.document.getElementById(id);
  function removeKey() {
    let keyset = $(keysetID);
    keyset && keyset.parentNode.removeChild(keyset);
  }

  removeKey();
  let UIEnhancerKeyset = window.document.createElementNS(XUL, "keyset");
  UIEnhancerKeyset.setAttribute("id", keysetID);
  // add hotkey
  let (optionsKey = window.document.createElementNS(XUL, "key")) {
    optionsKey.setAttribute("id", keyID);
    optionsKey.setAttribute("key", pref("shortcutKey"));
    optionsKey.setAttribute("modifiers", pref("shortcutModifiers"));
    optionsKey.setAttribute("oncommand", "void(0);");
    listen(window, optionsKey, "command", openOptions);
    $("mainKeyset").parentNode.appendChild(UIEnhancerKeyset).appendChild(optionsKey);
    if (pref("createAppMenuButton"))
      $(appMenuitemID).setAttribute("key", keyID);
    if (pref("createToolsMenuButton"))
      $(toolsMenuitemID).setAttribute("key", keyID);
    unload(removeKey, window);
  }
}

function disable(id) {
  AddonManager.getAddonByID(id, function(addon) {
    addon.userDisabled = true;
  });
}

function startup(data, reason) AddonManager.getAddonByID(data.id, function(addon) {
  gAddon = addon;
  Cu.import("resource://services-sync/util.js");
  if (reason == 5 || reason == 7)
    firstRunAfterInstall = true;
  else
    normalStartup = true;
  let conflictingAddons = ["Mozilla Labs: Prospector - OneLiner",
                           "Bookmarks Enhancer", "Status-4-Evar", "InstantFox"];
  let conflictingAddonsId = ["searchy@searchy", "personaltitlebar@moztw.org"];
  // Function to load stylesheets
  function loadStyles(style) {
    let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
      getService(Ci.nsIStyleSheetService);
    let fileURI = addon.getResourceURI("styles/" + style + ".css");
    sss.loadAndRegisterSheet(fileURI, sss.USER_SHEET);
    unload(function() sss.unregisterSheet(fileURI, sss.USER_SHEET));
  }

  // Load various javascript includes for helper functions
  ["helper", "pref"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });
  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.addBootstrappedManifestLocation(data.installPath);

  function init() {
    if (pref("enhanceURLBar")) {
      if (pref("useStyleSheet") && pref("userStylePath").length == 0) {
        usedStyleIndex = pref("usedStyleIndex");
        loadStyles(styleSheetList[Math.min(usedStyleIndex, styleSheetList.length - 1)]);
      }
      else if (pref("useStyleSheet")) {
        let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
          getService(Ci.nsIStyleSheetService);
        let fileURI = Services.io.newURI("file:///" + pref("userStylePath")
          .replace(/[\\]/g, "/"), null, null);
        if (!fileURI.spec.match(/(\.css)$/)) {
          usedStyleIndex = pref("usedStyleIndex");
          loadStyles(styleSheetList[Math.min(usedStyleIndex, styleSheetList.length - 1)]);
        }
        else {
          usedStyleIndex = -1;
          sss.loadAndRegisterSheet(fileURI, sss.USER_SHEET);
          // Fallback to default stylesheet when the file is not present
          if (!sss.sheetRegistered(fileURI, sss.USER_SHEET)) {
            usedStyleIndex = pref("usedStyleIndex");
            loadStyles(styleSheetList[Math.min(usedStyleIndex, styleSheetList.length - 1)]);
          }
          else
            unload(function() sss.unregisterSheet(fileURI, sss.USER_SHEET));
        }
      }
    }

    function isOptionsOpen() {
      let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
      let enumerator = wm.getEnumerator(null);
      while(enumerator.hasMoreElements()) {
        let win = enumerator.getNext();
        if (win.name == "Location Bar Enhancer Options") {
          return true;
        }
      }
      return false;
    }
    // adding the custom color to the progressColorList
    progressColorList[3] = pref("progressBarCustomColor");

    // check if S4E is there, if yes, update the variable
    try {
      AddonManager.getAddonByID("status4evar@caligonstudios.com",setupFixForS4E);
    } catch (ex) {}
    // Apply the changes in UI
    watchWindows(changeUI);
    // add a hotkey to open options
    watchWindows(createHotKey);

    // Watch for preference changes to reprocess the keyword data
    pref.observe([
      "useStyleSheet",
      "bringBookmarksUp",
      "animationSpeed",
      "enhanceURLBar",
      "removeGibberish",
      "useIdentityBox",
      "useIdentityEverytime",
      "userStylePath",
      "showStatusInURLBar",
      "showProgressAsArrow",
      "showProgressInURLBar",
      "usedStyleIndex"
    ], function() {
      if (!Services.prefs.getBranch("browser.").getBoolPref("preferences.instantApply")
        || !isOptionsOpen())
          reload();
    });
    pref.observe([
      "useSmallIcons"
    ], function() {
      if (!Services.prefs.getBranch("browser.").getBoolPref("preferences.instantApply")
        || !isOptionsOpen())
          specialReload();
    });
    pref.observe([
      "toggleToReload"
    ], reload);
    pref.observe([
      "urlBarWidth",
    ], reloadOnTabChange);
    pref.observe([
      "shortcutKey",
      "shortcutModifiers"
    ], function() {
      watchWindows(createHotKey);
    });
    pref.observe([
      "progressBarCustomColor"
    ], function() {
      progressColorList[3] = pref("progressBarCustomColor");
    });
    // Making makeCapital optional behind a pref
    let (orig = makeCapital) {
      makeCapital = function(word, len) {
        try {
          if (pref("makeCapital"))
            return orig(word, len);
          else
            return word;
        } catch (ex) {
          return word;
        }
      };
    }

    let conflictListener = {
      onPropertyChanged : checkConflict,
      onUninstalled : checkConflict,
      onInstalled : checkConflict,
      onDisabled : checkConflict,
      onEnabled : checkConflict
    };
    AddonManager.addAddonListener(conflictListener);

    unload(function() {
      AddonManager.removeAddonListener(conflictListener);
    });
    // Adding an unload funtion to close any opened options window
    unload(function() {
      let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
      let enumerator = wm.getEnumerator(null);
      while(enumerator.hasMoreElements()) {
        let win = enumerator.getNext();
        if (win.name == "Location Bar Enhancer Options") {
          win.close()
          break;
        }
      }
    });
  }

  reload = function() {
    unload();
    normalStartup = true;
    init();
  };

  function specialReload() {
    firstRunAfterInstall = true;
    reload();
  }

  function reloadOnTabChange() {
    recheckOnTabChange = true;
  }

  // Conflicting addon fixes start hereby
  function setupFixForS4E(addon) {
    function intPref(branch, prefName) {
      return Services.prefs.getBranch(branch + ".").getIntPref(prefName);
    }

    if (addon && addon.isActive &&
      (intPref("status4evar.status", "linkOver") == 2
      || intPref("status4evar", "status") == 2))
        S4E_statusInURLBar = true;
    if (S4E_statusInURLBar && pref("enhanceURLBar"))
      loadStyles("fixForS4E");
  }

  // Adding listener to reload add-on whena conflicting add-on gets installed or enabled/disabled
  function checkConflict(addon) {
    if (addon.id == "BookmarksEnhancer@girishsharma.com")
      setPref("bringBookmarksUp", false);
    if (conflictingAddons.indexOf(addon.name) >= 0
      || conflictingAddonsId.indexOf(addon.id) >= 0) {
        Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer)
          .initWithCallback({notify:function(){reload()},}, addon.id == "searchy@searchy"? 500:0, Ci.nsITimer.TYPE_ONE_SHOT);
    }
  }
  // calling the function to setup everything
  init();

  if ((reason == 7 || reason == 5) && data.version == "4.9")
    openSite = true;
  watchWindows(function(window) {
    if (openSite) {
      window.openUILinkIn("http://grssam.com/?p=259", "tab");
      openSite = false;
    }
  });
  // add a toolbar button to open options
  watchWindows2(addToolbarButton);
});

function shutdown(data, reason) {
  if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)
    Components.manager.removeBootstrappedManifestLocation(data.installPath);
  if (reason != APP_SHUTDOWN) {
    unload();
    unload2();
  }
}

function install(data, reason) AddonManager.getAddonByID(data.id, function(addon) {
  if (reason == 5 || reason == 7)
    firstRunAfterInstall = true;
  else
    normalStartup = true;
});

function uninstall() {}
