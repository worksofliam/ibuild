const fs = require(`fs/promises`);

const path = require(`path`);
const glob = require(`glob`);
const validate = require('jsonschema').validate;

const schemas = require(`./schemas`);
const General = require(`./general`);

module.exports = class init {
  /**
   * 
   * @param {{style: "none"|"make"|"ibuild"}} options 
   */
  static async find(options) { 
    const config = await General.getConfig(path.join(process.cwd(), `project.json`));
    
    // Validate config

    if (config) {
      /** @type {{[file: string]: path.ParsedPath[]}} */
      let deps = {};

      const buildValid = validate(config, schemas.project);

      if (buildValid.valid === false) {
        General.error(`Invalid project.json`, false);
        buildValid.errors.forEach(error => {
          General.error(`${error.property}: ${error.message}`, false);
        });
        General.error(`Exiting.`, true);
      }

      const validTypes = Object.keys(config.execution);
      const allFiles = glob.sync(path.join(`.`, `**`, `*.+(${validTypes.join(`|`)})`));
      const detailNames = allFiles.map(file => path.parse(file));

      for (const file of allFiles) {
        const fileInfo = path.parse(file);
        /** @type {path.ParsedPath[]} */
        let possibleDeps = [];
        const fileContent = await (await fs.readFile(file, `utf8`)).toUpperCase();

        if (fileContent) {
          if (fileContent === ``) continue;
          for (const detail of detailNames) {
            if (fileInfo.base !== detail.base) {
              if (path.join(fileInfo.dir, fileInfo.name) !== path.join(detail.dir, detail.name)) {
                if (fileContent.includes(detail.name.toUpperCase())) {
                  possibleDeps.push(detail);
                }
              }
            }
          } 
        }

        if (possibleDeps.length > 0) {
          deps[file] = possibleDeps;
        }
      }

      const depsKeys = Object.keys(deps);

      switch (options.style) {
        case `none`:
          depsKeys.forEach(file => {
            General.log(`${file}: ${deps[file].map(dep => dep.base)}`);
          });
          break;

        case `make`:
          let makefile = [`# Potenial makefile. Check for dep circles.`];
          depsKeys.forEach(file => {
            makefile.push(`${path.basename(file)}: ${deps[file].map(dep => dep.base).join(` `)}`);
          });
          await General.writeContent(`makefile`, makefile.join(`\n`));
          General.log(`Written to makefile.`);
          break;

        case `ibuild`:
          let files = {};
          depsKeys.forEach(file => {
            const fileInfo = path.parse(file);

            if (!files[fileInfo.dir]) {
              files[fileInfo.dir] = {sources: {}};
            }

            if (!files[fileInfo.dir].sources[fileInfo.base]) {
              files[fileInfo.dir].sources[fileInfo.base] = {requires: []};
            }

            files[fileInfo.dir].sources[fileInfo.base].requires = deps[file].map(dep => dep.base);
          });

          console.log(files);

          const fileNames = Object.keys(files);
          for (const file of fileNames) {
            General.log(`Writing ${file}/config.json`);
            await General.writeContent(path.join(file, `config.json`), JSON.stringify(files[file], null, 2)); 
          }
          break;
      }
    } else {
      General.error(`No project.json found. Use 'ibuild init' first.`);
    }
  };
}
