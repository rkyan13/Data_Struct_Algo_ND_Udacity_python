"use strict";

define(['js/state.js', 'js/audio.js', 'js/utils.js', 'js/batchRunner.js', 'js/LZString.js'], function (state, audio, utils, batchRunner, LZString) {
  //
  // Storage tree is organized like this:
  //
  // jupytergraffiti_data/
  //   notebooks/
  //     id_1234/
  //       authors/
  //        id_1234 (creator)/
  //          manifest.json
  //          cells/
  //            id_1234/
  //               graffitis/
  //                 id_1234/
  //                   takes/
  //                     id_1234/
  //                       audio.txt
  //                       history.txt  
  // Inside the notebook's graffiti metadata, firstAuthorId records the author id of the creator of the very first graffiti in this notebook.
  // For notebooks created at Udacity, these are usually graffiti created by instructors and we use a Udacity id. Otherwise we use a randomly generated id. 
  var storage = {
    defaultKernel: 'python3',
    executorCell: undefined,
    movieCompleteCallback: undefined,
    preloadBatchSize: 4,
    createExecutorCell: function createExecutorCell() {
      if (storage.executorCell === undefined) {
        storage.executorCell = Jupyter.notebook.insert_cell_at_bottom('code');
        state.storePreviousActivity();
        state.setActivity('executing');
      }

      return storage.executorCell;
    },
    runShellCommand: function runShellCommand(cmd) {
      var executorCell = storage.createExecutorCell();
      var currentKernelName = Jupyter.notebook.kernel.name;
      var fullCommand;

      if (currentKernelName === utils.rKernel) {
        // R doesn't support magics so we use internal R system() call.
        // This needs to escape double quotes eventually... 
        fullCommand = "system('" + cmd + "', intern=TRUE)";
      } else {
        fullCommand = '!' + cmd;
      }

      executorCell.set_text(fullCommand);
      executorCell.execute();
    },
    writeTextToFile: function writeTextToFile(opts) {
      var path = opts.path;
      var contents = opts.contents;
      var executorCell = storage.createExecutorCell();
      var currentKernelName = Jupyter.notebook.kernel.name;
      var writeMagic, chunkSize;

      switch (currentKernelName) {
        case utils.cplusplusKernel11:
        case utils.cplusplusKernel14:
        case utils.cplusplusKernel17:
          writeMagic = '%%file';
          chunkSize = 7000;
          break;

        case utils.pythonKernel:
          writeMagic = '%%writefile';
          chunkSize = 100000;
          break;

        case utils.rKernel:
          break;
      }

      var contentLength = contents.length;
      var chunkPtr = 0,
          chunk,
          appendFlag,
          cmd,
          rLines = [];
      var pathWithCrs = path + '.cr';

      while (chunkPtr < contentLength) {
        chunk = contents.substr(chunkPtr, chunkSize);
        appendFlag = chunkPtr === 0 ? ' ' : ' -a ';

        if (currentKernelName === utils.rKernel) {
          // We don't write in this loop if using the R Kernel, we just collect and write with a single command, below
          rLines.push('"' + chunk + '"');
        } else {
          cmd = writeMagic + appendFlag + pathWithCrs + "\n" + chunk;
          executorCell.set_text(cmd);
          executorCell.execute();
        }

        chunkPtr += chunkSize;
      }

      if (currentKernelName === utils.rKernel) {
        // Now write it all out in one fell swoop, cf: https://stackoverflow.com/questions/2470248/write-lines-of-text-to-a-file-in-r
        cmd = 'writeLines(c(' + rLines.join(',') + '), "' + pathWithCrs + '")';
        executorCell.set_text(cmd);
        executorCell.execute();
      }

      if (opts.stripCRs) {
        cmd = '/usr/bin/tr -d "\\n" < ' + pathWithCrs + ' > ' + path; // remove all the CR's produced by the %%writefile appends and write to the final filename
      } else {
        cmd = 'mv ' + pathWithCrs + ' ' + path; // just rename the .cr file with the final file name
      }

      storage.runShellCommand(cmd);
      cmd = 'rm ' + pathWithCrs;
      storage.runShellCommand(cmd);
    },
    cleanUpExecutorCell: function cleanUpExecutorCell() {
      var executorCell = storage.createExecutorCell();

      if (executorCell !== undefined) {
        var executorCellId = utils.getMetadataCellId(executorCell.metadata);
        var deleteCellIndex = utils.findCellIndexByCellId(executorCellId);

        if (deleteCellIndex !== undefined) {
          Jupyter.notebook.delete_cell(deleteCellIndex);
        }

        storage.executorCell = undefined;
        state.restorePreviousActivity();
        utils.saveNotebookDebounced();
      }
    },
    setMovieCompleteCallback: function setMovieCompleteCallback(cb) {
      storage.movieCompleteCallback = cb;
    },
    executeMovieCompleteCallback: function executeMovieCompleteCallback() {
      if (storage.movieCompleteCallback !== undefined) {
        storage.movieCompleteCallback();
        storage.movieCompleteCallback = undefined;
      }
    },
    ensureNotebookGetsGraffitiId: function ensureNotebookGetsGraffitiId() {
      // Make sure a new notebook gets a recording id
      var notebook = Jupyter.notebook;

      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        notebook.metadata['graffiti'] = {
          id: utils.generateUniqueId(),
          language: 'EN' // defaults to EN but can be changed by the author for their preferred locale, by editing the notebook's metadata

        };
      }

      utils.assignCellIds();
      utils.refreshCellMaps();
      console.log('Graffiti: Notebook is now ready to use Graffiti.');
    },
    ensureNotebookGetsFirstAuthorId: function ensureNotebookGetsFirstAuthorId() {
      // Make sure a new notebook gets a first author id, from whatever auth system is in use.
      var notebook = Jupyter.notebook;
      var metadata = notebook.metadata;
      var firstAuthorId;

      if (!metadata.hasOwnProperty('graffiti')) {
        storage.ensureNotebookGetsGraffitiId();
      }

      if (!metadata.graffiti.hasOwnProperty('firstAuthorId')) {
        firstAuthorId = state.getUserId();
        metadata.graffiti.firstAuthorId = firstAuthorId;
        state.setAuthorId(firstAuthorId);
      } else {
        firstAuthorId = metadata.graffiti.firstAuthorId;
      }

      return firstAuthorId;
    },
    constructBasePath: function constructBasePath() {
      var notebook = Jupyter.notebook;

      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        storage.ensureNotebookGetsGraffitiId();
      } // hardwired to only load author recordings for now


      var dataDir = utils.getNotebookGraffitiConfigEntry('dataDir');

      if (dataDir === undefined) {
        dataDir = 'jupytergraffiti_data/';
      } else if (dataDir[dataDir.length - 1] !== '/') {
        dataDir = dataDir + '/';
      }

      var basePath = dataDir + 'notebooks/' + notebook.metadata.graffiti.id + '/authors/' + state.getAuthorId() + '/'; //console.log('dataDir:', dataDir, 'basePath:', basePath);

      return basePath;
    },
    constructManifestPath: function constructManifestPath() {
      var basePath = storage.constructBasePath();
      return {
        path: basePath,
        file: 'manifest.json'
      };
    },
    constructGraffitiMoviePath: function constructGraffitiMoviePath(pathParts) {
      var basePath = storage.constructBasePath();
      var graffitiPath = basePath + 'cells/' + pathParts.recordingCellId + '/' + 'graffitis/' + pathParts.recordingKey + '/';
      return graffitiPath;
    },
    constructGraffitiTakePath: function constructGraffitiTakePath(pathParts) {
      var graffitiPath = storage.constructGraffitiMoviePath(pathParts) + 'takes/' + pathParts.takeId + '/';
      return graffitiPath;
    },
    completeMovieStorage: function completeMovieStorage() {
      var recordingCellInfo = state.getRecordingCellInfo();
      var recording = state.getManifestSingleRecording(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      var hasMovie = state.getMovieRecordingStarted(); // recording is a pointer into the live manifest hash, so beware that we are modifying state directly when changing it.

      if (recording !== undefined) {
        recording.inProgress = false;
        recording.hasMovie = hasMovie;
      }

      if (hasMovie) {
        // Store the latest take information in the current take for this recording.
        recording.activeTakeId = recordingCellInfo.recordingRecord.activeTakeId;

        if (!recording.hasOwnProperty('takes')) {
          recording.takes = {};
        }

        recording.takes[recording.activeTakeId] = {
          duration: state.getHistoryDuration(),
          createDate: utils.getNow()
        };
      }

      state.setMovieRecordingStarted(false);
      console.log('Graffiti: completeMovieStorage is saving manifest for recording:', recording, ', current kernel', Jupyter.notebook.kernel.name);
      storage.storeManifest();
      utils.queueSaveNotebookCallback(function () {
        storage.executeMovieCompleteCallback();
      });
      utils.saveNotebookDebounced();
    },
    writeOutMovieData: function writeOutMovieData(movieInfo, jsonHistory, encodedAudio) {
      //console.log('writeOutMovieData, movieInfo:', movieInfo, 'history:', jsonHistory);
      var graffitiPath = storage.constructGraffitiTakePath({
        recordingCellId: movieInfo.recordingCellId,
        recordingKey: movieInfo.recordingKey,
        takeId: movieInfo.activeTakeId
      });
      storage.runShellCommand('mkdir -p ' + graffitiPath);

      if (encodedAudio !== undefined) {
        storage.writeTextToFile({
          path: graffitiPath + 'audio.txt',
          contents: encodedAudio,
          stripCRs: true
        });
      }

      if (jsonHistory !== undefined) {
        var base64CompressedHistory = LZString.compressToBase64(jsonHistory);
        storage.writeTextToFile({
          path: graffitiPath + 'history.txt',
          contents: base64CompressedHistory,
          stripCRs: true
        });
      }

      storage.cleanUpExecutorCell(graffitiPath);
      return Promise.resolve();
    },
    storeMovie: function storeMovie() {
      var recordingCellInfo = state.getRecordingCellInfo();
      var notebook = Jupyter.notebook;
      var jsonHistory = state.getJSONHistory();

      if (jsonHistory !== undefined) {
        //console.log(jsonHistory);
        var encodedAudio = audio.getRecordedAudio();
        var keys = {
          recordingCellId: recordingCellInfo.recordingCellId,
          recordingKey: recordingCellInfo.recordingKey,
          activeTakeId: recordingCellInfo.recordingRecord.activeTakeId
        };
        storage.writeOutMovieData(keys, jsonHistory, encodedAudio).then(function () {
          storage.completeMovieStorage();
        });
      } else {
        console.log('Graffiti: could not fetch JSON history.');
      }
    },
    // Load the manifest for this notebook.
    // Manifests contain information about all the recordings present in this notebook.
    // This version of the system only supports author manifests.
    loadManifest: function loadManifest(currentAccessLevel) {
      var notebook = Jupyter.notebook;

      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        if (currentAccessLevel !== 'create') {
          console.log('Graffiti: loadManifest is bailing early because we are not in "create" mode and this notebook has no graffiti id.');
          return Promise.reject();
        } else {
          storage.ensureNotebookGetsGraffitiId();
        }
      }

      var authorId = storage.ensureNotebookGetsFirstAuthorId();
      state.setAuthorId(authorId);
      var credentials = {
        credentials: 'include'
      };
      var manifestInfo = storage.constructManifestPath();
      console.log('Graffiti: Loading manifest from:', manifestInfo);
      var manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      return fetch(manifestFullFilePath, credentials).then(function (response) {
        if (!response.ok) {
          // We could not fetch for some reason (maybe manifest file doesn't exist) so initialize an empty manifest
          return undefined;
        }

        return response.text();
      }).then(function (base64Str) {
        if (base64Str === undefined) {
          state.setManifest({});
        } else {
          var uncompressedManifestString = LZString.decompressFromBase64(base64Str); //console.log('uncompressed manifest:', uncompressedManifestString);

          var manifestDataParsed = JSON.parse(uncompressedManifestString);
          state.setManifest(manifestDataParsed); //console.log('Graffiti Manifest:', manifestDataParsed['id_iermcbu']);
        }
      });
    },
    updateSingleManifestRecordingField: function updateSingleManifestRecordingField(recordingCellId, recordingKey, field, data) {
      var recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
      recording[field] = data;
      storage.storeManifest();
    },
    storeManifest: function storeManifest() {
      var manifest = state.getManifest();
      var manifestInfo = storage.constructManifestPath();
      var base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      var manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      console.log('Graffiti: Saving manifest to:', manifestFullFilePath, manifest);
      storage.runShellCommand('mkdir -p ' + manifestInfo.path);
      storage.writeTextToFile({
        path: manifestFullFilePath,
        contents: base64CompressedManifest,
        stripCRs: true
      });
      storage.cleanUpExecutorCell();
    },
    // Compute the ids of any cells affected during this recording.
    computeAffectedCells: function computeAffectedCells(history) {
      history.affectedCellIds = {};
      var i, viewRec, drawingRec;

      for (i = 1; i < history.contents.length; ++i) {
        Object.keys(history.contents[i]).map(function (key) {
          if (history.contents[i][key].data !== undefined) {
            history.affectedCellIds[key] = true;
          }
        });
      }

      history.view.map(function (viewRec) {
        if (viewRec.subType === 'focus' || viewRec.subType === 'innerScroll') {
          history.affectedCellIds[viewRec.cellId] = true;
        } else if (viewRec.subType === 'selectCell') {
          history.affectedCellIds[viewRec.selectedCellId] = true;
        }
      });
      history.drawings.map(function (drawRec) {
        history.affectedCellIds[drawRec.cellId] = true;
      });
      Object.keys(history.cellAdditions).map(function (key) {
        history.affectedCellIds[key] = true;
      });
    },
    //
    // Fetch a movie and store it into the movies cache in state.
    // Returns a promise.
    //
    fetchMovie: function fetchMovie(data) {
      var notebookRecordingId = Jupyter.notebook.metadata.graffiti.id;
      var graffitiPath = storage.constructGraffitiTakePath({
        recordingCellId: data.recordingCellId,
        recordingKey: data.recordingKey,
        takeId: data.activeTakeId
      });
      var credentials = {
        credentials: 'include'
      };
      storage.successfulLoad = false;
      /* assume we cannot fetch this recording ok */
      // console.log('Graffiti: storage is loading movie from path:', graffitiPath);

      var historyUrl = graffitiPath + 'history.txt';
      return fetch(historyUrl, credentials).then(function (response) {
        if (!response.ok) {
          throw Error(response.statusText);
        }

        return response.text();
      }).then(function (base64CompressedHistory) {
        try {
          //console.log('Loaded history:', base64CompressedHistory);
          var uncompressedHistory = LZString.decompressFromBase64(base64CompressedHistory); //console.log('uncompressedHistory:', uncompressedHistory);

          var parsedHistory = JSON.parse(uncompressedHistory); // Compute "affected" cells for the history.

          storage.computeAffectedCells(parsedHistory); // console.log('Graffiti: Loaded previous history:', parsedHistory);

          var audioUrl = graffitiPath + 'audio.txt';
          return fetch(audioUrl, {
            credentials: 'include'
          }).then(function (response) {
            if (!response.ok) {
              throw Error(response.statusText);
            }

            return response.text();
          }).then(function (base64CompressedAudio) {
            try {
              //console.log('history', parsedHistory);
              state.storeToMovieCache('history', data, parsedHistory);
              state.storeToMovieCache('audio', data, base64CompressedAudio);
              storage.successfulLoad = true;
              return {
                history: parsedHistory,
                audio: base64CompressedAudio
              };
            } catch (ex) {
              console.log('Graffiti: Could not parse saved audio, ex:', ex);
              return Promise.reject('Could not parse saved audio, ex :' + ex);
            }
          });
        } catch (ex) {
          console.log('Graffiti: Could not parse previous history, ex :', ex);
          return Promise.reject('Could not parse previous history, ex :' + ex);
        }
      })["catch"](function (ex) {
        console.log('Graffiti: Could not fetch history file for history at', historyUrl);
        return Promise.reject('Could not fetch history file');
      });
    },
    preloadAllMovies: function preloadAllMovies() {
      var allRecords = [],
          dataRecord,
          recordingCellId,
          recordingKeys,
          recording;
      var manifest = state.getManifest();

      for (var _i = 0, _Object$keys = Object.keys(manifest); _i < _Object$keys.length; _i++) {
        recordingCellId = _Object$keys[_i];
        recordingKeys = Object.keys(manifest[recordingCellId]);

        if (recordingKeys.length > 0) {
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = recordingKeys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              recordingKey = _step.value;
              recording = state.getManifestSingleRecording(recordingCellId, recordingKey);

              if (recording.activeTakeId !== undefined) {
                dataRecord = {
                  recordingCellId: recordingCellId,
                  recordingKey: recordingKey,
                  activeTakeId: recording.activeTakeId
                };
                allRecords.push(dataRecord);
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
      }

      var callback = function callback(data) {
        storage.fetchMovie(data)["catch"](function (err) {
          console.log('Graffiti: Could not fetch movie:', data);
        });
      };

      batchRunner.start(storage.preloadBatchSize, callback, allRecords).then(function () {
        console.log('Graffiti: preloading completed.');
        state.refreshCellIdToGraffitiMap();
      });
    },
    deleteMovie: function deleteMovie(recordingCellId, recordingKey) {
      var graffitiPath = storage.constructGraffitiMoviePath({
        recordingCellId: recordingCellId,
        recordingKey: recordingKey
      });
      storage.runShellCommand('rm -r ' + graffitiPath);
      storage.cleanUpExecutorCell();
    },
    transferGraffiti: function transferGraffiti() {
      var notebook = Jupyter.notebook;
      var originalGraffitiId;

      if (notebook.metadata.hasOwnProperty('graffiti')) {
        originalGraffitiId = $.extend(true, {}, notebook.metadata.graffiti);
        delete notebook.metadata['graffiti'];
      }

      storage.ensureNotebookGetsGraffitiId();
      storage.ensureNotebookGetsFirstAuthorId();
      utils.queueSaveNotebookCallback(function () {
        var newGraffitiId = notebook.metadata.graffiti.id;
        var notebookPath = "jupytergraffiti_data/notebooks/";
        var sourceTree = notebookPath + originalGraffitiId;
        var destTree = notebookPath + newGraffitiId;
        storage.runShellCommand('cp -pr ' + sourceTree + ' ' + destTree);
        storage.cleanUpExecutorCell();
      });
      utils.saveNotebookDebounced();
      return Promise.resolve(); // not really doing this right but...
    },
    packageGraffiti: function packageGraffiti() {
      //utils.saveNotebookDebounced();
      var notebook = Jupyter.notebook;
      var notebookName = notebook.get_notebook_name();
      var archiveName = 'graffiti_archive_' + utils.generateUniqueId().replace('id_', '') + '.tgz';
      var tarCmd = 'tar zcf ' + archiveName + ' "' + notebookName + '.ipynb"' + ' jupytergraffiti_data';
      storage.runShellCommand(tarCmd);
      storage.cleanUpExecutorCell();
      return Promise.resolve(archiveName);
    },
    removeGraffitiIds: function removeGraffitiIds() {
      var cells = Jupyter.notebook.get_cells();
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = cells[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var cell = _step2.value;

          if (cell.metadata.hasOwnProperty('graffitiCellId')) {
            delete cell.metadata.graffitiCellId;
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

      delete Jupyter.notebook.metadata.graffiti;
      utils.saveNotebookDebounced();
    },
    // Delete all a notebook's stored graffitis and its data directory (but not the global jupytergraffiti_data directory)
    deleteDataDirectory: function deleteDataDirectory(graffitiId) {
      var notebookStoragePath = 'jupytergraffiti_data/notebooks/' + graffitiId;
      storage.runShellCommand('rm -r ' + notebookStoragePath);
      storage.cleanUpExecutorCell();
    },
    removeUnusedTakesCore: function removeUnusedTakesCore(recordingCellId, recordingKey) {
      var recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
      var activeTakeId = recording.activeTakeId;
      var deletedTakes = 0;

      if (recording.takes !== undefined) {
        for (var _i2 = 0, _Object$keys2 = Object.keys(recording.takes); _i2 < _Object$keys2.length; _i2++) {
          var takeId = _Object$keys2[_i2];

          if (takeId !== activeTakeId) {
            var graffitiTakePath = storage.constructGraffitiTakePath({
              recordingCellId: recordingCellId,
              recordingKey: recordingKey,
              takeId: takeId
            });
            storage.runShellCommand('rm -r ' + graffitiTakePath);
            delete recording.takes[takeId];
            deletedTakes++;
          }
        }
      }

      return deletedTakes;
    },
    removeUnusedTakes: function removeUnusedTakes(recordingCellId, recordingKey) {
      var deletedTakes = storage.removeUnusedTakesCore(recordingCellId, recordingKey);

      if (deletedTakes > 0) {
        storage.storeManifest();
        storage.cleanUpExecutorCell();
        utils.saveNotebookDebounced();
      }
    },
    fetchDataFile: function fetchDataFile(filePath) {
      var nbDir = utils.getNotebookDirectory();
      var fullPath = '/tree';

      if (nbDir !== undefined) {
        fullPath += '/' + nbDir;
      }

      fullPath += '/' + filePath;
      var reworkedFullPath = utils.reworkFetchPathForVirtualHosts(fullPath);
      return fetch(reworkedFullPath, {
        credentials: 'include'
      }).then(function (response) {
        if (!response.ok) {
          throw Error(response.statusText);
        }

        return response.text();
      })["catch"](function (ex) {
        console.log('Graffiti: could not fetch data file at :', filePath);
        return Promise.reject('Could not fetch data file at :' + filePath);
      });
    }
  };
  return storage;
});