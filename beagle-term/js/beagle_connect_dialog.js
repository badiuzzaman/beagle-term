// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.colors', 'lib.f', 'lib.fs', 'lib.MessageManager');

/**
 * Window onLoad handler for nassh_connect_dialog.html.
 */
window.onload = function() {
  lib.ensureRuntimeDependencies();
  window.dialog_ = new Beagle.ConnectDialog();
};

/**
 * Constructor a new ConnectDialog instance.
 *
 * There should only be one of these, and it assumes the connect dialog is
 * the only thing in the current window.
 *
 * NOTE: This class uses the function() {...}.bind() pattern in place of the
 * 'var self = this;' pattern used elsewhere in the codebase.  Just trying it
 * out, may convert the rest of the codebase later.
 */
Beagle.ConnectDialog = function() {
  // Prepare to listen to the terminal handshake.
  this.windowMessageHandler_ = this.onWindowMessage_.bind(this);
  window.addEventListener('message', this.windowMessageHandler_);

  // Message port back to the terminal.
  this.messagePort_ = null;

  // Turn off spellcheck everywhere.
  var ary = document.querySelectorAll('input[type="text"]');
  for (var i = 0; i < ary.length; i++) {
    ary[i].setAttribute('spellcheck', 'false');
  }

  // The Message Manager instance, null until the messages have loaded.
  this.mm_ = null;

  // Map of id->Beagle.ConnectDialog.ProfileRecord.
  this.profileMap_ = {};

  // Array of Beagle.ConnectDialog.ProfileRecord instances in display order.
  this.profileList_ = [];

  // We need this hack until CSS variables are supported on the stable channel.
  this.cssVariables_ = new Beagle.CSSVariables(document.styleSheets[1]);

  // Cached DOM nodes.
  this.form_ = document.querySelector('form');
  this.connectButton_ = document.querySelector('#connect');
  this.deleteButton_ = document.querySelector('#delete');

  // Install various (DOM and non-DOM) event handlers.
  this.installHandlers_(); 

	// load portnames
	this.loadPortNames_();
};

/**
 * Get a localized message from the Message Manager.
 *
 * This converts all message name to UPPER_AND_UNDER format, since that's
 * pretty handy in the connect dialog.
 */
Beagle.ConnectDialog.prototype.msg = function(name, opt_args) {
  if (!this.mm_)
    return 'loading...';

  return this.mm_.get(name.toUpperCase().replace(/-/g, '_'), opt_args);
};

/**
 * Align the bottom fields.
 *
 * We want a grid-like layout for these fields.  This is not easily done
 * with box layout, but since we're using a fixed width font it's a simple
 * hack.  We just left-pad all of the labels with &nbsp; so they're all
 * the same length.
 */
Beagle.ConnectDialog.prototype.alignLabels_ = function() {
  var labels = [
      this.$f('identity').previousElementSibling,
  ];

  var labelWidth = Math.max.apply(
      null, labels.map(function(el) { return el.textContent.length }));

  labels.forEach(function(el) {
      el.textContent = lib.f.lpad(el.textContent, labelWidth, '\xa0');
    });
};
	
/**
 * Install various event handlers.
 */
Beagle.ConnectDialog.prototype.installHandlers_ = function() {
  // Small utility to connect DOM events.
  function addListeners(node, events, handler, var_args) {
    for (var i = 2; i < arguments.length; i++) {
      handler = arguments[i];
      for (var j = 0; j < events.length; j++) {
        node.addEventListener(events[j], handler);
      }
    }
  }

  this.connectButton_.addEventListener('click',
                                       this.onConnectClick_.bind(this));

};

/**
 * Quick way to ask for a '#field-' element from the dom.
 */
Beagle.ConnectDialog.prototype.$f = function(
    name, opt_attrName, opt_attrValue) {
  var node = document.querySelector('#field-' + name);
  if (!node)
    throw new Error('Can\'t find: #field-' + name);

  if (!opt_attrName)
    return node;

  if (typeof opt_attrValue == 'undefined')
    return node.getAttribute(opt_attrName);

  node.setAttribute(opt_attrName, opt_attrValue);
};

/**
 * Change the enabled state of one of our <div role='button'> elements.
 *
 * Since they're not real <button> tags the don't react properly to the
 * disabled property.
 */
Beagle.ConnectDialog.prototype.enableButton_ = function(button, state) {
  if (state) {
    button.removeAttribute('disabled');
    button.setAttribute('tabindex', '0');
  } else {
    button.setAttribute('disabled', 'disabled');
    button.setAttribute('tabindex', '-1');
  }
};

/**
 * Save any changes and connect if the form validates.
 */
Beagle.ConnectDialog.prototype.connect = function(name, argv) {
	
	/*
	if (this.form_.checkValidity()){
		this.postMessage('connectToProfile', 'nike');
	}else{
		console.log('checkValidity failed');
	}*/
	this.postMessage('connectToProfile', ['nike']);	//should pass as array type
    //this.postMessage('connectToProfile', [this.currentProfileRecord_.id]);
};

/**
 * Send a message back to the terminal.
 */
Beagle.ConnectDialog.prototype.postMessage = function(name, argv) {
  this.messagePort_.postMessage({name: name, argv: argv || null});
};

/**
 * Return the index into this.profileList_ for a given profile id.
 *
 * Returns -1 if the id is not found.
 */
Beagle.ConnectDialog.prototype.getProfileIndex_ = function(id) {
  for (var i = 0; i < this.profileList_.length; i++) {
    if (this.profileList_[i].id == id)
      return i;
  }

  return -1;
};

/**
 * Called when the message manager finishes loading the translations.
 */
Beagle.ConnectDialog.prototype.onMessagesLoaded_ = function(mm, loaded, failed) {
  this.mm_ = mm;
  this.mm_.processI18nAttributes(document.body);
  this.alignLabels_();
};

/**
 * User initiated file import.
 *
 * This is the onChange hander for the `input type="file"`
 * (aka this.importFileInput_) control.
 */
Beagle.ConnectDialog.prototype.onImportFiles_ = function(e) {
  var input = this.importFileInput_;
  var select = this.$f('identity');

  var onImportSuccess = function() {
    this.syncIdentityDropdown_(function() {
        select.selectedIndex = select.childNodes.length - 1;
      });
  }.bind(this);

  if (!input.files.length)
    return;

  Beagle.importFiles(this.fileSystem_, '/.ssh/', input.files, onImportSuccess);

  return false;
};

/**
 * Someone clicked on the connect button.
 */
Beagle.ConnectDialog.prototype.onConnectClick_ = function(e) {
  if (this.connectButton_.getAttribute('disabled'))
    return;
	console.log('onclick connect');
  this.connect();
};

/**
 * Handle a message from the terminal.
 */
Beagle.ConnectDialog.prototype.onMessage_ = function(e) {
  if (e.data.name in this.onMessageName_) {
    this.onMessageName_[e.data.name].apply(this, e.data.argv);
  } else {
    console.warn('Unhandled message: ' + e.data.name, e.data);
  }
};

/**
 * Terminal message handlers.
 */
Beagle.ConnectDialog.prototype.onMessageName_ = {};

/**
 * termianl-info: The terminal introduces itself.
 */
Beagle.ConnectDialog.prototype.onMessageName_['terminal-info'] = function(info) {
  var mm = new lib.MessageManager(info.acceptLanguages);
  mm.findAndLoadMessages('/_locales/$1/messages.json',
                         this.onMessagesLoaded_.bind(this, mm));

  document.body.style.fontFamily = info.fontFamily;
  document.body.style.fontSize = info.fontSize + 'px';

  var fg = lib.colors.normalizeCSS(info.foregroundColor);
  var bg = lib.colors.normalizeCSS(info.backgroundColor);
  var cursor = lib.colors.normalizeCSS(info.cursorColor);

  var vars = {
    'background-color': bg,
    'foreground-color': fg,
    'cursor-color': cursor,
  };

  for (var i = 10; i < 100; i += 5) {
    vars['background-color-' + i] = lib.colors.setAlpha(bg, i / 100);
    vars['foreground-color-' + i] = lib.colors.setAlpha(fg, i / 100);
    vars['cursor-color-' + i] = lib.colors.setAlpha(cursor, i / 100);
  }

  this.cssVariables_.reset(vars);
};

/**
 * Global window message handler, uninstalled after proper handshake.
 */
Beagle.ConnectDialog.prototype.onWindowMessage_ = function(e) {
  if (e.data.name != 'ipc-init') {
    console.warn('Unknown message from terminal:', e.data);
    return;
  }

  window.removeEventListener('message', this.windowMessageHandler_);
  this.windowMessageHandler_ = null;

  this.messagePort_ = e.data.argv[0].messagePort;
  this.messagePort_.onmessage = this.onMessage_.bind(this);
  this.messagePort_.start();

  this.postMessage('ipc-init-ok');
};


/**
 * Global window message handler, uninstalled after proper handshake.
 */
Beagle.ConnectDialog.prototype.loadPortNames_ = function() {
  var portSelect = this.$f('ports');

	function clearSelect() {
		while (portSelect.firstChild) {
			portSelect.removeChild(portSelect.firstChild);
		}
	}     
	
	var onCallbackGetPorts = function(ports){
		clearSelect();
		var eligiblePorts = ports.filter(function(port) {
			return !port.match(/[Bb]luetooth/);
		});

		var portPicker = document.getElementById('port-picker');
		eligiblePorts.forEach(function(port) {
		  var portOption = document.createElement('option');
		  portOption.value = portOption.innerText = port;
	    portSelect.appendChild(portOption);
		});

	}.bind(this);

	serial_lib.getPorts(onCallbackGetPorts);
}
/*
 var onReadError = function() {                                                                                                                                 |  %anonymous_function : void function(an
		 530     clearSelect();                                                                                                                                               |  
		 531     var option = document.createElement('option');                                                                                                               |  %anonymous_function : void function(an
			 532     option.textContent = 'Error!';                                                                                                                               |  
			 533     identitySelect.appendChild(option);                                                                                                                          |  %anonymous_function : void function(an
				 534   }.bind(this);                                                                                                                                                  |  
				 535                                                                                                                                                                  |  %anonymous_function : void function()
				 536   var onReadSuccess = function(entries) {                                                                                                                        |  
				 537     for (var key in entries) {                                                                                                                                   |  %anonymous_function : void function(an
					 538       var ary = key.match(/^(.*)\.pub/);                                                                                                                         |  
					 539       if (ary && ary[1] in entries)                                                                                                                              |  %anonymous_function : void function(an
						 540         keyfileNames.push(ary[1]);                                                                                                                               |  
						 541     }                                                                                                                                                            |  %anonymous_function : void function()
						 542                                                                                                                                                                  |  
						 543     clearSelect();                                                                                                                                               |  %anonymous_function : void function(an
							 544                                                                                                                                                                  |  
							 545     var option = document.createElement('option');                                                                                                               |  %anonymous_function : void function()
							 546     option.textContent = '[default]';                                                                                                                            |  
							 547     identitySelect.appendChild(option);                                                                                                                          |  %anonymous_function : void function()
							 548                                                                                                                                                                  |  
							 549     for (var i = 0; i < keyfileNames.length; i++) {                                                                                                              |  %anonymous_function : void function()
							 550       var option = document.createElement('option');                                                                                                             |  
							 551       option.textContent = keyfileNames[i];                                                                                                                      |  %anonymous_function : void function(an
								 552       identitySelect.appendChild(option);                                                                                                                        |  
								 553       if (keyfileNames[i] == selectedName)                                                                                                                       |  ConnectDialog : void function()
								 554         identitySelect.selectedIndex = i;                                                                                                                        |  
								 555     }                                                                                                                                                            |  ProfileRecord : void function(any, any
									 556                                                                                                                                                                  |  
									 557     if (opt_onSuccess)                                                                                                                                           |  addListeners : void function(any, Arra
										 558       opt_onSuccess();                                                                                                                                           |  
										 559                                                                                                                                                                  |  alignLabels_ : void function()
										 560   }.bind(this);                                      
										 */
