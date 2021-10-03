const fs = require(`fs/promises`);

const path = require(`path`);
const glob = require(`glob`);
const validate = require('jsonschema').validate;

const schemas = require(`./schemas`);
const General = require(`./general`);

module.exports = class init {
  static async find() { 
    const config = await General.getConfig(path.join(process.cwd(), `test`, `project.json`));

    let validTypes = [];
    
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
                  possibleDeps.push(path.join(detail.dir, detail.base));
                }
              }
            }
          }
        }

        if (possibleDeps.length > 0)
          General.log(`${path.join(fileInfo.dir, fileInfo.base)}: ${possibleDeps.join(` `)}`);
      }
    } else {
      General.error(`No project.json found. Use 'ibuild init' first.`);
    }
  };
}
