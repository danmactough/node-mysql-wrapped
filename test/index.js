var assert = require('assert')
  , co = require('co')
  , mysql = require('../');

var Connection = require('mysql/lib/Connection');
var PoolConnection = require('mysql/lib/PoolConnection');

var debug = require('debug')('test');

var exec = require('child_process').exec;
var idgen = require('idgen');

var testDB = require('../package').name + '-test-' + idgen(8);

var releaseCount = 0;
function releaseMock (release) {
  return function () {
    releaseCount++;
    release.call(this);
  };
}

before(function (done) {
  exec('mysqladmin -uroot create ' + testDB, function (err, stdout, stderr) {
    done(err);
  });
});

after(function (done) {
  exec('mysqladmin -uroot drop -f ' + testDB, function (err, stdout, stderr) {
    done(err);
  });
});

describe('basic', function () {

  it('works', function (done) {
    var conn = mysql.createConnection({
      host: '127.0.0.1',
      database: testDB,
      user: 'root',
      password: ''
    });
    assert.equal(conn.query.constructor.name, 'GeneratorFunction');
    assert(conn instanceof Connection);

    co(function* () {
      var results = yield conn.query('SELECT 1');
      debug(results);
      assert.deepEqual(results, [{ '1': 1 }]);
    }).then(done, done);
  });

});

describe('pool', function () {

  it('works', function (done) {
    var pool = mysql.createPool({
      host: '127.0.0.1',
      database: testDB,
      user: 'root',
      password: '',
      connectionLimit: 1
    });
    assert.equal(pool.getConnection.constructor.name, 'GeneratorFunction');
    assert.equal(pool.query.constructor.name, 'GeneratorFunction');

    co(function* () {
      var conn = yield pool.getConnection();
      assert.equal(conn.query.constructor.name, 'GeneratorFunction');
      assert(conn instanceof Connection);
      var results = yield conn.query('SELECT 1');
      debug(results);
      assert.deepEqual(results, [{ '1': 1 }]);
    }).then(done, done);
  });

  it('releases implicit connections even when the query throws an error', function (_done) {
    var pool = mysql.createPool({
      host: '127.0.0.1',
      database: testDB,
      user: 'root',
      password: '',
      connectionLimit: 1
    });

    // Apply mock to release method
    var _originalRelease = PoolConnection.prototype.release;
    PoolConnection.prototype.release = releaseMock(_originalRelease);

    co(function* () {
      yield pool.query('SELECT * FROM frobisher'); // invalid syntax
    }).then(done, done).catch(_done);

    function done (err) {
      debug(err);
      debug('releaseCount', releaseCount);
      var ct = releaseCount;
      releaseCount = 0;
      PoolConnection.prototype.release = _originalRelease;
      if (!err) _done(new Error('failed to throw'));
      else {
        assert.equal(ct, 1);
        _done();
      }
    }
  });

  it('can set the wait_timeout', function (done) {
    var pool = mysql.createPool({
      host: '127.0.0.1',
      database: testDB,
      user: 'root',
      password: '',
      connectionLimit: 1
    });
    co(function* () {
      yield pool.query("SET wait_timeout=60");
      var results = yield pool.query("SHOW VARIABLES LIKE 'wait_timeout'");
      debug(results);
      assert.strictEqual(results.length, 1);
      assert.equal(results[0].Variable_name, 'wait_timeout');
      assert.equal(results[0].Value, 60);
    }).then(done, done);
  });

  it('timed out connections are removed from the pool', function (done) {
    this.timeout('3000');
    this.slow('2500');

    var connectionIds = [];
    var killedConnections = [];

    var pool = mysql.createPool({
      host: '127.0.0.1',
      database: testDB,
      user: 'root',
      password: '',
      connectionLimit: 2
    });

    pool.on('connection', function (conn) {
      debug('got connection:', conn.threadId);
      connectionIds.push(conn.threadId);
      debug('connectionIds length', connectionIds.length);
      conn.on('error', function (err) {
        if (err.fatal && err.code === 'PROTOCOL_CONNECTION_LOST') {
          killedConnections.push(conn.threadId);
          assert.strictEqual(conn._pool, null);
          debug('killed connection:', conn.threadId);
          debug('killedConnections length', killedConnections.length);
        }
      });
    });

    co(function* () {
      // conn 1
      yield pool.query("SET wait_timeout=1");
      assert.equal(pool._allConnections.length, 1);
      assert.equal(pool._freeConnections.length, 1);
      assert.equal(pool._acquiringConnections.length, 0);
      assert.equal(pool._connectionQueue.length, 0);
      assert.equal(connectionIds.length, 1);
      assert.equal(killedConnections.length, 0);
      // conn 1
      var results = yield pool.query("SELECT 1");
      debug(results);
      assert.equal(pool._allConnections.length, 1);
      assert.equal(pool._freeConnections.length, 1);
      assert.equal(pool._acquiringConnections.length, 0);
      assert.equal(pool._connectionQueue.length, 0);
      assert.equal(connectionIds.length, 1);
      assert.equal(killedConnections.length, 0);
      // conn 2!
      debug('Starting 1500ms timeout');
      setTimeout(function () {
        debug('Finished 1500ms timeout');
        co(function* () {
          var results = yield pool.query("SELECT 1");
          debug(results);
          assert.equal(pool._allConnections.length, 1);
          assert.equal(pool._freeConnections.length, 1);
          assert.equal(pool._acquiringConnections.length, 0);
          assert.equal(pool._connectionQueue.length, 0);
          assert.equal(connectionIds.length, 2);
          assert.equal(killedConnections.length, 1);
        }).then(done, done);
      }, 1500);
    });
  });

});

describe('pool cluster', function () {

  it('works');

});
