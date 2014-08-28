"use strict";
let Joi = require("joi");

let optionsSchema = Joi.object({
  providers: Joi.object(),
  password: Joi.string(),
  session: Joi.object(),
  minPasswordLength: Joi.number().integer().min(6),
  rememberTTL: Joi.number().min(0)
});


// entry point
module.exports.register = function*(plugin, options){
  options = options || {};
  Joi.assert(options, optionsSchema);
  if(!options.minPasswordLength){
    options.minPasswordLength = 6;
  }
  let defineUserModels = require("./userModels");
  yield defineUserModels(plugin, options);
  yield plugin.register([require("bell"), require("hapi-auth-cookie")]);

  options.providers = options.providers || {};
  for(let name in options.providers){
    let provider = options.providers[name];
    if(!provider.provider) {
      provider.provider = name;
    }
    if(!provider.password){
      provider.password = options.password || "i2mdsMsp(^s";
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
          return reply.redirect(request.getReturnUrl());
        }
      }
    });
  }
  let sessionoptions = options.session || {};
  if(!sessionoptions.password){
    sessionoptions.password = "dkl,_nDQ7lSXjrewp)9";
  }
  if(!sessionoptions.cookie){
    sessionoptions.cookie = "sid";
  }
  if(!sessionoptions.redirectTo){
    sessionoptions.redirectTo = "/auth/signIn";
  }
  sessionoptions.isSecure = false;

  plugin.auth.strategy("session", "cookie", sessionoptions);

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
        return reply.redirect("/auth/signIn");
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
        request.setReturnUrl();
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
  },{
    method: ["POST"],
    path: "/auth/signIn",
    config: {
      handler: function* (request, reply) {
        if (request.auth.isAuthenticated){
          return reply.redirect("/");
        }
        let user = yield request.models.user.findOne({
          "$or":[
            {userName: request.payload.userNameOrEmail},
            {email: request.payload.userNameOrEmail}
          ],
          enabled: true,
          confirmedDate:{"$exists": true}
        }).execQ();
        if(!user){
          return reply.view("signIn", {user: request.payload, error: "Missing user with such user name or email"});
        }
        if(!(yield user.comparePassword(request.payload.password))){
          return reply.view("signIn", {user: request.payload, error: "Invalid password"});
        }
        request.auth.session.set({userId: user.id});
        if(request.payload.remember){
          for(let k in request._states){
            let state = request._states[k];
            if(state.value && state.value.userId == user.id){
              if((state.options || {}).ttl == null){
                state.options = state.options || {};
                state.options.ttl = (options.rememberTTL || 24*30)  * 3600000;
              }
            }
          }
        }
        return reply.redirect(request.getReturnUrl());
      },
      auth: {mode: "try", strategy: "session"},
      validate: {
        payload: Joi.object().keys({
          userNameOrEmail: Joi.string().required(),
          password: Joi.string().required(),
          remember: Joi.any()
        })
      },
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
