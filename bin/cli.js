#!/usr/bin/env node

'use strict';

var Liftoff   = require('liftoff');
var interpret = require('interpret');
var chalk     = require('chalk');
var tildify   = require('tildify');
var commander = require('commander');
var cliPkg    = require('../package');
var argv      = require('minimist')(process.argv.slice(2));

function exit(text) {
  if (text instanceof Error) {
    chalk.red(console.error(text.stack));
  } else {
    chalk.red(console.error(text));
  }
  process.exit(1);
}

function success(text) {
  console.log(text);
  process.exit(0);
}

function checkLocalModule(env) {
  if (!env.modulePath) {
    console.log(chalk.red('No local knex install found in:'), chalk.magenta(tildify(env.cwd)));
    exit('Try running: npm install knex.');
  }
}

async function initKnexMigrate(env) {

  checkLocalModule(env);

  if (!env.configPath) {
    exit('No knexfile found in this directory. Specify a path with --knexfile');
  }

  if (process.cwd() !== env.cwd) {
    process.chdir(env.cwd);
    console.log('Working directory changed to', chalk.magenta(tildify(env.cwd)));
  }

  var environmentVar = commander.env || process.env.NODE_ENV || 'development';
  var config         = require(env.configPath)[environmentVar];

  process.env.NODE_ENV = environmentVar;

  if (!config) {
    console.log(chalk.red('Warning: unable to read knexfile config for environment ' + environmentVar));
    process.exit(1);
  }

  var knex = await require(env.modulePath);
  knex = knex(config);
  return require('../')(knex);
}

function invoke(env) {

  var pending, filetypes = ['js', 'coffee'];

  commander
    .version(
      chalk.blue('Knex CLI version: ', chalk.green(cliPkg.version)) + '\n' +
      chalk.blue('Local Knex version: ', chalk.green(env.modulePackage.version)) + '\n'
    )
    .option('--debug', 'Run with debugging.')
    .option('--knexfile [path]', 'Specify the knexfile path.')
    .option('--cwd [path]', 'Specify the working directory.')
    .option('--env [name]', 'environment, default: process.env.NODE_ENV || development');

  commander
    .command('migrate:make <name>')
    .description('       Create a named migration file.')
    .option('-x [' + filetypes.join('|') + ']', 'Specify the stub extension (default js)')
    .action(async function(name) {
      var ext = (argv.x || env.configPath.split('.').pop()).toLowerCase();
      pending = await initKnexMigrate(env);
      pending = pending.make(name, {extension: ext}).then(function(name) {
        success(chalk.green('Created Migration: ' + name));
      }).catch(exit);
    });

  commander
    .command('migrate:install')
    .description('        Install a fresh version of the schema.')
    .action(async function() {
      pending = await initKnexMigrate(env);
      pending = pending.install().then(function(results) {
        var messages = [];

        results.forEach(function (result) {
          messages.push(chalk.underline(result || 'main'));
          messages.push(chalk.green('Succeeded'));
        });

        success(messages.join('\n'));
      }).catch(exit);
    });

  commander
    .command('migrate:latest')
    .description('        Run all migrations that have not yet been run.')
    .action(async function() {
      pending = await initKnexMigrate(env);
      pending = pending.latest().then(function(results) {
        var messages = [];

        results.forEach(function (result) {
          messages.push(chalk.underline(result[2] || 'main'));
          if (result[1].length === 0) {
            messages.push(chalk.cyan('Already up to date'));
          }
          messages.push(chalk.green('Batch ' + result[0] + ' run: ' + result[1].length + ' migrations \n' + chalk.cyan(result[1].join('\n'))));
        });

        success(messages.join('\n'));
      }).catch(exit);
    });

  commander
    .command('migrate:rollback')
    .description('        Rollback the last set of migrations performed.')
    .action(async function() {
      pending = await initKnexMigrate(env);
      pending = pending.rollback().then(function(results) {
        var messages = [];

        results.forEach(function (result) {
          messages.push(chalk.underline(result[2] || 'main'));

          if (result[1].length === 0) {
            success(chalk.cyan('Already at the base migration'));
          }
          success(chalk.green('Batch ' + result[0] + ' rolled back: ' + result[1].length + ' migrations \n') + chalk.cyan(result[1].join('\n')));
        });

        success(messages.join('\n'));
      }).catch(exit);
    });

  commander
    .command('migrate:currentVersion')
    .description('       View the current version for the migration.')
    .action(async function () {
      pending = await initKnexMigrate(env);
      pending = pending.currentVersion().then(function(version) {
        success(chalk.green('Current Version: ') + chalk.blue(version));
      }).catch(exit);
    });

  commander.parse(process.argv);

  Promise.resolve(pending).then(function() {
    commander.help();
  });
}

var cli = new Liftoff({
  name: 'knex',
  extensions: interpret.jsVariants
});

cli.on('require', function(name) {
  console.log('Requiring external module', chalk.magenta(name));
});

cli.on('requireFail', function(name) {
  console.log(chalk.red('Failed to load external module'), chalk.magenta(name));
});

cli.launch({
  cwd: argv.cwd,
  configPath: argv.knexfile,
  require: argv.require,
  completion: argv.completion
}, invoke);
