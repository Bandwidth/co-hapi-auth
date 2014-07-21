"use strict";
let Hapi = require("co-hapi");
let sinon = require("sinon");
let supertest = require("co-supertest");
let Mongoose = require("mongoose").constructor;
describe("auth", function(){
  let server, stub;
  before(function*(){
    server = Hapi.createServer("localhost", 3001, {
      views:{
        "engines": {"jade": require("jade")},
        "path":  __dirname + "/views"
      }
    });
    yield server.pack.register([require("co-hapi-mongoose"), require("co-hapi-models"), {plugin: require(".."), options: {
      providers:{
        google: {clientId: "clientId", clientSecret: "clientSecret"}
      }

    }}]);
    server.route({
      method: "GET",
      path: "/test",
      handler: function*(request){
        request.auth.credentials.userName.should.equal("test");
        return "test";
      },
      config: {
        auth: "session"
      }
    });
    server.route({
      method: "GET",
      path: "/testLogin",
      handler: function*(request, reply){
        reply.state("sid", {userId: 1});
        return "test";
      }

    });
    yield server.start();
    let user = yield server.methods.models.get("user");
    stub = sinon.stub(user, "getById");
    stub.withArgs(1).returns(function(cb){
      cb(null, {id: 1, userName: "test"});
    });
  });
  after(function*(){
    yield server.stop();
    stub.restore();
  });
  it("should add models user and userRole", function*(){
    let models = yield server.methods.models.get();
    models.user.should.be.ok;
    models.userRole.should.be.ok;
  });
  it("should create routes like GET, POST /auth/external/<provider>", function*(){
    yield supertest(server.listener).get("/auth/external/google").expect(302).end();
    yield supertest(server.listener).post("/auth/external/google").expect(302).end();
  });
  it("should create route /auth/signIn", function*(){
    yield supertest(server.listener).get("/auth/signIn").expect(200).end();
  });
  it("should create route /auth/signOut", function*(){
    yield supertest(server.listener).get("/auth/signOut").expect(302).end();
  });

  it("should load user data from session cookie's id", function*(){
    let agent = supertest.agent(server.listener)
    yield agent.get("/test").expect(302).end();
    yield agent.get("/testLogin").expect(200).end();
    yield agent.get("/test").expect(200).expect("test").end();
  });
});
