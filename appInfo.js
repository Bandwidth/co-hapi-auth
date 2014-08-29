"use strict";
var path = require("path");

module.exports.register = function(plugin, options, next){
  var appModule = {};
  try{
    appModule = require(path.join(process.cwd(), "package.json"));
  }
  catch(err){
    plugin.log(["error", "appInfo"], "Couldn't load app info from package.json: " + err.message);
  }
  plugin.expose("info", appModule);
  next();
};

module.exports.register.attributes = {
  name: "appInfo"
};

