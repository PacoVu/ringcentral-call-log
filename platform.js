const RingCentral = require('@ringcentral/sdk').SDK
var fs = require('fs')
var async = require("async");
require('dotenv').load()


function RCPlatform(mode) {
  this.token_json = null
  this.subscriptionId = ""
  this.extensionId = ""

  var cachePrefix = `user_${this.extensionId}`
  var rcsdk = null
  if (mode == "production"){
    rcsdk = new RingCentral({
          cachePrefix: cachePrefix,
          server: RingCentral.server.production,
          clientId: process.env.CLIENT_ID_PROD,
          clientSecret:process.env.CLIENT_SECRET_PROD,
          redirectUri: process.env.RC_APP_REDIRECT_URL,
        })
  }else if (mode == "sandbox"){
    rcsdk = new RingCentral({
        cachePrefix: cachePrefix,
        server: RingCentral.server.sandbox,
        clientId: process.env.CLIENT_ID_SB,
        clientSecret:process.env.CLIENT_SECRET_SB,
        redirectUri: process.env.RC_APP_REDIRECT_URL,
      })
  }
  
  this.platform = rcsdk.platform()

  this.platform.on(this.platform.events.loginSuccess, this.loginSuccess)
  this.platform.on(this.platform.events.logoutSuccess, this.logoutSuccess)
  this.platform.on(this.platform.events.refreshError, this.refreshError)

  var boundFunction = ( async function() {
      console.log("WONDERFUL")
      console.log(this.extensionId);
  }).bind(this);
  this.platform.on(this.platform.events.refreshSuccess, boundFunction);
  this.autoRefreshTimer = undefined
  return this
}

RCPlatform.prototype = {
  login: async function(code){
    try{
      var resp = await this.platform.login({
      code: code,
      redirectUri: process.env.RC_APP_REDIRECT_URL
      })

      var tokenObj = await this.platform.auth().data()
      this.token_json = tokenObj
      this.extensionId = tokenObj.owner_id
      return this.extensionId
    }catch(e) {
      console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      return null
    }
  },
  logout: function(){
    this.platform.logout()
  },
  getPlatform: async function(){
    console.log("getPlatform")
    if (await this.platform.loggedIn()){
      console.log("Logged in!")
      return this.platform
    }else{
      console.log("BOTH TOKEN TOKENS EXPIRED")
      console.log("CAN'T REFRESH")
      return null
    }
  },
  getSDKPlatform: function(){
    return this.platform
  },
  loginSuccess: function(e){
    console.log("Login success")
  },
  logoutSuccess: function(e){
    console.log("logout Success")
  },
  refreshError: function(e){
    console.log("refresh Error")
    console.log("Error " + e.message)
  }
}

module.exports = RCPlatform;
