"use strict";
let defineUserModels = require("./userModels");

// entry point
module.exports.register = function*(plugin, settings){
  settings = settings || {};
  yield defineUserModels(plugin, settings);
  yield plugin.register([require("bell"), require("hapi-auth-cookie")]);

  settings.providers = settings.providers || {};
  for(let name in settings.providers){
    let provider = settings.providers[name];
    if(!provider.provider) {
      provider.provider = name;
    }
    if(!provider.password){
      provider.password = settings.password || "i2mdsMsp(^s";
    }
    plugin.auth.strategy(name, "bell", provider);
    plugin.route({
      method: ["GET", "POST"],
      path: "/auth/external/" + name,
      config: {
        auth: name,
        handler: function* (request, reply) {
          let user = request.auth.credentials;
          user = yield request.models.user.getOrCreate({
            userName: user.profile.username || user.profile.email,
            email: user.profile.email,
            firstName: user.profile.name.first,
            lastName: user.profile.name.last,
            externalProvider: {name: name, id: user.profile.id},
            enabled: true,
            confirmedDate: new Date()
          });
          request.auth.session.set({userId: user.id, time: new Date().getTime()});
          return reply.redirect("/");
        }
      }
    });
  }
  let sessionSettings = settings.session || {};
  if(!sessionSettings.password){
    sessionSettings.password = "dkl,_nDQ7lSX";
  }
  if(!sessionSettings.cookie){
    sessionSettings.cookie = "sid";
  }
  if(!sessionSettings.redirectTo){
    sessionSettings.redirectTo = "/auth/signIn";
  }
  sessionSettings.isSecure = false;

  plugin.auth.strategy("session", "cookie", sessionSettings);

  plugin.ext("onPostAuth", function*(request){
    if(request.auth.isAuthenticated && request.auth.credentials.userId){
      let model = request.models.user;
      request.auth.credentials = yield model.getById(request.auth.credentials.userId);
    }
  });
  plugin.route([{
    method: ["GET"],
    path: "/auth/signOut",
    config: {
      auth: "session",
      handler: function (request, reply) {
        request.auth.session.clear();
        return reply.redirect("/");
      }
    }
  },{
    method: ["GET"],
    path: "/auth/signIn",
    config: {
      handler: function (request, reply) {
        if (request.auth.isAuthenticated){
          return reply.redirect("/");
        }
        request.auth.session.clear();
        reply.view("signIn");
      },
      auth: {mode: "try", strategy: "session"},
      plugins: {
        "hapi-auth-cookie": {
          redirectTo: false
        }
      }
    }
  }]);
};

module.exports.register.attributes = {
  pkg: require("./package.json")
};