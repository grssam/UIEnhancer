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
 *  The original code is the helper and utils file for addon Home Dash.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const COPY_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACfUlEQVRYhb2XX2vaUBjGn6gtGYyUGN3dWLt2OBhL1954sXXtrZMtHyFfyUvBT+CdIiZFdrHN7XYbjjGk21B200YMiEgDMWYXbdzRJic5xu6BQPLm/PnlfZ9zOOFc14UnXdf/PTDIcZxvzWbzVblcvgBg09qS83EcdxXwLk3TXFYZhuG22223Vqv9UBTlEYCNMADySqzyxaREUUQmk4EkSY9VVW0oirIdBkEqNkAqlYIkSZBlGdlsNscKwS17oFAoLDTQdR3pdJoJajqdwjTN741Go1CpVM5B+IKcDwBSUQbM5/NMAIPBAN1u90mxWGwZhvGmXq/3EGDO2CXwE4svbgWAxRfUErz7/DMWhCAIkGUZnU4np6pqA8BrjuN6ruvOy0HNwMnh3soAyWQSw+EQpmlCEIR5JgCIHMfNMxHJhKtIEAQAgCRJsCwLk8kE4/E4B+AegEtcm/LWSkCK53nwPO8twbsgvEAFODncg66fxYIiy9jv94GrsnORAMIGZNVoNLoR8wXwdqv3X36tPFlUUTNwfLCL09P1lSAywPJ+zTIgq6j7wIevv9c6mZ+oGTja30GrdbYQY/XF8cEugOvTDysAbcB1iWrCj53e/J4GFaagrw8E8CZ7/vQB3l4srgJWX7x89pD63hdgNpsFQh3t7zABeP1ieyBOCWjyBeB5PrAD6YsoeiFvRwewbRvVahWO48xjoigCWPQFi8IytwCgKMoWgPsAtryYpmmfAH9fRFUiEbzfLZfgEsAfAOfLDWlLKUx+fb3YMoCNgOPz5ubmygA0hZ4HbNtGqVSCZVn/F4BYvzd8EVMjEFle+DUja0UAbAC4A4YfzhDZIA6lfwHXx0GzewQpagAAAABJRU5ErkJggg==";
const COPY_ALL_IMAGE = "data:image/png;base64,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";
const EDIT_IMAGE = "data:image/png;base64,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";
const ADD_IMAGE = "data:image/png;base64,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";
const DELETE_IMAGE = "data:image/png;base64,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";

// Helper that adds event listeners and remembers to remove on unload
function listen(window, node, event, func, capture) {
  // Default to use capture
  if (capture == null)
    capture = true;

  node.addEventListener(event, func, capture);
  function undoListen() {
    node.removeEventListener(event, func, capture);
  }

  // Undo the listener on unload and provide a way to undo everything
  let undoUnload = unload(undoListen, window);
  return function() {
    undoListen();
    undoUnload();
  };
}

// Async version of SpinQuery
// Enhanced by Girish Sharma
function spinQueryAsync(connection, {names, params, query}, {callback, args}) {
  // Remember the results from processing the query
  let allResults = [];

  // Nothing to do with no query
  if (query == null) {
    args[args.length] = allResults;
    callback(args);
    return;
  }

  // Create the statement and add parameters if necessary
  let statement = connection.createAsyncStatement(query);
  if (params != null) {
    Object.keys(params).forEach(function(key) {
      statement.params[key] = params[key];
    });
  }

  // Start the query and prepare to cancel if necessary
  let pending = statement.executeAsync({
    // Remember that we finished successfully
    handleCompletion: function handleCompletion(reason) {
      if (reason != Ci.mozIStorageStatementCallback.REASON_ERROR) {
        args[args.length] = allResults;
        callback(args);
      }
    },

    // Remember that we finished with an error
    handleError: function handleError(error) {
      throw error;
    },

    // Process the batch of results and save them for later
    handleResult: function handleResult(results) {
      let row;
      while ((row = results.getNextRow()) != null) {
        let item = {};
        names.forEach(function(name) {
          item[name] = row.getResultByName(name);
        });
        allResults.push(item);
      }
    },
  });
}

function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}

function watchWindows(callback) {
  var unloaded = false;
  unload(function() unloaded = true);

  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      // Now that the window has loaded, only handle browser windows
      let {documentElement} = window.document;
      if (documentElement.getAttribute("windowtype") == "navigator:browser")
        callback(window);
    }
    catch(ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener("load", function runOnce() {
      window.removeEventListener("load", runOnce, false);
      if (unloaded) return; // the extension has shutdown
      watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    // Only run the watcher immediately if the window is completely loaded
    let window = windows.getNext();
    if (window.document.readyState == "complete")
      watcher(window);
    // Wait for the window to load before continuing
    else
      runOnLoad(window);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == "domwindowopened")
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

// Take a window and create various helper properties and functions
function makeWindowHelpers(window) {
  const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

  let {document, clearTimeout, gBrowser, setTimeout} = window;

  // Call a function after waiting a little bit
  function async(callback, delay) {
    delay = delay || 0;
    let timer = setTimeout(function() {
      stopTimer();
      callback();
    }, delay);

    // Provide a way to stop an active timer
    function stopTimer() {
      if (timer == null)
        return;
      clearTimeout(timer);
      timer = null;
    }

    // Make sure to stop the timer when unloading
    unload(stopTimer, window);

    // Give the caller a way to cancel the timer
    return stopTimer;
  }

  // Replace a value with another value or a function of the original value
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }

  return {
    async: async,
    change: change,
  };
}

function max(n1, n2) n1>n2?n1:n2;
function min(n1, n2) n1<n2?n1:n2;

// Helper function to convert url's names to proper words.
function makeCapital(word, len) {
  if (word != null) {
    let parts = word.split(" ");
    if (word.split(".").length > 2 && parts.length == 1)
      return word;
    if (parts.length == 1) {
      len = len || 1;
      if (parts[0].length > 2 && parts[0] != "and")
        return parts[0].substr(0,1).toUpperCase()+parts[0].substr(1);
      else if (len <= 2 || parts[0] == "i")
        return parts[0].toUpperCase();
      else
        return parts[0];
    }
    else {
      parts = parts.map(function(part) makeCapital(part, parts.length));
      return parts.join(" ");
    }
  }
  else
    return "";
}

// Function to detect gibberish words or words containing gibberish part
function gibberish(string) {
  // Returns false for non gibberish, but for partial gibberish words
  // the function returns the output as an array of each gibberish word's index
  // Returns true/false for single words
  let parts = string.split(/[ _]/g);
  if (parts.length > 1) {
    // code to deterimine if the word is gibberish on the whole
    let result = 0;
    let partResult = 0;
    let gibberishIndexArray = [];
    for (let i = 0; i < parts.length; i++) {
      partResult = gibberish(parts[i]) == true? 1: 0;
      result += partResult;
      if (partResult == 1)
        gibberishIndexArray.push(i);
    }
    if (result == 0)
      return false;
    else
      return gibberishIndexArray;
  }
  else if (string.split(".").length > 1 && string.split(".").length < 4) {
    let result = gibberish(string.replace(".", " "));
    if (result == false)
      return false;
    else
      return true;
  }
  else {
    // Returning true if url type thing encountered, only possible in queryString
    if (string.indexOf("/") >= 0)
      return false;
    // Array containing WhiteList Words
    // Populate it regularily
    let whiteList = ["http","https","id","aurora", "xpcom", "hawaii", "src", "sdk"];
    // code to determine if a single word is gibberish or not
    let numAlpha = 0; // Basically non numeric characters
    let numNum = 0;
    let numVowel = 0;
    string = string.toLowerCase();
    let {length} = string;
    numAlpha = string.split(/[^0-9]/).length -1;
    numNum = length - numAlpha;
    if (length < 6 && numAlpha <= 2)
      return false;
    else if (length >= 6 && ((numAlpha > 2 && numNum > 0 && numAlpha < length - 1)
      || (numAlpha == 0)))
        return true;
    numVowel = string.split(/[aeiouy]/).length - 1;
    if (numNum <= 2 && string.split(/[0-9]/g).length <= 2
      && ((length < 6 && numVowel > 0)
      || (length >= 6 && numNum <= 2 && numVowel > 0
      && numAlpha/numVowel < 5 && numAlpha/numVowel > 1.5)))
        return false;
    else if (whiteList.indexOf(string.toLowerCase()) >= 0)
      return false;
    else
      return true;
  }
}

// Function to remove redundant text from String as per Title
function removeRedundantText(baseString, redString) {
  redString = redString.split(/\s+/);
  baseString = baseString.filter(function(redVal) {
    return redVal.length > 3;
  });
  let i = 0;
  let len;
  function checkBaseMatch(base) {
    base = base.toLowerCase().replace(/[^0-9a-zA-Z ]+/g, "");
    let ret = false;
    for (let i = 0; i < baseString.length; i++) {
      try {
        if (base.search(baseString[i]) >= 0 || baseString[i].search(base) >=0)
          ret = true;
      } catch (ex) {}
    }
    return ret;
  }

  for (i = 0; i < baseString.length; i++)
    baseString[i] = baseString[i].toLowerCase().replace(/[^0-9a-zA-Z ]+/g, "");
  i = 0;
  let {length} = redString;
  while (i < length) {
    if (checkBaseMatch(redString[i]) &&
      (i < 2 || i > max(length - 3, 0.75*length))) {
        redString.splice(i, 1);
        i = 0;
        length = redString.length;
    }
    else
      i++;
  }

  // Loop to reduce ending extra words like A , The , : , - etc
  len = redString.length;
  i = 0;
  while (i < len) {
    if (((i == 0 || i == len - 1) && redString[i].search(/^[^a-zA-Z0-9]+$/) >= 0)
      || (i == len - 1 && redString[i].search(/^(the|a|an|for)$/i) >= 0)) {
        redString.splice(i,1);
        i = Math.max(i - 2, 0);
        len = redString.length;
    }
    else
      i++;
  }
  return redString.join(" ");
}

// function to trim the word and add ... in the middle
function trimWord(trimVal, limit, start) {
  if (trimVal == null)
    return null;
  function totalLength(parts) {
    let result = 0;
    for (let i = 0; i < parts.length; i++)
      result += parts[i].length + 1;
    return --result;
  }
  limit = limit || 40;
  let remWords = limit;
  if (start == null)
    start = true;

  if (trimVal.length > limit) {
    let valPart = trimVal.split(" ");
    let newVal = "";
    if (valPart.length > 1) {
      let index = -1;
      Array.some(valPart, function(v) {
        if (newVal.length > 2*limit/3)
          return true;
        else {
          if (newVal.length + v.length < 2*limit/3) {
            newVal += v + " ";
            remWords -= (v.length + 1);
            index++;
          }
          else return true;
        }
      });
      if (index == -1) {
        // Checking whether the rest of the words (except first) sum up big
        let tempLim = valPart[0].length/totalLength(valPart);
        newVal = trimWord(valPart[0], limit*tempLim, true) + " ";
        remWords -= newVal.length;
        index++;
      }
      if (valPart.length > 2) {
        newVal += "... ";
        remWords -= 4;
      }
      if (index < valPart.length - 1) {
        // Now adding the remaining words till limit is completed
        let lastIndex = valPart.length - 1;
        let endPart = "";
        while (remWords > valPart[lastIndex].length && lastIndex > index) {
          endPart = " " + valPart[lastIndex] + endPart;
          remWords -= (valPart[lastIndex--].length + 1);
        }
        if (lastIndex - index <= 1) {
          newVal = newVal.replace(" ... ", " ");
          remWords += 4;
        }
        if (lastIndex > index && remWords > 2)
          endPart = trimWord(valPart[lastIndex], remWords, false) + endPart;
        newVal += endPart;
      }
      return newVal;
    }
    else if (start == false)
      return (".." + trimVal.slice(trimVal.length - limit + 2, trimVal.length));
    else if (start == true)
      return (trimVal.slice(0, limit-2) + "..");
  }
  else return trimVal;
}
