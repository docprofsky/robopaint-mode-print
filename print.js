/**
 * @file Holds all RoboPaint automatic painting mode specific code
 */
"use strict";

var actualPen = {}; // Hold onto the latest actualPen object from updates.
var buffer = {};
var t = i18n.t; // The mother of all shortcuts
var canvas = rpRequire('canvas');

mode.pageInitReady = function () {
  // Initialize the paper.js canvas with wrapper margin and other settings.
  canvas.domInit({
    replace: '#paper-placeholder', // jQuery selecter of element to replace
    paperScriptFile: 'print.ps.js', // The main PaperScript file to load
    wrapperMargin: {
      top: 30,
      left: 30,
      right: 265,
      bottom: 40
    },

    // Called when PaperScript init is complete, requires
    // canvas.paperInit(paper) to be called in this modes paperscript file.
    // Don't forget that!
    loadedCallback: paperLoadedInit
  });
}


// Trigger load init resize only after paper has called this function.
function paperLoadedInit() {
  if (!robopaint.svg.isEmpty()) {
    paper.canvas.loadSVG(robopaint.svg.load());
  }

  // With Paper ready, send a single up to fill values for buffer & pen.
  mode.run('up');
}


// Catch CNCServer buffered callbacks
mode.onCallbackEvent = function(name) {
  switch (name) {
    case 'autoPaintBegin': // Should happen when we've just started
      $('#pause').prop('disabled', false); // Enable pause button
      break;
    case 'autoPaintComplete': // Should happen when we're completely done
      $('#pause').attr('class', 'ready')
        .attr('title', t('modes.print.status.ready'))
        .text(robopaint.t('common.action.start'))
        .prop('disabled', false);
      $('#buttons button.normal').prop('disabled', false); // Enable options
      $('#cancel').prop('disabled', true); // Disable the cancel print button
      break;
  }
};

// Catch less general message types from RoboPaint.
mode.onMessage = function(channel, data) {
  switch (channel) {
    // SVG has been pushed into localStorage, and main suggests you load it.
    case 'loadSVG':
      paper.resetAll();
      mode.run('status', ''); // TODO: Can we do better for the user here?
      paper.canvas.loadSVG(robopaint.svg.load());
      break;
  }
};

// Mode API called callback for binding the controls
mode.bindControls = function(){
  // Cancel Print
  $('#cancel').click(function(){
    var cancelPrint = confirm(t("modes.print.status.confirm"));
    if (cancelPrint) {
      paper.resetAll(); // Cleanup paper portions
      mode.onCallbackEvent('autoPaintComplete');
      mode.fullCancel(mode.t('status.cancelled'));
    }
  });


  // Bind pause click and functionality
  $('#pause').click(function() {

    // With nothing in the queue, start autopaint!
    if (buffer.length === 0) {
      $('#pause')
        .removeClass('ready')
        .attr('title', t("modes.print.status.pause"))
        .text(t('common.action.pause'))
        .prop('disabled', true);
      $('#buttons button.normal').prop('disabled', true); // Disable options
      $('#cancel').prop('disabled', false); // Enable the cancel print button


      // If we already have something in the actionLayer, assume we're just
      // printing the same thing again.
      if (paper.canvas.actionLayer.children.length) {
        paper.utils.autoPaint(paper.canvas.actionLayer);
      } else {
        // Render stroke and fill to the actionLayer
        paper.renderMotionPaths(function(){
          // When done, lets autoPaint em!
          paper.utils.autoPaint(paper.canvas.actionLayer);
        });
      }

    } else {
      // With something in the queue... we're either pausing, or resuming
      if (!buffer.paused) {
        // Starting Pause =========
        $('#pause').prop('disabled', true).attr('title', t("status.wait"));
        mode.run([
          ['status', t("status.pausing"), true], // Run status Immediately
          ['pause']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyPaused = function(){
          mode.run('status', t("status.paused"), true);  // Run status Immediately
          $('#buttons button.normal').prop('disabled', false); // Enable options
          $('#pause')
            .addClass('active')
            .attr('title', t("status.resume"))
            .prop('disabled', false)
            .text(t("common.action.resume"));
        };
      } else {
        // Resuming ===============
        $('#buttons button.normal').prop('disabled', true); // Disable options
        mode.run([
          ['status', t("status.resuming")],
          ['resume']
        ], true); // Insert at the start of the buffer so it happens immediately

        mode.onFullyResumed = function(){
          $('#pause')
            .removeClass('active')
            .text(buffer.length ? t('common.action.pause') : t('common.action.start'))
            .attr('title', t("mode.print.status.pause"));
          mode.run('status', t("status.resumed"));
        };
      }
    }
  });

  // Bind to control buttons
  $('#park').click(function(){
    // If we're paused, skip the buffer
    mode.run([
      ['status', t("status.parking"), buffer.paused],
      ['park', buffer.paused], // TODO: If paused, only one message will show :/
      ['status', t("status.parked"), buffer.paused]
    ]);
  });


  $('#pen').click(function(){
    // Run height pos into the buffer, or skip buffer if paused
    var newState = 'up';
    if (actualPen.state === "up" || actualPen.state === 0) {
      newState = 'down';
    }

    mode.run(newState, buffer.paused);
  });

  // Motor unlock: Also lifts pen and zeros out.
  $('#disable').click(function(){
    mode.run([
      ['status', t("status.unlocking")],
      ['up'],
      ['zero'],
      ['unlock'],
      ['status', t("status.unlocked")]
    ]);
  });
}

// Warn the user on close about cancelling jobs.
mode.onClose = function(callback) {
  if (buffer.length) {
    var r = confirm(i18n.t('common.dialog.confirmexit'));
    if (r == true) {
      // As this is a forceful cancel, shove to the front of the queue
      mode.run(['clear', 'park', 'clearlocal'], true);
      callback(); // The user chose to close.
    }
  } else {
    callback(); // Close, as we have nothing the user is waiting on.
  }
}

// Actual pen update event
mode.onPenUpdate = function(botPen){
  paper.canvas.drawPoint.move(botPen.absCoord, botPen.lastDuration);
  actualPen = $.extend({}, botPen);

  // Update button text/state
  // TODO: change implement type <brush> based on actual implement selected!
  var key = 'common.action.brush.raise';
  if (actualPen.state === "up" || actualPen.state === 0){
    key = 'common.action.brush.lower';
  }
  $('#pen').text(t(key));
}

// An abbreviated buffer update event, contains paused/not paused & length.
mode.onBufferUpdate = function(b) {
  buffer = b;
}
