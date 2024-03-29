var path = require('path')
var util = require('util')

if('production' !== process.env.LOCAL_ENV )
  require('dotenv').load();

var express = require('express');
var session = require('express-session');

var app = express();
//app.use(session());
app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 24 * 60 * 60 * 1000 }}));
var bodyParser = require('body-parser');
var urlencoded = bodyParser.urlencoded({extended: false})

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(urlencoded);

var port = process.env.PORT || 5000

var server = require('http').createServer(app);
server.listen(port);
console.log("listen to port " + port)
var router = require('./router');

app.get('/', function (req, res) {
  console.log('load option page /')
  res.render('index')
  /*
  if (req.session.extensionId != 0)
    router.logout(req, res)
  else{
    res.render('index')
  }
  */
})
app.get('/login', function (req, res) {
  console.log('login to /')
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
    if (!req.session.hasOwnProperty("extensionId"))
      req.session.extensionId = 0;
  console.log("SESSION:" + JSON.stringify(req.session))
  router.loadLogin(req, res)
})

app.get('/index', function (req, res) {
  console.log('load option page /')
  if (req.query.n != undefined && req.query.n == 1){
    console.log('logout from here?')
    router.logout(req, res)
  }else {
    res.render('index')
  }
})

app.get('/logout', function (req, res) {
  console.log('logout why here?')
  router.logout(req, res)
})

app.get('/loadmainpage', function (req, res) {
  console.log('loadMainPage')
  if (req.session.extensionId != 0)
    router.loadMainPage(req, res)
  else
    res.render('index')
})

app.post('/readlogs', function (req, res) {
  console.log("readAccountCallLog - Async")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.readAccountCallLog(req, res)
})

app.post('/export-message-store', function (req, res) {
  console.log("exportMessageStore - Async")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.exportMessageStore(req, res)
})

app.get('/export-message-pollresult', function (req, res) {
  console.log("Polling ...")
  router.pollExportResult(req, res)
})

app.get('/about', function (req, res) {
  router.loadAboutPage(req, res)
})


app.get('/export-call-logs', function (req, res) {
  router.loadCallLogPage(req, res)
})

app.get('/export-message-store', function (req, res) {
  router.loadMessageStorePage(req, res)
})

app.get('/pollresult', function (req, res) {
  console.log("Polling ...")
  router.pollReadCallLogResult(req, res)
})

app.get('/downloadcalllog', function (req, res) {
  router.downloadCallLog(req, res)
})

app.get('/deletecalllog', function (req, res) {
  router.deleteCallLogZipFile(req, res)
})

app.get('/downloads', function(req, res){
  console.log(req.query)
  var file = req.query.filename;
  res.download(file); // Set disposition and send it.
});

app.get('/retrievedownloadfile', function (req, res) {
  router.createDownloadLinks(req, res)
})

app.get('/retrieve-message-store-downloadfile', function (req, res) {
  router.createMessageStoreDownloadLinks(req, res)
})

app.get('/oauth2callback', function(req, res){
  console.log("callback redirected")
  router.login(req, res)
})

app.get('/api/ringcentral/redirect', function(req, res){
  console.log("callback redirected")
  router.login(req, res)
})


app.post('/sendfeedback', function (req, res) {
  console.log("sendfeedback")
  router.postFeedbackToGlip(req, res)
})
