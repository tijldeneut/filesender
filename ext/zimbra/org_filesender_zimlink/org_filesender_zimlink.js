/*
 * FileSender www.filesender.org
 * 
 * Copyright (c) 2009-2012, AARNet, Belnet, HEAnet, SURFnet, UNINETT
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * *    Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * *    Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * *    Neither the name of AARNet, Belnet, HEAnet, SURFnet and UNINETT nor the
 *     names of its contributors may be used to endorse or promote products
 *     derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// Zimlet Class
function org_filesender_zimlink() {}

// Make Zimlet class a subclass of ZmZimletBase class - this makes a Zimlet a Zimlet
org_filesender_zimlink.prototype = new ZmZimletBase();
org_filesender_zimlink.prototype.constructor = org_filesender_zimlink;

var org_filesender_zimlink_instance;

// Initialization stage
org_filesender_zimlink.prototype.init = function() {
    org_filesender_zimlink_instance = this;
};

// Detect mail compose view display
org_filesender_zimlink.prototype.onShowView = function(view) {
    // Nothing to do if no HTML5 support
    if(!AjxEnv.supportsHTML5File) return;
    
    // Nothing to do except for mail compose view
    if(view.indexOf(ZmId.VIEW_COMPOSE) < 0) return;
    
    // Handle several compose views
    appCtxt.getCurrentView().org_filesender_zimlink = {files: [], use_filesender: null};
    
    // Replace original attachment handler with our own, keep the old one to call it when file is small enough
    var zimlet = this;
    var original_submit_attachments = appCtxt.getCurrentView()._submitMyComputerAttachments;
    appCtxt.getCurrentView()._submitMyComputerAttachments = function(files, node, isInline) {
        
        if(!files) files = node.files;
        
        // Accumulate files for size computation and potential sending
        for(var i=0; i<files.length; i++) this.org_filesender_zimlink.files.push(files[i]);
        
        // Compute size of all attached files
        var size = 0;
        for(i=0; i<this.org_filesender_zimlink.files.length; i++) {
            var file = this.org_filesender_zimlink.files[i];
            size += file.size || file.fileSize /*Safari*/ || 0;
        }
        
        // Check if max exceeded
        var max_size = appCtxt.get(ZmSetting.MESSAGE_SIZE_LIMIT);
        if(
            (max_size != -1 /* means unlimited */) &&
            (size > max_size)
        ) {
            if(!this.org_filesender_zimlink.use_filesender)
                zimlet.popUseFileSenderDlg();
            
        } else {
            // Max not exceeded, run zimbra attachment handler
            original_submit_attachments.apply(appCtxt.getCurrentView(), arguments);
        }
    }; 
    
    if(!appCtxt.getCurrentController().original_send_msg) {
        var original_send_msg = appCtxt.getCurrentController()._sendMsg;
        appCtxt.getCurrentController().original_send_msg = original_send_msg;
        appCtxt.getCurrentController()._sendMsg = function(attId, docIds, draftType, callback, contactId) {
            //get draftType to check if the mail is sent
            var isTimed = Boolean(this._sendTime);
            draftType = draftType || (isTimed ? ZmComposeController.DRAFT_TYPE_DELAYSEND : ZmComposeController.DRAFT_TYPE_NONE);
            var isScheduled = draftType == ZmComposeController.DRAFT_TYPE_DELAYSEND;
            var isDraft = (draftType != ZmComposeController.DRAFT_TYPE_NONE && !isScheduled);
            //If the mail is sent and filesender is used, then start the upload
            if(!isDraft && appCtxt.getCurrentView().org_filesender_zimlink.use_filesender) {
                //Store arguments in the controller to continue normal sending after the upload
                this.sendArguments = arguments;
                //Start upload
                org_filesender_zimlink_instance.upload();
            }
            //If not, continue normal sending
            else {
                original_send_msg.apply(appCtxt.getCurrentController(), arguments);
            }
        };
    }
};

// Ask user wether to use filesender
org_filesender_zimlink.prototype.popUseFileSenderDlg = function() {
    var dialog = this.makeDlg(
        this.getMessage('use_filesender_dlg_title'),
        {width: 300, height: 300},
        this.getMessage('use_filesender_dlg_label'),
        [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON]
    );
    
    this.setDialogButton(
        dialog,
        DwtDialog.OK_BUTTON,
        AjxMsg.yes,
        new AjxListener(this, function() {
            dialog.popdown();
            dialog.dispose();
            
            appCtxt.getCurrentView().org_filesender_zimlink.use_filesender = 'https://filesender-premium.renater.fr/';
            //appCtxt.getCurrentView().org_filesender_zimlink.use_filesender = this.getConfigProperty('serversUrlList');
            
            this.checkFileSenderAuthentication();
        }, dialog)
    );
    
    this.setDialogButton(
        dialog,
        DwtDialog.CANCEL_BUTTON,
        AjxMsg.no,
        new AjxListener(this, function() {
            dialog.popdown();
            dialog.dispose();
            
            org_filesender_zimlink.showSizeExceededError();
        })
    );
    
    dialog.popup();
};

// Data handler for user profile response (FileSender JSONP callback)
org_filesender_zimlink.prototype.filesender_user_profile_handler = function(profile) {
    if(!profile.remote_config) {
        this.showError('FileSender does not support remote user access');
        return;
    }
    
    var cfg = profile.remote_config.split('|');
    
    var zdata = appCtxt.getCurrentView().org_filesender_zimlink;
    zdata.remote_config = {url: cfg[0], uid: cfg[1], secret: cfg[2]};
    
    var auth_data = JSON.parse(this.getUserProperty('authentication_data'));
    
    if(!auth_data[zdata.use_filesender]) auth_data[zdata.use_filesender] = {};
    auth_data[zdata.use_filesender].remote_config = zdata.remote_config;
    
    this.setUserProperty('authentication_data', JSON.stringify(auth_data), true);
    
    this.getFileSenderQuota();
    
    this.fs_auth_dialog.popdown();
    this.fs_auth_dialog.dispose();
};

/*
 * Get info about filesender instance
 */
org_filesender_zimlink.prototype.getFileSenderInfo = function() {
    var zdata = appCtxt.getCurrentView().org_filesender_zimlink;
    
    var fs_url = zdata.use_filesender;
    if(fs_url.substr(-1) != '/') url += '/';
    var info_url = fs_url + 'rest.php/info';
    
    var proxyUrl = [ZmZimletBase.PROXY, AjxStringUtil.urlComponentEncode(info_url)].join('');
    
    var res = AjxRpc.invoke(null, proxyUrl, null, null, true);
    
    if(!res.success) {
        this.showError('Info getter error');
        return;
    }
    
    var info = JSON.parse(res.text);
    
    var cs = info.upload_chunk_size ? info.upload_chunk_size : (5 * 1024 * 1024);
    info.upload_chunk_size = cs;
    
    zdata.info = info;
    
    return info;
};

/*
 * Get user quota
 */
org_filesender_zimlink.prototype.getFileSenderQuota = function() {
    var data = this.sendActionToJsp(this.getJspUrl('get_quota'));
    
    if(!data || !data.success) {
        // Error
    }
    
    appCtxt.getCurrentView().org_filesender_zimlink.user_quota = data.response;
    
    return data.response;
};

// Check if we have authentication data for selected FileSender, get it if not
org_filesender_zimlink.prototype.checkFileSenderAuthentication = function() {
    var info = this.getFileSenderInfo();
    
    var zdata = appCtxt.getCurrentView().org_filesender_zimlink;
    var auth_data = JSON.parse(this.getUserProperty('authentication_data'));
    
    if(auth_data[zdata.use_filesender]) {
        // Auth data already known, attach and exit
        appCtxt.getCurrentView().org_filesender_zimlink.remote_config = auth_data[zdata.use_filesender];
        this.getFileSenderQuota();
        return;
    }
    
    var landing_url = fs_url + 'index.php#zimbra_binding';
    
    var user_url = fs_url + 'rest.php/user?callback=org_filesender_zimlink_instance.filesender_user_profile_handler';
    
    var domain = fs_url.match(/^(https?:\/\/[^/]+)/)[1];
    
    var logon_url = info.logon_url.match(/^\//) ? domain + info.logon_url : info.logon_url;
    
    var popup_url = logon_url.replace(/__target__/, AjxStringUtil.urlComponentEncode(landing_url));
    
    var dialog = this.makeDlg(
        this.getMessage('get_filesender_authentication_dlg_title'),
        {width: 400, height: 400},
        [
            this.getMessage('get_filesender_authentication_popup_label'),
            '<button id="org_filesender_zimlink_filesender_authentication_popup_btn">',
            this.getMessage('get_filesender_authentication_popup_button'),
            '</button>',
            this.getMessage('get_filesender_authentication_check_label'),
            '<button id="org_filesender_zimlink_filesender_authentication_check_btn">',
            this.getMessage('get_filesender_authentication_check_button),
            '</button>'
        ].join(''),
        [DwtDialog.CANCEL_BUTTON]
    );
    
    this.setDialogButton(
        dialog,
        DwtDialog.CANCEL_BUTTON,
        AjxMsg.cancel,
        new AjxListener(this, function() {
            dialog.popdown();
            dialog.dispose();
            
            org_filesender_zimlink.showSizeExceededError();
        })
    );
    
    dialog.popup();
    
    this.fs_auth_dialog = dialog;
    
    document.getElementById('org_filesender_zimlink_filesender_authentication_popup_btn').onclick = function() {
        org_filesender_zimlink_instance.authentication_popup = window.open(popup_url);
        return false;
    };
    
    document.getElementById('org_filesender_zimlink_filesender_authentication_check_btn').onclick = function() {
        var profile_script = document.createElement('script');
        this.parentNode.appendChild(profile_script);
        profile_script.src = user_url + '&_=' + (new Date()).getTime();
        
        return false;
    };
};

/*
 * In the Compose view, add the text in parameter at the end of the body, before the signature
 * Params:
 * downloadInfos : Array containing the filesender download link and expire date as String
 */
org_filesender_zimlink.prototype.addDownloadInfos = function(downloadInfos) {
	var controller = appCtxt.getCurrentController();
	var view = appCtxt.getCurrentView();
	var i = 0;
	//Original mail body
	var html = [view.getUserText()];
	//Add the download link and expiration date at the end of the body
	html[i++] = '<br>';
	html[i++] = this.getMessage('download_link_label') + downloadInfos.downloadLink;
	html[i++] = '<br>';
	html[i++] = this.getMessage('download_expire_date_label') + downloadInfos.expireDate;
	
	//Add params with keepAttachments to false to clean attachments
	var params = {
			keepAttachments: false,
			action:			controller._action,
			msg:			controller._msg,
			extraBodyText:	html.join('')
	};
	//Reset the body content
	view.resetBody(params);
};

/*
 * Start upload process
 */
org_filesender_zimlink.prototype.upload = function() {
    var transfer_data = this.createTransfer();
    
    console.log(transfer_data);
    
    transfer_data.file_idx = 0;
    transfer_data.file_offset = 0;
    
    appCtxt.getCurrentView().org_filesender_zimlink.transfer_data = transfer_data;
    
    this.uploadNext();
};

/*
 * Upload next chunk
 */
org_filesender_zimlink.prototype.uploadNext = function() {
    var tdata = appCtxt.getCurrentView().org_filesender_zimlink.transfer_data;
    var file = tdata.files[tdata.file_idx];
    
    this.uploadChunk(file.id, tdata.file_offset, file.blob, new AjxCallback(this, function(error) {
        if(error) {
            // TODO
            return;
        }
        
        tdata.file_offset += chunk_size;
        if(tdata.file_offset >= file.size) {
            // File complete
            var complete = this.sendActionToJsp(this.getJspUrl('complete_file', tdata.files[tdata.file_idx].id), {complete: true});
            if(!complete || !complete.success) {
                // TODO
                return;
            }
            
            tdata.file_offset = 0;
            tdata.file_idx++;
            
            if(tdata.file_idx >= tdata.files.length) {
                // Transfer complete
                var complete = this.sendActionToJsp(this.getJspUrl('complete_transfer', tdata.id), {complete: true});
                if(!complete || !complete.success) {
                    // TODO
                    return;
                }
                
                this.addDownloadInfos({
                    downloadLink: tdata.recipients[0].download_url,
                    expireDate: tdata.expires.formatted
                });
                
                // TODO call orig msg send
                
                return;
            }
        }
        
        this.uploadNext();
    }));
};

/*
 * Upload a chunk
 */
org_filesender_zimlink.prototype.uploadChunk = function(file_id, offset, blob, callback) {
    var chunk_size = appCtxt.getCurrentView().org_filesender_zimlink.info.upload_chunk_size;
    
    var slicer = blob.slice ? 'slice' : (blob.mozSlice ? 'mozSlice' : (blob.webkitSlice ? 'webkitSlice' : 'slice'));
    
    var blob = blob[slicer](offset, offset + chunk_size);
    
    var url = this.getJspUrl('upload_chunk', file_id, offset);
    
    this.sendBlob(url, blob, offset, chunk_size, callback);
};

/*
 * Create a transfer on selected filesender
 */
org_filesender_zimlink.prototype.createTransfer = function() {
    var transfer_data = {
        from: appCtxt.getActiveAccount().name,
        recipients: [],
        options: ['get_a_link'],
        files: []
    };
    
    var files = appCtxt.getCurrentView().org_filesender_zimlink.files;
    console.log(files);
    for(var i=0; i<files.length; i++) transfer_data.files.push({
        name: files[i].name,
        size: files[i].size,
        mime_type: files[i].type,
        cid: 'file_' + i
    });
    
    var data = this.sendActionToJsp(this.getJspUrl('create_transfer'), transfer_data);
    
    if(!data || !data.success) return false;
    
    transfer_data.id = data.response.id;
    
    for(var i=0; i<data.response.files.length; i++) {
        var idx = parseInt(data.response.files[i].cid.substr(5));
        transfer_data.files[idx].blob = files[idx];
    }
    
    for(var i=0; i<transfer_data.files.length; i++) {
        if(!transfer_data.files[i].blob) return false;
    }
    
    return transfer_data;
};

/*
 * Build an url for a request to org_filesender_zimlink.jsp
 * Params:
 * command : String containing the command to execute in org_filesender_zimlink.jsp
 * file_id : String containing the file id
 * transfert_id : String containing the transfert_id
 * offset : String containing the offset
 */
org_filesender_zimlink.prototype.getJspUrl = function(command, target_id, offset) {
    // retrieve the server config
    var zdata = appCtxt.getCurrentView().org_filesender_zimlink;
    var auth_data = JSON.parse(this.getUserProperty('authentication_data'));
    if(!auth_data[zdata.use_filesender]) return null;
    
    var remote_config = auth_data[zdata.use_filesender].remote_config;
    
    var enc = AjxStringUtil.urlComponentEncode;
    var args = [
        'command=' + command,
        'filesender_url=' + enc(remote_config.url),
        'uid=' + enc(remote_config.uid),
        'secret=' + enc(remote_config.secret)
    ].join('&');
    
    // add function parameters
    if(command == 'upload_chunk')
        args = [args, 'file_id=' + enc(target_id), 'offset=' + enc(offset)].join('&'); 
    
    if(command == 'complete_file')
        args = [args, 'file_id=' + enc(target_id)].join('&'); 
    
    if(command == 'complete_transfer')
        args = [args, 'transfer_id=' + enc(target_id)].join('&'); 
    
    return this.getResource('org_filesender_zimlink.jsp') + '?' + args;
}

/*
 * Send a request in json format to org_filesender_zimlink.jsp
 * Params:
 * url : String containing the url and the parameters
 * data : Object javascript containing the data to send
 */
org_filesender_zimlink.prototype.sendActionToJsp = function(url, data) {
    //Convert the javascript object into a String
    jsonData = data ? JSON.stringify(data) : null;
    
    //Create POST headers array
    var hdrs = {
        'Content-type': 'application/json',
        'Content-length': jsonData.length
    };
    
    //Send a synchronous request
    var resp = AjxRpc.invoke(jsonData, url, hdrs, null, false);
    
    if(!resp || !resp.success) return null;
    
    return JSON.parse(resp.text);
}

/*
 * Send a blob to org_filesender_zimlink.jsp
 * Params:
 * url : String containing the url and the parameters
 * file : File Object containing the data to send
 * offset : Integer containing the Offset of the blob
 * blocSize : Integer containing the block size from the filesender server
 * callBack : AjxCallBack function executed after the jsp response 
 */
org_filesender_zimlink.prototype.sendBlob = function(url, blob, callBack) {
    //Create the request
    var req = new XMLHttpRequest();
    req.open('POST', url , true);
    req.setRequestHeader('Cache-Control', 'no-cache');
    req.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    req.setRequestHeader('Content-Type', 'application/octet-stream');
    
    //Send the result to the callBack function
    req.onreadystatechange = function() {
        if(req.readyState != 4) return; // Not a progress update
        
        if(req.status == 200) { // All went well
            callback.run();
            
        }else if(xhr.status == 0) { // Request cancelled (browser refresh or such)
            // TODO
            
        }else{
            // We have an error
            var msg = req.responseText.replace(/^\s+/, '').replace(/\s+$/, '');
            var error = {message: msg};
            
            try {
                error = JSON.parse(msg);
            } catch(e) {}
            
            callback(error);
        }
    };
    
    //Send the blob
    req.send(blob);
}


/*
 * Generic function to create a dialog box
 * Params :
 * title : String containing the title of the dialog box
 * size : Array with the params width and height to set the size of the dialog box
 * content : String containing the html inserted in the dialog box
 * listenerYes : Listener object for the Yes button 
 * listenerNo : Listener object for the No button 
 * standardButtons : Array with the list of standardButtons (possible value is DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON or both).
 * 
 * call example : filesenderZimlet.makeDlg('title', {width:300,height:300}, 'content', [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON])
 */
org_filesender_zimlink.prototype.makeDlg = function(title, size, content, standardButtons) {
    //Create the frame
    var view = new DwtComposite(this.getShell());
    view.setSize(size.width, size.height);
    view.getHtmlElement().style.overflow = 'auto';
    //Add html content in the frame
    view.getHtmlElement().innerHTML = content;

    //pass the title, view and buttons information and create dialog box
    var dialog = this._createDialog({title:title, view:view, standardButtons: standardButtons});
    
    return dialog;
};

/*
 * Customize a ZmDialog button
 * Params :
 * dialog : ZmDialog object
 * buttonId : String containing the id of the button (ex: DwtDialog.OK_BUTTON)
 * text : String containing the displayed text of the button
 * listener : AjxListener object to add to the button
 */
org_filesender_zimlink.prototype.setDialogButton = function(dialog, buttonId, text, listener) {
    var button = dialog.getButton(buttonId);
    button.setText(text);
    dialog.setButtonListener(buttonId, listener);
}

/*
 * Generic function to show an error message
 * Params:
 * msg : String containing the msg in html format to display
 */
org_filesender_zimlink.prototype.showError = function(msg) {
    var msgDlg = appCtxt.getMsgDialog();
    msgDlg.setMessage(msg, DwtMessageDialog.CRITICAL_STYLE);
    msgDlg.popup();
};

// Popup size exceeded error
org_filesender_zimlink.showSizeExceededError = function() {
    var msgDlg = appCtxt.getMsgDialog();
    var errorMsg = AjxMessageFormat.format(ZmMsg.attachmentSizeError, AjxUtil.formatSize(appCtxt.get(ZmSetting.MESSAGE_SIZE_LIMIT)));
    msgDlg.setMessage(errorMsg, DwtMessageDialog.WARNING_STYLE);
    msgDlg.popup();
};

/*
 * Generic function to show an error message for the files upload, and unlock the composeView
 * Params:
 * msg : String containing the msg in html format to display
 */
org_filesender_zimlink.prototype.showEndUploadError = function(msg) {
    this.showError(msg);
    appCtxt.getCurrentController()._toolbar.enableAll(true);
};


