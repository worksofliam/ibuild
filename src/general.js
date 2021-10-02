const fs = require(`fs/promises`);

module.exports = class {
  static log(string) {
    console.log(`[LOG] ${string}`);
  }

  static debug(string) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${string}`);
    }
  }

  static error(string) {
    console.warn(`\x1b[31m[ERROR]\x1b[0m ${string}`);
    process.exit(1);
  }

  static async getConfig(jsonPath) {
    try {
      const config = await fs.readFile(jsonPath, `utf8`);
      return JSON.parse(config);
    } catch (e) {
      return null;
    }
  }

  static writeContent(path, content) {
    return fs.writeFile(path, content, `utf8`);
  }
}