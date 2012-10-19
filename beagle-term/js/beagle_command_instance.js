// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f',
          'hterm');

// CSP means that we can't kick off the initialization from the html file,
// so we do it like this instead.
window.onload = function() {
  lib.ensureRuntimeDependencies();
  hterm.init(Beagle.CommandInstance.init);
};

/**
 * The Beagle-powered terminal command.
 *
 * This class defines a command that can be run in an hterm.Terminal instance.
 *
 * @param {Object} argv The argument object passed in from the Terminal.
 */
Beagle.CommandInstance = function(argv) {
  this.argv_ = argv;
  this.io = null;
};

/**
 * The name of this command used in messages to the user.
 *
 * Perhaps this will also be used by the user to invoke this command, if we
 * build a shell command.
 */
Beagle.CommandInstance.prototype.commandName = 'beagle';

/**
 * Static initialier called from beagle.html.
 *
 * This constructs a new Terminal instance.
 */
Beagle.CommandInstance.init = function() {
  var profileName = lib.f.parseQuery(document.location.search)['profile'];
  var terminal = new hterm.Terminal(profileName);
  terminal.decorate(document.querySelector('#terminal'));

  // Useful for console debugging.
  window.term_ = terminal;

  // Looks like there is a race between this and terminal initialization, thus
  // adding timeout.
  setTimeout(function() {
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.runCommandClass(Beagle.CommandInstance, document.location.hash.substr(1));
    }, 500);
  return true;
};

/**
 * Start the beagle command.
 *
 * This is invoked by the terminal as a result of terminal.runCommandClass().
 */
Beagle.CommandInstance.prototype.run = function() {
  this.io = this.argv_.io.push();
  this.io.onVTKeystroke = this.sendString_.bind(this);
  this.io.sendString = this.sendString_.bind(this);
  this.io.onTerminalResize = this.onTerminalResize_.bind(this);  
  document.body.onunload = this.close_.bind(this);

  // Setup initial window size.
  this.onTerminalResize_(this.io.terminal_.screenSize.width, this.io.terminal_.screenSize.height);

  this.io.println(
    hterm.msg('WELCOME_VERSION', 
    ['\x1b[1m' + 'Beagle Term' + '\x1b[m', 
    '\x1b[1m' + 'BETA' + '\x1b[m']));

	this.promptForDestination_();
	
};

/**
 * Send a string to the connected device.
 *
 * @param {string} string The string to send.
 */
Beagle.CommandInstance.prototype.sendString_ = function(string) {
  var row = JSON.stringify(string);
  console.log('[sendString] ' + row);

  if (!serial_lib.isConnected()) {
    return;
  }

  serial_lib.writeSerial(string);
};

/**
 * Read a string from the connected device.
 *
 * @param {string} string The received string.
 */
Beagle.CommandInstance.prototype.onRead_ = function(string) {
  
};

/**
 * Notify process about new terminal size.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
Beagle.CommandInstance.prototype.onTerminalResize_ = function(width, height) {

};

/**
 * Exit the beagle command.
 */
Beagle.CommandInstance.prototype.exit = function(code) {
  this.close_();
  this.io.pop();

  if (this.argv_.onExit)
    this.argv_.onExit(code);
};

/**
 * Closes beagle terminal.
 */
Beagle.CommandInstance.prototype.close_ = function() {

}


Beagle.CommandInstance.prototype.promptForDestination_ = function() {
  var connectDialog = this.io.createFrame(
      lib.f.getURL('/html/beagle_connect_dialog.html'), null);

  connectDialog.onMessage = function(event) {
    event.data.argv.unshift(connectDialog);
    this.dispatchMessage_('connect-dialog', this.onConnectDialog_, event.data);
  }.bind(this);

  connectDialog.show();
};

/**
 * Dispatch a "message" to one of a collection of message handlers.
 */
Beagle.CommandInstance.prototype.dispatchMessage_ = function(
    desc, handlers, msg) {
  if (msg.name in handlers) {
    handlers[msg.name].apply(this, msg.argv);
  } else {
    console.log('Unknown "' + desc + '" message: ' + msg.name);
  }
};

/**
 * Connect dialog message handlers.
 */
Beagle.CommandInstance.prototype.onConnectDialog_ = {};

/**
 * Sent from the dialog when the user chooses a profile.
 */
Beagle.CommandInstance.prototype.onConnectDialog_.connectToProfile = function(
    dialogFrame, portName, portBaudrate) {
  dialogFrame.close();

	console.log('connectToProfile Received!!');
  if (!this.connectToProfile(portName,portBaudrate))
		this.promptForDestination_();
};

Beagle.CommandInstance.prototype.connectToProfile = function(portName,portBaudrate) { 
	var self = this;
  serial_lib.openSerial(portName, {bitrate: parseInt(portBaudrate)}, function(openInfo) {
    self.io.println('Device found ' + portName + ' : ' + portBaudrate + ' connection Id ' + openInfo.connectionId);

    serial_lib.startListening(function(string) {
      console.log('[onRead_] ' + string);
      self.io.print(string);
    });
  });

	return true;
};
