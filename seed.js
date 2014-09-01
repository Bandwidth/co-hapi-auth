"use strict";
module.exports = function*(plugin, options){
  plugin.dependency(["co-hapi-mongoose", "co-hapi-models"], function*(plugin){
    let models = plugin.plugins["co-hapi-models"].models;
    let role = yield models.userRole.findOne({name: "Administrator"}, {_id: 1}).execQ();
    if(!role) {
      role = yield new models.userRole({name: "Administrator"}).saveQ();
    }
    let admin = yield models.user.findOne({userName: "admin"}, {_id: 1}).execQ();
    if(!admin) {
      admin = new models.user({
        userName: "admin",
        email: "admin@admin",
        enabled: true,
        confirmedDate: new Date(),
        firstName: "Administrator"
      });
      yield admin.setPassword("111111");
      admin.roles.push(role.id);
      yield admin.saveQ();
    }
  });
};
