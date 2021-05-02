"use strict";

// Adapted from: https://stackoverflow.com/a/40850909/2767287
define(['js/state.js'], function (state) {
  var batchRunner = {
    // Output function for debugging
    output: function output(ostr) {//console.log(ostr);
    },
    // Main batch parallelization function.
    batch: function batch(pstart, atonce, pos) {
      if (pos >= batchRunner.data.length) return pstart;
      var p = pstart.then(function () {
        var batchNum = pos / atonce + 1;
        batchRunner.output('Graffiti: batchRunner running batch ' + batchNum);
        return Promise.all(batchRunner.data.slice(pos, pos + atonce).map(function (data) {
          return batchRunner.runner(data);
        }));
      });
      return batchRunner.batch(p, atonce, pos + atonce);
    },

    /*
     * Note: callback should return a promise.
     */
    runner: function runner(data) {
      return batchRunner.callback(data);
    },
    start: function start(batchSize, callback, data) {
      batchRunner.data = data;
      batchRunner.callback = callback;
      var init = batchRunner.batch(Promise.resolve(), // starting promise
      batchSize, // batch size
      0); // initial position into the data array

      return init;
    }
  };
  return batchRunner;
});