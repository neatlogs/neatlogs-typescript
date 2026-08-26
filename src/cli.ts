#!/usr/bin/env node
import { runDoctorCli } from './doctor-cli.js';

void runDoctorCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
