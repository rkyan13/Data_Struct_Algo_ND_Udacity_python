"use strict";

//
// Modeled on jupyter's terminado.js, but modified a lot for Graffiti usage.
//
// xterm, xterm's css and its fit addon were downloaded and put in the graffiti code base, from here:
// "xterm.js": "https://unpkg.com/xterm@~3.11.0/dist/xterm.js"
// "xterm.js-fit": "https://unpkg.com/xterm@~3.11.0/dist/addons/fit/fit.js"
// "xterm.js-css": "https://unpkg.com/xterm@~3.11.0/dist/xterm.css"
define(['base/js/utils', 'js/utils.js', 'js/localizer.js', 'js/xterm/xterm.js', 'js/xterm/addons/fit/fit.js'], function (jupyterUtils, utils, localizer, terminalLib, fit) {
  var terminals = {
    focusedTerminal: undefined,
    singleCDCommand: false,
    fitRetryTime: 1000,
    maxRefitAttempts: 10,
    CDCommandCount: 0,
    terminalsList: {},
    _makeTerminal: function _makeTerminal(element, terminalId, wsUrl, sizeObj) {
      //console.log('makeTerminal,wsUrl:', wsUrl);
      var ws = new WebSocket(wsUrl);
      terminalLib.applyAddon(fit);
      var term = new terminalLib({
        scrollback: 10000,
        theme: {
          foreground: 'white',
          background: '#222',
          // foreground: 'black',
          // background: '#eee',
          selection: '#fff',
          cursor: '#f73',
          cursorAccent: '#f22'
        }
      });
      term.id = terminalId; // contents: contains all chars in and out of the terminal over the socket.

      var termObject = {
        socket: ws,
        term: term,
        contents: '',
        socketOpen: false,
        sendQueue: [],
        send: function send(data) {
          if (termObject.socketOpen) {
            ws.send(JSON.stringify(['stdin', data]));
          } else {
            termObject.sendQueue.push(data);
          }
        }
      };

      ws.onopen = function (event) {
        termObject.socketOpen = true;
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = termObject.sendQueue[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var data = _step.value;
            // Send any commands queued up before the socket was ready, down the pipe
            ws.send(JSON.stringify(['stdin', data]));
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator["return"] != null) {
              _iterator["return"]();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        term.on('data', function (data) {
          ws.send(JSON.stringify(['stdin', data]));
        }); // term.on('keydown', (data) => {
        //  console.log('keypress data:', data);
        // });
        //term.on('scroll', (data) => {
        //console.log('term scroll:', data);
        //});
        // term.on('selection', (data) => {
        //   console.log('term selection:', term.getSelection());
        // });

        term.on('focus', function () {
          //console.log('Graffiti: terminal ' + term.id + ' focused');
          terminals.focusedTerminal = term.id;
        });
        term.on('blur', function () {
          // console.log('terminal defocused'); 
          terminals.focusedTerminal = undefined;
        });
        term.on('refresh', function (data) {
          var checkYdisp = term._core.buffer.ydisp;

          if (term.storedYdisp !== undefined) {
            if (term.storedYdisp != checkYdisp) {
              terminals.eventsCallback({
                id: term.id,
                type: 'refresh',
                scrollLine: checkYdisp
              }); //console.log('Graffiti: terminal refresh delta:', term.storedYdisp, checkYdisp);
            }
          }

          term.storedYdisp = term._core.buffer.ydisp;
        });
        term.open(element);
        term.fit(); // Send the terminal size to the server.

        ws.send(JSON.stringify(["set_size", term.rows, term.cols, window.innerHeight, window.innerWidth]));

        ws.onmessage = function (event) {
          var json_msg = JSON.parse(event.data);

          switch (json_msg[0]) {
            case "stdout":
              var newChars = json_msg[1];
              term.write(newChars);
              term.storedYdisp = term._core.buffer.ydisp; //console.log('received newCharslength:', newChars.length, newChars);

              termObject.contents += newChars;
              terminals.eventsCallback({
                id: term.id,
                scrollLine: term.storedYdisp,
                position: termObject.contents.length,
                focusedTerminal: terminals.focusedTerminal,
                firstRecord: false
              }); // console.log('termId:', terminalId,'received string of length:', json_msg[1].length, 'from server, contents now has:', termObject.contents);

              break;

            case "disconnect":
              term.write("\r\n\r\n[CLOSED]\r\n");
              break;
          }
        };
      };

      return termObject;
    },
    getFocusedTerminal: function getFocusedTerminal() {
      return terminals.focusedTerminal;
    },
    // Get enough content to fill a terminal sufficiently during scrubbing or just starting playback.
    // We don't restore the entire contents we may have had for the terminal because it could be huge,
    // but we restore about 4x the terminal contents so you can scroll back a bit and to account for
    // curses program output and multibyte characters, etc.
    getContentToFillTerminal: function getContentToFillTerminal(terminal, contents, contentsPointer) {
      var portionMultiplier = 8;
      var term = terminal.term;
      var portionLength = term.rows * term.cols * portionMultiplier;
      var contentsPortion = contents.substr(Math.max(0, contentsPointer - portionLength), contentsPointer); //const contentsPortion = contents.substr(0, contentsPointer);
      //console.log('contentsPointer:', contentsPointer);

      return contentsPortion;
    },
    createTerminalCell: function createTerminalCell(cellId, config) {
      if (terminals.terminalsList.hasOwnProperty(cellId)) {
        return terminals.terminalsList[cellId]; // already have this terminal set up
      }

      var cell = utils.findCellByCellId(cellId);

      if (cell !== undefined) {
        var cellJq = $(cell.element);
        var renderArea = cellJq.find('.rendered_html');
        renderArea.html('<div>' + '  <span id="dummy-screen-rows" style="font-family:courier; font-weight:bold; font-size:15px;">bash-3.2$ </span>' + '</div>');
        var lineHeight = renderArea.find('#dummy-screen-rows').height();
        renderArea.html('Loading...');
        var terminalHeight = lineHeight * config.rows; // pixels

        var terminalContainerId = 'graffiti-terminal-container-' + cellId;
        renderArea.html('<div class="graffiti-terminal-container" id="' + terminalContainerId + '" class="container" style="width:100%;height:' + terminalHeight + 'px;"></div>' + '<div class="graffiti-terminal-links">' + ' <div class="graffiti-terminal-go-notebook-dir">' + localizer.getString('JUMP_TO_NOTEBOOK_DIR') + '</div>' + ' <div class="graffiti-terminal-reset">' + localizer.getString('RESET_TERMINAL') + '</div>' + '</div>').show();
        var urlPathName = location.pathname;
        var host = location.host;
        var path = '/terminals/websocket/';

        if (urlPathName.indexOf('/notebooks/') > 0) {
          // In cases where Jupyter is hosted on a path-based VM, like on binder.org, we need to extract that path part 
          // and put it in front of the regular terminals endpoint.
          var parts = urlPathName.split(/\/notebooks\//, 2);
          path = parts[0].length > 0 ? parts[0] + path : path;
        }

        var wsUrl = location.protocol.replace('http', 'ws') + '//' + location.host + path + config.terminalId;
        var elem = $('#' + terminalContainerId);
        var sizeObj = {
          cols: 40,
          rows: 10
        };
        renderArea.find('.graffiti-terminal-reset').click(function (e) {
          var target = $(e.target);
          var cellDOM = target.parents('.cell');
          var cellId = cellDOM.attr('graffiti-cell-id');
          terminals.resetTerminalCell(cellId);
        });
        renderArea.find('.graffiti-terminal-container').bind('mousewheel', function (e) {//console.log('xterm mousewheel',e.originalEvent.wheelDeltaY); // looks like values about 10 move one line...
        });

        var newTerminal = terminals._makeTerminal(elem[0], cellId, wsUrl, sizeObj);

        terminals.terminalsList[cellId] = newTerminal;
        elem.bind('click', function () {
          newTerminal.term.focus();
        });
        var notebookDirectory = utils.getNotebookDirectory(); //console.log('Graffiti: notebookDirectory:', notebookDirectory);

        if (notebookDirectory !== undefined) {
          // in theory we could check to see if we're already in the directory we are supposed to be in using basename:
          // https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash
          var cdCommand = "" + 'if test -d ' + notebookDirectory + '; then cd ' + notebookDirectory + "; fi && clear\n";

          if (!terminals.singleCDCommand || terminals.singleCDCommand && terminals.CDCommandCount < 1) {
            newTerminal.send(cdCommand);
            terminals.CDCommandCount++;
          }

          renderArea.find('.graffiti-terminal-go-notebook-dir').click(function (e) {
            newTerminal.send(cdCommand);
          });
        } else {
          renderArea.find('.graffiti-terminal-go-notebook-dir').hide(); // if this link is inactive, just hide it.
        }

        return newTerminal;
      } else {
        return undefined;
      }
    },
    createTerminalInCell: function createTerminalInCell(cell, terminalId, desiredRows) {
      var cellId = utils.getMetadataCellId(cell.metadata);

      if (terminalId === undefined) {
        terminalId = cellId;
      }

      if (cellId !== undefined) {
        var notebookDirectory = utils.getNotebookDirectory();
        var rows = desiredRows === undefined ? 6 : desiredRows; // default is 6 rows but can be changed by metadata

        var graffitiConfig = {
          type: 'terminal',
          startingDirectory: notebookDirectory,
          terminalId: terminalId,
          // defaults to the graffiti cell id, but can be changed if author wants to display the same terminal twice in one notebook.
          rows: rows
        };
        utils.assignCellGraffitiConfig(cell, graffitiConfig);
        utils.selectCellByCellId(cellId);
        cell.set_text('<i>Loading terminal (' + cellId + '), please wait...</i>');
        cell.render();
        return terminals.createTerminalCell(cellId, graffitiConfig);
      }
    },
    refreshTerminalCell: function refreshTerminalCell(cellId) {
      if (terminals.terminalsList[cellId] !== undefined) {
        // Create a new terminal id so we'll connect to a fresh socket.
        var term = terminals.terminalsList[cellId].term;
        term.refresh(0, 100000);
        term.focus();
      }
    },
    resetTerminalCell: function resetTerminalCell(cellId) {
      if (terminals.terminalsList[cellId] !== undefined) {
        var fetchParams = {
          method: 'delete',
          credentials: 'include'
        };
        var cell = utils.findCellByCellId(cellId);
        var graffitiConfig = utils.getCellGraffitiConfig(cell);

        if (graffitiConfig !== undefined) {
          var deleteAPIEndpoint = location.origin + '/api/terminals/' + graffitiConfig.terminalId;
          var settings = {
            // liberally cribbed from jupyter's codebase,
            // https://github.com/jupyter/notebook/blob/b8b66332e2023e83d2ee04f83d8814f567e01a4e/notebook/static/tree/js/terminallist.js#L110
            processData: false,
            type: "DELETE",
            dataType: "json",
            success: function success() {
              console.log('Graffiti: successful terminal delete.');
            },
            error: utils.log_ajax_error
          };
          jupyterUtils.ajax(deleteAPIEndpoint, settings);
        }

        var currentRows = terminals.terminalsList[cellId].term.rows;
        delete terminals.terminalsList[cellId];
        terminals.createTerminalInCell(cell, utils.generateUniqueId(), currentRows);
        utils.saveNotebookDebounced();
      }
    },
    // Just remove the cellId from the list we keep of terminals in the nb.
    removeTerminal: function removeTerminal(cellId) {
      delete terminals.terminalsList[cellId];
    },
    createTerminalCellAboveSelectedCell: function createTerminalCellAboveSelectedCell() {
      var newTerminalCell = Jupyter.notebook.insert_cell_above('markdown');

      if (newTerminalCell !== undefined) {
        return terminals.createTerminalInCell(newTerminalCell);
      }

      return undefined;
    },
    processRenderQueue: function processRenderQueue() {
      if (terminals.renderQueue.length > 0) {
        var rq = terminals.renderQueue.shift();
        var cellId = utils.getMetadataCellId(rq.cell.metadata); // console.log('Processing render queue entry:', rq);

        terminals.createTerminalCell(cellId, rq.config); // make sure you can't double click this cell because that would break the terminal

        $(rq.cell.element[0]).unbind('dblclick').bind('dblclick', function (e) {
          e.stopPropagation();
          return false;
        });
        setTimeout(terminals.processRenderQueue, 250);
      }
    },
    // If there are terminals present in this notebook, render them.
    renderAllTerminals: function renderAllTerminals() {
      var cells = Jupyter.notebook.get_cells();
      var cell, cellId;
      terminals.renderQueue = [];

      for (var i = 0; i < cells.length; ++i) {
        cell = cells[i];

        if (cell.cell_type === 'markdown') {
          if (cell.metadata.hasOwnProperty('graffitiConfig')) {
            if (cell.metadata.graffitiConfig.type === 'terminal') {
              var config = $.extend({}, cell.metadata.graffitiConfig);

              if (utils.getNotebookGraffitiConfigEntry('singleTerminal') !== undefined && utils.getNotebookGraffitiConfigEntry('singleTerminal') == "true") {
                // note that the metadata entry has to be "true", not just true. (double quotes req'd)
                config.terminalId = utils.getNotebookGraffitiConfigEntry('id');
                terminals.singleCDCommand = true;
              }

              terminals.renderQueue.push({
                cell: cell,
                config: config
              });
            }
          }
        }
      }

      terminals.processRenderQueue();
    },
    backupTerminalOutput: function backupTerminalOutput(cellId) {
      var terminal = terminals.terminalsList[cellId];

      if (terminal !== undefined) {
        terminal.contentsBackup = terminal.contents;
      }
    },
    setTerminalContents: function setTerminalContents(opts) {
      var cellId = opts.id;
      var newContents = opts.terminalsContents[cellId];
      var terminal = terminals.terminalsList[cellId];

      if (terminal === undefined) {
        console.log('Graffiti: cannot find terminal', cellId, 'for sending output, trying to find next terminal from:', opts.nearestCellPosition);

        if (opts.nearestCellPosition === undefined || !opts.useNearestCellPosition) {
          return;
        } // Try to find a terminal after the nearest cell position. If you find one, dump output into that terminal. This happens because


        var cells = Jupyter.notebook.get_cells();
        var i, nearestCell, checkCellId;
        cellId = undefined;

        for (i = opts.nearestCellPosition + 1; i < cells.length; ++i) {
          nearestCell = cells[i];
          checkCellId = utils.getMetadataCellId(nearestCell.metadata);

          if (terminals.terminalsList.hasOwnProperty(checkCellId)) {
            cellId = checkCellId;
            console.log('Graffiti: We found a subsequent terminal and will write output to cell:', cellId);
            break;
          }
        }

        if (cellId === undefined) {
          return; // we couldn't find a terminal after the position passed in so we're going to give up and not try to write to any terminal.
        } else {
          terminal = terminals.terminalsList[cellId];
        }
      }

      terminal.contents = newContents;
      var madeUpdateToTerminal = false;

      if (terminal !== undefined) {
        var didScroll = false;

        if (!opts.incremental || opts.firstRecord || terminal.lastPosition === undefined) {
          terminal.term.reset();
          var portion = terminals.getContentToFillTerminal(terminal, terminal.contents, opts.position);
          terminal.term.write(portion);
          terminal.lastPosition = opts.position;
          madeUpdateToTerminal = true;
        } else {
          //console.log('setTerminalContents, opts:', opts, 'lastPosition', terminal.lastPosition, 'opts.position', opts.position);
          if (terminal.lastPosition !== opts.position) {
            var newPortion = terminal.contents.substr(terminal.lastPosition, opts.position - terminal.lastPosition); // Replace CR followed by a character NOT a line feed by the non-linefeed char alone. 
            // Sometimes we've gotten this weird situation with terminal recordings and this causes recorded
            // text to write over itself on the same line.

            var newPortionCleaned = newPortion.replace(/([\x0d])([^\x0a])/g, "$2");
            terminal.term.write(newPortionCleaned);
            terminal.lastPosition = opts.position;
            terminal.term.scrollToBottom();
            didScroll = true;
            madeUpdateToTerminal = true;
          }
        } // Scroll to the correct spot if needed


        if (!didScroll) {
          madeUpdateToTerminal = madeUpdateToTerminal || terminals.scrollTerminal(opts);
        }
      }

      return madeUpdateToTerminal;
    },
    clearTerminalsContentsPositions: function clearTerminalsContentsPositions() {
      for (var _i = 0, _Object$keys = Object.keys(terminals.terminalsList); _i < _Object$keys.length; _i++) {
        var cellId = _Object$keys[_i];
        terminals.terminalsList[cellId].lastPosition = undefined;
      }
    },
    focusTerminal: function focusTerminal(cellId) {
      var termRecord = terminals.terminalsList[cellId];

      if (termRecord !== undefined) {
        var cell = utils.findCellByCellId(cellId);
        cell.focus_cell();
        terminals.focusedTerminal = cellId;
        termRecord.term.focus();
      }
    },
    scrollTerminal: function scrollTerminal(opts) {
      var termRecord = terminals.terminalsList[opts.id];

      if (termRecord !== undefined) {
        var term = termRecord.term; // Basically the same functionality as in scrollToLine, see here:
        // https://github.com/xtermjs/xterm.js/blob/c908da351b11d718f8dcda7424baee4bd8211681/src/Terminal.ts#L1302

        var scrollAmount = opts.scrollLine - term._core.buffer.ydisp; //console.log('scrollTerminal: opts.scrollLine', opts.scrollLine, 'ydisp', term._core.buffer.ydisp, 'scrollAmount', scrollAmount);

        if (scrollAmount !== 0) {
          term.scrollLines(scrollAmount);
          return true;
        }
      }

      return false;
    },
    restoreTerminalOutput: function restoreTerminalOutput(cellId) {
      var terminal = terminals.terminalsList[cellId];

      if (terminal !== undefined) {
        if (terminal.contentsBackup !== undefined) {
          if (terminal.contents != terminal.contentsBackup) {
            terminal.contents = terminal.contentsBackup;
            terminal.term.reset();
            terminal.term.write(terminal.contents);
          }
        }
      }
    },
    saveOrRestoreTerminalOutputs: function saveOrRestoreTerminalOutputs(action) {
      for (var _i2 = 0, _Object$keys2 = Object.keys(terminals.terminalsList); _i2 < _Object$keys2.length; _i2++) {
        var cellId = _Object$keys2[_i2];

        if (action === 'save') {
          terminals.backupTerminalOutput(cellId);
        } else {
          terminals.restoreTerminalOutput(cellId);
        }
      }
    },
    getTerminalsStates: function getTerminalsStates(markAsFirstRecord) {
      var states = [];

      for (var _i3 = 0, _Object$keys3 = Object.keys(terminals.terminalsList); _i3 < _Object$keys3.length; _i3++) {
        var cellId = _Object$keys3[_i3];
        terminal = terminals.terminalsList[cellId];
        states.push({
          id: cellId,
          scrollLine: terminal.term._core.buffer.ydisp,
          position: terminal.contents.length,
          isFocused: terminals.focusedTerminal === cellId,
          focusedTerminal: terminals.focusedTerminal,
          firstRecord: markAsFirstRecord
        });
      }

      return states;
    },
    getTerminalsContents: function getTerminalsContents() {
      var contents = {};
      var terminal;

      for (var _i4 = 0, _Object$keys4 = Object.keys(terminals.terminalsList); _i4 < _Object$keys4.length; _i4++) {
        var cellId = _Object$keys4[_i4];
        terminal = terminals.terminalsList[cellId];
        contents[cellId] = terminal.contents;
      }

      return contents;
    },
    refitOneTerminal: function refitOneTerminal(terminal, cellId) {
      var refitTerminal = function refitTerminal(tryNumber) {
        console.log('Graffiti: Attempting to fit terminal:', cellId, ', attempt number', tryNumber);
        terminal.term.fit();
        terminal.socket.send(JSON.stringify(["set_size", terminal.term.rows, terminal.term.cols, window.innerHeight, window.innerWidth]));
        console.log('Graffiti: fit terminal succeeded for:', cellId);
      };

      console.log('Graffiti: Running fit on term', terminal.term.rows, terminal.term.cols);
      var refitAttempts = 0;
      var refitInterval = setInterval(function () {
        try {
          ++refitAttempts;
          refitTerminal(refitAttempts);
          clearInterval(refitInterval);
        } catch (ex) {
          if (refitAttempts > terminals.maxRefitAttempts) {
            console.log('Graffiti: unable to call fit() after', refitAttempts, 'tries, giving up.');
            clearInterval(refitInterval);
          } else {
            console.log('Graffiti: unable to call fit(), trying again in', terminals.fitRetryTime, 'seconds.');
          }
        }
      }, terminals.fitRetryTime);
    },
    refitAllTerminals: function refitAllTerminals() {
      var terminal;
      var term;

      for (var _i5 = 0, _Object$keys5 = Object.keys(terminals.terminalsList); _i5 < _Object$keys5.length; _i5++) {
        var cellId = _Object$keys5[_i5];
        terminal = terminals.terminalsList[cellId];
        term = terminal.term;
        terminals.refitOneTerminal(terminal, cellId);
      }
    },
    isTerminalCell: function isTerminalCell(cellId) {
      return terminals.terminalsList[cellId] !== undefined;
    },
    runTerminalCommand: function runTerminalCommand(terminalId, command, addCR) {
      // Inject the terminal command into the target terminal (if found).
      if (terminals.terminalsList[terminalId] !== undefined) {
        var term = terminals.terminalsList[terminalId];
        term.send(command);

        if (addCR) {
          term.send("\n");
        }
      }
    },
    init: function init(eventsCallback) {
      terminals.eventsCallback = eventsCallback;
      terminals.renderAllTerminals();
    }
  };
  return terminals;
});