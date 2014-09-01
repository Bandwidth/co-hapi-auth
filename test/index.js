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

    }}, {
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
  it("should provide for views auth and absoluteUrl()", function*(){
    let context;
    server.once("response", function(request){
      context = request.response.source.context;
    });
    yield supertest(server.listener).get("/auth/signIn").expect(200).end();
    context.auth.isAuthenticated.should.be.false;
    context.absoluteUrl.should.be.a.function;
    context.absoluteUrl("/path1").should.equal("http://localhost:3001/path1");
  });

  it("should load user data from session cookie's id", function*(){
    let agent = supertest.agent(server.listener)
    yield agent.get("/test").expect(302).end();
    let r = yield agent.get("/testLogin").expect(200).end();
    yield agent.get("/test").expect(200).expect("test").end();
  });

  describe("GET /auth/signIn", function(){
    it("should show login page", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).get("/auth/signIn").expect(200).end();
      (!context.error).should.be.true;
    });

    it("should redirect to / for authorized user", function*(){
      if(stub)stub.restore();
      stub = null;
      let User = yield server.methods.models.get("user");
      yield User.find({userName: "user"}).remove().execQ();
      let user = new User({userName: "user", email: "user@test.com", enabled: true, confirmedDate: new Date()});
      yield user.setPassword("123456");
      yield user.saveQ();
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      yield agent.get("/auth/signIn").expect(302).end();
    });
  });

  describe("POST /auth/signIn", function(){
    let user;
    before(function*(){
      if(stub)stub.restore();
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

  describe("GET /auth/signOut", function(){
    let user;
    before(function*(){
      if(stub)stub.restore();
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

    it("should close user session and redirect to signIn page", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      let result = yield agent.get("/auth/signOut").expect(302).end();
      (result.headers.location.indexOf("/auth/signIn") >= 0).should.be.true;
      let cookie = result.headers["set-cookie"][0];
      (cookie.indexOf("Max-Age=0") >= 0).should.be.true;
    });

  });

  describe("GET /auth/signUp", function(){
    it("should show signup page", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).get("/auth/signUp").expect(200).end();
      (!context.error).should.be.true;
    });

    it("should redirect to / for authorized user", function*(){
      if(stub)stub.restore();
      stub = null;
      let User = yield server.methods.models.get("user");
      yield User.find({userName: "user"}).remove().execQ();
      let user = new User({userName: "user", email: "user@test.com", enabled: true, confirmedDate: new Date()});
      yield user.setPassword("123456");
      yield user.saveQ();
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      yield agent.get("/auth/signUp").expect(302).end();
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
  describe("GET /auth/confirmEmail/{token}", function(){
    let User;
    before(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
    });

    beforeEach(function*(){
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
      let user = yield new User({
        userName: "user",
        email: "user@test.com",
        confirmationToken: "111",
        confirmationTokenCreatedDate: new Date()
      }).saveQ();
    });

    it("should check user's token and enable user's account", function*(){
      yield supertest(server.listener).get("/auth/confirmEmail/111").expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      user.enabled.should.be.true;
      (!user.confirmationToken).should.be.true;
      (!user.confirmationTokenCreatedDate).should.be.true;
      user.confirmedDate.should.ok;
    });

    it("should fail if token is invalid", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).get("/auth/confirmEmail/222").expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      user.enabled.should.be.false;
      (!!user.confirmationToken).should.be.true;
      (!!user.confirmationTokenCreatedDate).should.be.true;
      (!user.confirmedDate).should.be.true;
      context.error.should.be.ok;
    });

    it("should fail if token is missing", function*(){
      yield supertest(server.listener).get("/auth/confirmEmail/").expect(404).end();
      yield supertest(server.listener).get("/auth/confirmEmail").expect(404).end();
    });
  });
  describe("POST /auth/resetPasswordToken", function(){
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
      yield new User({
        userName: "user",
        email: "user@test.com",
        enabled: true
      }).saveQ();
    });

    afterEach(function(){
      sendSpy.restore();
    });

    it("should send reset password message", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/resetPasswordToken").send({email: "user@test.com"}).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (!!user.resetPasswordToken).should.be.true;
      (!!user.resetPasswordTokenCreatedDate).should.be.true;
      sendSpy.called.should.be.true;
      let data = sendSpy.args[0][0].data;
      data.from.should.equal("from@test.com");
      data.to.should.equal("user@test.com");
      data.html.should.equal("<p>user</p>");
      context.info.should.be.ok;
    });

    it("should fail if user is not exists", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/resetPasswordToken").send({email: "aaa@test.com"}).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (!user.resetPasswordToken).should.be.true;
      (!user.resetPasswordTokenCreatedDate).should.be.true;
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });

    it("should fail if email is absent", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/resetPasswordToken").send({test: "user@test.com"}).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (!user.resetPasswordToken).should.be.true;
      (!user.resetPasswordTokenCreatedDate).should.be.true;
      sendSpy.called.should.be.false;
      context.error.should.be.ok;
    });
  });
  describe("GET /auth/resetPassword/{token}", function(){
    let User;
    before(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
    });

    beforeEach(function*(){
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
      yield new User({
        userName: "user",
        email: "user@test.com",
        enabled: true,
        resetPasswordToken: "111",
        resetPasswordTokenCreatedDate: new Date()
      }).saveQ();
    });

    it("should show reset password page", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).get("/auth/resetPassword/111").expect(200).end();
      (!context.error).should.be.true;
      context.data.token.should.equal("111");
    });

    it("should fail if token is invalid", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).get("/auth/resetPassword/121").expect(200).end();
      (!!context.error).should.be.true;
    });

    it("should fail if token is missing", function*(){
      yield supertest(server.listener).get("/auth/resetPassword").expect(404).end();
      yield supertest(server.listener).get("/auth/resetPassword/").expect(404).end();
    });
  });
  describe("POST /auth/resetPassword/{token}", function(){
    let User;
    before(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
    });

    beforeEach(function*(){
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
      var user =  new User({
        userName: "user",
        email: "user@test.com",
        enabled: true,
        resetPasswordToken: "111",
        resetPasswordTokenCreatedDate: new Date()
      });
      yield user.setPassword("111111");
      yield user.saveQ();
    });

    it("should reset password of user", function*(){
      yield supertest(server.listener).post("/auth/resetPassword/111").send({
        password: "123456",
        repeatPassword: "123456"
      }).expect(200).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("123456")).should.be.true;
    });

    it("should fail if passwords are mismatched", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/resetPassword/111").send({
        password: "123456",
        repeatPassword: "111111"
      }).expect(200).end();
      context.error.should.be.ok;
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("123456")).should.be.false;
    });

    it("should fail if token is invalid", function*(){
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield supertest(server.listener).post("/auth/resetPassword/121").send({
        password: "123456",
        repeatPassword: "123456"
      }).expect(200).end();
      context.error.should.be.ok;
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("123456")).should.be.false;
    });

    it("should fail if token is missing", function*(){
      yield supertest(server.listener).post("/auth/resetPassword").expect(404).end();
      yield supertest(server.listener).post("/auth/resetPassword/").expect(404).end();
    });
  });
  describe("GET /auth/changePassword", function(){
    let User;
    before(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
      let user = new User({
        userName: "user",
        email: "user@test.com",
        enabled: true,
        confirmedDate: new Date()
      });
      yield user.setPassword("123456");
      yield user.saveQ();
    });

    it("should show change password page", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield agent.get("/auth/changePassword").expect(200).end();
      (!context.error).should.be.true;
    });

    it("should redirect to signIn page on non-authorized call", function*(){
      let result = yield supertest(server.listener).get("/auth/changePassword").expect(302).end();
      (result.headers.location.indexOf("/auth/signIn") >= 0).should.be.true;
    });
  });
  describe("POST /auth/changePassword", function(){
    let User;
    beforeEach(function*(){
      if(stub){
        stub.restore();
      }
      stub = null;
      User = yield server.methods.models.get("user");
      yield User.find({"$or": [{userName: "user"}, {email: "user@test.com"}]}).remove().execQ();
      let user = new User({
        userName: "user",
        email: "user@test.com",
        enabled: true,
        confirmedDate: new Date()
      });
      yield user.setPassword("123456");
      yield user.saveQ();
    });

    it("should change user password", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      yield agent.post("/auth/changePassword").send({password: "111111", repeatPassword: "111111"}).expect(302).end();
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("111111")).should.be.true;
    });

    it("should fail if passwords are mismatched", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield agent.post("/auth/changePassword").send({password: "111111", repeatPassword: "121111"}).expect(200).end();
      context.error.should.be.ok;
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("111111")).should.be.false;
    });

    it("should fail if required parameter is missing", function*(){
      let agent = supertest.agent(server.listener);
      yield agent.post("/auth/signIn").send({userNameOrEmail: "user", password: "123456"}).expect(302).end();
      let context;
      server.once("response", function(request){
        context = request.response.source.context;
      });
      yield agent.post("/auth/changePassword").send({password: "111111"}).expect(200).end();
      context.error.should.be.ok;
      let user = yield User.findOne({userName: "user"}).execQ();
      (yield user.comparePassword("111111")).should.be.false;
    });

    it("should redirect to signIn page on non-authorized call", function*(){
      let result = yield supertest(server.listener).post("/auth/changePassword").send({password: "111111", repeatPassword: "111111"}).expect(302).end();
      (result.headers.location.indexOf("/auth/signIn") >= 0).should.be.true;
    });
  });
});

