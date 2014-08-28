"use strict";
let Joi = require("joi");
let urllib = require("url");

let optionsSchema = Joi.object({
  cookie: Joi.string().default("returnBack"),
  password: Joi.string().default("uEn1EADecKgU8gemy3V0"),
  queryField: Joi.string().default("next")
});

module.exports.register = function*(plugin, options){
  debugger;
  options = options || {};
  options = yield Joi.validate.bind(Joi, options, optionsSchema);
  plugin.state(options.cookie, {isHttpOnly: true, path: "/", encoding: "iron", password: options.password })
  plugin.ext("onPreAuth", function*(request){
    request.setReturnUrl = function(url){
      if(request._returnUrlSaved) return;
      url = url || request.info.referrer || "/";
      url = urllib.parse(url).path; //take only relative part
      request._setState(options.cookie, url);
      request._returnUrlSaved = true;
    }
    request.getReturnUrl = function(defaultUrl){
      let url = request.state[options.cookie] || defaultUrl || "/";
      if(url[0] != "/"){
        url = "/";
      }
      if(request.state[options.cookie]){
        request._clearState(options.cookie);
      }
      return url;
    }
    if(request.method === "get" && request.query[options.queryField]){
      request.setReturnUrl(request.query[options.queryField]);
    }
  });
};

module.exports.register.attributes = {
  name: "returnBack"
};

