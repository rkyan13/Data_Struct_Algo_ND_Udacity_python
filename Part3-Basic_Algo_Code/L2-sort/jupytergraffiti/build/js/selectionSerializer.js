"use strict";

define([], function () {
  // From npm package: serialize-selection, MIT license
  // restore the selection specified by the given state and reference node, and
  // return the new selection object
  var selectionSerializer = {
    // https://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
    clearWindowSelection: function clearWindowSelection() {
      if (window.getSelection) {
        if (window.getSelection().empty) {
          // Chrome
          window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) {
          // Firefox
          window.getSelection().removeAllRanges();
        }
      } else if (document.selection) {
        // IE?
        document.selection.empty();
      }
    },
    // serialize the current selection offsets using given node as a reference point
    get: function get(referenceNode) {
      referenceNode = referenceNode || document.body;
      var sel = window.getSelection();
      var range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : document.createRange();
      var startContainer = range.startContainer;
      var parentNode = startContainer.parentNode;
      var startOffset = range.startOffset;
      var state = {
        content: range.toString()
      }; // move the range to select the contents up to the selection
      // so we can find its character offset from the reference node

      range.selectNodeContents(referenceNode);
      range.setEnd(startContainer, startOffset);
      state.start = range.toString().length;
      state.end = state.start + state.content.length;
      return {
        state: state,
        empty: state.start === state.end
      };
    },
    restore: function restore(selectionSerialized) {
      var referenceNode = selectionSerialized.referenceNode || document.body;
      var state = selectionSerialized.state;
      var currentNodeCharIndex = 0;
      var nodes = [referenceNode];
      var sel = window.getSelection();
      var existingRange;

      if (sel.rangeCount > 0) {
        //existingRange = sel.getRangeAt(0);
        //console.log('removing existing range:', existingRange);
        sel.removeAllRanges();
      }

      var range = document.createRange();
      var node;
      var nextNodeCharIndex;
      range.setStart(referenceNode, 0);
      range.collapse(true);

      while (node = nodes.pop()) {
        if (node.nodeType === 3) {
          // text_node
          nextNodeCharIndex = currentNodeCharIndex + node.length; // if this node contains the character at the start index, set this as the
          // starting node with the correct offset

          if (state.start >= currentNodeCharIndex && state.start <= nextNodeCharIndex) {
            range.setStart(node, state.start - currentNodeCharIndex);
          } // if this node contains the character at the end index, set this as the
          // ending node with the correct offset and stop looking


          if (state.end >= currentNodeCharIndex && state.end <= nextNodeCharIndex) {
            range.setEnd(node, state.end - currentNodeCharIndex);
            break;
          }

          currentNodeCharIndex = nextNodeCharIndex;
        } else {
          // get child nodes if the current node is not a text node
          var i = node.childNodes.length;

          while (i--) {
            nodes.push(node.childNodes[i]);
          }
        }
      }

      sel.addRange(range);
      return sel;
    }
  };
  return selectionSerializer;
});