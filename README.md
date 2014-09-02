co-hapi-auth
===========

[![Build](https://travis-ci.org/bandwidthcom/co-hapi-auth.png)](https://travis-ci.org/bandwidthcom/co-hapi-auth)
[![Dependencies](https://david-dm.org/bandwidthcom/co-hapi-auth.png)](https://david-dm.org/bandwidthcom/co-hapi-auth)

This is hapi plugin which adds authorization support to the app. User info is stored in collection "users". You can use extrenal providers (via `bell`) or local authetntification if need.

This plugin will create next routes:
`GET` and `POST /auth/external/<name>` for each external provider (see `bell` docs),
`GET` and `POST /auth/signIn` for local user sign in,
`GET` and `POST /auth/signUp` for registering new local user,
`GET /auth/confirmEmail/<token>` for email verifycation after registering user,
`GET` and `POST /auth/resetPasswordRequest` for request to reset password,
`GET` and `POST /auth/resetPassword/<token>` for reseting password,
`GET` and `POST /auth/changePassword` for changing password by authorized user.

Each view can get access to `request.auth` via `auth`. Each view and email template can gen app module info (from app's package.json) as `appInfo` and make absolute url from relative with `absoluteUrl(<relative-url>)`.

Models `user` and `userRole` are available after installation this module.

For authorized requests object `request.auth.credentials` will contains user's data (like user id, name, email, etc). Use `request.auth.credentials.inRole(roleName)` to check if user has required role.

By default after first app start role "Administrator" and user "admin" with password 111111 (count of '1' depends on options.minPasswordLength) are created (if they are missing only).


## Install

```
npm install co-hapi-auth co-hapi-models co-hapi-mongoose posto then-jade
```

## Dependencies
Module `co-hapi` and plugins `co-hapi-models`, `co-hapi-mongoose`, 'posto' are required to use this plugin.
Also you need install modules of template renders which you are going to use (then-jade, etc.)
Node 0.11+ should be used with --harmony switch.

## Options
 * `providers` is object which store external auth providers data (`bell` will use them). Each key of this object is provider name, value is options of such provider. Look at [here](https://github.com/hapijs/bell) for more details. Options `provider` and `password` can be ommited.
 * `session` is object which store options for auth session cookie. It can contains key `password` which used to encrypt session cookie (it also can be used by external providers), `cookie` which stores session cookie name (default 'sid'), `redirectTo` which conains url to redirect on non-authed calls (default /auth/signIn)
 * `minPasswordLength` is minimal password lengs (min. 6 symbols, default is 6 too),
 * `rememberTTL` is time in hours how long store session cookie if user select "Remember me" (default  1 month),
 * `enableSignUp` allows to enable/disable new users registering via web ui (default true),
 * `confirmationTokenLifeTime` is time when generated confirmation token is valid (default 1 week),
 * `resetPasswordTokenLifeTime` is same for reset password token (default 1 week),
 * `useInternalViews` allows to use internal (inside this module) views for auth requests or not (default true). If its value is false you should implement own views files as changePassword, emailConfirmed, error, passwordChanged, resetPassword, resetPasswordRequest, signIn and signUp.
* `useInternalEmailTemplates` allows to use internal (inside this module) email templates for auth requests or not (default true). If its value is false you should implement own email templates as confirmEmail and resetPassword.
