"use strict";
let Hapi = require("co-hapi");
let sinon = require("sinon");
let supertest = require("co-supertest");
let Mongoose = require("mongoose").constructor;

let transport = {
  name: "fake",
  version: "0.0",
  send: function(opts, callback){
    callback();
  }
};


describe("auth", function(){
  let server, stub;
  before(function*(){
    server = Hapi.createServer("localhost", 3001, {
      views:{
        "engines": {"jade": require("jade")},
        "path":  __dirname + "/views"
      }
    });
    yield server.pack.register([{plugin: require("co-hapi-mongoose"), options: {connectionString: "mongodb://localhost/auth_test"}}, require("co-hapi-models"), {plugin: require(".."), options: {
      providers:{
        google: {clientId: "clientId", clientSecret: "clientSecret"}
      }

    }}, require("../returnBack"), require("../appInfo"), {
      plugin: require("posto"),
      options: {
        transport: function(){
          return transport;
        },
        templatesOptions: {
          directory: "test/templates"
        },
        from: "from@test.com"
      }
    }]);
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
        request.auth.session.set({userId: 1});
        return "test";
      }
    });
    server.route({
      method: "GET",
      path: "/checkAuth",
      handler: function*(request, reply){
        request.auth.isAuthenticated.should.be.true;
        return "checkAuth";
      },
      config: {
        auth: "session"
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
    if(stub){
      stub.restore();
    }
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
    let r = yield agent.get("/testLogin").expect(200).end();
    yield agent.get("/test").expect(200).expect("test").end();
  });

  describe("POST /auth/signIn", function(){
    let user;
    before(function*(){
      stub.restore();
      stub = null;
      let User = yield server.methods.models.get("user");
      yield User.find({userName: "user"}).remove().execQ();
      user = new User({userName: "user", email: "user@test.com", enabled: true, confirmedDate: new Date()});
      yield user.setPassword("123456");
      yield user.saveQ();
    });

    after(function*(){
      yield user.removeQ();
    });

    it("should authenticate user by userName", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      yield agent.get("/checkAuth").expect(200).end();
    });

    it("should authenticate user by email", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user@test.com", password: "123456"}).expect(302).end();
      yield agent.get("/checkAuth").expect(200).end();
    });

    it("should show signIn page with error when password is invalid", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signIn").send({userNameOrEmail: "user@test.com", password: "000111"}).expect(200).end();
      context.error.should.be.ok;
    });

    it("should show signIn page with error when user name is invalid", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signIn").send({userNameOrEmail: "user111", password1: "123456"}).expect(200).end();
      context.error.should.be.ok;
    });

    it("should authenticate user with persistance cookie", function*(){
      let agent = supertest.agent(server.listener);
      let res = yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456", remember: true}).expect(302).end();
      let cookie = res.headers["set-cookie"][0];
      (cookie.indexOf("Max-Age=") >= 0).should.be.true;
      (cookie.indexOf("Expires=") >= 0).should.be.true;
      yield agent.get("/checkAuth").expect(200).end();
    });
  });
  describe("POST /auth/signUp", function(){
    let User, sendSpy;
    before(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
    });

    beforeEach(function*(){
      sendSpy = sinon.spy(transport, "send");
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
    });

    afterEach(function(){
      sendSpy.restore();
    });

    it("should register new user and send confirmation email", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signUp").send({
        userName: "user",
        email: "user@test.com",
        password: "111111",
        repeatPassword: "111111"
      }).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      user.should.be.ok;
      user.email.should.equal("user@test.com");
      (yield user.comparePassword("111111")).should.be.true;
      user.confirmationToken.should.be.ok;
      user.confirmationTokenCreatedDate.should.be.ok;
      sendSpy.called.should.be.true;
      let data = sendSpy.args[0][0].data;
      data.to.should.equal("user@test.com");
      data.from.should.equal("from@test.com");
      data.html.should.equal("<p>user</p>");
      context.info.should.be.ok;
    });

    it("should fail if passwords are mismatched", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signUp").send({
        userName: "user",
        email: "user@test.com",
        password: "111111",
        repeatPassword: "121111"
      }).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (!user).should.be.true;
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });

    it("should fail if user is exists (by user name)", function*(){
      let context;
      yield new User({
        userName: "user",
        email: "aaa@bbb.com"
      }).saveQ();
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signUp").send({
        userName: "user",
        email: "user@test.com",
        password: "111111",
        repeatPassword: "111111"
      }).expect(200).end();
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });

    it("should fail if user is exists (by email)", function*(){
      let context;
      yield new User({
        userName: "aaa",
        email: "user@test.com"
      }).saveQ();
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signUp").send({
        userName: "user",
        email: "user@test.com",
        password: "111111",
        repeatPassword: "111111"
      }).expect(200).end();
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });

    it("should fail if required param is missing", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/signUp").send({
        email: "user@test.com",
        password: "111111",
        repeatPassword: "111111"
      }).expect(200).end();
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });
  });
});
