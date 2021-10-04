const fs = require(`fs/promises`);

const path = require(`path`);

module.exports = class init {
  static async init() { 
    const base = {
      "name": "My project",
      "envVars": ["BUILDLIB"],
      "library": "&BUILDLIB",
      "libraryList": [],
      "execution": {
         "rpgle": "CRTBNDRPG PGM(&LIBRARY/&NAME) SRCSTMF('&SRCSTMF') DBGVIEW(&DBGVIEW)",
         "sqlrpgle": "CRTSQLRPGI OBJ(&LIBRARY/&NAME) SRCSTMF('&SRCSTMF') COMMIT(*NONE) DBGVIEW(*NONE)",
         "rpgleinc": "#HEADERS",
         "cbl": "CRTBNDCBL PGM(&LIBRARY/&NAME) SRCSTMF('&SRCSTMF') DBGVIEW(&DBGVIEW)",
         "clle": "CRTBNDCL PGM(&LIBRARY/&NAME) SRCSTMF('&SRCSTMF') DBGVIEW(*NONE)",
         "cmd": "CRTCMD CMD(&LIBRARY/&NAME) PGM(&LIBRARY/&NAME) SRCSTMF('&FULLPATH')",
         "pgm": "CRTPGM PGM(&LIBRARY/&NAME) ENTMOD(*PGM)",
         "dspf": "CRTDSPF FILE(&LIBRARY/&NAME) SRCFILE(&LIBRARY/&PARENT) SRCMBR(&NAME)",
         "pf": "CRTPF FILE(&LIBRARY/&NAME) SRCFILE(&LIBRARY/&PARENT) SRCMBR(&NAME)",
         "lf": "CRTLF FILE(&LIBRARY/&NAME) SRCFILE(&LIBRARY/&PARENT) SRCMBR(&NAME)",
         "sqlprc": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "table": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "view": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "sqlseq": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "sqludf": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "sqltrg": "RUNSQLSTM SRCSTMF('&SRCSTMF') COMMIT(*NONE)",
         "bnddir": "# Handled by the build"
      }
    }

    log(`Writing project.json file.`);
    await writeContent(`project.json`, JSON.stringify(base, null, 2));
  };
}

function writeContent(path, content) {
  return fs.writeFile(path, content, `utf8`);
}

function debug(string) {
  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${string}`);
  }
}

function log(string) {
  console.log(`[LOG] ${string}`);
}