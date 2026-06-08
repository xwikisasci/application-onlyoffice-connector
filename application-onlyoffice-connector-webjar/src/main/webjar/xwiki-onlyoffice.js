/*
 * See the NOTICE file distributed with this work for additional
 * information regarding copyright ownership.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
define('xwiki-onlyoffice-wrapper', {
  prefix: 'xoo.editor.',
  keys: [
    'cancel.confirm'
  ]
});
define(['jquery', 'xwiki-l10n!xwiki-onlyoffice-wrapper'], function ($, l10n) {
  var TEXT_EXTENSIONS = [
    "djvu", "doc", "docx", "epub", "fb2", "htm", "html", "mht", "odt",
    "pdf", "rtf", "txt", "xps"
  ];
  var SPREADSHEET_EXTENSIONS = ["ods", "csv", "xls", "xlsx"];
  var PRESENTATION_EXTENSIONS = ["ppt", "pptx", "odp", "ppsx"];

  var docTypeForExtension = function (ext) {
    if (TEXT_EXTENSIONS.indexOf(ext) !== -1) {
      return 'text';
    }
    if (SPREADSHEET_EXTENSIONS.indexOf(ext) !== -1) {
      return 'spreadsheet';
    }
    if (PRESENTATION_EXTENSIONS.indexOf(ext) !== -1) {
      return 'presentation';
    }
  };

  var saveTypeForExtension = function (ext) {
    return ({
      text: 'docx',
      spreadsheet: 'xlsx',
      presentation: 'pptx'
    })[docTypeForExtension(ext)];
  };

  var httpGet = function (url, cb) {
    var callback = once(cb);
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status < 200 || xhr.status > 299) {
        callback(new Error(xhr.statusText));
        return;
      }
      callback(undefined, xhr.response);
    };
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.send();
    setTimeout(function () {
      callback(new Error("timeout"));
    }, 30000);
  };

  var httpUpload = function (url, blob, cb, options) {
    var callback = once(cb);
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status < 200 || xhr.status > 299) {
        callback(new Error(xhr.statusText));
        return;
      }
      callback(undefined, xhr.response);
    };
    xhr.open(options.method || "POST", url);
    if (options.type) {
      xhr.setRequestHeader("Content-Type", options.type);
    }
    if (options.token) {
      xhr.setRequestHeader(options.authHeader || "Authorization", "Bearer " + options.token);
    }
    xhr.send(blob);
  };

  var onError = function (event) {
    if (console && console.log && event) {
      console.log('error');
      console.log(event.data);
    }
  };

  var setFormEnabled = function (isIt) {
    $('#buttonsForm').prop('disabled', isIt);
  };

  var notification = function (type, comment) {
    $('.xnotification').attr('style', 'display:none;');
    $('.xnotification-' + type).attr('style', '');
    if (comment) {
      $('#ajaxRequestFailureReason').text(comment);
    }
    var timeout;
    if (type === 'done') { timeout = 2; }
    if (type === 'error') { timeout = 10; }
    if (timeout) {
      setTimeout(function () {
        $('.xnotification').attr('style', 'display:none;');
        $('#ajaxRequestFailureReason').text('');
      }, timeout * 1000);
    }
  };

  var initCtxFileInfo = function (ctx) {
    ctx.fileType = ctx.config.FILENAME.replace(/.*\.([^\.]*)$/, function (all, a) {
      return a;
    });
    ctx.saveType = ctx.config.SAVABLE_EXTENSIONS.indexOf(ctx.fileType) >= 0 ?
      ctx.fileType : saveTypeForExtension(ctx.fileType);
    if (typeof (ctx.saveType) !== 'string') {
      return;
    }
    var selectedType = $('#cnv-format').val();
    ctx.saveType = selectedType && ctx.config.SAVABLE_EXTENSIONS.indexOf(selectedType) >= 0 ?
      selectedType : ctx.saveType;
    ctx.saveName =
      ctx.config.FILENAME.slice(0, ctx.config.FILENAME.lastIndexOf('.')) + '.' + ctx.saveType;
    if (ctx.config.CONVERSION == 'officeServer' && ctx.config.SAVABLE_EXTENSIONS.indexOf(ctx.fileType) >= 0) {
      ctx.saveType = ctx.fileType;
      ctx.fileType = saveTypeForExtension(ctx.fileType);
    }
  };

  var launchEditor = function (ctx) {
    var docEditor;
    var afterSave;

    var save = function (then, isConversion) {
      return function () {
        if (afterSave) {
          console.log('tried to save while save operation is ongoing');
          return;
        }
        setFormEnabled(false);
        notification('inprogress');
        if (isConversion) {
          setTimeout(function () { docEditor.downloadAs(ctx.saveType); });
        } else {
          docEditor.downloadAs(ctx.fileType);
        }
        var saveTimeout = setTimeout(function () {
          notification('error', 'Request timed out');
          setFormEnabled(true);
          afterSave = undefined;
        }, 30000);
        afterSave = function (errStr, detail) {
          clearTimeout(saveTimeout);
          setFormEnabled(true);
          afterSave = undefined;
          if (!errStr) {
            notification('done');
            then();
          } else {
            console.log(detail);
            notification('error', 'Request error [' + errStr + ']');
          }
        };
        return false;
      };
    };

    var saveCallbackOO = function (url) {
      console.log("saveCallbackOO(" + url + ")");
      httpGet(url, function (err, dat) {
        if (err) {
          afterSave("downloading", err);
          return;
        }
        var upURL = ctx.config.CONVERSION == 'officeServer' &&
          ctx.config.SAVABLE_EXTENSIONS.indexOf(ctx.fileType) >= 0 ?
          ctx.config.ATTACH_URL :
          ctx.config.REST_DOC_URL + '/attachments/' + encodeURIComponent(ctx.saveName);
        console.log("saving to " + upURL);
        httpUpload(upURL, dat, function (err, ret) {
          if (err) {
            afterSave("uploading", err);
            return;
          }
          afterSave();
        }, { method: "PUT" });
      });
    };

    var switchToSaveableFile = function () {
      var url = ('' + window.location.href);
      url = url.replace('filename=' + encodeURIComponent(ctx.config.FILENAME),
        'filename=' + encodeURIComponent(ctx.saveName));
      window.location.href = url;
    };

    var ready = false;
    var onReady = function () {
      if (ready) { return; }
      ready = true;
      console.log("Document editor ready2");
      window.addEventListener('beforeunload', (event) => {
      if (window.docEditor && window.docEditor.xwikiEdited) {
        event.preventDefault();
        // The property is deprecated. We set an empty value to it to ensure compatibility with older browsers.
        event.returnValue = ''; 
      }
      });
      $('#button-cancel').on('click', function () {
        if (window.docEditor && window.docEditor.xwikiEdited && !confirm(l10n.get('cancel.confirm'))) {
          return;
        }
        // Mark editor as not dirty to prevent popup when leaving
        window.docEditor.xwikiEdited = false;
        window.location.href = ctx.config.DOCU_VIEW_URL;
      });
      $('#button-sac').on('click', save(function () {
        if (window.docEditor) {
          window.docEditor.xwikiEdited = false;
        }
        console.log("saved");
      }, false));
      $('#button-sav').on('click', save(function () {
        console.log("saved2");
        // Mark editor as not dirty to prevent popup when leaving
        window.docEditor.xwikiEdited = false;
        window.location.href = ctx.config.DOCU_VIEW_URL;
      }, false));
      $('#button-ecv').on('click', switchToSaveableFile);
      $('#button-cnv').on('click', save(switchToSaveableFile, true));
      $('#cnv-format').on('change', function () {
        var selectedType = $(this).val();
        if (selectedType && docTypeForExtension(selectedType)) {
          ctx.saveType = selectedType;
          ctx.saveName = ctx.config.FILENAME.slice(0, ctx.config.FILENAME.lastIndexOf('.')) + '.' + selectedType;
        }
      });
    };
    var editorOptions = {
      width: "100%",
      height: "100%",
      type: ctx.config.CANEDIT ? 'edit' : 'view',
      documentType: docTypeForExtension(ctx.fileType),
      document: {
        title: ctx.config.FILENAME,
        url: ctx.config.ATTACH_URL,
        attachRef: ctx.config.ATTACH_REF,
        fileType: ctx.fileType,
        key: ctx.key,
        vkey: ctx.vkey,

        info: {
          owner: ctx.config.USERNAME,
          uploaded: ctx.config.CREATION_DATE
        },

        permissions: {
          edit: ctx.config.CANEDIT === 'true',
          download: true
        }
      },
      editorConfig: {
        mode: ctx.config.MODE_EDITVIEW,
        lang: ctx.config.LANG,
        embedded: {
          toolbarDocked: "top"
        },
        user: {
          name: ctx.config.USERPRETTYNAME,
          id: ctx.config.USERNAME
        }
      },
      events: {
        onAppReady: onReady,
        onReady: onReady,
        onDownloadAs: function (evt) { saveCallbackOO(evt.data.url || evt.data); },
        onRequestEditRights: function () { docEditor.applyEditRights(true); },
        // The event.data will be true when the current user is editing the document and false when the current user's
        // changes are sent to the document editing service.
        onDocumentStateChange: function (evt) {
          $('#button-sav').prop('disabled', evt.data);
          if (window.docEditor) {
            window.docEditor.xwikiEdited = true;
          }
        },
        onError: onError
      }
    };
    withToken(ctx, editorOptions, function (token) {
      editorOptions.token = token;
      window.docEditor = docEditor = new DocsAPI.DocEditor("iframeEditor", editorOptions);
    });
  };

  var withToken = function (ctx, options, callback) {
    $.ajax({
      contentType: "application/json",
      data: JSON.stringify(options),
      type: 'POST',
      url: ctx.config.GETTOKEN_URL + '?outputSyntax=plain',
      success: callback,
      error: function (error) {
        alert("Error while retrieving the JWT from XWiki.");
        console.log(error);
      }
    });
  };

  var once = function (cb) {
    var called = false;
    return function () {
      if (!called) {
        called = true;
        cb.apply(null, arguments);
      }
    };
  };

  var randString = function () {
    return new Array(6).fill().map(function () {
      return Math.random().toString(32);
    }).join('').replace(/\./g, '');
  };

  return function (config) {
    require([config.OOAPI_PATH], function () {
      $(function () {
        var SAVABLE_EXTENSIONS = ["docx", "pptx", "xlsx"];
        if (config.CONVERSION != 'force') {
          SAVABLE_EXTENSIONS.push('odt', 'odp', 'ods');
        }
        var ctx = {
          config: config,
          fileType: undefined,
          vkey: undefined,
          key: undefined,
          url: undefined,
          saveName: undefined
        };
        ctx.config.SAVABLE_EXTENSIONS = SAVABLE_EXTENSIONS;
        ctx.fileType = config.FILENAME.replace(/.*\.([^\.]*)$/, function (all, a) {
          return a;
        });
        initCtxFileInfo(ctx);
        if (typeof (ctx.saveType) !== 'string') {
          alert("internal error: invalid save type of " + ctx.fileType);
          return;
        }
        var loadRealtimeOO = function (key) {
          ctx.vkey = key;
          ctx.key = key;
          launchEditor(ctx);
        };
        // Init a random key. Used if realtime is disabled or if it fails.
        var vkey = randString() + '_' + new Date().getTime() + '.' + ctx.fileType;
        var key = vkey.slice(0, 20);
        if (config.ALLOW_REALTIME) {
          // We want to create a channel and use the key for each document editing session.
          // If all the connections to the channel are closed, we want another id when editing the same document again.
          require([config.NETFLUX_CLIENT], function () {
            require(['netflux-client'], function (Netflux) {
              Netflux.connect(config.NETFLUX_WEBSOCKET)
                .then(function (network) {
                  var channelsRestURL = config.CHANNEL_REST;
                  $.getJSON(channelsRestURL, $.param({
                    path: config.FILENAME + "/xoo",
                    create: true
                  }, true)).done(channels => {
                    network.join(channels[0].key);
                    loadRealtimeOO(channels[0].key);
                  }).fail(function () {
                    alert("Failed to retrieve the key to join the realtime channel. Opening the editor without " +
                      "realtime support.");
                    loadRealtimeOO(key);
                  });
                })
                .catch(function () {
                  alert("Could not connect to the websocket. Opening the editor without realtime support.");
                  loadRealtimeOO(key);
                });
            });
          });
        } else {
          loadRealtimeOO(key);
        }
      });
    });
  };
});
