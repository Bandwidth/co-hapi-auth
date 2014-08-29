"use strict";
let crypto = require("crypto");
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const charlen = chars.length;

module.exports = function*(plugin, options){
  plugin.method("random.uid", function(length, callback){
    if(!callback) {
      callback = length;
      length = 64;
    }
    crypto.randomBytes(length, function(err, buf){
      if(err) return callback(err);
      let result = [];
      for(let i = 0; i < length; i ++){
        let index = (buf.readUInt8(i) % charlen);
        result.push(chars[index]);
      }
      callback(null, result.join(""));
    });
  });
};
