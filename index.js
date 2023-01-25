const { sync: glob } = require("fast-glob");
const path = require("path");
const fs = require("fs");
const normalizePath = process.platform === "win32" ? require("normalize-path") : (x) => x;

function stripJsonComments(data) {
  return data.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m));
}

function loadConfig(configPath) {
  const { extends: extendsPath, ...restConfig } = JSON.parse(
    stripJsonComments(fs.readFileSync(configPath, "utf8")),
  );

  if (extendsPath) {
    const { compilerOptions: parentCompilerOptions = {}, ...restParentConfig } = loadConfig(path.resolve(path.dirname(configPath), extendsPath));
    return {
      ...restParentConfig,
      ...restConfig,
      compilerOptions: {
        ...parentCompilerOptions,
        ...restConfig.compilerOptions,
      },
    };
  }

  return restConfig;
}

module.exports = (relativeTsconfigPath = "./tsconfig.json") => {
  const absTsconfigPath = path.resolve(process.cwd(), relativeTsconfigPath);

  const { compilerOptions } = loadConfig(absTsconfigPath);

  const pathKeys = Object.keys(compilerOptions.paths);
  const re = new RegExp(`^(${pathKeys.join("|")})`);
  return {
    name: "esbuild-ts-paths",
    setup(build) {
      build.onResolve({ filter: re }, (args) => {
        const pathKey = pathKeys.find((pkey) => new RegExp(`^${pkey}`).test(args.path));
        const [pathDir] = pathKey.split("*");
        let file = args.path.replace(pathDir, "");
        if (file === args.path) {
          // if importing from root of alias
          file = "";
        }
        for (const dir of compilerOptions.paths[pathKey]) {
          const fileDir = normalizePath(path.resolve(process.cwd(), dir).replace("*", file));
          let [matchedFile] = glob(`${fileDir}.*`);
          if (!matchedFile) {
            const [matchIndexFile] = glob(`${fileDir}/index.*`);
            matchedFile = matchIndexFile;
          }
          if (matchedFile) {
            return { path: matchedFile };
          }
        }
        return { path: args.path };
      });
    },
  };
};
