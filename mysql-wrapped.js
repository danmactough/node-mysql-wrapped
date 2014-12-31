var debug = require('debug')('mysql-wrapped');
var thunkify = require('thunkify');
var mysql = require('mysql');

var slice = Array.prototype.slice;

// node-mysql core
var Connection       = require('mysql/lib/Connection');
var Pool             = require('mysql/lib/Pool');

// proxy what node-mysql core exposes
exports.createQuery  = Connection.createQuery;

exports.Types    = mysql.Types;
exports.escape   = mysql.escape;
exports.escapeId = mysql.escapeId;
exports.format   = mysql.format;

// Monkey-patch this method to add some useful debugging;
var handleProtocolHandshake = Connection.prototype._handleProtocolHandshake;
Connection.prototype._handleProtocolHandshake = function (packet) {
  handleProtocolHandshake.call(this, packet);
  debug('got connection id:', this.threadId);
  debug('connection state:', this.state);
};

exports.createConnection = function createConnection (settings) {
  var conn = mysql.createConnection(settings);
  conn.on('error', onConnectionError);
  conn.query = function* () {
    var args = slice.call(arguments);
    args.unshift(conn);
    return yield query.apply(mysql, args);
  };
  return conn;
};

exports.createPool = function (settings) {
  var ctx = {};
  var pool = ctx.pool = mysql.createPool(settings);
  // Attach error listener to each connection
  pool.on('connection', onConnection);
  pool.getConnection = function* () {
    return yield getConnection.apply(ctx, arguments);
  };
  pool.query = function* () {
    return yield query.apply(ctx, arguments);
  };
  return pool;
};

function* query () {
  var args = slice.call(arguments);
  var conn;
  var doRelease = false;
  // Optionally, allow consumer to reuse connection and handle release
  if (args[0] instanceof Connection) {
    conn = args.shift();
  }
  else if (this.pool) {
    conn = yield this.pool.getConnection();
    doRelease = true;
  }
  var tQuery = customThunkify(Connection.prototype.query.bind(conn));
  try {
    var results = yield tQuery.apply(null, args);
    doRelease && conn.release();
    return results[0];
  }
  catch (e) {
    doRelease && conn.release();
    throw e;
  }
}

function* getConnection () {
  var ctx = this;
  var tGetConnection = thunkify(Pool.prototype.getConnection.bind(this.pool));
  var conn = yield tGetConnection();
  conn.query = function* () {
    var args = slice.call(arguments);
    args.unshift(conn);
    return yield query.apply(ctx, args);
  };
  return conn;
}

// Attaches an error handler for debugging and outputs some additional debugging
function onConnection (conn) {
  var pool = conn._pool;
  debug('connection pool size:', pool._allConnections.length);
  conn.on('error', onConnectionError);
  conn.on('error', function (err) {
    debug('connection still in pool:', String(conn._pool != null));
    debug('connection pool size:', pool._allConnections.length);
  });
}

function onConnectionError (err) {
  debug('error on connection:', this.threadId);
  debug({ message: err.message, fatal: err.fatal, code: err.code });
}

// Custom thunkify to not throw away useful information
function customThunkify (query) {
  return function () {
    var args = slice.call(arguments);
    var ctx = this;
    return function (done) {
      var called;
      args.push(function () {
        if (called) return;
        called = true;
        done.apply(null, arguments);
      });

      var q;
      try {
        q = query.apply(ctx, args);
        debug(q.sql);
      }
      catch (e) {
        e.sql = q.sql;
        done(e);
      }
    };
  };
}
