var debug = require('debug')('mysql-wrapped');
var mysql = require('mysql');

var slice = Array.prototype.slice;

// node-mysql core
var Connection       = require('mysql/lib/Connection');

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

function* query () {
  var args = slice.call(arguments);
  var conn;
  if (args[0] instanceof Connection) {
    conn = args.shift();
  }
  var tQuery = customThunkify(Connection.prototype.query.bind(conn));
  try {
    var results = yield tQuery.apply(null, args);
    return results[0];
  }
  catch (e) {
    throw e;
  }
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
