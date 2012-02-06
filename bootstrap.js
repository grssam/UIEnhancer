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

function changeUI(window) {

  let {gURLBar, gBrowser, document} = window;
  function $(id) document.getElementById(id);
  let async = makeWindowHelpers(window).async;

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
      gBrowser.removeEventListener("click", hideMainPopup, false);
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
  let maxWidth = 0;
  let enhancedURLBar;
  let setupEnhancedURLBarUI = function() {};
  let setOpacity = function() {};

  let {DBConnection} = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  unload(function() {
    popupStack = settingsStartIndex = relatedScrolledArray
      = lastScrolledTime = lastUsefulPart = ctrlMouseHover = mouseScrolled
      = scrolledStack = indexB4Scrolling = currentScrolledIndex = redRemoved
      = lastScrolledUrl = restyleEnhancedURLBarOnTabChange = siblingsShown
      = urlBarHeight = maxWidth = DBConnection = null;
  }, window);

  if (pref("enhanceURLBar")) {
    // Get references to existing UI elements
    origIdentity = $("identity-icon-labels");
    origILabel = $("identity-icon-label");
    origICountryLabel = $("identity-icon-country-label");
    origIdentity.collapsed = false;
    origInput = gURLBar.mInputField;

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
    identityCountryLabel.style.margin = "0px 0px 0px 4px";

    origIdentity.insertBefore(identityCountryLabel, origICountryLabel.nextSibling);
    origIdentity.insertBefore(identityLabel, origICountryLabel.nextSibling);
    origILabel.collapsed = true;
    origICountryLabel.collapsed = true;

    setOpacity = function(opacity) {
      origInput.style.opacity = opacity;
      let d = origInput.firstChild;
      while (d != null) {
        d.style.opacity = opacity;
        d = d.nextSibling;
      }
      let d = origInput.nextSibling;
      while (d != null) {
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
      origIdentity.removeChild($("identity-icon-country-label").nextSibling);
      origIdentity.removeChild($("identity-icon-country-label").nextSibling);
      identityLabel = identityCountryLabel = origICountryLabel = origILabel = origIdentity = null;
    }, window);

    // Add stuff around the original urlbar input box
    enhancedURLBar = document.createElementNS(XUL, "stack");
    origInput.parentNode.insertBefore(enhancedURLBar, origInput);
    setupEnhancedURLBarUI = function() {
      let origParentStyle = gURLBar.parentNode.style;
      enhancedURLBar.setAttribute("id", "UIEnhancer_URLBar");
      enhancedURLBar.setAttribute("flex", 0);
      enhancedURLBar.setAttribute("style", "width:" + getMaxWidth() + "px;");
      enhancedURLBar.style.overflow = "hidden";
      enhancedURLBar.style.display = "-moz-box";
      enhancedURLBar.style.padding = "0px";
      urlBarHeight = gURLBar.boxObject.height;
      if (window.navigator.oscpu.toLowerCase().indexOf("window") >= 0)
        urlBarHeight -= 2;
      else if (window.navigator.oscpu.toLowerCase().indexOf("linux") >= 0)
        urlBarHeight -= 4;
      enhancedURLBar.style.maxHeight = urlBarHeight + "px";
      if (window.navigator.oscpu.toLowerCase().indexOf("window") >= 0)
        enhancedURLBar.style.margin = "-" + window.getComputedStyle(gURLBar).paddingTop
          + " 0px -" + window.getComputedStyle(gURLBar).paddingBottom + " -"
          + window.getComputedStyle(origIdentity).marginRight;
      else if (window.navigator.oscpu.toLowerCase().indexOf("linux") >= 0) {
        enhancedURLBar.style.margin = "-1px 0px";
        gURLBar.parentNode.style.marginTop = "3px";
        gURLBar.parentNode.style.marginBottom = "3px";
        unload(function() {
          gURLBar.parentNode.style.marginTop = origParentStyle.marginTop;
          gURLBar.parentNode.style.marginBottom = origParentStyle.marginBottom;
        }, window);
      }
    }

    if (window.getComputedStyle(gURLBar).visibility != "collapse")
      setupEnhancedURLBarUI();
    else
      restyleEnhancedURLBarOnTabChange = true;

    unload(function() {
      gURLBar.mInputField.parentNode.removeChild(gURLBar.mInputField.previousSibling);
      urlBarHeight = enhancedURLBar = origInput = null;
    }, window);
    setOpacity(0);
  }

  function getMaxWidth() {
    let whiteListAddons = ["mafArchiveInfoUrlbarBox"];
    let (udb = $("urlbar-display-box")) {
      while (whiteListAddons.indexOf(udb.nextSibling.id) >= 0)
        udb = udb.nextSibling;
      if (udb == null)
        return pref("urlBarWidth")*1 - origIdentity.boxObject.width - 250;
      maxWidth = Math.max(udb.nextSibling.boxObject.x, 0.4*gURLBar.boxObject.width)
        - origIdentity.boxObject.x - origIdentity.boxObject.width - 60;
      if (pref("bringBookmarksUp") && maxWidth > pref("urlBarWidth")*1 - 100)
        maxWidth = pref("urlBarWidth")*1 - origIdentity.boxObject.width - 160
          - udb.parentNode.lastChild.boxObject.x + udb.nextSibling.boxObject.x
          - udb.parentNode.lastChild.boxObject.width;
    }
    return maxWidth;
  }

  // Function to use gibberish and remove redundant text
  function replaceGibberishText(gibberVal, urlArray, index) {
    let isSetting = false;
    if (settingsStartIndex != null && index >= settingsStartIndex)
      isSetting = (index >= anchorTagIndex && anchorTagIndex)? "anchor": true;
    if (index > 0) {
      let gibberResult = gibberish(gibberVal.replace("www.", "").replace(/\.[a-zA-Z]{2,4}$/, ""));
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
      gBrowser.removeEventListener("click", hideMainPopup, false);
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
      enhancedURLBar.parentNode.insertBefore(tStack, enhancedURLBar.nextSibling);
    }
    else if (partsWidth < getMaxWidth() && enhancedURLBar.nextSibling.hasAttribute("isHiddenArrow")) {
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

    if (partsWidth > getMaxWidth() || showingHidden)
      enhancedURLBar.style.width = maxWidth + "px";
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
  function handleScroll([event]) {
    // Basically, delta is now positive if wheel was scrolled up,
    // and negative, if wheel was scrolled down.
    let delta = 0;
    if (event.detail)
      delta = -event.detail;
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
      updateURL();
      partPointer = scrolledStack.nextSibling;
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

  function highlightPart(highlightedObj, text, arrow, arrowVal) {
    if (highlightedObj == null)
      return;
    if (arrowVal == '>' && !arrowMouseDown)
      highlightedObj.lastChild.value = arrowVal;
    else if (arrowVal != null && arrowVal != '>')
      highlightedObj.lastChild.value = arrowVal;
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
    if ((arrowMouseDown || textMouseDown) && forcedFlushing != true) {
      highlightedObj.firstChild.style.backgroundImage = highlightedObj.lastChild.style.backgroundImage =
        "-moz-linear-gradient(top, rgba(228,245,252,0.35) " +
        "0%, rgba(191,232,249,0.5) 50%, rgba(159,216,239,0.5) 51%, rgba(42,176,237,0.75) 100%)";
      highlightedObj.firstChild.style.border = 
        highlightedObj.lastChild.style.border = "1px solid rgba(100,110,150,0.75)";
      highlightedObj.lastChild.style.boxShadow = highlightedObj.firstChild.style.boxShadow =
        "inset 1px 2px 1px rgba(120,130,160,0.8)";
      highlightedObj.firstChild.style.padding = "3px 0px 0px 2px";
      if (siblingsShown)
        highlightedObj.lastChild.style.padding = "2px 1px 1px 2px";
      else
        highlightedObj.lastChild.style.padding = "2px 3px 1px 2px";
    }
    else {
      highlightedObj.lastChild.style.boxShadow = highlightedObj.firstChild.style.boxShadow = "";
      highlightedObj.firstChild.style.padding = "2px 1px 1px 1px";
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
      urlBarHeight = gURLBar.boxObject.height - 2;

    let createdStack = document.createElementNS(XUL, "stack");
    createdStack.setAttribute("id", "UIEnhancer_URLBar_Stack");
    createdStack.style.maxHeight = urlBarHeight + "px";
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
    if (partType == "domain")
      createdStack.setAttribute("isDomain", true);
    else
      createdStack.setAttribute("isDomain", false);

    // Adding the Text Stack
    let tempS = document.createElementNS(XUL, "label");
    tempS.setAttribute("value", trimWord(createVal));
    tempS.setAttribute("id", "UIEnhancer_URLBar_Stack_Text");
    tempS.style.minHeight = (urlBarHeight - (pref("useStyleSheet")? 0: 4)) + "px";
    // Adding tooltip texts
    tempS.setAttribute("tooltiptext", "Right Click to access Sub Menu"
      + (!enhancedURLBar.firstChild? ".": " or to see sibling Addresses."
      + "\nScroll to instantly preview the sibling address"));
    if (partType == "domain" || hiddenArrow)
      tempS.style.display = "none";
    else
      tempS.style.display = "-moz-box";
    tempS.setAttribute("flex", 0);

    // Adding the Arrow Stack
    let tempArrow = document.createElementNS(XUL, "label");
    tempArrow.setAttribute("id", "UIEnhancer_URLBar_Stack_Arrow");
    tempArrow.style.minHeight = (urlBarHeight - (pref("useStyleSheet")? 0: 4)) + "px";
    tempArrow.style.display = "-moz-box";
    tempArrow.setAttribute("flex", 0);
    if (!hiddenArrow)
      tempArrow.setAttribute("tooltiptext", "Click to access Sub Menu");
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
      tempS.style.padding = "2px 1px 1px 1px";
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
      else
        tempArrow.style.padding = "2px 2px 1px 2px";
      tempArrow.style.backgroundImage = "rgba(255,255,255,0)";
      tempArrow.style.border = "1px solid rgba(255,255,255,0)";
      if (hiddenArrow == true)
        tempArrow.setAttribute("value", "�");
      else if (hiddenArrow)
        tempArrow.setAttribute("value", "�");
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

    // Handling the click on the parts
    listen(window, createdStack.firstChild, "click", function(e) {
      if (e.button == 2) {
        e.preventDefault();
        return;
      }
      if (e.target.parentNode.getAttribute("isHiddenArrow") != "false")
        return;
      if (arrowMouseDown ) {
          clearPopup();
          siblingsShown = arrowMouseDown = false;
          highlightPart(e.target.parentNode, false, false, '>');
          return;
      }
      if (e.button == 0 && !e.ctrlKey)
        handleTextClick("", e.target.parentNode, false);
      else if (e.button == 1 || e.ctrlKey)
        handleTextClick("", e.target.parentNode, false, true);
    });
    listen(window, createdStack, "DOMMouseScroll", function(event) {
      if (event.target.parentNode.getAttribute("isHiddenArrow") != "false")
        return;
      if (arrowMouseDown || siblingsShown)
        return;
      let tempHandledStack;
      let currentTime = new Date();
      if (currentTime.getTime() - lastScrolledTime < 75)
        return;
      else
        lastScrolledTime = currentTime.getTime();
      currentTime = null;
      tempHandledStack = event.originalTarget;
      if (scrolledStack != tempHandledStack) {
        while (tempHandledStack.parentNode != null && tempHandledStack.parentNode != enhancedURLBar) {
          tempHandledStack = tempHandledStack.parentNode;
        }
        scrolledStack = tempHandledStack;
      }
      if (scrolledStack.previousSibling != null && 
        (scrolledStack.previousSibling.getAttribute("url") != lastScrolledUrl || refreshRelatedArray)) {
        refreshRelatedArray = false;
        lastScrolledUrl = scrolledStack.previousSibling.getAttribute("url");
        tempHandledStack = null;
        if (scrolledStack.previousSibling == null)
          return;
        // Making getAsyncRelatedArray to call a pseudo function first which sets
        // currentScrolledIndex and indexB4Scrolling and then calls handleScroll
        getAsyncRelatedArray(scrolledStack.previousSibling, function([event, returnedArray]) {
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
          handleScroll([event]);
        }, [event]);
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
        handleScroll([event]);
      }
    });

    // Mouseover Handling Function
    listen(window, createdStack.firstChild, "mouseover", function(e) {
      if (e.target.parentNode.getAttribute("isHiddenArrow") != "false"
        || (e.target.parentNode.getAttribute("lastArrowHidden") == "true"
        && arrowMouseDown) || siblingsShown || mouseScrolled)
          return;
      if (e.ctrlKey) {
        hideEnhancedURLBar();
        return;
      }
      if (arrowMouseDown) {
        if (!pref("useStyleSheet"))
          e.target.parentNode.lastChild.value = "v";
        getAsyncRelatedArray(e.target.parentNode, handleArrowClick,
          [e.target.parentNode, false]);
      }
      else
        highlightPart(e.target.parentNode, true, true);
    });
    listen(window, createdStack.lastChild, "mouseover", function(e) {
      if (e.ctrlKey) {
        hideEnhancedURLBar();
        return;
      }
      if (mouseScrolled)
        return;
      if (e.target.parentNode.getAttribute("lastArrowHidden") == "true" || siblingsShown)
        return;
      if (arrowMouseDown && e.target.parentNode.getAttribute("isHiddenArrow") == "false") {
        if (!pref("useStyleSheet"))
          e.target.parentNode.lastChild.value = "v";
        getAsyncRelatedArray(e.target.parentNode, handleArrowClick,
          [e.target.parentNode, false]);
      }
      else if (!arrowMouseDown)
        highlightPart(e.target.parentNode, "partial", true);
      if (e.target.parentNode.getAttribute("isHiddenArrow") != "false" && !pref("useStyleSheet"))
        e.target.parentNode.lastChild.style.padding = "2px 2px 1px 2px";
    });
    // Mousedown Handling Function
    listen(window, createdStack.firstChild, "mousedown", function(e) {
      if (e.button == 2)
        e.preventDefault();
      if (e.target.parentNode.getAttribute("isHiddenArrow") != "false")
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
        handleTextClick("", e.target.parentNode, true);
      }
      else if (e.button == 2 && e.target.parentNode.previousSibling != null && !arrowMouseDown) {
        siblingsShown = true;
        getAsyncRelatedArray(e.target.parentNode.previousSibling, handleArrowClick,
          [e.target.parentNode, true]);
      }
      else if (e.button == 2) {
        clearPopup();
        siblingsShown = true;
        arrowMouseDown = true;
        popupStack = e.target.parentNode;
        highlightPart(popupStack, true, true);
        mainPopup.appendChild(getMenuItems(popupStack));

        // Show the popup below the arrows
        mainPopup.openPopup(popupStack, "after_start", -30, 0);
        gBrowser.addEventListener("click", hideMainPopup = function() {
          gBrowser.removeEventListener("click", hideMainPopup, false);
          try {
            mainPopup.hidePopup();
          } catch(ex) {}
          arrowMouseDown = false;
          siblingsShown = false;
          highlightPart(popupStack, false, false, '>');
        });
      }
      else if (e.button == 1 || e.ctrlKey)
        handleTextClick("", e.target.parentNode, true, true);
    });
    listen(window, createdStack.lastChild, "mousedown", function(e) {
      if (e.button == 2)
        e.preventDefault();
      if (e.target.parentNode.getAttribute("lastArrowHidden") == "true")
        return;
      if (arrowMouseDown || siblingsShown) {
        clearPopup();
        siblingsShown = arrowMouseDown = false;
        return;
      }
      if (e.button == 0) {
        if (e.target.parentNode.getAttribute("isHiddenArrow") == "false")
          getAsyncRelatedArray(e.target.parentNode, handleArrowClick,
            [e.target.parentNode, true]);
        else
          showHidden(e.target.parentNode, true,
            e.target.parentNode.getAttribute("isHiddenArrow") == "true"? -1:1);
      }
    });

    // Mouseup Handling Function
    listen(window, createdStack.firstChild, "mouseup", function(e) {
      if (e.button == 2)
        e.preventDefault();
      if (e.target.parentNode.getAttribute("isHiddenArrow") != "false")
        return;
      textMouseDown = false;
      if (!arrowMouseDown)
        highlightPart(e.target.parentNode, false, false, '>');
    });
    listen(window, createdStack.lastChild, "mouseup", function(e) {
      if (e.button == 2)
        e.preventDefault();
      if (e.target.parentNode.getAttribute("isHiddenArrow") == "false")
        return;
      arrowMouseDown = false;
      highlightPart(e.target.parentNode, false, false);
    });
    // Mouseout Handling Function
    listen(window, createdStack, "mouseout", function(e) {
      let target = e.target;
      if (target.parentNode != enhancedURLBar)
        target = target.parentNode;
      if (target.getAttribute("isHiddenArrow") != "false" && !arrowMouseDown) {
        highlightPart(target, false, false);
        if (!pref("useStyleSheet"))
          target.lastChild.style.padding = "2px 2px 1px 2px";
        return;
      }
      else if (arrowMouseDown)
        return;
      if ((arrowMouseDown && target.getAttribute("lastArrowHidden") == "true") || siblingsShown)
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
          mouseScrolled = true;
          updateURL();
        }, 250);
        return;
      }
      highlightPart(target, false, false, '>');
    });

    unload(function() {
      if (createdStack) {
        createdStack.removeChild(tempArrow);
        createdStack.removeChild(tempS);
        createdStack = temp = tempS = null;
      }
    }, window);
    return createdStack;
  }

  // Function to add parts to the enhancedURLBar
  function addPart(partVal, partURL, domain, isSetting, lastPart) {
    if (pref("makeCapital"))
      partVal = makeCapital(partVal);
    // Deciding if the part is domain or setting
    let partType;
    if (domain)
      partType = "domain";
    else if (isSetting == "anchor")
      partType = "anchor";
    else if (isSetting == true)
      partType = "setting";
    else
      partType = "null";
    if (partType != "domain" && partType != "setting"
      && partType != "anchor" && partVal.length > 20)
        lastUsefulPart = partVal;
    if (partPointer != null) {
      if (domain == false) {
        partPointer.firstChild.style.display = "-moz-box";
        partPointer.setAttribute("isDomain", false);
      }
      else if (domain == true) {
        partPointer.firstChild.style.display = "none";
        partPointer.setAttribute("isDomain", true);
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
      partPointer.firstChild.setAttribute("tooltiptext", "Right Click to access Sub Menu"
        + (partPointer == enhancedURLBar.firstChild? ".": " or to see sibling Addresses."
        + "\nScroll to instantly preview the sibling address"));
      partPointer.lastChild.setAttribute("tooltiptext", "Click to access Sub Menu");
      if (!lastPart) {
        partPointer.lastChild.style.display = "-moz-box";
        partPointer.setAttribute("lastArrowHidden", false);
      }
      if (!pref("useStyleSheet")) {
        partPointer.lastChild.setAttribute("value",">");
        partPointer.lastChild.style.padding = "2px 1px 1px 2px";
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
    if (partsWidth > getMaxWidth() && !mouseScrolled && !showingHidden) {
      let isDomainHidden = enhancedURLBar.firstChild.getAttribute("isDomain") == "true";
      while (partsWidth > getMaxWidth() -
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
      if (lastPart && hiddenStartingIndex == 1 && enhancedURLBar.firstChild
        && urlArray_updateURL[0].replace("www.", "") == identityLabel.value.toLowerCase()) {
          if (enhancedURLBar.firstChild.getAttribute("isHiddenArrow") == "true") {
            enhancedURLBar.firstChild.firstChild.style.display = "none";
            enhancedURLBar.firstChild.setAttribute("isDomain", true);
            enhancedURLBar.firstChild.setAttribute("isSetting", false);
            enhancedURLBar.firstChild.setAttribute("isAnchorTag", false);
            enhancedURLBar.firstChild.firstChild.setAttribute("value", trimWord(urlArray_updateURL[0]));
            enhancedURLBar.firstChild.firstChild.setAttribute("tooltiptext", "Right Click to access Sub Menu");
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
      else if (lastPart && hiddenStartingIndex == 1 && !enhancedURLBar.firstChild
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
      else if (lastPart && hiddenStartingIndex > 0 && enhancedURLBar.firstChild == null) {
        tStack = createStack(partVal, urlValue.slice
          (0, urlPartArray[hiddenStartingIndex - 1]), "null", true);
        partsWidth += tStack.boxObject.width;
        enhancedURLBar.appendChild(tStack);
        tStack = null;
      }
    }
    // else if statement to handle the condition when we scroll on a part
    // and the total url overflows
    else if (partsWidth > getMaxWidth() && mouseScrolled && !showingHidden) {
      let pixelPerWord = scrolledStack.firstChild.boxObject.width/
        scrolledStack.firstChild.getAttribute("value").length;
      if (scrolledStack == enhancedURLBar.lastChild)
        scrolledStack.firstChild.setAttribute("value",
          trimWord(scrolledStack.firstChild.getAttribute("value"),
          (getMaxWidth() - partsWidth + scrolledStack.firstChild.boxObject.width)
          /pixelPerWord));
      else {
        tempPart = enhancedURLBar.lastChild;
        while (partsWidth > getMaxWidth() && !tempPart && tempPart != scrolledStack) {
          partsWidth -= tempPart.boxObject.width;
          if (getMaxWidth() - partsWidth >= 30) {
            tempPart.firstChild.setAttribute("value", trimWord(
              tempPart.firstChild.getAttribute("value"), (getMaxWidth()
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
      let chars = (getMaxWidth() - partsWidth + width - 20)/
        (width/tempP.firstChild.getAttribute("value").length);
      if (chars > tempP.firstChild.getAttribute("value").length) {
        tempP.firstChild.setAttribute("value", trimWord(lastUsefulPart, chars));
        // Updating the part to get real width and repeating for further accuracy
        partsWidth += tempP.firstChild.boxObject.width - width;
        width = tempP.firstChild.boxObject.width;
        tempP.firstChild.setAttribute("value", trimWord(lastUsefulPart,
          (getMaxWidth() - partsWidth + width - 20)/
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
      window.openUILinkIn(partText, tab);
    }
    else if (clickedStack != enhancedURLBar.lastChild || mouseScrolled) {
      mouseScrolled = false;
      window.openUILinkIn(clickedStack.getAttribute("url"), tab);
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
    while (itemsB4 < 7 && i >= 0 && resultArray[0][0].replace(/[^0-9]/g,"")*1 > delta) {
      url1 = resultArray[i][1].replace(preURL, "");
      part1 = resultArray[i][0];
      url2 = i != 0?resultArray[i - 1][1]:url1;
      part2 = i != 0?resultArray[i - 1][0]:part1;
      p1 = part1.replace(/[^0-9]/g,"")*1;
      if (i == length || part1 == part2 || p1 - part2.replace(/[^0-9]/g,"")*1 > delta) {
        part2 = part1.replace(/[0-9]/g,"") + (p1 - delta)*1;
        if (part1.replace(/[0-9 ]/g,"").length > 0)
          urlmatch = url1.match(new RegExp("("+part1.replace(/[0-9 ]/g,"").toLowerCase()
            +")([_= ])?([0-9]{1,})"));
        else
          urlmatch = url1.match(/([\/&?#])([_= ])?([0-9]{1,})/);
        if (urlmatch == null)
          break;
        if (urlmatch.length != 4)
          break;
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
        if (part1.replace(/[0-9 ]/g,"").length > 0)
          urlmatch = url1.match(new RegExp("("+part1.replace(/[0-9 ]/g,"").toLowerCase()
            +")([_= ])?([0-9]{1,})"));
        else
          urlmatch = url1.match(/([\/&?#])([_= ])?([0-9]{1,})/);
        if (urlmatch == null)
          break;
        if (urlmatch.length != 4)
          continue;
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
          valA = valA.replace(/[\-_=]/g," ").replace(/[\/\\?&]/g, "");
          let aa = valA.split(/[0-9]+/g);
          valB = valB.replace(/[\-_=]/g," ").replace(/[\/\\?&]/g, "");
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
          relatedVal = relatedVal.join(" > ").replace(/^(\s<\s)/,"");
          if (pref("makeCapital"))
            relatedVal = makeCapital(relatedVal);
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
      gBrowser.removeEventListener("click", hideMainPopup, false);
    } catch (ex) {}
    editing = true;
    arrowMouseDown = siblingsShown = false;
    if (editingPart == enhancedURLBar.firstChild) {
      try {
        identityLabel.collapsed = true;
      } catch (ex) {}
      editingPart.setAttribute("isDomain", "false");
      editingPart.firstChild.style.display = "-moz-box";
    }
    highlightPart(editingPart, false, false, '>');

    let createdStack = document.createElementNS(XUL, "stack");
    createdStack.setAttribute("id", "UIEnhancer_URLBar_Editing_Stack");
    createdStack.style.maxHeight = (gURLBar.boxObject.height - (pref("useStyleSheet")? 0: 2)) + "px";
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
    tempS.style.maxHeight = tempS.style.minHeight = (gURLBar.boxObject.height
      - (pref("useStyleSheet")? 0: 4)) + "px";
    tempS.style.display = "-moz-box";
    tempS.style.maxWidth = tempS.style.minWidth = Math.max((nextPart?
      100: (editingPart.firstChild.boxObject.width +
      (editingPart == enhancedURLBar.firstChild? 75: 25))), 100) + "px";
    tempS.setAttribute("flex", 0);

    // Adding the Arrow Stack
    let tempArrow = document.createElementNS(XUL, "label");
    tempArrow.setAttribute("id", "UIEnhancer_URLBar_Editing_Stack_Arrow");
    tempArrow.style.minHeight = (gURLBar.boxObject.height - (pref("useStyleSheet")? 0: 4)) + "px";
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
        try {
          identityLabel.collapsed = false;
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
                  .toLowerCase() == "about")
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
    let editPartButton = createToolbarButton("Edit the Highlighted Part", EDIT_IMAGE, "Edit");
    editPartButton.onclick = function() {
      editPart(arrowedStack);
    };
    menuGroup.appendChild(editPartButton);
    // Add Part
    let addPartButton = createToolbarButton("Add a Part next to the Highlighted part", ADD_IMAGE, "Add");
    addPartButton.onclick = function() {
      editPart(arrowedStack, true);
    };
    menuGroup.appendChild(addPartButton);
    // Copy Part
    if (enhancedURLBar.lastChild != arrowedStack) {
      let copyPartButton = createToolbarButton("Copy Address till the Highlighted Part", COPY_IMAGE, "Copy");
      copyPartButton.onclick = function() {
        try {
          gBrowser.removeEventListener("click", hideMainPopup, false);
        } catch (ex) {}
        copyToClipboard(arrowedStack.getAttribute("url"));
        arrowMouseDown = siblingsShown = false;
        highlightPart(arrowedStack, false, false);
      };
      menuGroup.appendChild(copyPartButton);
    }
    // Copy All Part
    let copyAllPartButton = createToolbarButton("Copy Full Address", COPY_ALL_IMAGE, "Copy All");
    copyAllPartButton.onclick = function() {
      try {
        gBrowser.removeEventListener("click", hideMainPopup, false);
      } catch (ex) {}
      copyToClipboard(decodeURI(getURI().spec));
      arrowMouseDown = siblingsShown = false;
      highlightPart(arrowedStack, false, false);
    };
    menuGroup.appendChild(copyAllPartButton);
    // Delete Part
    if (arrowedStack != enhancedURLBar.firstChild) {
      let deletePartButton = createToolbarButton("Delete the Highlighted Part and load the resultant url", DELETE_IMAGE, "Delete");
      deletePartButton.onclick = function() {
        try {
          gBrowser.removeEventListener("click", hideMainPopup, false);
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
        part.setAttribute("tooltiptext", "Auto generated parts.\nClick to visit them");
      }
      let isCurrent = false;
      let tempS = enhancedURLBar.lastChild;
      if (tempS && tempS.getAttribute("url").replace(/^(https?:\/\/)/,"")
        .replace(/[\/]$/, "") == url.replace(/[\/]$/, "")) {
          part.style.fontWeight = "bold";
          isCurrent = true;
      }
      part.setAttribute("label", arrowVal);
      listen(window, part, "command", function(e) {
        try {
          mainPopup.hidePopup();
        } catch(ex) {}
        siblingsShown = arrowMouseDown = false;
        highlightPart(arrowedStack, false, false, '>');
        if (!isCurrent)
          handleTextClick(url, null, null, e.ctrlKey);
      }, false);
      listen(window, part, "click", function(e) {
        try {
          mainPopup.hidePopup();
        } catch(ex) {}
        siblingsShown = arrowMouseDown = false;
        highlightPart(arrowedStack, false, false, '>');
        if (e.button != 1)
          return;
        if (!isCurrent)
          handleTextClick(url, null, null, true);
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
        part.setAttribute("label", "Siblings of highlighted Part");
      else
        part.setAttribute("label", "Children of highlighted Part");
      part.setAttribute("disabled", true);
      mainPopup.insertBefore(part, mainPopup.firstChild);
      mainPopup.insertBefore(document.createElementNS(XUL, "menuseparator"),
        mainPopup.firstChild.nextSibling);
    }
    else {
      let part = document.createElementNS(XUL, "menuitem");
      part.setAttribute("id", "UIEnhancer_No_Suggestion");
      part.setAttribute("class", "menuitem-iconic");
      part.setAttribute("label", "No Suggestions Available");
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
    listen(window, gBrowser, "click", hideMainPopup = function() {
      gBrowser.removeEventListener("click", hideMainPopup, false);
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
    initial = currentTime = urlValue = urlArray_updateURL = counter = iLabel
      = anchorTagIndex = isSetting_updateURL = iCountry
      = urlPostSetting = index = urlVal_updateURL = URLDisplayed = null;
  }, window);

  // Function to change urlBar's UI
  function updateURL(forcedUpdate) {
    if (gURLBar.focused || editing || window.getComputedStyle(gURLBar).visibility == "collapse")
      return;
    // checking if the identity block is visible or not (firefox 12+)
    try {
      origIdentity.collapsed = false;
    } catch (ex) {}
    urlValue = decodeURI(getURI().spec);
    try {
      URLDisplayed = enhancedURLBar.lastChild.getAttribute("url");
    } catch (ex) {
      URLDisplayed = "";
    }
    if (URLDisplayed == urlValue && !showingHidden && !titleChanged && !mouseScrolled && !forcedUpdate) {
      try {
        if (pref("domainIdentityLabel")) {
          identityLabel.value = iLabel.replace("www.", "");
          if (pref("makeCapital"))
            identityLabel.value = makeCapital(identityLabel.value);
          identityCountryLabel.value = iCountry;
          identityLabel.collapsed = false;
          identityCountryLabel.collapsed = iCountry.length == 0;
        }
      } catch (ex) {}
      updateLook();
      return;
    }
    counter = 0;
    initial = 0;
    hiddenStartingIndex = 0;
    urlPartArray = [];
    anchorTagIndex = settingsStartIndex = null;
    isSetting_updateURL = null;
    mouseScrolled = titleChanged = showingHidden = false;
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
      urlValue = decodeURI(getURI().spec);
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

    iLabel = "";
    if (pref("domainIdentityLabel")) {
      if (!origILabel || origILabel.value.search(" ") < 0)
        iLabel = urlArray_updateURL[0];
      else
        iLabel = origILabel? origILabel.value: "";
      iCountry = origICountryLabel? origICountryLabel.value: "";

      //trimming the iLabel to 50 characters
      iLabel = trimWord(iLabel, 54);
      identityLabel.value = iLabel.replace("www.", "");
      if (pref("makeCapital")) 
        identityLabel.value = makeCapital(identityLabel.value);
      identityCountryLabel.value = iCountry;
      identityLabel.collapsed = (iLabel.length == 0);
      identityCountryLabel.collapsed = (iCountry.length == 0);
    }
    // resetting the enhancedURLBar
    reset(0);
    redRemoved = 0;
    for (index = 0; index < urlArray_updateURL.length; index++) {
      urlVal_updateURL = urlArray_updateURL[index];
      isSetting_updateURL = false;
      // Test Case to check gibberish function
      [urlVal_updateURL, isSetting_updateURL] = replaceGibberishText(urlVal_updateURL, urlArray_updateURL, index);
      if (index == 0 && iLabel == urlVal_updateURL && urlArray_updateURL[1] != null)
        addPart(urlVal_updateURL, urlValue.slice(0, urlPartArray[index]), true,
          isSetting_updateURL, index == urlArray_updateURL.length - 1);
      else
        addPart(urlVal_updateURL, urlValue.slice(0, urlPartArray[index]), false,
          isSetting_updateURL, index == urlArray_updateURL.length - 1);
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
          if (!enhancedURLBar || enhancedURLBar.lastChild.getAttribute("url").slice(-1*urlPart.length)
            .replace(/^(https?:\/\/)?(www\.)?/, "") != urlPart
            .replace(/^(https?:\/\/)?(www\.)?/, ""))
              return;
          resultArray = resultArray.filter(function({url, title}) {
            if (url.replace(/^(https?:\/\/)?(www\.)?/, "")
              .slice(urlPart.replace(/^(https?:\/\/)?(www\.)?/, "").length).length <= 1)
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
      // Watch for urlbar value change
      let changeListener = {
        onLocationChange: function(aProgress, aRequest, aURI) {
          newDocumentLoaded = true;
          refreshRelatedArray = true;
          if (!tabChanged)
            origIdentity.collapsed = identityLabel.collapsed = false;
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
        origIdentity.collapsed = false;
        identityLabel.collapsed = false;
        tabChanged = true;
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
        if (!e.originalTarget.hasFocus())
          return;
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
      listen(window, gURLBar, "blur", function() {
        reset(0);
        if (!tabChanged)
          async(updateURL, pref("animationSpeed") != "none"? 210: 10);
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
        if (e.target.title != gBrowser.contentDocument.title)
          return;
        async(function() {
          if (!gURLBar.focused && newDocumentLoaded) {
            origIdentity.collapsed = false;
            identityLabel.collapsed = false;
            titleChanged = true;
            updateURL();
            newDocumentLoaded = false;
          }
        }, 10);
      });
    }

    handleURLBarEvents();
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
    paddingBottom = (nHeight - (pHeight>=26?24:pHeight))/2;
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
    tempMove = function() {};
    tempOut = function() {};
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
    unload(function() {
      addBookmarkListeners = function() {};
      try {
        gURLBar.removeEventListener("mousemove", temp, false);
      } catch(ex) {}
    }, window);
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
  let conflictingAddons = ["Mozilla Labs: Prospector - OneLiner", "Bookmarks Enhancer"];
  // Function to load stylesheets
  function loadStyles(styles) {
    let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
      getService(Ci.nsIStyleSheetService);
    styles.forEach(function(fileName) {
      let fileURI = addon.getResourceURI("styles/" + fileName + ".css");
      sss.loadAndRegisterSheet(fileURI, sss.USER_SHEET);
      unload(function() sss.unregisterSheet(fileURI, sss.USER_SHEET));
    });
  }

  // Load various javascript includes for helper functions
  ["helper", "pref"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  if (pref("enhanceURLBar")) {
    if (pref("useStyleSheet") && pref("userStylePath").length == 0)
      loadStyles(["defaultThemeLight"]);
    else if (pref("useStyleSheet")) {
      let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
        getService(Ci.nsIStyleSheetService);
      let fileURI = Services.io.newURI("file:///" + pref("userStylePath")
        .replace(/[\\]/g, "/"), null, null);
      if (!fileURI.spec.match(/(\.css)$/))
        loadStyles(["defaultThemeLight"]);
      else {
        sss.loadAndRegisterSheet(fileURI, sss.USER_SHEET);
        // Fallback to default stylesheet when the file is not present
        if (!sss.sheetRegistered(fileURI, sss.USER_SHEET))
          loadStyles(["defaultThemeLight"]);
        else
          unload(function() sss.unregisterSheet(fileURI, sss.USER_SHEET));
      }
    }
  }

  // Apply the changes in UI
  watchWindows(changeUI);

  reload = function() {
    unload();
    normalStartup = true;
    if (pref("enhanceURLBar")) {
      if (pref("useStyleSheet") && pref("userStylePath").length == 0)
        loadStyles(["defaultThemeLight"]);
      else if (pref("useStyleSheet")) {
        let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
          getService(Ci.nsIStyleSheetService);
        let fileURI = Services.io.newURI("file:///" + pref("userStylePath")
          .replace(/[\\]/g, "/"), null, null);
        if (!fileURI.spec.match(/(\.css)$/))
          loadStyles(["defaultThemeLight"]);
        else {
          sss.loadAndRegisterSheet(fileURI, sss.USER_SHEET);
          // Fallback to default stylesheet when the file is not present
          if (!sss.sheetRegistered(fileURI, sss.USER_SHEET))
            loadStyles(["defaultThemeLight"]);
          else
            unload(function() sss.unregisterSheet(fileURI, sss.USER_SHEET));
        }
      }
    }
    watchWindows(changeUI);
    pref.observe([
      "useStyleSheet",
      "bringBookmarksUp",
      "animationSpeed",
      "removeGibberish",
      "enhanceURLBar",
      "makeCapital",
      "domainIdentityLabel",
      "userStylePath"
    ], reload);
    pref.observe([
      "urlBarWidth",
    ], reloadOnTabChange);
    pref.observe([
      "useSmallIcons"
    ], specialReload);

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
  };

  function specialReload() {
    firstRunAfterInstall = true;
    normalStartup = false;
    reload();
  }

  function reloadOnTabChange() {
    recheckOnTabChange = true;
  }

  // Watch for preference changes to reprocess the keyword data
  pref.observe([
    "useStyleSheet",
    "bringBookmarksUp",
    "animationSpeed",
    "enhanceURLBar",
    "removeGibberish",
    "makeCapital",
    "domainIdentityLabel",
    "userStylePath"
  ], reload);
  pref.observe([
    "urlBarWidth",
  ], reloadOnTabChange);
  pref.observe([
    "useSmallIcons"
  ], specialReload);

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

  // Adding listener to reload add-on whena conflicting add-on gets installed or enabled/disabled
  function checkConflict(addon) {
    if (addon.id == "BookmarksEnhancer@girishsharma.com")
      setPref("bringBookmarksUp", false);
    if (conflictingAddons.indexOf(addon.name) >= 0)
      reload();
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
});

function shutdown(data, reason) {
  if (reason != APP_SHUTDOWN)
    unload();
}

function install(data, reason) AddonManager.getAddonByID(data.id, function(addon) {
  if (reason == 5 || reason == 7)
    firstRunAfterInstall = true;
  else
    normalStartup = true;
});

function uninstall() {}
