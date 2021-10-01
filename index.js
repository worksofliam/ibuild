const builder = require('./src/builder');

const args = process.argv.slice(2);

let action = args[0];
let outdir = `output`;
let considerNulls = true;

switch (action) {
  case `init`:
    break;

  case `build`:
    let arguments = {
      all: false,
      onlyPrint: false,
      silent: false,
      ignoreErrors: false
    }
    let specificFiles = [];

    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith(`-`)) {
        //Specific argument

      } else {
        specificFiles.push(args[i]);
      }
    }

    const build = new builder(arguments);
    build.run(specificFiles);
    break;
}