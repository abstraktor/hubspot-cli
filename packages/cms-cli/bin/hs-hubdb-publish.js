#!/usr/bin/env node

const { Command } = require('commander');

const { configureHubDbPublishCommand } = require('../commands/hubdb');

const program = new Command('hs hubdb publish');
configureHubDbPublishCommand(program);
program.parse(process.argv);
