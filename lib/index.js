/* jshint node: true */
/* global -Promise */

'use strict';

var Promise = require('bluebird');

module.exports = function (knex) {
  var migrate = knex.migrate;
  var Migrator = migrate.constructor;

  var ExtendedMigrator = function () {
    Migrator.apply(this, arguments);
  };

  require('util').inherits(ExtendedMigrator, Migrator);

  ExtendedMigrator.prototype._prefixName = function (name) {
    console.log('_prefixName', this.config);
    return this.config.prefix ? 'prefix.' + name : name;
  };

  ExtendedMigrator.prototype._unprefixName = function (name) {
    console.log('_unprefixName', this.config);
    return this.config.prefix ? name.substr(name.indexOf('.') + 1) : name;
  };

  ExtendedMigrator.prototype._listCompleted = function () {
    return Migrator.prototype._listCompleted.apply(this, arguments).map(this._unprefixName.bind(this))
  };

  if (migrate.fastForward && migrate._updateMigrationStatus) {
    // Probably running of my PR https://github.com/tgriesser/knex/pull/617
    ExtendedMigrator.prototype._updateMigrationStatus = function (batchNo, name, direction) {
      name = this._prefixName(name);
      return Migrator.prototype._updateMigrationStatus.call(this, batchNo, name, direction);
    };
  } else {
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
        });
    };

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
  }

  return new ExtendedMigrator(knex);
};
