"use strict";

define(['base/js/dialog', 'base/js/events', 'notebook/js/textcell', 'js/LZString.js', 'js/state.js', 'js/utils.js', 'js/audio.js', 'js/storage.js', 'js/sticker.js', 'js/localizer.js', 'js/selectionSerializer.js', 'js/workspace.js', 'js/terminals.js', 'js/batchRunner.js', 'components/marked/lib/marked'], function (dialog, events, textCell, LZString, state, utils, audio, storage, stickerLib, localizer, selectionSerializer, workspace, terminalLib, batchRunner, marked) {
  var Graffiti = function () {
    var _arguments = arguments;
    var graffiti = {
      init: function init() {
        console.log('Graffiti: Main constructor running.');
        utils.loadCss(['jupytergraffiti/css/graffiti.css', 'jupytergraffiti/css/xterm.css']);
        var location = document.location;
        var currentAccessLevel = state.getAccessLevel();
        graffiti.LZString = LZString;
        graffiti.rewindAmt = 1; // seconds

        graffiti.rewindSkipEditAmt = 0.05; // seconds

        graffiti.CMEvents = {};
        graffiti.halfBullseye = 12;
        graffiti.sitePanel = $('#site');
        graffiti.notebookPanel = $('#notebook');
        graffiti.notebookContainer = $('#notebook-container');
        graffiti.notebookContainerPadding = parseInt(graffiti.notebookContainer.css('padding').replace('px', ''));
        graffiti.penColor = 'black';
        graffiti.recordingIntervalMs = 10; // In milliseconds, how frequently we sample the state of things while recording.

        graffiti.playbackIntervalMs = graffiti.recordingIntervalMs; // In milliseconds, loop speed for playback.  Must match recordingIntervalMs.

        graffiti.highlightMarkText = undefined;
        graffiti.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter

        graffiti.cmLineFudge = 8; // buffer between lines

        graffiti.cmLineTipFudge = 6; // buffer between lines for tip display

        graffiti.tipAboveFudge = 14;
        graffiti.tokenRanges = {};
        graffiti.canvases = {
          permanent: {},
          // these canvases persist drawings throughout the lifespan of the recording
          temporary: {} // these canvases get wiped a couple seconds after the person stops drawing

        };
        graffiti.stickers = {
          permanent: {},
          // these stickers persist throughout the lifespan of the recording
          temporary: {} // these stickers fade out a couple seconds after the person finishes placing them

        };
        graffiti.lastUpdateControlsTime = utils.getNow();
        graffiti.notificationMsgs = {};
        graffiti.panelFadeTime = 350;
        graffiti.windowSizeCheckInterval = 250; // ms

        graffiti.windowSizeChangeTime = undefined;
        graffiti.skipKeyDownTimer = undefined;
        graffiti.skipKeyCode = 18; // key code of whatever key starts a skip (alt/option)

        graffiti.scrollNudgeSmoothIncrements = 6;
        graffiti.scrollNudgeQuickIncrements = 4;
        graffiti.scrollNudge = undefined;
        graffiti.penColors = {
          'black': '000000',
          'white': 'ffffff',
          'red': 'ff0000',
          'green': '00ff00',
          'blue': '0000ff',
          'yellow': 'ffff00',
          'orange': 'ff9900',
          'purple': '8a2be2',
          'brown': '996600'
        };
        graffiti.minimumStickerSize = 20; // pixels

        graffiti.minimumStickerSizeWithBuffer = graffiti.minimumStickerSize + 10;
        graffiti.previousActiveTakeId = undefined;
        graffiti.forcedGraffitiTooltipRefresh = false;
        graffiti.MarkdownCell = textCell.MarkdownCell;

        if (currentAccessLevel === 'create') {
          storage.ensureNotebookGetsGraffitiId();
          storage.ensureNotebookGetsFirstAuthorId();
        } // Init language strings


        localizer.init().then(function () {
          // Set up the button that activates Graffiti on new notebooks and controls visibility of the control panel if the notebook has already been graffiti-ized.
          graffiti.updateSetupButton();

          if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) {
            // do not try to load the manifest if this notebook has not yet been graffiti-ized.
            storage.loadManifest(currentAccessLevel).then(function () {
              utils.createApiSymlink();
              graffiti.initInteractivity();
            })["catch"](function (ex) {
              console.log('Graffiti: Not setting up Graffiti because this notebook has never had any authoring done yet (no recordingId).');
              console.log(ex);
            });
          }
        });
      },
      provideAPIKeyExamples: function provideAPIKeyExamples() {
        var recorderApiKeyCell = Jupyter.notebook.insert_cell_below('code');
        var invocationLine = "# Graffiti Id: " + graffiti.recordingAPIKey + "\n\n" + "# --------------------------------------\n" + "import jupytergraffiti\n" + "# jupytergraffiti.api.play_recording('" + graffiti.recordingAPIKey + "')\n" + "# jupytergraffiti.api.play_recording_with_prompt('" + graffiti.recordingAPIKey + "', '![idea](../images/lightbulb_small.jpg) Click **here** to learn more.')\n" + "# jupytergraffiti.api.stop_playback()\n" + "# jupytergraffiti.api.remove_unused_takes('" + graffiti.recordingAPIKey + "')\n" + "# jupytergraffiti.api.remove_all_unused_takes()\n";
        recorderApiKeyCell.set_text(invocationLine);
        Jupyter.notebook.select_next();
        recorderApiKeyCell.code_mirror.focus();
      },
      changeDataDir: function changeDataDir() {
        var rawConfirmationMarkdown = '<button id="graffiti-confirm-datapath">Confirm</button>';
        var confirmationCell = Jupyter.notebook.insert_cell_at_index('markdown', 0);
        Jupyter.notebook.select(0);
        confirmationCell.set_text(rawConfirmationMarkdown);
        var pathCell = Jupyter.notebook.insert_cell_at_index('code', 0);
        var oldDataDir = utils.getNotebookGraffitiConfigEntry('dataDir');

        if (oldDataDir === undefined) {
          oldDataDir = 'jupytergraffiti_data/';
        }

        pathCell.set_text(oldDataDir);
        var instructionsCell = Jupyter.notebook.insert_cell_at_index('markdown', 0);
        instructionsCell.select();
        var instructions = localizer.getString('DATA_PATH_INSTRUCTIONS');
        Jupyter.notebook.select(0);
        instructionsCell.set_text(instructions);
        setTimeout(function () {
          instructionsCell.render();
          confirmationCell.render();
          pathCell.focus_cell();
          graffiti.confirmDataPathButton = $('#graffiti-confirm-datapath');
          graffiti.confirmDataPathButton.bind('click', function () {
            var newPathAccepted = false;
            var newDataDir = $.trim(pathCell.get_text());

            if (newDataDir.length > 0) {
              if (newDataDir[newDataDir.length - 1] !== '/') {
                newDataDir = newDataDir + '/';
              }

              if (newDataDir !== oldDataDir) {
                utils.setNotebookGraffitiConfigEntry('dataDir', newDataDir);
                newPathAccepted = true;
              }
            }

            graffiti.confirmDataPathButton.unbind('click');
            Jupyter.notebook.delete_cell(0);
            Jupyter.notebook.delete_cell(0);
            Jupyter.notebook.delete_cell(0);
            utils.queueSaveNotebookCallback(function () {
              if (newPathAccepted) {
                var changeModal = dialog.modal({
                  title: localizer.getString('ACCEPTED_DATADIR_HEADER'),
                  body: localizer.getString('ACCEPTED_DATADIR_BODY'),
                  sanitize: false,
                  buttons: {
                    'OK': {
                      click: function click(e) {
                        console.log('Graffiti: Path change acknowledged.');
                      }
                    }
                  }
                });
              }
            });
            utils.saveNotebookDebounced();
          });
        }, 10);
      },
      bindControlPanelCallbacks: function bindControlPanelCallbacks(parent, callbacks) {
        if (callbacks !== undefined) {
          var cb, id, elem;
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = callbacks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              cb = _step.value;
              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = cb.ids[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  id = _step2.value;
                  parent.find('#' + id).on(cb.event, cb.fn);
                }
              } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
                    _iterator2["return"]();
                  }
                } finally {
                  if (_didIteratorError2) {
                    throw _iteratorError2;
                  }
                }
              }
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
        }
      },
      setNotifier: function setNotifier(notificationMsg, callbacks) {
        var notifierPanel = graffiti.controlPanelIds['graffiti-notifier'];
        notifierPanel.show().children().hide();

        if (!graffiti.notificationMsgs.hasOwnProperty(notificationMsg)) {
          var notificationId = 'graffiti-notification-' + utils.generateUniqueId();
          var notificationHtml = $('<div id="' + notificationId + '">' + notificationMsg + '</div>');
          notificationHtml.appendTo(notifierPanel);
          var newNotificationDiv = notifierPanel.find('#' + notificationId);
          graffiti.notificationMsgs[notificationMsg] = newNotificationDiv;
          graffiti.bindControlPanelCallbacks(newNotificationDiv, callbacks);
        }

        graffiti.notificationMsgs[notificationMsg].show();
      },
      setJupyterMenuHint: function setJupyterMenuHint(hint, classOverride) {
        if (graffiti.jupyterMenuHint === undefined) {
          var jupyterMainToolbar = $('#maintoolbar-container');
          var menuHintDiv = $('<span class="graffiti-jupyter-menu-hint-shell"></span>');
          graffiti.jupyterMenuHint = menuHintDiv.appendTo(jupyterMainToolbar);
        }

        var override = classOverride !== undefined ? classOverride : '';
        var hintHtml = '<span class="graffiti-jupyter-menu-hint ' + override + '">' + hint + '</span>';
        graffiti.jupyterMenuHint.html(hintHtml).show();
      },
      clearJupyterMenuHint: function clearJupyterMenuHint() {
        if (graffiti.jupyterMenuHint !== undefined) {
          graffiti.jupyterMenuHint.hide();
        }
      },
      cleanUpButtonBorders: function cleanUpButtonBorders() {
        $('.graffiti-highlight:has(button)').css({
          border: "none"
        }); // remove the borders on graffiti buttons
      },
      startPanelDragging: function startPanelDragging(e) {
        //console.log('Graffiti: dragging control panel');
        var controlPanelPosition = graffiti.outerControlPanel.position();
        var pointerPosition = state.getPointerPosition();
        state.setControlPanelDragging(true);
        state.setControlPanelDragOffset({
          left: pointerPosition.x - controlPanelPosition.left,
          top: pointerPosition.y - controlPanelPosition.top
        });
        e.preventDefault();
        e.stopPropagation();
      },
      // Skips functionality
      toggleRecordingSkip: function toggleRecordingSkip() {
        if (state.getActivity() !== 'recording') {
          state.stopSkipping();
          return;
        }

        state.toggleSkipping();

        if (state.isSkipping()) {
          $('#graffiti-btn-end-recording').html(localizer.getString('RECORDING_HINT_4'));
        } else {
          $('#graffiti-btn-end-recording').html(localizer.getString('RECORDING_HINT_1'));
        }
      },
      // This function is sort of a hack. It creates a new Graffiti to be placed in this cell, wrapping the markdown in it.
      // It repeats some of the functionality of finishGraffiti() without UX interactions, which is unfortunate. Refactor really needed.
      createGraffitizedMarkdown: function createGraffitizedMarkdown(cell, markdown, tooltipCommands, tooltipDirectives) {
        var recordingKey = utils.generateUniqueId();
        var cellId = utils.getMetadataCellId(cell.metadata);
        var recordingRecord = $.extend(true, {
          cellId: cellId,
          cellType: 'markdown',
          createDate: utils.getNow(),
          inProgress: false,
          tokens: $.extend({}, graffiti.selectedTokens.tokens),
          range: $.extend({}, graffiti.selectedTokens.range),
          allTokensString: graffiti.selectedTokens.allTokensString,
          markdown: tooltipDirectives.join("\n") + "\n",
          authorId: state.getAuthorId(),
          authorType: state.getAuthorType(),
          activeTakeId: undefined,
          // this will be replaced with an id for the first movie recording made
          takes: {},
          hasMovie: true // this is set to true but the non-existent will be ignored because this will run a terminal command

        }, tooltipCommands);
        state.setSingleManifestRecording(cellId, recordingKey, recordingRecord);
        storage.storeManifest();
        var spanOpenTag = '<span class="graffiti-highlight graffiti-' + cellId + '-' + recordingKey + '"><i></i>';
        var graffizedContents = spanOpenTag + markdown + '</span>';
        return {
          recordingKey: recordingKey,
          markdown: graffizedContents
        };
      },
      // Create a button with a graffiti that doesn't do anything, but is ready to attach a recording to. This is merely to help
      // authors who don't know much html create buttons more easily.
      createGraffitiButtonAboveSelectedCell: function createGraffitiButtonAboveSelectedCell(opts) {
        var selectedCellIndex = Jupyter.notebook.get_selected_index();
        var selectedCell = Jupyter.notebook.get_selected_cell();
        var buttonCell = Jupyter.notebook.insert_cell_above('markdown', selectedCellIndex);
        var buttonCellId = utils.getMetadataCellId(buttonCell.metadata);
        var buttonCellIndex = utils.findCellIndexByCellId(buttonCellId);
        Jupyter.notebook.select(buttonCellIndex); // critical step, otherwise, the cell will not render correctly

        var cm = buttonCell.code_mirror;
        cm.execCommand('selectAll');
        var params = {
          cell: buttonCell,
          clear: true
        };
        graffiti.refreshGraffitiHighlights(params);
        graffiti.selectedTokens = utils.findSelectionTokens(buttonCell, graffiti.tokenRanges, state);
        var buttonLabel = 'Graffiti Sample Button (edit me)';
        var tooltipCommands = {
          autoPlay: 'never',
          playOnClick: true,
          hideTooltip: true,
          narratorName: undefined,
          narratorPicture: undefined,
          stickerImageUrl: undefined,
          silenceWarnings: true
        };
        var tooltipDirectives = ['%%play_on_click', '%%hide_tooltip', '%%button_name No Movie Here Yet', 'Edit this markdown cell to customize the Graffiti for this button, and to record a new movie.<br><br>' + '_(NB: The default movie that was created with this button is a *placeholder* and it will *not* play.)_'];

        if (opts !== undefined) {
          if (opts.tooltipCommands !== undefined) {
            $.extend(tooltipCommands, opts.tooltipCommands);

            if (opts.tooltipCommands.hasOwnProperty('labelSwaps')) {
              buttonLabel = opts.tooltipCommands.labelSwaps[0];
            }
          }

          if (opts.tooltipDirectives !== undefined) {
            _.uniq($.merge(tooltipDirectives, opts.tooltipDirectives));
          }
        }

        var rawButtonMarkdown = '<button>' + buttonLabel + '</button>';
        var graffitizedData = graffiti.createGraffitizedMarkdown(buttonCell, rawButtonMarkdown, tooltipCommands, tooltipDirectives);
        buttonCell.set_text(graffitizedData.markdown);
        buttonCell.render();
        var finalCell = buttonCell;

        if (selectedCell.cell_type === 'markdown') {
          var selectedCellContents = selectedCell.get_text();
          var tagsRe = utils.createGraffitiTagRegex();
          match = tagsRe.exec(selectedCellContents);

          if (match !== null) {
            // For author's convenience,  move this button to the currently selected cell
            // (because it had one or more buttons already), 
            // and delete the cell we added to create the button.
            var newContents = selectedCellContents + "\n" + graffitizedData.markdown;
            selectedCell.set_text(newContents);
            Jupyter.notebook.delete_cell(buttonCellIndex);
            utils.rerenderMarkdownCell(selectedCell);
            finalCell = selectedCell;
          }
        }

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        return finalCell;
      },
      createTerminalSuiteAboveSelectedCell: function createTerminalSuiteAboveSelectedCell() {
        graffiti.setJupyterMenuHint(localizer.getString('INSERT_TERMINAL_SUITE_STATUS'));
        var terminalSuite = {};
        var selectedCellIndex = Jupyter.notebook.get_selected_index();
        var codeCell = Jupyter.notebook.insert_cell_above('code', selectedCellIndex);
        var codeCommentString = utils.getCodeCommentString();
        codeCell.set_text(codeCommentString + "\n" + codeCommentString + ' ' + "Paste code here. It will execute the graffiti associated with the button when shift-enter is pressed.\n" + codeCommentString + "\n");
        terminalSuite.codeCellId = utils.getMetadataCellId(codeCell.metadata);
        var terminalCell = terminalLib.createTerminalCellAboveSelectedCell(selectedCellIndex + 1);
        terminalSuite.terminalCellId = terminalCell.term.id; // initially the term id is the same as the cellId of the cell it lives in.

        var buttonCell = Jupyter.notebook.insert_cell_below('markdown', selectedCellIndex + 1);
        var buttonCellId = utils.getMetadataCellId(buttonCell.metadata);
        var buttonCellIndex = utils.findCellIndexByCellId(buttonCellId);
        Jupyter.notebook.select(buttonCellIndex); // critical step, otherwise, the cell will not render correctly

        var cm = buttonCell.code_mirror;
        cm.execCommand('selectAll');
        var params = {
          cell: buttonCell,
          clear: true
        };
        graffiti.refreshGraffitiHighlights(params);
        graffiti.selectedTokens = utils.findSelectionTokens(buttonCell, graffiti.tokenRanges, state);
        var tooltipCommands = {
          autoPlay: 'never',
          playOnClick: true,
          hideTooltip: true,
          narratorName: undefined,
          narratorPicture: undefined,
          stickerImageUrl: undefined,
          saveToFile: [{
            cellId: terminalSuite.codeCellId,
            path: './graffiti_sample.txt'
          }],
          terminalCommand: {
            terminalId: terminalSuite.terminalCellId,
            command: 'cat ./graffiti_sample.txt'
          }
        };
        var tooltipDirectives = ['%%play_on_click', '%%hide_tooltip', '%%save_to_file' + ' ' + terminalSuite.codeCellId + ' "' + tooltipCommands.saveToFile[0].path + '"', '%%terminal_command' + ' ' + terminalSuite.terminalCellId + ' "' + tooltipCommands.terminalCommand.command + '"'];
        var rawButtonMarkdown = '<button>Run Code</button>';
        var graffitizedData = graffiti.createGraffitizedMarkdown(buttonCell, rawButtonMarkdown, tooltipCommands, tooltipDirectives);
        buttonCell.set_text(graffitizedData.markdown);
        buttonCell.render();
        terminalSuite.buttonCellId = utils.getMetadataCellId(buttonCell.metadata); // Wire up the code cell to execute the button graffiti when shift-enter/ctrl-enter is pressed in it.

        var targetGraffitiId = utils.composeGraffitiId(terminalSuite.buttonCellId, graffitizedData.recordingKey);
        utils.setCellGraffitiConfigEntry(codeCell, 'executeCellViaGraffiti', targetGraffitiId);
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        graffiti.clearJupyterMenuHint(); // Save the contents of the code cell to its file even before any edits have happened, so any terminal commands in the button will find any
        // file being referred to.

        state.refreshCellIdToGraffitiMap();
        graffiti.executeSaveToFileDirectives(terminalSuite.codeCellId);
        return terminalSuite;
      },
      setupOneControlPanel: function setupOneControlPanel(elemId, elemHtml, callbacks) {
        if (graffiti.controlPanelIds === undefined) {
          graffiti.controlPanelIds = {};
        }

        var fullHtml = '<div class="graffiti-control-panel" id="' + elemId + '">' + elemHtml + '</div>';
        var elem = $(fullHtml);
        elem.appendTo(graffiti.controlPanelsShell);
        graffiti.controlPanelIds[elemId] = graffiti.controlPanelsShell.find('#' + elemId);
        graffiti.bindControlPanelCallbacks(graffiti.controlPanelIds[elemId], callbacks);
      },
      setupPlaybackCursor: function setupPlaybackCursor() {
        var cursorSize = 36;
        var iconConfiguration = {
          dimensions: {
            x: 0,
            y: 0,
            width: cursorSize,
            height: cursorSize
          },
          color: 'black',
          innerRingsColor: '#eee',
          strokeWidth: 2,
          strokeOpacity: 1,
          fillOpacity: 0
        };
        var bullsEye = stickerLib.makeBullsEye(iconConfiguration);
        var graffitiCursor = $('<div id="graffiti-cursor" name="cursor" class="graffiti-cursor">' + '  <div id="graffiti-cursor-normal-cells">' + bullsEye + '</div>' + '  <div id="graffiti-cursor-terminal-cells"></div>' + '</div>');
        graffitiCursor.appendTo(header);
      },
      setupControlPanels: function setupControlPanels() {
        var previousPlayState;

        if ($('#graffiti-outer-control-panel').length == 0) {
          var outerControlPanel = $('<div id="graffiti-outer-control-panel">' + '  <div id="graffiti-inner-control-panel">' + '    <div class="graffiti-small-dot-pattern" id="graffiti-drag-handle">&nbsp;&nbsp;</div>' + '    <div id="graffiti-control-panels-shell"></div>' + '  </div>' + '</div>'); //const header = $('#header');

          outerControlPanel.appendTo($('body'));
          graffiti.setupPlaybackCursor();
        }

        graffiti.graffitiCursorShell = $('#graffiti-cursor');
        graffiti.graffitiNormalCursor = $('#graffiti-cursor-normal-cells');
        graffiti.graffitiTerminalCursor = $('#graffiti-cursor-terminal-cells');
        graffiti.outerControlPanel = $('#graffiti-outer-control-panel');
        graffiti.outerControlPanel.hide();
        graffiti.controlPanelsShell = $('#graffiti-control-panels-shell');
        $('body').on('mouseup', function (e) {
          if (state.getControlPanelDragging()) {
            console.log('Graffiti: no longer dragging control panel');
            state.setControlPanelDragging(false);
            e.preventDefault();
            e.stopPropagation();
          }
        });
        var logoText = 'graffiti';
        graffiti.setupOneControlPanel('graffiti-control-panel-title', '<div>' + stickerLib.makeSmallUdacityIcon({
          width: 20,
          height: 20
        }) + '</div><div id="graffiti-logo-text">' + logoText + '</div>');
        var dragHandle = $('#graffiti-inner-control-panel');
        dragHandle.on('mousedown', function (e) {
          var target = $(e.target);

          if (target.attr('id') !== 'graffiti-recorder-range') {
            graffiti.startPanelDragging(e);
          }
        });

        graffiti.windowResizeHandler = function (opts) {
          //console.log('Graffiti: windowResizeHandler');
          if (opts === undefined || opts !== undefined && opts.force) {
            graffiti.resizeCanvases();
            terminalLib.refitAllTerminals();

            if (graffiti.outerControlPanel.is(':visible')) {
              graffiti.placeControlPanel({
                keepInView: true
              });
              state.setControlPanelDragging(false); // Need to redraw all current stickers here if playing

              var activity = state.getActivity();

              if (activity === 'playing' || activity === 'playbackPaused') {
                graffiti.wipeAllStickerDomCanvases();
                graffiti.redrawAllDrawings();
              }
            }

            graffiti.refreshAllGraffitiSideMarkers();
          }
        }; // Debounce is no longer needed as we're handling resizes of the notebook container with setTimeout calls, below this.
        //const windowResizeDebounced = _.debounce(graffiti.windowResizeHandler, 100);
        // Watch the notebook container width. If it changes, we will need to handle a resize to redraw many elements.


        graffiti.notebookContainerWidth = graffiti.notebookContainer.width();

        graffiti.performWindowResizeCheck = function () {
          var newWidth = graffiti.notebookContainer.width();
          var newHeight = $(window).height();

          if (newWidth !== graffiti.notebookContainerWidth || newHeight !== graffiti.notebookContainerHeight) {
            graffiti.notebookContainerWidth = newWidth;
            graffiti.notebookContainerHeight = newHeight;
            var now = utils.getNow(); // Sort of simple debounce technique

            if (graffiti.windowSizeChangeTime === undefined) {
              graffiti.windowResizeHandler();
              graffiti.windowSizeChangeTime = now;
            } else if (now - graffiti.windowSizeChangeTime > 100) {
              //  try not to resize more frequently than every 100ms
              graffiti.windowResizeHandler();
              graffiti.windowSizeChangeTime = now;
            }
          }

          setTimeout(graffiti.performWindowResizeCheck, graffiti.windowSizeCheckInterval);
        };

        setTimeout(graffiti.performWindowResizeCheck, graffiti.windowSizeCheckInterval);
        var iconConfiguration = {
          dimensions: {
            x: 0,
            y: 0,
            width: 8,
            height: 8
          },
          color: 'black',
          strokeWidth: 1,
          fillOpacity: 0
        };
        var settingsIcon = stickerLib.makeSettingsIcon(iconConfiguration);
        var iconSize = 22;
        var iconColor = '#666';
        var iconStrokeWidth = 1;
        var iconFatStrokeWidth = 2;
        var iconMargin = 6;
        var smallIconMargin = 2;
        var iconDimensions = {
          x: iconMargin,
          y: iconMargin,
          width: iconSize - iconMargin,
          height: iconSize - iconMargin
        };
        var largeIconDimensions = {
          x: smallIconMargin,
          y: smallIconMargin,
          width: iconSize + smallIconMargin,
          height: iconSize + smallIconMargin
        };
        var defaultIconConfiguration = {
          dimensions: iconDimensions,
          color: iconColor,
          iconUsage: true,
          strokeWidth: iconStrokeWidth,
          fillOpacity: 0
        };
        var solidIconConfiguration = $.extend({}, defaultIconConfiguration, {
          fillOpacity: 1
        });
        var solidFatIconConfiguration = $.extend({}, true, solidIconConfiguration, {
          strokeWidth: iconFatStrokeWidth
        });
        var largeIconConfiguration = $.extend({}, true, defaultIconConfiguration, {
          buffer: 1,
          dimensions: largeIconDimensions
        });
        var roundRectConfiguration = $.extend({}, true, largeIconConfiguration, {
          rx: 6,
          ry: 6
        });
        var bullsEyeConfiguration = $.extend({}, true, largeIconConfiguration, {
          innnerRingsColor: '#000'
        });
        graffiti.setupOneControlPanel('graffiti-record-controls', '  <button class="btn btn-default" id="graffiti-create-btn" title="' + localizer.getString('CREATE_1') + '">' + '<i class="fa fa-edit"></i>&nbsp; <span>' + localizer.getString('CREATE_1') + '</span></button>' + '  <button class="btn btn-default" id="graffiti-edit-btn" title="' + localizer.getString('EDIT_TOOLTIP') + '">' + '  <span style="position:absolute;margin-top:4px;margin-left:2px;">' + settingsIcon + '</span> ' + '  <span style="padding-left:16px;">' + localizer.getString('EDIT') + '</span></button>' + '  <button class="btn btn-default" id="graffiti-begin-recording-btn" title="' + localizer.getString('RECORD_MOVIE') + '">' + '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>' + localizer.getString('RECORD') + '</span></button>' + '  <button class="btn btn-default" id="graffiti-begin-rerecording-btn" title="' + localizer.getString('RERECORD_MOVIE') + '">' + '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>' + localizer.getString('RERECORD') + '</span></button>' + '  <button class="btn btn-default" id="graffiti-remove-btn" title="' + localizer.getString('REMOVE_GRAFFITI') + '">' + '<i class="fa fa-trash"></i></button>', [{
          ids: ['graffiti-create-btn', 'graffiti-edit-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.editGraffiti();
          }
        }, {
          ids: ['graffiti-begin-recording-btn', 'graffiti-begin-rerecording-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.beginMovieRecordingProcess();
          }
        }, {
          ids: ['graffiti-remove-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.removeGraffitiWithPrompt();
          }
        }]);
        graffiti.setupOneControlPanel('graffiti-finish-edit-controls', '<button class="btn btn-default" id="finish-graffiti-btn" title="' + localizer.getString('SAVE_GRAFFITI') + '">' + localizer.getString('SAVE_GRAFFITI') + '</button>', [{
          ids: ['finish-graffiti-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.finishGraffiti(true);
          }
        }]);
        graffiti.setupOneControlPanel('graffiti-start-recording-controls', '<button class="btn btn-default" id="btn-start-recording" title="' + localizer.getString('START_RECORDING') + '">' + '<i class="fa fa-pause recorder-start-button"></i>&nbsp;' + localizer.getString('START_RECORDING') + '</button>', [{
          ids: ['btn-start-recording', 'btn-restart-recording'],
          event: 'click',
          fn: function fn(e) {
            graffiti.finishGraffiti(true);
          }
        }]);
        graffiti.setupOneControlPanel('graffiti-recording-controls', '<div id="graffiti-recording-button-help-shell">' + '  <div id="graffiti-btn-end-recording" class="graffiti-recording-button-help">' + localizer.getString('RECORDING_HINT_1') + '  </div>' + '  <div class="graffiti-recording-button-help">' + '    <div>' + localizer.getString('RECORDING_HINT_2') + '</div>' + '    <div>' + localizer.getString('RECORDING_HINT_3') + '</div>' + '  </div>' + '</div>' + '<div id="graffiti-recording-status">' + '  <div id="graffiti-recording-flash-icon"></div>' + '  <div id="graffiti-time-display-recording"></div>' + '</div>', [{
          ids: ['graffiti-btn-end-recording'],
          event: 'click',
          fn: function fn(e) {
            graffiti.toggleRecording();
          }
        }]); // controls which recording takes are the activeTake

        graffiti.setupOneControlPanel('graffiti-takes-controls', '<div id="graffiti-takes-controls-outer">' + '  <div id="graffiti-takes-title">' + localizer.getString('TAKES') + ':</div>' + '  <div id="graffiti-takes-list"></div>' + '</div>', [{
          ids: ['graffiti-takes-list'],
          event: 'click',
          fn: function fn(e) {
            var target = $(e.target);
            var choice;

            if (target.attr('id') === 'graffiti-takes-list') {
              choice = target.find('.graffiti-take-item:first');
            } else {
              choice = target;
            }

            if (choice.length > 0) {
              var newTakeId = choice.attr('id');

              var _recordingCellId = choice.attr('recordingCellId');

              var _recordingKey = choice.attr('recordingKey');

              graffiti.updateActiveTakeId(_recordingCellId, _recordingKey, newTakeId);
            }
          }
        }]);
        var runnerOnIcon = stickerLib.makeRunningMan('black');
        var runnerOffIcon = stickerLib.makeRunningMan('white');
        var exitButtonConfiguration = {
          dimensions: {
            x: 4,
            y: 4,
            width: 12,
            height: 12
          },
          color: "rgb(249, 92, 60)",
          iconUsage: false,
          strokeWidth: 1,
          fillOpacity: 1
        };
        var exitButton = stickerLib.makeSimpleX(exitButtonConfiguration);
        graffiti.setupOneControlPanel('graffiti-playback-controls', '<div id="graffiti-narrator-info">' + '  <div id="graffiti-narrator-pic"></div>' + '  <div id="graffiti-narrator-details">' + '    <div>Presenter: </div><div id="graffiti-narrator-name"></div>' + '  </div>' + '</div>' + '<div id="graffiti-playback-buttons">' + '  <button class="btn btn-default btn-play" id="graffiti-play-btn" title="' + localizer.getString('START_PLAYBACK') + '">' + '    <i class="fa fa-play"></i>' + '  </button>' + '  <button class="btn btn-default" id="graffiti-pause-btn" title="' + localizer.getString('PAUSE_PLAYBACK') + '">' + '    <i class="fa fa-pause"></i>' + '  </button>' + '  <div id="graffiti-skip-buttons">' + '    <button class="btn btn-default btn-rewind" id="graffiti-rewind-btn" title="' + localizer.getString('SKIP_BACK') + ' ' + (state.scanningIsOn() ? localizer.getString('TO_PREVIOUS_SENTENCE') : graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')) + '">' + '      <i class="fa fa-backward"></i>' + '    </button>' + '    <button class="btn btn-default btn-forward" id="graffiti-forward-btn" title="' + localizer.getString('SKIP_FORWARD') + ' ' + (state.scanningIsOn() ? localizer.getString('TO_NEXT_SENTENCE') : graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')) + '">' + '      <i class="fa fa-forward"></i>' + '    </button>' + '  </div>' + '  <div id="graffiti-sound-buttons">' + '    <button class="btn btn-default btn-sound-on" id="graffiti-sound-on-btn" title="' + localizer.getString('MUTE') + '">' + '       <i class="fa fa-volume-up"></i>' + '   </button>' + '   <button class="btn btn-default btn-sound-off" id="graffiti-sound-off-btn" title="' + localizer.getString('UNMUTE') + '">' + '     <i class="fa fa-volume-off"></i>' + '   </button>' + '  </div>' + '  <div id="graffiti-rapidplay-buttons">' + '    <button class="btn btn-default btn-rapidplay-on" id="graffiti-rapidplay-on-btn" title="' + localizer.getString('HIGH_SPEED_PLAYBACK') + '">' + runnerOnIcon + '   </button>' + '   <button class="btn btn-default btn-rapidplay-off" id="graffiti-rapidplay-off-btn" title="' + localizer.getString('REGULAR_SPEED_PLAYBACK') + '">' + runnerOffIcon + '   </button>' + '  </div>' + '  <div id="graffiti-exit-button">' + '   <button class="btn btn-default" id="graffiti-exit-playback-btn" title="' + localizer.getString('EXIT_PLAYBACK') + '">' + exitButton + '   </button>' + '  </div>' + '</div>' + '<div id="graffiti-scrub-controls">' + '  <div id="graffiti-playback-range">' + '    <input type="range" min="0" max="1000" value="0" id="graffiti-recorder-range"></input>' + '  </div>' + '  <div id="graffiti-time-display-playback">00:00</div>' + '</div>', [{
          ids: ['graffiti-play-btn', 'graffiti-pause-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.togglePlayback();
          }
        }, {
          ids: ['graffiti-forward-btn', 'graffiti-rewind-btn'],
          event: 'click',
          fn: function fn(e) {
            //console.log('Graffiti: forward-btn/rewind-btn clicked');
            var direction = 1;

            if ($(e.target).attr('id') === 'graffiti-rewind-btn' || $(e.target).hasClass('fa-backward')) {
              direction = -1;
            }

            graffiti.jumpPlayback(direction, graffiti.rewindAmt);
            state.updateUsageStats({
              type: 'userSkips'
            });
          }
        }, {
          ids: ['graffiti-sound-on-btn', 'graffiti-sound-off-btn'],
          event: 'click',
          fn: function fn(e) {
            if (state.getMute()) {
              state.setMute(false);
              graffiti.updateControlPanels();

              if (state.getActivity() === 'playing') {
                audio.startPlayback(state.getTimePlayedSoFar());
              }
            } else {
              state.setMute(true);
              graffiti.updateControlPanels();

              if (state.getActivity() === 'playing') {
                audio.pausePlayback();
              }
            }
          }
        }, {
          ids: ['graffiti-rapidplay-on-btn', 'graffiti-rapidplay-off-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.toggleRapidPlay({
              scan: false
            });
          }
        }, {
          ids: ['graffiti-rapidscan-on-btn', 'graffiti-rapidscan-off-btn'],
          event: 'click',
          fn: function fn(e) {
            graffiti.toggleRapidPlay({
              scan: true
            });
          }
        }, {
          ids: ['graffiti-exit-button'],
          event: 'click',
          fn: function fn(e) {
            var activity = state.getActivity();

            if (activity === 'playing' || activity === 'playbackPaused' || activity === 'scrubbing') {
              graffiti.cancelPlayback();
            }
          }
        }, {
          ids: ['graffiti-recorder-range'],
          event: 'mousedown',
          fn: function fn(e) {
            //console.log('slider:mousedown');
            previousPlayState = state.getActivity();
            graffiti.pausePlayback(); // stop playback if playing when you start to scrub

            graffiti.changeActivity('scrubbing');
          }
        }, {
          ids: ['graffiti-recorder-range'],
          event: 'mouseup',
          fn: function fn(e) {
            //console.log('slider:mouseup')
            graffiti.handleSliderDrag(); // rerun slider drag on mouseup because we may not have gotten the last input event.

            graffiti.changeActivity('playbackPaused');

            if (previousPlayState === 'playing') {
              graffiti.startPlayback();
            }

            graffiti.updateAllGraffitiDisplays();
            state.updateUsageStats({
              type: 'userSkips'
            });
          }
        }, {
          ids: ['graffiti-recorder-range'],
          event: 'input',
          fn: function fn(e) {
            graffiti.handleSliderDragDebounced();
          }
        }]);
        graffiti.setupOneControlPanel('graffiti-notifier', '<div id="graffiti-notifier"></div>'); // These two SVGs come from fontawesome-5.2.0: fas fa-highlighter and fas fa-pen-alt, respectively. However, we can't use them without importing the latest
        // fontawesome and that collides with Jupyter's use of fontawesome.

        graffiti.setupOneControlPanel('graffiti-recording-pen-controls', '<div id="graffiti-recording-pens-shell">' + ' <button class="btn btn-default" id="graffiti-line-pen" title="' + localizer.getString('FREEFORM_PEN_TOOL') + '">' + '<svg class="svg-inline--fa fa-pen-alt fa-w-16" aria-hidden="true" data-prefix="fa" data-icon="pen-alt" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M497.94 74.17l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.75 18.75-49.15 0-67.91zm-246.8-20.53c-15.62-15.62-40.94-15.62-56.56 0L75.8 172.43c-6.25 6.25-6.25 16.38 0 22.62l22.63 22.63c6.25 6.25 16.38 6.25 22.63 0l101.82-101.82 22.63 22.62L93.95 290.03A327.038 327.038 0 0 0 .17 485.11l-.03.23c-1.7 15.28 11.21 28.2 26.49 26.51a327.02 327.02 0 0 0 195.34-93.8l196.79-196.79-82.77-82.77-84.85-84.85z"></path></svg>' + '</button>' + ' <button class="btn btn-default" id="graffiti-highlight-pen" title="' + localizer.getString('HIGHLIGHTER_TOOL') + '">' + '<svg class="svg-inline--fa fa-highlighter fa-w-17" aria-hidden="true" data-prefix="fa" data-icon="highlighter" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 544 512" data-fa-i2svg=""><path fill="currentColor" d="M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z"></path></svg>' + '</button>' + ' <button class="btn btn-default" id="graffiti-eraser-pen" title="' + localizer.getString('ERASER_TOOL') + '">' + '<svg aria-hidden="true" data-prefix="fas" data-icon="eraser" class="svg-inline--fa fa-eraser fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M497.941 273.941c18.745-18.745 18.745-49.137 0-67.882l-160-160c-18.745-18.745-49.136-18.746-67.883 0l-256 256c-18.745 18.745-18.745 49.137 0 67.882l96 96A48.004 48.004 0 0 0 144 480h356c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12H355.883l142.058-142.059zm-302.627-62.627l137.373 137.373L265.373 416H150.628l-80-80 124.686-124.686z"></path></svg>' + '</button>' + '</div>' + '<div id="graffiti-recording-colors-shell">' + Object.keys(graffiti.penColors).map(function (key) {
          return '<div id="graffiti-recording-color-' + key + '" colorVal="' + key + '"></div>';
        }).join('') + '</div>' + '<div id="graffiti-line-style-controls">' + '  <div id="graffiti-temporary-ink" title="' + localizer.getString('USE_DISAPPEARING_INK') + '">' + '   <input type="checkbox" id="graffiti-temporary-ink-control" checked />' + '   <label id="graffiti-temporary-ink-label" for="graffiti-temporary-ink-control">' + localizer.getString('TEMPORARY_INK') + '</label>' + '  </div>' + '  <div id="graffiti-dashed-line" title="' + localizer.getString('USE_DASHED_LINES') + '">' + '   <input type="checkbox" id="graffiti-dashed-line-control" />' + '   <label id="graffiti-dashed-line-label" for="graffiti-dashed-line-control">' + localizer.getString('DASHED_LINES') + '</label>' + '  </div>' + '</div>', [{
          ids: ['graffiti-highlight-pen'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: you picked highlighter tool.');
            graffiti.setGraffitiPenColor('yellow');
            graffiti.toggleGraffitiPen('highlight');
          }
        }, {
          ids: ['graffiti-line-pen'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: you picked line tool.');
            graffiti.toggleGraffitiPen('line');
          }
        }, {
          ids: ['graffiti-eraser-pen'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: you picked eraser tool.');
            graffiti.toggleGraffitiPen('eraser');
            $('#graffiti-temporary-ink-control').attr({
              checked: false
            });
            state.updateDrawingState([{
              change: 'drawingModeActivated',
              data: true
            }, {
              change: 'permanence',
              data: 'permanent'
            }, {
              change: 'penType',
              data: 'eraser'
            }]);
          }
        }, {
          ids: Object.keys(graffiti.penColors).map(function (key) {
            return 'graffiti-recording-color-' + key;
          }),
          event: 'click',
          fn: function fn(e) {
            var target = $(e.target);
            var colorVal = target.attr('colorVal');
            graffiti.setGraffitiPenColor(colorVal); // Turn on the pen/highlighter if you change pen color and not stickering

            var activePenType = state.getDrawingPenAttribute('type');

            if (activePenType !== 'sticker') {
              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type'));
            }
          }
        }, {
          ids: ['graffiti-temporary-ink-control', 'graffiti-temporary-ink-label'],
          event: 'click',
          fn: function fn(e) {
            var permanence = $('#graffiti-temporary-ink-control').is(':checked') ? 'temporary' : 'permanent';
            console.log('Graffiti: You set temporary ink to:', permanence);
            state.updateDrawingState([{
              change: 'permanence',
              data: permanence
            }]); // Turn on the pen/highlighter if you switch temporary ink status and it's not already on, unless stickering

            var activePenType = state.getDrawingPenAttribute('type');

            if (activePenType !== 'sticker') {
              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type'));
            }
          }
        }, {
          ids: ['graffiti-dashed-line-control', 'graffiti-dashed-line-label'],
          event: 'click',
          fn: function fn(e) {
            var dashedLine = $('#graffiti-dashed-line-control').is(':checked') ? 'dashed' : 'solid';
            console.log('Graffiti: You set dashed line to:', dashedLine);
            state.updateDrawingState([{
              change: 'dash',
              data: dashedLine
            }]); // Turn on the pen/highlighter if you switch dashed line status and not stickering

            var activePenType = state.getDrawingPenAttribute('type');

            if (activePenType !== 'sticker') {
              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type'));
            }
          }
        }]);
        var rightTriangle = stickerLib.makeRightTriangle(defaultIconConfiguration);
        var isocelesTriangle = stickerLib.makeIsocelesTriangle(defaultIconConfiguration);
        var rectangle = stickerLib.makeRectangle(largeIconConfiguration);
        var roundRectangle = stickerLib.makeRectangle(roundRectConfiguration);
        var checkMark = stickerLib.makeCheckmark(solidFatIconConfiguration);
        var xMark = stickerLib.makeXmark(solidFatIconConfiguration);
        var ribbon = stickerLib.makeRibbon(solidIconConfiguration);
        var axis = stickerLib.makeAxis(solidIconConfiguration);
        var grid = stickerLib.makeGrid(solidIconConfiguration);
        var bomb = stickerLib.makeBomb(defaultIconConfiguration);
        var trophy = stickerLib.makeTrophy(defaultIconConfiguration);
        var smiley = stickerLib.makeSmiley(solidIconConfiguration);
        var horizontalBrackets = stickerLib.makeHorizontalBrackets(defaultIconConfiguration);
        var verticalBrackets = stickerLib.makeVerticalBrackets(defaultIconConfiguration);
        var ellipse = stickerLib.makeEllipse(largeIconConfiguration);
        var bullsEye = stickerLib.makeBullsEye(bullsEyeConfiguration);
        var pi = stickerLib.makePi(solidIconConfiguration);
        var alpha = stickerLib.makeAlpha(solidIconConfiguration);
        var beta = stickerLib.makeBeta(solidIconConfiguration);
        var sigma = stickerLib.makeSigma(solidIconConfiguration);
        var theta = stickerLib.makeTheta(solidIconConfiguration);
        var angle = stickerLib.makeAngle(defaultIconConfiguration);
        var curlyBraces = stickerLib.makeSymmetricCurlyBraces(solidIconConfiguration);
        var lineWithArrow = stickerLib.makeLine({
          color: 'black',
          dimensions: iconDimensions,
          endpoints: {
            p1: {
              x: -2,
              y: iconSize - 2
            },
            p2: {
              x: iconSize - 2,
              y: -2
            }
          },
          lineStartOffset: {
            x: iconMargin - 2,
            y: iconMargin - 2
          },
          strokeWidth: iconStrokeWidth,
          dashed: 'solid',
          usesArrow: true,
          arrowHeadSize: 10
        });
        var stickersExpando = '<div id="graffiti-stickers-expando" class="graffiti-expando graffiti-expando-closed"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" x="0px" y="0px"><title>triangolo</title><g data-name="Livello 11"><polygon points="50 87.5 6.7 87.5 28.35 50 50 12.5 71.65 50 93.3 87.5 50 87.5"/></g></svg></div>';
        graffiti.setupOneControlPanel('graffiti-stickers-controls', '<div id="graffiti-stickers-shell">' + '  <div id="graffiti-stickers-header">' + stickersExpando + '<div>Stickers <span>(Select, then click & drag)</span></div></div>' + '  <div id="graffiti-stickers-body">' + '    <div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-lineWithArrow" title="Line with arrow at tip">' + lineWithArrow + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-horizontalBrackets" title="Horizontal brackets">' + horizontalBrackets + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-verticalBrackets" title="Vertical brackets">' + verticalBrackets + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-curlyBraces" title="Curly braces">' + curlyBraces + '</div>' + '    </div>' + '    <div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-rectangle" title="Rectangle">' + rectangle + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-roundRectangle" title="Rounded corners rectangle">' + roundRectangle + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-ellipse" title="Ellipse">' + ellipse + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-rightTriangle" title="Right triangle">' + rightTriangle + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-isocelesTriangle" title="Isoceles triangle">' + isocelesTriangle + '</div>' + '    </div>' + '    <div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-checkmark" title="Checkmark">' + checkMark + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-xmark" title="X mark">' + xMark + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-smiley" title="Smiley face">' + smiley + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-bomb" title="Bomb">' + bomb + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-trophy" title="Trophy">' + trophy + '</div>' + '    </div>' + '    <div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-pi" title="Pi symbol">' + pi + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-alpha"  title="Alpha symbol">' + alpha + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-beta" title="Beta symbol">' + beta + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-sigma" title="Sigma symbol">' + sigma + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-theta"  title="Theta symbol">' + theta + '</div>' + '    </div>' + '    <div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-axis" title="X-y axis">' + axis + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-grid" title="Square grid">' + grid + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-angle" title="Angle">' + angle + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-label" title="Text label">' + 'Tt' + '</div>' + '      <div class="graffiti-stickers-button" id="graffiti-sticker-custom" title="Custom sticker">' + 'Cs' + '</div>' + '    </div>' + '  </div>' + '  <div id="graffiti-sticker-style-controls">' + '    <div id="graffiti-sticker-fill">' + '     <input type="checkbox" id="graffiti-sticker-fill-control" />' + '     <label id="graffiti-sticker-fill-control-label" for="graffiti-sticker-fill-control" title="Fill shapes with chosen color">' + localizer.getString('SOLID_FILL') + '</label>' + '    </div>' + '    <div id="graffiti-sticker-hint">' + localizer.getString('SHIFT_KEY_ALIGN') + '</div>' + '  </div>' + '</div>', [{
          ids: ['graffiti-sticker-rightTriangle', 'graffiti-sticker-isocelesTriangle', 'graffiti-sticker-rectangle', 'graffiti-sticker-roundRectangle', 'graffiti-sticker-lineWithArrow', 'graffiti-sticker-checkmark', 'graffiti-sticker-xmark', 'graffiti-sticker-grid', 'graffiti-sticker-angle', 'graffiti-sticker-ribbon', 'graffiti-sticker-alpha', 'graffiti-sticker-beta', 'graffiti-sticker-sigma', 'graffiti-sticker-theta', 'graffiti-sticker-axis', 'graffiti-sticker-bomb', 'graffiti-sticker-trophy', 'graffiti-sticker-smiley', 'graffiti-sticker-horizontalBrackets', 'graffiti-sticker-verticalBrackets', 'graffiti-sticker-curlyBraces', 'graffiti-sticker-ellipse', 'graffiti-sticker-pi', 'graffiti-sticker-label', 'graffiti-sticker-custom'],
          event: 'click',
          fn: function fn(e) {
            var stickerId = $(e.target).attr('id');

            if (stickerId === undefined) {
              stickerId = $(e.target).parents('.graffiti-stickers-button').attr('id');
            }

            var cleanStickerId = stickerId.replace('graffiti-sticker-', '');
            console.log('Graffiti: Sticker chosen:', cleanStickerId);
            graffiti.toggleGraffitiSticker(cleanStickerId);
          }
        }, {
          ids: ['graffiti-stickers-header'],
          event: 'click',
          fn: function fn(e) {
            $('#graffiti-stickers-body,#graffiti-sticker-style-controls').slideToggle(200);

            if ($('#graffiti-stickers-expando').hasClass('graffiti-expando-closed')) {
              $('#graffiti-stickers-expando').removeClass('graffiti-expando-closed').addClass('graffiti-expando-open');
              setTimeout(function () {
                graffiti.windowResizeHandler({
                  force: true
                });
              }, 400);
            } else {
              $('#graffiti-stickers-expando').removeClass('graffiti-expando-open').addClass('graffiti-expando-closed');
            }
          }
        }, {
          ids: ['graffiti-sticker-fill-control', 'graffiti-sticker-fill-control-label'],
          event: 'click',
          fn: function fn(e) {
            state.updateDrawingState([{
              change: 'fillOpacity',
              data: $('#graffiti-sticker-fill-control').is(':checked') ? 1 : 0
            }]);
          }
        }]);
        graffiti.setupOneControlPanel('graffiti-access-api', '<button class="btn btn-default" id="graffiti-access-api-btn" title="' + localizer.getString('SAMPLE_API') + '"></i>&nbsp; <span>' + localizer.getString('SAMPLE_API') + '</span></button>', [{
          ids: ['graffiti-access-api-btn'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: API key is:', graffiti.recordingAPIKey);
            graffiti.provideAPIKeyExamples();
          }
        }]);
        var lockConfigOn = $.extend({}, true, defaultIconConfiguration, {
          color: 'red'
        });
        var lockConfigOff = $.extend({}, true, defaultIconConfiguration, {
          color: 'green'
        });
        var hiddenCellConfiguration = $.extend({}, true, defaultIconConfiguration, {
          color: '#aaa',
          fillOpacity: 1.0
        }); // Build the "extras" panel

        graffiti.setupOneControlPanel('graffiti-terminal-builder', '<div id="graffiti-terminal-builder-header"><div>Extras</div></div>' + '<div id="graffiti-terminal-builder-body">' + '  <div>' + '    <div id="graffiti-insert-terminal-cell" title="' + localizer.getString('INSERT_GRAFFITI_TERMINAL_ALT_TAG') + '">' + stickerLib.makeTerminal({
          width: 25
        }) + '    </div>' + '    <div id="graffiti-insert-btn-cell" title="' + localizer.getString('INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG') + '">' + stickerLib.makeButton({
          width: 27,
          height: 22,
          contents: 'Run'
        }) + '    </div>' + '    <div id="graffiti-insert-terminal-suite" title="' + localizer.getString('INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG') + '">' + '      <div>' + stickerLib.makeTerminal({
          width: 25
        }) + '</div> + ' + '      <div>' + stickerLib.makeButton({
          width: 27,
          height: 22,
          contents: 'Run'
        }) + '</div>' + '    </div>' + '  </div>' + '  <div>' + '    <div class="graffiti-stickers-button" id="graffiti-create-showhide-button" title="' + localizer.getString('CREATE_SHOWHIDE_BUTTON') + '">' + stickerLib.makeHidden(hiddenCellConfiguration) + '    </div>' + '    <div class="graffiti-stickers-button" id="graffiti-toggle-markdown-lock" title="' + localizer.getString('ACTIVATE_LOCK_ALT_TAG') + '">' + '<span id="graffiti-locked-on">' + stickerLib.makeLock(lockConfigOn) + '</span>' + '<span id="graffiti-locked-off">' + stickerLib.makeLock(lockConfigOff) + '</span>' + '    </div>' + '    <div class="graffiti-stickers-button" id="graffiti-change-data-dir-button" title="' + localizer.getString('CHANGE_DATADIR_TAG') + '">' + stickerLib.makeHomeFolderIcon(defaultIconConfiguration) + '    </div>' + '  </div>' + '</div>', [{
          ids: ['graffiti-insert-btn-cell'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: Inserting graffiti button cell');
            var suite = graffiti.createGraffitiButtonAboveSelectedCell();
            utils.saveNotebookDebounced();
          }
        }, {
          ids: ['graffiti-insert-terminal-cell'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: inserting graffiti terminal cell');
            var suite = terminalLib.createTerminalCellAboveSelectedCell();
            utils.saveNotebookDebounced();
          }
        }, {
          ids: ['graffiti-insert-terminal-suite'],
          event: 'click',
          fn: function fn(e) {
            console.log('Graffiti: inserting graffiti terminal suite');
            var suite = graffiti.createTerminalSuiteAboveSelectedCell();
            utils.saveNotebookDebounced();
          }
        }, {
          ids: ['graffiti-toggle-markdown-lock'],
          event: 'click',
          fn: function fn(e) {
            console.log('Toggle markdown lock');
            graffiti.toggleMarkdownLock();
            utils.saveNotebookDebounced();
          }
        }, {
          ids: ['graffiti-create-showhide-button'],
          event: 'click',
          fn: function fn(e) {
            graffiti.createGraffitiButtonAboveSelectedCell({
              tooltipCommands: {
                insertDataFromFile: {
                  cellType: 'code',
                  filePath: './example.txt'
                },
                swappingLabels: true,
                labelSwaps: ['Show Solution', 'Hide Solution'],
                silenceWarnings: true
              },
              tooltipDirectives: ['%%insert_data_from_file code ./example.txt', '%%label_swaps Show Solution|Hide Solution', '%%silence_warnings']
            });
            utils.saveNotebookDebounced();
          }
        }, {
          ids: ['graffiti-change-data-dir-button'],
          event: 'click',
          fn: function fn(e) {
            graffiti.changeDataDir();
          }
        }]);
        graffiti.refreshMarkdownLock();
      },
      setupMarkdownLocks: function setupMarkdownLocks() {
        graffiti.oldUnrender = graffiti.MarkdownCell.prototype.unrender;

        graffiti.MarkdownCell.prototype.unrender = function () {
          // console.log('Unrender fired.');
          var cell = Jupyter.notebook.get_selected_cell();

          if (cell !== undefined) {
            var cellId = utils.getMetadataCellId(cell.metadata);
            var markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');

            if (markdownLocked === true || terminalLib.isTerminalCell(cellId)) {
              console.log('Graffiti: Not unrendering markdown cell, since Graffiti lock in place or is terminal cell.');
            } else {
              console.log('Graffiti: applying old unrender call, cellId', cellId);
              graffiti.oldUnrender.apply(cell, _arguments);
              window.brokeCell = cell;
            }
          }
        };
      },
      refreshMarkdownLock: function refreshMarkdownLock(isLocked) {
        if (isLocked === undefined) {
          var markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
          isLocked = markdownLocked !== undefined && markdownLocked === true ? true : false;
        }

        if (isLocked) {
          $('#graffiti-locked-off').hide();
          $('#graffiti-locked-on').show();
        } else {
          $('#graffiti-locked-off').show();
          $('#graffiti-locked-on').hide();
        }

        return isLocked;
      },
      toggleMarkdownLock: function toggleMarkdownLock() {
        var markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
        var isLocked = markdownLocked === true ? true : false;
        var verb = isLocked ? localizer.getString('UNLOCK_VERB') : localizer.getString('LOCK_VERB');
        var bodyText = isLocked ? localizer.getString('UNLOCK_BODY') : localizer.getString('LOCK_BODY');
        dialog.modal({
          title: verb + ' ' + localizer.getString('LOCK_CONFIRM'),
          body: bodyText,
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: You clicked ok, you want to toggle the lock');
                var markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
                var isLocked = markdownLocked !== undefined && markdownLocked === true ? true : false;
                utils.setNotebookGraffitiConfigEntry('markdownLocked', !isLocked);
                utils.saveNotebookDebounced();
                graffiti.refreshMarkdownLock(!isLocked);
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: you cancelled:', $(e.target).parent());
              }
            }
          }
        });
      },
      setSitePanelScrollTop: function setSitePanelScrollTop(scrollTop) {
        // console.log('Setting sitepanel to scrolltop:', newScrollTop);
        graffiti.sitePanel.scrollTop(scrollTop);
      },
      showControlPanels: function showControlPanels(panels) {
        graffiti.controlPanelsShell.children().hide();
        graffiti.controlPanelIds['graffiti-control-panel-title'].css({
          display: 'flex'
        }); // the title bar is always shown

        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = panels[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            controlPanelId = _step3.value;
            // console.log('Graffiti: showing panel:', controlPanelId);
            graffiti.controlPanelIds[controlPanelId].show();
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
              _iterator3["return"]();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      },
      updateActiveTakeId: function updateActiveTakeId(recordingCellId, recordingKey, activeTakeId) {
        storage.updateSingleManifestRecordingField(recordingCellId, recordingKey, 'activeTakeId', activeTakeId);
        state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
        graffiti.updateTakesPanel(recordingCellId, recordingKey);
      },
      updateTakesPanel: function updateTakesPanel(recordingCellId, recordingKey) {
        var recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
        var activeTakeId = recording.activeTakeId;

        if (activeTakeId === undefined || recording.takes === undefined) {
          return false;
        } //console.log('updateTakesPanel, recordingCellId, recordingKey, recording', recordingCellId, recordingKey, recording);
        //console.log('we got these takes:', recording.takes);


        var renderedTakes = '';

        var sortedRecs = _.sortBy($.map(recording.takes, function (val, key) {
          return $.extend(true, {}, val, {
            key: key
          });
        }), 'createDate'); //console.log('sorted recs are:', sortedRecs, 'from takes', recording.takes);


        var recIndex, recIndexZerobased, createDateFormatted, renderedDate, rec, takeClass;

        for (recIndex = sortedRecs.length; recIndex > 0; --recIndex) {
          recIndexZerobased = recIndex - 1;
          rec = sortedRecs[recIndexZerobased];
          renderedDate = localizer.getString('RECORDED_ON') + ': ' + new Date(rec.createDate);
          takeClass = rec.key === activeTakeId ? 'graffiti-take-selected' : 'graffiti-take-unselected';
          renderedTakes += '<div ' + 'class="' + takeClass + ' graffiti-take-item" ' + 'id="' + rec.key + '" ' + 'recordingCellId="' + recordingCellId + '" ' + 'recordingKey="' + recordingKey + '" ' + 'title="' + renderedDate + '">' + recIndex + '</div>';
        }

        $('#graffiti-takes-list').html(renderedTakes);
        return true;
      },
      updateControlPanels: function updateControlPanels(cm) {
        // When we transition to a new state, control panel tweaks need to be made
        var activity = state.getActivity(); // console.log('Graffiti: updateControlPanels, activity:', activity);

        var accessLevel = state.getAccessLevel();
        var outerControlHidden = graffiti.outerControlPanel.css('display') === 'none';

        if (accessLevel === 'view') {
          if (activity !== 'idle') {
            if (outerControlHidden) {
              //console.trace('fadeIn 1');
              // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
              //graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
              graffiti.outerControlPanel.show();
            }
          } else if (state.getPlayableMovie('tip') === undefined && state.getPlayableMovie('api') === undefined && state.getPlayableMovie('cursorActivity') === undefined || activity !== 'notifying') {
            if (!outerControlHidden) {
              //console.trace('fadeout');
              // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
              //graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);
              graffiti.outerControlPanel.hide();
            }

            return;
          }
        } else {
          if (outerControlHidden) {
            //console.trace('fadeIn 2');
            // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
            //graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
            graffiti.outerControlPanel.show();
          }
        } // These controls will need to be updated in a variety of activities so easiest just to do their updates in all cases.


        if (state.getMute()) {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-on-btn').hide().parent().find('#graffiti-sound-off-btn').show();
        } else {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-off-btn').hide().parent().find('#graffiti-sound-on-btn').show();
        }

        var currentPlaySpeed = state.getCurrentPlaySpeed();
        graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rewind-btn').attr({
          title: localizer.getString('SKIP_BACK') + ' ' + graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')
        });
        graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-forward-btn').attr({
          title: localizer.getString('SKIP_FORWARD') + ' ' + graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')
        });

        switch (currentPlaySpeed) {
          case 'scanActive':
          case 'scanInactive':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-on-btn').hide().parent().find('#graffiti-rapidscan-off-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-off-btn').hide().parent().find('#graffiti-rapidplay-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rewind-btn').attr({
              title: localizer.getString('SKIP_BACK') + ' ' + localizer.getString('TO_PREVIOUS_SENTENCE')
            });
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-forward-btn').attr({
              title: localizer.getString('SKIP_FORWARD') + ' ' + localizer.getString('TO_NEXT_SENTENCE')
            });
            break;

          case 'rapid':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-off-btn').hide().parent().find('#graffiti-rapidscan-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-on-btn').hide().parent().find('#graffiti-rapidplay-off-btn').show();
            break;

          case 'regular':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-off-btn').hide().parent().find('#graffiti-rapidplay-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-off-btn').hide().parent().find('#graffiti-rapidscan-on-btn').show();
            break;
        }

        if ((activity === 'playing' || activity === 'playbackPending' || activity === 'playbackPaused') && !state.getNarratorInfoIsRendered()) {
          var narratorName = state.getNarratorInfo('name');
          var narratorPicture = state.getNarratorInfo('picture');

          if (narratorName !== undefined || narratorPicture !== undefined) {
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').show();

            if (narratorPicture !== undefined) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-pic').html('<img src="' + narratorPicture + '" />');
            }

            if (narratorName !== undefined) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-name').html(narratorName);
            }

            state.setNarratorInfoIsRendered(true);
          } else {
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').hide();
          }
        }

        var visibleControlPanels;

        switch (activity) {
          case 'idle':
            // Check if anchor or head of current selection is inside an existing recording token set. Controls will be different if so.
            var activeCell;

            if (cm === undefined) {
              activeCell = Jupyter.notebook.get_selected_cell();
            } else {
              activeCell = utils.findCellByCodeMirror(cm);
            }

            graffiti.selectedTokens = utils.findSelectionTokens(activeCell, graffiti.tokenRanges, state);
            var selectedTokens = graffiti.selectedTokens; //console.log('Graffiti: selectedTokens:', selectedTokens);

            graffiti.highlightIntersectingGraffitiRange();
            var isMarkdownCell = activeCell.cell_type === 'markdown';

            if (isMarkdownCell && !selectedTokens.isIntersecting) {
              // swap out the CREATE and RECORD strings depending on what type of new Graffiti could possibly be made
              $('#graffiti-create-btn').attr({
                title: localizer.getString('CREATE_2')
              });
              $('#graffiti-create-btn span').text(localizer.getString('CREATE_2'));
            } else {
              $('#graffiti-create-btn').attr({
                title: localizer.getString('CREATE_1')
              });
              $('#graffiti-create-btn span').text(localizer.getString('CREATE_1'));
            }

            if (selectedTokens.noTokensPresent || !isMarkdownCell && selectedTokens.range.selectionStart === selectedTokens.range.selectionEnd && !selectedTokens.isIntersecting || isMarkdownCell && activeCell.rendered) {
              //console.log('Graffiti: no tokens present, or no text selected.');
              visibleControlPanels = ['graffiti-notifier', 'graffiti-terminal-builder']; // hide all control panels if in view only mode and not play mode

              if (isMarkdownCell) {
                if (!activeCell.rendered) {
                  graffiti.setNotifier('<div>' + localizer.getString('SELECT_SOME_TEXT_MARKDOWN') + '</div>');
                } else {
                  graffiti.setNotifier('<div>' + localizer.getString('EDIT_IN_MARKDOWN_CELL') + '</div>');
                }
              } else {
                graffiti.setNotifier('<div>' + localizer.getString('SELECT_SOME_TEXT_PLAIN') + '</div>');
              }
            } else if (accessLevel === 'view') {
              console.log('Graffiti: view only');
              visibleControlPanels = ['graffiti-playback-controls']; // hide all control panels if in view only mode and not play mode
            } else {
              visibleControlPanels = ['graffiti-record-controls'];
              graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-begin-recording-btn').hide().parent().find('#graffiti-begin-rerecording-btn').hide().parent().find('#graffiti-remove-btn').hide();
              graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-create-btn').show().parent().find('#graffiti-edit-btn').hide();

              if (selectedTokens.isIntersecting) {
                // console.log('Graffiti: updating recording controls');
                graffiti.highlightIntersectingGraffitiRange();
                graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-create-btn').hide().parent().find('#graffiti-edit-btn').show().parent().find('#graffiti-begin-recording-btn').show().parent().find('#graffiti-remove-btn').show(); //console.log('selectedTokens:', selectedTokens);

                state.clearPlayableMovie('cursorActivity');

                if (selectedTokens.hasMovie) {
                  // Give priority to the tag cellId, not the id of the cell where the graffiti is found currently, when tracking down the recording.
                  var _recordingCellId2 = utils.extractRecordingCellId(selectedTokens);

                  var _recordingKey2 = selectedTokens.recordingKey;
                  state.setPlayableMovie('cursorActivity', _recordingCellId2, _recordingKey2);
                  graffiti.recordingAPIKey = utils.composeGraffitiId(_recordingCellId2, _recordingKey2);
                  visibleControlPanels.push('graffiti-access-api');
                  visibleControlPanels.push('graffiti-notifier');

                  if (graffiti.updateTakesPanel(_recordingCellId2, _recordingKey2)) {
                    visibleControlPanels.push('graffiti-takes-controls');
                    graffiti.setNotifier('<div>' + localizer.getString('YOU_CAN_PLAY_VIA_TOOLTIP') + '</div>');
                  } else {
                    graffiti.setNotifier('<div>' + localizer.getString('NO_MOVIE_RECORDED_YET') + '</div>');
                  } //console.log('this recording has a movie');


                  graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-begin-recording-btn').hide().parent().find('#graffiti-begin-rerecording-btn').show(); // This "play" link is not reliable because its info is only updated by mousing over tooltips, yet you may be editing
                  // a graffiti that you did not show the tooltip on, making it play the wrong movie. Therefore we instruct users to use the tooltip to play the movie.

                  /*
                     graffiti.setNotifier('<div>You can <span class="graffiti-notifier-link" id="graffiti-idle-play-link">play</span> this movie any time.</div>',
                     [
                     {
                     ids: ['graffiti-idle-play-link'],
                     event: 'click',
                     fn: (e) => {
                     state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
                     graffiti.loadAndPlayMovie('cursorActivity');
                     }
                     },
                     ]);
                   */
                }
              }
            }

            graffiti.showControlPanels(visibleControlPanels);
            break;

          case 'playbackPending':
            graffiti.setNotifier('<div>' + localizer.getString('LOADING') + '</div>');
            visibleControlPanels = ['graffiti-notifier'];
            graffiti.showControlPanels(visibleControlPanels);
            break;

          case 'playing':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-play-btn').hide().parent().find('#graffiti-pause-btn').show();
            visibleControlPanels = ['graffiti-playback-controls'];
            graffiti.showControlPanels(visibleControlPanels);
            break;

          case 'playbackPaused':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-pause-btn').hide().parent().find('#graffiti-play-btn').show();
            visibleControlPanels = ['graffiti-playback-controls'];
            graffiti.showControlPanels(visibleControlPanels);
            break;

          case 'graffiting':
            graffiti.showControlPanels(['graffiti-finish-edit-controls']);
            graffiti.setNotifier('<div>' + localizer.getString('ENTER_AND_SAVE') + '</div>' + '<div>' + localizer.getString('CANCEL_CHANGES_1') + '</div>', [{
              ids: ['graffiti-cancel-graffiting-link'],
              event: 'click',
              fn: function fn(e) {
                graffiti.finishGraffiti(false);
              }
            }]);
            break;

          case 'recordingPending':
            graffiti.showControlPanels([]);
            graffiti.setNotifier('<div>' + localizer.getString('CLICK_BEGIN_MOVIE_RECORDING') + '</div>', [{
              ids: ['graffiti-cancel-recording-pending-link'],
              event: 'click',
              fn: function fn(e) {
                graffiti.finishGraffiti(false);
              }
            }]);
            break;

          case 'recording':
            graffiti.showControlPanels(['graffiti-recording-controls', 'graffiti-recording-pen-controls', 'graffiti-stickers-controls']);
            graffiti.setNotifier('<div>' + localizer.getString('ACTIVITIES_BEING_RECORDED') + '</div>' + '<div>' + localizer.getString('CANCEL_RECORDING_2') + '</div>', [{
              ids: ['graffiti-end-recording-link'],
              event: 'click',
              fn: function fn(e) {
                graffiti.toggleRecording();
              }
            }, {
              ids: ['graffiti-cancel-recording-link'],
              event: 'click',
              fn: function fn(e) {
                graffiti.cancelRecording();
              }
            }]);
            break;

          case 'notifying':
            // Just showing notifier alone. Used when prompting user to play a graffiti with the notifier
            graffiti.showControlPanels(['graffiti-notifier']);
            break;

          case 'scrubbing':
            // do nothing special while scrubbing
            break;

          default:
            console.log('Graffiti: updateControlPanels hit unknown activity:', activity);
            break;
        }

        graffiti.performWindowResizeCheck();
      },
      placeControlPanel: function placeControlPanel(opts) {
        var position, newPosition;
        var pointerPosition = state.getPointerPosition();
        var panelBbox = graffiti.sitePanel[0].getBoundingClientRect();
        var controlPanelWidth = graffiti.outerControlPanel.width();
        var controlPanelHeight = graffiti.outerControlPanel.height();
        var pixelBuffer = 25;

        if (opts.nearAction !== undefined) {
          // Position control panel off to the right of the action.
          position = {
            x: pointerPosition.x + panelBbox.width,
            y: pointerPosition.y - controlPanelHeight / 2 - pixelBuffer
          };
        } else if (opts.keepInView !== undefined) {
          // Try to keep the control panel in view if cut off.
          var bbox = graffiti.outerControlPanel[0].getBoundingClientRect();
          position = {
            x: bbox.left,
            y: bbox.top
          };
          var windowWidth = $(window).width();
          var windowHeight = $(window).height();
          var headerHeight = $('#header').height();

          if (bbox.left < 0) {
            position.x = pixelBuffer;
          } else if (bbox.right > windowWidth) {
            position.x = windowWidth - (controlPanelWidth + pixelBuffer);
          }

          if (bbox.top < headerHeight) {
            position.y = headerHeight + pixelBuffer;
          } else if (bbox.top > windowHeight) {
            position.y = windowHeight - (controlPanelHeight + pixelBuffer);
          }
        } else if (opts.position !== undefined) {
          // Hardwire the control panel to a fixed spot
          position = opts.position;
        } else if (state.getControlPanelDragging()) {
          var offset = state.getControlPanelDragOffset();
          position = {
            x: pointerPosition.x - offset.left,
            y: pointerPosition.y - offset.top
          };
        }

        if (position !== undefined) {
          // Make sure the control panel stays on screen
          var firstCell = Jupyter.notebook.get_cell(0);
          var firstElem = firstCell.element[0];
          var firstElemBbox = firstElem.getBoundingClientRect();
          var constrainedLeft = Math.min(firstElemBbox.right - controlPanelWidth - pixelBuffer, Math.max(0, position.x)); //const constrainedTop = Math.min(panelBbox.bottom - controlPanelHeight - pixelBuffer, Math.max(pixelBuffer,position.y));

          var constrainedTop = Math.min(panelBbox.bottom - controlPanelHeight - pixelBuffer, Math.max(pixelBuffer, position.y));
          newPosition = {
            left: constrainedLeft,
            top: constrainedTop
          };
          var newPositionPx = {
            top: newPosition.top + 'px',
            left: newPosition.left + 'px'
          };
          graffiti.outerControlPanel.css(newPositionPx);
        }
      },
      initInteractivity: function initInteractivity() {
        graffiti.cleanUpButtonBorders();
        graffiti.notebookContainer.click(function (e) {
          // console.log('Graffiti: clicked container');
          if (state.getActivity() === 'recordingPending') {
            console.log('Graffiti: Now starting movie recording');
            graffiti.toggleRecording();
          }

          return true;
        });
        audio.setAudioStorageCallback(storage.storeMovie);
        graffiti.addCMEvents();
        graffiti.refreshGraffitiTooltipsDebounced = _.debounce(graffiti.refreshGraffitiTooltips, 100, false);
        setTimeout(function () {
          graffiti.setupBackgroundEvents();
          graffiti.refreshAllGraffitiHighlights();
          graffiti.refreshGraffitiTooltipsDebounced();
        }, 500); // this timeout avoids too-early rendering of hidden recorder controls

        graffiti.setupControlPanels();
        graffiti.updateControlPanels();
        graffiti.setupDrawingScreen();
        graffiti.setupSavingScrim();
        graffiti.playAutoplayGraffiti(); // play any autoplay graffiti if there is one set up

        graffiti.setupMarkdownLocks();
        state.refreshCellIdToGraffitiMap();
        graffiti.executeSaveToFileDirectivesDebounced = _.debounce(graffiti.executeSaveToFileDirectives, 750, false);
        terminalLib.init(graffiti.handleTerminalsEvents);
        graffiti.executeAllSaveToFileDirectives(); // autosave any cells that are set up with saveToFile directives pointed at them

        storage.preloadAllMovies();
      },
      setGraffitiPenColor: function setGraffitiPenColor(colorVal) {
        var activePenType = state.getDrawingPenAttribute('type');

        if (activePenType === 'highlight') {
          if (colorVal === 'black') {
            console.log('Graffiti: black is not choosable when using the highlighter');
            return;
          }
        }

        $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
        console.log('Graffiti: you clicked color:', colorVal);
        state.updateDrawingState([{
          change: 'color',
          data: colorVal
        }]);
        $('#graffiti-recording-color-' + colorVal).addClass('graffiti-recording-color-active');
      },
      activateGraffitiPen: function activateGraffitiPen(penType) {
        if (!(state.getActivity() == 'recording')) {
          return; // Pens can only be used while recording
        }

        if (penType === undefined) {
          penType = 'line';
        }

        graffiti.showDrawingScreen();
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
        var penControl = $('#graffiti-' + penType + '-pen');

        if (penControl.length > 0 && !penControl.hasClass('btn')) {
          penControl = penControl.parents('.btn');
        }

        penControl.addClass('graffiti-active-pen'); // Turn on drawing (if it's not already on), and activate this pen type

        state.updateDrawingState([{
          change: 'drawingModeActivated',
          data: true
        }, {
          change: 'stickerType',
          data: undefined
        }, {
          change: 'penType',
          data: penType
        }]);
      },
      deactivateAllPens: function deactivateAllPens() {
        graffiti.setGraffitiPenColor('black');
        state.updateDrawingState([{
          change: 'drawingModeActivated',
          data: false
        }, {
          change: 'stickerType',
          data: undefined
        }, {
          change: 'penType',
          data: undefined
        }]);
        $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
      },
      toggleGraffitiPen: function toggleGraffitiPen(penType) {
        if (!(state.getActivity() == 'recording')) {
          return; // Pens can only be used while recording
        }

        var activePenType = state.getDrawingPenAttribute('type');
        graffiti.hideLabelInputBoxes();

        if (activePenType !== penType) {
          // Activate a new active pen, unless this pen is already active, in which case, deactivate it
          graffiti.activateGraffitiPen(penType);
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
        } else {
          // turn off the active pen and drawing
          $('.graffiti-active-pen').removeClass('graffiti-active-pen'); // Disable drawing

          state.updateDrawingState([{
            change: 'drawingModeActivated',
            data: false
          }, {
            change: 'stickerType',
            data: undefined
          }, {
            change: 'penType',
            data: undefined
          }]);
          graffiti.hideDrawingScreen();
        }

        if (activePenType === 'highlight') {
          // When switching from highlight to pen or eraser, always go to black color because
          // usual color for highlighter is yellow which looks crappy in the line mode.
          graffiti.setGraffitiPenColor('black');
        }
      },
      toggleGraffitiSticker: function toggleGraffitiSticker(stickerType) {
        if (!(state.getActivity() == 'recording')) {
          return; // Stickers can only be used while recording
        }

        var activePenType = state.getDrawingPenAttribute('type');
        var activeStickerType = state.getDrawingPenAttribute('stickerType');

        if (activeStickerType !== stickerType) {
          // Activate a new sticker, unless sticker is already active, in which case, deactivate it
          graffiti.hideLabelInputBoxes();
          graffiti.clearAnyActiveStickerStages();
          graffiti.showDrawingScreen(); // Deactivate any active pen

          $('.graffiti-active-pen').removeClass('graffiti-active-pen');
          var stickerControl = $('#graffiti-sticker-' + stickerType);
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
          stickerControl.addClass('graffiti-active-sticker');
          state.updateDrawingState([{
            change: 'drawingModeActivated',
            data: true
          }, {
            change: 'stickerType',
            data: stickerType
          }, {
            change: 'penType',
            data: 'sticker'
          }]);

          if (activePenType === 'highlight') {
            // If we were highlighting, it was probably yellow. we probably don't want that color
            // when switching back to stickering.
            graffiti.setGraffitiPenColor('black');
          }
        } else {
          // Turn off the active sticker control.
          graffiti.hideLabelInputBoxes();
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker'); // Disable stickering

          state.updateDrawingState([{
            change: 'drawingModeActivated',
            data: false
          }, {
            change: 'stickerType',
            data: undefined
          }, {
            change: 'penType',
            data: undefined
          }]);
          graffiti.hideDrawingScreen();
        }
      },
      cancelRapidPlay: function cancelRapidPlay() {
        console.log('Graffiti: cancelRapidPlay');
        state.setCurrentPlaySpeed('regular');
        state.storeUserChoicePlaySpeed('regular');
        audio.updateAudioPlaybackRate();
        graffiti.updateControlPanels();
      },
      toggleRapidPlay: function toggleRapidPlay(opts) {
        var forceOn = false;

        if (state.rapidIsOn() && !opts.scan || state.scanningIsOn() && opts.scan) {
          graffiti.cancelRapidPlay();
        } else {
          console.log('Graffiti: activating rapidPlay/rapidScan');

          if (opts.scan) {
            var currentSpeakingStatus = state.scanForSpeakingStatus();

            if (currentSpeakingStatus) {
              state.setCurrentPlaySpeed('scanInactive');
            } else {
              state.setCurrentPlaySpeed('scanActive'); // turn on rapid scan immediately if rabbit icon is activated during a silent period
            }
          } else {
            state.setCurrentPlaySpeed('rapid');
            state.storeUserChoicePlaySpeed('rapid');
          }

          audio.updateAudioPlaybackRate();
          graffiti.updateControlPanels();
        }
      },
      dimGraffitiCursor: function dimGraffitiCursor() {
        graffiti.graffitiCursorShell.css({
          opacity: 0.1
        });
      },
      undimGraffitiCursor: function undimGraffitiCursor() {
        graffiti.graffitiCursorShell.show().css({
          opacity: 0.55
        });
      },
      // This code is defunct due to a bug in Chrome iframes... sometimes we don't see the orange cursor because the borders of the innerCell are 
      // calculated wrong by the browser so being sure we're over the terminal output isn't guaranteed. This is fine in FF of course. So now we 
      // are falling back on white rings inside the graffiti cursor so it shows up fine over black terminals and other black things.
      activateTerminalGraffitiCursor: function activateTerminalGraffitiCursor() {
        graffiti.graffitiTerminalCursor.show();
        graffiti.graffitiNormalCursor.hide();
      },
      activateNormalGraffitiCursor: function activateNormalGraffitiCursor() {
        graffiti.graffitiNormalCursor.show();
        graffiti.graffitiTerminalCursor.hide();
      },
      drawingScreenHandler: function drawingScreenHandler(e) {
        var drawingActivity = state.getDrawingStateField('drawingActivity');

        if (state.getActivity() === 'recording') {
          if (e.type === 'mousedown') {
            console.log('Graffiti: drawingScreenHandler: mousedown');
            var wasFading = state.getDrawingStateField('drawingActivity') === 'fade'; // console.log('Graffiti: wasFading:', wasFading);

            graffiti.resetTemporaryCanvases();
            state.disableDrawingFadeClock();
            var stickerType = state.getDrawingPenAttribute('stickerType');
            drawingActivity = 'draw';
            var viewInfo = state.getViewInfo();

            if (stickerType !== undefined) {
              // console.log('Graffiti: mousedown with stickerType:', stickerType);
              drawingActivity = 'sticker';

              if (wasFading) {
                // terminate any fading in progress when drawing a new sticker
                graffiti.resetStickerCanvases('temporary');
                graffiti.wipeTemporaryStickerDomCanvases();
              }

              var currentPointerPosition = state.getPointerPosition();
              var penType = state.getDrawingPenAttribute('type');
              var minSize = penType === 'lineWithArrow' ? 1 : graffiti.minimumStickerSize;
              state.updateDrawingState([{
                change: 'mouseDownPosition',
                data: {
                  x: currentPointerPosition.x,
                  y: currentPointerPosition.y
                }
              }, {
                change: 'positions',
                data: {
                  positions: {
                    start: {
                      x: currentPointerPosition.x,
                      y: currentPointerPosition.y
                    },
                    end: {
                      x: currentPointerPosition.x + minSize,
                      y: currentPointerPosition.y + minSize
                    }
                  }
                }
              }, {
                change: 'cellId',
                data: viewInfo.cellId
              }]); // If we are using a label-type sticker, then put the label input box where the mousedown happened.

              if (stickerType === 'label') {
                graffiti.showLabelInputBox();
              }
            }

            state.updateDrawingState([{
              change: 'drawingModeActivated',
              data: true
            }, {
              change: 'isDown',
              data: true
            }, {
              change: 'drawingActivity',
              data: drawingActivity
            }, {
              change: 'opacity',
              data: state.getMaxDrawingOpacity()
            }, {
              change: 'downInMarkdown',
              data: viewInfo.inMarkdownCell
            }, {
              change: 'downInPromptArea',
              data: viewInfo.inPromptArea
            }]);
          } else if (e.type === 'mouseup' || e.type === 'mouseleave') {
            // console.log('Graffiti: drawingScreenHandler: ', e.type);
            if (drawingActivity === 'sticker' && e.type === 'mouseup') {
              graffiti.clearAnyActiveStickerStages();
            }

            if (state.getDrawingPenAttribute('isDown')) {
              state.updateDrawingState([{
                change: 'isDown',
                data: false
              }]);

              if (state.getDrawingPenAttribute('permanence') === 'temporary') {
                state.startDrawingFadeClock();
              }
            }
          } else if (e.type === 'keyup') {
            console.log('Graffiti: drawingScreen got key:', e);
            graffiti.handleKeyup(e);
          } else if (e.type === 'keydown') {
            console.log('Graffiti: drawingScreen got key:', e);
            graffiti.handleKeydown(e);
          }

          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      },
      resetDrawingColor: function resetDrawingColor() {
        $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
        $('#graffiti-recording-color-black').addClass('graffiti-recording-color-active');
        state.updateDrawingState([{
          change: 'color',
          data: 'black'
        }]);
      },
      resetDrawingPen: function resetDrawingPen() {
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
        graffiti.toggleGraffitiPen(undefined, 'deactivate'); // turn off the active pen
      },
      showDrawingScreen: function showDrawingScreen() {
        graffiti.drawingScreen.show().focus();
      },
      hideDrawingScreen: function hideDrawingScreen() {
        graffiti.drawingScreen.hide();
      },
      // Inspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/
      setupDrawingScreen: function setupDrawingScreen() {
        // Note that the tabindex is the key to capture the keydown/up events, 
        // cf https://stackoverflow.com/questions/3149362/capture-key-press-or-keydown-event-on-div-element
        var graffitiDrawingScreen = $('<div tabindex="0" id="graffiti-drawing-screen"></div>');
        graffiti.drawingScreen = graffitiDrawingScreen.prependTo(graffiti.notebookContainer);
        var notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({
          height: notebookHeight + 'px'
        });
        graffiti.drawingScreen.bind('mousedown mouseup mouseleave keydown keyup', function (e) {
          graffiti.drawingScreenHandler(e);
        });
      },
      placeLabelInputBox: function placeLabelInputBox() {
        var viewInfo = state.getViewInfo();
        var cell = utils.findCellByCellId(viewInfo.cellId);
        var elem = $(cell.element[0]);
        var labelInputBox = elem.find('.graffiti-label-input');

        if (labelInputBox.length === 0) {
          labelInputBoxElem = $('<div tabindex="0" class="graffiti-label-input"><input type="text" maxlength="50" placeholder="' + localizer.getString('ENTER_LABEL') + '"/></div>');
          labelInputBox = labelInputBoxElem.appendTo(elem);
          labelInputBox.bind('keydown keyup', function (e) {
            graffiti.handleLabelInput(e);
          });
        }

        var penColor = state.getDrawingPenAttribute('color');

        if (penColor === 'white') {
          labelInputBox.find('input').css({
            color: 'black'
          });
        } else {
          labelInputBox.find('input').css({
            color: penColor
          });
        }

        return labelInputBox;
      },
      showLabelInputBox: function showLabelInputBox() {
        graffiti.clearAnyActiveStickerStages();
        graffiti.hideLabelInputBoxes();
        var labelInputBox = graffiti.placeLabelInputBox(); // make sure there is a label box

        var currentPointerPosition = state.getPointerPosition();
        var viewInfo = state.getViewInfo();
        var adjustedPosition = utils.subtractCoords(viewInfo.outerCellRect, currentPointerPosition);
        var verticalAdjust = parseInt(labelInputBox.height() / 2);
        adjustedPosition.y = adjustedPosition.y - verticalAdjust;
        labelInputBox.show().css({
          left: adjustedPosition.x + 'px',
          top: adjustedPosition.y + 'px'
        }).find('input').val('').focus();
        var outerCellRect = viewInfo.outerCellRect;
        var mouseDownPosition = state.getDrawingPenAttribute('mouseDownPosition');
        state.updateDrawingState([{
          change: 'positions',
          data: {
            positions: {
              start: {
                x: mouseDownPosition.x - outerCellRect.left,
                y: mouseDownPosition.y - outerCellRect.top - verticalAdjust
              },
              end: {
                x: mouseDownPosition.x + 1 - outerCellRect.left,
                y: mouseDownPosition.y + 1 - outerCellRect.top - verticalAdjust
              }
            }
          }
        }, {
          change: 'downInPromptArea',
          data: viewInfo.inPromptArea
        }, {
          change: 'downInMarkdown',
          data: viewInfo.downInMarkdown
        }, {
          change: 'promptWidth',
          data: viewInfo.promptWidth
        }]);
      },
      hideLabelInputBoxes: function hideLabelInputBoxes() {
        console.log('Graffiti: Ending labelling');
        $('.graffiti-label-input').val('').hide();
      },
      handleLabelInput: function handleLabelInput(e) {
        if (e.which === 9) {
          e.preventDefault(); // don't let tab key buble up
        }

        e.stopPropagation(); // make sure keystrokes in the label input box don't bubble up to jupyter

        if (e.type === 'keyup') {
          if (state.getActivity() === 'recording') {
            // If user hits return tab, we "accept" this label, which simply means hide the input box. The rendered label should be underneath.
            state.disableDrawingFadeClock();
            var inputBox = $(e.target);
            var labelText = inputBox.val();
            state.updateDrawingState([{
              change: 'label',
              data: '' + labelText
            }]);
            var drawingPermanence = state.getDrawingPenAttribute('permanence');
            graffiti.updateStickerDisplayWhenRecording(drawingPermanence);
            state.storeHistoryRecord('stickers'); //console.log('keycode',e.which);

            if (e.which === 13 || e.which === 9) {
              graffiti.hideLabelInputBoxes();
              state.startDrawingFadeClock();
            }
          }
        }
      },
      setupSavingScrim: function setupSavingScrim() {
        var graffitiSavingScrim = $('<div id="graffiti-saving-scrim"><div>Saving Graffiti Recording. Please wait...</div></div>');
        graffiti.savingScrim = graffitiSavingScrim.prependTo(graffiti.notebookContainer);
      },
      showSavingScrim: function showSavingScrim() {
        graffiti.savingScrim.css({
          display: 'flex'
        });
      },
      hideSavingScrim: function hideSavingScrim() {
        graffiti.savingScrim.css({
          display: 'none'
        });
      },
      resizeCanvases: function resizeCanvases() {
        var canvasTypes = ['permanent', 'temporary'];
        var cellElement, cellRect, canvasStyle, canvas, cellCanvas;

        for (var _i = 0, _canvasTypes = canvasTypes; _i < _canvasTypes.length; _i++) {
          var canvasType = _canvasTypes[_i];

          for (var _i2 = 0, _Object$keys = Object.keys(graffiti.canvases[canvasType]); _i2 < _Object$keys.length; _i2++) {
            var cellId = _Object$keys[_i2];
            cell = utils.findCellByCellId(cellId);

            if (cell !== undefined) {
              canvas = graffiti.canvases[canvasType][cellId];
              cellCanvas = canvas.canvas;
              cellElement = cell.element[0];
              cellRect = cellElement.getBoundingClientRect();

              if (parseInt(cellRect.width) !== parseInt(cellCanvas.width) || parseInt(cellRect.height) !== parseInt(cellCanvas.height)) {
                canvasStyle = {
                  width: cellRect.width + 'px',
                  height: cellRect.height + 'px'
                };
                canvas.div.css(canvasStyle);
                cellCanvas.width = cellRect.width;
                cellCanvas.height = cellRect.height;
                canvas.cellRect = cellRect; //console.trace('resized height of ',cellId, 'to ', cellRect.height);
              }
            }
          }
        }

        var notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({
          height: notebookHeight + 'px'
        });
      },
      // Remove "active" attribute from whatever sticker might have rt now.
      // Pretty inefficient, good enough for time being though.
      clearAnyActiveStickerStages: function clearAnyActiveStickerStages() {
        var stickerStage,
            stickerIndex,
            sticker,
            canvasTypes = ['temporary', 'permanent'];

        for (var _i3 = 0, _canvasTypes2 = canvasTypes; _i3 < _canvasTypes2.length; _i3++) {
          var canvasType = _canvasTypes2[_i3];

          for (var _i4 = 0, _Object$keys2 = Object.keys(graffiti.stickers[canvasType]); _i4 < _Object$keys2.length; _i4++) {
            var cellId = _Object$keys2[_i4];
            stickerStage = graffiti.stickers[canvasType][cellId];

            if (stickerStage.stickers !== undefined) {
              for (var _stickerIndex = 0; _stickerIndex < stickerStage.stickers.length; ++_stickerIndex) {
                sticker = stickerStage.stickers[_stickerIndex];

                if (sticker.active) {
                  stickerStage.stickers[_stickerIndex].active = false;
                }
              }
            }
          }
        }
      },
      resetGraffitiStickerStage: function resetGraffitiStickerStage(cellId, stickerPermanence) {
        if (!graffiti.stickers[stickerPermanence].hasOwnProperty(cellId)) {
          graffiti.stickers[stickerPermanence][cellId] = {
            stickers: [],
            canvas: undefined
          };
        }
      },
      placeStickerCanvas: function placeStickerCanvas(cellId, stickerPermanence) {
        graffiti.resetGraffitiStickerStage(cellId, stickerPermanence); // put the sticker stage record into memory if we need to before placing a canvas in the dom

        if (graffiti.stickers[stickerPermanence][cellId].canvas !== undefined) {
          return;
        }

        var cell = utils.findCellByCellId(cellId);
        var cellElement = cell.element[0];
        var cellRect = cellElement.getBoundingClientRect(); // Note that we inline all these styles because to include them from a stylesheet causes rendering jumps.

        var stickerDivId = 'graffiti-sticker-' + cellId;
        graffiti.stickers[stickerPermanence][cellId].canvas = $('<div class="graffiti-sticker-outer graffiti-canvas-type-' + stickerPermanence + '" id="' + stickerDivId + '" ' + 'style="width:' + parseInt(cellRect.width) + 'px;' + 'height:' + parseInt(cellRect.height) + 'px;' + 'position:absolute;left:0;top:0;">' + '</div>').appendTo(cellElement);
      },
      placeCanvas: function placeCanvas(cellId, drawingPermanence) {
        var cell = utils.findCellByCellId(cellId);
        var cellElement = $(cell.element[0]);
        var cellRect = cellElement[0].getBoundingClientRect();

        if (graffiti.canvases[drawingPermanence][cellId] !== undefined) {
          //console.log('not adding ' + drawingPermanence + ' canvas to this cell, already exists.');
          return cellRect;
        } // console.log('Graffiti: placing ', drawingPermanence, 'canvas for cellId:', cellId);


        $('<div class="graffiti-canvas-outer graffiti-canvas-type-' + drawingPermanence + '"><canvas /></div>').appendTo(cellElement);
        var newCellCanvasDiv = cellElement.find('.graffiti-canvas-outer:last');
        var newCellCanvas = newCellCanvasDiv.find('canvas')[0];
        var ctx = newCellCanvas.getContext("2d");
        var canvasStyle = {
          width: cellRect.width + 'px',
          height: cellRect.height + 'px'
        };
        newCellCanvasDiv.css(canvasStyle);
        newCellCanvas.width = cellRect.width;
        newCellCanvas.height = cellRect.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        graffiti.canvases[drawingPermanence][cellId] = {
          div: newCellCanvasDiv,
          canvas: newCellCanvas,
          ctx: ctx,
          cellRect: cellRect
        }; // console.log('canvases:', graffiti.canvases);

        return cellRect;
      },
      setCanvasStyle: function setCanvasStyle(cellId, penType, penDashStyle, canvasColor, canvasPermanence) {
        var canvas = graffiti.canvases[canvasPermanence][cellId];
        var ctx = canvas.ctx;

        if (canvasColor === undefined) {
          canvasColor = 'black'; // default to black lines if not set in older recordings before color was supported.
        }

        if (penType === 'highlight') {
          if (canvasColor === 'black') {
            canvasColor = 'yellow';
          }

          ctx.lineWidth = 15;
          ctx.shadowBlur = 35;
          ctx.globalAlpha = 0.5;
        } else {
          // lines are default although if erase activated, we will ignore this style and use clearRect
          //console.log('canvas color:', canvasColor);
          ctx.shadowBlur = 1;
          ctx.lineWidth = 1.75;
          ctx.globalAlpha = 1.0;
          ctx.setLineDash([]);

          if (penDashStyle === 'dashed') {
            ctx.setLineDash([2, 10]);
            /* first parm = dash, second parm = spaces btwn */

            ctx.lineDashOffset = 2;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5;
          }
        }

        var rawColorVal = '#' + graffiti.penColors[canvasColor]; // Hack test

        if (rawColorVal === undefined) {
          console.log('Graffiti: warning, rawColorVal is undefined');
          rawColorVal = '#000000';
        }

        ctx.strokeStyle = rawColorVal;
        ctx.shadowColor = rawColorVal;
      },
      clearCanvas: function clearCanvas(canvasType, cellId) {
        var canvas = graffiti.canvases[canvasType][cellId];
        var ctx = canvas.ctx;
        var cellRect = canvas.cellRect;
        ctx.clearRect(0, 0, cellRect.width, cellRect.height);
      },
      clearCanvases: function clearCanvases(canvasType) {
        //console.log('clearCanvases');
        if (canvasType === 'all') {
          for (var _i5 = 0, _Object$keys3 = Object.keys(graffiti.canvases); _i5 < _Object$keys3.length; _i5++) {
            var _canvasType = _Object$keys3[_i5];

            for (var _i6 = 0, _Object$keys4 = Object.keys(graffiti.canvases[_canvasType]); _i6 < _Object$keys4.length; _i6++) {
              var cellId = _Object$keys4[_i6];
              graffiti.clearCanvas(_canvasType, cellId);
            }
          }
        } else {
          for (var _i7 = 0, _Object$keys5 = Object.keys(graffiti.canvases[canvasType]); _i7 < _Object$keys5.length; _i7++) {
            var _cellId = _Object$keys5[_i7];
            graffiti.clearCanvas(canvasType, _cellId);
          }
        }

        $('.graffiti-canvas-type-temporary').css({
          opacity: state.getMaxDrawingOpacity()
        });
      },
      resetTemporaryCanvases: function resetTemporaryCanvases() {
        console.log('Graffiti: resetTemporaryCanvases.');
        var opacity = state.getDrawingStateField('opacity');
        var maxOpacity = state.getMaxDrawingOpacity();

        if (opacity < maxOpacity) {
          console.log('Graffiti: Clearing temp canvases, since fade was in progress.');
          graffiti.clearCanvases('temporary');
          state.updateDrawingState([{
            change: 'drawingActivity',
            data: 'wipe'
          }]);
          state.storeHistoryRecord('drawings');
          state.updateDrawingState([{
            change: 'opacity',
            data: maxOpacity
          }]);
          state.disableDrawingFadeClock();
        }
      },
      // If a cell is deleted by jupyter we need to forget any the canvases we were tracking for it.
      removeCanvasRecordsForCell: function removeCanvasRecordsForCell(cellId) {
        delete graffiti.canvases['permanent'][cellId];
        delete graffiti.stickers['permanent'][cellId];
        delete graffiti.canvases['temporary'][cellId];
        delete graffiti.stickers['temporary'][cellId];
      },
      updateDrawingOpacity: function updateDrawingOpacity() {
        var maxOpacity = state.getMaxDrawingOpacity(); // Check for fadeouts

        var currentOpacity = state.getDrawingStateField('opacity');
        var opacityInfo = state.calculateDrawingOpacity();

        switch (opacityInfo.status) {
          case 'max':
            if (currentOpacity !== maxOpacity) {
              // only go to max if not already set to max
              var drawingActivity = state.getDrawingStateField('drawingActivity');
              state.updateDrawingState([{
                change: 'drawingActivity',
                data: drawingActivity
              }, {
                change: 'opacity',
                data: maxOpacity
              }]);
            }

            break;

          case 'fade':
            state.updateDrawingState([{
              change: 'drawingActivity',
              data: 'fade'
            }, {
              change: 'opacity',
              data: opacityInfo.opacity
            }]);
            state.storeHistoryRecord('drawings');
            $('.graffiti-canvas-type-temporary').css({
              opacity: opacityInfo.opacity
            });
            break;

          case 'fadeDone':
            graffiti.resetTemporaryCanvases();
            graffiti.resetStickerCanvases('temporary');
            break;
        }
      },
      updateDrawingDisplay: function updateDrawingDisplay(cellId, ax, ay, bx, by, drawingPenType, drawingPermanence) {
        //console.log('updateDrawingDisplay, drawingPermanence:', drawingPermanence);
        if (graffiti.canvases[drawingPermanence].hasOwnProperty(cellId)) {
          var ctx = graffiti.canvases[drawingPermanence][cellId].ctx;

          if (drawingPenType === 'eraser') {
            var eraseBuffer = 25;
            ctx.clearRect(ax - eraseBuffer / 2, ay - eraseBuffer / 2, eraseBuffer, eraseBuffer);
          } else {
            //console.log('updateDrawingDisplay:', ax, ay, bx, by);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.closePath();
            ctx.stroke();
          }
        }
      },
      wipeTemporaryStickerDomCanvases: function wipeTemporaryStickerDomCanvases() {
        $('.graffiti-sticker-outer.graffiti-canvas-type-temporary').empty();
      },
      wipeAllStickerDomCanvases: function wipeAllStickerDomCanvases() {
        //console.log('wipeAllStickerDomCanvases');
        $('.graffiti-sticker-outer').empty();
      },
      resetStickerCanvases: function resetStickerCanvases(typeOverride) {
        var sticker,
            canvasTypes = typeOverride === undefined ? ['temporary', 'permanent'] : [typeOverride];

        for (var _i8 = 0, _canvasTypes3 = canvasTypes; _i8 < _canvasTypes3.length; _i8++) {
          var canvasType = _canvasTypes3[_i8];

          for (var _i9 = 0, _Object$keys6 = Object.keys(graffiti.stickers[canvasType]); _i9 < _Object$keys6.length; _i9++) {
            var cellId = _Object$keys6[_i9];
            sticker = graffiti.stickers[canvasType][cellId];

            if (sticker.canvas !== undefined) {
              sticker.canvas.empty();
            }

            sticker.stickers = [];
          }
        }
      },
      processPositionsForCellTypeScaling: function processPositionsForCellTypeScaling(record, type) {
        var positions,
            scalarX = 1,
            scalarY = 1,
            positionsRaw,
            cell,
            cellId,
            cellRects,
            denomWidth,
            denomHeight; // console.log('scalarX', scalarX, 'scalarY', scalarY);

        if (type === 'cursor') {
          // Scale the cursor position. The cell the cursor is hovering over is in the cellId field, unless the
          // drawingActivity was 'sticker' when this record was made, in which case we'll scale to the cell under
          // the starting coordinates of the sticker to match what happens when we scale the sticker itself.
          if (record.stickerInfo !== undefined) {
            cellId = record.stickerInfo.cellId;
            denomWidth = record.stickerInfo.width;
            denomHeight = record.stickerInfo.height;
          } else {
            cellId = record.cellId;
            denomWidth = record.innerCellRect.width;
            denomHeight = record.innerCellRect.height;
          }

          cell = utils.findCellByCellId(cellId);
          cellRects = utils.getCellRects(cell);

          if (state.getScaleCursorWithWindow()) {
            // only scale the cursor if the directive is set to scale with window.
            scalarX = cellRects.innerCellRect.width / denomWidth;
            scalarY = cellRects.innerCellRect.height / denomHeight;
          }

          positionsRaw = {
            x: record.x,
            y: record.y
          };

          if (!record.inMarkdownCell || record.isOverTerminal) {
            // in code cells, or if pen went down in prompt area, just use positions verbatim
            positions = {
              start: {
                x: positionsRaw.x,
                y: positionsRaw.y
              }
            };
          } else {
            if (record.inPromptArea || record.downInPromptArea) {
              // in prompt area only scale y value
              positions = {
                start: {
                  x: positionsRaw.x,
                  y: positionsRaw.y * scalarY
                }
              };
            } else {
              // in markdown area, scale full position.
              positions = {
                start: {
                  x: (positionsRaw.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                  y: positionsRaw.y * scalarY
                }
              };
            }
          } //if (record.drawingActivity === 'sticker') {
          //console.log('cellId', cellId, 'hoverCellId', record.hoverCell.metadata.graffitiCellId, 'positions', positions.start.y, 'scalarX', scalarX, 'scalarY', scalarY);
          //}

        } else {
          //
          // Drawing and sticker scaling code begins here.
          //
          positionsRaw = {
            start: {
              x: record.positions.start.x,
              y: record.positions.start.y
            },
            end: {
              x: record.positions.end.x,
              y: record.positions.end.y
            }
          };
          cell = utils.findCellByCellId(record.cellId);
          cellRects = utils.getCellRects(cell);

          if (state.getScaleCursorWithWindow()) {
            // only scale the drawing if the directive is set to scale with window.
            scalarX = cellRects.innerCellRect.width / record.innerCellRect.width;
            scalarY = cellRects.innerCellRect.height / record.innerCellRect.height;
          } // If this drawing/sticker started in a markdown cell, we will attempt to scale both x and y coords in the inner_cell rect area but 
          // NOT the prompt area.


          if (record.pen.downInMarkdown) {
            if (record.pen.downInPromptArea) {
              //console.log('inPromptArea and did not start in prompt area');
              // if pen went down in prompt area of a markdown cell, scale the Y value only. 
              positions = {
                start: {
                  x: positionsRaw.start.x,
                  y: positionsRaw.start.y * scalarY
                },
                end: {
                  x: positionsRaw.end.x,
                  y: positionsRaw.end.y * scalarY
                }
              };
            } else {
              if (record.pen.inPromptArea) {
                scalarX = 1;
              } // In the inner_cell, scale both x and y. First subtract the historical prompt width, then scale the value up/down, and then
              // add the current prompt width to calculate the final X (UNLESS we are drawing in the prompt area, then do not scale in X).
              // Y is just scaled by change in cell height.


              positions = {
                start: {
                  x: (positionsRaw.start.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                  y: positionsRaw.start.y * scalarY
                },
                end: {
                  x: (positionsRaw.end.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                  y: positionsRaw.end.y * scalarY
                }
              };
            }
          } else {
            // we don't scale anything if we started in a code cell. Just leave everything as recorded.
            positions = {
              start: {
                x: positionsRaw.start.x,
                y: positionsRaw.start.y
              },
              end: {
                x: positionsRaw.end.x,
                y: positionsRaw.end.y
              }
            };
          }
        }

        return positions;
      },
      // calculate correct offsets based on innerCellRect / dx, dy etc
      drawStickersForCell: function drawStickersForCell(cellId, record) {
        var activity = state.getActivity();
        var currentlyRecording = activity === 'recording';
        var canvasTypes = ['temporary', 'permanent'],
            canvasElements = {};
        var canvasType,
            newInnerHtml = {},
            finalInnerHtml;

        for (var _i10 = 0, _canvasTypes4 = canvasTypes; _i10 < _canvasTypes4.length; _i10++) {
          canvasType = _canvasTypes4[_i10];
          graffiti.placeStickerCanvas(cellId, canvasType);
          canvasElements[canvasType] = {
            elem: graffiti.stickers[canvasType][cellId].canvas
          };
          canvasElements[canvasType].opacityOverride = canvasElements[canvasType].elem.css('opacity');
          newInnerHtml[canvasType] = [];
        }

        var stickerPermanence, stickerX, stickerY, fillOpacity, width, height, stickerWidth, stickerHeight, generatedStickerHtml, generatedStickerElem, pen, type, positions, p1x, p1y, p2x, p2y, stickersRecords, dimensions, stickerProcessingRecord;

        if (record !== undefined) {
          stickersRecords = record.stickersRecords;
        } else {
          stickerPermanence = state.getDrawingPenAttribute('permanence');
          stickersRecords = graffiti.stickers[stickerPermanence][cellId].stickers;
        }

        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
          for (var _iterator4 = stickersRecords[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
            var stickerRecord = _step4.value;
            pen = stickerRecord.pen;
            type = pen.stickerType;
            stickerPermanence = pen.permanence;

            if (currentlyRecording) {
              positions = stickerRecord.positions;
              fillOpacity = state.getDrawingPenAttribute('fillOpacity'); //console.log('Recording, Computed fillOpacity:', fillOpacity);
            } else {
              stickerRecord.cellId = cellId; // console.log('Graffiti: sticker rendering.  record', record, 'stickerRecord', stickerRecord, 'stickerProcessingRecord', stickerProcessingRecord);

              positions = graffiti.processPositionsForCellTypeScaling(stickerRecord, 'positions');
              fillOpacity = stickerRecord.pen.fillOpacity;
            }

            if (type === 'lineWithArrow') {
              stickerX = positions.start.x;
              stickerY = positions.start.y;
            } else {
              stickerX = Math.min(positions.start.x, positions.end.x);
              stickerY = Math.min(positions.start.y, positions.end.y);
            }

            stickerWidth = Math.abs(positions.end.x - positions.start.x);
            stickerHeight = Math.abs(positions.end.y - positions.start.y);
            var transformX = Math.sign(positions.end.x - positions.start.x);
            var transformY = Math.sign(positions.end.y - positions.start.y);
            var cssTransform = 'scale(' + transformX + ',' + transformY + ')';

            if (stickerRecord.stickerOnGrid) {
              // Make things square when shift key is down, except for certain items,
              // where shift key means align with a fixed grid and fixed graffiti size.
              if (type === 'checkmark' || type === 'xmark' || type === 'bomb' || type === 'trophy' || type === 'smiley' || type === 'pi' || type === 'alpha' || type === 'beta' || type === 'sigma' || type == 'theta' || type === 'angle') {
                stickerX = parseInt(positions.start.x / graffiti.minimumStickerSizeWithBuffer) * graffiti.minimumStickerSizeWithBuffer;
                stickerY = parseInt(positions.start.y / graffiti.minimumStickerSizeWithBuffer) * graffiti.minimumStickerSizeWithBuffer;
                stickerWidth = graffiti.minimumStickerSize;
                cssTransform = undefined; // don't allow transforms while on the fixed grid
              }

              stickerHeight = stickerWidth;
            }

            dimensions = {
              x: stickerX,
              y: stickerY,
              width: stickerWidth,
              height: stickerHeight
            }; //console.log('Processing stickerRecord:', stickerRecord);
            //console.log('Drawing to dimensions:', dimensions);

            generatedStickerHtml = undefined; //console.log('processing type:', type);

            switch (type) {
              case 'rectangle':
                generatedStickerHtml = stickerLib.makeRectangle({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 4,
                  dimensions: dimensions,
                  fillOpacity: fillOpacity
                });
                break;

              case 'roundRectangle':
                generatedStickerHtml = stickerLib.makeRectangle({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 4,
                  rx: 8,
                  ry: 8,
                  dimensions: dimensions,
                  fillOpacity: fillOpacity
                });
                break;

              case 'isocelesTriangle':
                generatedStickerHtml = stickerLib.makeIsocelesTriangle({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 4,
                  dimensions: dimensions,
                  cssTransform: cssTransform,
                  fillOpacity: fillOpacity
                });
                break;

              case 'rightTriangle':
                generatedStickerHtml = stickerLib.makeRightTriangle({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  strokeWidth: 4,
                  cssTransform: cssTransform,
                  fillOpacity: fillOpacity
                });
                break;

              case 'ellipse':
                generatedStickerHtml = stickerLib.makeEllipse({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 3,
                  dimensions: dimensions,
                  fillOpacity: fillOpacity,
                  buffer: 4
                });
                break;

              case 'checkmark':
                generatedStickerHtml = stickerLib.makeCheckmark({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions
                });
                break;

              case 'xmark':
                generatedStickerHtml = stickerLib.makeXmark({
                  strokeWidth: 2,
                  color: 'red',
                  dashed: pen.dash,
                  dimensions: dimensions
                });
                break;

              case 'grid':
                generatedStickerHtml = stickerLib.makeGrid({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform,
                  strokeWidth: 1
                });
                break;

              case 'axis':
                generatedStickerHtml = stickerLib.makeAxis({
                  strokeWidth: 2,
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'bomb':
                generatedStickerHtml = stickerLib.makeBomb({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'trophy':
                generatedStickerHtml = stickerLib.makeTrophy({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'smiley':
                generatedStickerHtml = stickerLib.makeSmiley({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform,
                  strokeWidth: 2
                });
                break;

              case 'ribbon':
                generatedStickerHtml = stickerLib.makeRibbon({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 2,
                  dimensions: dimensions
                });
                break;

              case 'horizontalBrackets':
                generatedStickerHtml = stickerLib.makeHorizontalBrackets({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 3,
                  dimensions: dimensions
                });
                break;

              case 'verticalBrackets':
                generatedStickerHtml = stickerLib.makeVerticalBrackets({
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  strokeWidth: 3,
                  dimensions: dimensions
                });
                break;

              case 'curlyBraces':
                generatedStickerHtml = stickerLib.makeSymmetricCurlyBraces({
                  color: pen.color,
                  dashed: pen.dash,
                  strokeWidth: 3,
                  dimensions: dimensions
                });
                break;

              case 'pi':
                generatedStickerHtml = stickerLib.makePi({
                  color: pen.color,
                  dashed: pen.dash,
                  strokeWidth: 2,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'alpha':
                generatedStickerHtml = stickerLib.makeAlpha({
                  color: pen.color,
                  dashed: pen.dash,
                  strokeWidth: 2,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'beta':
                generatedStickerHtml = stickerLib.makeBeta({
                  color: pen.color,
                  dashed: pen.dash,
                  strokeWidth: 2,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'sigma':
                generatedStickerHtml = stickerLib.makeSigma({
                  strokeWidth: 1,
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'theta':
                generatedStickerHtml = stickerLib.makeTheta({
                  strokeWidth: 1,
                  color: pen.color,
                  fill: pen.fill,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'angle':
                generatedStickerHtml = stickerLib.makeAngle({
                  strokeWidth: 1,
                  fill: pen.fill,
                  color: pen.color,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  cssTransform: cssTransform
                });
                break;

              case 'lineWithArrow':
                generatedStickerHtml = stickerLib.makeLine({
                  color: pen.color,
                  dashed: pen.dash,
                  dimensions: dimensions,
                  endpoints: {
                    p1: {
                      x: positions.start.x,
                      y: positions.start.y
                    },
                    p2: {
                      x: positions.end.x,
                      y: positions.end.y
                    }
                  },
                  lineStartOffset: {
                    x: 0,
                    y: 0
                  },
                  usesArrow: true,
                  arrowHeadSize: 6
                });
                break;

              case 'label':
                // If we are recording, on mouseup, we will put a centered input box on screen. Otherwise render this label.
                // If not recording, render a text label scaled by the size of this box.
                if (pen.label !== undefined) {
                  dimensions.width = 15 * pen.label.length; // large enough for the label

                  dimensions.height = 18;
                  generatedStickerHtml = stickerLib.makeLabelHtml({
                    color: pen.color,
                    label: pen.label,
                    dimensions: dimensions,
                    opacity: 1.0
                  }); //console.log('generatedStickerHtml:', generatedStickerHtml);
                }

                break;

              case 'custom':
                var stickerImageUrl = void 0;

                if (currentlyRecording) {
                  var recordingCellInfo = state.getRecordingCellInfo();
                  stickerImageUrl = recordingCellInfo.recordingRecord.stickerImageUrl;
                } else {
                  stickerImageUrl = state.getStickerImageUrl();
                }

                if (stickerImageUrl !== undefined) {
                  generatedStickerHtml = stickerLib.makeCustom({
                    dimensions: dimensions,
                    imageUrl: stickerImageUrl,
                    cssTransform: cssTransform
                  });
                  canvasElements[stickerPermanence].opacityOverride = 1.0; // make parent opacity maximum so child images are fully visible
                } else {
                  // Sticker not set or not found; just draw grey rect to let user know
                  generatedStickerHtml = stickerLib.makeRectangle({
                    color: 'lightgrey',
                    fill: pen.fill,
                    dashed: 'dashed',
                    strokeWidth: 3,
                    dimensions: dimensions,
                    fillOpacity: 0
                  });
                }

                break;
            }

            if (generatedStickerHtml !== undefined) {
              newInnerHtml[stickerPermanence].push(generatedStickerHtml);
            }
          } // Finally, render all sticker html now that it's built.

        } catch (err) {
          _didIteratorError4 = true;
          _iteratorError4 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
              _iterator4["return"]();
            }
          } finally {
            if (_didIteratorError4) {
              throw _iteratorError4;
            }
          }
        }

        for (var _i11 = 0, _canvasTypes5 = canvasTypes; _i11 < _canvasTypes5.length; _i11++) {
          canvasType = _canvasTypes5[_i11];

          if (newInnerHtml[canvasType].length > 0) {
            // only redraw canvas that has elements drawn during this frame
            canvasElements[canvasType].elem.empty();
            finalInnerHtml = newInnerHtml[canvasType].join('');
            canvasElements[canvasType].elem.html(finalInnerHtml);
            canvasElements[canvasType].elem.css({
              opacity: canvasElements[canvasType].opacityOverride
            });
          }
        }
      },
      updateStickerDisplayWhenRecording: function updateStickerDisplayWhenRecording(stickerPermanence) {
        var cellId = state.getDrawingStateField('cellId');
        graffiti.resetGraffitiStickerStage(cellId, stickerPermanence); // Replace active sticker if there is one, or add a new active sticker

        var stickers = graffiti.stickers[stickerPermanence][cellId].stickers;
        var stickerRecord = state.createStickerRecord(); // console.log('stickerRecord', stickerRecord);
        //console.log('stickerRecordEnd:', stickerRecord.positions.start.x, stickerRecord.positions.start.y, stickerRecord.positions.end.x, stickerRecord.positions.end.y);

        stickerRecord.active = true;
        var replaced = false;

        if (stickers.length > 0) {
          var lastSticker = stickers.length - 1;

          if (stickers[lastSticker].active) {
            graffiti.stickers[stickerPermanence][cellId].stickers[lastSticker] = stickerRecord;
            replaced = true;
          }
        }

        if (!replaced) {
          stickers.push(stickerRecord);
        } // Store the state for later redrawing.


        state.storeStickersStateForCell(graffiti.stickers[stickerPermanence][cellId].stickers, cellId); // Now rerender all stickers for this cell

        graffiti.drawStickersForCell(cellId);
      },
      // This fn is called on mousemove, which means fade counts always reset, and we clear the temporary ink completely if it was part way through a fade
      updateDrawingDisplayWhenRecording: function updateDrawingDisplayWhenRecording(ax, ay, bx, by, viewInfo) {
        if (state.getActivity() === 'recording') {
          if (state.getDrawingPenAttribute('isDown')) {
            var drawingActivity = state.getDrawingStateField('drawingActivity');
            var drawingPermanence = state.getDrawingPenAttribute('permanence');
            var cellId = drawingActivity === 'sticker' ? state.getDrawingStateField('cellId') : viewInfo.cellId;
            var cellRect = graffiti.placeCanvas(cellId, drawingPermanence);
            var drawingRecordType;

            if (drawingActivity === 'sticker') {
              drawingRecordType = 'stickers';
              var mouseDownPosition = state.getDrawingPenAttribute('mouseDownPosition');
              state.updateDrawingState([{
                change: 'positions',
                data: {
                  positions: {
                    start: {
                      x: mouseDownPosition.x - cellRect.left,
                      y: mouseDownPosition.y - cellRect.top
                    },
                    end: {
                      x: bx - cellRect.left,
                      y: by - cellRect.top
                    }
                  }
                }
              }, {
                change: 'inPromptArea',
                data: viewInfo.inPromptArea
              }, {
                change: 'promptWidth',
                data: viewInfo.promptWidth
              }]);
              graffiti.updateStickerDisplayWhenRecording(drawingPermanence);
            } else {
              drawingRecordType = 'drawings';
              var drawingPenType = state.getDrawingPenAttribute('type');
              var drawingPenDash = state.getDrawingPenAttribute('dash');
              var drawingPenColor = state.getDrawingPenAttribute('color'); // console.log('drawingActivity', drawingActivity, drawingPenType);

              graffiti.setCanvasStyle(viewInfo.cellId, drawingPenType, drawingPenDash, drawingPenColor, drawingPermanence);
              graffiti.updateDrawingDisplay(viewInfo.cellId, ax - cellRect.left, ay - cellRect.top, bx - cellRect.left, by - cellRect.top, drawingPenType, drawingPermanence);
              state.updateDrawingState([{
                change: 'positions',
                data: {
                  positions: {
                    start: {
                      x: ax - cellRect.left,
                      y: ay - cellRect.top
                    },
                    end: {
                      x: bx - cellRect.left,
                      y: by - cellRect.top
                    }
                  }
                }
              }, {
                change: 'cellId',
                data: viewInfo.cellId
              }, {
                change: 'inPromptArea',
                data: viewInfo.inPromptArea
              }, {
                change: 'promptWidth',
                data: viewInfo.promptWidth
              }]);
            }

            state.storeHistoryRecord(drawingRecordType);
          }
        }
      },
      // Rerun all drawings up to time t. Used after scrubbing.
      redrawAllDrawings: function redrawAllDrawings(targetTime) {
        if (targetTime === undefined) {
          targetTime = state.getTimePlayedSoFar();
        }

        graffiti.clearCanvases('all');
        var lastDrawFrameIndex = state.getIndexUpToTime('drawings', targetTime);

        if (lastDrawFrameIndex !== undefined) {
          // First, final last opacity reset before the target time. We will start redrawing drawings from this point forward.
          var record;

          for (var index = 0; index < lastDrawFrameIndex; ++index) {
            record = state.getHistoryItem('drawings', index);
            graffiti.updateDrawingCore(record);
          }
        }
      },
      redrawAllDrawingsWhenRecording: function redrawAllDrawingsWhenRecording() {
        if (state.getActivity() !== 'recording') {
          return;
        }

        var lastDrawFrameIndex = state.getLastFrameIndex('drawings');

        if (lastDrawFrameIndex !== undefined) {
          var record;

          for (var index = 0; index < lastDrawFrameIndex; ++index) {
            record = state.getHistoryItem('drawings', index);
            graffiti.updateDrawingCore(record);
          }
        }
      },
      // Extract any tooltip commands. Here's some examples:
      //
      // %%button_name Watch Movie
      // %%narrator_pic images/adarsh_pic.png
      // %%narrator_name Adarsh
      // %%caption_pic ![Adarsh](images/adarsh_pic.png)
      // %%caption  What is Naive Bayes?
      //
      extractTooltipCommands: function extractTooltipCommands(markdown) {
        //const commandParts = markdown.match(/^\s*%%(([^\s]*)(\s*)(.*))$/mig);
        var commandParts = markdown.split(/\n/);
        var partsRecord, part, subParts, cleanedPart;
        if (commandParts === null) return undefined;

        if (commandParts.length > 0) {
          partsRecord = {
            buttonName: undefined,
            captionPic: '',
            captionVideo: undefined,
            caption: '',
            playback_pic: undefined,
            autoplay: 'never',
            replayAllCells: false,
            // by default, we will only replay cells that the author interacted with. 
            hideTooltip: false,
            playOnClick: false,
            skipInfo: {
              type: state.skipTypes['absolute'],
              factor: 0
            },
            saveToFile: undefined,
            // may be array of save_to_file directives
            scaleCursorToWindow: false,
            // if set to true, we will try to scale all drawings 
            silenceWarnings: false,
            swappingLabels: false
          };

          for (var i = 0; i < commandParts.length; ++i) {
            part = $.trim(commandParts[i]); //console.log('part:', part);

            if (part.indexOf('%%') === 0 && part.indexOf('%% ') !== 0) {
              cleanedPart = part.replace('%%', '');
              subParts = $.trim(cleanedPart).split(/\s+/);

              if (subParts.length > 0) {
                var subPart0 = subParts[0];

                if (subPart0 === 'button_name' || subPart0 === 'caption' || subPart0 === 'caption_pic' || subPart0 === 'caption_video_id' || subPart0 === 'narrator_name' || subPart0 === 'narrator_pic' || subPart0 === 'custom_sticker') {
                  if (subParts.length === 1) {
                    // not enough parameters given, silently ignore
                    continue;
                  }
                }

                var subPart1 = subParts[1];
                var subPart2 = subParts[2];
                var subPart1ToEnd = subParts.slice(1).join(' ');

                switch (subPart0) {
                  case 'comment':
                    break;
                  // we just ignore these. Used to instruct content creators how to use the editing tip cells.

                  case 'title_tag':
                    state.setTooltipTitleTag(subPart1ToEnd);
                    break;

                  case 'button_name':
                    partsRecord.buttonName = subPart1ToEnd;
                    break;

                  case 'caption':
                    // you can make a special caption for this tip
                    partsRecord.caption = subPart1ToEnd;
                    break;

                  case 'caption_pic':
                    // you can put a tiny pic next to the caption (use markdown)
                    partsRecord.captionPic = utils.renderMarkdown(subPart1);
                    break;

                  case 'caption_video_id':
                    // you can put a tiny video next to the caption
                    if (subPart1.indexOf('images/') === 0) {
                      partsRecord.captionVideo = '<video width="150" height="75" autoplay><source src="' + subPart1 + '" type="video/mp4"></video>';
                    } else {
                      partsRecord.captionVideo = '<iframe width="100" height=80 src="https://www.youtube.com/embed/' + subPart1 + '?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0"></iframe>';
                    }

                    break;

                  case 'narrator_name':
                    // set the name of the narrator to display in the control panel during playback
                    if (subPart1 !== undefined) {
                      partsRecord.narratorName = subPart1ToEnd;
                    }

                    break;

                  case 'narrator_pic':
                    // specify a picture to display in the control panel during playback
                    if (subPart1 !== undefined) {
                      partsRecord.narratorPicture = subPart1;
                    }

                    break;

                  case 'hide_player_after_playback_complete':
                    state.setHidePlayerAfterPlayback(true);
                    break;

                  case 'dont_restore_cell_contents_after_playback':
                    // if the user hasn't changed cell contents, don't restore the cell contents when playback finishes
                    state.setDontRestoreCellContentsAfterPlayback(true);
                    break;

                  case 'autoplay':
                    // 'never' (optional), 'once', 'always'
                    if (subPart1 !== undefined) {
                      // if not passed in then its considered to be 'never'
                      partsRecord.autoplay = subPart1.toLowerCase();
                    }

                    break;

                  case 'play_on_click': // if present, we will make a click on the target initiate playback.

                  case 'click_to_play':
                    partsRecord.playOnClick = true;
                    break;

                  case 'hide_tooltip':
                    // if present, we will not render tooltip.
                    partsRecord.hideTooltip = true;
                    break;

                  case 'hide_play_button':
                    // if present, we will render the tooltip but we will not show the play button. 
                    // Used in conjunction with clickToPlay on text graffiti
                    partsRecord.hidePlayButton = true;
                    break;

                  case 'custom_sticker':
                    // Path to an image or svg that will be a custom sticker.
                    partsRecord.stickerImageUrl = subPart1;
                    break;

                  case 'skip_speed':
                    // One of: 0 (absolute jumps), 2x/3x etc (double speed during skips, triple etc), or 2c/3c (compress skips to 2s or 3s or less, etc)
                    var skipParts = subPart1.match(/(.*?)([cx]{0,1}$)/);

                    if (skipParts !== null) {
                      partsRecord.skipInfo = {
                        factor: skipParts[1]
                      };

                      if (skipParts[1] === '0') {
                        partsRecord.skipInfo.type = state.skipTypes['absolute'];
                      } else {
                        partsRecord.skipInfo.type = skipParts[2] === 'c' ? state.skipTypes['compressed'] : state.skipTypes['rapid'];
                      }
                    }

                    break;

                  case 'save_to_file':
                    // Param 1: id of cell to save; param 2: path of file to save cell contents to. You can have more than one of these in a tooltip
                    if (partsRecord.saveToFile === undefined) {
                      partsRecord.saveToFile = [];
                    }

                    var saveFile = subParts[2].replace(/^"/, '').replace(/"$/, '');
                    var sourceCell = subPart1;
                    partsRecord.saveToFile.push({
                      cellId: sourceCell,
                      path: saveFile
                    });
                    break;

                  case 'terminal_command':
                    // pass a shell command to execute, enclosed by double quotes. The outside quotes will be removed.
                    var command = subParts.slice(2).join(' ').replace(/^"/, '').replace(/"$/, '');
                    partsRecord.terminalCommand = {
                      terminalId: subPart1,
                      command: command
                    };
                    break;

                  case 'insert_data_from_file':
                    // pass a cell type and a file to read content from.
                    partsRecord.insertDataFromFile = {
                      cellType: subPart1,
                      // either "code" or "markdown"
                      filePath: subPart2.replace(/^"/, '').replace(/"$/, '') // relative path to file to insert, remove quotes.

                    };
                    break;

                  case 'label_swaps':
                    // Using this directive you can change the displayed text in a graffiti eg. in a graffiti button on a click. Separate
                    // the values using a pipe (|)
                    var swaps = subParts.slice(1).join(' ').split('|');
                    partsRecord.swappingLabels = true;
                    partsRecord.labelSwaps = swaps;
                    break;

                  case 'replay_all_cells':
                    // When this is set we will replay all cells in the entire notebook regardless of whether you interacted with them in the 
                    // recording. Default: false
                    partsRecord.replayAllCells = true;
                    break;

                  case 'scale_cursor_with_window':
                    partsRecord.scaleCursorWithWindow = true;
                    break;

                  case 'silence_warnings':
                    // if this is set, then the warning modal shown if a movie cannot be played (maybe because files are missing) is not displayed.
                    partsRecord.silenceWarnings = true;
                    break;
                }
              }
            }
          }
        }

        return partsRecord;
      },
      refreshGraffitiSideMarkers: function refreshGraffitiSideMarkers(cell) {
        var element = $(cell.element[0]);
        var elemOffset = element.offset();
        element.find('.graffiti-right-side-marker').unbind('mouseenter mouseleave').remove(); // remove all previous markers for this cell

        var markers = element.find('.graffiti-highlight');
        var yBuffer = 2;
        var i, marker, offset, makerIcon, rect, yDiff, className, idMatch, metaData;

        if (markers.length > 0) {
          //console.log('markers:', markers);
          for (i = 0; i < markers.length; ++i) {
            marker = markers[i];
            className = marker.className; // extract the recording tag so we can highlight it later

            idMatch = className.match(/graffiti-(id_.[^\-]+-id_[^\s]+)/);
            metaData = idMatch !== null ? idMatch[1] : undefined;
            offset = $(marker).offset();
            yDiff = offset.top - elemOffset.top;
            markerIcon = stickerLib.makeRightSideMarker({
              color: 'rgb(47,147,107)',
              dimensions: {
                x: element.width() + 20,
                y: yDiff - yBuffer,
                width: 18,
                height: 12
              },
              metaTag: 'graffiti-id|' + metaData,
              title: localizer.getString('GRAFFITI_PRESENT')
            });
            $(markerIcon).appendTo(element);
          }
        }

        var markerIcons = element.find('.graffiti-right-side-marker');

        if (markerIcons.length > 0) {
          markerIcons.bind('mouseenter mouseleave', function (e) {
            var target = $(e.target);

            if (!target.hasClass('graffiti-right-side-marker')) {
              target = target.parents('.graffiti-right-side-marker');
            }

            var graffitiId = target.attr('graffiti-id');
            var cellElement = target.parents('.cell');
            var graffitiElement = cellElement.find('.graffiti-' + graffitiId);

            if (e.type === 'mouseenter') {
              //console.log('entered right-side-marker:', graffitiId);
              graffitiElement.addClass('graffiti-highlight-extra');
            } else {
              //console.log('left right-side-marker', graffitiId);
              graffitiElement.removeClass('graffiti-highlight-extra');
            }
          });
        }
      },
      // Refresh the markDoc calls for any particular cell based on recording data
      refreshGraffitiHighlights: function refreshGraffitiHighlights(params) {
        params.cellId = utils.getMetadataCellId(params.cell.metadata);

        if (params.cell.cell_type !== 'code') {
          return; // We don't refresh highlights in markdown cells because markdown cells do their highlights with plain html markup.
        }

        var recordings = state.getManifestRecordingsForCell(params.cellId);
        var cm = params.cell.code_mirror;
        var marks = cm.getAllMarks();
        var markClasses;

        if (params.clear) {
          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = marks[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var mark = _step5.value;
              mark.clear();
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5["return"] != null) {
                _iterator5["return"]();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        } else {
          markClasses = marks.map(function (mark) {
            return mark.className;
          }).join(' ').replace(/graffiti-highlight /g, '');
        }

        var allTokens = utils.collectCMTokens(cm);
        graffiti.tokenRanges[params.cellId] = {};

        if (recordings !== undefined) {
          if (Object.keys(recordings).length > 0) {
            var keyParts, recording, _recordingKey3, tokens, firstToken, marker, range;

            for (var _i12 = 0, _Object$keys7 = Object.keys(recordings); _i12 < _Object$keys7.length; _i12++) {
              _recordingKey3 = _Object$keys7[_i12];
              recording = recordings[_recordingKey3];
              tokens = recording.tokens; //console.log('recordingKey:', recordingKey);

              range = utils.getCMTokenRange(cm, tokens, allTokens);

              if (range !== undefined) {
                // Store computed character ranges for checking selections against recording ranges.
                graffiti.tokenRanges[params.cellId][_recordingKey3] = range;

                if (params.clear || !params.clear && markClasses !== undefined && markClasses.indexOf(_recordingKey3) === -1) {
                  // don't call markText twice on a previously marked range
                  marker = 'graffiti-' + recording.cellId + '-' + _recordingKey3;
                  cm.markText({
                    line: range.start.line,
                    ch: range.start.ch
                  }, {
                    line: range.end.line,
                    ch: range.end.ch
                  }, {
                    className: 'graffiti-highlight ' + marker
                  });
                }
              }
            }
          }
        }
      },
      refreshAllGraffitiSideMarkers: function refreshAllGraffitiSideMarkers() {
        var activity = state.getActivity();

        if (activity === 'playing' || activity === 'recording' || activity === 'scrubbing') {
          return; // don't update these during playback, recording or scrubbing... too slow
        }

        var cells = Jupyter.notebook.get_cells();
        var _iteratorNormalCompletion6 = true;
        var _didIteratorError6 = false;
        var _iteratorError6 = undefined;

        try {
          for (var _iterator6 = cells[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
            var _cell = _step6.value;
            graffiti.refreshGraffitiSideMarkers(_cell);
          }
        } catch (err) {
          _didIteratorError6 = true;
          _iteratorError6 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion6 && _iterator6["return"] != null) {
              _iterator6["return"]();
            }
          } finally {
            if (_didIteratorError6) {
              throw _iteratorError6;
            }
          }
        }
      },
      refreshAllGraffitiHighlights: function refreshAllGraffitiHighlights() {
        var cells = Jupyter.notebook.get_cells();
        var params;
        var _iteratorNormalCompletion7 = true;
        var _didIteratorError7 = false;
        var _iteratorError7 = undefined;

        try {
          for (var _iterator7 = cells[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
            var _cell2 = _step7.value;
            params = {
              cell: _cell2,
              clear: true
            };
            graffiti.refreshGraffitiHighlights(params);
            graffiti.refreshGraffitiSideMarkers(_cell2);
          }
        } catch (err) {
          _didIteratorError7 = true;
          _iteratorError7 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion7 && _iterator7["return"] != null) {
              _iterator7["return"]();
            }
          } finally {
            if (_didIteratorError7) {
              throw _iteratorError7;
            }
          }
        }

        graffiti.cleanUpButtonBorders();
      },
      updateRefreshableCell: function updateRefreshableCell() {
        var highlightRefreshCellId = state.getHighlightsRefreshCellId();

        if (highlightRefreshCellId !== undefined) {
          var highlightRefreshCell = utils.findCellByCellId(highlightRefreshCellId);

          if (highlightRefreshCell !== undefined) {
            graffiti.refreshGraffitiHighlights({
              cell: highlightRefreshCell,
              clear: true
            });
            graffiti.refreshGraffitiSideMarkers(highlightRefreshCell);
          }

          state.clearHighlightsRefreshableCell();
        }
      },
      hideTip: function hideTip(tip) {
        graffiti.notebookContainer.find('.graffiti-tip .headline').remove(); // we remove the headline forcibly because it could contain a video that we want to stop playing

        graffiti.notebookContainer.find('.graffiti-tip').hide(); // I think this is messing up clickable images.
        //state.clearPlayableMovie('tip');
      },
      refreshGraffitiTooltipsCore: function refreshGraffitiTooltipsCore(highlightElem, eventType) {
        // console.log('Graffiti: handling mousenter/mouseleave/mousemove:', eventType);
        var activity = state.getActivity();

        if (!highlightElem.hasClass('graffiti-highlight')) {
          highlightElem = highlightElem.parents('.graffiti-highlight');
        }

        var highlightElemRect = highlightElem[0].getBoundingClientRect();
        var highlightElemMaxDimension = Math.max(highlightElemRect.width, highlightElemRect.height);
        var highlightElemMaxDimensionSquared = highlightElemMaxDimension * highlightElemMaxDimension;
        var idMatch = highlightElem.attr('class').match(/graffiti-(id_.[^\-]+)-(id_[^\s]+)/);

        if (idMatch !== null) {
          // This is the id of the cell the graffiti was recorded in. the graffiti may have been moved to another cell though, so we need to check
          // if it's mapped to what the reality of the graffit's current location is.
          var cellId = idMatch[1];
          var _recordingKey4 = idMatch[2];
          var viewInfo = state.getViewInfo();

          if (viewInfo === undefined) {
            console.log('Graffiti: warning, viewInfo not defined in refreshGraffitiTooltipsCore!');
            return;
          }

          var hoverCellId = viewInfo.cellId;
          var hoverCell = utils.findCellByCellId(hoverCellId);

          if (hoverCell === undefined) {
            console.log('Graffiti: warning, could not find hoverCell for hoverCellId:', hoverCellId);
            return;
          }

          var hoverCellElement = hoverCell.element[0];
          var hoverCellElementPosition = $(hoverCellElement).position();
          var hoverCellType = hoverCell.cell_type;
          var outerInputElement;

          if (hoverCellType === 'markdown') {
            outerInputElement = $(hoverCellElement).find('.inner_cell');
          } else {
            outerInputElement = $(hoverCellElement).find('.CodeMirror-lines');
          }

          var recording = state.getManifestSingleRecording(cellId, _recordingKey4);

          if (recording === undefined) {
            return;
          } //console.console.log();('refreshGraffitiTooltips: recording=', recording, cellId, recordingKey);


          if (recording.hasMovie) {
            //console.log('Graffiti: refreshGraffitiTooltips: recording=', recording, cellId, recordingKey);
            state.setPlayableMovie('tip', cellId, _recordingKey4, hoverCellId);
          }

          state.setHidePlayerAfterPlayback(false); // default for any recording is not to hide player

          var tooltipCommands = graffiti.extractTooltipCommands(recording.markdown);

          if (recording.playOnClick) {
            //console.log('Graffiti: binding target for click', highlightElem);
            highlightElem.off('click dblclick').bind('click dblclick', function (e) {
              state.clearTipTimeout();
              e.stopPropagation(); // for reasons unknown event still propogates to the codemirror editing area undeneath...

              if (state.getActivity() === 'recordingPending') {
                graffiti.toggleRecording(); // we want clicks on playOnClick to be ignored if a recording is pending.

                return true; // let the focus bubble up so the cell is selected before the recording starts.
              } else {
                graffiti.playMovieViaUserClick();
                return false;
              }
            });
          }

          if (recording.hideTooltip || recording.terminalCommand !== undefined || activity === 'recording') {
            // console.log('Graffiti: recording is set to hide tip or recording is set to run a terminal command, or recording so we do not display tips');
            return;
          }

          var existingTip = graffiti.notebookContainer.find('.graffiti-tip');

          if (eventType === 'mouseleave') {
            state.setTipTimeout(function () {
              graffiti.hideTip();
            }, 500);
          } else {
            var currentPointerPosition = state.getPointerPosition(); // Only show tip if cursor rests on hover for a 1/2 second

            state.setTipTimeout(function () {
              //console.log('tip interval');
              var newPointerPosition = state.getPointerPosition();
              var cursorDistanceSquared = (newPointerPosition.x - currentPointerPosition.x) * (newPointerPosition.x - currentPointerPosition.x) + (newPointerPosition.y - currentPointerPosition.y) * (newPointerPosition.y - currentPointerPosition.y); //console.log('comparing currentPointerPosition, newPointerPosition:', currentPointerPosition,
              //newPointerPosition, cursorDistanceSquared);
              // Only show tip if cursor isn't flying over the item at high speeds

              if (cursorDistanceSquared > highlightElemMaxDimensionSquared) {
                currentPointerPosition = state.getPointerPosition();
              } else {
                var contentMarkdown = ''; //console.log('markId:', markId, 'recordings:', hoverCell.metadata.recordings);

                var headlineMarkdown = '';

                if (tooltipCommands !== undefined) {
                  headlineMarkdown = '<div class="headline">' + ' <div>' + tooltipCommands.captionPic + '</div>' + ' <div>' + tooltipCommands.caption + '</div>' + (tooltipCommands.captionVideo !== undefined ? ' <div class="graffiti-video">' + tooltipCommands.captionVideo + '</div>' : '') + '</div>';
                }

                contentMarkdown = utils.renderMarkdown(recording.markdown); // if no tooltip is defined, show a default message. in this case, entire tip becomes clickable to play any movie this graffiti may have

                var entireTipClickable = false;

                if (contentMarkdown.length === 0 && recording.hidePlayButton) {
                  contentMarkdown = utils.renderMarkdown('_' + localizer.getString('TOOLTIP_HINT') + '_');
                  entireTipClickable = true;
                }

                var tooltipContents = headlineMarkdown + '<div class="parts">' + '<div class="info">' + contentMarkdown + '</div>';

                if (recording.hasMovie && !recording.hidePlayButton) {
                  graffiti.tooltipButtonLabel = tooltipCommands !== undefined && tooltipCommands.buttonName !== undefined ? tooltipCommands.buttonName : 'Play Movie';
                  tooltipContents += '   <div class="movie"><button class="btn btn-default btn-small" id="graffiti-movie-play-btn">' + graffiti.tooltipButtonLabel + '</button></div>';
                }

                tooltipContents += '</div>';

                if (existingTip.length === 0) {
                  existingTip = $('<div class="graffiti-tip" id="graffiti-tip">' + tooltipContents + '</div>').prependTo(graffiti.notebookContainer);
                  existingTip.bind('mouseenter mouseleave', function (e) {
                    // console.log(eventType === 'mouseenter' ? 'entering tooltip' : 'leaving tooltip');
                    if (e.type === 'mouseenter') {
                      state.clearTipTimeout();
                    } else {
                      //console.log('hiding tip');
                      graffiti.hideTip();
                    }
                  });
                } else {
                  // Don't replace the tip if the contents are identical to what we had on the last interval.
                  var currentTipInfo = state.getDisplayedTipInfo();
                  var doUpdate = true;

                  if (headlineMarkdown.length === 0) {
                    // always do an update if this tooltip contains a headline, because it may have been removed by hideTip().
                    if (!graffiti.forcedGraffitiTooltipRefresh) {
                      if (currentTipInfo !== undefined) {
                        if (currentTipInfo.cellId === cellId && currentTipInfo.recordingKey === _recordingKey4) {
                          doUpdate = false;
                        }
                      }
                    }
                  }

                  graffiti.forcedGraffitiTooltipRefresh = false;

                  if (doUpdate) {
                    //console.log('replacing tooltip contents,' ,tooltipContents);
                    existingTip.find('#graffiti-movie-play-btn').unbind('click');
                    existingTip.html(tooltipContents);
                    state.setDisplayedTipInfo(cellId, _recordingKey4);
                  } else {
                    if (graffiti.tooltipButtonLabel !== undefined) {
                      $('#graffiti-movie-play-btn').html(graffiti.tooltipButtonLabel);
                    }
                  }

                  $('#graffiti-movie-play-btn').prop('disabled', false);
                } // Set up the call back for the play button on the tooltip that will actually play the movie
                // (or the entire tip, when the entire tip is clickable)


                var bindableTip = entireTipClickable ? existingTip : existingTip.find('#graffiti-movie-play-btn');
                bindableTip.unbind('click').click(function (e) {
                  state.clearTipTimeout();
                  e.stopPropagation(); // for reasons unknown event still propogates to the codemirror editing area undeneath...

                  graffiti.playMovieViaUserClick();
                  return false;
                });
                var outerInputOffset = outerInputElement.offset();
                var outerInputElementWidth = outerInputElement.width();
                var highlightElemOffset = highlightElem.offset();
                var existingTipWidth = existingTip.width();
                var existingTipHeight = existingTip.height();
                var tipTop = parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - graffiti.tipAboveFudge;
                var tipLeft,
                    anchorIsImage = false;

                if (hoverCellType === 'markdown') {
                  var anchorImage = highlightElem.find('img');

                  if (anchorImage.length > 0) {
                    var anchorElemOffset = anchorImage.offset(); //console.log('anchorElemOffset', anchorElemOffset);

                    tipLeft = anchorElemOffset.left + anchorImage.width() / 2 - existingTipWidth / 2;
                    tipTop = anchorElemOffset.top - outerInputOffset.top + anchorImage.height() / 2 - existingTipHeight / 2;
                    anchorIsImage = true; //console.log('image tipLeft, tipTop:', tipLeft, tipTop);
                  } else {
                    var anchorElem = highlightElem.find('i');

                    var _anchorElemOffset = anchorElem.offset();

                    var posCandidate1 = outerInputElementWidth - existingTipWidth + outerInputOffset.left - graffiti.notebookContainerPadding;
                    var posCandidate2 = _anchorElemOffset.left;
                    tipLeft = parseInt(Math.min(posCandidate1, posCandidate2));
                  }
                } else {
                  tipLeft = parseInt(Math.min(outerInputElementWidth - existingTipWidth, Math.max(highlightElemOffset.left, outerInputOffset.left)));
                } // Place tip in the best position on the screen.


                var tipPosition = {
                  left: tipLeft,
                  top: tipTop
                }; //console.log('outerInputOffset:', outerInputOffset, 'highlightElemOffset:', highlightElemOffset, 'tipPosition:', tipPosition);
                //console.log('1) tipPosition:', tipPosition);

                var headerRect = $('#header')[0].getBoundingClientRect(); // If the highlight element is in the upper half of the notebook panel area, flip the tooltip to be below the highlightElem.

                var rectDifference = highlightElemRect.top - headerRect.bottom - 20;

                if (rectDifference < existingTipHeight && !anchorIsImage) {
                  // place tip below the line
                  tipPosition.top = highlightElemOffset.top - outerInputOffset.top + graffiti.cmLineHeight + graffiti.cmLineTipFudge;
                } //console.log('2) tipPosition:', tipPosition);


                tipPosition.top += hoverCellElementPosition.top; //console.log('3) tipPosition:', tipPosition);

                var positionPx = {
                  left: tipPosition.left + 'px',
                  top: tipPosition.top + 'px'
                };
                existingTip.css(positionPx);
                existingTip.show(); // increase counter of total tips shown this session

                state.updateUsageStats({
                  type: 'tip',
                  data: {
                    cellId: cellId,
                    recordingKey: _recordingKey4
                  }
                });
              }
            }, 425); // this number is how long user has to hover before we display the tooltip
          }
        }
      },
      refreshGraffitiTooltips: function refreshGraffitiTooltips() {
        var tips = $('.graffiti-highlight'); //console.trace('refreshGraffitiTooltips: binding mousenter/mouseleave');

        tips.unbind('mouseenter mouseleave mousemove').bind('mouseenter mouseleave mousemove', function (e) {
          graffiti.refreshGraffitiTooltipsCore($(e.target), e.type);
        });
      },
      handleExecuteCellViaGraffiti: function handleExecuteCellViaGraffiti() {
        var selectedCell = Jupyter.notebook.get_selected_cell();

        if (selectedCell.cell_type === 'code') {
          var config = utils.getCellGraffitiConfig(selectedCell);

          if (config !== undefined) {
            if (config.hasOwnProperty('executeCellViaGraffiti')) {
              var execKey = config['executeCellViaGraffiti'];
              var keyParts = execKey.split('_');
              state.setPlayableMovie('cellExecute', 'id_' + keyParts[0], 'id_' + keyParts[1]);
              graffiti.loadAndPlayMovie('cellExecute');
              return true;
            }
          }
        }

        return false;
      },
      clearSkipKeyDownTimer: function clearSkipKeyDownTimer() {
        clearTimeout(graffiti.skipKeyDownTimer);
        graffiti.skipKeyDownTimer = undefined;
      },
      handleKeydown: function handleKeydown(e) {
        var keyCode = e.which;
        var activity = state.getActivity();
        var stopProp = false; //console.log('handleKeydown keyCode:', e, keyCode, String.fromCharCode(keyCode));

        if (activity === 'recording') {
          if (keyCode === graffiti.skipKeyCode) {
            graffiti.skipKeyDownTimer = setTimeout(function () {
              console.log('Graffiti: ending recording by key press.');
              graffiti.skipKeyDownTimer = undefined;
              graffiti.endRecordingByKeyPress();
            }, state.END_RECORDING_KEYDOWN_TIMEOUT);
          }
        }

        if (terminalLib.getFocusedTerminal() !== undefined) {
          // Let any focused terminal handle the event. Don't let jupyter or anybody else get it. 
          // (Graffiti will need to capture the data during recording though.)
          // console.log('Graffiti: Focused terminal so stopping propogation');
          e.stopPropagation();
          return true;
        } // If user hit shift-enter or ctrl-enter, in a code cell, and it is marked as "executeCellViaGraffiti" then it will
        // actually run a graffiti movie when you try to execute that cell, rather than the jupyter default (only when in 'idle' activity)


        if (activity === 'idle') {
          if (keyCode === 13) {
            if (e.ctrlKey || e.shiftKey) {
              if (graffiti.handleExecuteCellViaGraffiti()) {
                console.log('Graffiti: executedCellViaGraffiti ran, so: intercepting return-key press.');
                e.stopPropagation();
                return true;
              }
            }
          }
        }

        if ((48 <= keyCode && keyCode <= 57 || // A-Z
        65 <= keyCode && keyCode <= 90 || // 0-9
        37 <= keyCode && keyCode <= 40 || // arrow keys                
        keyCode === 32) && // space bar
        activity === 'playing' && !e.metaKey && // allow things like cmd-R, hit while playing, to be considered in the switch below. 
        !e.ctrlKey && !e.altKey) {
          // Pressing keys : A-Z, 0-9, arrows, and spacebar stop any playback in progress.
          stopProp = true;
          graffiti.togglePlayback();
        } else {
          // Check for other keypress actions
          switch (keyCode) {
            case 27:
              // escape key CANCELS playback
              stopProp = true;

              if (activity === 'playing' || activity === 'playbackPaused' || activity === 'playbackPending' || activity === 'scrubbing') {
                graffiti.cancelPlayback();

                if (activity === 'playbackPending') {
                  state.updateUsageStats({
                    type: 'userInterruptedLoading'
                  });
                }
              }

              break;

            case 16:
              // shift key
              state.setShiftKeyIsDown(true);
              state.updateDrawingState([{
                change: 'stickerOnGrid',
                data: true
              }]); //console.log('Graffiti: shiftKeyIsDown');

              break;
            // case 13: // enter key
            // case 18: // meta key
            // case 91: // option key
            //   break;

            default:
              break;
            // let any other keys pass through
          }
        }

        if (stopProp) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }

        return true;
      },
      handleKeyup: function handleKeyup(e) {
        //console.log('keyUp e.which:', e.which);
        var keyCode = e.which;

        if (keyCode === 16) {
          state.setShiftKeyIsDown(false);
          state.updateDrawingState([{
            change: 'stickerOnGrid',
            data: false
          }]);
        } else {
          if (keyCode === graffiti.skipKeyCode && graffiti.skipKeyDownTimer !== undefined) {
            graffiti.clearSkipKeyDownTimer();
            graffiti.toggleRecordingSkip();
            return true;
          }
        }

        return false;
      },
      // If the skip key was down then we want to cancel the timeout it created, because a mouse click happened (e.g. option-select)
      handleGeneralClick: function handleGeneralClick(e) {
        //console.log('handled a click');
        graffiti.clearSkipKeyDownTimer();
        return false;
      },
      setupBackgroundEvents: function setupBackgroundEvents() {
        // Handle rubber banding scrolling that occurs on short notebooks so cursor doesn't look wrong (possibly, only chrome?).
        console.log('Graffiti: setupBackgroundEvents');
        graffiti.sitePanel.on('scroll', function (e) {
          var notebookPanelHeight = graffiti.notebookPanel.height();
          var viewInfo = utils.collectViewInfo(state.getPointerPosition().x, state.getPointerPosition().y, graffiti.notebookPanel.height(), graffiti.sitePanel.scrollTop() - state.getScrollTop());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('scroll');

          if (state.getActivity() === 'playbackPaused') {
            graffiti.undimGraffitiCursor();
          }

          return true;
        }); // Temporarily defeating mousewheel pausing of playback because of all the issues showing up
        // when graffitized notebooks are in an iframe. Since the iframe doesn't know its extents accurately
        // visavis the viewport, the user sometimes needs to manually scroll around to keep up with a video
        // that's playing in an iframe. Mousewheel-pause was defeating this workaround so it's turned off.
        // 3/18/19

        /*
                graffiti.sitePanel.on('mousewheel', (e) => {
                  if (state.getActivity() === 'playing') {
                    console.log('Graffiti: pausing playback because of mousewheel scroll.');
                    graffiti.pausePlayback();
                  }
                });
        */

        $('body').keydown(function (e) {
          return graffiti.handleKeydown(e);
        });
        $('body').keyup(function (e) {
          return graffiti.handleKeyup(e);
        });
        $('body, .cell').click(function (e) {
          graffiti.handleGeneralClick(e);
        });

        window.onmousemove = function (e) {
          //console.log('cursorPosition:[',e.clientX, e.clientY, ']');
          //console.log('mouse_e:', e.pageX, e.pageY);
          var previousPointerPosition = state.getPointerPosition();
          var previousPointerX = previousPointerPosition.x;
          var previousPointerY = previousPointerPosition.y;
          state.storePointerPosition(e.clientX, e.clientY); // keep track of current pointer position at all times

          var viewInfo = utils.collectViewInfo(e.clientX, e.clientY, graffiti.notebookPanel.height(), graffiti.sitePanel.scrollTop() - state.getScrollTop());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('pointer');
          var doDrawingDisplayUpdate = true;
          var drawingActivity = state.getDrawingStateField('drawingActivity');

          if (drawingActivity === 'sticker') {
            var stickerType = state.getDrawingPenAttribute('stickerType');

            if (stickerType === 'label') {
              // We do not want to update the label during recording because this fn is called via onmousemove.
              // We update the label directly from handleLabelInput(), above, for that special case. Otherwise, we
              // will end up dragging the label around the screen while the mousebutton is down.
              doDrawingDisplayUpdate = false;
            }
          }

          if (doDrawingDisplayUpdate) {
            graffiti.updateDrawingDisplayWhenRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo);
          }

          graffiti.placeControlPanel({});
          return true; // let this event bubble
        };

        var navigateAwayHandler = function navigateAwayHandler(e) {
          console.log('Graffiti: navigate away handler, e:', e.type);
          var activity = state.getActivity();

          if (activity === 'playing' || activity === 'playbackPaused' || activity === 'playbackPending' || activity == 'scrubbing') {
            graffiti.cancelPlaybackNoVisualUpdates();
          }

          if (workspace.trackUsageStats !== undefined) {
            workspace.trackUsageStats();
          }
        }; // If we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue. 
        // Needs more testing!!


        window.addEventListener('beforeunload', function (e) {
          navigateAwayHandler(e);
        });

        window.onunload = function (e) {
          navigateAwayHandler(e);
        }; // https://stackoverflow.com/questions/19469881/remove-all-event-listeners-of-specific-type


        window.addEventListener('dblclick', function (e) {
          if (state.getActivity() === 'recording') {
            var isTextCell = $(e.target).parents('.text_cell');

            if (isTextCell.length > 0) {
              console.log('Graffiti: intercepted doubleclick on markdown during recording, discarding it');
              e.stopPropagation();
              e.preventDefault();
              return true;
            }
          }

          return false;
        }, true);
        window.onblur = function (e) {
          //console.log('window lost focus, pausing any playing movie');
          graffiti.pausePlayback();
        }, // Serialize/deserialize range objects
        // https://github.com/tildeio/range-serializer
        // https://www.npmjs.com/package/serialize-selection
        // Specially handle selection changes in rendered markdown cells and output areas during recordings
        document.addEventListener("selectionchange", function () {
          // get the selection and serialize it
          if (state.getActivity() === 'recording') {
            state.clearSelectionSerialized();
            var viewInfo = state.getViewInfo();
            var cellId = viewInfo.cellId;

            if (cellId !== undefined) {
              var hoverCell = utils.findCellByCellId(cellId);
              var parentNode;

              if (hoverCell.cell_type === 'markdown') {
                parentNode = $(hoverCell.element).find('.rendered_html');
              } else {
                parentNode = $(hoverCell.element).find('.output_subarea');
              }

              if (parentNode.length > 0) {
                var selectionSerialized = selectionSerializer.get(parentNode[0]);

                if (!selectionSerialized.empty) {
                  selectionSerialized.cellType = hoverCell.cell_type;
                  selectionSerialized.cellId = cellId; // utils.shrinkAllCMSelections(); // cancel all CM selections as they will prevent replaying selection changes in other dom elements

                  state.setSelectionSerialized(selectionSerialized);
                  state.storeHistoryRecord('selections');
                }
              }
            }
          }
        });
        graffiti.handleSliderDragDebounced = _.debounce(graffiti.handleSliderDrag, 20, false);
        console.log('Graffiti: Background setup complete.');
      },
      setRecordingTakeId: function setRecordingTakeId(recordingRecord) {
        if (recordingRecord.activeTakeId === undefined || state.getMovieRecordingStarted()) {
          // if making a new take, must create a new activeTakeId
          recordingRecord.activeTakeId = utils.generateUniqueId(); // do not set a new activeTakeId if there was already a valid one set for the movie
        }
      },
      storeRecordingInfoInCell: function storeRecordingInfoInCell(isOldGraffiti) {
        var recordingRecord, newRecording, recordingCell, recordingCellId, recordingKey;
        var selectedTokens = graffiti.selectedTokens;

        if (isOldGraffiti === undefined) {
          isOldGraffiti = selectedTokens.isIntersecting;
        }

        if (isOldGraffiti) {
          // Prepare to update existing recording
          recordingCellId = utils.extractRecordingCellId(selectedTokens);
          recordingCell = selectedTokens.recordingCell;
          recordingKey = selectedTokens.recordingKey;
          recordingRecord = state.getManifestSingleRecording(recordingCellId, recordingKey);
          graffiti.previousActiveTakeId = recordingRecord.activeTakeId;
          graffiti.setRecordingTakeId(recordingRecord);
          newRecording = false;
        } else {
          // Prepare to create a new recording
          graffiti.previousActiveTakeId = undefined;
          recordingCell = Jupyter.notebook.get_selected_cell();
          recordingCellId = utils.getMetadataCellId(recordingCell.metadata);
          recordingKey = utils.generateUniqueId();
          newRecording = true;
          recordingRecord = {
            cellId: recordingCellId,
            cellType: recordingCell.cell_type,
            createDate: utils.getNow(),
            inProgress: true,
            tokens: $.extend({}, graffiti.selectedTokens.tokens),
            range: $.extend({}, graffiti.selectedTokens.range),
            allTokensString: graffiti.selectedTokens.allTokensString,
            markdown: '',
            authorId: state.getAuthorId(),
            authorType: state.getAuthorType(),
            // one of "creator" (eg teacher), "viewer" (eg student)
            activeTakeId: undefined,
            // this will be replaced with an id for the first movie recording made
            hasMovie: false
          };
          state.setSingleManifestRecording(recordingCellId, recordingKey, recordingRecord);
        }

        state.storeRecordingCellInfo({
          newRecording: newRecording,
          recordingRecord: recordingRecord,
          recordingCell: recordingCell,
          recordingCellId: recordingCellId,
          recordingKey: recordingKey,
          scrollTop: graffiti.sitePanel.scrollTop()
        });
        return recordingRecord;
      },
      clearHighlightMarkText: function clearHighlightMarkText() {
        if (graffiti.highlightMarkText !== undefined) {
          graffiti.highlightMarkText.clear();
          graffiti.highlightMarkText = undefined;
        }
      },
      highlightIntersectingGraffitiRange: function highlightIntersectingGraffitiRange() {
        graffiti.clearHighlightMarkText();

        if (state.getAccessLevel() === 'view') {
          // we never do this in view mode
          return;
        }

        var cell = graffiti.selectedTokens.recordingCell;

        if (cell !== undefined) {
          var cm = cell.code_mirror;
          var startLoc = cm.posFromIndex(graffiti.selectedTokens.range.start);
          var endLoc = cm.posFromIndex(graffiti.selectedTokens.range.end);
          graffiti.highlightMarkText = cm.markText(startLoc, endLoc, {
            className: 'graffiti-selected'
          });
        }
      },
      selectIntersectingGraffitiRange: function selectIntersectingGraffitiRange() {
        if (graffiti.selectedTokens.noTokensPresent) {
          return;
        }

        var recordingCellInfo = state.getRecordingCellInfo();
        var recordingCell = recordingCellInfo.recordingCell;
        var cm = recordingCell.code_mirror;
        var startLoc = cm.posFromIndex(graffiti.selectedTokens.range.start);
        var endLoc = cm.posFromIndex(graffiti.selectedTokens.range.end);
        cm.setSelections([{
          anchor: startLoc,
          head: endLoc
        }]);
        graffiti.selectedTokens = utils.findSelectionTokens(recordingCell, graffiti.tokenRanges, state);
        graffiti.highlightIntersectingGraffitiRange();
      },
      // Edit an existing graffiti, or if we are creating a new one, set up some default values.
      // If creating a new graffiti in markdown text, jump directly to the movie recording phase.
      editGraffiti: function editGraffiti() {
        var editableText;
        graffiti.changeActivity('graffiting');
        state.setLastEditActivityTime();
        var isNewGraffiti = !graffiti.selectedTokens.isIntersecting;
        var isOldGraffiti = !isNewGraffiti;
        var recordingRecord = graffiti.storeRecordingInfoInCell(isOldGraffiti);
        var activeCellIndex = Jupyter.notebook.get_selected_index();
        var isMarkdownCell = recordingRecord.cellType === 'markdown';
        var isCodeCell = recordingRecord.cellType === 'code';
        var graffitiEditCell = Jupyter.notebook.insert_cell_above('markdown');
        var editCellIndex = utils.findCellIndexByCellId(utils.getMetadataCellId(graffitiEditCell.metadata));
        Jupyter.notebook.select(editCellIndex); // cell *must* be selected before unrender() called by set_text() below will actually unrender the cell correctly.

        if (isNewGraffiti || isCodeCell || isMarkdownCell && isOldGraffiti) {
          utils.setMetadataCellId(graffitiEditCell.metadata, utils.generateUniqueId());
          utils.refreshCellMaps();
          state.setGraffitiEditCellId(utils.getMetadataCellId(graffitiEditCell.metadata));
        }

        if (isNewGraffiti) {
          if (isMarkdownCell) {
            // Set up some reasonable options for Graffiti in markdown. Author can, of course, opt to change these any time.
            editableText = localizer.getString('BELOW_TYPE_MARKDOWN') + "%%play_on_click\n" + "%%hide_play_button\n";
          } else {
            editableText = localizer.getString('BELOW_TYPE_MARKDOWN') + graffiti.selectedTokens.allTokensString;
          }
        } else {
          // Use whatever author put into this graffiti previously
          editableText = recordingRecord.markdown;
        }

        graffitiEditCell.set_text(editableText);

        if (isCodeCell || isOldGraffiti) {
          // For code cell graffiti or non-new markdown graffiti, let us edit the tip contents by scrolling to the edit cell
          Jupyter.notebook.scroll_to_cell(Math.max(0, activeCellIndex), 500);
          var selectedCell = Jupyter.notebook.get_selected_cell();
          selectedCell.unselect();
          graffitiEditCell.select();
          graffitiEditCell.code_mirror.focus();
          graffitiEditCell.code_mirror.setSelection({
            line: 2,
            ch: 0
          }, {
            line: 10000,
            ch: 10000
          });
        }

        if (isMarkdownCell && isNewGraffiti) {
          // Proceed directly to recording a movie, assuming we want to persist this new graffiti (no way to cancel)
          graffiti.finishGraffiti(true).then(function () {
            graffiti.setRecordingTakeId(recordingRecord); // Force this function to treat this as a new movie even though we've automatically created the manifest entry.

            graffiti.beginMovieRecordingProcess(true, recordingRecord);
          });
        }
      },
      finishGraffiti: function finishGraffiti(doSave) {
        var activity = state.getActivity();

        if (activity !== 'graffiting') {
          return;
        }

        var recordingCellInfo = state.getRecordingCellInfo();
        var recordingCell = recordingCellInfo.recordingCell;
        var editCellIndex = utils.findCellIndexByCellId(state.getGraffitiEditCellId());
        var editCellContents = '';

        if (editCellIndex !== undefined) {
          var editCell = utils.findCellByCellId(state.getGraffitiEditCellId());
          editCellContents = editCell.get_text();
          Jupyter.notebook.delete_cell(editCellIndex); // Save the graffiti text into the right cell recording.

          var recordings = state.getManifestRecordingsForCell(recordingCellInfo.recordingCellId);

          if (doSave) {
            if (recordingCellInfo.newRecording) {
              recordings[recordingCellInfo.recordingKey] = recordingCellInfo.recordingRecord;
            }

            recordings[recordingCellInfo.recordingKey].markdown = editCellContents;
            var tooltipCommands = graffiti.extractTooltipCommands(editCellContents);
            var recording = recordings[recordingCellInfo.recordingKey];
            recording.autoplay = 'never';

            if (tooltipCommands.autoplay === 'always') {
              recording.autoplay = 'always';
            } else if (tooltipCommands.autoplay === 'once') {
              recording.autoplay = 'once';
              recording.playedOnce = false;
            } // These next lines should be reduce to a single $.extend() call...


            recording.playOnClick = tooltipCommands.playOnClick;
            recording.hideTooltip = tooltipCommands.hideTooltip;
            recording.hidePlayButton = tooltipCommands.hidePlayButton;
            recording.narratorName = tooltipCommands.narratorName;
            recording.narratorPicture = tooltipCommands.narratorPicture;
            recording.stickerImageUrl = tooltipCommands.stickerImageUrl;
            recording.skipInfo = $.extend({}, tooltipCommands.skipInfo);
            recording.saveToFile = tooltipCommands.saveToFile;
            recording.terminalCommand = tooltipCommands.terminalCommand;
            recording.insertDataFromFile = tooltipCommands.insertDataFromFile;
            recording.silenceWarnings = tooltipCommands.silenceWarnings;
            recording.replayAllCells = tooltipCommands.replayAllCells;
            recording.scaleCursorWithWindow = tooltipCommands.scaleCursorWithWindow;
            recording.swappingLabels = tooltipCommands.swappingLabels;
            recording.labelSwaps = tooltipCommands.labelSwaps;
            state.updateUsageStats({
              type: 'create',
              data: {
                createDate: recording.createDate,
                cellId: recordingCellInfo.recordingCellId,
                recordingKey: recordingCellInfo.recordingKey,
                numTakes: recording.takes === undefined ? 0 : Object.keys(recording.takes).length
              }
            }); // console.log('Graffiti: finishGraffiti: we got these stats:', state.getUsageStats(), recording);
          } else {
            // Not saving (recording cancelled by user), so make sure we remove this record from the manifest before saving.
            if (recordingCellInfo.newRecording) {
              state.removeManifestEntry(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
            }
          }
        }

        storage.storeManifest();

        if (recordingCell.cell_type === 'markdown' && recordingCellInfo.newRecording && doSave) {
          // If we were adding a Graffiti to a markdown cell, we need to modify the markdown cell to include 
          // our Graffiti span tag around the selection.
          var contents = recordingCell.get_text();
          var parts = [];
          parts.push(contents.substring(0, recordingCellInfo.recordingRecord.range.start));
          parts.push(contents.substring(recordingCellInfo.recordingRecord.range.start, recordingCellInfo.recordingRecord.range.end));
          parts.push(contents.substring(recordingCellInfo.recordingRecord.range.end));
          var spanOpenTag = '<span class="graffiti-highlight graffiti-' + recordingCellInfo.recordingCellId + '-' + recordingCellInfo.recordingKey + '"><i></i>'; // empty italic helps us find its anchor for tooltip

          var newContents = parts[0] + spanOpenTag + parts[1] + '</span>' + parts[2]; //console.log('newContents:', newContents);

          recordingCell.set_text(newContents);
        }

        utils.saveNotebookDebounced();
        return new Promise(function (resolve) {
          // need to reselect graffiti text that was selected in case it somehow got unselected
          //recordingCell.code_mirror.setSelections(recordingCellInfo.selections);
          graffiti.sitePanel.animate({
            scrollTop: recordingCellInfo.scrollTop
          }, 500);

          if (recordingCellInfo.recordingRecord.cellType === 'markdown') {
            recordingCell.render();
          }

          graffiti.changeActivity('idle');
          recordingCell.code_mirror.focus();

          if (doSave) {
            graffiti.refreshGraffitiHighlights({
              cell: recordingCell,
              clear: false
            });
            graffiti.forcedGraffitiTooltipRefresh = true;
          } else {
            graffiti.refreshGraffitiHighlights({
              cell: recordingCell,
              clear: true
            });
          }

          graffiti.refreshGraffitiTooltipsDebounced();
          graffiti.refreshAllGraffitiSideMarkers();
          utils.refreshCellMaps();
          state.refreshCellIdToGraffitiMap();
          resolve();
        });
      },
      removeGraffitiCore: function removeGraffitiCore(recordingCellId, recordingKey) {
        var recordingCell = utils.findCellByCellId(recordingCellId);
        var locationCell;

        if (recordingCell !== undefined) {
          if (recordingCell.cell_type === 'code') {
            locationCell = recordingCell; // note the *code* cell where this graffiti is currently present
          }
        }

        var locationCellId = utils.findCellIdByLocationMap(recordingCellId, recordingKey); // find the actual cell where the graffiti is now living.

        if (locationCellId !== undefined) {
          locationCell = utils.findCellByCellId(locationCellId); // find the *markdown* cell where this recording is currently present
        }

        var currentActivity = state.getActivity();

        if (locationCell.cell_type === 'markdown') {
          // If this Graffiti was in a markdown cell we need to remove the span tags from the markdown source
          var contents = locationCell.get_text();
          var spanRegex = RegExp('<span class="graffiti-highlight graffiti-' + recordingCellId + '-' + recordingKey + '"><i></i>(.*?)</span>', 'gm');
          var results,
              foundContents = [];

          while ((results = spanRegex.exec(contents)) !== null) {
            foundContents.push(results);
          }

          ;

          if (foundContents.length > 0) {
            var innerContents = foundContents[0][1];
            var sourceContents = '<span class="graffiti-highlight graffiti-' + recordingCellId + '-' + recordingKey + '"><i></i>' + innerContents + '</span>';
            var cleanedContents = contents.replace(sourceContents, innerContents); // For some unknown reason we have to select a cell before calling set_text() on it, for that fn to work.

            utils.selectCellByCellId(locationCellId);
            setTimeout(function () {
              locationCell.set_text(cleanedContents);
              locationCell.render(); // re-render the cell because set_text will unrender it.
            }, 0);
          }
        }

        storage.deleteMovie(recordingCellId, recordingKey);
        utils.queueSaveNotebookCallback(function () {
          graffiti.updateControlPanels();
        });
        utils.saveNotebookDebounced();
      },
      removeAllGraffitis: function removeAllGraffitis(graffitiDisabled) {
        var manifest = state.getManifest(); // save manifest before we wipe it out

        state.setManifest({}); // clear ALL graffiti in the manifest

        var recording,
            recordingCellId,
            recordingCell,
            recordingIds,
            recordingKeys,
            destructions = 0;

        for (var _i13 = 0, _Object$keys8 = Object.keys(manifest); _i13 < _Object$keys8.length; _i13++) {
          recordingCellId = _Object$keys8[_i13];
          console.log('Graffiti: Removing recordings from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);

          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            var _iteratorNormalCompletion8 = true;
            var _didIteratorError8 = false;
            var _iteratorError8 = undefined;

            try {
              for (var _iterator8 = recordingKeys[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                recordingKey = _step8.value;
                console.log('Graffiti: Removing recording id:', recordingKey);
                recording = manifest[recordingCellId][recordingKey];
                destructions++;
                graffiti.removeGraffitiCore(recordingCellId, recordingKey);

                if (recordingCell !== undefined) {
                  graffiti.refreshGraffitiHighlights({
                    cell: recordingCell,
                    clear: true
                  });
                  graffiti.refreshGraffitiSideMarkers(recordingCell);
                }
              }
            } catch (err) {
              _didIteratorError8 = true;
              _iteratorError8 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion8 && _iterator8["return"] != null) {
                  _iterator8["return"]();
                }
              } finally {
                if (_didIteratorError8) {
                  throw _iteratorError8;
                }
              }
            }
          }
        }

        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();

        if (graffitiDisabled) {
          if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) {
            storage.deleteDataDirectory(Jupyter.notebook.metadata.graffiti.id);
            storage.removeGraffitiIds();
            graffiti.changeAccessLevel('view');
            graffiti.updateSetupButton();
          }
        }

        utils.queueSaveNotebookCallback(function () {
          if (destructions === 0) {
            destructions = 'all';
          }

          var title, body;

          if (graffitiDisabled) {
            title = 'Graffiti has been disabled on this Notebook.';
            body = 'We removed ' + destructions + ' graffitis, and you will need to Enable Graffiti again to use Graffiti in this notebook.' + 'You will also now want to remove the Graffiti data directory (jupytergraffiti_data) manually.';
          } else {
            title = 'Your notebook is now cleaned of all graffiti.';
            body = 'We removed ' + destructions + ' graffitis. Feel free to create new ones.';
          }

          dialog.modal({
            title: title,
            body: body,
            sanitize: false,
            buttons: {
              'OK': {
                click: function click(e) {
                  console.log('Graffiti: You clicked ok, you want to remove ALL graffitis');
                }
              }
            }
          });
        });
        utils.saveNotebookDebounced();
      },
      refreshAfterDeletions: function refreshAfterDeletions(recordingCellId) {
        graffiti.highlightIntersectingGraffitiRange();
        var recordingCell = utils.findCellByCellId(recordingCellId);

        if (recordingCell !== undefined) {
          graffiti.refreshGraffitiHighlights({
            cell: recordingCell,
            clear: true
          });
          graffiti.refreshGraffitiSideMarkers(recordingCell);
        }

        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();
      },
      removeGraffiti: function removeGraffiti(recordingCellId, recordingKey) {
        graffiti.removeGraffitiCore(recordingCellId, recordingKey);

        if (state.removeManifestEntry(recordingCellId, recordingKey)) {
          storage.storeManifest();
          graffiti.refreshAfterDeletions(recordingCellId);
        }
      },
      removeAllGraffitisWithConfirmation: function removeAllGraffitisWithConfirmation() {
        dialog.modal({
          title: 'Are you sure you want to remove ALL graffitis from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: You clicked ok, you want to remove ALL graffitis');
                graffiti.removeAllGraffitis(false);
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: you cancelled:', $(e.target).parent());
              }
            }
          }
        });
      },
      removeUnusedTakes: function removeUnusedTakes(recordingFullId) {
        var parts = utils.parseRecordingFullId(recordingFullId);
        var recordingCell = utils.findCellByCellId(parts.recordingCellId);

        if (recordingCell !== undefined) {
          storage.removeUnusedTakes(parts.recordingCellId, parts.recordingKey);
          graffiti.refreshAfterDeletions(recordingCellId);
        }
      },
      removeAllUnusedTakes: function removeAllUnusedTakes() {
        var manifest = state.getManifest(); // save manifest before we wipe it out

        var recording,
            recordingCellId,
            recordingCell,
            recordingIds,
            recordingKeys,
            deletedTakes = 0;

        for (var _i14 = 0, _Object$keys9 = Object.keys(manifest); _i14 < _Object$keys9.length; _i14++) {
          recordingCellId = _Object$keys9[_i14];
          console.log('Graffiti: Removing unused takes from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);

          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            var _iteratorNormalCompletion9 = true;
            var _didIteratorError9 = false;
            var _iteratorError9 = undefined;

            try {
              for (var _iterator9 = recordingKeys[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                recordingKey = _step9.value;
                console.log('Graffiti: Removing unused takes from recording id:', recordingKey);
                recording = manifest[recordingCellId][recordingKey];
                deletedTakes += storage.removeUnusedTakesCore(recordingCellId, recordingKey);
              }
            } catch (err) {
              _didIteratorError9 = true;
              _iteratorError9 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion9 && _iterator9["return"] != null) {
                  _iterator9["return"]();
                }
              } finally {
                if (_didIteratorError9) {
                  throw _iteratorError9;
                }
              }
            }
          }
        }

        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();
        utils.queueSaveNotebookCallback(function () {
          if (deletedTakes === 0) {
            deletedTakes = 'all';
          } else {
            storage.storeManifest();
            storage.cleanUpExecutorCell();
          }

          var title = 'Unused takes removed.';
          var body = 'We removed ' + deletedTakes + ' unused takes.';
          dialog.modal({
            title: title,
            body: body,
            sanitize: false,
            buttons: {
              'OK': {
                click: function click(e) {
                  console.log('Graffiti: You clicked ok');
                }
              }
            }
          });
        });
        utils.saveNotebookDebounced();
      },
      removeAllUnusedTakesWithConfirmation: function removeAllUnusedTakesWithConfirmation() {
        dialog.modal({
          title: 'Are you sure you want to remove ALL unused takes from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: You clicked ok, you want to remove unused takes.');
                graffiti.removeAllUnusedTakes();
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: you cancelled:', $(e.target).parent());
              }
            }
          }
        });
      },
      removeUnusedTakesWithConfirmation: function removeUnusedTakesWithConfirmation(recordingFullId) {
        dialog.modal({
          title: 'Are you sure you want to remove unused takes from this recording?',
          body: 'Note: this cannot be undone.',
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: You clicked ok, you want to remove unused takes.');
                graffiti.removeUnusedTakes(recordingFullId);
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: you cancelled:', $(e.target).parent());
              }
            }
          }
        });
      },
      removeGraffitiWithPrompt: function removeGraffitiWithPrompt() {
        var selectedTokens = graffiti.selectedTokens;

        if (selectedTokens.isIntersecting) {
          var _recordingCellId3 = utils.extractRecordingCellId(selectedTokens);

          var _recordingKey5 = selectedTokens.recordingKey;
          var recording = state.getManifestSingleRecording(_recordingCellId3, _recordingKey5);
          var graffitizedText = selectedTokens.allTokensString;

          if (graffitizedText === undefined) {
            graffitizedText = recording.allTokensString !== undefined ? recording.allTokensString : recording.markdown;
          }

          var content = '(Please Note: this cannot be undone.)<br/>' + '<b>Graffiti\'d text:&nbsp;</b><span class="graffiti-text-display">' + graffitizedText + '</span><br/>' + '<b>Graffiti contents:</b>' + utils.renderMarkdown(recording.markdown) + '<br/>';
          var confirmModal = dialog.modal({
            title: 'Are you sure you want to remove this Graffiti?',
            body: content,
            sanitize: false,
            buttons: {
              'OK': {
                click: function click(e) {
                  console.log('Graffiti: you clicked ok, you want to remove graffiti:', $(e.target).parent());
                  graffiti.removeGraffiti(_recordingCellId3, _recordingKey5);
                }
              },
              'Cancel': {
                click: function click(e) {
                  console.log('Graffiti: you cancelled:', $(e.target).parent());
                }
              }
            }
          });
          confirmModal.on('hidden.bs.modal', function (e) {
            console.log('Graffiti: escaped the removeGraffitiWithPrompt modal.');
          });
        }
      },
      // Remove all graffiti and remove the graffiti id's as well. Basically, return a notebook to a pre-graffiti-ized state.
      disableGraffiti: function disableGraffiti() {
        graffiti.removeAllGraffitis(true);
      },
      disableGraffitiWithConfirmation: function disableGraffitiWithConfirmation() {
        var content = 'Clicking OK will <i>remove any trace of Graffiti</i> in this notebook, setting it to a state as if you had never enabled Graffiti. ' + '<br><br><b>NOTE</b>: This <b>cannot</b> be undone.';
        var confirmModal = dialog.modal({
          title: 'Are you sure you want to disable Graffiti?',
          body: content,
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: you clicked ok, you want to disable graffiti:', $(e.target).parent());
                graffiti.disableGraffiti();
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: you cancelled:', $(e.target).parent());
              }
            }
          }
        });
      },
      updateAllGraffitiDisplays: function updateAllGraffitiDisplays() {
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltipsDebounced();
      },
      //
      // Recording control functions
      //
      setPendingRecording: function setPendingRecording() {
        console.log('Graffiti: Setting pending recording.');
        graffiti.changeActivity('recordingPending');
        state.restoreCellStates('selections'); // reset selections to when you clicked to begin the recording
      },
      beginMovieRecordingProcess: function beginMovieRecordingProcess(isOldGraffiti, recordingRecord) {
        // Preserve the state of all cells and selections before we begin recording so we can restore when the recording is done.
        state.storeCellStates();
        graffiti.preRecordingScrollTop = state.getScrollTop();
        state.setMovieRecordingStarted(true);

        if (recordingRecord === undefined) {
          recordingRecord = graffiti.storeRecordingInfoInCell(isOldGraffiti);
        }

        if (recordingRecord.cellType === 'markdown') {
          if (!graffiti.selectedTokens.noTokensPresent) {
            graffiti.selectedTokens.recordingCell.render();
          }
        }

        graffiti.setPendingRecording();
      },
      addCMEventsToSingleCell: function addCMEventsToSingleCell(cell) {
        graffiti.CMEvents[utils.getMetadataCellId(cell.metadata)] = true;
        var cm = cell.code_mirror;
        cm.on('focus', function (cm, e) {
          // console.log('Graffiti: CM focus:' , cm, e);
          // Check to see if we jumped from another cell to this cell with the arrow keys. If we did and we're recording, we need to
          // create a focus history record because jupyter is not firing the select cell event in those cases.
          var activity = state.getActivity();

          if (activity === 'recording') {
            var cellId = utils.getMetadataCellId(cell.metadata);

            if (cellId !== state.getSelectedCellId()) {
              state.saveSelectedCellId(cellId);
            }

            state.storeHistoryRecord('focus');
          } else if (activity === 'recordingPending') {
            // Ensure this cell has focus before recording begins.
            var focusCellIndex = utils.findCellIndexByCodeMirror(cm);
            Jupyter.notebook.select(focusCellIndex);
            graffiti.toggleRecording();
          }

          graffiti.updateControlPanels(cm); // this is necessary since a focus change can happen when you arrow advance from one cell to the next cell
        });
        cm.on('cursorActivity', function (cm, e) {
          //console.log('cursorActivity');
          if (state.getActivity() === 'idle') {
            graffiti.updateControlPanels(cm); // this is necessary because you can move the cursor from inside a graffiti to outside one
          } //console.log('graffiti.selectedTokens:', graffiti.selectedTokens);


          var affectedCell = utils.findCellByCodeMirror(cm);

          if (affectedCell === undefined) {
            utils.refreshCellMaps();
            affectedCell = utils.findCellByCodeMirror(cm);
            console.log('Graffiti: cursorActivity handler had to refreshCellMaps twice. Should never occur!');
          }

          state.storeCellIdAffectedByActivity(utils.getMetadataCellId(affectedCell.metadata));
          state.storeHistoryRecord('selections');
          graffiti.refreshGraffitiSideMarkers(affectedCell);
        });
        cm.on('change', function (cm, changeObj) {
          //console.log('change activity:', changeObj);
          var affectedCell = utils.findCellByCodeMirror(cm);
          var affectedCellId = utils.getMetadataCellId(affectedCell.metadata);

          if (affectedCell !== undefined) {
            state.storeCellIdAffectedByActivity(affectedCellId);
            state.storeHistoryRecord('contents');
            graffiti.executeSaveToFileDirectivesDebounced(affectedCellId); // if any graffiti call for this cell to be persisted to file(s), then do it now

            if (state.getActivity() === 'idle') {
              state.setHighlightsRefreshCellId(utils.getMetadataCellId(affectedCell.metadata));
              setTimeout(graffiti.updateRefreshableCell, 250); // set up to refresh side markers shortly after changes
            }
          }
        });
        cm.on('mousedown', function (cm, e) {//console.log('mousedown, e:', e);
        });
        cm.on('refresh', function (cm, e) {//console.log('**** CM refresh event ****');
        });
        cm.on('update', function (cm, e) {
          //console.log('**** CM update event ****');
          graffiti.refreshGraffitiTooltipsDebounced();
        });
        cm.on('scroll', function (cm, e) {
          var pointerPosition = state.getPointerPosition();
          var viewInfo = utils.collectViewInfo(pointerPosition.x, pointerPosition.y, graffiti.notebookPanel.height(), graffiti.sitePanel.scrollTop() - state.getScrollTop());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('innerScroll');
        });
      },
      addCMEventsToCells: function addCMEventsToCells() {
        var inputCells = Jupyter.notebook.get_cells();
        var _iteratorNormalCompletion10 = true;
        var _didIteratorError10 = false;
        var _iteratorError10 = undefined;

        try {
          for (var _iterator10 = inputCells[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
            var _cell3 = _step10.value;

            // Don't rebind if already bound
            if (!graffiti.CMEvents.hasOwnProperty(utils.getMetadataCellId(_cell3.metadata))) {
              graffiti.addCMEventsToSingleCell(_cell3);
            }
          }
        } catch (err) {
          _didIteratorError10 = true;
          _iteratorError10 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion10 && _iterator10["return"] != null) {
              _iterator10["return"]();
            }
          } finally {
            if (_didIteratorError10) {
              throw _iteratorError10;
            }
          }
        }
      },
      // Bind all select, create, delete, execute  cell events at the notebook level
      addCMEvents: function addCMEvents() {
        graffiti.addCMEventsToCells();
        Jupyter.notebook.events.on('select.Cell', function (e, cell) {
          //console.log('cell select event fired, e, cell:',e, cell.cell);
          state.storeHistoryRecord('selectCell');
          graffiti.refreshGraffitiTooltipsDebounced();
          graffiti.updateControlPanels();
        });
        Jupyter.notebook.events.on('create.Cell', function (e, results) {
          //console.log('create.Cell fired');
          //console.log(results);
          var newCell = results.cell;
          var newCellIndex = results.index;
          var newCellId;

          if (utils.getMetadataCellId(newCell.metadata) === undefined) {
            // Do not assign a graffiti id if we already have one. This may happen when applyCellListToNotebook is reinserting cells from the history
            // and has set the new cell's id to the value of a historical cell's id.
            newCellId = utils.setMetadataCellId(newCell.metadata, utils.generateUniqueId());
          } else {
            newCellId = utils.getMetadataCellId(newCell.metadata);
          }

          utils.refreshCellMaps();
          graffiti.addCMEventsToSingleCell(newCell);
          state.storeCellAddition(newCellId, newCellIndex);
          state.storeHistoryRecord('contents');
        });
        Jupyter.notebook.events.on('delete.Cell', function (e, results) {
          utils.refreshCellMaps();
          var deletedCell = results.cell;

          if (deletedCell !== undefined) {
            var deletedCellId = utils.getMetadataCellId(deletedCell.metadata);

            if (deletedCellId !== undefined) {
              graffiti.removeCanvasRecordsForCell(deletedCellId);
              terminalLib.removeTerminal(deletedCellId);
            }
          }

          state.storeHistoryRecord('contents');
        });
        Jupyter.notebook.events.on('finished_execute.CodeCell', function (e, results) {
          //console.log('Graffiti: Finished execution event fired, e, results:',e, results);
          utils.refreshCellMaps();
          state.storeHistoryRecord('contents');
          graffiti.resizeCanvases();
          graffiti.redrawAllDrawingsWhenRecording(); // need to do this because resizeCanvases erases all canvases
        }); // Because we get this event when output is sent but before it's rendered into the dom, we set up to collect
        // the output on the next tick rather than this loop.

        Jupyter.notebook.events.on('set_dirty.Notebook', function (e, results) {
          // console.log('Graffiti: set_dirty.Notebook, e, results:',e, results);
          utils.refreshCellMaps();

          graffiti.runOnceOnNextRecordingTick = function () {
            state.storeHistoryRecord('contents');
          };
        });
        Jupyter.notebook.events.on('rendered.MarkdownCell', function (e, results) {
          var activity = state.getActivity();

          if (activity === 'graffiting' && utils.getMetadataCellId(results.cell.metadata) === state.getGraffitiEditCellId()) {
            // When creating Graffitis for markdown cells, the user can also save the Graffiti by rendering the target
            // markdown cell rather than the editing cell. Some content creators get confused and do this, so we support it.
            var lastEditActivityTime = state.getLastEditActivityTime();

            if (lastEditActivityTime !== undefined && utils.getNow() - lastEditActivityTime > 250) {
              console.log('Graffiti: rendered MarkdownCell event fired and editing with long enough delay, so finishing graffiti. e, results:', e, results);
              graffiti.finishGraffiti(true);
              state.clearLastEditActivityTime();
            }
          }

          graffiti.refreshAllGraffitiHighlights();
        });
        Jupyter.notebook.events.on('shell_reply.Kernel', function (e, results) {
          // console.log('Graffiti: Kernel shell reply event fired, e, results:',e, results);
          utils.refreshCellMaps();
          var activity = state.getActivity();

          if (activity === 'idle') {
            graffiti.updateAllGraffitiDisplays();
            graffiti.updateControlPanels(); // necessary because we just finished a save
          }
        });
      },
      //
      // End a movie recording currently underway.
      //
      stopRecordingCore: function stopRecordingCore(useCallback) {
        audio.setExecuteCallback(useCallback);
        graffiti.clearCanvases('all');
        graffiti.hideDrawingScreen();
        graffiti.resetDrawingColor();
        state.storeTerminalsContentsInHistory();
        state.setSpeakingStatus(false); // if we were still speaking, record a history record that will terminate that state during playback.

        state.finalizeHistory();

        if (useCallback) {
          state.dumpHistory();
        }

        state.clearAnimationIntervals(); // This will use the callback defined in setAudioStorageCallback to actually persist the
        // whole recording, if useCallback (passed in to this fn) is true.

        audio.stopRecording();
        console.log('Graffiti: stopRecordingCore is refreshing.');
        state.restoreCellStates('contents');
        graffiti.updateAllGraffitiDisplays();
        graffiti.wipeAllStickerDomCanvases();
        graffiti.resetStickerCanvases();
        graffiti.deactivateAllPens();
        graffiti.removeCellsAddedByPlaybackOrRecording();
        graffiti.hideLabelInputBoxes();
        state.restoreCellStates('selections');
        state.restoreLineNumbersStates();
        graffiti.sitePanel.animate({
          scrollTop: graffiti.preRecordingScrollTop
        }, 750);
        graffiti.selectIntersectingGraffitiRange();
        state.deleteTrackingArrays();
        state.clearDisplayedTipInfo();
        terminalLib.saveOrRestoreTerminalOutputs('restore');
        graffiti.changeActivity('idle');
      },
      cancelRecording: function cancelRecording() {
        var currentActivity = state.getActivity();
        console.log('Graffiti: canceling recording, current activity:', currentActivity);

        if (currentActivity === 'recording') {
          var recordingCellInfo = state.getRecordingCellInfo();

          if (recordingCellInfo.newRecording) {
            graffiti.removeGraffiti(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
          } else if (graffiti.previousActiveTakeId !== undefined) {
            storage.updateSingleManifestRecordingField(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey, 'activeTakeId', graffiti.previousActiveTakeId);
          }

          graffiti.stopRecordingCore(false);
        }
      },
      toggleRecording: function toggleRecording(opts) {
        var currentActivity = state.getActivity();

        if (currentActivity !== 'playing') {
          if (currentActivity === 'recording') {
            //
            // End movie recording.
            //
            console.log('Graffiti: Now ending movie recording');
            state.blockRecording(); // this is here because a race condition can happen right at the end of recording

            graffiti.setNotifier(localizer.getString('PLEASE_WAIT_STORING_MOVIE'));
            graffiti.showControlPanels(['graffiti-notifier']);
            graffiti.showSavingScrim();
            storage.setMovieCompleteCallback(graffiti.hideSavingScrim);
            graffiti.stopRecordingCore(true);
            state.unblockRecording();
            graffiti.clearJupyterMenuHint();

            if (opts !== undefined && opts.endByKeyPress) {
              state.addCancelTimeSkipRecord();
            }

            state.stopSkipping();
            console.log('Graffiti: Stopped recording.');
          } else {
            //
            // Start new movie recording.
            //
            var recordingCellInfo = state.getRecordingCellInfo();

            if (recordingCellInfo === undefined) {
              // Error condition, cannot start recording without an active cell
              console.log('Graffiti: Cannot begin recording, no cell chosen to store recording.');
              return;
            }

            console.log('Graffiti: Begin recording for cell id:', recordingCellInfo.recordingCellId);
            terminalLib.saveOrRestoreTerminalOutputs('save');
            state.resetPlayState();
            graffiti.changeActivity('recording');
            graffiti.clearSkipKeyDownTimer();
            utils.assignCellIds();
            state.initHistory({
              storageCellId: recordingCellInfo.recordingCellId
            });
            state.clearCellAdditions();
            audio.startRecording();
            state.setScrollTop(graffiti.sitePanel.scrollTop());
            state.updateDrawingState([{
              change: 'drawingModeActivated',
              data: false
            }, {
              change: 'drawingActivity',
              data: 'idle'
            }, {
              change: 'penType',
              data: undefined
            }, {
              change: 'opacity',
              data: state.getMaxDrawingOpacity()
            }]);
            graffiti.resetDrawingPen();
            state.disableDrawingFadeClock(); // initially, we don't fade since nothing drawn yet

            state.startAnimationInterval('recording', function () {
              //console.log('Moving recording time ahead');
              if (graffiti.runOnceOnNextRecordingTick !== undefined) {
                graffiti.runOnceOnNextRecordingTick();
                graffiti.runOnceOnNextRecordingTick = undefined;
              }

              graffiti.updateTimeDisplay(state.getTimeRecordedSoFar());
              graffiti.updateDrawingOpacity();
            }, graffiti.recordingIntervalMs); // Flash a red recording bullet while recording is ongoing, every second. 

            state.startAnimationInterval('recordingIndicator', function () {
              if (state.isSkipping()) {
                $('#graffiti-recording-flash-icon').css({
                  background: 'rgb(255,0,0)'
                });
              } else {
                if (state.getTimeRecordedSoFar() % 2000 > 1000) {
                  $('#graffiti-recording-flash-icon').css({
                    background: 'rgb(245,245,245)'
                  });
                } else {
                  $('#graffiti-recording-flash-icon').css({
                    background: 'rgb(255,0,0)'
                  });
                }
              }
            }, graffiti.recordingIntervalMs);
            console.log('Graffiti: Started recording');
          }
        }
      },
      endRecordingByKeyPress: function endRecordingByKeyPress() {
        var activity = state.getActivity();

        if (activity === 'recording') {
          graffiti.toggleRecording({
            endByKeyPress: true
          });
        } else if (activity === 'recordingPending') {
          graffiti.changeActivity('idle');
          graffiti.clearJupyterMenuHint();
        }
      },
      changeActivity: function changeActivity(newActivity) {
        if (state.getActivity() === newActivity) {
          console.log('Graffiti: state is already :', newActivity, 'not changing it');
          return; // no change to activity
        }

        state.setActivity(newActivity);
        graffiti.updateControlPanels();
      },
      //
      // Movie playback code begins
      //
      resetScrollNudge: function resetScrollNudge() {
        graffiti.scrollNudge = undefined;
      },
      applyScrollNudge: function applyScrollNudge(position, record, useTrailingVelocity) {
        //console.log('applyScrollNudge, useTrailingVelocity:', useTrailingVelocity);
        var clientHeight = document.documentElement.clientHeight;
        var topbarHeight = $('#header').height(); //const bufferY = clientHeight / 9;

        var bufferY = clientHeight / 6;
        var minAllowedCursorY = topbarHeight + bufferY;
        var maxAverageVelocity = 0.5;
        var minBottomBufferY = 150; // approximately 1.5x the height of bottom bar in udacity classroom

        var maxAllowedCursorY = clientHeight - Math.max(bufferY, minBottomBufferY);
        var mustNudgeCheck = !useTrailingVelocity;
        var nudgeIncrements = graffiti.scrollNudgeQuickIncrements; // Watch trailing average of cursor. If the average over twenty samples is in a nudge zone, then nudge

        if (useTrailingVelocity) {
          nudgeIncrements = state.getActivity === 'scrubbing' ? 1.0 : graffiti.scrollNudgeSmoothIncrements; //const trailingAverageSize = 85;

          var trailingAverageSize = 10;

          if (graffiti.scrollNudgeAverages.length > 0) {
            if (graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length - 1].x === position.x && graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length - 1].y === position.y || graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length - 1].t === record.startTime) {
              return; // cursor didn't move or time didn't change, dont record velocity
            }
          }

          if (record.inTopBarArea !== undefined && record.inTopBarArea) {
            //console.log('Ignoring cursor activity recorded above the site panel');
            return; // ignore the cursor when it is above the site panel
          }

          graffiti.scrollNudgeAverages.push({
            t: record.startTime,
            pos: {
              x: position.x,
              y: position.y
            }
          });

          if (graffiti.scrollNudgeAverages.length > trailingAverageSize) {
            graffiti.scrollNudgeAverages.shift();
            var velocities = [],
                distance,
                timeDiff;

            for (var i = 1; i < graffiti.scrollNudgeAverages.length; ++i) {
              // This is highly mathematically inefficient but maybe in this scale of things, it's ok.
              distance = Math.sqrt(Math.pow(graffiti.scrollNudgeAverages[i].pos.y - graffiti.scrollNudgeAverages[i - 1].pos.y, 2) + Math.pow(graffiti.scrollNudgeAverages[i].pos.x - graffiti.scrollNudgeAverages[i - 1].pos.x, 2));
              timeDiff = graffiti.scrollNudgeAverages[i].t - graffiti.scrollNudgeAverages[i - 1].t;
              velocities.push(distance / timeDiff);
            }

            var averageVelocity = Math.abs(utils.computeArrayAverage(velocities)); //console.log('averageVelocity:', averageVelocity);

            mustNudgeCheck = mustNudgeCheck || averageVelocity < maxAverageVelocity;
          }
        } // console.log('averageVelocity:', averageVelocity, velocities, graffiti.scrollNudgeAverages);


        if (mustNudgeCheck) {
          // If we are scrubbing, do not nudge but immediately push the correct spot into view by setting the increment divider to 1 so we jump the 
          // full amount all at once.
          var nudging = false,
              nudgeAmount;

          if (position.y < minAllowedCursorY) {
            nudgeAmount = (position.y - minAllowedCursorY) / nudgeIncrements;
            nudging = true;
          } else if (position.y > maxAllowedCursorY) {
            nudgeAmount = (position.y - maxAllowedCursorY) / nudgeIncrements;
            nudging = true;
          }

          if (nudging) {
            /*
               console.log('Graffiti: nudgeAmount', nudgeAmount, 'position', position.x, position.y,
               'minAllowedCursorY',minAllowedCursorY, 'maxAllowedCursorY', maxAllowedCursorY, 
               'nudgeIncrements', nudgeIncrements, 'bufferY', bufferY, 'useTrailingVelocity', useTrailingVelocity);
             */
            graffiti.scrollNudge = {
              counter: nudgeIncrements,
              amount: nudgeAmount
            }; //console.log('nudging:', graffiti.scrollNudge.amount);
          } else {//console.log('not nudging, y', position.y, 'maxY', maxAllowedCursorY);
            }
        }
      },
      applyScrollNudgeAtCell: function applyScrollNudgeAtCell(cell, record, selChange) {
        var cellId = utils.getMetadataCellId(cell.metadata);
        var cellRects = utils.getCellRects(cell);
        var selectionRecord, selections;

        if (record.cellsSelections !== undefined) {
          selectionRecord = record.cellsSelections[cellId];
        }

        if (selectionRecord !== undefined) {
          selections = selectionRecord.selections;
        } else {
          var code_mirror = cell.code_mirror;
          selections = code_mirror.listSelections();
        }

        if (selections.length !== 0) {
          var cellOffsetY = selections[0].head.line * (graffiti.cmLineHeight + graffiti.cmLineFudge);
          var offsetPosition = {
            x: cellRects.innerCellRect.left,
            y: cellOffsetY + cellRects.innerCellRect.top //console.log('applyScrollNudgeAtCell:offsetPosition:', offsetPosition, 'cellId', cellId, 'selChange', selChange);

          };
          graffiti.applyScrollNudge(offsetPosition, record, false);
        }
      },
      calculateMappedScrollDiff: function calculateMappedScrollDiff(record) {
        var currentNotebookPanelHeight = graffiti.notebookPanel.height();
        var mappedScrollDiff = 0;

        if (record !== undefined) {
          mappedScrollDiff = record.scrollDiff / record.notebookPanelHeight * currentNotebookPanelHeight;
        }

        return mappedScrollDiff;
      },
      doScrollNudging: function doScrollNudging(record, viewIndex) {
        var currentScrollTop = graffiti.sitePanel.scrollTop();
        var newScrollTop = currentScrollTop;
        mappedScrollDiff = graffiti.calculateMappedScrollDiff(record);

        if (graffiti.scrollNudge !== undefined) {
          // console.log('updateDisplay, nudgeAmount:', graffiti.scrollNudge.amount, 'counter:', graffiti.scrollNudge.counter);
          var scrollNudgeAmount = 0;
          graffiti.scrollNudge.counter--;

          if (graffiti.scrollNudge.counter > 0) {
            scrollNudgeAmount = graffiti.scrollNudge.amount; //console.log('Going to nudge scroll by:', scrollNudgeAmount, 'counter:', graffiti.scrollNudge.counter);

            newScrollTop = currentScrollTop + scrollNudgeAmount;
          } else {
            graffiti.resetScrollNudge(); // stop nudging
          }
        } // Only apply a user-recorded scroll diff if we haven't applied it already. When this function is called with no parameters, then
        // it is only doing "maintenance nudging", ie over-time nudging to keep the most important zones of interest in the viewport.
        // console.log('Now applying mappedScrollDiff:', mappedScrollDiff);


        var skipMappedScrollDiff = viewIndex !== undefined && graffiti.lastScrollViewId !== undefined && graffiti.lastScrollViewId === viewIndex; //console.log('skipMappedScrollDiff', skipMappedScrollDiff);

        if (!skipMappedScrollDiff) {
          newScrollTop += mappedScrollDiff;
          graffiti.lastScrollViewId = viewIndex;
        }

        graffiti.setSitePanelScrollTop(newScrollTop);
      },
      updateDrawingCore: function updateDrawingCore(record) {
        //console.log('updateDrawingCore:', record);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        switch (record.drawingActivity) {
          case 'draw':
            graffiti.placeCanvas(record.cellId, record.pen.permanence);
            graffiti.setCanvasStyle(record.cellId, record.pen.type, record.pen.dash, record.pen.color, record.pen.permanence); // console.log('inPromptArea:', record.pen.inPromptArea, 'downInMarkdown:', record.pen.downInMarkdown );

            var positions = graffiti.processPositionsForCellTypeScaling(record, 'positions');
            graffiti.updateDrawingDisplay(record.cellId, positions.start.x, positions.start.y, positions.end.x, positions.end.y, record.pen.type, record.pen.permanence);
            break;

          case 'sticker':
            graffiti.drawStickersForCell(record.cellId, record);
            break;

          case 'fade':
            $('.graffiti-canvas-type-temporary').css({
              opacity: record.opacity
            });
            break;

          case 'wipe':
            //console.log('Graffiti: wiping temporary sticker canvas');
            graffiti.wipeTemporaryStickerDomCanvases();
            graffiti.clearCanvases('temporary');
            break;
        }
      },
      updateDrawings: function updateDrawings(drawingFrameIndex) {
        if (drawingFrameIndex === undefined) {
          return; // no drawings yet at this index
        } // console.log('updateDrawings');
        // Need to process a range of records if that's required.


        var startIndex = drawingFrameIndex.rangeStart === undefined ? drawingFrameIndex.index : drawingFrameIndex.rangeStart;
        var endIndex = drawingFrameIndex.index;
        var index, record;

        for (index = startIndex; index <= endIndex; ++index) {
          record = state.getHistoryItem('drawings', index);
          graffiti.updateDrawingCore(record);
        }
      },
      updatePointer: function updatePointer(record) {
        if (record.hoverCell !== undefined) {
          var hoverCellId = record.cellId;
          record.isOverTerminal = false;
          var offsetPositionScaled = graffiti.processPositionsForCellTypeScaling(record, 'cursor');
          var cellRects = utils.getCellRects(record.hoverCell);
          var offsetPosition = {
            x: cellRects.cellRect.left + offsetPositionScaled.start.x - graffiti.halfBullseye,
            y: cellRects.cellRect.top + offsetPositionScaled.start.y - graffiti.halfBullseye
          };
          var isOverTerminalCell = terminalLib.isTerminalCell(hoverCellId);

          if (isOverTerminalCell) {
            var hoverCellElement = record.hoverCell.element[0];
            var terminalContainer = $(hoverCellElement).find('.graffiti-terminal-container');
            var termWidth = terminalContainer.width();
            var termHeight = terminalContainer.height();
            var termOffset = terminalContainer.offset();
            record.isOverTerminal = termOffset.left <= offsetPosition.x && offsetPosition.x <= termOffset.left + termWidth && termOffset.top <= offsetPosition.y && offsetPosition.y <= termOffset.top + termHeight;
          }

          graffiti.applyScrollNudge(offsetPosition, record, true);
          var lastPosition = state.getLastRecordedCursorPosition();

          if (offsetPosition.x !== lastPosition.x || offsetPosition.y !== lastPosition.y) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            graffiti.undimGraffitiCursor();
            var offsetPositionPx = {
              left: offsetPosition.x + 'px',
              top: offsetPosition.y + 'px'
            };
            graffiti.graffitiCursorShell.css(offsetPositionPx);
            graffiti.activateNormalGraffitiCursor();
          }

          state.setLastRecordedCursorPosition(offsetPosition);
        }
      },
      updateView: function updateView(viewIndex, currentScrollTop) {
        //console.log('updateView, viewIndex:', viewIndex);
        var record = state.getHistoryItem('view', viewIndex);
        record.hoverCell = utils.findCellByCellId(record.cellId); // Make sure the hoverCell shows line numbers if they were visible during recording; otherwise all registration will be off
        // by the width of the line number gutter.

        if (record.hoverCell !== undefined) {
          // make sure we were actually hovering over a cell before we try to tweak the gutter.
          if (record.hasOwnProperty('lineNumbersVisible')) {
            // some early recordings won't have this property
            var cm = record.hoverCell.code_mirror;
            var currentlyVisible = cm.options.lineNumbers;

            if (record.lineNumbersVisible != cm.options.lineNumbers) {
              record.hoverCell.toggle_line_numbers();
            }
          }
        } // Select whatever cell is currently selected


        if (record.selectedCellId !== undefined) {
          var selectedCellIndex = utils.findCellIndexByCellId(record.selectedCellId); // we should use a map to speed this up
          //console.log('about to select index:', selectedCellIndex, record.selectedCellId)

          Jupyter.notebook.select(selectedCellIndex);
        } // Handle pointer updates and canvas updates, as well as cell focus changes


        if (record.subType === 'pointer') {
          //console.log('pointerUpdate is true, record:', record);
          graffiti.updatePointer(record);
        } else {
          graffiti.dimGraffitiCursor();

          if (record.selectedCell !== undefined) {
            if (record.subType === 'focus' || record.subType === 'selectCell') {
              //console.log('processing focus/selectCell, record:', record);
              var selectedCell = utils.findCellByCellId(record.selectedCellId);

              if (selectedCell !== undefined) {
                if (utils.getMetadataCellId(record.selectedCell.metadata) === utils.getMetadataCellId(record.hoverCell.metadata)) {
                  selectedCell.focus_cell();

                  if (record.subType === 'focus') {
                    var code_mirror = selectedCell.code_mirror;

                    if (!code_mirror.state.focused) {
                      code_mirror.focus();
                    }

                    code_mirror.getInputField().focus();
                  }
                }
              }
            }
          }
        }

        graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it

        if (record.hoverCell !== undefined) {
          var _cm = record.hoverCell.code_mirror; // Update innerScroll if required

          _cm.scrollTo(record.innerScroll.left, record.innerScroll.top); //console.log('updateView is calling doScrollNudging');


          graffiti.doScrollNudging(record, viewIndex); //console.log('after doScrollNudging, we have new scrollTop:', graffiti.sitePanel.scrollTop());
        }
      },
      updateCellSelections: function updateCellSelections(cell, cm, selections, currentScrollTop) {
        //console.log('updateCellSelections', selections);
        cm.setSelections(selections);
        graffiti.setSitePanelScrollTop(currentScrollTop); // preserve scrollTop because changing selections messes with it (safety check)

        utils.refreshCodeMirrorSelection(cell);
        graffiti.setSitePanelScrollTop(currentScrollTop); // preserve scrollTop because changing selections messes with it (safety check)
      },
      updateSelectedCellSelections: function updateSelectedCellSelections(currentScrollTop) {
        var selectedCell = Jupyter.notebook.get_selected_cell();
        utils.refreshCodeMirrorSelection(selectedCell);
        graffiti.setSitePanelScrollTop(currentScrollTop);
      },
      updateSelections: function updateSelections(index, currentScrollTop) {
        var record = state.getHistoryItem('selections', index);
        var cellId, cell, selectionRecord, selections, code_mirror, currentSelections, active, lineCheck; // If there were text selections in rendered markdown or rendered output during this frame, restore them first if we need to.

        if (record.textSelection !== undefined) {
          var _cellId2 = record.textSelection.cellId;

          var _cell4 = utils.findCellByCellId(_cellId2);

          var referenceNode;

          if (_cell4 !== undefined) {
            var cellType = _cell4.cell_type; // find the right reference node so we can highlight the correct text in either a markdown cell or a code cell output area

            if (cellType === 'markdown') {
              referenceNode = $(_cell4.element).find('.rendered_html')[0];
            } else {
              referenceNode = $(_cell4.element).find('.output_subarea')[0];
            }

            var currentSelection = selectionSerializer.get(referenceNode);

            if (!_.isEqual(currentSelection.state, record.textSelection.state)) {
              if (cellType === 'markdown') {
                // console.log('Graffiti: Focusing on markdown cell');
                _cell4.focus_cell(); // we don't need to shrink if we focus the cell


                graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
              } // console.log('Graffiti: Selection restoring textSelection, currentSelection:', record.textSelection, currentSelection);


              record.textSelection.referenceNode = referenceNode;
              selectionSerializer.restore(record.textSelection);
            }
          }
        } else {
          for (var _i15 = 0, _Object$keys10 = Object.keys(record.cellsSelections); _i15 < _Object$keys10.length; _i15++) {
            cellId = _Object$keys10[_i15];
            selectionRecord = record.cellsSelections[cellId];
            selections = selectionRecord.selections;

            if (selectionRecord.active) {
              var selectedCellIndex = utils.findCellIndexByCellId(cellId);

              if (Jupyter.notebook.get_selected_index() !== selectedCellIndex) {
                Jupyter.notebook.select(selectedCellIndex);
                graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
              }
            }

            cell = utils.findCellByCellId(cellId);

            if (cell !== undefined) {
              code_mirror = cell.code_mirror;
              currentSelections = utils.cleanSelectionRecords(code_mirror.listSelections()); //console.log('cellId, selections, currentSelections, subType:', cellId, selections, currentSelections, record.subType);

              var numLines = code_mirror.lineCount(); // Make sure the recorded selection point does not exceed the size of the current cm's text, 
              // before checking for whether we need to set the selection.

              selections[0].anchor.line = Math.min(numLines - 1, selections[0].anchor.line);
              lineCheck = code_mirror.getLine(selections[0].anchor.line);
              selections[0].anchor.ch = Math.min(lineCheck.length, selections[0].anchor.ch);
              selections[0].head.line = Math.min(numLines - 1, selections[0].head.line);
              lineCheck = code_mirror.getLine(selections[0].head.line);
              selections[0].head.ch = Math.min(lineCheck.length, selections[0].head.ch);

              if (!_.isEqual(selections, currentSelections)) {
                graffiti.dimGraffitiCursor();
                graffiti.updateCellSelections(cell, code_mirror, selections, currentScrollTop); //console.log('nudge check, cellId', cellId, 'code_mirror.state.focused',code_mirror.state.focused);

                setTimeout(function () {
                  if (code_mirror.state.focused) {
                    // If we made a selections update this frame, AND we are focused in it,
                    // make sure that we keep it in view. We need to compute the
                    // offset position of the *head* of the selection where the action is.
                    // NOTE: the setTimeout is needed because codemirror seems to do selections and focus async so we may end
                    // up applying scrollnudging to the cell too early, ie nudge to a cell that is not visible.
                    // console.log('setting selections with selections:', selections);
                    graffiti.applyScrollNudgeAtCell(cell, record, true);
                  }
                }, 0);
              }
            }
          }
        }
      },
      // After playback finishes, delete any cells added during playback.
      removeCellsAddedByPlaybackOrRecording: function removeCellsAddedByPlaybackOrRecording() {
        var cellAdditions = state.getCellAdditions(); // all cells added during this recording

        if (cellAdditions !== undefined) {
          var deleteCellIndex;
          var _iteratorNormalCompletion11 = true;
          var _didIteratorError11 = false;
          var _iteratorError11 = undefined;

          try {
            for (var _iterator11 = cellAdditions[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
              var cellId = _step11.value;
              deleteCellIndex = utils.findCellIndexByCellId(cellId);

              if (deleteCellIndex !== undefined) {
                //console.log('Going to delete:', cellId, 'at index:', deleteCellIndex);
                Jupyter.notebook.delete_cell(deleteCellIndex);
                utils.refreshCellMaps();
              }
            }
          } catch (err) {
            _didIteratorError11 = true;
            _iteratorError11 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion11 && _iterator11["return"] != null) {
                _iterator11["return"]();
              }
            } finally {
              if (_didIteratorError11) {
                throw _iteratorError11;
              }
            }
          }
        }
      },
      // At any timeframe add cells that were present during recording but aren't now, and remove any that were added by playback/scrub
      // but aren't present at this timeframe.
      applyCellListToNotebook: function applyCellListToNotebook(record) {
        var cellsPresentThisFrame = record.cellsPresentThisFrame;
        var fullCellsPresentIds = Object.keys(cellsPresentThisFrame); // During playback, only add back cells that were actually interacted with, unless replayAll directive was set to be on.

        var cellsPresentIds = fullCellsPresentIds.filter(function (cellId) {
          return state.graffitiShouldUpdateCellContents(cellId);
        });
        var numCellsPresent = cellsPresentIds.length;
        var mustRefreshCellMaps = false;
        var deletableCellId;

        if (numCellsPresent > 0) {
          // First figure out which cells are extra and need to be deleted on this cell
          var deleteCellId, deleteCellIndex;
          var cellAdditions = state.getCellAdditions(); // all cells added during this recording

          var cellAdditionsIds = Object.values(cellAdditions); // Any cells that may have been added during the movie, not present in this timeframe, must be deleted.

          var deletableCellIds = _.difference(cellAdditionsIds, cellsPresentIds); //console.log('deletableCellIds', deletableCellIds, cellAdditions, cellsPresentIds);


          var _iteratorNormalCompletion12 = true;
          var _didIteratorError12 = false;
          var _iteratorError12 = undefined;

          try {
            for (var _iterator12 = deletableCellIds[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
              deletableCellId = _step12.value;
              // console.log('Graffiti: Trying to delete cellid:', deletableCellId);
              deleteCellIndex = utils.findCellIndexByCellId(deletableCellId);

              if (deleteCellIndex !== undefined) {
                //console.log('Going to delete:', deleteCellId, 'at index:', deleteCellIndex);
                Jupyter.notebook.delete_cell(deleteCellIndex);
              }
            } // Now figure out which cells are missing and need to be added in. Add them in above whatever position 
            // they were recorded in, or right after the last present cell (whichever is greater), to try to match
            // its position from the recording time. This works ok because usually content creators will add a 
            // cell after another specific cell.

          } catch (err) {
            _didIteratorError12 = true;
            _iteratorError12 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion12 && _iterator12["return"] != null) {
                _iterator12["return"]();
              }
            } finally {
              if (_didIteratorError12) {
                throw _iteratorError12;
              }
            }
          }

          var i, checkCellId, foundCell, newCell, cellPosition, previousCellPosition, previousPlusOne;

          for (i = 0; i < cellsPresentIds.length; ++i) {
            checkCellId = cellsPresentIds[i];
            foundCell = utils.findCellByCellId(checkCellId);

            if (foundCell === undefined) {
              cellPosition = cellsPresentThisFrame[checkCellId];

              if (i > 0) {
                previousCellPosition = utils.findCellIndexByCellId(cellsPresentIds[i - 1]);

                if (previousCellPosition !== undefined) {
                  previousPlusOne = previousCellPosition + 1;

                  if (previousPlusOne > cellPosition) {
                    cellPosition = previousPlusOne;
                  }
                }
              }

              var cells = Jupyter.notebook.get_cells();
              cellPosition = Math.min(cellPosition, cells.length - 1);
              newCell = Jupyter.notebook.insert_cell_above('code', cellPosition);
              utils.setMetadataCellId(newCell.metadata, checkCellId);
              state.storePlaybackCellAddition(checkCellId, cellPosition);
              mustRefreshCellMaps = true; // console.log('Graffiti: Just inserted new cell, cellId:', checkCellId, 'at position', cellPosition);
              // This causes excessive scrolling and isn't really necessary if the author moves the cursor to a new cell anyway
              // graffiti.applyScrollNudgeAtCell(newCell, record, false);
            }
          }
        }

        if (mustRefreshCellMaps) {
          utils.refreshCellMaps();
        }
      },
      // set_text() causes jupyter to scroll to top of cell so we need to restore scrollTop after calling this fn, on a timeout, cf 
      // https://stackoverflow.com/questions/779379/why-is-settimeoutfn-0-sometimes-useful/779785#779785
      updateContents: function updateContents(index, currentScrollTop) {
        var contentsRecord = state.getHistoryItem('contents', index);
        var cells = Jupyter.notebook.get_cells();
        var cellId,
            contents,
            outputs,
            frameContents,
            frameOutputs,
            didRestoreFrameOutput,
            renderedFrameOutput = false;
        graffiti.applyCellListToNotebook(contentsRecord);
        var _iteratorNormalCompletion13 = true;
        var _didIteratorError13 = false;
        var _iteratorError13 = undefined;

        try {
          for (var _iterator13 = cells[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
            var _cell5 = _step13.value;

            if (_cell5.cell_type !== 'code') {
              continue;
            }

            cellId = utils.getMetadataCellId(_cell5.metadata);

            if (!state.graffitiShouldUpdateCellContents(cellId)) {
              continue;
            }

            contents = _cell5.get_text();

            if (contentsRecord.cellsContent.hasOwnProperty(cellId)) {
              frameContents = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].contentsRecord, cellId);

              if (frameContents !== undefined && frameContents !== contents) {
                //console.log('Setting text on cellid:', utils.getMetadataCellId(cell.metadata));
                _cell5.set_text(frameContents);
              }

              frameOutputs = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].outputsRecord, cellId);
              didRestoreFrameOutput = state.restoreCellOutputs(_cell5, frameOutputs);
              renderedFrameOutput = renderedFrameOutput || didRestoreFrameOutput;
            }
          }
        } catch (err) {
          _didIteratorError13 = true;
          _iteratorError13 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion13 && _iterator13["return"] != null) {
              _iterator13["return"]();
            }
          } finally {
            if (_didIteratorError13) {
              throw _iteratorError13;
            }
          }
        }

        if (renderedFrameOutput) {
          graffiti.resizeCanvases();
          graffiti.redrawAllDrawings();
          setTimeout(function () {
            // For some reason we have to restore scrollTop on timeout because CM's setValue() fn seems to move scrollTop, async.
            graffiti.setSitePanelScrollTop(currentScrollTop);
          }, 100);
        }
      },
      updateTerminals: function updateTerminals(index) {
        var record = state.getHistoryItem('terminals', index);
        var termRecords = record.terminals;
        var focusedTerminal = undefined;

        if (termRecords !== undefined) {
          var terminalsContents = state.getHistoryTerminalsContents();
          var currentMovie = state.getCurrentlyPlayingMovie();
          var nearestCellPosition = currentMovie.cellIndex;

          for (var i = 0; i < termRecords.length; ++i) {
            terminalLib.setTerminalContents($.extend(true, termRecords[i], {
              incremental: state.getActivity() === 'playing',
              terminalsContents: terminalsContents,
              nearestCellPosition: nearestCellPosition,
              useNearestCellPosition: true // try to dump output into nearest terminal you find

            }));

            if (termRecords[i].isFocused) {
              focusedTerminal = termRecords[i].id;
            }
          }
        }

        terminalLib.focusTerminal(focusedTerminal);
      },
      updateSpeaking: function updateSpeaking(index) {
        var record = state.getHistoryItem('speaking', index); //console.log('Processing speaking record', index, record);

        if (state.scanningIsOn()) {
          if (record.speaking) {
            // console.log('Graffiti: Begun speaking.');
            state.setCurrentPlaySpeed('scanInactive');
            state.setSpeakingStatus(true);
          } else {
            // console.log('Graffiti: Stopped speaking.');
            state.setCurrentPlaySpeed('scanActive');
            state.setSpeakingStatus(false);
          } //          console.log('playTimes:regular', state.playTimes['regular'].total,
          //                      'scanActive:',  state.playTimes['scanActive'].total, 
          //                      'scanInactive', state.playTimes['scanInactive'].total);


          audio.updateAudioPlaybackRate();
        }
      },
      updateDisplay: function updateDisplay(frameIndexes) {
        var currentScrollTop = graffiti.sitePanel.scrollTop();
        var activity = state.getActivity();

        if (state.shouldUpdateDisplay('contents', frameIndexes.contents)) {
          graffiti.updateContents(frameIndexes.contents.index, currentScrollTop); //console.log('update contents:', 'currentScrollTop', currentScrollTop, 'new scrollTop', graffiti.sitePanel.scrollTop());
        }

        if (state.shouldUpdateDisplay('selections', frameIndexes.selections)) {
          graffiti.updateSelections(frameIndexes.selections.index, currentScrollTop); //console.log('update selections:', 'currentScrollTop', currentScrollTop, 'new scrollTop', graffiti.sitePanel.scrollTop());
        }

        if (state.shouldUpdateDisplay('drawings', frameIndexes.drawings)) {
          if (activity !== 'scrubbing') {
            //console.log('calling updateDrawings from updateDisplay');
            graffiti.updateDrawings(frameIndexes.drawings);
          }
        }

        if (state.shouldUpdateDisplay('terminals', frameIndexes.terminals)) {
          graffiti.updateTerminals(frameIndexes.terminals.index);
        }

        if (state.shouldUpdateDisplay('speaking', frameIndexes.speaking)) {
          //console.log(state.history.processed);
          graffiti.updateSpeaking(frameIndexes.speaking.index);
        }

        if (state.shouldUpdateDisplay('view', frameIndexes.view)) {
          graffiti.updateView(frameIndexes.view.index, currentScrollTop); //console.log('update view:', frameIndexes.view.index, 'currentScrollTop', currentScrollTop, 'new scrollTop', graffiti.sitePanel.scrollTop());
        }
      },
      // update the timer display for play or recording
      updateTimeDisplay: function updateTimeDisplay(playedSoFar) {
        var totalTimeDisplay = localizer.getString('IS_SKIPPING');
        var activity = state.getActivity();

        if (!state.isSkipping()) {
          var timeSkippedSoFar = state.getSkippedTimeSoFar();

          if (isNaN(timeSkippedSoFar)) {
            timeSkippedSoFar = graffiti.lastTimeSkippedSoFar;
          }

          graffiti.lastTimeSkippedSoFar = timeSkippedSoFar; //const playTimeDisplay = utils.formatTime(playedSoFar  - timeSkippedSoFar, { includeMillis: false });

          var playTimeDisplay = utils.formatTime(playedSoFar, {
            includeMillis: false
          });
          var recordingTimeDisplay = utils.formatTime(playedSoFar, {
            includeMillis: true
          });
          var totalSkipTimeForRecording = state.getTotalSkipTimeForRecording(); //console.log('totalSkipTimeForRecording', totalSkipTimeForRecording);
          // work in progress
          //const durationDisplay = utils.formatTime(state.getHistoryDuration() - totalSkipTimeForRecording, { includeMillis: false });

          var durationDisplay = utils.formatTime(state.getHistoryDuration(), {
            includeMillis: false
          });

          if (activity === 'recording') {
            totalTimeDisplay = recordingTimeDisplay;
          } else {
            totalTimeDisplay = playTimeDisplay + '/' + durationDisplay;
          }
        }

        var recorderTimeElem = activity === 'recording' ? $('#graffiti-time-display-recording') : $('#graffiti-time-display-playback');
        recorderTimeElem.text(totalTimeDisplay);
      },
      updateSlider: function updateSlider(playedSoFar) {
        var ratio = playedSoFar / state.getHistoryDuration();
        var sliderVal = ratio * 1000; //console.log('updateSlider, playedSoFar:', playedSoFar, 'sliderVal:', sliderVal);

        var slider = $('#graffiti-recorder-range');
        slider.val(sliderVal);
      },
      //
      // Playback functions
      //
      // When jumping around, or if we reached the end of playback and the next playback will reset to beginning, then we may need to attempt to recalculate 
      // and apply the raw scrollTop (excluding any nudging, so it's approximate).
      applyRawCalculatedScrollTop: function applyRawCalculatedScrollTop(viewIndex) {
        if (!state.getApplyingRawCalculatedScrollTop()) {
          return;
        }

        var record,
            i,
            calculatedScrollTop = graffiti.prePlaybackScrolltop;

        for (i = 0; i < viewIndex; ++i) {
          record = state.getHistoryItem('view', i);
          calculatedScrollTop += graffiti.calculateMappedScrollDiff(record);
        }

        graffiti.sitePanel.scrollTop(calculatedScrollTop);
      },
      // Skip around by X seconds forward or back.
      jumpPlayback: function jumpPlayback(direction, jumpAmount) {
        var previousPlayState = state.getActivity();
        graffiti.pausePlayback();
        var timeElapsed = state.getTimePlayedSoFar(); //console.log('jumpPlayback timeElapsed',timeElapsed);

        var t;

        if (state.scanningIsOn()) {
          t = state.findSpeakingStartNearestTime(timeElapsed, direction, jumpAmount);
        } else {
          t = Math.max(0, Math.min(timeElapsed + jumpAmount * 1000 * direction * state.getPlayRateScalar(), state.getHistoryDuration() - 2));
        } // console.log('Graffiti: t:', t);


        state.resetPlayTimes(t);
        var frameIndexes = state.getHistoryRecordsAtTime(t);
        state.clearSetupForReset();
        state.resetProcessedArrays();
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes);
        graffiti.updateSlider(t);
        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllDrawings(t);

        if (previousPlayState === 'playing') {
          graffiti.startPlayback();
        }

        graffiti.updateAllGraffitiDisplays();
      },
      handleSliderDrag: function handleSliderDrag() {
        // Handle slider drag
        var target = $('#graffiti-recorder-range');
        var timeLocation = target.val() / 1000; //console.log('handleSliderDrag, slider value:', target.val());

        var t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1); // Now we need to set the time we are going to start with if we play from here.

        state.resetPlayTimes(t);
        state.updateCurrentSkipRecord();
        state.clearSetupForReset();
        state.resetProcessedArrays();
        graffiti.undimGraffitiCursor();
        var frameIndexes = state.getHistoryRecordsAtTime(t);
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes); // can replay scroll diffs, and in playback use cumulative scroll diff

        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllDrawings(t);
      },
      handleTerminalsEvents: function handleTerminalsEvents(event) {
        if (state.getActivity() === 'recording') {
          // If we are recording, we need to record latest terminal output for replay
          // console.log('Terminal event:', event);
          state.storeTerminalsState([event]);
          state.storeHistoryRecord('terminals');
        }
      },
      // If we are inside a skip record, apply its speed or absolute skip
      applyCurrentSkipRecord: function applyCurrentSkipRecord(t) {
        var currentSkipRecord = state.timeInSkipRecordRange(t);
        var userChoicePlaySpeed = state.getUserChoicePlaySpeed();
        var didSkip = false;
        var changedSpeed = false;
        var currentActivity = state.getActivity();

        if (currentSkipRecord !== undefined) {
          if (currentSkipRecord.status !== undefined) {
            // Return early. these records are old legacy recordings with skip statuses in them. we are ignoring these in favor of specifying skip type in directives.
            return didSkip;
          }

          var skipInfo = state.getSkipInfo();
          state.setAppliedSkipRecord();
          var isLastSkipRecord = state.isLastSkipRecord();
          var duration;
          state.deactivateApplyingRawCalculatedScrollTop();

          if (isLastSkipRecord) {
            console.log('Graffiti: doing last skip as absolute');
            skipInfo.type = state.skipTypes['absolute']; // last skip is overridden to always be absolute.
            // This is -1,  because we want to resume playing for last millisecond of skip so we come to a regular stop after the last skip.

            duration = state.getHistoryDuration() - state.getTimePlayedSoFar() - 1;
          } else {
            duration = currentSkipRecord.endTime - currentSkipRecord.startTime + 1;
          }

          var durationMillis = duration / 1000;

          switch (skipInfo.type) {
            case state.skipTypes['rapid']:
              state.setPlayRate('rapid', skipInfo.factor);
              state.setCurrentPlaySpeed('rapid');
              changedSpeed = true;
              break;

            case state.skipTypes['absolute']:
              state.setCurrentPlaySpeed('regular'); // during absolute skips set play rate to regular so we don't skip too much

              graffiti.jumpPlayback(1, durationMillis);
              state.updateCurrentSkipRecord();
              state.setCurrentPlaySpeed(userChoicePlaySpeed);
              didSkip = true;
              break;

            case state.skipTypes['compressed']:
              // This is the time we're going to try to compress time into (assume user gave us seconds, not millis)
              var compressedTimeTarget = Math.min(duration, skipInfo.factor * 1000);
              state.setCompressedTimePlayRate(duration, compressedTimeTarget);
              state.setCurrentPlaySpeed('compressed');
              didSkip = true;
              break;
          }

          state.activateApplyingRawCalculatedScrollTop();
        } else {
          state.clearAppliedSkipRecord(); // Now stop any acceleration from a skip, and return to whatever speed the user was viewing with before the skip started.

          state.setCurrentPlaySpeed(userChoicePlaySpeed);
        }

        if (didSkip || changedSpeed) {
          graffiti.updateControlPanels();
          audio.updateAudioPlaybackRate();
        }

        return didSkip;
      },
      pausePlaybackNoVisualUpdates: function pausePlaybackNoVisualUpdates() {
        if (state.getActivity() === 'playing') {
          graffiti.changeActivity('playbackPaused');
          audio.pausePlayback(); //console.log('Graffiti: pausePlaybackNoVisualUpdates');

          state.setPlayTimeEnd(); // Make sure, if some markdown was selected, that the active code_mirror textarea reengages to get keystrokes.

          graffiti.updateSelectedCellSelections(graffiti.sitePanel.scrollTop());
          state.updateUsageStats({
            type: 'play',
            data: {
              actions: ['updateCurrentPlayTime']
            }
          });
        }
      },
      // Pause any ongoing playback
      pausePlayback: function pausePlayback() {
        if (state.getActivity() !== 'playing') return;
        graffiti.pausePlaybackNoVisualUpdates();
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        state.clearAnimationIntervals();
        utils.queueSaveNotebookCallback(function () {
          console.log('Graffiti: Stopped playback.');
        });
        utils.saveNotebookDebounced();
      },
      cancelPlaybackNoVisualUpdates: function cancelPlaybackNoVisualUpdates() {
        var accessLevel = state.getAccessLevel();
        graffiti.pausePlaybackNoVisualUpdates();
        state.updateUsageStats({
          type: 'play',
          data: {
            actions: ['incrementPlayCount', 'updateTotalPlayTime']
          }
        });
        state.resetPlayState();
        graffiti.changeActivity('idle'); // Saving and restoring the scroll top is a bit of hack.

        var currentScrollTop = graffiti.sitePanel.scrollTop();

        if (state.getDontRestoreCellContentsAfterPlayback()) {
          console.log('Graffiti: not restoring cell contents.');
        } else {
          graffiti.removeCellsAddedByPlaybackOrRecording();
          state.restoreCellStates('contents');
          state.restoreCellStates('selections');
          state.restoreLineNumbersStates();
        }

        state.setDontRestoreCellContentsAfterPlayback(false); // make sure by default we restore contents.

        terminalLib.saveOrRestoreTerminalOutputs('restore'); // restore any terminals affected by playback

        utils.saveNotebookDebounced();
        graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because restoring cell contents messes with it
        // console.log('Graffiti: Got these stats:', state.getUsageStats());
      },
      cancelPlaybackFinish: function cancelPlaybackFinish() {
        graffiti.resetStickerCanvases();
        graffiti.cancelRapidPlay();
        graffiti.graffitiCursorShell.hide();
        graffiti.clearCanvases('all');
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.clearJupyterMenuHint();
      },
      cancelPlayback: function cancelPlayback() {
        console.log('Graffiti: cancelPlayback called');
        var activity = state.getActivity();

        if (activity !== 'playing' && activity !== 'playbackPaused' && activity !== 'playbackPending' && activity !== 'scrubbing') {
          return;
        }

        console.log('Graffiti: Cancelling playback');
        graffiti.cancelPlaybackNoVisualUpdates();
        state.clearAnimationIntervals();
        state.clearNarratorInfo();
        graffiti.cancelPlaybackFinish();
      },
      startPlayback: function startPlayback() {
        // Start playback
        var activity = state.getActivity(); // Prevent playing while playing already. Not sure how this occurs so trapping for it here

        if (activity === 'playing') {
          console.log('Graffiti: Cannot start playing because already playing.');
          return;
        } else if (activity !== 'playbackPending' && activity !== 'playbackPaused') {
          return; // do not try to start playback if playback was cancelled by the ESC key right before it could start (because of a slow network).
          // when this happens, activity will have been set back to 'idle'.
        }

        console.log('Graffiti: Starting playback, current activity:', activity);

        if (activity === 'idle' || activity === 'notifying' || activity === 'playbackPending') {
          state.updateUsageStats({
            type: 'play',
            data: {
              actions: ['resetCurrentPlayTime']
            }
          });
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.setCurrentPlaySpeed('regular');
          state.storeUserChoicePlaySpeed('regular');
          state.setSpeakingStatus(false);
          terminalLib.clearTerminalsContentsPositions();
          state.resetPlayTimes();
          graffiti.resetScrollNudge();
          graffiti.updateSlider(0);
          graffiti.placeControlPanel({
            nearAction: true
          });
          graffiti.prePlaybackScrolltop = state.getScrollTop();
          graffiti.lastScrollViewId = undefined;
          graffiti.lastDrawIndex = undefined;
          graffiti.lastDrawingEraseIndex = undefined;
          state.storeCellStates();
          state.clearCellOutputsSent();
          terminalLib.saveOrRestoreTerminalOutputs('save');
          graffiti.scrollNudgeAverages = [];
          var stickerImageCandidateUrl = state.getStickerImageCandidateUrl();

          if (stickerImageCandidateUrl !== undefined) {
            state.setStickerImageUrl(stickerImageCandidateUrl);
          } else {
            state.setStickerImageUrl(undefined);
          }
        } else if (activity === 'playbackPaused') {
          graffiti.hideTip(); // immediately hide any tips when resuming play
        }

        if (activity === 'idle' || activity === 'notifying' || activity === 'playbackPaused' || activity === 'playbackPending') {
          graffiti.clearCanvases('all');
        }

        graffiti.clearHighlightMarkText();
        graffiti.undimGraffitiCursor();
        graffiti.changeActivity('playing');
        graffiti.lastTemporaryCanvasClearViewIndex = -1;

        if (state.getResetOnNextPlay()) {
          console.log('Graffiti: Resetting for first/re play.');
          graffiti.clearCanvases('all');
          graffiti.wipeAllStickerDomCanvases();
          state.resetPlayState();
          graffiti.removeCellsAddedByPlaybackOrRecording();
          graffiti.applyRawCalculatedScrollTop(0);
        }

        if (state.getCurrentPlaySpeed() === 'scan') {
          state.setPlayTimeBegin('regular'); // all scanning playback starts at regular playback speed initially until speaking starts and ends
        }

        state.setPlaybackStartTime(utils.getNow() - state.getTimePlayedSoFar());
        state.setPlayStartTimeToNow();
        state.updateCurrentSkipRecord();

        if (!state.getMute()) {
          audio.startPlayback(state.getTimePlayedSoFar());
        } // Set up main playback loop


        state.startAnimationInterval('playback', function () {
          var playedSoFar = state.getTimePlayedSoFar();
          var endOfPlayableTime = state.getHistoryDuration();

          if (playedSoFar >= endOfPlayableTime) {
            // reached end of recording naturally, so set up for restart on next press of play button
            //console.log('end of recording reached, playedSoFar:', playedSoFar, 'duration', state.getHistoryDuration());
            state.setupForReset();
            graffiti.togglePlayback();
          } else {
            if (!graffiti.applyCurrentSkipRecord(playedSoFar)) {
              graffiti.updateSlider(playedSoFar);
              graffiti.updateTimeDisplay(playedSoFar);
              var frameIndexes = state.getHistoryRecordsAtTime(playedSoFar);
              graffiti.updateDisplay(frameIndexes);
            } //console.log('play interval, now=', utils.getNow());

          }
        }, graffiti.playbackIntervalMs);
      },
      togglePlayback: function togglePlayback() {
        var activity = state.getActivity();

        if (activity !== 'recording') {
          if (activity === 'playing') {
            state.clearAnimationIntervals();

            if (state.getHidePlayerAfterPlayback() && state.getSetupForReset()) {
              graffiti.cancelPlayback();
            } else {
              graffiti.pausePlayback(); //console.log('total play time:', utils.getNow() - playStartedAt);
            }
          } else {
            graffiti.startPlayback();
            playStartedAt = utils.getNow(); //console.log('started playback at:', playStartedAt);
          }
        }
      },
      // If there is a graffiti that has the autoplayAlways attribute set to true, play it immediately.
      // Otherwise, if there is one with autoplayOnce attribute set to true and it hasn't been played previously, play it immediately.
      playAutoplayGraffiti: function playAutoplayGraffiti() {
        var manifest = state.getManifest();
        var recordingCellId,
            recordingKeys,
            recording,
            autoplayGraffiti,
            autoplayedOnce = false;

        for (var _i16 = 0, _Object$keys11 = Object.keys(manifest); _i16 < _Object$keys11.length; _i16++) {
          recordingCellId = _Object$keys11[_i16];
          recordingKeys = Object.keys(manifest[recordingCellId]);

          if (recordingKeys.length > 0) {
            var _iteratorNormalCompletion14 = true;
            var _didIteratorError14 = false;
            var _iteratorError14 = undefined;

            try {
              for (var _iterator14 = recordingKeys[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                recordingKey = _step14.value;
                recording = manifest[recordingCellId][recordingKey]; // console.log('Graffiti autoplay rec:', recording);

                if (recording.autoplay !== undefined) {
                  if (autoplayGraffiti === undefined) {
                    if (recording.autoplay === 'always') {
                      autoplayGraffiti = {
                        recordingCellId: recordingCellId,
                        recordingKey: recordingKey
                      };
                    } else if (recording.autoplay === 'once') {
                      if (!recording.playedOnce) {
                        autoplayGraffiti = {
                          recordingCellId: recordingCellId,
                          recordingKey: recordingKey
                        };
                        recording.playedOnce = true;
                        autoplayedOnce = true;
                      }
                    }
                  }
                }
              }
            } catch (err) {
              _didIteratorError14 = true;
              _iteratorError14 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion14 && _iterator14["return"] != null) {
                  _iterator14["return"]();
                }
              } finally {
                if (_didIteratorError14) {
                  throw _iteratorError14;
                }
              }
            }
          }
        }

        if (autoplayGraffiti !== undefined) {
          graffiti.playRecordingById(autoplayGraffiti.recordingCellId, autoplayGraffiti.recordingKey);

          if (autoplayedOnce) {
            storage.storeManifest();
          }
        }
      },
      playMovieViaUserClick: function playMovieViaUserClick() {
        console.log('Graffiti: playMovieViaUserClick starts.');
        var activity = state.getActivity();
        var playableMovie = state.getPlayableMovie('tip');
        console.log('Graffiti: playableMovie', playableMovie);

        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie known.');

          if (activity !== 'recording') {
            graffiti.changeActivity('idle');
          }

          return;
        }

        if (activity === 'recording') {
          // Allow the first part of a graffiti to fire during recording (not the movie), so that terminal commands and show/hide buttons
          // can be used during recordings.
          // Prevent running the same graffiti you're recording for, however.
          var recordingCellInfo = state.getRecordingCellInfo();

          if (recordingCellInfo !== undefined) {
            if (recordingCellInfo.recordingCellId == playableMovie.recordingCellId && recordingCellInfo.recordingKey == playableMovie.recordingKey) {
              console.log('Graffiti: not running this graffiti during recording because it is the same one you are recording for:', recordingCellInfo);
              return;
            }
          }

          graffiti.loadAndPlayMovie('tip');
          return;
        } else if (activity === 'playbackPending') {
          console.log('Graffiti: not playing movie via user click because another movie is pending.');
          return; // prevent rapid clicks on graffiti where play_to_click is active.
        }

        var recording = state.getManifestSingleRecording(playableMovie.recordingCellId, playableMovie.recordingKey);

        if (recording.terminalCommand === undefined) {
          // Cancel any ongoing playback before starting playback, unless this graffiti has a terminal command.
          graffiti.cancelPlayback();
          graffiti.changeActivity('playbackPending');
        }

        if (state.getDontRestoreCellContentsAfterPlayback()) {
          // If this movie is set to NOT restore cell contents, give the user a chance to opt-out of playback.
          var dialogContent = localizer.getString('REPLACE_CONFIRM_BODY_1');
          var modalButtons = {};
          modalButtons[localizer.getString('REPLACE_CONFIRM_BODY_2')] = {
            click: function click(e) {
              console.log('Graffiti: you want to preserve cell contents after playback.'); // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie

              state.setPlayableMovie('tip', playableMovie.recordingCellId, playableMovie.recordingKey);
              state.setDontRestoreCellContentsAfterPlayback(false);
              graffiti.loadAndPlayMovie('tip');
            }
          };
          modalButtons[localizer.getString('REPLACE_CONFIRM_BODY_3')] = {
            click: function click(e) {
              // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie
              state.setPlayableMovie('tip', playableMovie.recordingCellId, playableMovie.recordingKey);
              state.setDontRestoreCellContentsAfterPlayback(true);
              graffiti.loadAndPlayMovie('tip');
            }
          };
          var confirmModal = dialog.modal({
            title: localizer.getString('PLAY_CONFIRM'),
            body: dialogContent,
            sanitize: false,
            buttons: modalButtons
          });
          confirmModal.on('hidden.bs.modal', function (e) {
            console.log('Graffiti: escaped the dontRestoreCellContents modal.');
          });
        } else {
          graffiti.loadAndPlayMovie('tip');
        }
      },
      executeSaveToFileDirectives: function executeSaveToFileDirectives(cellId) {
        if (cellId !== undefined) {
          var cellIdToGraffitiMap = state.getCellIdToGraffitiMap(cellId);

          if (cellIdToGraffitiMap !== undefined) {
            console.log('Graffiti: executing saveToFile directives for cell id:', cellId);

            var _cell6 = utils.findCellByCellId(cellId);

            var fileContents = _cell6.get_text();

            var saveToFilePath, i; // Loop over all directives and save all files.

            for (i = 0; i < cellIdToGraffitiMap.length; ++i) {
              saveToFilePath = cellIdToGraffitiMap[i];
              console.log('Graffiti: Writing fileContents to saveToFilePath', saveToFilePath);
              storage.writeTextToFile({
                path: saveToFilePath,
                contents: fileContents,
                stripCRs: false
              });
            }
          }

          storage.cleanUpExecutorCell();
        }
      },
      executeAllSaveToFileDirectives: function executeAllSaveToFileDirectives() {
        var cells = Jupyter.notebook.get_cells();
        var _iteratorNormalCompletion15 = true;
        var _didIteratorError15 = false;
        var _iteratorError15 = undefined;

        try {
          for (var _iterator15 = cells[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
            var _cell7 = _step15.value;

            if (_cell7.cell_type === 'code') {
              var cellId = utils.getMetadataCellId(_cell7.metadata);
              graffiti.executeSaveToFileDirectives(cellId);
            }
          }
        } catch (err) {
          _didIteratorError15 = true;
          _iteratorError15 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion15 && _iterator15["return"] != null) {
              _iterator15["return"]();
            }
          } finally {
            if (_didIteratorError15) {
              throw _iteratorError15;
            }
          }
        }
      },
      executeInsertDataFromFile: function executeInsertDataFromFile(recordingCellId, recordingKey, recording) {
        //console.trace('executeInsertDataFromFile');
        var insertDataFromFile = recording.insertDataFromFile;
        var filePath = insertDataFromFile.filePath; // Note that we re-use the recording key here. See note below about why.

        var existingCellId = recordingKey;
        var existingCell = utils.findCellByCellId(existingCellId);

        if (existingCell === undefined) {
          return storage.fetchDataFile(filePath).then(function (contents) {
            var viewInfo = state.getViewInfo();
            var cellType = insertDataFromFile.cellType;
            var newCell = Jupyter.notebook.insert_cell_below(cellType === undefined ? 'markdown' : cellType, viewInfo.cellIndex); // Override the randomly created cell id for this inserted cell with a fixed id based on the recording key. This way, any graffiti
            // recorded for this directive will have a known graffiti cell id to record activity over.  When we start recording a movie
            // for a graffiti with the insertDataFromFile directive, we should run this function first before beginning the movie recording
            // so that we have the cell ready to record from.

            utils.setMetadataCellId(newCell.metadata, existingCellId);
            utils.refreshCellMaps();
            var newCellIndex = viewInfo.cellIndex + 1;
            Jupyter.notebook.select(newCellIndex);
            newCell.set_text(contents);
            newCell.render();
            return Promise.resolve(true);
          })["catch"](function (ex) {
            console.log('Graffiti: executeInsertDataFromFile is unable to fetch data from path:', filePath);
            dialog.modal({
              title: localizer.getString('FILE_UNAVAILABLE') + ' : ' + filePath,
              body: localizer.getString('FILE_UNAVAILABLE_EXPLANATION'),
              sanitize: false,
              buttons: {
                'OK': {
                  click: function click(e) {
                    console.log('Graffiti: Missing file acknowledged.');
                  }
                }
              }
            });
            return Promise.reject();
          });
        } else {
          var existingCellIndex = utils.findCellIndexByCellId(existingCellId);

          if (existingCellIndex !== undefined) {
            Jupyter.notebook.delete_cell(existingCellIndex);
            return Promise.resolve(false); // false indicates we did not insert a new cell
          }
        }
      },
      // Execute any "label swaps" on graffiti clicks.  This is smart enough to distinguish graffiti buttons from other graffiti.
      executeLabelSwaps: function executeLabelSwaps(recording, recordingCellId, recordingKey, insertedData) {
        if (recording.swappingLabels === true) {
          if (recording.labelSwaps !== undefined && recording.labelSwaps.length === 2) {
            var viewInfo = state.getViewInfo();
            var hoverCellId = viewInfo.cellId;
            var hoverCellIndex = viewInfo.cellIndex;
            var hoverCell = utils.findCellByCellId(hoverCellId);

            if (hoverCell.cell_type !== 'markdown') {
              return Promise.reject(); // we cannot do label swaps on code cells
            }

            Jupyter.notebook.select(hoverCellIndex);
            var hoverCellText = hoverCell.get_text();
            var tagClass = 'graffiti-' + recordingCellId + '-' + recordingKey;
            var startTag = '<span class="graffiti-highlight ' + tagClass + '">';
            var startPos = hoverCellText.indexOf(startTag);

            if (startPos >= 0) {
              var endTag = '</span>';
              endPos = hoverCellText.indexOf(endTag, startPos);
              var startPastTag = startPos + startTag.length;
              var currentLabel = hoverCellText.substr(startPastTag, endPos - startPastTag);
              var buttonMatch = currentLabel.match(/(<i><\/i><button>)(.*?)(<\/button>)/);

              if (buttonMatch !== null) {
                currentLabel = buttonMatch[2];
              }

              currentLabel = recording.labelSwaps[0];

              if (insertedData) {
                currentLabel = recording.labelSwaps[1];
              }

              var newContents = hoverCellText.substr(0, startPastTag) + (buttonMatch !== null ? buttonMatch[1] : '') + currentLabel + (buttonMatch !== null ? buttonMatch[3] : '') + hoverCellText.substr(endPos);
              hoverCell.set_text(newContents);
              hoverCell.render();
              graffiti.refreshAllGraffitiHighlights();
              var hoverCellElement = hoverCell.element[0];
              var swappedButtonDOM = $(hoverCellElement).find('.' + tagClass);
              graffiti.refreshGraffitiTooltipsCore(swappedButtonDOM, 'mouseenter'); // simulate a mouseenter event so that the new button gets bound

              if (insertedData) {
                // we only record the "show" actions, not the "hide" actions
                state.updateUsageStats({
                  type: 'insertDataFromFile',
                  data: {
                    cellId: recordingCellId,
                    recordingKey: recordingKey
                  }
                });
              }
            }
          }
        }

        return Promise.resolve(insertedData);
      },
      cleanupAfterLoadAndPlayDidNotPlay: function cleanupAfterLoadAndPlayDidNotPlay() {
        var activity = state.getActivity();

        if (activity === 'playbackPending') {
          graffiti.clearJupyterMenuHint();
          graffiti.changeActivity('idle');
          state.setDontRestoreCellContentsAfterPlayback(false);
          graffiti.refreshAllGraffitiHighlights();
          graffiti.refreshGraffitiTooltips();
          graffiti.updateControlPanels();
        }
      },
      startLoadedMovie: function startLoadedMovie(recording, playableMovie) {
        console.log('Graffiti: Movie loaded for cellId, recordingKey:', playableMovie.recordingCellId, playableMovie.recordingKey);
        state.updateUsageStats({
          type: 'setup',
          data: {
            cellId: playableMovie.recordingCellId,
            recordingKey: playableMovie.recordingKey,
            activeTakeId: playableMovie.activeTakeId
          }
        });
        state.setCurrentlyPlayingMovie(playableMovie);
        state.setNarratorInfo('name', recording.narratorName);
        state.setNarratorInfo('picture', recording.narratorPicture);
        state.setSkipInfo(recording.skipInfo);
        state.clearScaleCursorWithWindow();
        state.setNarratorInfoIsRendered(false);

        if (recording.scaleCursorWithWindow) {
          state.setScaleCursorWithWindow();
        }

        state.setTotalSkipTimeForRecording();

        if (playableMovie.cell !== undefined && playableMovie.cellType === 'markdown') {
          playableMovie.cell.render(); // always render a markdown cell first before playing a movie on a graffiti inside it
        }

        graffiti.togglePlayback();
        graffiti.hideTip();
      },
      loadAndPlayMovie: function loadAndPlayMovie(kind) {
        var playableMovie = state.getPlayableMovie(kind);

        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie defined.');
          return;
        }

        console.log('Graffiti: loadAndPlayMovie has playableMovie=', playableMovie);
        var activity = state.getActivity();
        var recording = state.getManifestSingleRecording(playableMovie.recordingCellId, playableMovie.recordingKey);

        var fireUpMovie = function fireUpMovie() {
          if (activity === 'recording') {
            return; // Don't start any movie if in the middle of a recording session. Bailing early means that we can fire up
            // graffiti that have movies without starting the movie, so that we can run terminal commands and show/hide+insertDataFromfile
            // rigs while recording.
          } // Default is now to only replay cells involved in the recording (that got focus, selection, were drawn on, etc, but not moused over)


          if (recording.replayAllCells === true) {
            state.setShouldUpdateCellContentsDuringPlayback(true);
          } else {
            // if false or undefined, only update cells affected by the recording
            state.setShouldUpdateCellContentsDuringPlayback(false);
          }

          $('#graffiti-movie-play-btn').html('<i>' + localizer.getString('LOADING') + '</i>').prop('disabled', true);
          var historyData = state.getFromMovieCache('history', playableMovie);
          var audioData = state.getFromMovieCache('audio', playableMovie);

          if (historyData !== undefined && audioData !== undefined) {
            //console.log('historyData:', historyData.terminalsContents['id_za35048']);
            state.setHistory(historyData);
            audio.setRecordedAudio(audioData);
            graffiti.startLoadedMovie(recording, playableMovie);
          } else {
            storage.fetchMovie(playableMovie).then(function (movieData) {
              state.setHistory(movieData.history);
              audio.setRecordedAudio(movieData.audio);
              graffiti.startLoadedMovie(recording, playableMovie);
            })["catch"](function (ex) {
              graffiti.cleanupAfterLoadAndPlayDidNotPlay();

              if (!(recording.silenceWarnings === true)) {
                dialog.modal({
                  title: localizer.getString('MOVIE_UNAVAILABLE'),
                  body: localizer.getString('MOVIE_UNAVAILABLE_EXPLANATION'),
                  sanitize: false,
                  buttons: {
                    'OK': {
                      click: function click(e) {
                        console.log('Graffiti: Missing movie acknowledged.');
                      }
                    }
                  }
                });
              }

              console.log('Graffiti: could not load movie:', ex);
            });
          }
        };

        if (recording.terminalCommand !== undefined) {
          var terminalCommand = recording.terminalCommand;
          terminalLib.runTerminalCommand(terminalCommand.terminalId, terminalCommand.command, true);

          if (activity !== 'recording') {
            graffiti.cleanupAfterLoadAndPlayDidNotPlay(); // clean up *unless* we are recording; then we should just let things keep going.
          }

          state.updateUsageStats({
            type: 'terminalCommand',
            data: {
              cellId: playableMovie.recordingCellId,
              recordingKey: playableMovie.recordingKey,
              command: terminalCommand.command
            }
          });
          return; // we are done if we ran a terminal command, don't bother to load any movies for playback.
        } // Execute any "insert data from file" directives.


        if (recording.insertDataFromFile !== undefined) {
          graffiti.executeInsertDataFromFile(playableMovie.recordingCellId, playableMovie.recordingKey, recording).then(function (results) {
            return graffiti.executeLabelSwaps(recording, playableMovie.recordingCellId, playableMovie.recordingKey, results);
          }).then(function (results) {
            if (results) {
              fireUpMovie(); // do not play a movie unless we actually inserted content with insertDataFromFile.
            } else {
              graffiti.cleanupAfterLoadAndPlayDidNotPlay();
            }
          })["catch"](function () {
            console.log('Graffiti: could not run executeInsertDataFromFile.');
            graffiti.cleanupAfterLoadAndPlayDidNotPlay();
          });
        } else {
          // There are no insertDataFromFile directives, so just start the movie.
          fireUpMovie();
        }
      },
      playRecordingById: function playRecordingById(recordingCellId, recordingKey) {
        var recording = state.setPlayableMovie('api', recordingCellId, recordingKey);

        if (recording !== undefined) {
          graffiti.loadAndPlayMovie('api');
        } else {
          // Putting an error message in console for this failure mode is gentler than the dialog box put up by loadAndPlayMovie(),
          // because if we are being called by an autoplay movie that was on a delete cell, the
          // endless dialog boxes would drive the user crazy (because they could not remove the graffiti from our manifest)
          console.log('Graffiti: not playing movie ' + recordingCellId + ':' + recordingKey + ', as it was not available.');
        }
      },
      playRecordingByIdString: function playRecordingByIdString(recordingFullId) {
        var parts = utils.parseRecordingFullId(recordingFullId);
        graffiti.playRecordingById(parts.recordingCellId, parts.recordingKey);
      },
      playRecordingByIdWithPrompt: function playRecordingByIdWithPrompt(recordingFullId, promptMarkdown) {
        graffiti.changeActivity('notifying');
        var promptHtml = '<span>' + utils.renderMarkdown(promptMarkdown) + '</span>';
        graffiti.setNotifier('<div id="graffiti-notifier-prompt">' + promptHtml + '</div>', [{
          ids: ['graffiti-notifier-prompt'],
          event: 'click',
          fn: function fn(e) {
            graffiti.playRecordingByIdString(recordingFullId);
          }
        }]);
      },
      activateAudio: function activateAudio() {
        if (!state.getAudioInitialized()) {
          audio.init({
            succeed: function succeed() {
              state.setAudioInitialized();
            },
            fail: function fail() {
              dialog.modal({
                title: localizer.getString('ACCESS_MICROPHONE_PROMPT'),
                body: localizer.getString('ACCESS_MICROPHONE_ADVISORY'),
                sanitize: false,
                buttons: {
                  'OK': {}
                }
              });
            }
          });
        }
      },
      changeAccessLevel: function changeAccessLevel(level) {
        if (level === 'create') {
          graffiti.cancelPlayback();
          graffiti.activateAudio(); // we need to activate audio to create the audio object, even if microphone access was previously granted.

          storage.ensureNotebookGetsGraffitiId();
          storage.ensureNotebookGetsFirstAuthorId();
          utils.assignCellIds();
          utils.queueSaveNotebookCallback(function () {
            graffiti.refreshAllGraffitiHighlights();
            graffiti.refreshGraffitiTooltipsDebounced();
          });
          utils.saveNotebookDebounced();
        } else {
          graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);
        }

        state.setAccessLevel(level);
        graffiti.updateControlPanels();
      },
      toggleAccessLevel: function toggleAccessLevel(forcedLevel) {
        var buttonLabel;
        var level = forcedLevel === undefined ? state.getAccessLevel() : forcedLevel;

        if (forcedLevel !== undefined) {
          if (level === 'create') {
            buttonLabel = localizer.getString('HIDE_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('create');
          } else {
            buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('view');
          }
        } else {
          if (level === 'create') {
            buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('view');
          } else {
            buttonLabel = localizer.getString('HIDE_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('create');
          }
        }

        $('#graffiti-setup-button span:last').text(buttonLabel);
      },
      showCreatorsChooser: function showCreatorsChooser() {
        graffiti.setNotifier(localizer.getString('YOU_CAN_FILTER'));
        graffiti.showControlPanels(['graffiti-notifier', 'graffiti-creators-chooser']);
      },
      transferGraffiti: function transferGraffiti() {
        storage.transferGraffiti().then(function () {
          dialog.modal({
            title: 'Transfer Complete',
            body: 'Your Notebook\'s Graffitis have been copied over from the original notebook. ' + 'Now you can modify them (or add and remove Graffitis to this notebook),  without affecting the original notebook\'s Graffitis.',
            sanitize: false,
            buttons: {
              'OK': {
                click: function click(e) {
                  console.log('Graffiti: You clicked ok');
                }
              }
            }
          });
        });
      },
      packageGraffiti: function packageGraffiti() {
        storage.packageGraffiti().then(function (fileName) {
          dialog.modal({
            title: 'Packaging Complete',
            body: 'Your Notebook\'s Graffitis, and your notebook, have been copied into a archive file.<br><br>' + 'Now you can copy and unpack that archive file anywhere Graffiti is supported, using the terminal command: ' + '<code>tar zxf ' + fileName + '</code>',
            sanitize: false,
            buttons: {
              'OK': {
                click: function click(e) {
                  console.log('Graffiti: You clicked ok');
                }
              }
            }
          });
        });
      },
      updateSetupButton: function updateSetupButton() {
        var notebook = Jupyter.notebook;
        var sprayCanIcon = stickerLib.makeSprayCanIcon();
        var workspace = state.getWorkspace();
        var buttonStyleHtml = workspace && workspace.coco ? 'display:inline-block;' : '"display:none;"';
        var buttonLabel,
            setupForSetup = false;
        var buttonContents = '<div id="graffiti-setup-button" style=' + buttonStyleHtml + ' class="btn-group"><button class="btn btn-default" title="' + localizer.getString('ENABLE_GRAFFITI') + '">';

        if (!notebook.metadata.hasOwnProperty('graffiti')) {
          // This notebook has never been graffiti-ized, or it just got un-graffiti-ized
          var existingSetupButton = $('#graffiti-setup-button');

          if (existingSetupButton.length > 0) {
            existingSetupButton.remove();
          }

          buttonLabel = localizer.getString('ACTIVATE_GRAFFITI');
          setupForSetup = true;
        } else {
          // This notebook has already been graffiti-ized. Render the setup button for view mode,
          // which is the default mode to start.
          buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
        }

        var setupButtonDiv = $(buttonContents + '<span>' + buttonLabel + '</div></button></span>');
        var jupyterMainToolbar = $('#maintoolbar-container');
        setupButtonDiv.appendTo(jupyterMainToolbar);
        $('#graffiti-setup-button button').prepend(sprayCanIcon);

        if (setupForSetup) {
          $('#graffiti-setup-button').click(function () {
            graffiti.firstTimeSetup();
          });
        } else {
          $('#graffiti-setup-button').click(function () {
            graffiti.toggleAccessLevel();
          });
        }
      },
      firstTimeSetup: function firstTimeSetup() {
        dialog.modal({
          title: localizer.getString('ACTIVATE_GRAFFITI_CONFIRM'),
          body: localizer.getString('ACTIVATE_GRAFFITI_ADVISORY'),
          sanitize: false,
          buttons: {
            'OK': {
              click: function click(e) {
                console.log('Graffiti: You clicked ok');
                storage.ensureNotebookGetsGraffitiId();
                storage.ensureNotebookGetsFirstAuthorId();
                utils.queueSaveNotebookCallback(function () {
                  utils.createApiSymlink();
                  graffiti.initInteractivity();
                  graffiti.toggleAccessLevel('view');
                  graffiti.activateAudio(); // request microphone access in case switching to 'create' mode later

                  $('#graffiti-setup-button').unbind('click').click(function () {
                    graffiti.toggleAccessLevel();
                  });
                });
                utils.saveNotebookDebounced();
              }
            },
            'Cancel': {
              click: function click(e) {
                console.log('Graffiti: Not adding Graffiti.');
              }
            }
          }
        });
      }
    }; // Functions exposed externally to the Python API.

    return {
      init: graffiti.init,
      graffiti: graffiti,
      // remove me
      state: state,
      // remove me
      playRecordingById: function playRecordingById(recordingFullId) {
        graffiti.playRecordingByIdString(recordingFullId);
      },
      playRecordingByIdWithPrompt: function playRecordingByIdWithPrompt(recordingFullId, promptMarkdown) {
        graffiti.playRecordingByIdWithPrompt(recordingFullId, promptMarkdown);
      },
      cancelPlayback: function cancelPlayback() {
        graffiti.cancelPlayback();
      },
      removeUnusedTakes: function removeUnusedTakes(recordingFullId) {
        graffiti.removeUnusedTakesWithConfirmation(recordingFullId);
      },
      removeAllUnusedTakes: function removeAllUnusedTakes() {
        graffiti.removeAllUnusedTakesWithConfirmation();
      },
      removeAllGraffiti: graffiti.removeAllGraffitisWithConfirmation,
      disableGraffiti: graffiti.disableGraffitiWithConfirmation,
      setAccessLevel: function setAccessLevel(level) {
        graffiti.toggleAccessLevel(level);
      },
      transferGraffiti: function transferGraffiti() {
        graffiti.transferGraffiti();
      },
      packageGraffiti: function packageGraffiti() {
        graffiti.packageGraffiti();
      },
      getUsageStats: function getUsageStats() {
        return state.getUsageStats();
      },
      selectionSerializer: selectionSerializer,
      controlTerminal: function controlTerminal(opts) {
        graffiti.controlTerminal(opts);
      } // showCreatorsChooser: graffiti.showCreatorsChooser, // demo only

    };
  }();

  return Graffiti;
}); // affected files
//      modified:   js/graffiti.js
//	modified:   js/loader.js
//	modified:   js/state.js
//	modified:   js/storage.js
//	modified:   js/utils.js