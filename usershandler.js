var RC = require('ringcentral')
var fs = require('fs')
var https = require('https');
var zipper = require('zip-local');
const Path = require('path');
var async = require("async");
const RCPlatform = require('./platform.js')
require('dotenv').load()

function User(id, mode) {
  this.id = id;
  this.extensionId = 0;
  this.accountId = 0;
  this.userName = ""
  this.isAdmin = false
  this.extensionList = []
  this.startTime = 0
  this.readReport = {
    readInProgress: false,
    readInfo: "",
    recordsCount: ""
  }
  this.mainCompanyNumber = ""
  this.callRecords = []
  this.downloadPath = ""
  this.rc_platform = new RCPlatform(this, mode)

  return this
}

var engine = User.prototype = {
    setExtensionId: function(id) {
      this.extensionId = id
    },
    setUserName: function (userName){
      this.userName = userName
    },
    getUserId: function(){
      return this.id
    },
    getExtensionId: function(){
      return this.extensionId
    },
    getUserName: function(){
      return this.userName;
    },
    getPlatform: function(){
      return this.rc_platform.getSDKPlatform()
    },
    loadMainPage: function(req, res){
      //this.readA2PSMSPhoneNumber(res)
      var extensionList = [
        {
          id: "112121212",
          fullName: "Phong Vu"
        },
        {
          id: "341414343",
          fullName: "John Wang"
        }
      ]
      res.render('main', {
          userName: this.getUserName(),
          extensionList: JSON.stringify(extensionList),
          userLevel: "admin"
      })

    },
    login: function(req, res, callback){
      var thisReq = req
      if (req.query.code) {
        console.log("CALL LOGIN FROM USER")
        var rc_platform = this.rc_platform
        var thisUser = this
        rc_platform.login(req.query.code, function (err, extensionId){
          if (!err){
            thisUser.setExtensionId(extensionId)
            req.session.extensionId = extensionId;
            thisUser.savedPath = `downloads/${extensionId}/`
            if(!fs.existsSync(thisUser.savedPath)){
              fs.mkdirSync(thisUser.savedPath)
            }
            rc_platform.getPlatform(function(err, p){
                if (p != null){
                  p.get('/account/~/extension/~/')
                    .then(function(response) {
                      var jsonObj = response.json();
                      //console.log(JSON.stringify(jsonObj))
                      if (jsonObj.permissions.admin.enabled){
                        thisUser.isAdmin = true
                      }
                      thisUser.accountId = jsonObj.account.id
                      var fullName = jsonObj.contact.firstName + " " + jsonObj.contact.lastName
                      thisUser.setUserName(fullName)
                      callback(null, extensionId)
                      res.send('login success');
                    })
                    .catch(function(e) {
                      console.log("Failed")
                      console.error(e);
                      res.send('login success');
                      callback("error", e.message)
                    });
                }else{
                  console.log("CANNOT LOGIN")
                  res.send('login success');
                  callback("error", thisUser.extensionId)
                }
            })
          }else {
            console.log("USER HANDLER ERROR: " + thisUser.extensionId)
            res.send('login success');
            callback("error", thisUser.extensionId)
          }
        })
      } else {
        res.send('No Auth code');
        callback("error", null)
      }
    },
    getAccountExtensions: function (){
      var endpoint = '/account/~/extension'
      var params = {
          status: "Enabled",
          type: "User",
          perPage: 1000
      }

      var thisUser = this
      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          p.get(endpoint, params)
            .then(function(resp){
              var json = resp.json()
              var extensionList = []
              for (var record of json.records){
                var item = {}
                item['id'] = record.id
                item['extNum'] = record.extensionNumber.toString()
                item['fullName'] = record.contact.firstName + " " + record.contact.lastName
                //console.log(item.fullName)
                extensionList.push(item)
              }
              thisUser.setUserExtensionList(extensionList)
            })
            .catch(function(e){
              throw e
            })
        }
        console.log("DONE getAccountExtensions")
      })
    },
    pollReadCallLogResult: function(req, res){
      console.log(this.readReport)
      res.send(this.readReport)
    },
    readAccountCallLog: function(req, res){
      var thisRes = res
      var thisUser = this

      var params = {
        view: req.body.view,
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo,
        showBlocked: true,
        perPage: 1000
      }
      // return and poll for result
      thisUser.readReport.readInProgress = true
      thisUser.readReport.readInfo =  "Reading first page"
      thisUser.readReport.recordsCount = 0

      var jsonFile = `${thisUser.savedPath}${this.getExtensionId()}.json`
      if (fs.existsSync(jsonFile))
        fs.unlinkSync(jsonFile)

      var recordingPath = `${thisUser.savedPath}recordings`
      if (fs.existsSync(recordingPath)) {
        fs.readdirSync(recordingPath).forEach((file, index) => {
          const curPath = Path.join(recordingPath, file);
          fs.unlinkSync(curPath);
        });
      }
      var zipFile = "CallLog_"+this.getExtensionId() + ".zip"
      if (fs.existsSync(zipFile))
        fs.unlinkSync(zipFile)
      res.send('{"status":"ok"}')

      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          thisUser.startTime = Date.now()
          var endpoint = '/account/~/extension/~/call-log'
          if (thisUser.isAdmin)
            endpoint = '/account/~/call-log'
          p.get(endpoint, params)
              .then(function (resp) {
                var jsonObj = resp.json()
                thisUser.readReport.readInProgress = true
                thisUser.readReport.readInfo =  "Reading first page"
                thisUser.readReport.recordsCount = jsonObj.records.length
                thisUser.parseCallRecords(p, jsonObj.records)
                var navigationObj = resp.json().navigation
                if (navigationObj.hasOwnProperty("nextPage")){
                  thisUser.readCallLogNextPage(navigationObj.nextPage.uri)
                }else{
                  thisUser.readReport.readInProgress = false
                  thisUser.readReport.readInfo =  "Reading done!"
                  console.log("DONE - no next page")
                  var fullNamePath = thisUser.savedPath + thisUser.getExtensionId() + '.json'
                  var fileContent = JSON.stringify(thisUser.callRecords)
                  //console.log(fullNamePath)
                  //console.log(fileContent)
                  thisUser.callRecords = []
                  try{
                    fs.writeFileSync(fullNamePath, fileContent)
                  }catch(e){
                    console.log("cannot write file")
                  }
                }
              });
        }
      })
    },
    readCallLogNextPage: function(url){
      var thisUser = this
      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          p.get(url)
            .then(function (resp) {
              var jsonObj = resp.json()
              thisUser.readReport.readInProgress = true
              thisUser.readReport.readInfo =  "Reading next page"
              thisUser.readReport.recordsCount += jsonObj.records.length
              thisUser.parseCallRecords(p, jsonObj.records)
              var jsonObj = resp.response().headers
              var limit = parseInt(jsonObj['_headers']['x-rate-limit-limit'][0])
              var limitRemaining = parseInt(jsonObj['_headers']['x-rate-limit-remaining'][0])
              var limitWindow = parseInt(jsonObj['_headers']['x-rate-limit-window'][0])
              console.log("limitRemaining: " + limitRemaining)
              var navigationObj = resp.json().navigation
              if (navigationObj.hasOwnProperty("nextPage")){
                var delayInterval = 100
                if (limitRemaining == 0){
                    console.log("No remaining => calculate waiting time")
                    var now = Date.now()
                    var diff = now - thisUser.startTime
                    delayInterval = (limitWindow / limit) * 1000
                    thisUser.startTime = now + delayInterval
                }
                console.log("Read next page after " + delayInterval + " milliseconds")
                setTimeout(function(){
                    thisUser.readCallLogNextPage(navigationObj.nextPage.uri)
                }, delayInterval)
              }else{
                console.log("DONE - no more next page")
                thisUser.readReport.readInProgress = false
                thisUser.readReport.readInfo =  "Reading done!"
                var fullNamePath = thisUser.savedPath + thisUser.getExtensionId() + '.json'
                var fileContent = JSON.stringify(thisUser.callRecords)
                thisUser.callRecords = []
                try{
                  fs.writeFileSync(fullNamePath, fileContent)
                }catch(e){
                  console.log("cannot write file")
                }
              }
            });
        }
      })
    },
    parseCallRecords: function(p, records){
      var thisUser = this
      async.each(records,
        function(record, callback){
          thisUser.callRecords.push(record)
          if (record.hasOwnProperty("recording")){
            // download binary content to local file
            thisUser.saveBinaryFile(p, "recordings", record.recording.id, record.recording.contentUri)
          }
          callback(null, null)
        },
        function (err){
          console.log("Done block")
          return
        }
      )
    },
    saveBinaryFile: function(p, type, id, contentUri){
      console.log("saveBinaryFile")
      var dir = this.savedPath + type + "/"
      if(!fs.existsSync(dir)){
        fs.mkdirSync(dir)
      }
      var thisUser = this
      var uri = p.createUrl(contentUri, {addToken: true});
      var fullNamePath = dir + id + '.mp3'
      console.log(fullNamePath)
      this.download(uri, fullNamePath, function(){
        console.log("Save file to the local machine. " + fullNamePath)
      })
    },
    download: function(uri, dest, cb) {
      var file = fs.createWriteStream(dest);
      var request = https.get(uri, function(response) {
          response.pipe(file);
          file.on('finish', function() {
              file.close(cb);
          });
      });
    },
    downloadCallLog: function(req, res){

      //var fullNamePath = this.savedPath + this.getExtensionId() + '.json'
      //var fileContent = JSON.stringify(this.callRecords)
      try{
        //fs.writeFileSync('./'+ fullNamePath, fileContent)

        var zipFile = "CallLog_"+this.getExtensionId() + ".zip"
        zipper.sync.zip("./"+this.savedPath).compress().save(zipFile);

        var link = "/downloads?filename=" + zipFile
        res.send({"status":"ok","message":link})
        /*
        console.log("unlink")
        var jsonFile = `${this.savedPath}${this.getExtensionId()}.json`
        if (fs.existsSync(jsonFile))
          fs.unlinkSync(jsonFile)

        var recordingPath = `${this.savedPath}recordings`
        if (fs.existsSync(recordingPath)) {
          fs.readdirSync(recordingPath).forEach((file, index) => {
            const curPath = Path.join(recordingPath, file);
            fs.unlinkSync(curPath);
          });
        }
        */
      }catch (e){
        console.log("cannot create download file")
        res.send({"status":"failed","message":"Cannot create a call log file! Please try gain"})
      }
    },

    readExtensionCallLog: function(body, extList, res){
      var ext = extList[this.extIndex]
      var endpoint = '/account/~/extension/'+ ext.id +'/call-log'
      var thisBody = body
      var thisRes = res
      var thisUser = this

      var params = {
        view: "Detailed",
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        showBlocked: true,
        perPage: 1000
      }

      var p = thisUser.rc_platform.getPlatform()
      var table = thisUser.getUserTable()

      var companyPhoneNumber = thisUser.getMainCompanyNumber()

      async.waterfall([
          this._function(p, res, endpoint, params, table, companyPhoneNumber, extList, ext.id)
        ], function (error, success) {
            if (error) {
              console.log('Something is wrong!');
            }
            thisUser.extIndex++
            if (thisUser.extIndex < extList.length){
              setTimeout(function(){
                thisUser.readExtensionCallLog(body, extList, res)
              }, 1000)
            }else{
              console.log('Done read call log!');
              thisUser.extIndex = 0
              thisRes.send('{"status":"ok"}')
            }
        });
    },
    _function: function(p, res, endpoint, params, table, companyPhoneNumber, extensionList, extensionId) {
      var thisRes = res
      return function (callback) {
        p.get(endpoint, params)
          .then(function(resp){
            var json = resp.json()
            //console.log("REC LEN: " + json.records.length)
            if (json.records.length == 0){
              return callback (null, json);
            }
            async.each(json.records,
              function(record, callback0){
                //console.log("RECORD: " + JSON.stringify(record))
                var item = {}
                if (record.hasOwnProperty("message") && record.message.type == "VoiceMail"){
                  item['call_type'] = "VM"
                  item['uid'] = record.message.id
                  var recordingUrl = record.message.uri.replace("platform", "media")
                  recordingUrl += "/content/" + record.message.id
                  item['recording_url'] = recordingUrl
                }else if (record.hasOwnProperty("recording")){
                  item['call_type'] = "CR"
                  item['uid'] = record.recording.id
                  item['recording_url'] = record.recording.contentUri
                }else {
                  //console.log("NO CR/VM")
                  return callback0(null, null)
                }
                // CR and VM has the same 'from' and 'to' data structure
                if (record.hasOwnProperty('to')){
                  if (record.to.hasOwnProperty('phoneNumber'))
                    item['to_number'] = record.to.phoneNumber
                  else if (record.to.hasOwnProperty('extensionNumber'))
                    item['to_number'] = companyPhoneNumber + "*" + record.to.extensionNumber
                  else
                    item['to_number'] = "Unknown #"
                  if (record.to.hasOwnProperty('name'))
                    item['to_name'] = record.to.name
                  else
                    item['to_name'] = "Unknown"
                }else{
                  item['to_number'] = "Unknown #"
                  item['to_name'] = "Unknown"
                }

                if (record.hasOwnProperty('from')){
                  if (record.from.hasOwnProperty('phoneNumber'))
                    item['from_number'] = record.from.phoneNumber
                  else if (record.from.hasOwnProperty('extensionNumber'))
                    item['from_number'] = companyPhoneNumber + "*" + record.from.extensionNumber
                  else
                    item['from_number'] = "Unknown #"
                  if (record.from.hasOwnProperty('name'))
                    item['from_name'] = record.from.name
                  else
                    item['from_name'] = "Unknown"
                }else{
                  item['from_number'] = "Unknown #"
                  item['from_name'] = "Unknown"
                }
                item['call_date'] = new Date(record.startTime).getTime() - (8*3600*1000)
                item['processed'] = false
                item['rec_id'] = record.id
                item['duration'] = record.duration
                item['direction'] = (record.direction == "Inbound") ? "In" : "out"
                item['extension_id'] = extensionId
                for (var ext of extensionList){
                  for (var leg of record.legs){
                    if (leg.hasOwnProperty('extension')){
                      if (ext.id == leg.extension.id){
                        item['extension_num'] = ext.extNum
                        item['full_name'] = ext.fullName
                        break
                      }
                      break
                    }
                  }
                }
                //console.log(JSON.stringify(item))
                var query = "INSERT INTO " + table
                query += "(uid, rec_id, call_date, call_type, extension_id, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions, subject)"
                query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,$28,$29,$30,$31)"
                var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","","",""]
                query += " ON CONFLICT DO NOTHING"
                pgdb.insert(query, values, (err, result) =>  {
                  if (err)
                    console.error("INSERT ERR: " + err.message);
                  // create index
                  var q = "CREATE INDEX " + table + "_fts_ind ON " + table + " USING gin (to_tsvector('simple', string))"
                  return callback0(null, result)
                })
              },
              function (err){
                return callback (null, json);
              })
            })
            .catch(function(e){
              var errorRes = {}
              var err = e.toString();
              if (err.includes("ReadCompanyCallLog")){
                errorRes['calllog_error'] = "You do not have admin role to access account level. You can choose the extension access level."
                thisRes.send(JSON.stringify(errorRes))
              }else{
                errorRes['calllog_error'] = "Cannot access call log."
                thisRes.send(JSON.stringify(errorRes))
              }
              console.log(err)
            })
       }
    },
    logout: function(req, res, callback){
      console.log("LOGOUT FUNC")
      var p = this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          p.logout()
            .then(function (token) {
              console.log("logged out")
              //p.auth().cancelAccessToken()
              //p = null
              callback(null, "ok")
            })
            .catch(function (e) {
              console.log('ERR ' + e.message || 'Server cannot authorize user');
              callback(e, e.message)
            });
        }else{
          callback(null, "ok")
        }
      })
    },
    postFeedbackToGlip: function(req){
      post_message_to_group(req.body, this.mainCompanyNumber, this.accountId)
    }
}
module.exports = User;

function readRecipientFile(fileName){
  var currentFolder = process.cwd();
  var tempFile = currentFolder + "/uploads/" + fileName
  var content = fs.readFileSync(tempFile, 'utf8');
  content = content.trim();
  var recipientsFromFile = content.split("\n")
  if (typeof(recipientsFromFile[0]) != "number"){
    console.log(recipientsFromFile[0])
    recipientsFromFile.shift() // remove the first column which is the col name
  }
  console.log("=============")
  //fs.unlinkSync(tempFile);
  return recipientsFromFile
}
/*
function getBatchReport(batchId, pageToken, callback){
  console.log("getBatchReport")
  var endpoint = "/account/~/a2p-sms/messages?batchId=" + batchId
  if (pageToken != "")
    endpoint += "&pageToken=" + pageToken
  console.log(endpoint)
  platform.get(endpoint)
    .then(function (resp) {
        var jsonObj = resp.json()
        //console.log(JSON.stringify(jsonObj))
        for (var message of jsonObj.messages){
          //console.log(message)
          //console.log("========")
          if (message.messageStatus.toLowerCase() == "queued")
            queuedCount++
          else if (message.messageStatus.toLowerCase() == "sent")
            sentCount++
          else if (message.messageStatus.toLowerCase() == "delivered")
            deliveredCount++
          else if (message.messageStatus.toLowerCase() == "delivery_failed"){
            deliveredFailedCount++
          }else if (message.messageStatus.toLowerCase() == "sending_failed"){
            sendingFailedCount++
          }else{
            unknownCount++
          }
        }
        console.log(jsonObj.paging)
        if (jsonObj.paging.hasOwnProperty("nextPageToken")){
          console.log("Read next page")
          setTimeout(function(){
            getBatchReport(batchId, jsonObj.paging.nextPageToken, callback)
          }, 2000)
        }else{
          console.log("Send 10DCL SMS test completed:")
          if (sentCount > 0)
            console.log("Sent count: " + sentCount)
          if (queuedCount > 0)
            console.log("Queued count: " + queuedCount)
          if (deliveredCount > 0)
            console.log("Delivered count: " + deliveredCount)
          if (deliveredFailedCount > 0)
            console.log("DeliveredFailed count: " + deliveredFailedCount)
          if (sendingFailedCount > 0)
            console.log("SendingFailed count: " + sendingFailedCount)
          console.log("=================")
          callback(null, )
        }
    })
    .catch(function (e) {
        console.log('ERR ' + e.message || 'Server cannot send messages');
    });
}
*/

function formatSendingTime(processingTime){
  var hour = Math.floor(processingTime / 3600)
  hour = (hour < 10) ? "0"+hour : hour
  var mins = Math.floor((processingTime % 3600) / 60)
  mins = (mins < 10) ? "0"+mins : mins
  var secs = Math.floor(((processingTime % 3600) % 60))
  secs = (secs < 10) ? "0"+secs : secs
  return `${hour}:${mins}:${secs}`
}
function formatEstimatedTimeLeft(timeInSeconds){
  var duration = ""
  if (timeInSeconds > 3600){
    var h = Math.floor(timeInSeconds / 3600)
    timeInSeconds = timeInSeconds % 3600
    var m = Math.floor(timeInSeconds / 60)
    m = (m>9) ? m : ("0" + m)
    timeInSeconds = Math.floor(timeInSeconds % 60)
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return h + ":" + m + ":" + s
  }else if (timeInSeconds > 60){
    var m = Math.floor(timeInSeconds / 60)
    timeInSeconds = Math.floor(timeInSeconds %= 60)
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return m + ":" + s
  }else{
    var s = (timeInSeconds>9) ? timeInSeconds : ("0" + timeInSeconds)
    return "0:" + s
  }
}

function formatPhoneNumber(phoneNumberString) {
  var cleaned = ('' + phoneNumberString).replace(/\D/g, '')
  var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  if (match) {
    var intlCode = (match[1] ? '+1 ' : '')
    return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  }
  return phoneNumberString
}

function post_message_to_group(params, mainCompanyNumber, accountId){
  //webhook_url_v1 = "https://hooks.glip.com/webhook/ab875aa6-8460-4be2-91d7-9119484b4ed3"
  //webhook_url_v2 = "https://hooks.glip.com/webhook/v2/ab875aa6-8460-4be2-91d7-9119484b4ed3"
  var https = require('https');
  var message = params.message + "\n\nUser main company number: " + mainCompanyNumber
  message += "\nUser account Id: " + accountId
  message += "\nSalesforce lookup: https://rc.my.salesforce.com/_ui/search/ui/UnifiedSearchResults?str=" + accountId
  message += "\nAI admin lookup: https://admin.ringcentral.com/userinfo/csaccount.asp?user=XPDBID++++++++++" + accountId + "User"
  var body = {
    "icon": "http://www.qcalendar.com/icons/" + params.emotion + ".png",
    "activity": params.user_name,
    "title": "SMS Toll-Free app user feedback - " + params.type,
    "body": message
  }
  var post_options = {
      host: "hooks.glip.com",
      path: "/webhook/ab875aa6-8460-4be2-91d7-9119484b4ed3",
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      }
  }
  var post_req = https.request(post_options, function(res) {
      var response = ""
      res.on('data', function (chunk) {
          response += chunk
      });
      res.on("end", function(){
        console.log(response)
      });
  });
  //console.log(data)
  post_req.write(JSON.stringify(body));
  post_req.end();
}
