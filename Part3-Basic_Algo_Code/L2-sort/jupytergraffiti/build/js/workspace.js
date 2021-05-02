"use strict";

define(['js/state.js'], function (state) {
  var BELLATRIX_URL = 'https://bellatrix.udacity.com';
  var NEBULA_URL = 'https://nebula.udacity.com';

  function getToken() {
    var kernelName = Jupyter.notebook.kernel.name;

    var executeCallbackObject = function executeCallbackObject(callback) {
      return {
        iopub: {
          output: function output(data) {
            var tokenText = '';

            if (kernelName === 'ir') {
              tokenText = data.content.data && data.content.data['text/html'];
              tokenText = tokenText.replace(/'/g, "");
            } else {
              tokenText = data.content.text;
            }

            tokenText ? callback(tokenText) : null;
          }
        }
      };
    };

    return new Promise(function (resolve, reject) {
      var gcloudMetadaUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/keep_alive_token';
      var bashCommand = '';
      var execOptions = {};

      if (kernelName === 'ir') {
        bashCommand = "system('curl \"".concat(gcloudMetadaUrl, "\" -H \"Metadata-Flavor: Google\" -s --fail', intern=TRUE)");
        execOptions = {
          silent: false
        };
      } else {
        bashCommand = "!curl \"".concat(gcloudMetadaUrl, "\" -H \"Metadata-Flavor: Google\" -s --fail");
      }

      Jupyter.notebook.kernel.execute(bashCommand, executeCallbackObject(function (output) {
        return resolve(output);
      }), execOptions);
    });
  }

  function _getWorkspace(token) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "".concat(NEBULA_URL, "/api/v1/remote/me"));
      xhr.setRequestHeader("Authorization", "Star " + token);

      xhr.onload = function () {
        if (this.status >= 200 && this.status < 300) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        }
      };

      xhr.onerror = function () {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      };

      xhr.send();
    });
  }

  var workspace = {
    token: null,
    usageReportSent: false,
    getWorkspace: function getWorkspace() {
      if (!workspace.isUdacityEnv()) {
        return Promise.resolve({
          userId: 'dev',
          coco: true
        });
      }

      return getToken().then(function (token) {
        workspace.token = token;
        return _getWorkspace(token);
      });
    },
    isUdacityEnv: function isUdacityEnv() {
      var hostname = location.hostname;
      return hostname.endsWith('udacity.com') || hostname.endsWith('udacity-student-workspaces.com');
    },
    setWorkspace: function setWorkspace() {
      return workspace.getWorkspace().then(function (data) {
        state.setUserId(data.userId);
        state.setWorkspace(data);
      })["catch"](function (err) {
        return console.error(err);
      });
    },
    trackUsageStats: function trackUsageStats() {
      if (workspace.usageReportSent || !workspace.isUdacityEnv() || // This may happen if sendBeacon is not supported (in IE for example)
      !navigator.sendBeacon) {
        return;
      }

      var stats = state.getUsageStats();
      stats.workspace = state.getWorkspace();
      navigator.sendBeacon("".concat(BELLATRIX_URL, "/api/v1/graffiti/stats"), JSON.stringify(stats));
      workspace.usageReportSent = true;
    }
  };
  return workspace;
});