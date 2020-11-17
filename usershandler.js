var RC = require('ringcentral')
var fs = require('fs')
var https = require('https');
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
    status: "ok",
    readInProgress: false,
    downloadBinaryInProgress: false,
    readInfo: "",
    timeElapse: 0,
    recordsCount: 0,
    rowsCount: 0,
    attachmentCount: 0,
    downloadCount: 0
  }
  this.readCallLogParams = {
    view:"Simple",
    dateFrom: "",
    dateTo:"",
    perPage: 500,
    attachments: []
  }
  this.mainCompanyNumber = ""
  this.csvContent = ""
  this.appendFile = false
  this.recordingUrls = []
  this.voicemailUrls = []
  this.attachmentUrls = []
  this.savedPath = ""
  this.lastReadDateRange = ""
  this.timeOffset = 0
  this.viewMode = "Simple"
  this.attachments = []
  this.downloadLink = ""
  this.maxBlock = 0
  this.downloadRecording = false
  this.downloadVoicemail = false
  this.download.attachment = false
  this.rc_platform = new RCPlatform(this, mode)
  this.timing = 0
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
      var extensionList = []
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
            //callback(null, extensionId)
            //res.send('login success');
            rc_platform.getPlatform(function(err, p){
                if (p != null){
                  p.get('/account/~/extension/~/')
                    .then(function(response) {
                      var jsonObj = response.json();
                      //console.log(JSON.stringify(jsonObj))
                      thisUser.accountId = jsonObj.account.id
                      var fullName = (jsonObj.contact.hasOwnProperty("firstName")) ? `${jsonObj.contact.firstName} ` : ""
                      fullName += (jsonObj.contact.hasOwnProperty("lastName")) ? jsonObj.contact.lastName : ""
                      thisUser.setUserName(fullName)
                      thisUser.extensionList = []
                      if (jsonObj.permissions.admin.enabled){
                        thisUser.isAdmin = true
                        //thisUser.getAccountExtensions("")

                        thisUser.getAccountExtensions("", (err, result) =>{
                          callback(null, extensionId)
                          res.send('login success');
                        })

                      }else{
                        /*
                        var item = {}
                        item['id'] = jsonObj.id
                        item['name'] =`${jsonObj.extensionNumber} - ${fullName}`
                        thisUser.extensionList.push(item)
                        */
                        //thisUser.getAccountExtensions("")

                        thisUser.getAccountExtensions("", (err, result) =>{
                          callback(null, extensionId)
                          res.send('login success');
                        })

                        //callback(null, extensionId)
                        //res.send('login success');
                      }
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
    getAccountExtensions: function (uri, callback){
    //getAccountExtensions: function (uri){
      var endpoint = '/account/~/extension'
      var params = {
          //status: "Enabled",
          //type: "User",
          perPage: 1000
      }

      if (uri != ""){
        endpoint = uri
        params = {}
      }

      var thisUser = this
      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          p.get(endpoint, params)
            .then(function(resp){
              var jsonObj = resp.json()
              //console.log(jsonObj)
              var extensionList = []
              for (var record of jsonObj.records){
                var site = {name: `Ext. Num: ${record.extensionNumber}`, code: `Ext. Id: ${record.id}`}
                if (record.hasOwnProperty('site'))
                  site = record.site
                var name = record.hasOwnProperty('contact') ? `${record.contact.firstName} ${record.contact.lastName}` : "Unknown"
                var item = {
                  id: record.id,
                  name: `${record.extensionNumber} - ${name}`,
                  site: site
                }
                //item['id'] = record.id,
                //item['name'] =`${record.extensionNumber} - ${record.contact.firstName} ${record.contact.lastName}`
                thisUser.extensionList.push(item)
              }
              if (jsonObj.navigation.hasOwnProperty("nextPage"))
                thisUser.getAccountExtensions(jsonObj.navigation.nextPage.uri, callback)
                //thisUser.getAccountExtensions(jsonObj.navigation.nextPage.uri)
              else{
                jsonObj = null
                console.log("COMPLETE getAccountExtensions")
                //for (var item of thisUser.extensionList)
                //  console.log(item.id)
                console.log(thisUser.extensionList.length)
                callback(null, "readAccountExtensions: DONE")
              }
            })
            .catch(function(e){
              console.log(e.message)
              callback(null, "readAccountExtensions: DONE")
            })
        }else{
          console.log("DONE getAccountExtensions")
          callback(null, "readAccountExtensions: DONE")
        }
      })
    },
    pollReadCallLogResult: function(req, res){
      console.log(this.readReport)
      /*
      if (this.readReport.downloadCount == this.readReport.attachmentCount){
        console.log("all files are downloaded")
        this.readReport.readInProgress = false
      }
      */
      res.send(this.readReport)
    },
    readAccountCallLog: function(req, res){
      var thisUser = this
      this.viewMode = req.body.view
      this.timeOffset = parseInt(req.body.timeOffset)
      //console.log(this.timeOffset)
      var attachments = JSON.parse(req.body.attachments)
      this.downloadRecording = false
      this.downloadVoicemail = false
      this.downloadAttachements = false
      for (var att of attachments){
        if (att == "recordings")
          this.downloadRecording = true
        else if (att == "voicemail")
          this.downloadVoicemail = true
        else if (att == "faxes")
          this.downloadAttachements = true
      }

      this.readCallLogParams = {
        view: req.body.view,
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo,
        showBlocked: true,
        perPage: parseInt(req.body.perpage)
      }

      // return and poll for result
      this.readReport.readInProgress = true
      this.downloadBinaryInProgress = false
      this.readReport.readInfo =  "Reading first page"
      this.readReport.recordsCount = 0
      this.readReport.rowsCount = 0
      this.readReport.downloadCount = 0
      this.readReport.attachmentCount = 0
      this.readReport.status = "ok"
      this.csvContent = null
      this.maxBlock = 0
      this.appendFile = false
      this.attachmentUrls = []

      // delete old .csv file
      if (fs.existsSync(this.savedPath)) {
        fs.readdirSync(this.savedPath).forEach((file, index) => {
          if (file.indexOf(".csv") > 0){
            const fileName = Path.join(this.savedPath, file);
            fs.unlinkSync(fileName);
          }
        });
      }
      // delete old .zip file
      var userDownloadFile = `${this.extensionId}.zip`
      fs.readdirSync(process.cwd()).forEach((file, index) => {
        if (file.indexOf(userDownloadFile) > 0){
          const fileName = Path.join(process.cwd(), file);
          fs.unlinkSync(fileName);
        }
      });

      // empty /recordings folder
      var subfolder = `${thisUser.savedPath}recordings`
      if (fs.existsSync(subfolder)) {
        fs.readdirSync(subfolder).forEach((file, index) => {
          const curPath = Path.join(subfolder, file);
          fs.unlinkSync(curPath);
        });
      }
      // empty /voicemail folder
      subfolder = `${thisUser.savedPath}voicemail`
      if (fs.existsSync(subfolder)) {
        fs.readdirSync(subfolder).forEach((file, index) => {
          const curPath = Path.join(subfolder, file);
          fs.unlinkSync(curPath);
        });
      }
      /*
      subfolder = `${thisUser.savedPath}faxes`
      if (fs.existsSync(subfolder)) {
        fs.readdirSync(subfolder).forEach((file, index) => {
          const curPath = Path.join(subfolder, file);
          fs.unlinkSync(curPath);
        });
      }
      */
      // delete old .zip file
      var zipFile = `CallLog_${this.lastReadDateRange}_${this.getExtensionId()}.zip`
      if (fs.existsSync(zipFile))
        fs.unlinkSync(zipFile)
      res.send('{"status":"ok"}')

      this.lastReadDateRange = `${req.body.dateFrom.split("T")[0]}_${req.body.dateTo.split("T")[0]}`
      //console.log(this.lastReadDateRange)

      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          thisUser.startTime = Date.now()
          thisUser.timing = new Date().getTime()
          thisUser.readReport.readInProgress = true
          thisUser.readReport.readInfo =  "Reading first page"
          var endpoint = '/account/~/call-log'
          p.get(endpoint, thisUser.readCallLogParams)
              .then(function (resp) {
                var jsonObj = resp.json()
                thisUser.readReport.recordsCount = jsonObj.records.length
                //console.log("Total pages: " + JSON.stringify(jsonObj.paging))
                //console.log("Total elements: " + jsonObj.paging.totalElements)
                thisUser.parseCallRecords(p, jsonObj.records)
/*
                console.log("Done block = Write to file if something left")
                if (thisUser.maxBlock > 0){
                  var fullFilePath = `${thisUser.savedPath}${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.csv`
                  if (thisUser.appendFile == false){
                    thisUser.appendFile = true
                    try{
                      fs.writeFileSync(fullFilePath, thisUser.csvContent)
                    }catch(e){
                      console.log("Write file error " + e)
                    }
                  }else{
                    try{
                      fs.appendFileSync(fullFilePath, thisUser.csvContent)
                    }catch(e){
                      console.log("Append file error " + e)
                    }
                  }
                }
                thisUser.maxBlock = 0
                thisUser.csvContent = null
*/
                var navigationObj = jsonObj.navigation
                if (navigationObj.hasOwnProperty("nextPage")){
                  jsonObj = null
                  thisUser.readCallLogNextPage(navigationObj.nextPage.uri)
                }else{
                  //thisUser.downloadAttachements(p)
                  thisUser.readReport.readInProgress = false
                  if (thisUser.readReport.downloadCount == thisUser.readReport.attachmentCount){
                    console.log("all files are downloaded")
                    thisUser.downloadBinaryInProgress = false
                    // make zip file and delete .csv file
                    var zipFile = `CallLog_${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.zip`
                    var zipper = require('zip-local');
                    zipper.sync.zip("./"+thisUser.savedPath).compress().save(zipFile);

                    thisUser.downloadLink = "/downloads?filename=" + zipFile
                    // delete csv file
                    if (fs.existsSync(thisUser.savedPath)) {
                      fs.readdirSync(thisUser.savedPath).forEach((file, index) => {
                        if (file.indexOf(".csv") > 0){
                          const fileName = Path.join(thisUser.savedPath, file);
                          fs.unlinkSync(fileName);
                        }
                      });
                    }
                    jsonObj = null
                    zipper = null
                    var pro = process.memoryUsage()
                    console.log("Final Before Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                    try {
                      if (global.gc) {
                        global.gc();
                      }
                    } catch (e) {
                      console.log("`node --expose-gc index.js`");
                    }
                    var pro = process.memoryUsage()
                    console.log("Final After Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                  }
                  thisUser.readReport.readInfo =  "Reading done!"
                }
              })
              .catch(function(e){
                console.log("readAccountCallLog Failed")
                console.log(e.message)
                thisUser.readReport.status = "error"
                thisUser.downloadBinaryInProgress = false
                thisUser.readReport.readInProgress = false
                thisUser.readReport.readInfo =  "You don't have permission to read this account call log!"
              })
        }else{
          console.log("ERR" + err)
        }
      })
    },
    readCallLogNextPage: function(url){
      var thisUser = this
      //console.log(url)
      this.rc_platform.getPlatform(function(err, p){
        if (p != null){
          p.get(url)
            .then(function (resp) {
              var jsonObj = resp.json()
              //console.log("Total pages: " + JSON.stringify(jsonObj.paging))
              //console.log("Total elements: " + jsonObj.paging.totalElements)
              thisUser.readReport.readInProgress = true
              thisUser.readReport.readInfo =  "Reading page " + jsonObj.paging.page
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
                var pro = process.memoryUsage()
                console.log("Before Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                jsonObj = null
                try {
                  if (global.gc) {
                    console.log("calling gc")
                    global.gc();
                  }
                } catch (e) {
                  console.log("`node --expose-gc index.js`");
                  //process.exit();
                }
                var pro = process.memoryUsage()
                console.log("After Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                console.log("Read next page after " + delayInterval + " milliseconds")
                var nextPageUri = navigationObj.nextPage.uri
                setTimeout(function(){
                  thisUser.readCallLogNextPage(nextPageUri)
                }, delayInterval, nextPageUri)
              }else{
                //thisUser.downloadAttachements(p)
                thisUser.readReport.readInProgress = false
                thisUser.csvContent = null
                jsonObj = null
                if (thisUser.readReport.downloadCount == thisUser.readReport.attachmentCount){
                  console.log("all files are downloaded")
                  thisUser.downloadBinaryInProgress = false
                  // make zip file and delete .csv file
                  var zipFile = `CallLog_${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.zip`
                  var zipper = require('zip-local');
                  zipper.sync.zip("./"+thisUser.savedPath).compress().save(zipFile);

                  thisUser.downloadLink = "/downloads?filename=" + zipFile
                  // delete csv file
                  if (fs.existsSync(thisUser.savedPath)) {
                    fs.readdirSync(thisUser.savedPath).forEach((file, index) => {
                      if (file.indexOf(".csv") > 0){
                        const fileName = Path.join(thisUser.savedPath, file);
                        fs.unlinkSync(fileName);
                      }
                    });
                  }
                  zipper = null
                  var pro = process.memoryUsage()
                  console.log("Final Before Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                  try {
                    if (global.gc) {
                      global.gc();
                    }
                  } catch (e) {
                    console.log("`node --expose-gc index.js`");
                  }
                  var pro = process.memoryUsage()
                  console.log("Final After Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
                }
                thisUser.readReport.readInfo =  "Reading done!"
              }
            })
            .catch(function(e){
              console.log("readCallLogNextPage Failed")
              console.log(e.message)
            })
        }else{
          console.log("ERR" + err)
        }
      })
    },
    parseCallRecords_no_download: function(p, records){
      for (var record of records) {
          this.detailedCSVFormat()
          if (record.hasOwnProperty("message")){
            if (record.message.type == "VoiceMail"){
              var voicemailUri = record.message.uri.replace("platform", "media")
              var fileName = record.message.id + '.mp3'
              var item = {
                fileName: record.message.id + '.mp3',
                url: voicemailUri
              }
              this.voicemailUrls.push(item)
            }else if (record.message.type == "Fax"){
              var messageUri = record.message.uri
              this.attachmentUrls.push(messageUri)
            }
          }else if (record.hasOwnProperty("recording")){
            // download binary content to local file
            var fileName = record.recording.id + '.mp3'
            var item = {
              fileName: record.recording.id + '.mp3',
              url: voicemailUri
            }
            this.recordingUrls.push(item)
          }
      }
    },
    parseCallRecords: function(p, records){
      var thisUser = this
      //this.timing = new Date().getTime()
      async.each(records,
        function(record, callback){
          var attachment = "-"
          if (record.hasOwnProperty("message")){
            if (record.message.type == "VoiceMail" && thisUser.downloadVoicemail){
              var voicemailUri = record.message.uri.replace("platform", "media")
              var fileName = record.message.id + '.mp3'
              attachment = "voicemail/" + fileName
              thisUser.readReport.attachmentCount++
              thisUser.downloadBinaryInProgress = true
              thisUser.saveBinaryFile(p, "voicemail", fileName, voicemailUri)
            }else if (record.message.type == "Fax" && thisUser.downloadAttachements){
              if (record.direction == "Outbound" && record.result == "Sent"){
                console.log("++++++ Fax Record with Attachments ++++++")
                /*
                console.log(JSON.stringify(record))
                console.log("++++++")
                var messageUri = record.message.uri
                //thisUser.readReport.attachmentCount++
                thisUser.attachmentUrls.push(messageUri)
                */
              }
            }
          }else if (record.hasOwnProperty("recording") && thisUser.downloadRecording){
            // download binary content to local file
            var fileName = record.recording.id + '.mp3'
            attachment = "recordings/" + fileName
            thisUser.readReport.attachmentCount++
            thisUser.downloadBinaryInProgress = true
            thisUser.saveBinaryFile(p, "recordings", fileName, record.recording.contentUri)
          }
          if (thisUser.viewMode == "Simple")
            thisUser.simpleCSVFormat(record, attachment)
          else
            thisUser.detailedCSVFormat(record, attachment)
          record = null
          callback(null, null)
        },
        function (err){
          if (thisUser.maxBlock > 0){
            console.log(`Done read block = Write ${thisUser.maxBlock} records to file`)
            var fullFilePath = `${thisUser.savedPath}${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.csv`
            if (thisUser.appendFile == false){
              thisUser.appendFile = true
              try{
                fs.writeFileSync(fullFilePath, thisUser.csvContent)
              }catch(e){
                console.log("Write file error " + e)
              }
            }else{
              try{
                fs.appendFileSync(fullFilePath, thisUser.csvContent)
              }catch(e){
                console.log("Append file error " + e)
              }
            }
          }
          thisUser.maxBlock = 0
          thisUser.csvContent = null
          var now = new Date().getTime()
          now = (now - thisUser.timing)/1000
          thisUser.readReport.timeElapse = formatDurationTime(now)
          console.log("Time elapse: " + formatDurationTime(now))
          records = null
          return
        }
      )
    },
    downloadFaxAttachements: function(p){
      var thisUser = this
      for (var uri of this.attachmentUrls){
        p.get(uri)
          .then(function (resp) {
            var jsonObj = resp.json()
            async.each(jsonObj.attachments,
              function(attachment, callback){
                var fileNameExt = attachment.contentType.split("/")
                var fileName = attachment.id + "." + fileNameExt[1]
                thisUser.readReport.attachmentCount++
                thisUser.saveBinaryFile(p, "faxes", fileName, attachment.uri)
              })
          })
          .catch(function(e){
            console.log("======")
            console.log(uri)
            console.log(e.message)
          })
      }
    },
    simpleCSVFormat: function(record, attachment){
      if (this.csvContent == null && this.appendFile == false)
        this.csvContent = '"Type","Phone Number","Name","Date","Time","Action","Action Result","Result Description","Duration","Attachment"'

      this.csvContent += "\r\n" + record.type
      if (record.direction == "Outbound"){
        if (record.hasOwnProperty('to')){
          var temp = (record.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(record.to.phoneNumber) : ""
          if (temp == "")
            temp = (record.to.hasOwnProperty('extensionNumber')) ? record.to.extensionNumber : ""
          this.csvContent += "," +  temp
          temp = (record.to.hasOwnProperty('name')) ? record.to.name : ""
          this.csvContent += "," + temp
        }else{
          this.csvContent += ","
        }
      }else{
        if (record.hasOwnProperty('from')){
          var temp = (record.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(record.from.phoneNumber) : ""
          if (temp == "")
            temp = (record.from.hasOwnProperty('extensionNumber')) ? record.from.extensionNumber : ""
          // Phone Number
          this.csvContent += "," +  temp
          // Name
          temp = (record.from.hasOwnProperty('name')) ? record.from.name : ""
          this.csvContent += `,"${temp}"`
        }else{
          // Phone Number
          this.csvContent += ","
          // Name
          this.csvContent += ","
        }
      }
      let dateOptions = { weekday: 'short' }
      let timeOptions = { hour: '2-digit',minute: '2-digit' }
      var date = new Date(record.startTime)
      var timestamp = date.getTime() - this.timeOffset
      date = new Date (timestamp)
      var dateStr = date.toLocaleDateString("en-US", dateOptions)
      dateStr += " " + date.toLocaleDateString("en-US")
      this.csvContent += "," + dateStr
      this.csvContent += "," + date.toLocaleTimeString("en-US", {timeZone: 'UTC'})
      this.csvContent += "," + record.action + "," + record.result
      var desc = (record.hasOwnProperty('reasonDescription')) ? record.reasonDescription : ""
      this.csvContent += "," + desc
      this.csvContent += "," + formatDurationTime(record.duration)
      this.csvContent += "," + attachment

      this.readReport.rowsCount++

      this.maxBlock++
      if (this.maxBlock >= 500){
        console.log(`Interim write ${this.maxBlock} records to file`)
        var fullFilePath = `${this.savedPath}${this.lastReadDateRange}_${this.getExtensionId()}.csv`
        if (this.appendFile == false){
          this.appendFile = true
          fs.writeFileSync(fullFilePath, this.csvContent)
          //this.csvContent = ""
        }else{
          fs.appendFileSync(fullFilePath, this.csvContent)
          //this.csvContent = ""
        }
        this.csvContent = null
        this.maxBlock = 0
      }
    },
    detailedCSVFormat: function(record, attachment){
      //console.log(JSON.stringify(record))
      if (this.csvContent == null && this.appendFile == false)
        this.csvContent = '"Type","CallId","SessionId","Leg","Direction","From","To","Extension","Forwarded To","Name","Date","Time","Action","Action Result","Result Description","Duration","Included","Purchased","Site","Attachment"'
      var i = 1
      var legs = ""
      var masterSite = "-"
      var firstExtension = ""
      //if (record.id == "KbK5ytXPKSsBzUA")
      //  console.log(JSON.stringify(record))
      for (var item of record.legs){
        this.readReport.rowsCount++
        if (item.hasOwnProperty('master')){
          var master = {
            Type: item.type,
            CallId:record.id,
            SessionId:record.sessionId,
            Leg:"Leg-master",
            Direction:"",
            From:"",
            To:"",
            Extension:"",
            Forwarded_To:"",
            Name:"",
            Date:"",
            Time:"",
            Action:"",
            Action_Result:"",
            Result_Description:"",
            Duration:"",
            Included:"",
            Purchased:"",
            Site:"",
            Attachment:""
          }

          if (item.direction == "Outbound"){
            master.Direction = "Outgoing"
            if (item.hasOwnProperty('extension')){

            }
            // from
            if (item.hasOwnProperty('from')){
              var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
              if (temp == "")
                temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
              master.From = temp
            }
            // to
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
              if (temp == "")
                temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
              master.To = temp
            }
          }else{
            master.Direction = "Incoming"
            // from
            if (item.hasOwnProperty('from')){
              var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
              if (temp == "")
                temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
              master.From = temp
            }
            // to
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
              if (temp == "")
                temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
              master.To = temp
            }
          }

          // extension
          if (item.hasOwnProperty('extension')){
            var extObj = this.extensionList.find(o => o.id === item.extension.id)
            if (extObj){
              //console.log(extObj.name)
              master.Extension = extObj.name
              //console.log(extObj.site)
              if (extObj.hasOwnProperty('site')){
                //site = (extObj.site.hasOwnProperty('name')) ? extObj.site.name : ""
                //site +=  " - " + extObj.site.code
                master.Site = `${extObj.site.name} - ${extObj.site.code}`
              }
            }else{
              console.log("CANNOT FIND EXTENSION FROM EXT LIST???? " + item.extension.id)
              master.Extension = "Not found ext. id " + item.extension.id
              master.Site = "-"
            }
          }

          // Forwarded to
          if (record.direction == "Inbound" && item.direction == "Outbound"){
            var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
            master.Forwarded_To = temp
          }

          // Name
          if (item.direction == "Outbound"){
            var temp = ""
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('name')) ? item.to.name : ""
            }
            master.Name = temp
          }else{
            var temp = ""
            if (item.hasOwnProperty('from')){
              temp = (item.from.hasOwnProperty('name')) ? item.from.name : ""
            }
            master.Name = temp
          }

          let dateOptions = { weekday: 'short' }
          let timeOptions = { hour: '2-digit',minute: '2-digit' }
          var date = new Date(item.startTime)
          var timestamp = date.getTime() - this.timeOffset
          date = new Date (timestamp)
          var dateStr = date.toLocaleDateString("en-US", dateOptions)
          dateStr += " " + date.toLocaleDateString("en-US")
          master.Date = dateStr
          master.Time = date.toLocaleTimeString("en-US", {timeZone: 'UTC'}) // , {timeZone: 'America/Los_Angeles'}

          master.Action = item.action
          master.Action_Result = item.result
          var desc = (item.hasOwnProperty('reasonDescription')) ? item.reasonDescription : ""
          master.Result_Description = desc
          master.Duration = formatDurationTime(item.duration)

          // included
          master.Included = record.billing.costIncluded
          // purchased
          master.Purchased = record.billing.costPurchased
        }else{ // non master legs
          legs += "\r\n"
          legs += ","
          legs += ","
          legs += `,Leg-${i}`
          i++
          if (item.direction == "Outbound"){
            legs += ",Outgoing"
            // from
            /*
            if (item.hasOwnProperty('from')){
              var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
              if (temp == "")
                temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
              legs += "," +  temp
            }else{
              legs += ","
            }
            */
            legs += ","
            // to
            /*
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
              if (temp == "")
                temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
              legs += "," +  temp
            }else{
              legs += ","
            }
            */
            legs += ","
          }else{
            legs += ",Incoming"
            // from
            if (item.hasOwnProperty('from')){
              var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
              if (temp == "")
                temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
              legs += "," +  temp
            }else{
              legs += ","
            }
            // to
            /*
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
              if (temp == "")
                temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
              legs += "," +  temp
            }else{
              legs += ","
            }
            */
            legs += ","
          }

          // extension
          var site = "-"
          if (item.hasOwnProperty('extension')){
            var extObj = this.extensionList.find(o => o.id === item.extension.id)
            if (extObj){
              firstExtension = (firstExtension == "") ? extObj.name : ""
              legs += "," + extObj.name
              if (extObj.hasOwnProperty('site')){
                //site = (extObj.site.hasOwnProperty('name')) ? extObj.site.name : ""
                //site +=  " - " + extObj.site.code
                site = `${extObj.site.name} - ${extObj.site.code}`
                if (masterSite == "-")
                  masterSite = site
              }
            }else{
              legs += ","
            }
          }else{
            legs += ","
          }

          // Forwarded to
          if (record.direction == "Inbound" && item.direction == "Outbound"){
            var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
            legs += "," + temp
          }else
            legs += ","

          // Name
          if (item.direction == "Outbound"){
            var temp = ""
            if (item.hasOwnProperty('to')){
              var temp = (item.to.hasOwnProperty('name')) ? item.to.name : ""
            }
            legs += `,"${temp}"`
          }else{
            var temp = ""
            if (item.hasOwnProperty('from')){
              temp = (item.from.hasOwnProperty('name')) ? item.from.name : ""
            }
            legs += `,"${temp}"`
          }

          let dateOptions = { weekday: 'short' }
          let timeOptions = { hour: '2-digit',minute: '2-digit' }

          var date = new Date(item.startTime)
          var timestamp = date.getTime() - this.timeOffset
          date = new Date (timestamp)
          var dateStr = date.toLocaleDateString("en-US", dateOptions)
          dateStr += " " + date.toLocaleDateString("en-US")
          legs += "," + dateStr
          legs += "," + date.toLocaleTimeString("en-US", {timeZone: 'UTC'})
          legs += "," + item.action + "," + item.result
          var desc = (item.hasOwnProperty('reasonDescription')) ? item.reasonDescription : ""
          legs += "," + desc
          legs += "," + formatDurationTime(item.duration)


          // included and purchased
          legs += ",0,0"
          legs += "," + site
          legs += ","
        }
      }

      this.csvContent += `\r\n${master.Type}`
      this.csvContent += `,${master.CallId}`
      this.csvContent += `,${master.SessionId}`
      this.csvContent += `,${master.Leg}`
      this.csvContent += `,${master.Direction}`
      this.csvContent += `,${master.From}`
      this.csvContent += `,${master.To}`
      this.csvContent += (master.Extension == "") ? `,${firstExtension}` : `,${master.Extension}`
      this.csvContent += `,${master.Forwarded_To}`
      this.csvContent += `,"${master.Name}"`
      this.csvContent += `,${master.Date}`
      this.csvContent += `,${master.Time}`
      this.csvContent += `,${master.Action}`
      this.csvContent += `,${master.Action_Result}`
      this.csvContent += `,${master.Result_Description}`
      this.csvContent += `,${master.Duration}`
      this.csvContent += `,${master.Included}`
      this.csvContent += `,${master.Purchased}`
      this.csvContent += (master.Site == "") ? `,${masterSite}` : `,${master.Site}`
      this.csvContent += `,${attachment}`

      this.csvContent += legs
      this.maxBlock++
      if (this.maxBlock >= 500){
        console.log(`Interim write ${this.maxBlock} records to file`)
        var fullFilePath = `${this.savedPath}${this.lastReadDateRange}_${this.getExtensionId()}.csv`
        if (this.appendFile == false){
          this.appendFile = true
          fs.writeFileSync(fullFilePath, this.csvContent)
          //this.csvContent = ""
        }else{
          fs.appendFileSync(fullFilePath, this.csvContent)
          //this.csvContent = ""
        }
        this.csvContent = null
        this.maxBlock = 0
        master = null
      }
    },
    // not use
    /*
    detailedCSVFormat_old: function(record, attachment){
      //console.log(JSON.stringify(record))
      if (this.csvContent == "")
        this.csvContent = '"Type","CallId","SessionId","Leg","Direction","From","To","Extension","Forwarded To","Name","Date","Time","Action","Action Result","Result Description","Duration","Included","Purchased","Site","Attachment"'
      var i = 1
      var legs = ""
      for (var item of record.legs){
        if (item.hasOwnProperty('master')){
          this.csvContent += "\r\n" + item.type
          this.csvContent += "," + record.id
          this.csvContent += `,${record.sessionId.toString()}`
          this.csvContent += `,Leg-master`
        }else{
          this.csvContent += "\r\n"
          this.csvContent += ","
          this.csvContent += ","
          this.csvContent += `,Leg-${i}`
          i++
        }
        if (item.direction == "Outbound"){
          this.csvContent += ",Outgoing"
          // from
          if (item.hasOwnProperty('from')){
            var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
            if (temp == "")
              temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
            this.csvContent += "," +  temp
          }else{
            this.csvContent += ","
          }
          // to
          if (item.hasOwnProperty('to')){
            var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
            if (temp == "")
              temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
            this.csvContent += "," +  temp
          }else{
            this.csvContent += ","
          }
        }else{
          this.csvContent += ",Incoming"
          // from
          if (item.hasOwnProperty('from')){
            var temp = (item.from.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.from.phoneNumber) : ""
            if (temp == "")
              temp = (item.from.hasOwnProperty('extensionNumber')) ? item.from.extensionNumber : ""
            this.csvContent += "," +  temp
          }else{
            this.csvContent += ","
          }
          // to
          if (item.hasOwnProperty('to')){
            var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
            if (temp == "")
              temp = (item.to.hasOwnProperty('extensionNumber')) ? item.to.extensionNumber : ""
            this.csvContent += "," +  temp
          }else{
            this.csvContent += ","
          }
        }

        // extension
        var site = "-"
        if (item.hasOwnProperty('extension')){
          var extObj = this.extensionList.find(o => o.id === item.extension.id)
          if (extObj){
            //console.log(extObj.name)
            this.csvContent += "," + extObj.name
            //console.log(extObj.site)
            if (extObj.hasOwnProperty('site')){
              //site = (extObj.site.hasOwnProperty('name')) ? extObj.site.name : ""
              //site +=  " - " + extObj.site.code
              site = `${extObj.site.name} - ${extObj.site.code}`
            }
          }else{
            this.csvContent += ","
          }
        }else{
          this.csvContent += ","
        }

        // Forwarded to
        if (record.direction == "Inbound" && item.direction == "Outbound"){
          var temp = (item.to.hasOwnProperty('phoneNumber')) ? formatPhoneNumber(item.to.phoneNumber) : ""
          this.csvContent += "," + temp
        }else
          this.csvContent += ","

        // Name
        if (item.direction == "Outbound"){
          var temp = ""
          if (item.hasOwnProperty('to')){
            var temp = (item.to.hasOwnProperty('name')) ? item.to.name : ""
          }
          this.csvContent += `,"${temp}"`
        }else{
          var temp = ""
          if (item.hasOwnProperty('from')){
            temp = (item.from.hasOwnProperty('name')) ? item.from.name : ""
          }
          this.csvContent += `,"${temp}"`
        }

        let dateOptions = { weekday: 'short' }
        let timeOptions = { hour: '2-digit',minute: '2-digit' }
        var date = new Date(item.startTime)
        var dateStr = date.toLocaleDateString("en-US", dateOptions)
        dateStr += " " + date.toLocaleDateString("en-US")
        this.csvContent += "," + dateStr
        this.csvContent += "," + date.toLocaleTimeString("en-US")
        this.csvContent += "," + item.action + "," + item.result
        var desc = (item.hasOwnProperty('reasonDescription')) ? item.reasonDescription : ""
        this.csvContent += "," + desc
        this.csvContent += "," + formatDurationTime(item.duration)

        //if (record.direction == item.direction){
        //if (item.hasOwnProperty('master')){
        if (site != "-"){
          // included
          this.csvContent += "," + record.billing.costIncluded
          // purchased
          this.csvContent += "," + record.billing.costPurchased
        }else{
          this.csvContent += ",-,-"
        }
        this.csvContent += "," + site
        this.csvContent += "," + attachment
      }
    },
    */
    saveBinaryFile: function(p, type, fileName, contentUri){
      console.log("saveBinaryFile")
      var dir = this.savedPath + type + "/"
      if(!fs.existsSync(dir)){
        fs.mkdirSync(dir)
      }
      var thisUser = this
      var uri = p.createUrl(contentUri, {addToken: true});
      var fullNamePath = dir + fileName
      this.download(uri, fullNamePath, function(){
        thisUser.readReport.downloadCount++
        if (thisUser.readReport.downloadCount == thisUser.readReport.attachmentCount){
          console.log("all files are downloaded: DOWNLOAD")
          thisUser.downloadBinaryInProgress = false
        }
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
    createDownloadLinks: function(res){
      var thisUser = this
      thisUser.downloadLink = ""
      var userDownloadFile = `${this.extensionId}.zip`
      //if (fs.existsSync(this.savedPath)) {
        fs.readdirSync(process.cwd()).forEach((file, index) => {
          if (file.indexOf(userDownloadFile) > 0){
            //const fileName = Path.join(this.savedPath, file);
            thisUser.downloadLink = "/downloads?filename=" + file
            console.log(thisUser.downloadLink)
          }
        });
        if (thisUser.downloadLink.length)
          res.send({
            status:"ok",
            message:thisUser.downloadLink,
            readReport: thisUser.readReport,
            readParams: thisUser.readCallLogParams
          })
        else
          res.send({
            status:"empty",
            message:thisUser.downloadLink,
            readReport: thisUser.readReport,
            readParams: thisUser.readCallLogParams
          })
      //}
    },
    downloadCallLog: function(req, res){
      if (req.query.format == "CSV"){
        res.send({"status":"ok","message":this.downloadLink})
      }
    },
    deleteCallLogZipFile: function(res){
      var zipFile = this.downloadLink.split("=")[1] // `CallLog_${this.lastReadDateRange}_${this.getExtensionId()}.zip`
      console.log(zipFile);
      //var userDownloadFile = `${this.extensionId}.zip`
      const fileName = Path.join(process.cwd(), zipFile);
      if(fs.existsSync(fileName)){
        fs.unlinkSync(fileName);
      }
      res.send({"status":"ok","message":"file deleted"})
    },
    downloadAttachements: function(platform){
      var thisUser = this
      var dir = this.savedPath + "recordings/"
      if(!fs.existsSync(dir)){
        fs.mkdirSync(dir)
      }
      async.waterfall([
          this._dl_function(platform, dir, this.recordingUrls)
        ], function (error, success) {
            if (error) {
              console.log('Something is wrong!');
            }
            console.log('Done download atachments!');
            thisUser.readReport.readInProgress = false
            thisUser.readReport.readInfo =  "Reading done!"
        });
    },
    _dl_function: function(p, dir, recordingUrlList) {
      return function (callback) {
        async.each(recordingUrlList,
          function(record, callback0){
            console.log("saveBinaryFile")

            var thisUser = this
            var uri = p.createUrl(record.url, {addToken: true});
            var fullNamePath = dir + record.fileName
            console.log(fullNamePath)
            downloadFile(uri, fullNamePath, function(){
              console.log("Save file to the local machine. " + fullNamePath)
              return callback0(null, "")
            })
          },
          function (err){
            return callback (null, "");
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


function formatDurationTime(processingTime){
  var hour = Math.floor(processingTime / 3600)
  //hour = (hour < 10) ? "0"+hour : hour
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
    //var intlCode = (match[1] ? '+1 ' : '')
    return ['(', match[2], ') ', match[3], '-', match[4]].join('')
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

function checkFileExistance(fs, pathAndFile){
  var flag = true
  try {
    console.log("existed")
    fs.accessSync(pathAndFile, fs.F_OK)
  }catch(e){
    console.log("none existed")
    flag = false
  }
  return flag
}
const downloadFile = function(uri, dest, cb) {
  console.log("downloadFile " + dest)
  var file = fs.createWriteStream(dest);
  var request = https.get(uri, function(response) {
      response.pipe(file);
      file.on('finish', function() {
          file.close(cb);
      });
  });
}
