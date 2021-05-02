"use strict";

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

define(['js/utils.js', 'js/terminals.js'], function (utils, terminalLib) {
  var _state;

  var state = (_state = {
    init: function init() {
      console.log('Graffiti: state constructor running.');
      state.history = undefined;
      state.manifest = {};
      state.movieCache = {
        history: {},
        audio: {}
      };
      state.accessLevel = 'view'; // one of 'create' or 'view'. If 'create' then we can create new graffitis, otherwise we can only view them

      state.authorId = undefined; // set when we activivateGraffiti or load a manifest

      state.authorType = 'creator'; // currently hardwired to be creator (teacher).

      state.audioInitialized = false;
      state.recordingBlocked = false;
      state.activity = 'idle'; // one of "recording", "playing", "idle"

      state.previousActivity = undefined;
      state.shouldUpdateCellContentsDuringPlayback = false;
      state.pointer = {
        x: 0,
        y: 0
      };
      state.windowSize = state.getWindowSize();
      state.resetOnNextPlay = false;
      state.recordedAudioString = '';
      state.audioStorageCallback = undefined;
      state.frameArrays = ['view', 'selections', 'contents', 'drawings', 'terminals', 'speaking', 'skip'];
      state.scrollTop = undefined;
      state.selectedCellId = undefined;
      state.mute = false;
      state.compressedPlayTimeDuration = 0.25 * 1000; // millis. make compressed time "really fast". It won't really compress down to this few seconds though, JS is too slow.

      state.playSpeeds = {
        'regular': 1.0,
        // playback rate at speed it was originally recorded
        'rapid': 2.0,
        // playback rate when watching entire recording fast, either a multiplier of real-time, or a "compressed time" multiplier
        'compressed': 1.0,
        // this is not a play rate, but a target time to compress skips into
        'scanInactive': 1.0,
        // playback rate while watching non-silence (speaking) in the recording (defunct)
        'scanActive': 3.0 // playback rate while watching silence (no speaking) in the recordin (defunct)

      };
      state.currentPlaySpeed = 'regular';
      state.userChoicePlaySpeed = 'regular';
      state.rapidScanActive = false; // whether rapidscan is activate at this moment (it's activated during silent moments so we play faster)

      state.recordedCursorPosition = {
        x: -1000,
        y: -1000
      };
      state.viewInfo = undefined;
      state.recordingCellInfo = {};
      state.tipTimeout = undefined;
      state.displayedTipInfo = undefined;
      state.movieRecordingStarted = false;
      state.cellsAffectedByActivity = {};
      state.terminalsAffectedByActivity = undefined;
      state.drawingFadeClockAllowed = true;
      state.drawingFadeStart;
      state.drawingFadeDuration = 1000;
      state.drawingFadePreFadeDelay = 2000;
      state.maxDrawingOpacity = 0.5;
      state.drawingOpacity = state.maxDrawingOpacity;
      state.totalDrawingFadeDuration = state.drawingFadePreFadeDelay + state.drawingFadeDuration;
      state.lastEditActivityTime = undefined;
      state.controlPanelDragging = false;
      state.controlPanelDragOffset = {
        x: 0,
        y: 0
      };
      state.playableMovies = {};
      state.currentlyPlayingMovie = undefined;
      state.selectionSerialized = undefined;
      state.hidePlayerAfterPlayback = false;
      state.dontRestoreCellContentsAfterPlayback = false; // this is something the author can decide with a tooltip command.

      state.cellOutputsSent = {};
      state.stickerImageUrl = undefined;
      state.stickerImageCandidateUrl = undefined;
      state.cellIdsAddedDuringRecording = {};
      state.userId = undefined;
      state.workspace = {};
      state.speakingStatus = false; // true when the graffiti creator is currently speaking (not silent)

      state.currentSkipRecord = 0;
      state.appliedSkipRecord = undefined;
      state.totalSkipTimeForRecording = 0;
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: {}
      };
      state.skippedTimeSoFar = 0;
      state.animationIntervalIds = {};
      state.playbackCellAdditions = {};
      state.highlightsRefreshCellId = undefined;
      state.graffitiEditCellId = undefined;
      state.narratorInfo = {};
      state.narratorInfoIsRendered = false;
      state.shiftKeyIsDown = false;
      state.shiftKeyWentDown = false;
      state.scaleCursorWithWindow = false;
      state.terminalState = undefined;
      state.applyingRawCalculatedScrollTop = true; // turned off when applying skips, but usually on during scrubbing

      state.cellIdToGraffitiMap = {}; // maps which graffitis are present in which cells. Used for autosave cells.
      // Usage statistic gathering for the current session (since last load of the notebook)

      state.usageStats = {
        notebookLoadedAt: utils.getNow(),
        created: {},
        // how many graffiti were created
        played: {},
        // how much time and how many plays were done
        terminalCommands: {},
        // what terminal commands were executed by graffiti
        insertDataFromFile: {},
        // how many times we've done insert data from file (e.g. how many times "Show solution" type buttons were pressed) per graffiti
        userSkips: {},
        // which graffiti have been skipped around on by the user (scrubbed)
        totalTipsShown: 0,
        // how many times we've shown tips
        totalUniqueTipsShown: 0,
        totalUniquePlays: 0,
        totalPlaysAllGraffiti: 0,
        totalPlayTimeAllGraffiti: 0,
        totalTerminalCommandsRun: 0,
        totalInsertDataFromFile: 0,
        totalUserSkips: 0,
        totalUserInterruptedLoading: 0,
        // how many times a user got fed up waiting for graffiti to load because of slow network
        uniqueTips: {}
      };
      state.statsKey = undefined; // Set up a default version of the drawing state object. This gets updated during drawing activity.

      state.drawingState = {
        drawingModeActivated: false,
        // when true a drawing tool is selected
        drawingActivity: 'draw',
        // One of 'draw', 'fade', 'wipe', 'sticker'. Note that 'drawing activity' includes using the eraser tool and stickering
        cellId: undefined,
        positions: {
          start: {
            x: 0,
            y: 0
          },
          end: {
            x: 0,
            y: 0
          }
        },
        promptWidth: 0,
        pen: {
          isDown: false,
          // becomes true when the pen is down, ie user has clicked and held the mouse button
          mouseDownPosition: {
            x: 0,
            y: 0
          },
          downInMarkdown: false,
          // Whether the pen went down in a markdown cell
          downInPromptArea: false,
          // Whether the pen went down in the prompt area
          inPromptArea: false,
          // True if the pen is in Jupyter's "prompt" div. This part of drawings/stickers will not be scaled in X, only in Y (if in markdown cell)
          permanence: 'temporary',
          // default: ink disappears after a second of inactivity
          type: 'line',
          // one of 'line', 'highlight', 'eraser', 'sticker'
          color: 'black',
          dash: 'solid',
          // one of 'solid', 'dashed'
          fill: 'none',
          // one of 'none', '#xyz'
          fillOpacity: 0
        },
        stickersRecords: {},
        // This contains records of all stickers drawn to date during a recording, or since the last fadeout in a recording.
        stickerOnGrid: false,
        opacity: state.maxDrawingOpacity
      };
      state.skipping = false; // true if we are currently recording a skip

      state.skipTypes = {
        rapid: 1,
        absolute: 2,
        compressed: 3
      };
      state.skipInfo = {
        type: state.skipTypes.absolute,
        factor: 0
      };
      state.END_RECORDING_KEYDOWN_TIMEOUT = 1200;
      utils.refreshCellMaps();
    },
    getManifest: function getManifest() {
      return state.manifest;
    },
    setManifest: function setManifest(manifest) {
      state.manifest = $.extend({}, manifest);
    },
    removeManifestEntry: function removeManifestEntry(recordingCellId, recordingKey) {
      var recordings = state.getManifestRecordingsForCell(recordingCellId);

      if (recordings != undefined) {
        if (recordings.hasOwnProperty(recordingKey)) {
          delete recordings[recordingKey];
          return true;
        }
      }

      return false;
    },
    getManifestSingleRecording: function getManifestSingleRecording(recordingCellId, recordingKey) {
      var recordings = state.getManifestRecordingsForCell(recordingCellId);

      if (recordings === undefined) {
        return undefined;
      }

      return recordings.hasOwnProperty(recordingKey) ? recordings[recordingKey] : undefined;
    },
    getManifestRecordingsForCell: function getManifestRecordingsForCell(recordingCellId) {
      return state.manifest.hasOwnProperty(recordingCellId) ? state.manifest[recordingCellId] : undefined;
    },
    setSingleManifestRecording: function setSingleManifestRecording(recordingCellId, recordingKey, recordingData) {
      if (!state.manifest.hasOwnProperty(recordingCellId)) {
        state.manifest[recordingCellId] = {};
      }

      state.manifest[recordingCellId][recordingKey] = recordingData;
    },
    refreshCellIdToGraffitiMap: function refreshCellIdToGraffitiMap() {
      state.cellIdToGraffitiMap = {};
      var manifest = state.getManifest();
      var recording, recordingCellId, recordingKeys, i, saveToFileEntry, cellId;

      for (var _i = 0, _Object$keys = Object.keys(manifest); _i < _Object$keys.length; _i++) {
        recordingCellId = _Object$keys[_i];
        recordingKeys = Object.keys(manifest[recordingCellId]);
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = recordingKeys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            recordingKey = _step.value;
            recording = manifest[recordingCellId][recordingKey];

            if (recording.saveToFile !== undefined && recording.saveToFile.length > 0) {
              for (i = 0; i < recording.saveToFile.length; ++i) {
                saveToFileEntry = recording.saveToFile[i];
                cellId = saveToFileEntry.cellId;

                if (state.cellIdToGraffitiMap[cellId] === undefined) {
                  state.cellIdToGraffitiMap[cellId] = [];
                }

                state.cellIdToGraffitiMap[cellId].push(saveToFileEntry.path);
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

      console.log('Graffiti: cellIdToGraffitiMap:', state.cellIdToGraffitiMap);
    },
    getCellIdToGraffitiMap: function getCellIdToGraffitiMap(cellId) {
      return state.cellIdToGraffitiMap[cellId];
    },
    // compute aggregate stats for this manifest: total number and time of all graffitis, how many cells have graffitis, etc.
    computeManifestStats: function computeManifestStats() {
      var manifest = state.manifest;
      var cells = Jupyter.notebook.get_cells();
      var totals = {
        totalGraffitis: 0,
        // how many graffitis in this notebook
        totalCells: cells.length,
        // how many cells in this notebook
        totalCellsWithGraffitis: 0,
        // how many cells have graffitis
        maxGraffitiPerCell: 0,
        // the maximum number of graffitis in any one cell
        maxTakesPerGraffiti: 0,
        // the maximum number of takes for any one graffiti to date
        totalRecordedTime: 0 // total play time of all graffitis

      };
      var recording, recordingCells, recordingCellId, recordingKeys;
      var lenCheck, activeTakeId, takes;
      recordingCells = Object.keys(manifest);

      if (recordingCells.length > 0) {
        for (var _i2 = 0, _Object$keys2 = Object.keys(manifest); _i2 < _Object$keys2.length; _i2++) {
          recordingCellId = _Object$keys2[_i2];

          if (recordingCellId !== 'stats') {
            // we don't want to gather stats on the stats themselves!
            recordingKeys = Object.keys(manifest[recordingCellId]);
            totals.totalCellsWithGraffitis++;
            lenCheck = recordingKeys.length;

            if (lenCheck > 0) {
              if (lenCheck > totals.maxGraffitiPerCell) {
                totals.maxGraffitiPerCell = lenCheck;
              }

              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = recordingKeys[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  recordingKey = _step2.value;
                  recording = manifest[recordingCellId][recordingKey];
                  totals.totalGraffitis++;
                  takes = recording.takes;

                  if (takes !== undefined) {
                    activeTakeId = recording.activeTakeId;

                    if (takes[activeTakeId] !== undefined) {
                      totals.totalRecordedTime += takes[activeTakeId].duration;
                    }

                    lenCheck = Object.keys(takes).length;

                    if (lenCheck > totals.maxTakesPerGraffiti) {
                      totals.maxTakesPerGraffiti = lenCheck;
                    }
                  }
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
          }
        }
      }

      return totals;
    },
    getAccessLevel: function getAccessLevel() {
      return state.accessLevel;
    },
    setAccessLevel: function setAccessLevel(level) {
      state.accessLevel = level;
    },
    getAuthorId: function getAuthorId() {
      return state.authorId;
    },
    setAuthorId: function setAuthorId(authorId) {
      state.authorId = authorId;
    },
    getAuthorType: function getAuthorType() {
      return state.authorType;
    },
    setAuthorType: function setAuthorType(authorType) {
      state.authorType = authorType;
    },
    getUserId: function getUserId() {
      return state.userId;
    },
    setUserId: function setUserId(userId) {
      state.userId = userId;
    },
    getWorkspace: function getWorkspace() {
      return state.workspace;
    },
    setWorkspace: function setWorkspace(workspace) {
      state.workspace = workspace;
    },
    getSpeakingStatus: function getSpeakingStatus() {
      return state.speakingStatus;
    },
    setSpeakingStatus: function setSpeakingStatus(speakingStatus) {
      state.speakingStatus = speakingStatus;
      state.storeHistoryRecord('speaking'); // record speaking status, if we are currently recording
    },
    clearHighlightsRefreshableCell: function clearHighlightsRefreshableCell() {
      state.highlightsRefreshCellId = undefined;
    },
    isSkipping: function isSkipping() {
      return state.skipping;
    },
    isLastSkipRecord: function isLastSkipRecord() {
      return state.currentSkipRecord !== undefined && state.history.skip !== undefined && state.currentSkipRecord === state.history.skip.length - 1;
    },
    startSkipping: function startSkipping() {
      state.skipping = true;
    },
    stopSkipping: function stopSkipping() {
      state.skipping = false;
    },
    toggleSkipping: function toggleSkipping() {
      state.skipping = !state.skipping;
      state.storeSkipRecord();
    },
    getCurrentSkipRecord: function getCurrentSkipRecord() {
      return state.currentSkipRecord;
    },
    // If the current time is in the current (or next) skip record, return the skip record.
    timeInSkipRecordRange: function timeInSkipRecordRange(t) {
      if (state.currentSkipRecord !== undefined) {
        var _record = state.history.skip[state.currentSkipRecord]; //console.log('timeInSkipRecordRange, checking time t', t, 'against record', record);

        if (_record.startTime <= t && t < _record.endTime && state.appliedSkipRecord !== state.currentSkipRecord) {
          return _record;
        }
      }

      return undefined;
    },
    setAppliedSkipRecord: function setAppliedSkipRecord() {
      state.appliedSkipRecord = state.currentSkipRecord;
      state.skippedTimeSoFar += state.currentSkipRecord.endTime - state.currentSkipRecord.startTime;
    },
    clearAppliedSkipRecord: function clearAppliedSkipRecord() {
      state.appliedSkipRecord = undefined;
    },
    getSkipInfo: function getSkipInfo() {
      return state.skipInfo;
    },
    setSkipInfo: function setSkipInfo(info) {
      if (info === undefined) {
        state.skipInfo = {
          type: state.skipTypes['absolute'],
          factor: 0
        };
      } else {
        state.skipInfo = {
          type: info.type,
          factor: info.factor
        };
      }
    },
    getTotalSkipTimeForRecording: function getTotalSkipTimeForRecording() {
      return state.totalSkipTimeForRecording;
    },
    setTotalSkipTimeForRecording: function setTotalSkipTimeForRecording() {
      var record;
      state.totalSkipTimeForRecording = 0;

      if (state.history.skip !== undefined) {
        for (var i = 0; i < state.history.skip.length; ++i) {
          record = state.history.skip[i]; // record.status is legacy, we only want to use status -1 skips from these skip records.

          if (record.status === undefined || record.status !== undefined && record.status === -1) {
            state.totalSkipTimeForRecording += record.endTime - record.startTime;
          }
        }
      }
    },
    // Set the current or next skip record by scanning from 0 to the time given, looking
    // for a skip record that either straddles the time given, or is greater than the time
    // given (next skip record).
    updateCurrentSkipRecord: function updateCurrentSkipRecord() {
      var t = state.getTimePlayedSoFar();
      var record;
      state.currentSkipRecord = undefined;
      state.skippedTimeSoFar = 0;

      if (state.history.skip !== undefined) {
        for (var i = 0; i < state.history.skip.length; ++i) {
          record = state.history.skip[i];

          if (record.endTime < t) {
            // keep track of total skip time up to the current time played
            state.skippedTimeSoFar += record.endTime - record.startTime;
          }

          if (record.startTime <= t && t < record.endTime || record.startTime > t) {
            state.currentSkipRecord = i;
            break;
          }
        }
      }
    },
    createSkipRecord: function createSkipRecord() {
      return {}; // there is no data needed in a skip record, just the fact that it exists and has a start and end time is sufficient.
    },
    // Create an absolute skip record for the very end of the recording for the time it was being cancelled (ctrl-key held down).
    addCancelTimeSkipRecord: function addCancelTimeSkipRecord() {
      state.skipping = true;
      var record = state.createSkipRecord();
      record.startTime = state.history.duration - state.END_RECORDING_KEYDOWN_TIMEOUT;
      record.endTime = state.history.duration - 1;
      state.history['skip'].push(record);
      console.log('Graffiti: after addCancelTimeSkipRecord, skip history:', state.history['skip']);
    },
    getSkipsRecords: function getSkipsRecords() {
      return state.history['skip'];
    },
    clearSkipsRecords: function clearSkipsRecords() {
      state.history['skip'] = [];
    },
    storeSkipRecord: function storeSkipRecord() {
      var numRecords = state.history['skip'].length;

      if (!state.skipping) {
        if (numRecords > 0) {
          // Close off last record created with an end time, if it exists.
          var lastRecord = state.history['skip'][numRecords - 1];

          if (!lastRecord.hasOwnProperty('endTime')) {
            lastRecord.endTime = utils.getNow();
            console.log('Graffiti: closed off previous record:', lastRecord);

            if (lastRecord.endTime - lastRecord.startTime < 10) {
              // Delete this record as it has insignificant time in it, ie user just flipped the button on and off.
              state.history['skip'].pop();
            }
          }
        }
      } else {
        // Only add a new skip record when beginning a skip period.
        state.storeHistoryRecord('skip');
      }

      console.log('after storeSkipRecord, skip history:', state.history['skip']);
    },
    getSkippedTimeSoFar: function getSkippedTimeSoFar() {
      return state.skippedTimeSoFar;
    },
    getShiftKeyIsDown: function getShiftKeyIsDown() {
      return state.shiftKeyIsDown;
    },
    setShiftKeyIsDown: function setShiftKeyIsDown(val) {
      state.shiftKeyIsDown = val;
    },
    getShiftKeyWentDown: function getShiftKeyWentDown() {
      return state.shiftKeyWentDown;
    },
    setShiftKeyWentDown: function setShiftKeyWentDown() {
      state.shiftKeyWentDown = true;
    },
    clearShiftKeyWentDown: function clearShiftKeyWentDown() {
      state.shiftKeyWentDown = false;
    },
    getScaleCursorWithWindow: function getScaleCursorWithWindow() {
      return state.scaleCursorWithWindow;
    },
    clearScaleCursorWithWindow: function clearScaleCursorWithWindow() {
      state.scaleCursorWithWindow = false;
    },
    setScaleCursorWithWindow: function setScaleCursorWithWindow() {
      state.scaleCursorWithWindow = true;
    },
    getApplyingRawCalculatedScrollTop: function getApplyingRawCalculatedScrollTop() {
      return state.applyingRawCalculatedScrollTop;
    },
    activateApplyingRawCalculatedScrollTop: function activateApplyingRawCalculatedScrollTop() {
      state.applyingRawCalculatedScrollTop = true;
    },
    deactivateApplyingRawCalculatedScrollTop: function deactivateApplyingRawCalculatedScrollTop() {
      state.applyingRawCalculatedScrollTop = false;
    },
    getGraffitiEditCellId: function getGraffitiEditCellId() {
      return state.graffitiEditCellId;
    },
    setGraffitiEditCellId: function setGraffitiEditCellId(cellId) {
      state.graffitiEditCellId = cellId;
    },
    getNarratorInfo: function getNarratorInfo(which) {
      return state.narratorInfo[which];
    },
    clearNarratorInfo: function clearNarratorInfo() {
      state.narratorInfo = {};
    },
    setNarratorInfo: function setNarratorInfo(which, val) {
      state.narratorInfo[which] = val;
    },
    getNarratorInfoIsRendered: function getNarratorInfoIsRendered() {
      return state.narratorInfoIsRendered;
    },
    setNarratorInfoIsRendered: function setNarratorInfoIsRendered(val) {
      state.narratorInfoIsRendered = val;
    },
    scanForSpeakingStatus: function scanForSpeakingStatus() {
      targetTime = state.getTimePlayedSoFar();
      var lastSpeakingIndex = state.getIndexUpToTime('speaking', targetTime);
      var currentSpeakingStatus = true; // assume we are speaking initially, in case we don't have any speaking records at all.

      if (lastSpeakingIndex !== undefined) {
        for (var index = 0; index < lastSpeakingIndex; ++index) {
          record = state.getHistoryItem('speaking', index);
          currentSpeakingStatus = record.speaking;
        }
      }

      return currentSpeakingStatus;
    },
    setHighlightsRefreshCellId: function setHighlightsRefreshCellId(cellId) {
      state.highlightsRefreshCellId = cellId;
    },
    getHighlightsRefreshCellId: function getHighlightsRefreshCellId() {
      return state.highlightsRefreshCellId;
    },
    getAudioInitialized: function getAudioInitialized() {
      return state.audioInitialized;
    },
    setAudioInitialized: function setAudioInitialized() {
      state.audioInitialized = true;
    },
    getLastEditActivityTime: function getLastEditActivityTime() {
      return state.lastEditActivityTime;
    },
    setLastEditActivityTime: function setLastEditActivityTime() {
      state.lastEditActivityTime = utils.getNow();
    },
    clearLastEditActivityTime: function clearLastEditActivityTime() {
      state.lastEditActivityTime = undefined;
    },
    getControlPanelDragging: function getControlPanelDragging() {
      return state.controlPanelDragging;
    },
    getControlPanelDragOffset: function getControlPanelDragOffset() {
      return state.controlPanelDragOffset;
    },
    setControlPanelDragOffset: function setControlPanelDragOffset(offset) {
      state.controlPanelDragOffset = offset;
    },
    setControlPanelDragging: function setControlPanelDragging(dragging) {
      state.controlPanelDragging = dragging;
    },
    // Window proportion adjustments for when recording is played on a different sized window than what it was recorded on. Not used any more
    getWindowSize: function getWindowSize() {
      return {
        width: $(window).width(),
        height: $(window).height()
      };
    },
    // deprecated, we are now relying on watching for width changes to #notebook-container to adjust for window size changes
    getStoredWindowSize: function getStoredWindowSize() {
      return state.windowSize;
    },
    // deprecated, we are now relying on watching for width changes to #notebook-container to adjust for window size changes
    windowSizeChanged: function windowSizeChanged() {
      var currentWindowSize = state.getWindowSize();
      var previousWindowSize = state.getStoredWindowSize();

      if (previousWindowSize.width !== currentWindowSize.width || previousWindowSize.height !== currentWindowSize.height) {
        state.windowSize = state.getWindowSize();
        return true;
      }

      return false;
    },
    setTipTimeout: function setTipTimeout(tipFunc, t) {
      state.clearTipTimeout();
      state.tipTimeout = setTimeout(tipFunc, t);
    },
    clearTipTimeout: function clearTipTimeout() {
      if (state.tipTimeout !== undefined) {
        clearTimeout(state.tipTimeout);
        state.tipTimeout = undefined;
      }
    },
    clearDisplayedTipInfo: function clearDisplayedTipInfo() {
      state.displayedTipInfo = undefined;
    },
    setDisplayedTipInfo: function setDisplayedTipInfo(cellId, recordingKey) {
      state.displayedTipInfo = {
        cellId: cellId,
        recordingKey: recordingKey
      };
    },
    getDisplayedTipInfo: function getDisplayedTipInfo() {
      return state.displayedTipInfo;
    },
    getStickerImageUrl: function getStickerImageUrl(stickerImageUrl) {
      return state.stickerImageUrl;
    },
    setStickerImageUrl: function setStickerImageUrl(stickerImageUrl) {
      state.stickerImageUrl = stickerImageUrl;
    },
    getStickerImageCandidateUrl: function getStickerImageCandidateUrl(stickerImageCandidateUrl) {
      return state.stickerImageCandidateUrl;
    },
    // We set this in setPlayableMovie(). 
    // When we start playing a movie, we use this to set the final candidate for the movie, which was set by %%custom_sticker in tooltip.
    setStickerImageCandidateUrl: function setStickerImageCandidateUrl(stickerImageCandidateUrl) {
      state.stickerImageCandidateUrl = stickerImageCandidateUrl;
    },
    saveSelectedCellId: function saveSelectedCellId(cellId) {
      state.selectedCellId = cellId;
    },
    getSelectedCellId: function getSelectedCellId() {
      return state.selectedCellId;
    },
    getMute: function getMute() {
      return state.mute;
    },
    setMute: function setMute(muteState) {
      state.mute = muteState;
    },
    rapidIsOn: function rapidIsOn() {
      return state.currentPlaySpeed === 'rapid';
    },
    scanningIsOn: function scanningIsOn() {
      //console.log('scanning is on, currentPlaySpeed:', state.currentPlaySpeed);
      return state.currentPlaySpeed === 'scanActive' || state.currentPlaySpeed === 'scanInactive';
    },
    getCurrentPlaySpeed: function getCurrentPlaySpeed() {
      return state.currentPlaySpeed;
    },
    resetPlayTimes: function resetPlayTimes(preset) {
      //console.log('resetPlayTimes, preset:', preset);
      state.playTimes = {};

      for (var _i3 = 0, _Object$keys3 = Object.keys(state.playSpeeds); _i3 < _Object$keys3.length; _i3++) {
        var type = _Object$keys3[_i3];
        state.playTimes[type] = {
          start: undefined,
          total: 0
        };
      }

      ;

      if (preset !== undefined) {
        state.playTimes['regular'] = {
          start: utils.getNow(),
          total: preset
        };
      }

      ;
    },
    setPlayTimeBegin: function setPlayTimeBegin(kind) {
      state.playTimes[kind].start = utils.getNow();
    },
    setPlayTimeEnd: function setPlayTimeEnd(kind) {
      var playSpeed = state.currentPlaySpeed;

      if (kind !== undefined) {
        playSpeed = kind;
      }

      state.playTimes[playSpeed].total += utils.getNow() - state.playTimes[playSpeed].start; // real-time spent watching at this given playSpeed
    },
    // play speed types are 'regular', 'rapid', and 'scan'.
    setCurrentPlaySpeed: function setCurrentPlaySpeed(kind) {
      if (state.activity === 'playing') {
        if (state.currentPlaySpeed !== kind) {
          state.setPlayTimeEnd();
          state.setPlayTimeBegin(kind);
        }
      }

      state.currentPlaySpeed = kind; //console.log('currentPlaySpeed:', state.currentPlaySpeed, 'playTimes', state.playTimes);
    },
    getUserChoicePlaySpeed: function getUserChoicePlaySpeed() {
      return state.userChoicePlaySpeed;
    },
    storeUserChoicePlaySpeed: function storeUserChoicePlaySpeed(userChoicePlaySpeed) {
      state.userChoicePlaySpeed = userChoicePlaySpeed;
    },
    getPlayRateScalar: function getPlayRateScalar() {
      return state.playSpeeds[state.currentPlaySpeed];
    },
    setPlayRate: function setPlayRate(kind, newPlayRate) {
      state.playSpeeds[kind] = newPlayRate;
    },
    setCompressedTimePlayRate: function setCompressedTimePlayRate(duration, timeTarget) {
      var accelerationFactor = duration / timeTarget;
      state.setPlayRate('compressed', accelerationFactor); // console.log('duration, timeTarget, accelerationFactor:', duration,timeTarget, accelerationFactor);
    },
    setPlayStartTimeToNow: function setPlayStartTimeToNow() {
      state.playTimes[state.currentPlaySpeed].start = utils.getNow();
    },
    shouldUpdateDisplay: function shouldUpdateDisplay(kind, frameIndex) {
      if (frameIndex === undefined) {
        return false;
      }

      if (_.contains(state.history.processed[kind], frameIndex.index)) {
        return false; // during playback, we've already processed this record so don't reprocess it.
      }

      state.history.processed[kind].push(frameIndex.index);
      return true;
    },
    resetProcessedArrays: function resetProcessedArrays() {
      if (state.history !== undefined) {
        state.history.processed = [];
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = state.frameArrays[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var arrName = _step3.value;
            state.history.processed[arrName] = [];
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
      }
    },
    blockRecording: function blockRecording() {
      state.recordingBlocked = true;
    },
    unblockRecording: function unblockRecording() {
      state.recordingBlocked = false;
    },
    getUsageStats: function getUsageStats() {
      var usageStats = $.extend(true, {}, state.usageStats, state.computeManifestStats());
      usageStats.totalUniqueTipsShown = Object.keys(state.usageStats.uniqueTips).length;
      usageStats.statsGatheredAt = utils.getNow();
      delete usageStats['uniqueTips']; //console.log('Graffiti: getUsageStats() is returning:', usageStats);

      return usageStats;
    },
    updateUsageStats: function updateUsageStats(opts) {
      var data = opts.data;
      var type = opts.type;
      var playStats = state.usageStats.played;
      var createStats = state.usageStats.created;
      var cellId, recordingKey, activeTakeId, statsKey;

      if (type === 'create' || type === 'setup' || type === 'terminalCommand' || type === 'tip' || type === 'insertDataFromFile') {
        cellId = data.cellId;
        recordingKey = data.recordingKey;
      }

      switch (type) {
        case 'create':
          // this usage record is about creating a graffiti
          statsKey = utils.composeGraffitiId(cellId, recordingKey);

          if (!createStats.hasOwnProperty(statsKey)) {
            createStats[statsKey] = {
              createDate: data.createDate,
              numEditsThisSession: 0
            };
          }

          createStats[statsKey].numEditsThisSession++;
          createStats[statsKey].numTakes = data.numTakes;
          break;

        case 'setup':
          // this usage record is about viewing a graffiti
          activeTakeId = data.activeTakeId;
          statsKey = utils.composeGraffitiId(cellId, recordingKey, activeTakeId);

          if (!playStats.hasOwnProperty(statsKey)) {
            var epochTime = utils.getNow();
            playStats[statsKey] = {
              totalTime: 0,
              totalTimeThisPlay: 0,
              epochTime: epochTime,
              maxViewingTime: 0,
              totalPlays: 0,
              recordingDuration: state.history.duration
            };
          }

          state.currentStatsKey = statsKey;
          break;

        case 'tip':
          state.usageStats.totalTipsShown++;
          var tipKey = utils.composeGraffitiId(cellId, recordingKey);

          if (!state.usageStats.uniqueTips.hasOwnProperty(tipKey)) {
            state.usageStats.uniqueTips[tipKey] = 0;
          }

          state.usageStats.uniqueTips[tipKey]++;
          break;

        case 'insertDataFromFile':
          statsKey = utils.composeGraffitiId(cellId, recordingKey); // Right now, we only record that we show something via this graffiti, not that we hide something.
          // we also increment the total number of times any show/hide button is clicked

          state.usageStats.totalInsertDataFromFile++;

          if (!state.usageStats.insertDataFromFile.hasOwnProperty(statsKey)) {
            state.usageStats.insertDataFromFile[statsKey] = 0;
          }

          state.usageStats.insertDataFromFile[statsKey]++;
          break;

        case 'terminalCommand':
          var terminalCommandsStats = state.usageStats.terminalCommands;
          statsKey = utils.composeGraffitiId(cellId, recordingKey);
          state.usageStats.totalTerminalCommandsRun++;

          if (!terminalCommandsStats.hasOwnProperty(statsKey)) {
            terminalCommandsStats[statsKey] = {
              commands: [],
              numRunsThisSession: 0
            };
          }

          terminalCommandsStats[statsKey].numRunsThisSession++;
          terminalCommandsStats[statsKey].commands.push(data.command);
          break;

        case 'userSkips':
          // We count user skips separately.
          state.usageStats.totalUserSkips++;

          if (!state.usageStats.userSkips.hasOwnProperty(state.currentStatsKey)) {
            state.usageStats.userSkips[state.currentStatsKey] = 0;
          }

          state.usageStats.userSkips[state.currentStatsKey]++;
          break;

        case 'userInterruptedLoading':
          state.usageStats.totalUserInterruptedLoading++;
          break;

        case 'play':
          var usageRecord = playStats[state.currentStatsKey];

          if (usageRecord !== undefined) {
            // this may be undefined if the user hit ESC while a movie is still loading. in that case no playStats record has been created yet.
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
              for (var _iterator4 = data.actions[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var action = _step4.value;

                switch (action) {
                  case 'resetCurrentPlayTime':
                    delete usageRecord['currentPlayTime'];
                    usageRecord.totalTimeThisPlay = 0;
                    break;

                  case 'updateCurrentPlayTime':
                    usageRecord.currentPlayTime = Math.round(state.getTimePlayedSoFar());
                    break;

                  case 'updateTotalPlayTime':
                    if (state.currentStatsKey !== undefined) {
                      usageRecord.totalTime += usageRecord.currentPlayTime; // totalTimeThisPlay represents the amount of time played back since the user started this video playing. This is not the same as
                      // totalTime, which represents the amount of time played back for this video since the notebook was loaded. In other words, if the
                      // user played this video twice all the way through, totalTime would contain 2x the recordingDuration, but totalTimeThisPlay would 
                      // only contain 1x the recordingDuration.

                      usageRecord.totalTimeThisPlay = Math.min(usageRecord.recordingDuration, usageRecord.currentPlayTime + usageRecord.totalTimeThisPlay);
                      usageRecord.maxViewingTime = Math.min(usageRecord.recordingDuration, Math.max(usageRecord.maxViewingTime, usageRecord.totalTimeThisPlay));
                      state.usageStats.totalPlayTimeAllGraffiti += usageRecord.currentPlayTime;
                      delete usageRecord['currentPlayTime'];
                    }

                    break;

                  case 'incrementPlayCount':
                    usageRecord.totalPlays++;
                    state.usageStats.totalPlaysAllGraffiti++;
                    state.usageStats.totalUniquePlays = Object.keys(playStats).length;
                    break;
                }
              }
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
          }

      } //console.log('updateUsageStats:', state.usageStats);

    },
    //
    // Drawing utility fns
    //
    getDrawingPenAttribute: function getDrawingPenAttribute(attr) {
      return state.drawingState.pen[attr];
    },
    getDrawingState: function getDrawingState() {
      return state.drawingState;
    },
    getDrawingStateField: function getDrawingStateField(field) {
      return state.drawingState[field];
    },
    // Store the stickers stages sticker lists for later redrawing during playing/scrubbing
    storeStickersStateForCell: function storeStickersStateForCell(stickers, cellId) {
      var stickersRecords = {};

      if (stickers !== undefined && stickers.length > 0) {
        stickersRecords = [];
        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {
          for (var _iterator5 = stickers[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
            var sticker = _step5.value;
            // Copy important fields from the "live" sticker records into the drawing state; these will be persisted as sticker records
            // inside drawing records for later playback.
            // NB: we don't include label stickers that don't have text labels at all, these are just displayed for guidance while placing the sticker
            stickersRecords.push({
              positions: {
                start: {
                  x: sticker.positions.start.x,
                  y: sticker.positions.start.y
                },
                end: {
                  x: sticker.positions.end.x,
                  y: sticker.positions.end.y
                }
              },
              innerCellRect: {
                left: sticker.innerCellRect.left,
                top: sticker.innerCellRect.top,
                width: sticker.innerCellRect.width,
                height: sticker.innerCellRect.height
              },
              pen: {
                stickerType: sticker.pen.stickerType,
                color: sticker.pen.color,
                dash: sticker.pen.dash,
                fill: sticker.pen.fill,
                fillOpacity: sticker.pen.fillOpacity,
                permanence: sticker.pen.permanence,
                label: sticker.pen.label,
                downInMarkdown: sticker.pen.downInMarkdown,
                downInPromptArea: sticker.pen.downInPromptArea,
                inPromptArea: sticker.pen.inPromptArea
              },
              stickerOnGrid: sticker.stickerOnGrid,
              promptWidth: sticker.promptWidth
            });
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
      }

      state.drawingState.stickersRecords = stickersRecords; //console.log('stickersRecords:', stickersRecords);
    },
    updateDrawingState: function updateDrawingState(changeSets) {
      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = changeSets[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var changeSet = _step6.value;
          var change = changeSet.change;
          var data = changeSet.data;
          var drawingState = state.drawingState;
          drawingState.wipe = false; // default, we don't register a wipe state

          switch (change) {
            case 'drawingModeActivated':
              drawingState.drawingModeActivated = data; // a drawing/sticker tool is activated.

              break;

            case 'drawingActivity':
              drawingState.drawingActivity = data; // the drawing mode (mouse is down) : one of 'draw', 'sticker', 'fade', 'wipe' (mutually exclusive)

              break;

            case 'cellId':
              drawingState.cellId = data;
              break;

            case 'isDown':
              drawingState.pen.isDown = data;
              break;

            case 'mouseDownPosition':
              drawingState.pen.mouseDownPosition = {
                x: data.x,
                y: data.y
              };
              break;

            case 'downInMarkdown':
              drawingState.pen.downInMarkdown = data; // whether the drawing/stickering started in a markdown cell

              break;

            case 'downInPromptArea':
              drawingState.pen.downInPromptArea = data; // whether the drawing/stickering started in the prompt area

              break;

            case 'inPromptArea':
              drawingState.pen.inPromptArea = data; // whether the drawing/stickering in the .prompt div

              break;

            case 'promptWidth':
              drawingState.promptWidth = data;
              break;

            case 'stickerOnGrid':
              drawingState.stickerOnGrid = data;
              break;

            case 'fillOpacity':
              // if sticker fill is actually visible
              drawingState.pen.fillOpacity = data;
              break;

            case 'penType':
              drawingState.pen.type = data; // one of 'line', 'highlight', 'eraser', or 'sticker'

              break;

            case 'stickerType':
              drawingState.pen.stickerType = data; // one of many sticker types. if this is set that penType will not be set, and vice versa

              var fill = 'none'; // fill color. this is confusing and needs to be cleaned up a lot

              switch (data) {
                case 'isocelesTriangle':
                case 'rightTriangle':
                case 'ellipse':
                case 'rectangle':
                case 'leftCurlyBrace':
                case 'rightCurlyBrace':
                case 'symmetricCurlyBraces':
                case 'topBracket':
                case 'bottomBracket':
                case 'leftBracket':
                case 'rightBracket':
                case 'horizontalBrackets':
                case 'verticalBrackets':
                case 'smiley':
                case 'frowney':
                case 'thumbsUp':
                case 'thumbsDown':
                case 'star':
                case 'line':
                case 'lineWithArrow':
                case 'label':
                case 'custom':
                  // all these cases have an implicit fill type of 'none'
                  break;

                case 'checkMark':
                  fill = '00aa00'; // hardwired to green

                  break;

                case 'x':
                  fill = 'aa0000'; // hardwired to reddish

                  break;

                case 'theta': // greek symbols hardwired to black

                case 'sigma':
                  fill = '000000';
                  break;
              }

              drawingState.pen.fill = fill; // fill color, if opacity == 1

              break;

            case 'label':
              // a label is actually a sticker that's just typed text
              drawingState.pen.label = data;
              break;

            case 'permanence':
              drawingState.pen.permanence = data; // one of 'permanent', 'temporary'

              break;

            case 'positions':
              var bbox = {
                start: {
                  x: data.positions.start.x,
                  y: data.positions.start.y
                },
                end: {
                  x: data.positions.end.x,
                  y: data.positions.end.y
                }
              };

              if (drawingState.pen.penType === 'sticker') {
                if (drawingState.pen.stickerType !== 'line') {
                  // Unless we're drawing a line sticker, we want to compute bounding box around the given shape, as it will always be the same orientation, and
                  // always have a minimum size
                  bbox = {
                    start: {
                      x: Math.min(data.positions.start.x, data.positions.end.x),
                      y: Math.min(data.positions.start.y, data.positions.end.y)
                    },
                    end: {
                      x: Math.max(data.positions.start.x, data.positions.end.x),
                      y: Math.max(data.positions.start.y, data.positions.end.y)
                    }
                  };
                }
              }

              drawingState.positions = bbox;
              break;

            case 'color':
              drawingState.pen.color = data;
              break;

            case 'dash':
              drawingState.pen.dash = data; // one of 'solid', 'dashed'

              break;

            case 'opacity':
              drawingState.opacity = data; // set during fades of temporary ink

              break;

            case 'wipe':
              drawingState.wipe = true; // after fades are done, this record wipes the temporary canvases clean

              break;
          }
        } // console.log('updateDrawingState, state=', state.drawingState);

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
    resetDrawingOpacity: function resetDrawingOpacity() {
      state.drawingState.opacity = state.maxDrawingOpacity;
    },
    getActivePenType: function getActivePenType() {
      return state.drawingState.pen.type;
    },
    getDrawingOpacity: function getDrawingOpacity() {
      return state.drawingOpacity;
    },
    setDrawingOpacity: function setDrawingOpacity(opacity) {
      state.drawingState.drawingOpacity = opacity;
    },
    getMaxDrawingOpacity: function getMaxDrawingOpacity() {
      return state.maxDrawingOpacity;
    }
  }, _defineProperty(_state, "resetDrawingOpacity", function resetDrawingOpacity() {
    state.drawingState.drawingOpacity = state.maxDrawingOpacity;
  }), _defineProperty(_state, "getDrawingFadeTimeSoFar", function getDrawingFadeTimeSoFar() {
    return utils.getNow() - state.drawingFadeStart;
  }), _defineProperty(_state, "calculateDrawingOpacity", function calculateDrawingOpacity() {
    // console.log('drawingFadeCounter', state.drawingFadeCounter);
    var timeSoFar = state.getDrawingFadeTimeSoFar();
    var opacity = state.maxDrawingOpacity;

    if (!state.drawingFadeClockAllowed || timeSoFar < state.drawingFadePreFadeDelay) {
      return {
        status: 'max',
        opacity: state.maxDrawingOpacity
      };
    }

    if (timeSoFar < state.totalDrawingFadeDuration) {
      opacity = (state.totalDrawingFadeDuration - timeSoFar) / state.drawingFadeDuration * state.maxDrawingOpacity; //console.log('calculateDrawingOpacity:', opacity);

      return {
        status: 'fade',
        opacity: opacity
      };
    }

    return {
      status: 'fadeDone',
      opacity: 0
    };
  }), _defineProperty(_state, "disableDrawingFadeClock", function disableDrawingFadeClock() {
    state.drawingFadeClockAllowed = false; // not allowed while drawing a drawing
  }), _defineProperty(_state, "startDrawingFadeClock", function startDrawingFadeClock() {
    // console.log('startDrawingFadeClock');
    state.drawingFadeStart = utils.getNow();
    state.drawingFadeClockAllowed = true;
  }), _defineProperty(_state, "getLastRecordedCursorPosition", function getLastRecordedCursorPosition() {
    return {
      x: state.recordedCursorPosition.x,
      y: state.recordedCursorPosition.y
    };
  }), _defineProperty(_state, "setLastRecordedCursorPosition", function setLastRecordedCursorPosition(pos) {
    state.recordedCursorPosition = {
      x: pos.x,
      y: pos.y
    };
  }), _defineProperty(_state, "getPlaybackStartTime", function getPlaybackStartTime() {
    return state.playbackStartTime;
  }), _defineProperty(_state, "setPlaybackStartTime", function setPlaybackStartTime(startTime) {
    state.playbackStartTime = startTime;
  }), _defineProperty(_state, "startAnimationInterval", function startAnimationInterval(name, cb, timing) {
    if (state.animationIntervalIds[name] !== undefined) {
      clearInterval(state.animationIntervalIds[name]);
    }

    state.animationIntervalIds[name] = setInterval(cb, timing);
  }), _defineProperty(_state, "clearAnimationIntervals", function clearAnimationIntervals() {
    var ids = Object.keys(state.animationIntervalIds);

    for (var _i4 = 0, _ids = ids; _i4 < _ids.length; _i4++) {
      var id = _ids[_i4];

      if (state.animationIntervalIds[id] !== undefined) {
        clearInterval(state.animationIntervalIds[id]);
        delete state.animationIntervalIds[id];
      }
    }
  }), _defineProperty(_state, "getSetupForReset", function getSetupForReset() {
    return state.resetOnNextPlay;
  }), _defineProperty(_state, "clearSetupForReset", function clearSetupForReset() {
    state.resetOnNextPlay = false;
  }), _defineProperty(_state, "setupForReset", function setupForReset() {
    state.resetOnNextPlay = true;
  }), _defineProperty(_state, "getResetOnNextPlay", function getResetOnNextPlay() {
    return state.resetOnNextPlay;
  }), _defineProperty(_state, "resetPlayState", function resetPlayState() {
    state.resetOnNextPlay = false;
    state.resetPlayTimes();
    state.resetProcessedArrays();
  }), _defineProperty(_state, "getActivity", function getActivity() {
    return state.activity;
  }), _defineProperty(_state, "setActivity", function setActivity(newState) {
    console.log('Graffiti: setting activity to:', newState);
    state.activity = newState;
  }), _defineProperty(_state, "getPreviousActivity", function getPreviousActivity() {
    return state.previousActivity;
  }), _defineProperty(_state, "storePreviousActivity", function storePreviousActivity() {
    state.previousActivity = state.activity;
  }), _defineProperty(_state, "restorePreviousActivity", function restorePreviousActivity() {
    state.activity = state.previousActivity;
  }), _defineProperty(_state, "getPointerPosition", function getPointerPosition() {
    return state.pointer;
  }), _defineProperty(_state, "storePointerPosition", function storePointerPosition(x, y) {
    state.pointer = {
      x: x,
      y: y
    }; //console.log('graffiti.state.pointer:', graffiti.state.pointer);
  }), _defineProperty(_state, "getViewInfo", function getViewInfo() {
    return state.viewInfo;
  }), _defineProperty(_state, "storeViewInfo", function storeViewInfo(viewInfo) {
    if (viewInfo.cellId !== undefined) {
      // may not be set if cursor is btwn cells
      state.viewInfo = $.extend({}, viewInfo);
    }
  }), _defineProperty(_state, "setSelectionSerialized", function setSelectionSerialized(selectionSerialized) {
    state.selectionSerialized = selectionSerialized;
  }), _defineProperty(_state, "clearSelectionSerialized", function clearSelectionSerialized() {
    state.selectionSerialized = undefined;
  }), _defineProperty(_state, "getSelectionSerialized", function getSelectionSerialized() {
    return state.selectionSerialized;
  }), _defineProperty(_state, "getRecordingCellInfo", function getRecordingCellInfo() {
    // Copy the latest duration into the recordingCellInfo so we persist it in the manifest, if we have it (for the activeTake only)
    if (state.history !== undefined && state.history.duration !== undefined && state.recordingCellInfo.takes !== undefined && state.recordingCellInfo.activeTakeId !== undefined) {
      state.recordingCellInfo.takes[state.recordingCellInfo.activeTakeId].duration = state.history.duration;
    }

    return state.recordingCellInfo;
  }), _defineProperty(_state, "storeRecordingCellInfo", function storeRecordingCellInfo(cellInfo) {
    // console.trace('storeRecordingCellInfo:', cellInfo);
    state.recordingCellInfo = cellInfo;
  }), _defineProperty(_state, "getPlayableMovie", function getPlayableMovie(kind) {
    return state.playableMovies[kind];
  }), _defineProperty(_state, "setPlayableMovie", function setPlayableMovie(kind, cellId, recordingKey, hoverCellId) {
    var cellIndex = undefined;

    if (hoverCellId !== undefined) {
      cellIndex = utils.findCellIndexByCellId(hoverCellId);
    }

    var cell = utils.findCellByCellId(cellId);
    var cellType = cell === undefined ? undefined : cell.cell_type;
    var recording = state.getManifestSingleRecording(cellId, recordingKey);
    var activeTakeId = recording.activeTakeId;
    state.playableMovies[kind] = {
      recordingCellId: cellId,
      recordingKey: recordingKey,
      activeTakeId: activeTakeId,
      cell: cell,
      cellIndex: cellIndex,
      cellType: cellType
    };
    state.setStickerImageCandidateUrl(recording.stickerImageUrl); //console.trace('setPlayableMovie, kind:', kind, 'cellId:', cellId, 'recordingKey:',recordingKey, 'playableMovies:', state.playableMovies);

    return recording;
  }), _defineProperty(_state, "clearPlayableMovie", function clearPlayableMovie(kind) {
    //console.trace('Graffiti: clearing playable movie of kind', kind);
    state.playableMovies[kind] = undefined;
  }), _defineProperty(_state, "getMovieRecordingStarted", function getMovieRecordingStarted() {
    return state.movieRecordingStarted;
  }), _defineProperty(_state, "setMovieRecordingStarted", function setMovieRecordingStarted(status) {
    state.movieRecordingStarted = status;
  }), _defineProperty(_state, "getCurrentlyPlayingMovie", function getCurrentlyPlayingMovie() {
    return state.currentlyPlayingMovie;
  }), _defineProperty(_state, "setCurrentlyPlayingMovie", function setCurrentlyPlayingMovie(movie) {
    state.currentlyPlayingMovie = movie;
  }), _defineProperty(_state, "getHidePlayerAfterPlayback", function getHidePlayerAfterPlayback() {
    return state.hidePlayerAfterPlayback;
  }), _defineProperty(_state, "setHidePlayerAfterPlayback", function setHidePlayerAfterPlayback(status) {
    state.hidePlayerAfterPlayback = status;
  }), _defineProperty(_state, "getDontRestoreCellContentsAfterPlayback", function getDontRestoreCellContentsAfterPlayback() {
    return state.dontRestoreCellContentsAfterPlayback;
  }), _defineProperty(_state, "setDontRestoreCellContentsAfterPlayback", function setDontRestoreCellContentsAfterPlayback(status) {
    //console.trace('setDontRestoreCellContentsAfterPlayback:', status);
    state.dontRestoreCellContentsAfterPlayback = status;
  }), _defineProperty(_state, "clearCellOutputsSent", function clearCellOutputsSent() {
    state.cellOutputsSent = {};
  }), _defineProperty(_state, "getCellAdditions", function getCellAdditions() {
    if (state.history !== undefined) {
      var allAdditions = _.union(Object.keys(state.history.cellAdditions), Object.keys(state.playbackCellAdditions));

      return allAdditions;
    }

    return undefined;
  }), _defineProperty(_state, "storeCellAddition", function storeCellAddition(cellId, position) {
    if (state.activity === 'recording') {
      state.history.cellAdditions[cellId] = position; //console.log('cellAdditions:', state.cellAdditions);
    }
  }), _defineProperty(_state, "storePlaybackCellAddition", function storePlaybackCellAddition(cellId, position) {
    state.playbackCellAdditions[cellId] = position;
  }), _defineProperty(_state, "clearCellAdditions", function clearCellAdditions() {
    state.history.cellAdditions = {};
    state.playbackCellAdditions = {};
  }), _defineProperty(_state, "storeTerminalsState", function storeTerminalsState(newState) {
    state.terminalsState = newState; // state of one or more terminals at any given time
  }), _defineProperty(_state, "getShouldUpdateCellContentsDuringPlayback", function getShouldUpdateCellContentsDuringPlayback() {
    return state.shouldUpdateCellContentsDuringPlayback;
  }), _defineProperty(_state, "setShouldUpdateCellContentsDuringPlayback", function setShouldUpdateCellContentsDuringPlayback(val) {
    state.shouldUpdateCellContentsDuringPlayback = val;
  }), _defineProperty(_state, "dumpHistory", function dumpHistory() {
    console.log('Graffiti: Dumping JSON history');
    console.log("Graffiti: =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
    console.log('Graffiti:', state.history);
    console.log("Graffiti: =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
  }), _defineProperty(_state, "createViewRecord", function createViewRecord(subType) {
    var drawingState = state.drawingState;
    var pen = drawingState.pen;
    var downInMarkdown = pen.isDown && pen.downInMarkdown;
    var downInPromptArea = pen.isDown && pen.downInPromptArea;
    var drawingActivity = pen.isDown ? drawingState.drawingActivity : undefined;
    var stickerCellId = pen.isDown && drawingState.drawingActivity == 'sticker' ? drawingState.cellId : undefined;
    var stickerInfo = undefined,
        stickerCellWidth = 0,
        stickerCellHeight = 0;

    if (stickerCellId !== undefined) {
      var stickerCell = utils.findCellByCellId(stickerCellId);
      var stickerCellElement = $(stickerCell.element[0]).find('.inner_cell');
      var bbox = stickerCellElement[0].getBoundingClientRect();
      stickerCellWidth = bbox.width;
      stickerCellHeight = bbox.height;
      stickerInfo = {
        cellId: stickerCellId,
        width: stickerCellWidth,
        height: stickerCellHeight
      };
    }

    var topBarHeight = $('#header').height();
    var inTopBarArea = state.pointer.y < topBarHeight;
    return $.extend({}, state.viewInfo, {
      x: state.pointer.x - parseInt(state.viewInfo.outerCellRect.left),
      y: state.pointer.y - parseInt(state.viewInfo.outerCellRect.top),
      downInMarkdown: downInMarkdown,
      downInPromptArea: downInPromptArea,
      drawingActivity: drawingActivity,
      inTopBarArea: inTopBarArea,
      subType: subType,
      speakingStatus: state.speakingStatus,
      scrollDiff: state.viewInfo.scrollDiff,
      selectedCellId: state.selectedCellId,
      stickerInfo: stickerInfo
    });
  }), _defineProperty(_state, "createDrawingRecord", function createDrawingRecord(opts) {
    var cell = utils.findCellByCellId(state.drawingState.cellId);
    var cellRects = utils.getCellRects(cell);
    var record = $.extend(true, {}, {
      innerCellRect: {
        left: cellRects.innerCellRect.left,
        top: cellRects.innerCellRect.top,
        width: cellRects.innerCellRect.width,
        height: cellRects.innerCellRect.height
      }
    }, state.drawingState); // Remove drawing status fields that are not needed in history records

    delete record['drawingModeActivated'];
    delete record.pen['isDown'];
    delete record.pen['mouseDownPosition'];
    delete record['wipe'];
    delete record['stickerActive'];
    delete record['stickerOnGrid'];

    if (opts.stickering) {
      // Remove unnecessary items which have more precise info in each sticker record for this drawing frame.
      delete record['positions'];
      delete record['pen'];
      delete record['promptWidth'];
      delete record['innerCellRect'];
    } //console.log('createDrawingRecord:', record);


    return record;
  }), _defineProperty(_state, "createStickerRecord", function createStickerRecord() {
    var cell = utils.findCellByCellId(state.drawingState.cellId);
    var cellRects = utils.getCellRects(cell);
    var record = $.extend(true, {}, {
      innerCellRect: {
        left: cellRects.innerCellRect.left,
        top: cellRects.innerCellRect.top,
        width: cellRects.innerCellRect.width,
        height: cellRects.innerCellRect.height
      }
    }, state.drawingState); // Remove drawing status fields that are not needed in history records

    delete record.drawingModeActivated;
    delete record.pen.isDown;
    delete record.pen['mouseDownPosition'];
    delete record.wipe; // console.log('createStickerRecord:', record);

    return record;
  }), _defineProperty(_state, "createSelectionsRecord", function createSelectionsRecord() {
    var activeCell = Jupyter.notebook.get_selected_cell();
    var cells = Jupyter.notebook.get_cells();
    var cellsSelections = {};
    var cellId, cm, cell, selections, cellSelections, output, outputs0, ourJs;

    for (var i = 0; i < cells.length; ++i) {
      cell = cells[i];

      if (cell.cell_type === 'code') {
        cellId = utils.getMetadataCellId(cell.metadata);
        cm = cell.code_mirror;
        selections = utils.cleanSelectionRecords(cm.listSelections());
        output = null;
        ourJs = false;

        if (cell.output_area.outputs.length > 0) {
          outputs0 = cell.output_area.outputs[0];
          output_type = outputs0.output_type; // console.log('checking output area output_type:', output_type);

          if (output_type === 'display_data') {
            if (outputs0.data.hasOwnProperty('application/javascript')) {
              if (outputs0.data['application/javascript'].match(/Graffiti\sjavascript/g) !== null) {
                ourJs = true;
              }
            }
          }

          if (!ourJs) {
            // Note that we filter out our own javascript outputs-- we don't want to rerun these when we restore cell states or 
            // else we could rerun the whole recording.
            // console.log('recording output for outputs0:', outputs0);
            output = {
              header: {
                msg_type: output_type
              },
              content: outputs0
            };
          }
        } else {
          // if this code cell has no output at time of recording, record that fact for playback
          output = {
            empty: true
          };
        }

        cellSelections = {
          index: i,
          active: cellId === utils.getMetadataCellId(activeCell.metadata),
          selections: selections,
          output: output
        };
        cellsSelections[cellId] = cellSelections;
      }
    }

    return {
      cellsSelections: cellsSelections,
      // Record text selections in rendered markdown or output areas. These are to be found in state.selectionSerialized (or if none, undefined)
      textSelection: state.selectionSerialized
    };
  }), _defineProperty(_state, "extractDataFromContentRecord", function extractDataFromContentRecord(record, cellId) {
    if (record.backRef !== undefined) {
      if (record.backRefKind === 'contents') {
        return state.history.contents[record.backRef].cellsContent[cellId].contentsRecord.data;
      } else {
        return state.history.contents[record.backRef].cellsContent[cellId].outputsRecord.data;
      }
    }

    return record.data;
  }), _defineProperty(_state, "createBackRefRecord", function createBackRefRecord(data, backRefKind, backRefArray, cellId) {
    var backRef;
    var record = backRefArray[cellId];

    if (record !== undefined) {
      if (backRefKind === 'contents' && data === record.data || backRefKind === 'outputs' && _.isEqual(data, record.data)) {
        backRef = record.index;
        data = undefined;
      }
    } // Store as-yet-unseen contents or outputs for later backref. Delete the backRefKind value to avoid confusion, *unless* we are not bothering 
    // with backref storage (because we're using this function from storeCellStates() via createContentsRecord().


    if (data !== undefined) {
      backRefKind = undefined;
      backRefArray[cellId] = {
        index: state.history.contents.length,
        // note that this is not the length - 1, because we are still contructing
        // this contents record and haven't pushed it onto the history yet.
        data: data
      };
    }

    return {
      data: data,
      backRefKind: backRefKind,
      backRef: backRef
    };
  }), _defineProperty(_state, "createContentsRecord", function createContentsRecord(doBackRefStore) {
    var cellId, cell, contents, outputs, contentsBackRefRecord, outputsBackRefRecord;
    var cells = Jupyter.notebook.get_cells();
    var cellsContent = {},
        cellsPresentThisFrame = {};

    for (var i = 0; i < cells.length; ++i) {
      cell = cells[i];

      if (cell.cell_type === 'code') {
        // only save contents of code cells, not markdown cells. 5/17/19
        cellId = utils.getMetadataCellId(cell.metadata);
        cellsPresentThisFrame[cellId] = utils.findCellIndexByCellId(cellId);
        contents = cell.get_text();
        outputs = undefined; // Store the DOM contents of the code cells for rerendering.

        var cellDom = $(cell.element);
        var outputArea = cellDom.find('.output');

        if (outputArea.length > 0) {
          outputs = outputArea.html();
        }

        if (doBackRefStore) {
          contentsBackRefRecord = state.createBackRefRecord(contents, 'contents', state.history.cellContentsTracking, cellId);
          outputsBackRefRecord = state.createBackRefRecord(outputs, 'outputs', state.history.cellOutputsTracking, cellId);
        } else {
          contentsBackRefRecord = {
            data: contents,
            backRefKind: 'contents',
            backRef: undefined
          };
          outputsBackRefRecord = {
            data: outputs,
            backRefKind: 'outputs',
            backRef: undefined
          };
        } // console.log('createContentsRecord, outputs:', outputs);


        var cellContent = {
          index: i,
          contentsRecord: contentsBackRefRecord,
          outputsRecord: outputsBackRefRecord
        };
        cellsContent[cellId] = cellContent;
      }
    }

    return {
      cellsContent: cellsContent,
      cellsPresentThisFrame: cellsPresentThisFrame
    };
  }), _defineProperty(_state, "createTerminalsRecord", function createTerminalsRecord() {
    // Collect display positions of all terminals. If no terminals history has been recorded yet then mark these records as the "first records",
    // which will trigger term.reset() calls during playback.
    var markAsFirstRecord = state.history.terminals.length === 0;
    var terminalsState = terminalLib.getTerminalsStates(markAsFirstRecord);
    return {
      terminals: terminalsState
    };
  }), _defineProperty(_state, "getHistoryTerminalsContents", function getHistoryTerminalsContents() {
    return state.history.terminalsContents;
  }), _defineProperty(_state, "storeTerminalsContentsInHistory", function storeTerminalsContentsInHistory() {
    state.history.terminalsContents = terminalLib.getTerminalsContents();
  }), _defineProperty(_state, "createSpeakingRecord", function createSpeakingRecord() {
    return {
      speaking: state.speakingStatus
    };
  }), _defineProperty(_state, "storeHistoryRecord", function storeHistoryRecord(type, time) {
    if (state.activity !== 'recording' || state.recordingBlocked) return;
    var record; // Note: we override the type to throw together pointer moves, scroll innerScroll, and focus in one history record type

    switch (type) {
      case 'pointer':
        record = state.createViewRecord('pointer');
        type = 'view'; // override passed-in type: pointer is a view type

        break;

      case 'scroll':
        record = state.createViewRecord('scroll');
        type = 'view'; // override passed-in type: scroll is a view type

        break;

      case 'innerScroll':
        record = state.createViewRecord('innerScroll');
        type = 'view'; // override passed-in type: innerScroll is a view type

        break;

      case 'focus':
        record = state.createViewRecord('focus');
        type = 'view'; // override passed-in type: focus is a view type

        break;

      case 'selectCell':
        record = state.createViewRecord('selectCell');
        type = 'view'; // override passed-in type: focus is a view type

        break;

      case 'drawings':
        record = state.createDrawingRecord({
          stickering: false
        });
        break;

      case 'stickers':
        record = state.createDrawingRecord({
          stickering: true
        });
        type = 'drawings'; // we store sticker records as arrays within drawing records.

        break;

      case 'selections':
        record = state.createSelectionsRecord();
        break;

      case 'contents':
        record = state.createContentsRecord(true);
        break;

      case 'terminals':
        record = state.createTerminalsRecord();
        break;

      case 'speaking':
        record = state.createSpeakingRecord();
        break;

      case 'skip':
        record = state.createSkipRecord();
        break;
    }

    record.startTime = time !== undefined ? time : utils.getNow();
    state.history[type].push(record);
  }), _defineProperty(_state, "initHistory", function initHistory(initialValues) {
    var now = utils.getNow();
    state.history = {
      storageCellId: initialValues.storageCellId,
      recordingStartTime: now,
      // Time tracks: all pointer positions, cell selections and contents over the time of the recording.
      view: [],
      // pointer move, vertical scroll or innerscroll (scroll inside cell)
      selections: [],
      // cell selections
      contents: [],
      // contents state: what cells present, and what their contents are, and cell outputs
      drawings: [],
      // drawing record, of type: ['draw', 'fade', 'wipe', 'sticker']
      terminals: [],
      // terminal record. Records (recent) changes to contents of a terminal
      speaking: [],
      // time ranges where creator is speaking or silent
      skip: [],
      // time ranges when creator has requested either an acceleration or a time compression
      // Where we are in each track, during playback.
      lastVisited: {
        view: 0,
        selections: 0,
        contents: 0,
        drawings: 0,
        terminals: 0,
        speaking: 0,
        skip: 0
      },
      cellContentsTracking: {},
      // this enables back-referencing to reduce storage costs on content recording
      cellOutputsTracking: {},
      // this enables back-referencing to reduce storage costs on output recording
      cellAdditions: {} // id's and positions of any cells added during the recording.
      // Set up to keep track of the latest record processed during playback (so we don't process a record twice).

    };
    state.resetProcessedArrays(); // Store initial state records at the start of recording.

    state.storeHistoryRecord('pointer', now);
    state.storeHistoryRecord('scroll', now);
    state.storeHistoryRecord('focus', now);
    state.storeHistoryRecord('selections', now);
    state.storeHistoryRecord('contents', now);
    state.storeHistoryRecord('terminals', now);
  }), _defineProperty(_state, "finalizeHistory", function finalizeHistory() {
    state.setHistoryDuration();
    state.normalizeTimeframes();
    state.adjustTimeRecords('speaking'); // move timing of speaking records back by 1/10th of a second since they lag

    state.setupForReset();
  }), _defineProperty(_state, "deleteTrackingArrays", function deleteTrackingArrays() {
    // console.log('finalizeHistory: deleting Tracking arrays');
    delete state.history.cellContentsTracking;
    delete state.history.cellOutputsTracking;
  }), _defineProperty(_state, "getJSONHistory", function getJSONHistory() {
    var jsonHistory;

    try {
      jsonHistory = JSON.stringify(state.history);
      return jsonHistory;
    } catch (ex) {
      return undefined;
    }
  }), _defineProperty(_state, "getHistoryDuration", function getHistoryDuration() {
    return state.history.duration;
  }), _defineProperty(_state, "setHistoryDuration", function setHistoryDuration() {
    state.history.duration = utils.getNow() - state.history.recordingStartTime;
  }), _defineProperty(_state, "adjustTimeRecords", function adjustTimeRecords(type) {
    var historyArray = state.history[type];
    var adjustment = 100; // ms

    if (historyArray.length > 0) {
      for (var i = 0; i < historyArray.length; ++i) {
        historyArray[i].startTime = Math.max(0, historyArray[i].startTime - adjustment);
        historyArray[i].endTime = Math.max(0, historyArray[i].endTime - adjustment);
      }
    }
  }), _defineProperty(_state, "findSpeakingStartNearestTime", function findSpeakingStartNearestTime(t, direction, rewindAmt) {
    var historyItem,
        numHistoryItems = 0; // Scan for nearest "start speaking" record ...

    var chosenTime = direction === -1 ? 0 : state.history.duration;

    if (state.history['speaking'] !== undefined) {
      numHistoryItems = state.history['speaking'].length;
    }

    if (numHistoryItems === 0) {
      // no speaking history, just jump by 2s
      if (direction === -1) {
        chosenTime = Math.max(0, t - rewindAmt * 1000);
      } else {
        chosenTime = Math.min(t + rewindAmt * 1000, state.history.duration - 1);
      }
    } else {
      for (var check = 0; check < numHistoryItems; ++check) {
        //console.log('findSpeakingStartNearestTime, check:', check);
        historyItem = state.history['speaking'][check];

        if (historyItem.speaking) {
          if (direction === -1) {
            if (historyItem.startTime > chosenTime && historyItem.endTime < t) {
              chosenTime = historyItem.startTime;
            }
          } else {
            if (historyItem.startTime < chosenTime && historyItem.startTime > t) {
              chosenTime = historyItem.startTime;
            }
          }
        }
      }
    }

    return chosenTime;
  }), _defineProperty(_state, "normalizeTimeframes", function normalizeTimeframes() {
    var recordingStartTime = state.history.recordingStartTime;
    var now = utils.getNow();
    var _iteratorNormalCompletion7 = true;
    var _didIteratorError7 = false;
    var _iteratorError7 = undefined;

    try {
      for (var _iterator7 = state.frameArrays[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
        var arrName = _step7.value;
        var historyArray = state.history[arrName];
        var max = historyArray.length - 1;

        for (var i = 0; i < historyArray.length; ++i) {
          // Only set endTime when not set by some other process (e.g. skipRecs set this on their own).
          if (historyArray[i].endTime === undefined) {
            if (historyArray.length === 1 || i === max) {
              historyArray[i].endTime = now;
            } else {
              historyArray[i].endTime = historyArray[i + 1].startTime;
            }
          }

          historyArray[i].startTime = historyArray[i].startTime - recordingStartTime;
          historyArray[i].endTime = historyArray[i].endTime - recordingStartTime;
        } // console.log('normalized ', historyArray.length, 'records for array', arrName);

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
  }), _defineProperty(_state, "getHistoryRecordsAtTime", function getHistoryRecordsAtTime(t) {
    var indexes = {},
        frame,
        historyArray,
        arrName,
        scanPtr,
        scanDir,
        currentFrameIndex,
        previousFrameIndex,
        numRecords,
        skipped = {};
    var historyDuration = state.getHistoryDuration();
    var halfHistory = historyDuration / 2;
    var _iteratorNormalCompletion8 = true;
    var _didIteratorError8 = false;
    var _iteratorError8 = undefined;

    try {
      for (var _iterator8 = state.frameArrays[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
        arrName = _step8.value;
        skipped[arrName] = -1;
        historyArray = state.history[arrName];

        if (historyArray !== undefined) {
          numRecords = historyArray.length;
          currentFrameIndex = state.history.lastVisited[arrName];
          indexes[arrName] = undefined;

          if (historyArray.length > 0) {
            // Only do a scan if the time is within the band of recorded history. E.g. there may only be drawing
            // history in the middle of all recorded time so don't look for records if you're outside that band.
            if (t >= historyArray[0].startTime || t <= historyArray[historyArray.length - 1].endTime) {
              previousFrameIndex = currentFrameIndex;
              frame = historyArray[currentFrameIndex];

              if (t >= frame.startTime && t < frame.endTime) {
                // We're already in the right frame so just return that
                indexes[arrName] = {
                  index: currentFrameIndex,
                  rangeStart: undefined
                };
              } else {
                // if the distance between the start time of the current frame and t is
                // < 10% of the total duration, start scanning up or
                // down from the current frame until you find the right frame.
                var tDist = t - frame.startTime;
                var tDistAbs = Math.abs(tDist);

                if (tDistAbs / historyDuration < 0.1) {
                  scanDir = Math.sign(tDist);
                  scanPtr = currentFrameIndex + scanDir;
                } else {
                  // Scan to find the frame:
                  //  from the beginning of the recording if the time is in the first half of the recording,
                  //  otherwise scan backwards from the end
                  if (t < halfHistory) {
                    scanPtr = 0;
                    scanDir = 1;
                  } else {
                    scanPtr = numRecords - 1;
                    scanDir = -1;
                  }
                } // Now scan to find the right frame by looking for t within the time frame.


                while (scanPtr >= 0 && scanPtr < numRecords) {
                  frame = historyArray[scanPtr];

                  if (t >= frame.startTime && t < frame.endTime) {
                    indexes[arrName] = {
                      index: scanPtr,
                      rangeStart: undefined
                    };
                    state.history.lastVisited[arrName] = scanPtr;
                    break;
                  }

                  scanPtr += scanDir;
                  skipped[arrName]++;
                }

                if (indexes[arrName] !== undefined && indexes[arrName].index !== previousFrameIndex && indexes[arrName].index > previousFrameIndex) {
                  // If we skipped forward a bunch of records to catch up with real time, remember how far we skipped. 
                  // This is needed to make sure we (re)draw everything we recorded during the time that was skipped over.
                  // Time skipping happens because browser animationFrame timing isn't that reliable, so to avoid desynching
                  // with the audio track, we sometimes need to skip records.
                  indexes[arrName].rangeStart = previousFrameIndex + 1;
                }
              }
            }
          }
        }
      } //console.log('getHistoryRecordsAtTime:, t=', t, 'records skipped:', skipped, 'indexes[drawings]:', indexes['drawings']);

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

    return indexes;
  }), _defineProperty(_state, "getIndexUpToTime", function getIndexUpToTime(kind, t) {
    var i;
    var historyArray = state.history[kind];

    if (historyArray !== undefined) {
      var historyArrayLength = historyArray.length;

      if (historyArrayLength > 0) {
        for (i = 0; i < historyArrayLength; ++i) {
          if (historyArray[i].startTime >= t) {
            return i;
          }
        } // check to see if time is on or past the last known record.


        i = historyArray.length - 1;

        if (historyArray[i].startTime < t && historyArray[i].endTime >= t || historyArray[i].endTime < t) {
          return i;
        }
      }
    }

    return undefined;
  }), _defineProperty(_state, "getLastFrameIndex", function getLastFrameIndex(kind) {
    return state.history[kind].length;
  }), _defineProperty(_state, "getHistoryItem", function getHistoryItem(kind, index) {
    if (index < state.history[kind].length && index >= 0) {
      return state.history[kind][index];
    }

    return undefined;
  }), _defineProperty(_state, "setHistory", function setHistory(history) {
    state.history = $.extend({}, history);
    state.resetPlayState();
    state.resetProcessedArrays();
  }), _defineProperty(_state, "getFromMovieCache", function getFromMovieCache(kind, keys) {
    var combinedKey = [keys.recordingCellId, keys.recordingKey, keys.activeTakeId].join('_');
    return state.movieCache[kind][combinedKey];
  }), _defineProperty(_state, "storeToMovieCache", function storeToMovieCache(kind, keys, data) {
    var combinedKey = [keys.recordingCellId, keys.recordingKey, keys.activeTakeId].join('_');
    state.movieCache[kind][combinedKey] = data;
  }), _defineProperty(_state, "getTimeRecordedSoFar", function getTimeRecordedSoFar() {
    return utils.getNow() - state.history.recordingStartTime;
  }), _defineProperty(_state, "getTimePlayedSoFar", function getTimePlayedSoFar() {
    var now = utils.getNow();
    var timePlayedSoFar = 0;

    if (state.playTimes[state.currentPlaySpeed].start !== undefined && state.activity === 'playing') {
      var playRateScalar = state.getPlayRateScalar();
      timePlayedSoFar += (now - state.playTimes[state.currentPlaySpeed].start) * playRateScalar;
    }

    for (var _i5 = 0, _Object$keys4 = Object.keys(state.playSpeeds); _i5 < _Object$keys4.length; _i5++) {
      var type = _Object$keys4[_i5];
      timePlayedSoFar += state.playTimes[type].total * state.playSpeeds[type];
    }

    return timePlayedSoFar;
  }), _defineProperty(_state, "graffitiShouldUpdateCellContents", function graffitiShouldUpdateCellContents(cellId) {
    return state.shouldUpdateCellContentsDuringPlayback || state.history.affectedCellIds.hasOwnProperty(cellId);
  }), _defineProperty(_state, "storeCellStates", function storeCellStates() {
    state.cellsAffectedByActivity = {};
    state.terminalsAffectedByActivity = [];
    var cells = Jupyter.notebook.get_cells();
    state.cellStates = {
      contents: state.createContentsRecord(false),
      selections: state.createSelectionsRecord(),
      changedCells: {},
      lineNumberStates: {}
    };

    for (var i = 0, cell; i < cells.length; ++i) {
      cell = cells[i];
      state.cellStates.lineNumberStates[utils.getMetadataCellId(cell.metadata)] = cell.code_mirror.options.lineNumbers;
    }
  }), _defineProperty(_state, "storeCellIdAffectedByActivity", function storeCellIdAffectedByActivity(cellId) {
    if (state.activity !== 'playing' && state.activity !== 'recording') return; //console.log('storeCellIdAffectedByActivity, logging cell: ' + cellId);

    state.cellStates.changedCells[cellId] = true;
  }), _defineProperty(_state, "restoreCellOutputs", function restoreCellOutputs(cell, frameOutputs) {
    var cellId = utils.getMetadataCellId(cell.metadata);
    if (frameOutputs === undefined) return false; // no output found, so don't update DOM (e.g. markdown cell)

    if (state.cellOutputsSent[cellId] !== undefined) {
      if (state.cellOutputsSent[cellId] === frameOutputs) {
        // no change to cell output, so don't rerender
        return false;
      }
    }

    var cellDom = $(cell.element);
    var outputArea = cellDom.find('.output'); //console.log('Sending this output to cellid:', cellId, frameOutputs);

    outputArea.html(frameOutputs).show();
    state.cellOutputsSent[cellId] = frameOutputs;
    return true;
  }), _defineProperty(_state, "restoreCellStates", function restoreCellStates(which) {
    var affectedIds = Object.keys(state.cellStates.changedCells);
    var selections, cellContents, cellOutputs;

    if (affectedIds.length > 0) {
      var cell, cellState, cellsContent, contentsRecord;

      for (var _i6 = 0, _affectedIds = affectedIds; _i6 < _affectedIds.length; _i6++) {
        var cellId = _affectedIds[_i6];
        // console.log('affectedid:', cellId);
        cell = utils.findCellByCellId(cellId);

        if (cell !== undefined) {
          selections = state.cellStates.selections.cellsSelections[cellId];

          if (which === 'contents') {
            cellsContent = state.cellStates.contents.cellsContent[cellId];

            if (cellsContent !== undefined) {
              contentsRecord = cellsContent.contentsRecord;
              cellContents = state.extractDataFromContentRecord(contentsRecord, cellId);

              if (cellContents !== undefined) {
                cell.set_text(contentsRecord.data);
              }

              if (typeof cell.clear_output === 'function') {
                cell.clear_output();
                cellOutputs = state.extractDataFromContentRecord(cellsContent.outputsRecord, cellId);
                state.restoreCellOutputs(cell, cellOutputs);
              }
            }
          } else {
            // restoring selections
            if (selections !== undefined) {
              if (cell.cell_type === 'code' && selections.active) {
                // hack, not coded right
                cell.code_mirror.focus();
              } // console.log('setting selection to :', selections.selections);


              cell.code_mirror.setSelections(selections.selections);
            }
          }
        }
      }
    }
  }), _defineProperty(_state, "restoreLineNumbersStates", function restoreLineNumbersStates() {
    if (state.hasOwnProperty('cellStates')) {
      if (state.cellStates.hasOwnProperty('lineNumberStates')) {
        if (Object.keys(state.cellStates.lineNumberStates).length > 0) {
          var cell;

          for (var _i7 = 0, _Object$keys5 = Object.keys(state.cellStates.lineNumberStates); _i7 < _Object$keys5.length; _i7++) {
            var cellId = _Object$keys5[_i7];
            cell = utils.findCellByCellId(cellId);

            if (cell !== undefined) {
              if (cell.code_mirror.options.lineNumbers != state.cellStates.lineNumberStates[cellId]) {
                cell.toggle_line_numbers();
              }
            }
          }
        }
      }
    }
  }), _defineProperty(_state, "getScrollTop", function getScrollTop() {
    return state.scrollTop;
  }), _defineProperty(_state, "setScrollTop", function setScrollTop(scrollTop) {
    state.scrollTop = scrollTop;
  }), _state);
  return state;
});