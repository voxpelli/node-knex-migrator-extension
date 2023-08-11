# node-knex-migrator-extension

**DEPRECATED:** Use [`umzeption`](https://github.com/voxpelli/umzeption) instead, the successor to this module

An extension of the knex migrator. Initial version based on knex 0.7, still works on knex 0.12

Started out based on some PR:s to knex itself:

- https://github.com/knex/knex/pull/617
- https://github.com/knex/knex/pull/409

Then got the addition of [child migrations](https://github.com/voxpelli/node-knex-migrator-extension/commit/04eb5be9556603f70cb2f99f270edd5d487a439e) and later also a command for [fresh installs](https://github.com/voxpelli/node-knex-migrator-extension/commit/8c4d12a9d30cfe6fd960089f81f5c37ec57874ba)

True to its Knex roots it extends the [`knexfile.js`](https://knexjs.org/guide/migrations.html#knexfile-js):

```js
{
  client: 'pg',
  connection: config.db,
  migrations: {
    dependencies: {
      'prefix-of-child': 'foo'
    },
    install: __dirname + '/install-schema',
    directory: __dirname + '/migrations',
  },
}
```

Two examples:

* [voxpelli/node-one-page](https://github.com/voxpelli/node-one-page/blob/720b36e6895cdfd06392f5d664574640ded7f036/lib/utils/express-wrapper-db.js#L32-L36)
* [voxpelli/webpage-webmentions](https://github.com/voxpelli/webpage-webmentions/blob/60a6de92afec258ff4896828022bcd966551ff7c/knexfile.js#L10-L13)
