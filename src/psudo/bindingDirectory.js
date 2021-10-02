const path = require(`path`);
const General = require("../general");

// Transforms a binding directory JSON into a command to run
module.exports = class BindingDirectory {
  /**
   * @param {string} bindingDirectoryPath 
   * @returns {string[]} commands to run
   */
  static async transform(bindingDirectoryPath) {
    const name = path.basename(bindingDirectoryPath, `.bnddir`);
    const bnddirConfig = await General.getConfig(bindingDirectoryPath);
    let commands = [];

    if (bnddirConfig) {
      if (bnddirConfig.clear) {
        commands.push(`!DLTOBJ OBJ(&LIBRARY/${name}) OBJTYPE(*BNDDIR)`)
      }
      commands.push(`!CRTBNDDIR BNDDIR(&LIBRARY/${name})`);

      if (bnddirConfig.entries) {
        let entries = [];
        for (const entry of bnddirConfig.entries) {
          entries.push(`(${entry.library}/${entry.name} ${entry.type} ${entry.activation})`)
        }

        commands.push(`ADDBNDDIR BNDDIR(&LIBRARY/${name}) OBJ(${entries.join(` `)})`);
      }

      return commands;
    } else {
      General.error(`Binding directory ${bindingDirectoryPath} is not valid.`);
    }
  }
}