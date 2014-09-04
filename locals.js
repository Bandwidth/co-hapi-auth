"use strict";
module.exports = function*(plugin, options){
  let absoluteUrl = function(relativeUrl){
    let server = plugin.servers[0];
    if(!server || relativeUrl[0] != "/"){
      return relativeUrl;
    }
    return (server.settings.location || server.info.uri) + relativeUrl;
  };

  plugin.ext("onPreResponse", function* (request) {
    let response = request.response;
    if(response.variety == "view"){
      response.source.context = response.source.context || {};
      response.source.context.auth = request.auth;
      response.source.context.absoluteUrl = absoluteUrl;
      response.source.context.appInfo = plugin.plugins["app-info"].info;
    }
  });

  plugin.dependency(["posto", "app-info"], function*(plugin){
    plugin.plugins.posto.registerHelper("absoluteUrl", absoluteUrl);
    plugin.plugins.posto.registerHelper("appInfo", plugin.plugins["app-info"].info);
  });
};
