import {parse} from "toml";
import {readFileSync, existsSync} from "fs";

const configFile = "config.toml"
if (!existsSync(configFile)) {
  throw new Error(`Config file missing: ${configFile}`);
}

export default parse(readFileSync(configFile, "utf-8"));