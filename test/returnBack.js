"use strict";
let Hapi = require("co-hapi");
let supertest = require("co-supertest");
describe("returnBack", function(){
  let server;
  before(function*(){
    server = Hapi.createServer("localhost", 3001);
    yield server.pack.register(require("../returnBack"));
    server.route({
      method: "GET",
      path: "/test1",
      handler: function*(request){
        request.getReturnUrl.should.be.a.function;
        request.setReturnUrl.should.be.a.function;
        return "test1";
      }
    });
    server.route({
      method: "GET",
      path: "/test2",
      handler: function*(request){
        request.setReturnUrl();
        request._states.returnBack.value.should.equal("/path1");
        return "test2";
      }
    });
    server.route({
      method: "GET",
      path: "/test3",
      handler: function*(request){
        request.setReturnUrl();
        request.setReturnUrl("/path2");
        request._states.returnBack.value.should.equal("/path1");
        return "test3";
      }
    });
    server.route({
      method: "GET",
      path: "/test4",
      handler: function*(request){
        request.setReturnUrl("/path2");
        request._states.returnBack.value.should.equal("/path2");
        return "test4";
      }
    });
    server.route({
      method: "GET",
      path: "/test5",
      handler: function*(request){
        request.getReturnUrl().should.equal("/path2");
        (!request._states.returnBack.value).should.be.true;
        return "test5";
      }
    });
    server.route({
      method: "GET",
      path: "/test6",
      handler: function*(request){
        request.getReturnUrl("/path3").should.equal("/path3");
        return "test6";
      }
    });
    server.route({
      method: "GET",
      path: "/test7",
      handler: function*(request){
        request.getReturnUrl().should.equal("/");
        return "test7";
      }
    });
    server.route({
      method: "GET",
      path: "/test8",
      handler: function*(request){
        request.setReturnUrl();
        request._states.returnBack.value.should.equal("/path4");
        return "test8";
      }
    });
    server.route({
      method: "GET",
      path: "/test9",
      handler: function*(request){
        request.setReturnUrl("http://www.my-server.com/path11");
        request._states.returnBack.value.should.equal("/path11");
        return "test9";
      }
    });
    yield server.start();
  });
  after(function*(){
    yield server.stop();
  });
  it("should provide function getReturnUrl and setReturnUrl for request", function*(){
    yield supertest(server.listener).get("/test1").expect(200).end();
  });
  describe("#setReturnUrl", function(){
    it("should store query field 'next'", function*(){
      yield supertest(server.listener).get("/test2").query({next: "/path1"}).expect(200).end();
    });
    it("should store return url only one per request", function*(){
      yield supertest(server.listener).get("/test3").query({next: "/path1"}).expect(200).end();
    });
    it("should store url with setReturnUrl()", function*(){
      yield supertest(server.listener).get("/test4").expect(200).end();
    });
    it("should store referrer url if setReturnUrl() is called without params", function*(){
      yield supertest(server.listener).get("/test8").set("Referrer", "/path4").expect(200).end();
    });
    it("should store only relative url", function*(){
      yield supertest(server.listener).get("/test9").expect(200).end();
    });
  });
  describe("#getReturnUrl", function(){
    it("should return stored url and remove it from storage", function*(){
      let request = supertest.agent(server.listener);
      yield request.get("/test4").expect(200).end();
      yield request.get("/test5").expect(200).end();
    });
    it("should return default value if stored value is missing", function*(){
      yield supertest(server.listener).get("/test6").expect(200).end();
    });
    it("should return '/' if called witout args and stored value is missing", function*(){
      yield supertest(server.listener).get("/test7").expect(200).end();
    });
  });
});
