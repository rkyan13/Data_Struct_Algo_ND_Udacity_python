"use strict";

define(['js/state.js', 'js/hark.js'], function (state, hark) {
  var audio = {
    init: function init(cbs) {
      console.log('Graffiti audio constructor.');
      audio.executeCallback = true; // by default always execute the storage callback
      // fork getUserMedia for multiple browser versions, for the future
      // when more browsers support MediaRecorder

      navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

      if (navigator.getUserMedia) {
        //console.log('getUserMedia supported.');
        navigator.getUserMedia({
          // constraints - only audio needed for this app
          audio: true,
          mimeType: 'audio/wav'
        }, // Success callback
        function (stream) {
          var mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = audio.saveRecordedAudio;
          audio.storeMediaRecorder(mediaRecorder);
          cbs.succeed();
          hark.init(stream, {
            threshold: -65
          });
          hark.on('speaking', function () {
            state.setSpeakingStatus(true); // console.log('Graffiti: speaking started');
          });
          hark.on('stopped_speaking', function () {
            state.setSpeakingStatus(false); // console.log('Graffiti: speaking ended');
          }); //hark.on('volume_change', (currentVolume, threshold) => { console.log('volume change,', currentVolume, threshold) });
        }, // Error callback
        function (err) {
          console.log('Graffiti: The following getUserMedia error occured: ' + err);
          cbs.fail();
        });
      } else {
        console.log('Graffiti: getUserMedia not supported on your browser!');
      }
    },
    storeMediaRecorder: function storeMediaRecorder(mediaRecorder) {
      audio.mediaRecorder = mediaRecorder;
      console.log('Graffiti: Media recorder ready and stored.');
      return true;
    },
    isAvailable: function isAvailable() {
      return audio.mediaRecorder !== undefined;
    },
    storeAudio: function storeAudio(audioObj) {
      audio.audioObj = audioObj;
    },
    updateAudioPlaybackRate: function updateAudioPlaybackRate() {
      var scalar = state.getPlayRateScalar(); //const scalar = (rawScalar === 1.0 ? rawScalar : rawScalar * 0.85);
      //console.log('updateAudioPlaybackRate, scalar:', scalar);

      if (audio.audioObj !== undefined) {
        // make this defensive because if a user hits ESC before audio is fully loaded then the audioObj will not yet be defined
        audio.audioObj.playbackRate = scalar;
      }
    },
    // Special thanks to: https://developers.google.com/web/updates/2017/06/play-request-was-interrupted 
    // for handling of weird "play was interrupted" chrome exception.
    playAudio: function playAudio(elapsedTime) {
      try {
        audio.setAudioPosition(elapsedTime);
      } catch (ex) {
        console.warn('Graffiti: unable to set audio position with elapsedTime:', elapsedTime, 'ex:', ex);
      }

      audio.updateAudioPlaybackRate();
      var playPromise = audio.audioObj.play();

      if (playPromise !== undefined) {
        playPromise.then(function (_) {
          audio.playBeganOK = true;
        })["catch"](function (error) {
          audio.playBeganOK = false;
          console.log('Graffiti: audio error:', error);
        });
      }
    },
    pauseAudio: function pauseAudio() {
      if (audio.playBeganOK) {
        audio.audioObj.pause();
      } else {
        console.log('Graffiti: cannot pause audio because audio playback did not begin successfully.'); // Try again in one second if we fail. Sometimes there's a race condition if audio is stopped really quickly after it begins

        setTimeout(function () {
          if (audio.playBeganOK) {
            audio.audioObj.pause();
          }
        }, 1000);
      }
    },
    // Set time of audio clip, cf:
    // http://stackoverflow.com/questions/9563887/setting-html5-audio-position
    setAudioPosition: function setAudioPosition(elapsedTime) {
      audio.audioObj.currentTime = elapsedTime / 1000; // note that we keep elapsed time in ms, but the MSDN API wants currentTime in seconds
    },
    storeRecordedAudio: function storeRecordedAudio(base64String) {
      // console.log('storing audio base64String :', base64String);
      audio.recordedAudioString = base64String;
    },
    getRecordedAudio: function getRecordedAudio() {
      return audio.recordedAudioString || '';
    },
    setRecordedAudio: function setRecordedAudio(b64String) {
      //console.log('Fetching from ', b64String);
      var labeledAudio = 'data:video/webm;base64,' + b64String;
      var audioObj = new Audio(labeledAudio);
      audioObj.load();
      audio.storeAudio(audioObj); // An attempt to get sound to play in safari. Unfortunately chrome is recording using encoding type Opus
      // which safari does not accept. So we need to additionally convert the recording to mp3 or wav
      // before safari can play it.

      /*
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createBufferSource();
      const binaryAudioBlob = audio.b64toBlob(b64String);
      const reader = new FileReader();
      reader.addEventListener("loadend", function() {
        const bufferArray = reader.result;
        audioCtx.decodeAudioData(bufferArray, (buffer) => {
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          source.start(0);
          console.log('started audio from blob');
        }, function(e){ console.log("Error with decoding audio data" + e); });
      });
      reader.readAsArrayBuffer(binaryAudioBlob);
      */
    },
    setAudioStorageCallback: function setAudioStorageCallback(cb) {
      audio.audioStorageCallback = cb;
    },
    startRecording: function startRecording() {
      if (audio.mediaRecorder !== undefined) {
        audio.mediaRecorder.start();
        hark.start(); // start checking for silences

        console.log('Graffiti:', audio.mediaRecorder.state);
        console.log("Graffiti: Audio recording started");
      } else {
        console.log('Graffiti: Audio recording cannot start, access not granted.');
      }
    },
    stopRecording: function stopRecording() {
      if (audio.mediaRecorder !== undefined) {
        audio.mediaRecorder.stop();
        hark.stop(); // stop checking for silences

        console.log("Graffiti: Audio recording stopped");
      } else {
        console.log('Graffiti: Audio recording cannot stop, access not granted.');
      }
    },
    startPlayback: function startPlayback(elapsedTime) {
      audio.playAudio(elapsedTime);
    },
    pausePlayback: function pausePlayback() {
      audio.pauseAudio();
    },
    setExecuteCallback: function setExecuteCallback(value) {
      audio.executeCallback = value;
    },
    saveRecordedAudio: function saveRecordedAudio(e) {
      //console.log("Audio data available");
      // console.log('Graffiti: Audio data:', e.data);
      var reader = new FileReader();
      reader.addEventListener("loadend", function () {
        // reader.result contains the contents of blob as a typed array
        var bufferArray = reader.result; // From: https://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string
        // For going backwards, use https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript and note comment about ie10

        var base64String = btoa([].reduce.call(new Uint8Array(bufferArray), function (p, c) {
          return p + String.fromCharCode(c);
        }, '')); //console.log(base64String);

        audio.storeRecordedAudio(base64String);

        if (audio.executeCallback) {
          // This callback is actually: storage:storeMovie().
          audio.audioStorageCallback();
        }
      });
      reader.readAsArrayBuffer(e.data);
      var audioUrl = window.URL.createObjectURL(e.data); // This works so nice and simple. From: http://stackoverflow.com/questions/33755524/how-to-load-audio-completely-before-playing (first answer)

      var audioObj = new Audio(audioUrl);
      audioObj.load(); // Set time of clip for scrubbing: 
      // http://stackoverflow.com/questions/9563887/setting-html5-audio-position

      audio.storeAudio(audioObj);
    },
    b64toBlob: function b64toBlob(b64Data, contentType, sliceSize) {
      contentType = contentType || '';
      sliceSize = sliceSize || 512;
      var byteCharacters = atob(b64Data);
      var byteArrays = [];

      for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        var slice = byteCharacters.slice(offset, offset + sliceSize);
        var byteNumbers = new Array(slice.length);

        for (var i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }

        var byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }

      var blob = new Blob(byteArrays, {
        type: contentType
      });
      return blob;
    }
  };
  return audio;
});