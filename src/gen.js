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
    const config = await General.getConfig(path.join(process.cwd(), `test`, `project.json`));
    
    // Validate config

    if (config) {
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
          switch (options.style) {
            case `none`:
              General.log(`${path.join(fileInfo.dir, fileInfo.base)}: ${possibleDeps.map(dep => path.join(dep.dir, dep.base)).join(` `)}`);
              break;
            case `make`:
              console.log(`${fileInfo.base}: ${possibleDeps.map(dep => dep.base).join(` `)}`);
              break;
          }
        }
      }
    } else {
      General.error(`No project.json found. Use 'ibuild init' first.`);
    }
  };
}
