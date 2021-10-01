const fs = require(`fs/promises`);

const { execSync } = require('child_process');

const path = require(`path`);
var glob = require(`glob`);

module.exports = class builder {
  /**
   * @param {{all: boolean, onlyPrint: boolean, silent: boolean, ignoreErrors: false, spool: false}} options 
   */
  constructor(options) {
    this.options = options;

    /** @type {{envVars?: string[], library: string, currentLibrary?: string, libraryList: string[], execution: {[extension: string]: string}}} */
    this.config = {};

    /** @type {{[dirPath: string]: {
     * sources: {[file: string]: {requires?: string[], currentLibrary?: string, execution?: string, text?: string}},
     * overrides?: {library?: string, currentLibrary?: string, libraryList?: string[]}
     * }}} */
    this.configs = {};

    /** @type {string[]} */
    this.defaultLibraryList = [];

    /** @type {{[file: string]: string}} */
    this.build = {}

    /** @type {string[]} */
    this.rebuilt = [];

    /** @type {{[filePath: string]: string[]}} */
    this.deps = {}
  }

  /**
   * @param {string[]} files List of files to build. If empty, build all
   */
  async run(files) {
    this.config = await getConfig(path.join(process.cwd(), `test`, `project.json`));

    let validTypes = [];
    
    // Validate config

    if (this.config.execution) {
      validTypes = Object.keys(this.config.execution);
    } else {
      error(`No execution object found in project.json`);
    }

    if (this.config.envVars && this.config.envVars.length > 0) {
      for (const envVar of this.config.envVars) {
        if (process.env[envVar.toUpperCase()] === undefined) {
          error(`Environment variable '${envVar}' is required but not found.`);
        }
      }
    }

    if (typeof this.config.library !== `string`) {
      error(`Library property in project.json must be a string`);
    }

    if (this.config.libraryList === undefined) {
      error(`Library list requires items.`);
    }

    // Start working

    const allFiles = glob.sync(path.join(`.`, `**`, `*.+(${validTypes.join(`|`)})`));
    let startSources = [];

    if (files.length > 0) {
      for (const source of files) {
        startSources.push(...glob.sync(`./**/${source}`));
      }
    } else {
      startSources = allFiles;
    }

    await this.resolveDeps(startSources);
    await this.cleanup(startSources);

    if (this.options.onlyPrint === false) await this.getDefaultLibraryList();
    
    await this.startBuild();
  }

  /**
   * Removes files from general build if it has no dependencies.
   * This means they only get built if they are depended on.
   */
  async cleanup() {
    const depPaths = Object.keys(this.deps);
    for (let dep of depPaths) {
      if (this.deps[dep].length === 0) {
        delete this.deps[dep];
      }
    }
  }

  async startBuild() {
    const buildDataPath = path.join(process.cwd(), `test`, `build.json`);

    if (this.options.all === false) {
      const prevBuild = await getConfig(buildDataPath);
      this.build = prevBuild || {};
    }

    const depPaths = Object.keys(this.deps);
    for (let dep of depPaths) {
      await this.buildDep(dep);
    }

    await writeContent(buildDataPath, JSON.stringify(this.build, null, 2));
  }
  
  /**
   * @param {string} filePath 
   * @returns {Promise<boolean>} true if the file was built, false if it was already built
   */
  async buildDep(filePath) {
    let requiresBuild = false;

    // First we check what deps need building. 
    // If any of them need building, we have to rebuild this too
    if (this.deps[filePath] && this.deps[filePath].length > 0) {
      for (let dep of this.deps[filePath]) {
        const wasBuilt = await this.buildDep(dep);
        if (wasBuilt) { 
          requiresBuild = true;
        }
      }
    }

    // Check if any of our deps were rebuilt and if so, rebuild this file
    if (requiresBuild === false) {
      if (this.deps[filePath] && this.deps[filePath].length > 0) {
        for (const dep of this.deps[filePath]) {
          if (this.rebuilt.includes(dep)) {
            requiresBuild = true;
            break;
          }
        }
      }
    }

    // If it requires a build, but we've already built it, so it's not a new build
    if (requiresBuild) {
      if (this.rebuilt.includes(filePath)) {
        requiresBuild = false;
      }
    }
  
    const pathInfo = path.parse(filePath);
    const name = pathInfo.name;
    const ext = pathInfo.ext.substr(1).toLowerCase();
    const dirConfig = this.configs[pathInfo.dir];

    const stat = await fs.stat(filePath);

    if (this.build[filePath] !== stat.mtimeMs || requiresBuild) {
      let library, libraryList, currentLibrary, execution, text = ``;

      // First, we get the default values
      library = this.config.library;
      libraryList = this.config.libraryList;
      execution = this.config.execution[ext];

      // current library is optional.
      currentLibrary = this.config.currentLibrary;

      // TODO: handle bnddir and msgf
      if (execution === undefined) {
        error(`No execution command found for ${ext}`);
      }

      // Then, we override with the config file specific dir config
      if (dirConfig) {
        // Generic override for entire folder
        if (dirConfig.overrides) {
          if (dirConfig.overrides.library)
            library = dirConfig.overrides.library;

          if (dirConfig.overrides.libraryList)
            libraryList = dirConfig.overrides.libraryList;

          if (dirConfig.overrides.currentLibrary)
            currentLibrary = dirConfig.overrides.currentLibrary;
        }
        
        // Override for specific file
        if (dirConfig.sources && dirConfig.sources[pathInfo.base]) {
          const currentDep = dirConfig.sources[pathInfo.base];
          if (currentDep.currentLibrary)
            currentLibrary = currentDep.currentLibrary;

          if (currentDep.execution)
            execution = currentDep.execution;

          if (currentDep.text)
            text = currentDep.text;
        }
      }

      // Cleanup the text

      if (text.length > 50) {
        text = text.substr(0, 50);
        log(`Text for ${filePath} is too long (in ${pathInfo.dir}). Automatically trimmed`);
      }
      text = text.replace(/'/g, `''`);

      // Make sure the name is valid

      if (name.length > 10) {
        error(`Name for ${filePath} is too long (in ${pathInfo.dir}).`);
      }

      // TODO: build

      log(`${library}/${name}.${ext}`);

      this.build[filePath] = stat.mtimeMs;
      this.rebuilt.push(filePath);

    } else {
      // log(`${filePath} is up to date`);
    }

    return requiresBuild;
  }

  /**
   * @param {{libraryList: string[], currentLibrary: string, library: string, name: string, execution: string, text?: string}} args 
   */
  async execute(args) {
    let libl = args.libraryList.slice(0).reverse();

    // TODO: variables?

    log(`$ ${args.execution}`);

    if (this.options.onlyPrint === false) {
      const command = `system ${this.options.spool ? `` : `-s`} ${args.execution}`;

      const commandResult = await this.qsh([
        `liblist -d ` + this.defaultLibraryList.join(` `),
        `liblist -c ` + this.config.currentLibrary,
        `liblist -a ` + libl.join(` `),
        command,
      ]);
    }
  }

  async getDefaultLibraryList() {
    let libraryListString = await this.qsh(`liblist`);
    const libraryList = libraryListString.split(`\n`);

    this.defaultLibraryList = [];

    let lib, type;
    for (const line of libraryList) {
      lib = line.substr(0, 10).trim();
      type = line.substr(12);

      switch (type) {
      case `USR`:
        this.defaultLibraryList.push(lib);
        break;
          
      case `CUR`:
        this.config.currentLibrary = lib;
        break;
      }
    }
  }

  /**
   * @param {string|string[]} command
   */
  async qsh(command) {
    if (Array.isArray(command)) {
      command = command.join(`;`);
    }

    command = command.replace(/"/g, `\\"`);

    command = `echo "` + command + `" | /QOpenSys/usr/bin/qsh`;

    debug(command);
    const result = execSync(command);

    return result.toString().trim();
  }
  
  /**
   * @param {string[]} sources
   */
  async resolveDeps(sources) {
    for (const source of sources) {
      await this.resolveDep(source);
    }
  }
  
  async resolveDep(sourcePath) {
    const info = path.parse(sourcePath);
    const dir = info.dir;
    const potentialConfig = path.join(dir, `config.json`);
  
    if (this.deps[sourcePath]) {
      debug(`${sourcePath} already resolved.`);
      return;
    } else {
      this.deps[sourcePath] = [];
    }
    
    // Try and fetch the config if we haven't already
    if (this.configs[potentialConfig] === undefined) 
    this.configs[potentialConfig] = await getConfig(potentialConfig);
  
    const currentConfig = this.configs[potentialConfig];
  
    if (currentConfig) {
      if (currentConfig.sources && currentConfig.sources[info.base]) {
        const currentDep = currentConfig.sources[info.base];
        if (currentDep.requires && currentDep.requires.length > 0) {
          for (const dep of currentDep.requires) {
            const potentialPaths = glob.sync(`./**/${dep}`);
      
            if (potentialPaths.length === 1) {
              let path = potentialPaths[0];
              if (path.startsWith(`./`)) 
                path = path.substr(2);
  
              if (sourcePath === path) {
                error(`Circular dependency detected: ${sourcePath} requires itself`);
              } else {
                this.deps[sourcePath].push(path);
                await this.resolveDep(path);
              }
            } else {
              if (potentialPaths.length > 1) {
                error(`Found ${dep} ${potentialPaths.length} times for ${sourcePath})`);
              } else {
                error(`Could not find ${dep} for ${sourcePath}`);
              }
            }
          }
        }
      }
    }
  }
}

async function getConfig(jsonPath) {
  try {
    const config = await fs.readFile(jsonPath, `utf8`);
    return JSON.parse(config);
  } catch (e) {
    return null;
  }
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

function error(string) {
  console.warn(`\x1b[31m[WARNING]\x1b[0m ${string}`);
  process.exit(1);
}