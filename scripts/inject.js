(function () {
  var XHR = XMLHttpRequest.prototype;
  var open = XHR.open;
  var send = XHR.send;
  var setRequestHeader = XHR.setRequestHeader;

  XHR.open = function (method, url) {
    this._method = method;
    this._url = url;
    this._requestHeaders = {};
    this._startTime = new Date().toISOString();
    return open.apply(this, arguments);
  };

  XHR.setRequestHeader = function (header, value) {
    this._requestHeaders[header] = value;
    return setRequestHeader.apply(this, arguments);
  };

  XHR.send = function (postData) {
    this.addEventListener("load", function () {
      var myUrl = this._url ? this._url.toLowerCase() : this._url;
      if (myUrl && myUrl.includes("api/student-courses")) {
        var responseData = this.response;
        document.dispatchEvent(
          new CustomEvent("yourCustomEvent", {
            detail: responseData,
          })
        );
      }
    });
    return send.apply(this, arguments);
  };

  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var args = Array.prototype.slice.call(arguments);
      var input = args[0];
      var url = typeof input === "string" ? input : input && input.url;
      return originalFetch.apply(this, arguments).then(function (response) {
        var normalizedUrl = url ? url.toString().toLowerCase() : response.url ? response.url.toLowerCase() : "";
        if (normalizedUrl && normalizedUrl.includes("api/student-courses")) {
          try {
            response.clone().text().then(function (responseText) {
              document.dispatchEvent(
                new CustomEvent("yourCustomEvent", {
                  detail: responseText,
                })
              );
            });
          } catch (error) {
            console.error("inject.js fetch dispatch failed", error);
          }
        }
        return response;
      });
    };
  }
})();
