"use strict";
let Joi = require("joi");

module.exports = function*(request, reply, handler, errorHandler, verifyObject){
  try{
    if(verifyObject){
      for(let k in verifyObject){
        if(verifyObject[k]){
          request[k] = yield Joi.verify.bind(Joi, request[k] || {}, verifyObject[k]);
        }
      }
    }
    return yield handler(request, reply);
  }
  catch(err){
    if(errorHandler){
      return yield errorHandler(err, request, reply);
    }
    else{
      throw err;
    }
  }
};
