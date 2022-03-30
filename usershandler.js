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
  this.hasNextPage = false
  this.noCSV = false
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
    attachments: []
  }
  this.exportResponse = {
    status:'ok',
    taskStatus: "Idle",
    taskId: '',
    downloadLink: [],
    timeElapse: '0:00',
    downloadFileName: ''
  }
  this.mainCompanyNumber = ""
  this.csvContent = ""
  this.appendFile = false
  this.fileIndex = 0
  this.rowsCount = 0
  this.recordingUrls = []
  this.voicemailUrls = []
  this.attachmentUrls = []
  this.savedPath = ""
  this.lastReadDateRange = ""
  this.timeOffset = 0
  this.viewMode = "Simple"
  this.attachments = []
  this.downloadLink = ""

  this.downloadRecording = false
  this.downloadVoicemail = false
  this.download.attachment = false
  this.rc_platform = new RCPlatform(mode)
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
      res.render('main', {
          userName: this.getUserName(),
          isAdmin: this.isAdmin
      })
      if (!this.isAdmin){
        this.logout((err, result) => {
          console.log("destroy session")
          req.session.destroy()
        })
      }
    },
    loadCallLogPage: function(req, res){
      if (!this.isAdmin){
        return res.render('main', {
            userName: this.getUserName(),
            isAdmin: this.isAdmin
        })
      }
      res.render('calllogs', {
          userName: this.getUserName()
      })
    },
    loadMessageStorePage: function(req, res){
      if (!this.isAdmin){
        return res.render('main', {
            userName: this.getUserName(),
            isAdmin: this.isAdmin
        })
      }
      res.render('messages', {
          userName: this.getUserName()
      })
    },
    login: async function(req, res, callback){
      var thisReq = req
      if (req.query.code) {
        console.log("CALL LOGIN FROM USER")
        var extensionId = await this.rc_platform.login(req.query.code)
        if (extensionId){
          this.extensionId = extensionId
          req.session.extensionId = extensionId;
          this.savedPath = `downloads/${extensionId}/`
          if(!fs.existsSync(this.savedPath)){
            fs.mkdirSync(this.savedPath)
          }
          if(!fs.existsSync(`message-store/`)){
            fs.mkdirSync(`message-store/`)
            console.log("created message-store folder?")
          }
          console.log('logged_in');
          var thisRes = res
          var p = await this.getPlatform()
          console.log('passed getPlatform');
          if (p){
            try {
              var resp = await p.get('/restapi/v1.0/account/~/extension/~/')
              var jsonObj = await resp.json();
              console.log("RC account id", jsonObj.account.id)
              this.accountId = jsonObj.account.id

              var fullName = (jsonObj.contact.hasOwnProperty("firstName")) ? `${jsonObj.contact.firstName} ` : ""
              fullName += (jsonObj.contact.hasOwnProperty("lastName")) ? jsonObj.contact.lastName : ""
              this.setUserName(fullName)

              if (jsonObj.permissions.admin.enabled){
                this.isAdmin = true
              }
              callback(null, extensionId)
              res.send('login success');
            }catch(e) {
                console.log("Failed")
                console.error(e);
                callback("error", this.id)
            }
          }else {
            console.log("Platform error")
          }
        }else{
          callback("failed", this.id)
        }
      } else {
        res.send('No Auth code');
        callback("error", null)
      }
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
    exportMessageStore: async function(req, res){
      this.timeOffset = parseInt(req.body.timeOffset)
      //console.log(this.timeOffset)
      var type = JSON.parse(req.body.type)

      var exportMessagesParams = {
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo
      }
      var all = type.find(o => o == 'all')
      if (!all){
        exportMessagesParams['messageTypes'] = type
      }
      console.log(exportMessagesParams)
      var p = await this.getPlatform()
      if (p){
        try{
          var endpoint = "/restapi/v1.0/account/~/message-store-report"
          var resp = await p.post(endpoint, exportMessagesParams)
      	  var jsonObj = await resp.json()
          console.log(jsonObj)
          this.timing = new Date().getTime()
          this.exportResponse.status = 'ok'
          this.exportResponse.taskStatus = jsonObj.status
          this.exportResponse.taskId = jsonObj.id
          this.exportResponse.timeElapse = '0:00'
          var dlFileNameBased = `${req.body.dateFrom.substr(5, 5)} - ${req.body.dateTo.substr(5, 5)}`
          console.log(dlFileNameBased)
          this.exportResponse.downloadFileName = dlFileNameBased
          var thisUser = this
          setTimeout(function(){
  			       thisUser.getMessageStoreReportTask()
          }, 8000);
          res.send(this.exportResponse)
        }catch(e){
    		  console.log(e)
    	  }
      }else{
        console.log("TBI")
      }
    },
    pollExportResult: function(res){
      var now = new Date().getTime()
      now = (now - this.timing)/1000
      var timeElapse = formatDurationTime(now)
      console.log("Time elapse: " + timeElapse)
      this.exportResponse.timeElapse = timeElapse
      res.send(this.exportResponse)
    },
    getMessageStoreReportTask: async function(){
      console.log("check task creation status ...")
      var p = await this.getPlatform()
      if (p){
        try{
          var endpoint = `/restapi/v1.0/account/~/message-store-report/${this.exportResponse.taskId}`
          console.log(endpoint)
      	  var resp = await p.get(endpoint)
      	  var jsonObj = await resp.json()
          console.log(jsonObj)

          this.exportResponse.status ='ok'
          this.exportResponse.taskStatus = jsonObj.status
          this.exportResponse.taskId = jsonObj.id

          if (jsonObj.status == 'Completed'){
            console.log("COMPLETED")
            this.getMessageStoreReportArchive()
          }else{
            var thisUser = this
            setTimeout(function(){
    			       thisUser.getMessageStoreReportTask()
            }, 8000);
          }
        }catch(e){
    		  console.log(e)
        }
      }else{
        console.log("TBI")
      }
    },
    getMessageStoreReportArchive: async function(){
      console.log("getting report uri ...")
      var p = await this.getPlatform()
      if (p){
        try{
    	    var endpoint = `/restapi/v1.0/account/~/message-store-report/${this.exportResponse.taskId}/archive`
          console.log(endpoint)
    	    var resp = await p.get(endpoint)
    	    var jsonObj = await resp.json()
          console.log(jsonObj.records)
    		  var date = new Date()
          var dateStr = date.toISOString().replace(/:/g, '_')
          console.log(dateStr)
          var files = []
          var downloadPath = `./message-store/${this.extensionId}/`
          if(!fs.existsSync(downloadPath)){
            fs.mkdirSync(downloadPath)
          }
    		  for (var i=0; i< jsonObj.records.length; i++){
            var fileName = `${downloadPath}exported_data_${this.exportResponse.downloadFileName}_${i}.zip`
            var u = new URL(jsonObj.records[i].uri)

		        var domain = u.host
		        var path = u.pathname
            /*
            var arr = jsonObj.records[i].uri.split("//")
            var index = arr[1].indexOf('/')
            var domain = arr[1].substring(0, index)
            var path = arr[1].substring(index, arr[1].length)
            */
            console.log(domain)
            console.log(path)
            var tokenObj = await p.auth().data()
            var accessToken = tokenObj.access_token
            await download(domain, path, accessToken, fileName)
            var downloadLink = `/downloads?filename=${fileName}`
            files.push(downloadLink)
    		  }
          this.exportResponse.status ='ok'
          this.exportResponse.taskStatus = 'Done'
          this.exportResponse.downloadLinks = files
          console.log("DONE")
        }catch(e){
    		  console.log(e)
          this.exportResponse.status ='failed'
        }
      }else{
        console.log("TBI")
        this.exportResponse.status ='error'
      }
    },
    readAccountCallLog: async function(req, res){
      var thisUser = this
      this.viewMode = req.body.view
      if (this.viewMode == 'None'){
        this.viewMode = 'Simple'
        this.noCSV = true
      }
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
        view: this.viewMode,
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo,
        showBlocked: true,
        perPage: 1000
      }

      // return and poll for result
      this.readReport.readInProgress = true
      this.readReport.downloadBinaryInProgress = false
      this.readReport.readInfo =  "Reading first page"
      this.readReport.recordsCount = 0
      this.readReport.rowsCount = 0
      this.readReport.downloadCount = 0
      this.readReport.attachmentCount = 0
      this.readReport.status = "ok"
      this.csvContent = null
      this.fileIndex = 1
      this.rowsCount = 0
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
      // delete old .zip file
      var zipFile = `CallLog_${this.lastReadDateRange}_${this.getExtensionId()}.zip`
      if (fs.existsSync(zipFile))
        fs.unlinkSync(zipFile)
      res.send('{"status":"ok"}')

      this.lastReadDateRange = `${req.body.dateFrom.split("T")[0]}_${req.body.dateTo.split("T")[0]}`
      //console.log(this.lastReadDateRange)
      var p = await this.getPlatform()
      if (p){
      //this.rc_platform.getPlatform(function(err, p){
        try {
          this.startTime = Date.now()
          this.timing = new Date().getTime()
          this.readReport.readInProgress = true
          this.readReport.readInfo =  "Reading first page"
          var endpoint = '/restapi/v1.0/account/~/call-log'
          var resp = await p.get(endpoint, this.readCallLogParams)
          var jsonObj = await resp.json()
          var jsonHeader = resp.headers //resp.response().headers
          console.log(jsonHeader)
          this.readReport.recordsCount = jsonObj.records.length
          var navigationObj = jsonObj.navigation
          this.hasNextPage = navigationObj.hasOwnProperty("nextPage")
          console.log("downloadRecording: " + this.downloadRecording)
          this.parseCallRecords(p, jsonObj.records, (err, result) => {
              if (thisUser.hasNextPage){
                jsonObj = null
                thisUser.readCallLogNextPage(navigationObj.nextPage.uri)
              }else{
                console.log("readAccountCallLog: END HERE?")
                thisUser.readReport.readInProgress = false
                thisUser.finalizeDownloadLink()
              }
            })
          }catch(e){
            console.log("readAccountCallLog Failed")
            console.log(e.message)
            this.readReport.status = "error"
            this.readReport.downloadBinaryInProgress = false
            this.readReport.readInProgress = false
            this.readReport.readInfo =  "You don't have permission to read this account call log!"
          }
      }else{
        console.log("ERR" + err)
      }
    },
    readCallLogNextPage: async function(url){
      var thisUser = this
      var p = await this.getPlatform()
      if (p){
        try {
          var resp = await p.get(url)
          var jsonObj = await resp.json()
          this.readReport.readInProgress = true
          this.readReport.readInfo =  "Reading page " + jsonObj.paging.page
          this.readReport.recordsCount += jsonObj.records.length
          this.hasNextPage = jsonObj.navigation.hasOwnProperty("nextPage")
          console.log("downloadRecording next page: " + this.downloadRecording)
          this.parseCallRecords(p, jsonObj.records, (err, result) => {
            console.log("Then come here to continue!")
            /*
            var jsonHeader = resp.headers //resp.response().headers
            //console.log(jsonHeader)
            var limit = parseInt(jsonHeader['x-rate-limit-limit'][0]) // ['_headers']
            var limitRemaining = parseInt(jsonHeader['x-rate-limit-remaining'][0])
            var limitWindow = parseInt(jsonHeader['x-rate-limit-window'][0])
            console.log("limitRemaining: " + limitRemaining)
            */
            var nextPageUri = ""
            if (thisUser.hasNextPage)
              nextPageUri = jsonObj.navigation.nextPage.uri

            var pro = process.memoryUsage()
            console.log("Before Heap Total: " + (pro.heapTotal/1024).toFixed(1) + ". Used: " + (pro.heapUsed/1024).toFixed(1))
            thisUser.csvContent = null
            resp = null
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

            if (thisUser.hasNextPage){
              var delayInterval = 100
              /*
              if (limitRemaining == 0){
                console.log("No remaining => calculate waiting time")
                var now = Date.now()
                var diff = now - thisUser.startTime
                delayInterval = (limitWindow / limit) * 1000
                thisUser.startTime = now + delayInterval
              }
              */
              console.log("Read next page after " + delayInterval + " milliseconds")
              setTimeout(function(){
                thisUser.readCallLogNextPage(nextPageUri)
              }, delayInterval, nextPageUri)
            }else{
              thisUser.readReport.readInProgress = false
              console.log(`${thisUser.readReport.downloadCount} == ${thisUser.readReport.attachmentCount}`)
              thisUser.finalizeDownloadLink()
            }
          })
        }catch(e){
            console.log("readCallLogNextPage Failed")
            console.log(e.message)
            // set error
            this.readReport.status = "failed"
            this.readReport.readInfo = e.message
        }
      }else{
          console.log("ERR" + err)
        }
    },
    parseCallRecords: function(p, records, cb){
      var thisUser = this
      async.eachSeries(records, function (record, done) {
          setTimeout(function () {
              var attachment = "-"
              if (record.hasOwnProperty("message")){
                if (record.message.type == "VoiceMail" && thisUser.downloadVoicemail){
                  var voicemailUri = record.message.uri.replace("platform", "media")
                  var fileName = record.message.id + '.mp3'
                  attachment = "voicemail/" + fileName
                  thisUser.readReport.attachmentCount++
                  thisUser.readReport.downloadBinaryInProgress = true
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
                console.log(attachment)
                thisUser.readReport.attachmentCount++
                thisUser.readReport.downloadBinaryInProgress = true
                thisUser.saveBinaryFile(p, "recordings", fileName, record.recording.contentUri)
              }
              if (!thisUser.noCSV){
                if (thisUser.viewMode == "Simple")
                  thisUser.simpleCSVFormat(record, attachment)
                else if (thisUser.viewMode == "Detailed")
                  thisUser.detailedCSVFormat(record, attachment)
              }
              record = null
              done()
          }, 80);
      }, function (err) {
          //if (!err) callback();
          console.log(`Done read block = Write 1000 records to file`)
          var fullFilePath = `${thisUser.savedPath}${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}-${thisUser.fileIndex}.csv`
          if (!thisUser.noCSV){
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
          if (thisUser.rowsCount > 900000){
            thisUser.fileIndex++
            thisUser.appendFile = false
            thisUser.rowsCount = 0
          }
          thisUser.csvContent = null
          var now = new Date().getTime()
          now = (now - thisUser.timing)/1000
          thisUser.readReport.timeElapse = formatDurationTime(now)
          console.log("Time elapse: " + formatDurationTime(now))
          console.log("Block read DONE!")
          cb(null, "ok")
      });
    },
    finalizeDownloadLink: function(){
      console.log("finalizeDownloadLink archiver!")
      var thisUser = this
      if (thisUser.readReport.downloadCount == thisUser.readReport.attachmentCount){
        if (thisUser.readReport.readInProgress)
          return
        console.log("all files are downloaded. Making a zip file...")
        thisUser.readReport.downloadBinaryInProgress = false
        // make zip file and delete .csv file
        var zipFile = `CallLog_${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.zip`
        const archiver = require('archiver');
        // create a file to stream archive data to.
        var currentPath = process.cwd();
        const output = fs.createWriteStream(`${currentPath}/${zipFile}`);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Sets the compression level.
        });

        thisUser.downloadLink = `./downloads?filename=${zipFile}`
        console.log("check downloadLink nextPage")
        console.log(thisUser.downloadLink)

        output.on('close', function() {
          console.log(archive.pointer() + ' total bytes');
          console.log('archiver has been finalized and the output file descriptor has closed.');
          thisUser.readReport.readInfo =  "Reading done!"
          // delete csv file
          if (fs.existsSync(thisUser.savedPath)) {
            fs.readdirSync(thisUser.savedPath).forEach((file, index) => {
              if (file.indexOf(".csv") > 0){
                const fileName = Path.join(thisUser.savedPath, file);
                fs.unlinkSync(fileName);
              }
            });
          }
        });

        // This event is fired when the data source is drained no matter what was the data source.
        // It is not part of this library but rather from the NodeJS Stream API.
        // @see: https://nodejs.org/api/stream.html#stream_event_end
        output.on('end', function() {
          console.log('Data has been drained');
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function(err) {
          if (err.code === 'ENOENT') {
            // log warning
          } else {
            // throw error
            console.log("Archiver WARNING")
          }
        });

        // good practice to catch this error explicitly
        archive.on('error', function(err) {
          throw err;
        });

        // pipe archive data to the file
        archive.pipe(output);

        archive.directory(`./${thisUser.savedPath}`, false);
        archive.finalize();
/*
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
*/
      }
    },
    finalizeDownloadLink_zipper: function(){
      console.log("finalizeDownloadLink")
      var thisUser = this
      if (thisUser.readReport.downloadCount == thisUser.readReport.attachmentCount){
        if (thisUser.readReport.readInProgress)
          return
        console.log("all files are downloaded. Making a zip file...")
        thisUser.readReport.downloadBinaryInProgress = false
        // make zip file and delete .csv file
        var zipFile = `CallLog_${thisUser.lastReadDateRange}_${thisUser.getExtensionId()}.zip`
        var zipper = require('zip-local');
        //zipper.sync.zip("./"+thisUser.savedPath).compress().save(zipFile);
        zipper.sync.zip("./"+thisUser.savedPath).save(zipFile);

        thisUser.downloadLink = "/downloads?filename=" + zipFile
        console.log("check downloadLink nextPage")
        console.log(thisUser.downloadLink)
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
      this.rowsCount++
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
        this.rowsCount++
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
                master.Site = extObj.site
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
            legs += ","
            // to
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
              //firstExtension = (firstExtension == "") ? extObj.name : ""
              legs += "," + extObj.name
              if (extObj.hasOwnProperty('site')){
                //site = (extObj.site.hasOwnProperty('name')) ? extObj.site.name : ""
                //site +=  " - " + extObj.site.code
                site = extObj.site
                //if (masterSite == "-")
                //  masterSite = site
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
      this.csvContent += `,${master.Extension}` // (master.Extension == "") ? `,${firstExtension}` :
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
      this.csvContent += `,${master.Site}` // (master.Site == "") ? `,${masterSite}` :
      this.csvContent += `,${attachment}`

      this.csvContent += legs
      master = null
    },
    saveBinaryFile: function(p, type, fileName, contentUri){
      //console.log("saveBinaryFile")
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
          //console.log("file downloaded for this page")
          thisUser.readReport.downloadBinaryInProgress = false
          if (!thisUser.hasNextPage){
            thisUser.finalizeDownloadLink()
          }
        }
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
    createMessageStoreDownloadLinks: function(res){
      console.log("createDownloadLinks")
      var thisUser = this
      thisUser.downloadLinks = []
      //console.log(thisUser.downloadLink)
      var userDownloadFile = `exported_data`
      var dir = `${process.cwd()}/message-store/${this.extensionId}`
      console.log(dir)
      try{
        fs.readdirSync(dir).forEach((file, index) => {
          console.log(file)
          if (file.indexOf(userDownloadFile) >= 0){
            thisUser.downloadLinks.push(`/downloads?filename=./message-store/${this.extensionId}/${file}`)
            console.log('Download file name: ' + thisUser.downloadLinks)
          }
        });
        res.send({
            status:"ok",
            downloadLinks:thisUser.downloadLinks,
            exportStatus: this.exportResponse
        })
      }catch(e){
        res.send({
            status:"ok",
            downloadLinks:[],
            exportStatus: this.exportResponse
        })
      }
    },
    createDownloadLinks: function(res){
      console.log("createDownloadLinks")
      var thisUser = this
      thisUser.downloadLink = ""
      //console.log(thisUser.downloadLink)
      var userDownloadFile = `${this.extensionId}.zip`
      //if (fs.existsSync(this.savedPath)) {
        fs.readdirSync(process.cwd()).forEach((file, index) => {
          if (file.indexOf(userDownloadFile) > 0){
            //const fileName = Path.join(this.savedPath, file);
            thisUser.downloadLink = "/downloads?filename=" + file
            console.log('Download file name: ' + thisUser.downloadLink)
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
      console.log('downloadCallLog')
      console.log(this.downloadLink)
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
            console.log("_dl_function")

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
    logout: async function(callback){
      console.log("LOGOUT FUNC")
      var p = await this.getPlatform()
      if (p){
        try{
          await p.logout()
          callback(null, "ok")
        }catch(e) {
          console.log('ERR ' + e.message || 'Server cannot authorize user');
          callback(e, e.message)
        }
      }else{
        callback(null, "ok")
      }
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

const download = async function(domain, path, accessToken, dest) {
  return new Promise((resolve, reject) => {
    var file = fs.createWriteStream(dest);
    var options = {
          host: domain,
          path: path,
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
      }
      const req = https.request(options, res => {
      console.log(`statusCode: ${res.statusCode}`)
      res.pipe(file);
      file.on('finish', function() {
          file.close();
          resolve('Done')
      });
    })
    req.on('error', error => {
      console.error(error)
      reject(error)
    })
    req.end()
  });
}
