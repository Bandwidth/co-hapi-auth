"use strict";
let bcrypt = require("bcryptjs");
let co = require("co");
let timestamp = require("mongoose-timestamp");

module.exports = function*(plugin, options){
  plugin.dependency(["co-hapi-mongoose", "co-hapi-models"], function*(plugin){
    let db = plugin.plugins["co-hapi-mongoose"].mongoose;
    let userCache = plugin.cache({segment: "!!userCache", expiresIn: options.cacheUserData || 300000});
    let dropUserFromCache = function(user){
      userCache.drop(user.id);
      userCache.drop(user.userName);
    };
    let userSchema = new db.Schema({
      userName: {type: String, unique: true, required: true},
      email: {type: String, unique: true, required: true},
      encryptedPassword: String,
      firstName: String,
      lastName: String,
      externalProvider: db.Schema.Types.Mixed,
      confirmedDate: Date,
      enabled: {type: Boolean, default: false, index: true},
      resetPasswordToken: {type: String, index: true},
      confirmationToken: {type: String, index: true},
      resetPasswordTokenCreatedDate: Date,
      confirmationTokenCreatedDate: Date,
      profileImage: {type: db.Schema.Types.Mixed},
      roles: [{type: db.Schema.Types.ObjectId, ref: "userRoles"}]
    });

    userSchema.methods.setPassword = function*(password){
      if(!password){
        this.set("encryptedPassword", null);
        return;
      }
      let l = (options.minPasswordLength || 6);
      if(password.length < l){
        throw new Error("Password must contains more or equal " +  l + " symbols");
      }
      let hash = yield bcrypt.hash.bind(bcrypt, password + options.pepper, ((process.env.NODE_ENV == "test")?4:10));
      this.set("encryptedPassword", hash);
    };
    userSchema.methods.comparePassword = function*(password){
      let res = yield bcrypt.compare.bind(bcrypt, password + options.pepper, (this.get("encryptedPassword") || ""));
      return res;
    };

    userSchema.statics.getById = function*(id){
      let user = yield userCache.getOrGenerate.bind(userCache, id.toString(), function(callback){co(function*(){
        let model = plugin.plugins["co-hapi-models"].models.user;
        let usr = yield model.findById(id).populate("roles").execQ();
        if(usr == null) return usr;
        usr.roles = (usr.roles || []).map(function(r){
          return {id: r.id||r._id, name: r.name};
        });
        return usr.toObject({getters: true, transform: function (doc, ret, options){
          delete ret.encryptedPassword;
          delete ret.resetPasswordToken;
          delete ret.resetPasswordTokenCreatedDate;
          delete ret.confirmationToken;
          delete ret.confirmationTokenCreatedDate;
        }});
      })(callback);
      });
      user = user[0];
      if(user){
        if(!user.id) user.id = id.toString();
        user.inRole = function(role){
          return user.roles.filter(function(r){ return r.name == role; }).length > 0;
        };
      }
      return user;
    };

    userSchema.statics.getOrCreate = function*(user){
      let model = plugin.plugins["co-hapi-models"].models.user;
      let u = yield model.findOne({userName: user.userName}).execQ();
      if(u){
        return u;
      }
      return yield new model(user).saveQ();
    }

    userSchema.virtual("displayName").get(function(){
      return (this.lastName)? this.firstName + " " + this.lastName: this.firstName || this.userName;
    });

    userSchema.plugin(timestamp); // for "createdAt" and "updatedAt"
    userSchema.post("save", function(user){
      dropUserFromCache(user);
    });
    userSchema.post("remove", function(user){
      dropUserFromCache(user);
    });

    let roleSchema = new db.Schema({
      name: {type: String, unique: true, required: true}
    });
    roleSchema.plugin(timestamp);
    yield plugin.methods.models.register({
      user: db.model("users", userSchema),
      userRole: db.model("userRoles", roleSchema)
    });
  });
};
