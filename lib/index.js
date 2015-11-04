/* jshint node: true */
/* global -Promise */

'use strict';

var Promise = require('bluebird');
var path = require('path');

module.exports = function (knex) {
  var migrate = knex.migrate;
  var Migrator = migrate.constructor;

  var ExtendedMigrator = function () {
    Migrator.apply(this, arguments);
  };

  require('util').inherits(ExtendedMigrator, Migrator);

  var wrapPerChild = function (method) {
    return function () {
      var allResults = [];

      return Migrator.prototype[method]
        .apply(this, arguments)
        .then(function (result) {
          result.push(this.config.prefix);
          allResults.push(result);

          return this._runPerChild(function () {
            return this[method]()
              .then(function (result) {
                allResults = allResults.concat(result);
              });
          });
        })
        .then(function () {
          return allResults;
        });
    };
  };

  var filterByPrefix = function (method) {
    return function () {
      return Migrator.prototype[method]
        .apply(this, arguments)
        .then(function (result) {
          // Ensure any queries have been initiated
          return result;
        })
        .bind(this)
        .filter(function (name) {
          return this._getPrefixFromName(name.name || name) === this.config.prefix;
        })
        .map(function (name) {
          if (name.name) {
            name.name = this._unprefixName(name.name);
            return name;
          }
          return this._unprefixName(name);
        });
    };
  };

  ExtendedMigrator.prototype._loadChildConfig = function (child, prefix) {
    var newConfig = require(child + '/knexfile.js');

    newConfig = newConfig[process.env.NODE_ENV].migrations;
    if (!newConfig) {
      throw new Error('Could not find child: ' + prefix);
    }

    newConfig.prefix = this._prefixName(prefix);

    this.config = this.setConfig(newConfig);
    this.config.dependencies = newConfig.dependencies || undefined;
  };

  ExtendedMigrator.prototype._runPerChild = function (callback) {
    var children = this.config.dependencies || {};
    var prefix;
    var chain = Promise.resolve().bind(this);
    var originalConfig = this.config;

    for (prefix in children) {
      (function (prefix) {
        chain = chain
          .then(function () {
            this._loadChildConfig(children[prefix], prefix);
          })
          .then(callback)
          .then(function () {
            this.config = originalConfig;
          });
      }(prefix));
    }

    return chain;
  };

  ExtendedMigrator.prototype._prefixName = function (name) {
    return this.config.prefix ? this.config.prefix + '|' + name : name;
  };

  ExtendedMigrator.prototype._unprefixName = function (name) {
    return this.config.prefix ? name.substr(name.lastIndexOf('|') + 1) : name;
  };

  ExtendedMigrator.prototype._getPrefixFromName = function (name) {
    var pos = name.lastIndexOf('|');
    return pos === -1 ? undefined : name.substr(0, pos);
  };

  ExtendedMigrator.prototype.fastForward = function (config) {
    this.config = this.setConfig(config);

    return this._migrationData()
      .bind(this)
      .then(function (result) {
        var migrations, migration_time = new Date();

        migrations = result[0]
          .map(this._prefixName.bind(this))
          .map(function (migration) {
            return {
              name: migration,
              batch: 0,
              migration_time: migration_time
            };
          });

        return knex(this.config.tableName).insert(migrations);
      })
      .then(function () {
        return this._runPerChild(function () {
          return this.fastForward();
        });
      });
  };

  ExtendedMigrator.prototype.latest = wrapPerChild('latest');

  ExtendedMigrator.prototype.rollback =  wrapPerChild('rollback');

  ExtendedMigrator.prototype.currentVersion = function(config) {
    var currentVersion = [];

    return Migrator.prototype.currentVersion.apply(this, arguments)
      .then(function (val) {
        currentVersion.push(val);

        return this._runPerChild(function () {
          return this.currentVersion().then(function (val) {
            currentVersion.push(this._prefixName(val));
          });
        });
      })
      .then(function () {
        return currentVersion.join(', ');
      });
  };

  ExtendedMigrator.prototype._listCompleted = filterByPrefix('_listCompleted');

  ExtendedMigrator.prototype._getLastBatch = filterByPrefix('_getLastBatch');

  ExtendedMigrator.prototype._waterfallBatch = function(batchNo, migrations, direction) {
    var that      = this;
    var knex      = this.knex;
    var tableName = this.config.tableName;
    var directory = this._absoluteConfigDir();
    var current   = Promise.bind({failed: false, failedOn: 0});
    var log       = [];
    migrations.forEach(function(migration) {
      var name  = migration;
      migration = require(directory + '/' + name);

      // We're going to run each of the migrations in the current "up"
      current = current.then(function() {
        return migration[direction](knex, Promise);
      }).then(function() {
        log.push(path.join(directory, name));
        if (direction === 'up') {
          return knex(tableName).insert({
            name: that._prefixName(name),
            batch: batchNo,
            migration_time: new Date()
          });
        }
        if (direction === 'down') {
          return knex(tableName).where({name: that._prefixName(name)}).del();
        }
      });
    });

    return current.thenReturn([batchNo, log]);
  };

  return new ExtendedMigrator(knex);
};
