#!/usr/bin/env node

const { Command } = require('commander');

const { configureHubDbUploadCommand } = require('../commands/hubdb');

const program = new Command('hs hubdb upload');
configureHubDbUploadCommand(program);
program.parse(process.argv);
