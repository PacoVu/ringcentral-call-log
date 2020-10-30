//var canPoll = false
function init(){
  /*
  var jsonObj = JSON.parse(window.sendReport)
  if (jsonObj.sendInProgress){
    $("#progress").toggleClass("show")
    $("#control_panel").css('display', 'block');
    disableInputs(true)
    pollResult()
  }
  */
  $( "#fromdatepicker" ).datepicker({ dateFormat: "yy-mm-dd"});
  $( "#todatepicker" ).datepicker({dateFormat: "yy-mm-dd"});
  var pastMonth = new Date();
  var day = pastMonth.getDate()
  var month = pastMonth.getMonth() - 1
  var year = pastMonth.getFullYear()
  if (month < 0){
    month = 11
    year -= 1
  }
  $( "#fromdatepicker" ).datepicker('setDate', new Date(year, month, day));
  $( "#todatepicker" ).datepicker('setDate', new Date());
}

function readCallLogs(){
  //disableInputs(true)
  /*
  $("#fromdatepicker").prop("disabled", true);
  $("#todatepicker").prop("disabled", true);
  $("#readcalllogs").prop("disabled", true);
  */
  var configs = {}
  configs['dateFrom'] = $("#fromdatepicker").val() + "T00:00:00.001Z"
  var gmtTime = $("#todatepicker").val()
  //alert(gmtTime)
  //return
  configs['dateTo'] = $("#todatepicker").val() + "T23:59:59.999Z"
  if ($('#extensionids') != undefined) {
    configs['extensionList'] = JSON.stringify($('#extensionids').val());
  }else{
    configs['extensionList'] = [];
  }
  configs['view'] = $("#view").val()
  configs['attachments'] = JSON.stringify($('#attachments').val());
  //return alert (JSON.stringify(configs))
  var url = "readlogs"
  var posting = $.post( url, configs );
  disableInputs(true)
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status != "ok") {
      alert(res.calllog_error)
    }else{
      //$("#progress").toggleClass("show")
      //$("#readingAni").css('display', 'inline');
      pollResult()
      //window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText);
  });
}

function pollResult(){
  var url = "pollresult"
  var getting = $.get( url );
  // = true
  getting.done(function( res ) {
    if (res.readInProgress || res.downloadBinaryInProgress) {
      window.setTimeout(function(){
        //if (canPoll)
          pollResult()
      }, 1000)
    }else{
      disableInputs(false)
    }
    $("#info").html(res.readInfo)
    $("#records-count").html("Read " + res.recordsCount + " records.")
    $("#attachments-count").html("Download " + res.attachmentCount + " attachments." )
  });
}

function disableInputs(flag){
  //$("#readcalllogs").prop("disabled", flag);
  $("#fromdatepicker").prop("disabled", flag);
  $("#todatepicker").prop("disabled", flag);
  $("#readcalllogs").prop("disabled", flag);
  $("#progress").css("display", "block")

  if (flag){
    //$("#progress").toggleClass("show")

    $("#readingAni").css('display', 'inline');
    //$("#download_json").toggleClass("hide")
    $("#download_csv").css('display', 'none');
  }else{
    //$("#progress").toggleClass("hide")
    //$("#progress").css("display", "none")
    $("#readingAni").css('display', 'none');
    //$("#download_json").toggleClass("show")
    $("#download_csv").css('display', 'block');
  }
}


function downloadCallLog(format){
  var url = "downloadcalllog?format="+format
  var getting = $.get( url );
  getting.done(function( res ) {
    if (res.status == "ok")
      window.location.href = res.message
    else
      alert(res.message)
  });
}
function logout(){
  window.location.href = "index?n=1"
}

function openWindow(){
  window.open("https://github.com/PacoVu/ringcentral-send-tollfree-sms/issues")
}
function openFeedbackForm(){
  var message = $('#send_feedback_form');
  BootstrapDialog.show({
      title: '<div style="font-size:1.2em;font-weight:bold;">Send us your feedback!</div><div>Do you have a suggestion or found some bugs? Let us know in the field below:</div>',
      message: message,
      draggable: true,
      onhide : function(dialog) {
        $('#hidden-div-feedback').append(message);
      },
      buttons: [{
        label: 'Close',
        action: function(dialog) {
          dialog.close();
        }
      }, {
        label: 'Send Feedback',
        cssClass: 'btn btn-primary',

        action: function(dialog) {
          var params = {
            user_name: window.userName,
            emotion: $('input[name=emoji]:checked').val(),
            type: $("#feedback_type").val(),
            message: $("#free_text").val()
          }
          if (submitFeedback(params))
            dialog.close();
        }
      }]
  });
  return false;
}

function submitFeedback(params){
  var url = "sendfeedback"
  var posting = $.post( url, params );
  posting.done(function( res ) {
    if (res.status == "ok"){
      alert(res.message)
    }else
      alert(res.message)
  });
  return true
}

function fileSelected(elm, index){
  var file = elm.files[0]
  if (file) {
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = function(e) {
      var numbers = e.target.result.trim().split("\r\n")
      numbers.shift()
      $("#to-numbers_" + index).val(numbers.join("\r\n"));
    };
  }
}

var group = 1
function addRecipientGroup(){
  group++
  var groupIndex = $("#group_index").val() + "_" + group
  $("#group_index").val(groupIndex)
  var newGroup = '<div id="g_'+ group + '" class="group_block"><img class="corner" src="./img/close.png" onclick="removeMe(\'g_' + group + '\',' + group + ')"></img><div><label class="label-input">To numbers</label><textarea rows="6" cols="16" id="to-numbers_' + group + '" name="recipients_' + group + '" placeholder="+11234567890&#10;+14087654322&#10;+16501234567" class="form-control text-input" required></textarea>&nbsp;<input type="file" style="display: inline; width: 200px" onchange="fileSelected(this, ' + group + ');"></input></div><label class="label-input" for="message">Message</label><textarea rows="4" cols="50" name="message_' + group + '" class="form-control text-input" required></textarea></div>'
  $("#groups").append(newGroup);
}

function removeMe(block, index){
  $("#"+block).remove()
  var indexes = $("#group_index").val().split("_")
  var groupIndex = indexes.filter(function(e) { return e !== index.toString() })
  var indexesString = groupIndex.join("_")
  $("#group_index").val(indexesString)
}
