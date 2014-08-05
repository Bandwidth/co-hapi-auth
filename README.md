auth
===========

[![Build](https://travis-ci.org/avbel/auth.png)](https://travis-ci.org/avbel/auth)
[![Dependencies](https://david-dm.org/avbel/auth.png)](https://david-dm.org/avbel/auth)

This is hapi plugins which adds authorization support to the app. User info is stored in collection "users". You can use extrenal providers (via `bell`) or local authetntification if need.

## Dependencies
Module `co-hapi` and plugins `co-hapi-models` and `co-hapi-mongoose` are required to use this plugin.
Node 0.11+ should be used with --harmony switch.
