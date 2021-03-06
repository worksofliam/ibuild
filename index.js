const builder = require('./src/builder');
const gen = require('./src/gen');
const init = require('./src/init');

const args = process.argv.slice(2);

let action = args[0];

let arguments;

switch (action) {
  case `init`:
    init.init()
    break;

  case `gen`:
    arguments = {
      style: `none`
    };

    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith(`-`)) {
        //Specific argument
        switch (args[i]) {
          case `--style`:
            arguments.style = args[i + 1];
            i += 1;
            break;
        }
      }
    }

    gen.find(arguments);
    break;

  case `build`:
    arguments = {
      force: false,
      onlyPrint: false,
      spool: false,
    }
    let specificFiles = [];

    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith(`-`)) {
        //Specific argument
        switch (args[i]) {
          case `--force`:
            arguments.force = true;
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