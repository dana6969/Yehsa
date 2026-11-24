// Web preview: documents live in memory for this tab only. Nothing is written to disk.
const files = new Map();

export const docFiles = {
  async readFile(name) {
    return files.get(name) || null;
  },
  async writeFile(name, text) {
    files.set(name, text);
  },
  async deleteFile(name) {
    files.delete(name);
  }
};
