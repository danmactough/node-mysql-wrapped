var assert = require('assert')
  , co = require('co')
  , mysql = require('../');

var Connection = require('mysql/lib/Connection');

var debug = require('debug')('test');

var exec = require('child_process').exec;
var idgen = require('idgen');

var testDB = require('../package').name + '-test-' + idgen(8);

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

});

describe('pool cluster', function () {

  it('works');

});
