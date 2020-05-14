#!/usr/bin/env node

const { Command } = require('commander');

const { qaAuthCommand } = require('../commands/qa');

const program = new Command('hs qa auth');
qaAuthCommand(program);
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}
