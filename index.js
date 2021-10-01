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
      spool: false,
    }
    let specificFiles = [];

    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith(`-`)) {
        //Specific argument
        switch (args[i]) {
          case `--all`:
            arguments.all = true;
            break;

          case `--onlyprint`:
            arguments.onlyPrint = true;
            break;

          case `--spool`:
            arguments.spool = true;
            break;
        }

      } else {
        specificFiles.push(args[i]);
      }
    }

    const build = new builder(arguments);
    build.run(specificFiles);
    break;
}