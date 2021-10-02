const fs = require(`fs/promises`);

const { execSync } = require('child_process');

const path = require(`path`);
const glob = require(`glob`);

const General = require(`./general`);
const BindingDirectory = require(`./psudo/bindingDirectory`);

module.exports = class builder {
  /**
   * @param {{force: boolean, onlyPrint: boolean, spool: false}} options 
   */
  constructor(options) {
    this.options = options;

    /** @type {{envVars?: string[], library: string, currentLibrary?: string, libraryList: string[], ifsCCSID?: number, execution: {[extension: string]: string}}} */
    this.config = {};

    /** @type {{[dirPath: string]: {
     * headers?: boolean
     * sources: {[file: string]: {requires?: string[], currentLibrary?: string, execution?: string, text?: string, header?: boolean}},
     * sourceFileCCSID?: string,
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

    /** @type {string[]} */
    this.builtSourceFiles = [];
  }

  /**
   * @param {string[]} files List of files to build. If empty, build all
   */
  async run(files) {
    this.config = await General.getConfig(path.join(process.cwd(), `test`, `project.json`));

    let validTypes = [];
    
    // Validate config

    if (this.config.execution) {
      validTypes = Object.keys(this.config.execution);
    } else {
      builder.error(`No execution object found in project.json`);
    }

    if (this.config.envVars && this.config.envVars.length > 0) {
      for (const envVar of this.config.envVars) {
        if (process.env[envVar.toUpperCase()] === undefined) {
          builder.error(`Environment variable '${envVar}' is required but not found.`);
        }
      }
    }

    if (typeof this.config.library !== `string`) {
      builder.error(`Library property in project.json must be a string`);
    } else {
      this.config.library = this.convertVariables(this.config.library);
    }

    if (this.config.libraryList === undefined) {
      builder.error(`Library list requires items.`);
    } else {
      this.config.libraryList = this.config.libraryList.map(lib => this.convertVariables(lib));
    }

    if (typeof this.config.currentLibrary === `string`) {
      this.config.currentLibrary = this.convertVariables(this.config.currentLibrary);
    } else {
      this.config.currentLibrary = `QGPL`;
    }

    // Start working

    const allFiles = glob.sync(path.join(`.`, `**`, `*.+(${validTypes.join(`|`)})`));
    let startSources = [];

    let cleanup = false;

    if (files.length > 0) {
      for (const source of files) {
        startSources.push(...glob.sync(`./**/${source}`));
      }
    } else {
      startSources = allFiles;
      cleanup = true;
    }

    await this.resolveDeps(startSources);

    if (cleanup)
      await this.cleanup(startSources);

    if (this.options.onlyPrint === false) {
      await this.getDefaultLibraryList();
      General.debug(`Default library list: ${this.defaultLibraryList.join(` `)}`);
      General.debug(`Default current library: ${this.config.currentLibrary}`);
    }
    
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

    if (this.options.force === false) {
      const prevBuild = await General.getConfig(buildDataPath);
      this.build = prevBuild || {};
    }

    const depPaths = Object.keys(this.deps);
    for (let dep of depPaths) {
      await this.buildDep(dep);
    }

    await General.writeContent(buildDataPath, JSON.stringify(this.build, null, 2));
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
    const dirConfig = this.configs[path.join(pathInfo.dir, `config.json`)];

    const stat = await fs.stat(filePath);

    if (this.build[filePath] !== stat.mtimeMs || requiresBuild) {
      let library, libraryList, currentLibrary, execution, text = ``, sourceFileCCSID, header = false;

      // First, we get the default values
      library = this.config.library;
      libraryList = this.config.libraryList;
      execution = this.config.execution[ext];

      // current library is optional.
      currentLibrary = this.config.currentLibrary;

      // TODO: handle bnddir and msgf
      if (execution === undefined) {
        builder.error(`No execution command found for ${ext}`);
      }

      // Then, we override with the config file specific dir config
      if (dirConfig) {
        if (dirConfig.headers) {
          header = true;
        }

        if (dirConfig.sourceFileCCSID) {
          sourceFileCCSID = this.convertVariables(dirConfig.sourceFileCCSID);
        }

        // Generic override for entire folder
        if (dirConfig.overrides) {
          if (dirConfig.overrides.library)
            library = this.convertVariables(dirConfig.overrides.library);

          if (dirConfig.overrides.libraryList)
            libraryList = this.convertVariables(dirConfig.overrides.libraryList);

          if (dirConfig.overrides.currentLibrary)
            currentLibrary = this.convertVariables(dirConfig.overrides.currentLibrary);
        }
        
        // Override for specific file
        if (dirConfig.sources && dirConfig.sources[pathInfo.base]) {
          const currentDep = dirConfig.sources[pathInfo.base];
          if (currentDep.currentLibrary)
            currentLibrary = this.convertVariables(currentDep.currentLibrary);

          if (currentDep.execution)
            execution = currentDep.execution;

          if (currentDep.text)
            text = currentDep.text;

          if (currentDep.header)
            header = true;
        }
      }

      // We don't need to build headers
      if (header === false) {  
        // Cleanup the text

        if (text.length > 50) {
          text = text.substr(0, 50);
          General.log(`Text for ${filePath} is too long (in ${pathInfo.dir}). Automatically trimmed`);
        }
        text = text.replace(/'/g, `''`);

        // Make sure the name is valid

        if (name.length > 10) {
          builder.error(`Name for ${filePath} is too long (in ${pathInfo.dir}).`);
        }

        await this.execute({
          libraryList,
          currentLibrary,
          library,
          folder: path.basename(pathInfo.dir),
          name,
          path: filePath,
          execution,
          sourceFileCCSID,
          text
        });

        console.log(``);
      }

      this.build[filePath] = stat.mtimeMs;
      this.rebuilt.push(filePath);

    } else {
      // log(`${filePath} is up to date`);
    }

    return requiresBuild;
  }

  /**
   * @param {{
   *   libraryList: string[], 
   *   currentLibrary: string, 
   *   library: string, 
   *   folder: string, 
   *   name: string, 
   *   path: string, 
   *   execution: string|string[],
   *   sourceFileCCSID?: string,
   *   text?: string}} args 
   */
  async execute(args) {
    const extension = path.parse(args.path).ext.substr(1).toLowerCase();
    let commands = [];

    if (typeof args.execution === `string`)
      commands = [args.execution];
    else
      commands = args.execution;

    switch (extension) {
      case `bnddir`:
        commands = await BindingDirectory.transform(args.path);
        break;
      default:
        break;
    }

    commands = commands.map(command => this.convertVariables(command, {
      currentLibrary: args.currentLibrary,
      library: args.library,
      parent: args.folder,
      name: args.name,
      srcstmf: args.path,
      text: args.text || ``,
    }));

    commands.forEach(command => {
      General.log(command);
    });

    if (this.options.onlyPrint === false) {
      if (args.execution.includes(`SRCFILE`)) {
        await this.createSourcefile(args.library, args.folder, args.sourceFileCCSID || `*JOB`);
        await this.copyToMember(args.path, args.library, args.folder, args.name);
      } else {
        if (this.config.ifsCCSID) {
          await execSync(`/usr/bin/setccsid ${this.config.ifsCCSID} ${args.path}`);
        }
      }

      commands = commands.map(command => {
        let ignoreError = false;
        if (command.startsWith(`!`)) ignoreError = true;
        if (ignoreError) command = command.substr(1);

        return `system ${this.options.spool ? `` : `-s`} ${ignoreError ? `-q` : ``} "${command}"`;
      });

      let libl = args.libraryList.slice(0).reverse();
      libl = libl.map(lib => this.convertVariables(lib));

      const commandResult = await this.qsh([
        `liblist -d ` + this.defaultLibraryList.join(` `),
        `liblist -c ` + args.currentLibrary,
        `liblist -a ` + libl.join(` `),
        ...command,
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

    General.debug(command);
    try {
      const result = execSync(command);

      return result.toString().trim();
    } catch (e) {
      builder.error(e);
    }
  }

  async createSourcefile(library, file, ccsid) {
    const objPath = `${library.toUpperCase()}/${file.toUpperCase()}`;

    if (!this.builtSourceFiles.includes(objPath)) { 
      const ileCommand = `CRTSRCPF FILE(${objPath}) RCDLEN(112) CCSID(${ccsid})`;
      const command = `system -s "${ileCommand}"`;

      try {
        execSync(command);

        General.log(`Created sourcefile objPath`);
        this.builtSourceFiles.push(objPath);
      } catch (e) {
        General.debug(e);
        General.debug(`Failed to create source file`);
      }
    }
  }

  async copyToMember(ifsPath, lib, file, member) {
    lib = lib.toUpperCase();
    file = file.toUpperCase();
    member = member.toUpperCase();

    const ileCommand = `QSYS/CPYFRMSTMF FROMSTMF('${ifsPath}') TOMBR('/QSYS.lib/${lib}.LIB/${file}.FILE/${member}.MBR') MBROPT(*REPLACE) STMFCCSID(1208) DBFCCSID(*FILE)`;
    const command = `system -s "${ileCommand}"`;

    try {
      execSync(command);

      General.debug(`Copied ${ifsPath} to ${lib}/${file}/${member}`);
    } catch (e) {
      General.debug(e);
      General.error(`Failed to copy source file`);
    }
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
      General.debug(`${sourcePath} already resolved.`);
      return;
    } else {
      this.deps[sourcePath] = [];
    }
    
    // Try and fetch the config if we haven't already
    if (this.configs[potentialConfig] === undefined) 
    this.configs[potentialConfig] = await General.getConfig(potentialConfig);
  
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
                builder.error(`Circular dependency detected: ${sourcePath} requires itself`);
              } else {
                this.deps[sourcePath].push(path);
                await this.resolveDep(path);
              }
            } else {
              if (potentialPaths.length > 1) {
                builder.error(`Found ${dep} ${potentialPaths.length} times for ${sourcePath})`);
              } else {
                builder.error(`Could not find ${dep} for ${sourcePath}`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * @param {string} string 
   * @param {{[name: string]: string}} [customVariables]
   */
  convertVariables(string, customVariables) {
    const variables = {
      ...customVariables,
      ...process.env
    };

    for (const [name, value] of Object.entries(variables)) {
      string = string.replace(new RegExp(`&${name.toUpperCase()}`, `g`), value);
    }

    return string;
  }
}